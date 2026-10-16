Status: ready-for-agent

# Running the queues on macOS: the scripts in Node.js

## Problem Statement

The plugin works only on Windows. On a Mac, none of its skills can do its job:

- The runner, `runner.ps1`, is a Windows PowerShell 5.1 script. A Mac has no PowerShell, so no queue can run.
- The helpers of `ticket-queue` and `queue-monitor` (`register.ps1`, `ensure-monitor.ps1`) are PowerShell too. They also rely on Windows-only cmdlets: `Get-NetTCPConnection`, `Get-CimInstance Win32_Process`, and `Start-Process -WindowStyle Hidden`.
- The monitor is Node.js, but it relies on Windows in several places:
  - it reads the process table by calling `powershell.exe` with `Get-CimInstance Win32_Process`;
  - it kills a queue with `taskkill`;
  - it opens the runner's window with `Start-Process powershell.exe`, and the browser with `cmd.exe /c start`;
  - it knows a runner by the names `powershell.exe`, `pwsh.exe` and `run.ps1`, and a session by the name `claude.exe`.
- The skills' instructions tell Claude to run PowerShell blocks: `Start-Process`, `& "<...>.ps1"`, and the `ConvertFrom-Json` read-back of `queue.json`.

Installing PowerShell 7 on a Mac would not be enough, because the Windows-only cmdlets and process names would still fail. Keeping a second runner in bash would mean writing every later feature twice.

The user wants the same plugin to work on a Mac as it does on Windows, from one code base. On Windows, nothing they already have should change.

## Solution

Every script of the plugin becomes a Node.js module. Node is already required by the monitor, so it adds no new requirement.

- **The runner.** `runner.ps1` becomes `runner.mjs`, with the same behaviour, the same files and the same `progress.log` lines. A run folder gets a copy of it as `run.mjs`, and the runner is started with `node run.mjs`.
- **The helpers.** `register.ps1` and `ensure-monitor.ps1` become `register.mjs` and `ensure-monitor.mjs`. A new `launch.mjs` in `task-queue` checks a run folder and opens its runner in a window of its own.
- **The platform module.** Everything that differs between Windows and macOS lives in one module, `task-queue/platform.mjs`. The runner, the monitor and the helpers all use it, and nothing else branches on the platform. It covers:
  - the process table;
  - killing processes;
  - the process listening on a port;
  - opening a visible terminal window that runs a command;
  - starting a hidden process that outlives its parent;
  - opening a URL in the browser;
  - finding the `claude` command.
- **The skills** tell Claude to run `node "<script>" <args>` and nothing else. That command is the same in PowerShell, cmd, bash and zsh.

Run folders made before this change still have a `run.ps1`. On Windows they keep working as before: the monitor still shows, stops and continues them.

## Vocabulary

- **Platform module**: `skills/task-queue/platform.mjs`, the one module that branches on `process.platform`.
- **Node runner**: `runner.mjs`, and its copy `run.mjs` in a run folder.
- **Legacy run folder**: a run folder with a `run.ps1` and no `run.mjs`.
- **Legacy runner**: a PowerShell process running such a `run.ps1`. Only Windows has these.
- **Supported platforms**: `win32` (Windows 10 and 11) and `darwin` (macOS 13 and later). On any other platform, the platform module's window and browser functions throw `not supported on <platform>`. Everything else is written to be portable, but nothing else is promised or checked there.

## User Stories

