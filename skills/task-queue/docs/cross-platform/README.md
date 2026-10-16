# Cross-platform: spec and tickets

The design record for running the plugin on macOS as well as Windows. Every PowerShell script is moved to Node.js, and everything that differs between the two platforms goes into one platform module.

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets:
  1. [01-platform-module-and-helpers.md](01-platform-module-and-helpers.md): blocked by nothing. The platform module, the monitor's OS calls, `register.mjs` and `ensure-monitor.mjs`.
  2. [02-node-runner-sequential.md](02-node-runner-sequential.md): blocked by 01.
  3. [03-node-runner-parallel-groups.md](03-node-runner-parallel-groups.md): blocked by 02.
  4. [04-chat-flow-docs-and-cleanup.md](04-chat-flow-docs-and-cleanup.md): blocked by 03.
  5. [05-real-check-on-both-platforms.md](05-real-check-on-both-platforms.md): blocked by 04.

The tickets form one chain, and each one touches the runner or the server. Run them one after another, not as a parallel group.

Tickets 01 to 03 each end with a check on macOS. A queue running on Windows cannot do that part. When no Mac was available, the ticket records that here, and the Mac checks are made up in ticket 05.

## Status

01 is built and checked on Windows. It stays `in-progress` until the macOS part is run, because no Mac was available.

- `check-platform.mjs` (new, in `%TEMP%\task-queue-monitor-fixtures`): 21 of 21 pass on Windows with `--windows`. That covers the process table, killing, the port owner, `claude.exe` before `claude.cmd`, arguments with `"`, `%`, `&`, `^`, `|`, `<`, `>`, a trailing backslash and an empty string reaching a `.cmd` stub unchanged, a hidden process, `samePath`, and a real `cmd /k` window running its command in its folder.
- `check-picker.mjs`, made to run `register.mjs`, `ensure-monitor.mjs` and the platform module: 167 of 167 pass on Windows, the same as before the change. The runner is still `runner.ps1`, launched through `openWindow` (`start` with `cmd.exe /k` around `powershell.exe -File run.ps1`), and no runner window was left open afterwards.
- `server.mjs` calls no `powershell.exe`, `taskkill` or `cmd.exe` itself. The one remaining `powershell.exe` is the command of a legacy runner's window, given to `openWindow`.
- Not run yet:
  - `ensure-monitor.mjs --open`, because it opens the real default browser;
  - every macOS branch: `ps` and `lsof` parsing, `osascript` and the Automation error, `open`, and the macOS refusal of Continue, Retry and Start for `run.ps1` folders.
- Not in the spec: a launch failure in `new-queue` answers 500 but keeps the run folder, since the queue is written and Continue can start it. Only a failure before the launch removes it.
- Changed from the spec: `claudeCommand()` returns `{ file, viaShell, argv(args), options }`. The spec now says so.

To run the Mac part on a Mac with this repository at `~/Development/Skills`:

```sh
SKILLS_DIR=~/Development/Skills/skills node check-platform.mjs --windows
```

For `check-picker.mjs` on a Mac, only its register, reading, refusal and monitor-version scenarios apply until ticket 02. Its chat-flow scenarios still call `powershell.exe`.
