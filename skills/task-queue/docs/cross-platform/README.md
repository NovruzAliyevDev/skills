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

02 is built and checked on Windows. It stays `in-progress` until the macOS part is run, because no Mac was available.

- `runner.mjs` is the port of `runner.ps1` for queues without parallel groups. A queue with a valid group stops at its first group with `Group <label> - STOPPED (this runner does not run parallel groups yet)`; `runGroupStep` is where ticket 03 ports `Skip-Members`, `Run-Group` and `Resolve-Conflict`. The group parsing (and its `queue.json:` problems), the group parts of `Run-Task` and the `--parallel-task` entry are already ported, but only the parsing is checked.
- `check-parity.mjs` (new, in the fixtures): 19 scenarios, each run with `run.ps1` and with `run.mjs` on a throwaway git repository with a deterministic stub (`parity-stub`, a `claude.cmd` laid out like the npm package). 209 of 209 comparisons are the same: `progress.log` messages, reports, task logs, the ticket state file, `info/exclude`, git history (commit hashes), git status, exit codes, and each call's arguments, folder, prompt and environment. The scenarios: DONE with commits, FAILED, an error flag, the resume-once (finished, and never), pause at start and between tasks then Continue, skip (and passed over on the next run), hard stop then resume on Continue, retry resume with a note, retry fresh with a note, `control.json` invalid, of another version and empty, a bad preflight mode, model and effort, state files unreadable, holding other entries, or with no `.scratch` folder, and two `queue.json` group problems.
- `check-node-runner.mjs` (new): 47 of 47 pass. It covers the run lock: a second runner exits 1 with the message, by full path and as a bare `node run.mjs`. A lock naming a dead pid, `ping`, another folder's runner or a `--parallel-task` child is taken over. With no PowerShell on the PATH, the process table cannot be read and the lock counts as live. It covers a title holding `"`, `%`, `&`, `^`, `!`, `<`, `|` and `>`, which reaches the session through `claude.cmd` unchanged (the `"` is turned into `'`, as before). Through the server it shows a Node runner and a legacy `run.ps1` runner alive with their sessions, stops both (runner and session killed), and continues and retries both. It covers a launch that throws (a queue root holding `%`, which `openWindow` refuses): 500, `admin: launch failed (...)`, and Continue offered again. The idle exit is checked on a copy of the server with its timings shortened: it waits for a Node runner and for a legacy runner, and exits without one.
- `check-picker.mjs`: 167 of 167 pass against the Node runner. Its chat-flow queues run `node run.mjs` in the foreground, except the one with a parallel group, which runs `run.ps1` until ticket 03.
- `check-platform.mjs`: 21 of 21 pass; `platform.mjs` is unchanged.
- Window: a runner opened through `openWindow` set its own title, `Task queue: TitleCheck (1 tasks)`, in Windows Terminal. The colours come from the same branch, which runs only when stdout is a terminal. Nobody looked at them on screen.
- Not run: everything on macOS. That covers a picker queue of two tickets in a real Terminal window, and the refusal of Continue, Retry and Start for a legacy run folder there.
- Changed from the spec:
  - The lock also counts a holder whose command line runs a bare `run.mjs`, for a runner started as `node run.mjs` from its folder. Such a line cannot be told from another folder's runner, so it errs on the side of not running twice.
  - The monitor's Continue line names the runner file: `admin: continue - run.mjs launched in a new window`.
  - A session is found up to two levels below the runner, named `claude`/`claude.exe` or running `@anthropic-ai/claude-code`. The picker's stub (`claude.cmd` -> `node stub.mjs`) matches neither, so its sessions show as `no-session`, as they did before.
- Surprises:
  - runner.ps1's comparisons of statuses and modes ignore case (`-ne`, `-notin`): a report starting with `done` counts as DONE. The port keeps that.
  - Its `Add-Member -Force` moves a rewritten ticket entry to the end of `tickets`, so the port deletes the key before setting it.
  - It prints the error flag as `True`/`False`.
  - Its prompts carry the file's CRLF line ends, while the port's use LF. The parity check compares prompts with line ends normalised.