1. As a Mac user, I want `/task-queue` to collect my tasks, write the run folder and start the queue, as it does on Windows, so that I can run queues on my Mac.
2. As a Mac user, I want the runner to open in its own Terminal window, where I can watch each session's messages live, as the PowerShell window shows them on Windows.
3. As a Mac user, I want `/ticket-queue` to register my repository, start the monitor and open the ticket picker in my browser.
4. As a Mac user, I want `/queue-monitor` to start the monitor again, replacing one left from an older version, and open it.
5. As a Mac user, I want every admin action of the monitor to work: stop (killing the sessions), pause, continue, skip, retry and edit brief.
6. As a Mac user, I want parallel groups to work: worktrees, merge and conflict session, as on Windows.
7. As a Mac user, I want the ticket state file written and read as on Windows, so that a repository's state is the same whichever computer runs its queues.
8. As a Mac user, I want queues under `~/.claude-queues` by default, and `TASK_QUEUE_ROOT` and `TASK_QUEUE_MONITOR_PORT` honoured, as on Windows.
9. As a Mac user, I want to be told once, clearly, when macOS asks me to let `node` control Terminal, so that the first launch does not look broken.
10. As a Windows user, I want queues to run exactly as before, with the same window, lines, reports and monitor, so that the change costs me nothing.
11. As a Windows user, I want the run folders I already have to keep showing in the monitor and to keep working there: stop, continue and the rest.
12. As a Windows user, I want no PowerShell script left to keep up to date, so that a fix is made once.
13. As a Windows user, I want `claude` found whether it was installed natively (`claude.exe`) or through npm (`claude.cmd`), as PowerShell found it.
14. As a user of either platform, I want the skills to give Claude one command per step that works in any shell, so that no step depends on which shell Claude's tool uses.
15. As a user of either platform, I want `progress.log`, the reports, `queue.json` and `control.json` to keep their formats, so that a run folder reads the same on both and the monitor needs no second parser.
16. As a user of either platform, I want a run folder's paths to use the platform's own separator, so that every path the runner prints can be pasted into that platform's shell.
17. As a user of either platform, I want the runner lock to keep a second runner of the same run folder from starting, as it does now.
18. As a user of either platform, I want the README to state the requirements and commands for both platforms.

## Implementation Decisions

### The platform module

`skills/task-queue/platform.mjs` exports only these functions. Each one has a Windows branch and a macOS branch, and the module uses Node's built-in modules only.

- **`processTable()`** resolves to a list of `{ pid, ppid, name, commandLine, created }` for every process, or `null` when the table cannot be read. `name` is the executable's file name and `created` is a number that only grows with time.
  - On Windows it calls `powershell.exe` with `Get-CimInstance Win32_Process`. Windows always ships `powershell.exe`, so this is a system tool, not a script of the plugin. `created` is the file time.
  - On macOS it runs `ps -axww -o pid=,ppid=,lstart=,comm=` and `ps -axww -o pid=,command=`, joined by pid. `created` is `lstart` in milliseconds.
  - It is the one way the monitor and the runner read processes. The monitor's two snapshots (the liveness snapshot and the table for a hard stop) both come from it; the liveness snapshot is no longer filtered by name in the query.
- **`killProcesses(pids)`** force-kills the processes and resolves when the command has run. On Windows it runs `taskkill /F /PID …`; on macOS it calls `process.kill(pid, 'SIGKILL')` for each one, ignoring `ESRCH`. Walking the process tree stays in the monitor, which already does it with `created`, since both platforms reuse pids.
- **`portOwner(port)`** resolves to the pid listening on the TCP port, or `null`. On Windows it uses `Get-NetTCPConnection` through `powershell.exe`; on macOS, `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`.
- **`openWindow({ title, cwd, command, args })`** opens a new visible terminal window that runs the command and stays open after it ends, as `-NoExit` does today.
  - On Windows, `cmd.exe /d /c start "<title>" /D "<cwd>" cmd.exe /k <command line>`. The spawning process must not be `detached`: as with `Start-Process` today, a process without a console opens nothing.
  - On macOS, `osascript` tells Terminal to `do script "cd '<cwd>'; <command line>"` and to `activate`. Every argument is single-quoted for the shell, and the AppleScript string escapes `\` and `"`.
  - The title is set by the runner itself (see Runner).
  - On macOS, the first call from a process makes the system ask whether that program may control Terminal. When `osascript` fails with error `-1743` (not authorised), the function throws `macOS did not allow <program> to control Terminal: System Settings > Privacy & Security > Automation`.
