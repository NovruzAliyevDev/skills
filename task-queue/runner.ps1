# Runs a task queue: one fresh, headless Claude Code session per task, in order.
# Reads queue.json beside this file. Stops at the first task that does not report DONE;
# running this file again skips the finished tasks and resumes at that one.
# A session that ends without writing its report is resumed once to finish it.
# Tasks that queue.json puts in a parallel group run at the same time, each in its own git worktree
# and branch; when all of them are DONE, their branches are merged into the queue's branch in task order.
# A merge that conflicts is resolved by a session of its own, the conflict session.
# The monitor administers the queue through control.json beside this file (see Read-Control), and
# runner.lock keeps a second runner of the same run folder from starting.
# Windows PowerShell 5.1 compatible.

# The monitor reads this marker in a run folder's copy: it offers admin actions only to runners that have it.
# task-queue control contract: 1

# -ParallelTask is set by the runner itself: it starts one copy of this file per task of a parallel group.
param([string]$ParallelTask)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

# A headless session ends with its final answer, and Claude Code then kills the commands it left
# running in the background: a session that ends its turn to wait for a test run loses the run and
# never writes its report. So the sessions get no background tasks, and foreground commands get
# enough time for a full test suite.
$bashMaxMinutes = 60
$env:CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1'
$env:BASH_DEFAULT_TIMEOUT_MS = '600000'
$env:BASH_MAX_TIMEOUT_MS = "$($bashMaxMinutes * 60000)"

$root = $PSScriptRoot
$queue = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'queue.json') | ConvertFrom-Json
$resultsDir = Join-Path $root 'results'
$logsDir = Join-Path $root 'logs'
foreach ($dir in $resultsDir, $logsDir) { New-Item -ItemType Directory -Force $dir | Out-Null }
$progressLog = Join-Path $root 'progress.log'

# Add-Content opens the file without sharing reads, so a monitor reading the file at that
# moment would make the write fail and stop the queue. Append with Read sharing instead: readers
# are let in, and the sessions of a parallel group, which write here too, take turns.
function Append-Line([string]$path, [string]$text) {
    $bytes = $utf8.GetBytes($text + "`r`n")
    for ($attempt = 1; ; $attempt++) {
        try {
            $stream = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
            try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
            return
        }
        catch {
            if ($attempt -ge 20) { throw }
            Start-Sleep -Milliseconds 50
        }
    }
}

function Say([string]$text, [string]$color = 'White') {
    $stamped = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text"
    Write-Host $stamped -ForegroundColor $color
    Append-Line $progressLog $stamped
}

function Describe($toolInput) {
    foreach ($key in 'file_path', 'command', 'pattern', 'description', 'url', 'skill', 'prompt') {
        $value = $toolInput.$key
        if ($value) {
            $flat = ("$value" -replace '\s+', ' ').Trim()
            if ($flat.Length -gt 110) { $flat = $flat.Substring(0, 110) + '...' }
            return $flat
        }
    }
    return ''
}

function Read-Status([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    $first = Get-Content -Path $path -TotalCount 1 -Encoding UTF8
    if ($null -eq $first) { return $null }
    return "$first".Trim()
}

$tasks = @($queue.tasks)
$total = $tasks.Count

# The user's standing commands, written whole by the monitor only: `pause`; `skip`, the task ids to
# pass over; `resume`, per task id the session a hard stop cut off; and `retry`, per task id the retry the
# user asked for a failed or stopped task. The runner reads them before each sequential task, before each
# group and before each task's session starts, never while a session runs.
$controlFile = Join-Path $root 'control.json'
$controlVersion = 1
$script:controlIgnored = $null

# The control file's commands, or $null when there are none: no file, or one this runner cannot read,
# which an admin line names (once, until the problem changes).
function Read-Control {
    if (-not (Test-Path $controlFile)) { return $null }
    $problem = $null
    try {
        $control = Get-Content -Raw -Encoding UTF8 $controlFile | ConvertFrom-Json
        if ($null -eq $control) { $problem = 'it is empty' }
        elseif ("$($control.version)" -ne "$controlVersion") { $problem = "version '$($control.version)' is not one this runner knows" }
    }
    catch { $problem = 'it is not valid JSON' }
    if (-not $problem) { $script:controlIgnored = $null; return $control }
    if ($script:controlIgnored -ne $problem) { Say "admin: control.json ignored ($problem)" 'Yellow' }
    $script:controlIgnored = $problem
    return $null
}

# One-shot entries of the control file (`resume`, `retry`) are applied at most once: an entry whose id the
# runner's admin line for applying it names (`admin: <what> applied (task <id>, [mode <mode>, ]entry <id>)`)
# is used.
function Test-EntryUsed([string]$entryId) {
    if (-not (Test-Path $progressLog)) { return $false }
    $pattern = '  admin: \S+ applied \(task [A-Za-z0-9_-]+, (mode \S+, )?entry ' + [regex]::Escape($entryId) + '\)\r?$'
    return [regex]::IsMatch("$(Get-Content -Raw -Encoding UTF8 $progressLog)", $pattern, 'Multiline')
}

# The unused `resume` entry the monitor wrote for a task its hard stop cut off, or $null: the session to
# resume (`session`) and the entry's id (`id`).
function Get-ResumeEntry($task) {
    $control = Read-Control
    if (-not $control -or -not $control.resume) { return $null }
    $entry = $control.resume."$($task.id)"
    if (-not $entry -or "$($entry.id)" -notmatch '^[A-Za-z0-9-]+$' -or "$($entry.session)" -notmatch '^[A-Za-z0-9-]+$') { return $null }
    if (Test-EntryUsed "$($entry.id)") { return $null }
    return $entry
}

# The unused `retry` entry the monitor wrote for a failed or stopped task, or $null: the mode (`resume`, with
# the task's last session in `session`, or `fresh`), the entry's id (`id`) and the user's `note`.
function Get-RetryEntry($task) {
    $control = Read-Control
    if (-not $control -or -not $control.retry) { return $null }
    $entry = $control.retry."$($task.id)"
    if (-not $entry -or "$($entry.id)" -notmatch '^[A-Za-z0-9-]+$' -or "$($entry.mode)" -notin 'resume', 'fresh') { return $null }
    if ($entry.mode -eq 'resume' -and "$($entry.session)" -notmatch '^[A-Za-z0-9-]+$') { return $null }
    if (Test-EntryUsed "$($entry.id)") { return $null }
    return $entry
}

# Ends the run cleanly here when the user asked for a pause; $where names the place for the admin line.
# Exit code 0 tells a pause from a stop.
function Test-Pause([string]$where) {
    $control = Read-Control
    if (-not ($control -and $control.pause -eq $true)) { return }
    Say "admin: pause applied ($where)" 'Yellow'
    Say 'Queue - PAUSED (by the user)' 'Yellow'
    exit 0
}

# Runs git in a directory and returns its output lines; the exit code is left in $script:gitExit.
# Git reports progress on stderr, which must not stop the script.
function Run-Git([string]$dir, [string[]]$gitArgs) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& git.exe -C $dir @gitArgs 2>&1 | ForEach-Object { "$_" })
        $script:gitExit = $LASTEXITCODE
        return $lines
    }
    finally { $ErrorActionPreference = $previous }
}

