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

03 is built and checked on Windows. It stays `in-progress` until the macOS part is run, because no Mac was available.

- `runner.mjs` now runs parallel groups: `Skip-Members`, `Run-Group` and `Resolve-Conflict` of `runner.ps1` are ported in place of the stub. A group's tasks run in `wt/<id>` on `queue/<run folder>/<id>`, each in a `node run.mjs --parallel-task <id>` child started with `process.execPath`, at most `maxParallel` at a time. A new child starts when one ends, where `runner.ps1` polled every 200 ms. The children write to the runner's window.
- `server.mjs` is unchanged. It already recognised the Node runner's `--parallel-task` children and the sessions below them, and the checks below confirm that.
- `check-parity.mjs` now has 30 scenarios, 11 of them parallel: all DONE then merged (three tasks, two at a time, `workDir` a subfolder), one FAILED with nothing merged and then continued, work left uncommitted in a worktree, a conflict resolved, a conflict failed and undone and then tried again, a second conflict resuming the conflict session, a group reduced to one task by skips, a group fully skipped, a group naming an unknown task, `maxParallel` 0, and a hard stop in the conflict session followed by Continue. 426 of 426 checks pass. Branches, worktrees, the `wt` folder and the whole git graph (merge commits included, with fixed dates) are compared too. The children's lines in `progress.log` and their calls come in any order between tasks, so the check sorts them into task order, keeping each task's own order, before comparing. Beside the comparison, it checks that at most `maxParallel` sessions ran at once and more than one did, that each session ran in its worktree's copy of the queue's folder, and that the children wrote no ticket state while the sequential task did. Every task prompt carries the commit note.
- `check-node-parallel.mjs` (new): 23 of 23 pass. Through the server, it runs a group of two in a real window started by Continue. The run view shows both tasks running, each with its own `node … run.mjs --parallel-task <id>` child of the runner and a session below that child. The hard stop kills the runner, both children and both sessions, and names both sessions to resume. Continue resumes both in their worktrees. The merge step then shows `resolving` with its conflict session running below the runner, and a hard stop there kills it and undoes the merge. The last Continue merges, removes the worktrees and branches, and finishes the queue.
- `check-picker.mjs`: 167 of 167 pass. Its chat-flow queue with a parallel group now runs `node run.mjs`, and no queue of it uses `run.ps1` any more. `check-node-runner.mjs`: 47 of 47 pass. `check-platform.mjs`: 21 of 21 pass. It now closes its own `cmd /k` window, because a window left open by an earlier run held its folder and broke the next run.
- Not run: everything on macOS. That covers the hard stop of a group's tree there, and a queue with a group of two and a forced conflict run to the end with the stub.
- Surprise: right after a Continue that follows a hard stop, `/api/run` can answer `runner.alive: false` for a moment, while a conflict session already shows as running. The process snapshot is older than the new runner. The check waits for it.

04 is built and checked on Windows. It stays `in-progress` until the macOS part is run, because no Mac was available, and because two mentions of PowerShell are left outside the places the ticket allows (see below).