- **`startHidden({ command, args, env })`** starts a process that outlives its parent, with no window, and resolves once it is spawned: `spawn(…, { detached: true, stdio: 'ignore', windowsHide: true }).unref()`. Used to start the monitor.
- **`openUrl(url)`**: `cmd.exe /c start "" "<url>"` on Windows, `open <url>` on macOS.
- **`claudeCommand()`** returns `{ file, viaShell, argv(args), options }` for running `claude`, found on `PATH`: the caller spawns `file` with `argv(args)`, and merges `options` into its spawn options.
  - On Windows, `claude.exe` is preferred. When only `claude.cmd` or `claude.bat` is found, it is run through `cmd.exe /d /s /c`, with every argument quoted by cmd's rules: a `"` is doubled, and `%`, `^`, `&`, `|`, `<` and `>` are escaped. Without that quoting, a task title could break the command line.
  - On macOS, the `claude` found on `PATH`.
  - When none is found, it throws `claude was not found on the PATH`.
- **`samePath(a, b)`** compares two paths after `path.resolve`, without a trailing separator. The comparison ignores case on Windows and macOS (macOS volumes ignore case by default) and keeps it everywhere else. The monitor's existing `samePath` and the register both use it.

### Runner

- `skills/task-queue/runner.mjs` replaces `runner.ps1`, which is deleted. It is one file that imports only Node's built-in modules and `./platform.mjs`. The server and `launch.mjs` copy both `runner.mjs` (as `run.mjs`) and `platform.mjs` into the run folder, so a run folder works without the skill folder.
- It is started as `node "<run folder>/run.mjs"`. A parallel task's child is `node "<run folder>/run.mjs" --parallel-task <id>`, started with `process.execPath`.
- **Behaviour is unchanged.** It is a port of `runner.ps1` as of commit `504ea09`, in the same order:
  - the environment variables the sessions get;
  - the preflight call;
  - the run lock;
  - the control file and its one-shot entries;
  - pause, skip, resume and retry;
  - the session prompts, word for word, with only the paths changed;
  - the resume-once when a session ends without a report;
  - the verdicts and exit codes;
  - parallel groups, worktrees and branches, the merge step and the conflict session with its undo;
  - the ticket state writes, with their lock protocol and the two-space JSON layout (`JSON.stringify(doc, null, 2)` plus a newline).
- **The `progress.log` lines are byte for byte the same, apart from the line ending.** The runner ends lines with `os.EOL`, and the monitor already reads `\r?\n`. Reports the runner writes itself (the `SKIPPED` report) use `os.EOL` too.
- **Window.**
  - The runner sets its window title with the escape sequence `ESC ] 0 ; <title> BEL`, which works in Windows Terminal, conhost and macOS Terminal.
  - Colours are ANSI escape codes; the colour names map one to one from the PowerShell ones (Cyan, Green, Red, Yellow, DarkGray, DarkCyan, DarkYellow).
  - The window shows the same text as before.
- **Sessions.** `claude` is run through `claudeCommand()`, with the prompt written to its stdin and stdin then closed. Its stdout is read line by line as UTF-8. Every line is appended to the task's log, and the events are handled as `Invoke-Session` handles them. stderr goes to the window.
- **Run lock.** `runner.lock` holds the pid, as now. A holder counts as live only when `processTable()` lists it with all of these:
  - a `name` of `node` or `node.exe`;
  - a command line that contains this run folder's `run.mjs` path (compared with `samePath` rules on its letters);
  - no `--parallel-task` in the command line.

  When the table cannot be read, the lock counts as live, so the runner errs on the side of not running twice.
- **Paths** are built with `path.join` throughout: worktrees, results, logs, and the session folder inside a worktree (`rev-parse --show-prefix` split on `/`). Prompts print the platform's own paths.
- **Appends and replaces.** An append to `progress.log` retries, as `Append-Line` does. The ticket state file is written to a temporary file and renamed over the original, retrying up to 20 times on `EPERM`, `EBUSY` or `EACCES`. The state lock is created with `fs.openSync(lock, 'wx')`.
- **Marker.** The control-contract marker becomes the line `// task-queue control contract: 1`.

### Monitor