# The parallel groups of queue.json: $groupOf leads from a task id to its group, which is
# @{ label = '<first id>-<last id>'; ids = its task ids in queue order }.
$groupOf = @{}
$maxParallel = 5
$queueProblem = $null
$position = @{}
for ($i = 0; $i -lt $total; $i++) { $position["$($tasks[$i].id)"] = $i }
if ($null -ne $queue.parallel) {
    foreach ($entry in $queue.parallel) {
        $ids = @($entry | ForEach-Object { "$_" })
        $named = "the group '$($ids -join ', ')'"
        $unknown = @($ids | Where-Object { -not $position.ContainsKey($_) })
        $taken = @($ids | Where-Object { $groupOf.ContainsKey($_) })
        if ($entry -isnot [array] -or $ids.Count -lt 2) { $queueProblem = "$named needs at least two task ids"; break }
        if ($unknown.Count) { $queueProblem = "$named names task '$($unknown[0])', which is not in the queue"; break }
        if ($taken.Count) { $queueProblem = "$named names task '$($taken[0])', which is already in another group"; break }
        if (@($ids | Select-Object -Unique).Count -ne $ids.Count) { $queueProblem = "$named names a task twice"; break }
        $ids = @($ids | Sort-Object { $position[$_] })
        if ($position[$ids[-1]] - $position[$ids[0]] -ne $ids.Count - 1) { $queueProblem = "the tasks of $named are not consecutive in the queue"; break }
        $group = @{ label = "$($ids[0])-$($ids[-1])"; ids = $ids }
        foreach ($id in $ids) { $groupOf[$id] = $group }
    }
}
$hasGroups = $groupOf.Count -gt 0
if ($hasGroups -and $null -ne $queue.maxParallel -and -not $queueProblem) {
    if ("$($queue.maxParallel)" -match '^[1-9]\d*$') { $maxParallel = [int]"$($queue.maxParallel)" }
    else { $queueProblem = "maxParallel '$($queue.maxParallel)' is not a whole number from 1 up" }
}

function Label-Of($task) { return "[$($position["$($task.id)"] + 1)/$total] $($task.title)" }
function Result-Of($task) { return Join-Path $resultsDir "$($task.id).md" }
function Branch-Of($task) { return "queue/$(Split-Path -Leaf $root)/$($task.id)" }
function Worktree-Of($task) { return Join-Path $root "wt\$($task.id)" }

function Test-Branch($task) {
    Run-Git $queue.workDir @('rev-parse', '--verify', '--quiet', "refs/heads/$(Branch-Of $task)") | Out-Null
    return $script:gitExit -eq 0
}

# What git status reports in a directory: nothing when everything there is committed.
function Get-Uncommitted([string]$dir) { return @(Run-Git $dir @('status', '--porcelain')) }

function Test-Merging {
    Run-Git $queue.workDir @('rev-parse', '--verify', '--quiet', 'MERGE_HEAD') | Out-Null
    return $script:gitExit -eq 0
}

# A parallel task that reported DONE but left changes uncommitted in its worktree is not done:
# the merge would drop them. Once its branch is merged and gone, the worktree no longer counts.
function Test-Done($task) {
    if ((Read-Status (Result-Of $task)) -ne 'DONE') { return $false }
    if ($groupOf.ContainsKey("$($task.id)")) {
        $worktree = Worktree-Of $task
        if ((Test-Path $worktree) -and (Test-Branch $task) -and @(Get-Uncommitted $worktree).Count) { return $false }
    }
    return $true
}

