# Runs a task queue: one fresh, headless Claude Code session per task, in order.
# Reads queue.json beside this file. Stops at the first task that does not report DONE;
# running this file again skips the finished tasks and resumes at that one.
# A session that ends without writing its report is resumed once to finish it.
# Windows PowerShell 5.1 compatible.

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
# moment would make the write fail and stop the queue. Append with ReadWrite sharing instead.
function Append-Line([string]$path, [string]$text) {
    $bytes = $utf8.GetBytes($text + "`r`n")
    for ($attempt = 1; ; $attempt++) {
        try {
            $stream = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
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

$total = @($queue.tasks).Count
$host.UI.RawUI.WindowTitle = "Task queue: $($queue.project) ($total tasks)"
Say "Queue $root - $total tasks, project $($queue.project), permission mode $($queue.permissionMode)" 'Cyan'

function Model-Args {
    $extra = @()
    if ($queue.model) { $extra += @('--model', $queue.model) }
    if ($queue.effort) { $extra += @('--effort', $queue.effort) }
    return $extra
}

# Runs one claude call with the text on stdin, showing its messages and tool calls and appending
# every event to the task's log. Sets $script:sessionId, $script:isError and $script:cost and
# returns the exit code. A resumed session's result reports the session's whole cost so far.
function Invoke-Session([string]$label, [string]$text, [string[]]$cliArgs, [string]$logFile) {
    $script:isError = $true
    $script:sawSessionId = $false
    Push-Location $queue.workDir
    try {
        $text | & claude @cliArgs | ForEach-Object {
            $line = "$_"
            Append-Line $logFile $line
            $evt = $null
            try { $evt = $line | ConvertFrom-Json } catch { Write-Host $line -ForegroundColor DarkYellow; return }
            if ($evt.session_id -and -not $script:sawSessionId) {
                $script:sawSessionId = $true
                if ($evt.session_id -ne $script:sessionId) {
                    $script:sessionId = $evt.session_id
                    Say "$label - session $($script:sessionId)" 'DarkGray'
                }
            }
            if ($evt.type -eq 'assistant') {
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

$index = 0
foreach ($task in $queue.tasks) {
    $index++
    $label = "[$index/$total] $($task.title)"
    $taskFile = Join-Path $root "tasks\$($task.id).md"
    $resultFile = Join-Path $resultsDir "$($task.id).md"
    $previousFile = Join-Path $resultsDir "$($task.id).previous.md"
    $logFile = Join-Path $logsDir "$($task.id).jsonl"

    if ((Read-Status $resultFile) -eq 'DONE') {
        Say "$label - already DONE, skipped" 'DarkGray'
        continue
    }

    $retryNote = ''
    if (Test-Path $resultFile) {
        Move-Item -Force $resultFile $previousFile
    }
    if (Test-Path $previousFile) {
        $retryNote = "`nAn earlier attempt at this task stopped without finishing; its report is $previousFile. Its partial work may still be in the working tree - check before you start."
    }

    $sessionName = "$($queue.project) - $($task.title)" -replace '"', "'"
    $prompt = @"
You are task $index of $total in an unattended queue. Nobody is watching this session and nobody can answer a question. The session is already named '$sessionName'.

Your task is in: $taskFile
Reports from earlier tasks in this queue are in: $resultsDir$retryNote

Do the task completely, following this repository's own instructions (CLAUDE.md and what it points to). Where the task leaves a choice open, take the sensible default and record it in your report. If you reach a decision only the user can make, or something blocks you, stop there instead of guessing.

This session is headless: it ends with your final answer, and nothing wakes it up again. Background commands are turned off, so run every command in the foreground and wait for it; give slow ones, such as a full test suite, a timeout of up to $bashMaxMinutes minutes.

Before you finish, write $resultFile. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.
"@

    # --add-dir: the task file and the reports live outside the working directory, and an
    # unattended session cannot approve access to anything outside its directories.
    $cliArgs = @('-p', '--output-format', 'stream-json', '--verbose',
                 '--permission-mode', $queue.permissionMode, '--permission-prompts', 'none',
                 '--add-dir', $root, '--name', $sessionName) + (Model-Args)

    Say "$label - starting" 'Cyan'
    $script:sessionId = $null
    $script:cost = $null
    $exitCode = Invoke-Session $label $prompt $cliArgs $logFile
    $status = Read-Status $resultFile

    # A session that ended cleanly without a report stopped too early, for example by ending its
    # turn to wait for something. Resume it once to finish the task and write the report.
    if ($exitCode -eq 0 -and -not $script:isError -and $status -notin 'DONE', 'FAILED' -and $script:sessionId) {
        Say "$label - no report yet, resuming the session once" 'Yellow'
        $resumePrompt = @"
Your session ended before you wrote $resultFile, so the task is not finished. This session is headless: it ends with your final answer, and nothing wakes it up again; whatever was still running when it ended has stopped.

Finish the task now. Run again, in the foreground, whatever had not completed, then write $resultFile as your last step. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.
"@
        $resumeArgs = @('-p', '--resume', $script:sessionId, '--output-format', 'stream-json', '--verbose',
                        '--permission-mode', $queue.permissionMode, '--permission-prompts', 'none',
                        '--add-dir', $root) + (Model-Args)
        $exitCode = Invoke-Session $label $resumePrompt $resumeArgs $logFile
        $status = Read-Status $resultFile
    }

    if ($exitCode -ne 0 -or $script:isError -or $status -ne 'DONE') {
        $reason = "exit code $exitCode, error flag $($script:isError), report status '$status'"
        Say "$label - STOPPED ($reason)" 'Red'
        if (Test-Path $resultFile) { Say "Report: $resultFile" 'Red' }
        Say "Log: $logFile" 'Red'
        if ($script:sessionId) { Say "Open the session: cd `"$($queue.workDir)`"; claude --resume $($script:sessionId)" 'Yellow' }
        Say "Fix the cause, then run this file again: finished tasks are skipped and this one starts over." 'Yellow'
        exit 1
    }

    $costNote = ''
    if ($script:cost) { $costNote = ", cost `$$([math]::Round([double]$script:cost, 2))" }
    Say "$label - DONE (session $($script:sessionId)$costNote)" 'Green'
}

Say "All $total tasks DONE. Reports: $resultsDir" 'Green'