- All OS calls go through the platform module: the process table, killing, launching the runner's window and opening the browser.
- **Recognising runners and sessions.**
  - A **Node runner** of a run folder is a process whose `name` is `node`/`node.exe` and whose command line contains that folder's `run.mjs` path. A parallel child is one with `--parallel-task <id>`.
  - On Windows, a **legacy runner** is recognised as today: `powershell.exe` or `pwsh.exe`, with `run.ps1` and `-ParallelTask`.
  - A **session** is a process below the runner or its child, at most two levels down, so that a `cmd.exe` wrapper in between is allowed. It must also be either named `claude`/`claude.exe`, or have a command line that runs `@anthropic-ai/claude-code`.
- **Marker.** `supportsAdmin` reads the marker from `run.mjs` when it exists, otherwise from `run.ps1`. `MARKER_RE` accepts both `#` and `//` before the marker text.
- **Launching.** Continue, Retry and `new-queue` launch `node run.mjs` with `openWindow`, its working folder being the run folder. On Windows, a legacy run folder is launched as today, through `powershell.exe -File run.ps1` in `openWindow`. On macOS, a legacy run folder has no admin actions that launch, and the refusal reason is `this run folder's runner is a PowerShell script`.
- **New queues.** `new-queue` copies `runner.mjs` as `run.mjs`, together with `platform.mjs`.
- **Idle exit.** The two-hour idle exit counts a queue as running when either a Node runner or a legacy runner of a run folder under the queue root is alive.
- **Paths.** `samePath` comes from the platform module.
- **Version.** The server's `VERSION` is raised to 6.
- **Failures.** A launch that throws (for example the macOS Automation refusal) answers 500 with the message, writes `admin: launch failed (<message>)` to `progress.log`, and does not leave the run marked as starting.

### Helpers and skills

- **`skills/ticket-queue/register.mjs <path>`** replaces `register.ps1` with the same behaviour and output. Two details change:
  - the default queue root is `os.homedir()/.claude-queues`;
  - paths are compared with `samePath`, with any trailing `\` or `/` removed.
- **`skills/ticket-queue/ensure-monitor.mjs [--port N] [--open <hash>]`** replaces `ensure-monitor.ps1` with the same behaviour, messages and exit codes. It uses `portOwner`, `processTable`, `killProcesses` and `startHidden`. With `--open`, once a monitor of this version answers, it opens `http://127.0.0.1:<port>/<hash>` with `openUrl`. This gives each skill one command to run instead of a PowerShell `Start-Process` for the URL.
- **`skills/task-queue/launch.mjs <run folder>`** does two things:
  - It reads `queue.json` back and prints `workDir` and whether it exists. It checks that every task has its brief, and exits 1 with the problem when one does not. This replaces the `ConvertFrom-Json` check.
  - It copies `runner.mjs` and `platform.mjs` into the run folder when they are missing, opens the runner's window with `openWindow`, then runs `ensure-monitor.mjs --open ""`.
- **The skills' instructions.**
  - `task-queue` step 4 lists `run.mjs` and `platform.mjs` instead of `run.ps1`. Its check is `node launch.mjs --check <run folder>`, and step 5 is `node launch.mjs <run folder>`. The run folder layout uses `/` in the text, as a placeholder that works on both platforms.
  - `ticket-queue` and `queue-monitor` run `node register.mjs` and `node ensure-monitor.mjs --open …`.
  - Code fences are tagged `sh` and hold only the `node` command, which works as written in PowerShell, cmd, bash and zsh.
  - Every mention of `%USERPROFILE%` becomes `~` (the home folder).
- **`launch.mjs --check <run folder>`** only reads the run folder back, with the same output and exit code as the read-back above; it launches nothing.
- **Plugin.** The version becomes `2.0.0`, because the runner file of a run folder changes. Its description says Windows and macOS.

### Old run folders

- On Windows, a legacy run folder keeps its `run.ps1`. The monitor shows it, stops it, and launches it on Continue and Retry, as above. Nothing converts it.
- The skill no longer ships `runner.ps1`, so no new legacy run folder is made.

## Testing Decisions