# A task the user skipped has a report whose first line is SKIPPED; it counts as finished, as DONE does.
function Test-Skipped($task) { return (Read-Status (Result-Of $task)) -eq 'SKIPPED' }

# Passes over a task that is not DONE when the user skipped it: it already has its SKIPPED report, or the
# control file lists it, and it gets that report now. Returns whether the task is skipped.
function Skip-Task($task, $control) {
    $label = Label-Of $task
    if (Test-Skipped $task) {
        Say "$label - already SKIPPED, passed over" 'DarkGray'
        return $true
    }
    if (-not $control -or @($control.skip | ForEach-Object { "$_" }) -notcontains "$($task.id)") { return $false }
    $resultFile = Result-Of $task
    if (Test-Path $resultFile) { Move-Item -Force $resultFile (Join-Path $resultsDir "$($task.id).previous.md") }
    [System.IO.File]::WriteAllText($resultFile, "SKIPPED`r`n`r`nSkipped by the user from the monitor, before the queue reached this task. The task was not run.`r`n", $utf8)
    Say "admin: skip applied (task $($task.id))" 'Yellow'
    Say "$label - SKIPPED (by the user)" 'Yellow'
    return $true
}

function Stop-Queue([string]$message) {
    Say $message 'Red'
    Say 'Fix the cause, then run this file again: finished tasks are skipped.' 'Yellow'
    exit 1
}

function Assert-QueueBranch {
    $inside = @(Run-Git $queue.workDir @('rev-parse', '--is-inside-work-tree'))
    if ($script:gitExit -ne 0 -or $inside[0] -ne 'true') { Stop-Queue "Parallel groups need a git repository, and $($queue.workDir) is not one." }
    Run-Git $queue.workDir @('symbolic-ref', '--quiet', 'HEAD') | Out-Null
    if ($script:gitExit -ne 0) { Stop-Queue "Parallel groups need a branch checked out in $($queue.workDir), and none is." }
}

function Model-Args {
    $extra = @()
    if ($queue.model) { $extra += @('--model', $queue.model) }
    if ($queue.effort) { $extra += @('--effort', $queue.effort) }
    return $extra
}