- `launch.mjs` (new, in `skills/task-queue`) reads `queue.json` back as the runner does (a byte order mark is allowed), prints `workDir: <path>` and `exists: true|false`, and checks that every task has its `tasks/<id>.md`. Each problem is printed on a `Problem:` line and ends it with exit 1, before anything is copied or opened. Without `--check` it then copies `runner.mjs` (as `run.mjs`) and `platform.mjs` in when they are missing, opens the runner with `openWindow` (title `Task queue: <run folder name>`, as the monitor's Continue), and runs `ticket-queue/ensure-monitor.mjs --open ""`, whose exit code it returns. A window that cannot be opened exits 1 with the reason and the `node "<run folder>/run.mjs"` command to run by hand.
- `SKILL.md` of `task-queue`: steps 4 and 5 are `node "<this skill's folder>/launch.mjs" --check "<run folder>"` and `node "<this skill's folder>/launch.mjs" "<run folder>"` in `sh` fences. The run folder is `~/.claude-queues/<ProjectName>/<yyyyMMdd-HHmm>/` with `/` in the text, lists `run.mjs` and `platform.mjs` (the launch copies them in), and the `queue.json` example's `workDir` is a Windows path with doubled backslashes, followed by a macOS path in the text. Step 5 tells Claude what to do about the macOS Automation prompt. The monitor's restart is now `/novruzaliyev-skills:queue-monitor`.
- `runner.ps1` is deleted. The repository holds no `.ps1` file. The README, the plugin manifests and the monitor need no other change for it: the monitor's `new-queue` already copied `runner.mjs`.
- README: Windows 10 or 11, or macOS 13 or later; Node.js; `claude` on the PATH; git. The run folder uses `~/.claude-queues` and `/`, the commands are `sh` fences, and a short macOS paragraph says who is asked for the Terminal Automation permission and where to turn it on again. One line says that run folders from before 2.0.0 have a `run.ps1`, which the monitor still runs on Windows.
- The plugin is `2.0.0` in `plugin.json` and, as a new `version` field, in `marketplace.json`. Both descriptions name Windows and macOS. `claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json` pass.
- `check-launch.mjs` (new, in the fixtures): 22 of 22 pass on Windows. The `--check` part: no argument, a good run folder (nothing copied, nothing opened), a missing brief, single backslashes in `workDir`, a cut-off `queue.json`, no `queue.json`, a `workDir` that does not exist, no `workDir` and no tasks, and a byte order mark. The launch part: a missing brief and a bad `queue.json` copy and open nothing and start no monitor. A run folder written by hand as the new step 4 says (three briefs, the example's `queue.json` with its group 02-03 and doubled backslashes, no `run.mjs`) passes the check, and the launch copies both files, opens a real runner window and starts the monitor on a test port. The queue runs to the end with the picker's stub: three `DONE` reports, `merge DONE`, worktrees removed, the lock gone, and the monitor shows the run done. A second launch copies nothing and keeps the running monitor. A run folder whose path holds `%` exits 1 with the reason. So that no real browser opens, `ComSpec` points at a small shim (`launch/comspec-shim.exe`, built with the .NET Framework's `csc`) that records each `cmd.exe` line, answers `start "" "http…"` itself and hands every other line to the real `cmd.exe`. The check closes the windows and the monitor it started.
- The other checks, with `runner.ps1` gone: `check-platform.mjs` 21 of 21, `check-picker.mjs` 167 of 167, `check-node-runner.mjs` 47 of 47, `check-node-parallel.mjs` 23 of 23. `check-parity.mjs` and the legacy part of `check-node-runner.mjs` now take `runner.ps1` from `legacy/runner.ps1` in the fixtures, a copy of the last committed one. `check-parity.mjs`: 426 of 426, after the change below.
- Portability of the checks: `check-picker.mjs`, `check-node-parallel.mjs` and `check-launch.mjs` call no `powershell.exe` and copy no `.ps1`. For macOS the stubs got an executable `claude` node script each (`picker/stub/claude`, and `parity-stub/node_modules/@anthropic-ai/claude-code/claude`, which those checks put on the `PATH` there so that a session's command line names the npm package), and the checks make it executable. `check-node-runner.mjs` keeps its Windows-only parts: the legacy `run.ps1` runner and the title through `claude.cmd`. The repository's path defaults to `C:\Development\Skills`; set `SKILLS_DIR` on a Mac. The launch part of `check-launch.mjs` needs the shim and runs on Windows only. None of this was run on a Mac.
- Not met: a search for `powershell` also finds comments in `runner.mjs` that name what the port copies from `runner.ps1` (its case-blind comparisons, `Add-Member`, the colours and the boolean text), and the monitor's recognition of a legacy runner and its idle check, besides the legacy launch. They are not instructions; the `runner.mjs` comments belong to tickets 02 and 03 and were left as they are.
- Not run: everything on macOS. That covers `launch.mjs` opening a Terminal window, the Automation prompt and the error after refusing it, the browser opening, and the checks with the macOS stubs.
- Not in the spec: `launch.mjs` also exits 1 when `workDir` is not an existing folder, since the runner could not start there; the old read-back only printed `False`.
- Surprises:
  - In Git Bash, `process.env` holds both `COMSPEC` and `ComSpec`. Setting `ComSpec` in a copy of it does not win, so the first run of `check-launch.mjs` went past the shim and opened the monitor's page once in the real browser. The check now drops every spelling before setting it, and refuses to run the launch part unless a child sees the shim.
  - The browser's `cmd.exe` is detached, so its line can come after `launch.mjs` has exited.
  - Two full runs of `check-parity.mjs` failed `git status` in two or three parallel scenarios: a merged file listed as modified in one runner's repository, sometimes the `run.ps1` one, sometimes the `run.mjs` one, and clean when run alone. This machine has `core.autocrlf=true`: the merge wrote the files with CRLF while the index kept the LF size, and whether `git status` saw that depended on timing. The check now sets `core.autocrlf false` in its throwaway repositories, and 426 of 426 pass. It was never a difference between the runners.
  - On a Mac, a session started through an npm-installed `claude` runs as `node <bin>/claude`, whose command line may not name `@anthropic-ai/claude-code` (the bin is a link). The monitor may then show such sessions as `no-session`, as it shows the picker's stub. Ticket 05 should look at it.
  - On a Mac, killing a runner leaves its Terminal window open; the checks cannot close those windows by killing processes.

05: the Windows part ran on 2026-10-17 with real sessions; see "Real check (ticket 05)" below. It stays `in-progress`: the macOS part has not run, and nobody looked at the Windows runner window's colours.

- Ran on Windows: the ticket picker's real check (three tickets, all `done`), a chat-flow queue with one parallel group of two tasks (both merged, worktrees and branches removed), the runner window's title by process information, and a legacy `run.ps1` run folder shown, stopped and continued through the monitor with the stub.
- No bug of the plugin was found.
- Not done: the runner window's colours were not looked at, because the screenshot of Windows Terminal was refused. Everything on macOS: the steps are listed at the end of the section below.

## Real check (ticket 05)

### Windows

Run on 2026-10-17 on Windows 11 with Claude Code 2.1.302, the plugin at 2.0.0 run from this repository's `skills` folder (not installed through `claude plugin install`, so that the user's installed plugin stayed as it was). Real sessions: model `sonnet` (the preflight read `claude-sonnet-5-5`), mode `auto`, effort unset. Everything ran under `%TEMP%\cross-platform-real-check`, with `TASK_QUEUE_ROOT` set to its `root` folder and `TASK_QUEUE_MONITOR_PORT=4870`, so `~/.claude-queues` and port 4747 were not touched. The pages were read and driven in Claude's browser pane; the pane was hidden at the time, so the work went by page text and element references, not by sight.

**The ticket picker.** The scratch repository `CrossPlatformPicker` is the starting commit of the ticket picker's real check: a tiny Node.js library (`add` and one `node --test` test), a `CLAUDE.md` asking for a test per function and one commit per task with the ticket file included, and `.scratch` holding `math` (01 `multiply`; 02 `divide`, `Blocked by: 01`) and `text` (01 `shout`), all `ready-for-agent`.

- The skill's steps by hand: `git rev-parse --show-toplevel`; `register.mjs` printed `CrossPlatformPicker`; `ensure-monitor.mjs` without `--open` printed `Started the monitor (version 6) on port 4870.`; the picker was opened at `#new:CrossPlatformPicker` in the browser pane.
- Picking `math 02` alone showed `math 02 is blocked by math 01 Multiply, which is neither picked nor done.` and Start was refused. With all three picked, the order read `01 math 01 Multiply`, `02 math 02 Divide`, `03 text 01 Shout`. Model `sonnet` typed, then Start.
- At once: the run folder `CrossPlatformPicker\20261017-0325` with `run.mjs`, `platform.mjs`, `ticket` fields and no groups, the three tickets `queued` in the state file, `.scratch/queue-state.json*` in `.git/info/exclude`, `git status` clean. The runner ran as `cmd.exe /d /s /k "node.exe …\run.mjs"`, and its Windows Terminal window was titled `Task queue: CrossPlatformPicker (3 tasks)`.
- `All 3 tasks DONE` in 1 minute 20 seconds. The state file said `done` for all three, each still tied to its run and task, in two-space JSON. Each ticket file said `Status: done` with no criterion left unticked. `git status` was clean, and the history held `Add multiply`, `Add divide` and `Add shout` over the starting commit. `node --test` passed 5 of 5. The run view showed `DONE`, 3 commits, cost $0.36. The picker then showed the three `DONE` with the run's name, and no checkbox enabled.

Cost: $0.36 ($0.12, $0.12, $0.12).

**The chat flow.** The scratch repository `CrossPlatformChat`: `add.js` and `add.test.js`, and a `CLAUDE.md` asking for a test next to each function and one commit per task. Following `task-queue` steps 4 and 5 by hand, the run folder `root\CrossPlatformChat\20261017-0331` got two briefs (01 `subtract` in `subtract.js`, 02 `negate` in `negate.js`, each with its test and touching no other file) and a `queue.json` with `parallel: [["01", "02"]]`, `maxParallel` 5, model `sonnet`, and `workDir` with doubled backslashes. No `run.mjs` was written.

- `launch.mjs --check` printed `workDir`, `exists: true` and `2 task(s), each with its brief.`, exit 0. `launch.mjs` copied `runner.mjs` and `platform.mjs` in, opened the runner window, found the monitor running and exited 0. It was run with `ComSpec` pointing at `check-launch.mjs`'s shim (`%TEMP%\task-queue-monitor-fixtures\launch\comspec-shim.exe`), so that the monitor's page did not open in the user's real browser. The shim's log shows the window's `start "Task queue: 20261017-0331" …` line and the browser's `start "" "http://127.0.0.1:4870/"` line.
- While the group ran: the runner, a `node run.mjs --parallel-task 01` and a `--parallel-task 02` child, and a `claude.exe` session below each child. The window was titled `Task queue: CrossPlatformChat (2 tasks)`, and the run view showed `runner pid …, session alive` and `MERGE 01-02 · WAITING`.
- Both tasks `DONE`, then `merged 01`, `merged 02`, `merge DONE`, and `All 2 tasks DONE`. The history: `Add subtract` on `main`, `Add negate` on its branch, and a merge commit. No `queue/…` branch and no worktree were left, `git status` was clean, and `node --test` passed 3 of 3. The run view showed `DONE`, `MERGE 01-02 · MERGED`, cost $0.30.

Cost: $0.30 ($0.14, $0.16). It took 10 minutes 40 seconds instead of under a minute, because of the shim (see Unexpected).

**The window.** Both runner windows opened as tabs of Windows Terminal, titled `Task queue: <project> (<n> tasks)`, as the PowerShell runner's were. The colours were not seen. The screenshot needs access to Windows Terminal, and that request was refused, so nobody looked at the window.

**A legacy run folder** (stub, no real session). The run folder `legacy-root\LegacyCheck\20261001-1200` held `run.ps1` copied from `fixtures\legacy\runner.ps1`, a `queue.json` and one brief with `STUB-HOLD`. The monitor ran on port 4871 with the fixtures' parity stub first on its `PATH`.

- The monitor showed it `NOT STARTED`, with its Stop, Pause and Continue buttons.
- Continue: `admin: continue - run.ps1 launched in a new window`, `cmd.exe /k "powershell.exe -NoProfile -File …\run.ps1"`, the window titled `Task queue: LegacyCheck (1 tasks)`, and the run view showing `runner pid …, session alive`.
- Stop, confirmed in the dialog: `the runner (process …) and its sessions were killed`, `task 01 cut off, to resume on Continue (session s01-1, …)`, `Queue - STOPPED (by the user)`. The runner and the stub's processes were gone.
- With the hold released, Continue: `resume applied`, the stub called with `--resume s01-1`, `All 1 tasks DONE`, and the run view showed `DONE`.

Afterwards, every runner window and both monitors were closed, and the browser pane's tab too. The scratch folders are left in `%TEMP%\cross-platform-real-check`.

Unexpected:

- In the chat flow, `npm test` did not work in either session: it printed `Microsoft Windows [Version …]` and waited at a `cmd` prompt. From Bash it hung until the tool's timeout. Both sessions then ran `node --test` (which passed), said so in their reports, and committed. The cause is the check's own set-up, not the plugin. `launch.mjs` passes its environment on to the runner window, so the sessions' `ComSpec` was the shim. npm treats a script shell not named `cmd.exe` as a POSIX shell and runs it with `-c "node --test"`, and the shim hands that to `cmd.exe`, which ignores `-c` and stays interactive. The picker's queue, started without the shim, ran `npm test` normally. `check-launch.mjs`'s runner inherits the shim the same way; its stub never runs npm, so nothing shows there. A later run of this part should leave `ComSpec` alone and stop the browser some other way, or accept that the page opens once.
- One session wrote `npmtest.log` into the run folder's `wt` folder, outside its worktree. The runner removed both worktrees but left `wt` with that file in it. This is expected, since the runner removes only what it made.
- The sessions also ran the user's own Claude Code hook (`claude-hook.cmd` from the user's settings) through `ComSpec`: real sessions bring the user's settings with them.
- With the browser pane hidden, a click in the page took a few seconds to show. The Stop dialog's button looked as if it had done nothing, until the processes were checked again.
- On Windows Terminal, the window title belongs to the active tab, so process information shows only the newest runner's title when several are open.

### macOS: still to run

On a Mac with Node.js, git and `claude` on the `PATH`, and this repository at `~/Development/Skills` on the commit that holds 01 to 04:

1. Install the plugin from the repository: `claude plugin marketplace add ~/Development/Skills`, then `claude plugin install novruzaliyev-skills@novruzaliyev`, and start a new session.
2. The picker: make the same scratch repository, for example by copying `CrossPlatformPicker`'s first commit (`git archive`). Run `/ticket-queue` in it, the real way, with `--open`, so the Automation prompt and the browser come up. Refuse the Automation prompt once, press Start or Continue, and check that the monitor's answer names the Automation error. Then allow it in System Settings > Privacy & Security > Automation, and check that Continue works. Pick all three tickets, model `sonnet`, Start. Check the Terminal window's title (`Task queue: <project> (3 tasks)`) and its coloured lines, the state file (`done` ×3), the ticket files (`Status: done`), `git status` clean, and the three commits.
3. The chat flow: in a second scratch repository, run `/task-queue` with two small tasks and the notation `[[1,2]]`, model `sonnet`. Check `launch.mjs` opening Terminal (and the second Automation prompt, for the terminal or Claude Code), both tasks merged, and no `wt/` worktree or `queue/…` branch left.
4. Look at whether the monitor shows the sessions as alive while they run. On a Mac a session may run as `node <bin>/claude`, and the run view may show `no-session` (ticket 04's surprise).
5. Record the date, the model, the cost per task and anything unexpected here, tick the criteria, and set the ticket's status.
6. The stub checks of tickets 01 to 04 run on the Mac too: `SKILLS_DIR=~/Development/Skills/skills node check-platform.mjs --windows` (the flag opens a real terminal window), `check-picker.mjs`, `check-node-parallel.mjs` and the `--check` part of `check-launch.mjs`, from a copy of `%TEMP%\task-queue-monitor-fixtures`.