- A good check drives only real inputs and asserts only on what the user or the next program can observe: files, `progress.log`, API answers, exit codes, processes alive or gone. It never imports the runner's or the server's functions. The one exception is the platform module, whose exported functions are its public interface: a check may call them directly.
- **The seam** is the same as in the earlier specs: an HTTP request or a skill's command, then the monitor server, the run folder, and the real runner with the stub `claude` on a throwaway git repository. The fixtures live under `os.tmpdir()/task-queue-monitor-fixtures`, which is `%TEMP%\…` on Windows.
- **The stub `claude`** becomes a Node script.
  - On macOS it is an executable `claude` with a `#!/usr/bin/env node` line.
  - On Windows there are two variants: a `claude.cmd` that runs it, and a `claude.exe` stand-in. Both Windows paths of `claudeCommand()` are covered this way.
  - Both platforms put the stub's `bin` folder first on `PATH`.
- **The earlier specs' checks** (`check-picker.mjs`, `check-admin.mjs` and the parallel-task checks) are made portable:
  - paths come from `path.join` and `os.tmpdir()`;
  - no `powershell.exe` and no `.ps1`;
  - the runner is started as `node run.mjs`.

  They must pass on Windows against the Node runner. Where a check depends on the runner's window, it runs the runner in the foreground instead.
- **Port parity.** On Windows, before `runner.ps1` is deleted, every runner scenario of the earlier checks runs once against the PowerShell runner and once against the Node runner. The `progress.log` messages (timestamps removed), the reports, the ticket state files and the git history must be the same, apart from the line endings, which `os.EOL` keeps the same on Windows anyway.
- **Platform module scenarios**, on each supported platform:
  - `processTable()` lists the check's own process with its parent;
  - `killProcesses()` kills a child process;
  - `portOwner()` names a test server's pid;
  - `claudeCommand()` finds the stub. On Windows it finds both the `.exe` and the `.cmd`, and an argument holding `"`, `%`, `&` and `^` reaches the `.cmd` stub unchanged.
- **Lock scenarios.**
  - A second `node run.mjs` of the same run folder exits 1 with the message.
  - A `runner.lock` naming a dead pid, or a pid reused by another program, is taken over.
- **Legacy scenarios** (Windows only): a legacy run folder made by the earlier checks still shows, stops and continues through `run.ps1`.
- **Manual checks**, recorded in the README of these docs:
  - On macOS: a real Terminal window opening, the Automation prompt and the error after refusing it, and the browser opening.
  - On Windows: the runner window's title and colours.
- **The real check** at the end is the only one that costs money, and it runs on both platforms. It is the ticket picker's real check (two features, three tickets, one blocked) run on a Mac and on Windows, plus a chat-flow queue with one parallel group of two tasks.

## Out of Scope

- Linux. The code is kept portable, but no window or browser branch is written for Linux, and nothing is checked there.
- Converting legacy run folders to `run.mjs`.
- Running a legacy run folder on macOS.
- Terminal apps other than Terminal.app on macOS (iTerm2 and the like). A setting to choose one can come later.
- A Windows Terminal tab instead of a console window.
- npm packages, a build step or TypeScript: the scripts stay single files run by `node`.
- Any change to the monitor's page, the queue's formats, the admin actions or the ticket picker's behaviour.

## Further Notes

- **Why Node, not PowerShell 7 on the Mac.** `pwsh` would have to be installed on every Mac. It would still need a platform branch for the process table, the port and the windows. PowerShell 5.1 and 7 also differ in small ways, as the `ConvertTo-Json` indentation already showed. Node is already there for the monitor, and the monitor already has most of the process logic in JavaScript.
- **PowerShell inside the platform module.** On Windows, the platform module still calls `powershell.exe` for `Win32_Process` and `Get-NetTCPConnection`, because `wmic` is gone from current Windows 11. That is a system tool, not a script of this plugin, and it is the only remaining use of PowerShell.
- **macOS Automation permission.** The permission is granted to the program that runs `osascript`. That is the monitor's `node` for Continue, Retry and the picker's Start, and the terminal or Claude Code's process for `launch.mjs`. The user may be asked twice, once for each.
- **Line endings.** Run folders written on one platform and read on the other (through a synced home folder, for example) still parse, because every reader takes `\r?\n`.