# Runs one claude call in a directory with the text on stdin, showing its messages and tool calls
# (not for a quiet session) and appending every event to the task's log. Sets $script:sessionId,
# $script:isError and $script:cost and returns the exit code. A resumed session's result reports the
# session's whole cost so far.
function Invoke-Session([string]$label, [string]$text, [string[]]$cliArgs, [string]$logFile, [string]$dir, [bool]$quiet) {
    $script:isError = $true
    $script:sawSessionId = $false
    Push-Location $dir
    try {
        $text | & claude @cliArgs | ForEach-Object {
            $line = "$_"
            Append-Line $logFile $line
            $evt = $null
            try { $evt = $line | ConvertFrom-Json } catch { if (-not $quiet) { Write-Host $line -ForegroundColor DarkYellow }; return }
            if ($evt.session_id -and -not $script:sawSessionId) {
                $script:sawSessionId = $true
                if ($evt.session_id -ne $script:sessionId) {
                    $script:sessionId = $evt.session_id
                    Say "$label - session $($script:sessionId)" 'DarkGray'
                }
            }
            if ($evt.type -eq 'assistant') {
                if ($quiet) { return }
                foreach ($block in $evt.message.content) {
                    if ($block.type -eq 'text' -and $block.text) { Write-Host $block.text }
                    elseif ($block.type -eq 'tool_use') { Write-Host "  > $($block.name) $(Describe $block.input)" -ForegroundColor DarkCyan }
                }
            }
            elseif ($evt.type -eq 'result') {
                $script:isError = [bool]$evt.is_error
                if ($null -ne $evt.total_cost_usd) { $script:cost = $evt.total_cost_usd }
            }
        }
        return $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}

# The arguments of a session's call: a new session with that name, or with $resumeId the
# continuation of an existing one.
function Session-Args([string[]]$dirArgs, [string]$name, [string]$resumeId) {
    $cliArgs = @('-p')
    if ($resumeId) { $cliArgs += @('--resume', $resumeId) }
    $cliArgs += @('--output-format', 'stream-json', '--verbose',
                  '--permission-mode', $queue.permissionMode, '--permission-prompts', 'none') + $dirArgs
    if (-not $resumeId) { $cliArgs += @('--name', $name) }
    return $cliArgs + (Model-Args)
}

function Get-WriteTime([string]$path) {
    if (Test-Path $path) { return (Get-Item $path).LastWriteTimeUtc }
    return $null
}

# Runs a session to its report: the call, and the single resume when it ends without one. Returns
# what kept it from a DONE report, or $null. A report that was already there counts only once the
# session has written it again; $script:reportWritten says whether it has.
function Run-Session([string]$label, [string]$prompt, [string[]]$cliArgs, [string[]]$dirArgs, [string]$logFile, [string]$resultFile, [string]$dir, [bool]$quiet) {
    $writtenBefore = Get-WriteTime $resultFile
    $exitCode = Invoke-Session $label $prompt $cliArgs $logFile $dir $quiet
    $status = Read-Status $resultFile
    $script:reportWritten = (Get-WriteTime $resultFile) -ne $writtenBefore

    # A session that ended cleanly without a report stopped too early, for example by ending its
    # turn to wait for something. Resume it once to finish the task and write the report.
    if ($exitCode -eq 0 -and -not $script:isError -and (-not $script:reportWritten -or $status -notin 'DONE', 'FAILED') -and $script:sessionId) {
        Say "$label - no report yet, resuming the session once" 'Yellow'
        $resumePrompt = @"
Your session ended before you wrote $resultFile, so the task is not finished. This session is headless: it ends with your final answer, and nothing wakes it up again; whatever was still running when it ended has stopped.

Finish the task now. Run again, in the foreground, whatever had not completed, then write $resultFile as your last step. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.
"@
        $exitCode = Invoke-Session $label $resumePrompt (Session-Args $dirArgs '' $script:sessionId) $logFile $dir $quiet
        $status = Read-Status $resultFile
        $script:reportWritten = (Get-WriteTime $resultFile) -ne $writtenBefore
    }

    if ($exitCode -ne 0 -or $script:isError -or -not $script:reportWritten -or $status -ne 'DONE') {
        $reason = "exit code $exitCode, error flag $($script:isError), report status '$status'"
        if ($status -and -not $script:reportWritten) { $reason += ', but the report was not written again' }
        return $reason
    }
    return $null
}

# How a finished session is named in its DONE line.
function Session-Note {
    $costNote = ''
    if ($script:cost) { $costNote = ", cost `$$([math]::Round([double]$script:cost, 2))" }
    return "session $($script:sessionId)$costNote"
}

# The tasks of a group the user did not skip, in queue order.
function Members-Of($group) {
    return @($group.ids | ForEach-Object { $tasks[$position[$_]] } | Where-Object { -not (Test-Skipped $_) })
}

# Runs one task: its session, the single resume when the session ends without a report, and the
# verdict. Writes the task's progress lines and returns whether the task is DONE. A parallel task
# runs in its worktree, quietly, and must leave nothing uncommitted there.
function Run-Task($task) {
    $index = $position["$($task.id)"] + 1
    $label = Label-Of $task
    $taskFile = Join-Path $root "tasks\$($task.id).md"
    $resultFile = Result-Of $task
    $previousFile = Join-Path $resultsDir "$($task.id).previous.md"
    $logFile = Join-Path $logsDir "$($task.id).jsonl"
    $group = $groupOf["$($task.id)"]
    $sessionDir = $queue.workDir
    if ($group) {
        # The same folder of the repository as the queue's working directory, inside the worktree.
        $sessionDir = Worktree-Of $task
        $inRepository = "$(@(Run-Git $queue.workDir @('rev-parse', '--show-prefix'))[0])".Trim('/').Replace('/', '\')
        if ($inRepository) { $sessionDir = Join-Path $sessionDir $inRepository }
    }

    $retryNote = ''
    if (Test-Path $resultFile) {
        Move-Item -Force $resultFile $previousFile
    }
    if (Test-Path $previousFile) {
        $retryNote = "`nAn earlier attempt at this task stopped without finishing; its report is $previousFile. Its partial work may still be in the working tree - check before you start."
    }

    $commitNote = ''
    if ($hasGroups) {
        $commitNote = "`n`nThis queue runs some of its tasks in parallel, each in its own git worktree, and that only works from committed work. Commit your work before you finish, following this repository's own commit rules. Work left uncommitted stops the queue."
    }
    $parallelNote = ''
    if ($group) {
        $beside = @(Members-Of $group | Where-Object { $_.id -ne $task.id } | ForEach-Object { "task $($position["$($_.id)"] + 1) ('$($_.title)')" }) -join ', '
        $parallelNote = @"


You run at the same time as $beside. They are working right now, each in its own worktree, and you cannot see their changes. Do not wait for their reports and do not rely on them; the reports of the tasks before yours are complete.

Your working directory is a fresh git worktree of the repository, on its own branch, $(Branch-Of $task); stay on that branch. A fresh worktree has no build outputs and no installed dependencies, so a missing build does not mean the repository is broken. Prepare what your task needs (restore packages, install dependencies) and no more.

The main checkout is $($queue.workDir). Files the repository does not track (tickets, notes, local settings) exist only there: read them there and update them there. Do not change tracked files in the main checkout: every change to a tracked file belongs in your worktree. When all parallel tasks are done, your branch is merged and your worktree is removed, so work left uncommitted in the worktree is lost.
"@
    }

    # How every prompt of a task ends, a resumed session's too.
    $closing = @"
This session is headless: it ends with your final answer, and nothing wakes it up again. Background commands are turned off, so run every command in the foreground and wait for it; give slow ones, such as a full test suite, a timeout of up to $bashMaxMinutes minutes.

Before you finish, write $resultFile. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.
"@

    $sessionName = "$($queue.project) - $($task.title)" -replace '"', "'"
    $prompt = @"
You are task $index of $total in an unattended queue. Nobody is watching this session and nobody can answer a question. The session is already named '$sessionName'.

Your task is in: $taskFile
Reports from earlier tasks in this queue are in: $resultsDir$retryNote$parallelNote

Do the task completely, following this repository's own instructions (CLAUDE.md and what it points to). Where the task leaves a choice open, take the sensible default and record it in your report. If you reach a decision only the user can make, or something blocks you, stop there instead of guessing.$commitNote

$closing
"@

    # --add-dir: the task file and the reports live outside the working directory, and an
    # unattended session cannot approve access to anything outside its directories. A parallel
    # session also needs the main checkout, where the repository's untracked files are.
    $dirArgs = @('--add-dir', $root)
    if ($group) { $dirArgs += @('--add-dir', $queue.workDir) }

    # A task the user retries from the monitor resumes its last session with the user's note, or starts over
    # in a new one, whose brief the server already ended with the note. Otherwise a task the user's hard stop
    # cut off resumes its own session, told why it stopped.
    $cliArgs = Session-Args $dirArgs $sessionName
    $script:sessionId = $null
    $resume = $null
    $retry = Get-RetryEntry $task
    if ($retry) { Say "admin: retry applied (task $($task.id), mode $($retry.mode), entry $($retry.id))" 'Yellow' }
    else { $resume = Get-ResumeEntry $task }
    if ($retry -and $retry.mode -eq 'resume') {
        $script:sessionId = "$($retry.session)"
        $cliArgs = Session-Args $dirArgs '' $script:sessionId
        $earlier = 'It wrote no report.'
        if (Test-Path $previousFile) { $earlier = "Its report is $previousFile." }
        $userNote = ''
        if ("$($retry.note)".Trim()) { $userNote = "`n`nThe user's note for this retry:`n`n$("$($retry.note)".Trim())" }
        $prompt = @"
Your earlier attempt at this task did not finish. $earlier The user has asked, from the monitor, for the task to be tried again in this same session.$userNote

Check the working tree before you go on: the earlier attempt's work may still be in it. Then carry on with your task; it is in $taskFile.$commitNote

$closing
"@
    }
    elseif ($resume) {
        Say "admin: resume applied (task $($task.id), entry $($resume.id))" 'Yellow'
        $script:sessionId = "$($resume.session)"
        $cliArgs = Session-Args $dirArgs '' $script:sessionId
        $prompt = @"
The user stopped the queue from the monitor while you were working on your task, and has now continued it. Everything that was running in this session when it stopped was killed: a command may not have finished, and a file may have been left half-written. Check the working tree before you go on.

Carry on with your task where you left off; it is in $taskFile.$commitNote

$closing
"@
    }

    Say "$label - starting" 'Cyan'
    $script:cost = $null
    $reason = Run-Session $label $prompt $cliArgs $dirArgs $logFile $resultFile $sessionDir ([bool]$group)
    if (-not $reason -and $group) {
        $uncommitted = @(Get-Uncommitted (Worktree-Of $task)).Count
        if ($uncommitted) { $reason = "report status 'DONE', but $uncommitted uncommitted change(s) left in the worktree" }
    }
    if ($reason) {
        Say "$label - STOPPED ($reason)" 'Red'
        if (Test-Path $resultFile) { Say "Report: $resultFile" 'Red' }
        Say "Log: $logFile" 'Red'
        if ($script:sessionId) { Say "Open the session: cd `"$sessionDir`"; claude --resume $($script:sessionId)" 'Yellow' }
        return $false
    }

    Say "$label - DONE ($(Session-Note))" 'Green'
    return $true
}

# One session of a parallel group: the runner started this copy of the file for it.
if ($ParallelTask) {
    $task = $tasks[$position[$ParallelTask]]
    try { $done = Run-Task $task }
    catch {
        Say "$(Label-Of $task) - STOPPED (the runner failed: $($_.Exception.Message))" 'Red'
        exit 1
    }
    if ($done) { exit 0 }
    exit 1
}

# Has the group's conflict session resolve the conflict that merging a task's branch ran into; the
# merge is in progress in the main checkout. A group has one conflict session, $script:conflictSession,
# and a later conflict of the group resumes it. Returns $null when the merge is committed and the
# main checkout clean; otherwise puts the main checkout back at its commit before this merge and
# returns why the merge step stops.
function Resolve-Conflict($group, $task) {
    $label = "Group $($group.label) - conflict session"
    $branch = Branch-Of $task
    $named = "task $($position["$($task.id)"] + 1) ('$($task.title)')"
    $resultFile = Join-Path $resultsDir "merge-$($group.label).md"
    $previousFile = Join-Path $resultsDir "merge-$($group.label).previous.md"
    $logFile = Join-Path $logsDir "merge-$($group.label).jsonl"
    $dirArgs = @('--add-dir', $root)
    $headless = "This session is headless: it ends with your final answer, and nothing wakes it up again. Background commands are turned off, so run every command in the foreground and wait for it; give slow ones, such as a full test suite, a timeout of up to $bashMaxMinutes minutes."
    # While the merge is in progress, HEAD is still the commit before it: what a failure goes back to.
    $queueBranch = @(Run-Git $queue.workDir @('symbolic-ref', '--short', 'HEAD'))[0]
    $beforeMerge = @(Run-Git $queue.workDir @('rev-parse', 'HEAD'))[0]

    if ($script:conflictSession) {
        $prompt = @"
The queue went on merging the group, and the next branch conflicts too: $branch, the branch of $named. Its merge is in progress in your working directory.

Resolve this conflict as you did the earlier one: keep what every task intended, run the tests of what you touched, then commit the merge and leave nothing uncommitted. If it needs a decision only the user can make, or something blocks you, stop there instead of guessing and report FAILED.

$headless

Before you finish, write $resultFile again, so that it covers this conflict and the earlier ones. Its first line is exactly DONE or FAILED.
"@
        $cliArgs = Session-Args $dirArgs '' $script:conflictSession
    }
    else {
        $retryNote = ''
        if (Test-Path $resultFile) { Move-Item -Force $resultFile $previousFile }
        if (Test-Path $previousFile) {
            $retryNote = "`nThe report of an earlier conflict session for this group is $previousFile."
        }
        $members = @(Members-Of $group)
        $beside = @($members | ForEach-Object { "task $($position["$($_.id)"] + 1) ('$($_.title)')" }) -join ', '
        $briefs = @($members | ForEach-Object { '  ' + (Join-Path $root "tasks\$($_.id).md") }) -join "`n"
        $reports = @($members | ForEach-Object { '  ' + (Result-Of $_) }) -join "`n"
        $sessionName = "$($queue.project) - Merge $($group.label)" -replace '"', "'"
        $prompt = @"
You are the conflict session of an unattended queue. Nobody is watching this session and nobody can answer a question. The session is already named '$sessionName'.

The queue ran $beside at the same time, each in its own git worktree and branch, and is now merging their branches into $queueBranch, in task order. Merging $branch, the branch of $named, ran into a conflict. That merge is in progress in your working directory.

What each task was asked to do:
$briefs
What each task reports it did:
$reports$retryNote

Resolve the conflict so that what every task intended is kept, following this repository's own instructions (CLAUDE.md and what it points to). Run the tests of what you touched, then commit the merge and leave nothing uncommitted. If the conflict needs a decision only the user can make, or something blocks you, stop there instead of guessing and report FAILED: the queue then undoes the merge and keeps every branch.

$headless

Before you finish, write $resultFile. Its first line is exactly DONE or FAILED. After it: which files conflicted, how you resolved each and why, how you verified it, and anything the next task or the user must know.
"@
        $cliArgs = Session-Args $dirArgs $sessionName
    }

    Say "$label - starting" 'Cyan'
    $script:sessionId = $script:conflictSession
    $script:cost = $null
    $script:reportWritten = $false
    # A merge left in progress would stop every later run, so a failure of the runner itself is a
    # stop like any other: the merge is undone below.
    try { $failure = Run-Session $label $prompt $cliArgs $dirArgs $logFile $resultFile $queue.workDir $false }
    catch { $failure = "the runner failed: $($_.Exception.Message)" }
    $script:conflictSession = $script:sessionId
    if (-not $failure) {
        Run-Git $queue.workDir @('merge-base', '--is-ancestor', $branch, 'HEAD') | Out-Null
        $isMerged = $script:gitExit -eq 0
        $uncommitted = @(Get-Uncommitted $queue.workDir).Count
        if (Test-Merging) { $failure = "report status 'DONE', but the merge is still in progress" }
        elseif (-not $isMerged) { $failure = "report status 'DONE', but branch $branch is not merged" }
        elseif ($uncommitted) { $failure = "report status 'DONE', but $uncommitted uncommitted change(s) left in the main checkout" }
    }
    if (-not $failure) {
        Say "$label - DONE ($(Session-Note))" 'Green'
        return $null
    }

    Say "$label - STOPPED ($failure)" 'Red'
    # A report from an earlier conflict that was not written again is not this conflict's report.
    if ($script:reportWritten -and (Test-Path $resultFile)) { Say "Report: $resultFile" 'Red' }
    Say "Log: $logFile" 'Red'

    # The session may have left the merge in progress, committed it although it failed, or left
    # files behind. The main checkout goes back to its commit before this merge, so that the kept
    # branch is really unmerged and the next run can try the merge again. It was clean before the
    # merge, so whatever is untracked now came from the merge or the session.
    $ending = 'no merge was left to undo'
    $head = @(Run-Git $queue.workDir @('rev-parse', 'HEAD'))[0]
    if ((Test-Merging) -or $head -ne $beforeMerge -or @(Get-Uncommitted $queue.workDir).Count) {
        $onBranch = @(Run-Git $queue.workDir @('symbolic-ref', '--short', '--quiet', 'HEAD'))[0]
        if ($onBranch -ne $queueBranch) { $ending = "the merge could not be undone: the main checkout is no longer on $queueBranch" }
        else {
            $undone = Run-Git $queue.workDir @('reset', '--hard', $beforeMerge)
            if ($script:gitExit -eq 0) { $undone = Run-Git $queue.workDir @('clean', '-fd') }
            if ($script:gitExit -eq 0) { $ending = 'the merge was undone' }
            else { $ending = "the merge could not be undone: $(@($undone)[-1])" }
        }
    }
    return "conflict merging task $($task.id), branch $branch; $ending"
}

# Applies the user's skips to a group about to start, once: the tasks it lists that are not DONE get
# their SKIPPED report. A group that started in an earlier run (a branch of it, or a report other than
# SKIPPED) reads no skips again; its skipped tasks stay skipped. Returns the tasks left.
function Skip-Members($group) {
    $members = @($group.ids | ForEach-Object { $tasks[$position[$_]] })
    $started = @($members | Where-Object { (Test-Branch $_) -or ((Read-Status (Result-Of $_)) -and -not (Test-Skipped $_)) }).Count
    $control = $null
    if (-not $started) { $control = Read-Control }
    foreach ($id in $group.ids) {
        $task = $tasks[$position[$id]]
        if (-not (Test-Done $task)) { Skip-Task $task $control | Out-Null }
    }
    return @(Members-Of $group)
}

# Runs a parallel group of two or more tasks the user did not skip, $members: every task that is not done
# yet in its own worktree and branch, at most $maxParallel at a time, then the merge step. Returns when
# the group is done and merged, and stops the queue otherwise.
function Run-Group($group, $members) {
    $todo = @($members | Where-Object { -not (Test-Done $_) })
    foreach ($task in $members) {
        if ($todo -notcontains $task) { Say "$(Label-Of $task) - already DONE, skipped" 'DarkGray' }
    }
    if (-not $todo.Count -and -not @($members | Where-Object { Test-Branch $_ }).Count) { return }

    # The group's worktrees start from the main checkout's commit and its branches are merged into
    # the main checkout: uncommitted work there would be missing from the first and in the way of
    # the second.
    Assert-QueueBranch
    if (Test-Merging) {
        Stop-Queue "Group $($group.label) - STOPPED (the main checkout $($queue.workDir) has a merge in progress; commit it or run git merge --abort)"
    }
    if (@(Get-Uncommitted $queue.workDir).Count) {
        Stop-Queue "Group $($group.label) - STOPPED (the main checkout $($queue.workDir) has uncommitted or untracked files; commit or remove them)"
    }

    if ($todo.Count) {
        Say "Group $($group.label) - starting (tasks $(@($members | ForEach-Object { $_.id }) -join ', '))" 'Cyan'
        Run-Git $queue.workDir @('worktree', 'prune') | Out-Null
        foreach ($task in $todo) {
            $worktree = Worktree-Of $task
            if (Test-Path $worktree) { continue }
            if (Test-Branch $task) { $added = Run-Git $queue.workDir @('worktree', 'add', $worktree, (Branch-Of $task)) }
            else { $added = Run-Git $queue.workDir @('worktree', 'add', '-b', (Branch-Of $task), $worktree, 'HEAD') }
            if ($script:gitExit -ne 0) {
                Stop-Queue "Group $($group.label) - STOPPED (no worktree for task $($task.id): $(@($added)[-1]))"
            }
        }

        $waiting = New-Object System.Collections.Queue (, $todo)
        $running = @()
        while ($waiting.Count -or $running.Count) {
            while ($waiting.Count -and $running.Count -lt $maxParallel) {
                $start = New-Object System.Diagnostics.ProcessStartInfo
                $start.FileName = (Get-Process -Id $PID).Path
                $start.Arguments = "-NoProfile -File `"$PSCommandPath`" -ParallelTask `"$($waiting.Dequeue().id)`""
                $start.UseShellExecute = $false
                $running += [System.Diagnostics.Process]::Start($start)
            }
            Start-Sleep -Milliseconds 200
            $running = @($running | Where-Object { -not $_.HasExited })
        }

        $notDone = @($members | Where-Object { -not (Test-Done $_) } | ForEach-Object { $_.id })
        if ($notDone.Count) {
            Say "Group $($group.label) - STOPPED (not DONE: $($notDone -join ', '); nothing was merged)" 'Red'
            Say 'Fix the cause, then run this file again: finished tasks are skipped and the stopped ones continue in their worktrees.' 'Yellow'
            exit 1
        }
    }

    # The merge step. A task is merged when its branch is gone.
    Say "Group $($group.label) - merging" 'Cyan'
    $unmerged = @($members | Where-Object { Test-Branch $_ })
    $script:conflictSession = $null
    foreach ($task in $unmerged) {
        $branch = Branch-Of $task
        $worktree = Worktree-Of $task
        $merged = Run-Git $queue.workDir @('merge', '--no-edit', $branch)
        $reason = $null
        if ($script:gitExit -ne 0) {
            $reason = "git merge of task $($task.id), branch $branch, failed: $(@($merged)[-1])"
            if (Test-Merging) {
                Say "Group $($group.label) - conflict merging $($task.id) (branch $branch)" 'Yellow'
                $reason = Resolve-Conflict $group $task
            }
        }
        if ($reason) {
            Say "Group $($group.label) - merge STOPPED ($reason)" 'Red'
            foreach ($kept in $unmerged) {
                if (Test-Branch $kept) { Say "Kept: task $($kept.id), branch $(Branch-Of $kept), worktree $(Worktree-Of $kept)" 'Red' }
            }
            if ($script:conflictSession) { Say "Open the conflict session: cd `"$($queue.workDir)`"; claude --resume $($script:conflictSession)" 'Yellow' }
            Say 'Fix the cause, then run this file again: finished tasks are skipped and the merge is tried again.' 'Yellow'
            exit 1
        }
        # A file held open can keep git from deleting the folder. The work is merged either way, so
        # the queue goes on and the leftovers are named.
        if (Test-Path $worktree) { Run-Git $queue.workDir @('worktree', 'remove', '--force', $worktree) | Out-Null }
        Run-Git $queue.workDir @('worktree', 'prune') | Out-Null
        Run-Git $queue.workDir @('branch', '-d', $branch) | Out-Null
        if (Test-Path $worktree) {
            Say "Group $($group.label) - could not remove the worktree $worktree; remove it by hand" 'Yellow'
        }
        Say "Group $($group.label) - merged $($task.id) (branch $branch)" 'Green'
    }
    Say "Group $($group.label) - merge DONE" 'Green'
    $worktrees = Join-Path $root 'wt'
    if ((Test-Path $worktrees) -and -not @(Get-ChildItem -Force $worktrees).Count) { Remove-Item -Force $worktrees }
}

# The run lock: one runner per run folder. A lock naming a live runner stops this one before it writes
# anything; a lock left by a process that is gone, or reused by another program, does not.
$lockFile = Join-Path $root 'runner.lock'
function Get-LockHolder {
    if (-not (Test-Path $lockFile)) { return $null }
    $holder = "$(Get-Content -Raw $lockFile)".Trim()
    if ($holder -notmatch '^\d+$' -or $holder -eq "$PID") { return $null }
    try { $process = Get-CimInstance Win32_Process -Filter "ProcessId=$holder" } catch { return $null }
    if (-not $process -or $process.Name -notmatch '^(powershell|pwsh)\.exe$') { return $null }
    # A runner of this run folder runs this very file by its full path, as the skill and the monitor start it.
    $line = "$($process.CommandLine)"
    if ($line -match '-ParallelTask' -or -not $line.ToLower().Contains($PSCommandPath.ToLower())) { return $null }
    return $holder
}

# Takes the lock: creates it, or replaces one whose holder is gone. Of two runners starting at once, the
# one whose process id the file holds afterwards goes on.
function Lock-Run {
    try {
        $stream = [System.IO.FileStream]::new($lockFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
        try { $bytes = $utf8.GetBytes("$PID"); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        return $null
    }
    catch [System.IO.IOException] {
        $holder = Get-LockHolder
        if ($holder) { return $holder }
        [System.IO.File]::WriteAllText($lockFile, "$PID")
        Start-Sleep -Milliseconds 200
        $now = "$(Get-Content -Raw $lockFile)".Trim()
        if ($now -ne "$PID") { return $now }
        return $null
    }
}
$holder = Lock-Run
if ($holder) {
    Write-Host "Another runner of this run folder is alive (process $holder), so this one exits. Continue the queue from the monitor once that runner has stopped." -ForegroundColor Red
    exit 1
}

try {
    $host.UI.RawUI.WindowTitle = "Task queue: $($queue.project) ($total tasks)"
    Say "Queue $root - $total tasks, project $($queue.project), permission mode $($queue.permissionMode)" 'Cyan'
    Test-Pause 'at start'
    if ($queueProblem) { Stop-Queue "queue.json: $queueProblem." }
    if ($hasGroups) { Assert-QueueBranch }

    # A model without the requested mode (Haiku has no auto mode) silently starts in 'default',
    # where an unattended session is denied every write. Check once before spending a task on it.
    Push-Location $queue.workDir
    try {
        $preflightArgs = @('-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
                           '--permission-mode', $queue.permissionMode, '--permission-prompts', 'none') + (Model-Args)
        $script:actualMode = $null
        $script:actualModel = $null
        'Reply with just OK' | & claude @preflightArgs | ForEach-Object {
            try { $evt = "$_" | ConvertFrom-Json } catch { return }
            if ($evt.subtype -eq 'init') { $script:actualMode = $evt.permissionMode; $script:actualModel = $evt.model }
        }
    }
    finally {
        Pop-Location
    }
    if ($script:actualMode -ne $queue.permissionMode) {
        Say "Preflight: asked for permission mode '$($queue.permissionMode)', the session started in '$($script:actualMode)' (model $($script:actualModel)). Change the model or the mode in queue.json and run again." 'Red'
        exit 1
    }
    Say "Preflight: model $($script:actualModel), permission mode $($script:actualMode)" 'DarkGray'

    for ($i = 0; $i -lt $total; $i++) {
        $task = $tasks[$i]
        $group = $groupOf["$($task.id)"]
        if ($group) {
            Test-Pause "before group $($group.label)"
            # A group left with one task runs it as a sequential task, in the main checkout; a group left
            # with none is passed over, with no merge step.
            $left = @(Skip-Members $group)
            if ($left.Count -ge 2) { Run-Group $group $left }
            elseif ($left.Count -eq 1) {
                $alone = $left[0]
                $groupOf.Remove("$($alone.id)")
                if (Test-Done $alone) { Say "$(Label-Of $alone) - already DONE, skipped" 'DarkGray' }
                elseif (-not (Run-Task $alone)) {
                    Say "Fix the cause, then run this file again: finished tasks are skipped and this one starts over." 'Yellow'
                    exit 1
                }
            }
            else { Say "Group $($group.label) - passed over (all its tasks skipped)" 'DarkGray' }
            Test-Pause "after group $($group.label)"
            $i += $group.ids.Count - 1
            continue
        }
        if (Test-Done $task) {
            Say "$(Label-Of $task) - already DONE, skipped" 'DarkGray'
            continue
        }
        if (Skip-Task $task (Read-Control)) { continue }
        Test-Pause "before task $($task.id)"
        if (-not (Run-Task $task)) {
            Say "Fix the cause, then run this file again: finished tasks are skipped and this one starts over." 'Yellow'
            exit 1
        }
    }

    # A queue that finished with skipped tasks is not "all DONE".
    $skipped = @($tasks | Where-Object { Test-Skipped $_ }).Count
    if ($skipped) { Say "Finished, $skipped skipped: $($total - $skipped) of $total tasks DONE. Reports: $resultsDir" 'Green' }
    else { Say "All $total tasks DONE. Reports: $resultsDir" 'Green' }
}
finally {
    # A runner killed outright leaves its lock behind, naming a process that is gone.
    if ((Test-Path $lockFile) -and "$(Get-Content -Raw $lockFile)".Trim() -eq "$PID") { Remove-Item -Force $lockFile }
}
