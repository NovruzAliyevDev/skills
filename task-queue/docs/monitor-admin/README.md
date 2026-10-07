# Monitor administration: spec and tickets

The design record for administering a queue from the monitor: stop, pause, continue, skip, retry and edit a brief.

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets:
  1. [01-pause-and-continue.md](01-pause-and-continue.md): blocked by nothing. It also lays the ground: the admin endpoint and its security, the control file, the run lock, the feature marker.
  2. [02-skip-and-unskip.md](02-skip-and-unskip.md): blocked by 01.
  3. [03-hard-stop-and-resume.md](03-hard-stop-and-resume.md): blocked by 01.
  4. [04-retry-with-note.md](04-retry-with-note.md): blocked by 01.
  5. [05-edit-brief.md](05-edit-brief.md): blocked by 01.
  6. [06-scene-context-menu.md](06-scene-context-menu.md): blocked by 02, 03, 04 and 05.
  7. [07-skill-notes-and-real-check.md](07-skill-notes-and-real-check.md): blocked by 06.

After 01, tickets 02 to 05 do not depend on each other. They all touch the runner's task start, the server's admin endpoint and the drawer, though. Run them one after another, in the order above, rather than as a parallel group, to avoid merge conflicts.

## Progress line contract

Ticket 01 starts it, and each later ticket adds the wording of the lines it writes. The server parses what is written here.

Every line starts with the timestamp and two spaces, as before. Admin lines record what the user asked and what was applied; they start with `admin: `. The server ignores them when it judges a run's progress: a run whose log holds only admin lines has not started.

| Line | Written by | Written when |
|---|---|---|
| `admin: pause requested` | server | Pause was applied: `pause` is set in `control.json`. |
| `admin: pause cancelled` | server | Cancel pause was applied: `pause` is cleared. |
| `admin: continue - run.ps1 launched in a new window` | server | Continue was applied: `pause` is cleared if it was set, then the run folder's `run.ps1` is opened as the skill opens it. The runner's `Queue` line follows. |
| `admin: <action> refused (<reason>)` | server | An action the run's state does not allow (the request answered 409). `<action>` is `pause`, `cancel-pause` or `continue`. The reasons: `the run is finished`, `no runner of this run is alive`, `the process check is still pending`, `a pause is already asked for`, `no pause is asked for`, `a runner of this run is alive`, `the runner is starting`. Requests answered 400, 403, 404 or 413 leave no line. Neither do requests for a run folder without the feature marker: the server does not write into run folders it cannot administer, although user story 49 asks for a line for every refusal. |
| `admin: control.json ignored (<problem>)` | runner, server | The control file could not be read, so it means no commands. The problems: `it is not valid JSON`, `it is empty`, `version '<v>' is not one this runner knows` (`... this monitor knows` from the server). The runner writes it once until the problem changes; the server writes it with an admin action that reads it. |
| `admin: pause applied (<where>)` | runner | The runner found `pause` set at a read point and stops there. `<where>` is `at start` (right after the `Queue` line, before the preflight), `before task <id>`, `before group <first id>-<last id>`, or `after group <first id>-<last id>` (after its merge step). A pause asked during a group is applied only after its merge step. The runner window prints it in yellow. |
| `Queue - PAUSED (by the user)` | runner | Right after `admin: pause applied`. The runner then exits with code 0 and removes its lock. |

A pause asked while the last sequential task runs is never applied: the queue finishes, and its final line is the usual `All N tasks DONE`. A pause asked during a last group is applied after its merge step; Continue then only writes the final line.

The runner reads `control.json` before each sequential task that is not already DONE, before each group, and at start; never while a session runs. Its `version` is `1`. Ticket 01 uses only `pause`; the server writes the other fields of the spec (`skip`, `retry`, `resume`) empty.

**Run lock.** The runner writes its process id to `runner.lock` before its `Queue` line and removes the file when it exits, normally or by a stop or pause (not when it is killed). It creates the file only if it does not exist; it replaces a lock whose holder is gone, and goes on only if the file still names it a moment later. A runner that finds a lock naming a live PowerShell process running this run folder's `run.ps1` by its full path (not a `-ParallelTask` child) writes nothing to `progress.log`; its window shows, in red, `Another runner of this run folder is alive (process <pid>), so this one exits. Continue the queue from the monitor once that runner has stopped.`, and it exits with code 1. The `-ParallelTask` children neither check nor take the lock.

**Feature marker.** The runner carries the line `# task-queue control contract: 1`. The server offers admin actions only for run folders whose `run.ps1` carries it, and judges their runner by the lock: the runner is the process the lock names, so the window the skill opens (`-NoExit`) stops counting once its script has ended.

## Monitor: what ticket 01 added

- `GET /` carries `<meta name="admin-token" content="<token>">`, a random token made at each server start.
- `POST /api/admin` takes JSON `{ project, run, action }` with `action` one of `pause`, `cancel-pause`, `continue`. It needs the token in `X-Admin-Token` and an `Origin` of `http://127.0.0.1:<port>` or `http://localhost:<port>`; otherwise 403. Other methods there answer 405, as every non-GET request elsewhere. Answers: 200 `{ ok, action }`; 409 `{ error }` with the reason; 400 for a body that is not a JSON object, an unknown action or an invalid project or run name; 404 for an unknown run; 413 for a body over 1 MB. The server takes a fresh process snapshot before it judges an action. After a Continue, the new runner counts as alive (`the runner is starting`) until a process snapshot taken after the launch shows it, at most 30 s.
- `/api/run` answers `admin: { supported, actions }`: whether the run folder's runner copy has the marker, and the run-level actions allowed now. Run states gain `pausing` (pause asked, run running or no-session) and `paused` (after the `PAUSED` line, until the next `Queue` line). `paused` has a `finishedAt`, as the other stopped states.
- The page shows, under the run header of an unfinished run that supports admin actions, Pause (Cancel pause while one is asked) and Continue; an action not allowed now stays greyed and focusable. A refused action shows `<Action> refused: <reason>` beside them. The scene's sign reads PAUSED, the tab title starts with ⏸, and a notification says "Queue paused".

## Check tooling

The checks of this spec run against the tooling of the earlier specs in `%TEMP%\task-queue-monitor-fixtures` (see the parallel-tasks README). Ticket 01 added:

- `check-admin.mjs`: `node check-admin.mjs [scenario...]` starts a monitor on port 4849 over `admin-root\` with the stub `claude` first in `PATH`, and plays `security`, `pause`, `cancel-pause`, `group`, `lock`, `old` and `unreadable` with the real runner: requests in, then `/api/run`, `progress.log`, the stub's calls, the lock file and the repository. Continue opens real runner windows; the check closes them at the end. About four minutes.
- `setup-admin-ui.mjs`: run folders under `admin-root\AdminUI` for checking the page's controls by hand in the browser pane (a monitor on port 4850 over `admin-root`, with the stub first in `PATH`).
- The stub `claude` learned `hold:<file>` (stay working until `<file>` appears beside the plan), and finds a run folder's `plan.json` by itself when no `STUB_PLAN` is set, as for a runner the monitor launched.
- `check-parallel.mjs` expects the new `admin` field in every run answer.

## Status

Ticket 01 is done. Checked: `check-admin.mjs` (all scenarios), the runner checks `check-runner.ps1` and `check-parallel.ps1`, and the monitor checks `check-states.mjs`, `check-http.mjs` and `check-parallel.mjs`, all passing; the page's controls by mouse and keyboard in Claude's browser pane, in light and dark and at 375 px, through a whole pause, cancel, pause, continue cycle on a stub run.
