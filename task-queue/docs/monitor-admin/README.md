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
| `admin: skip requested (task <id>)` | server | Skip was applied: the task id is added to `skip` in `control.json`. |
| `admin: unskip requested (task <id>)` | server | Un-skip was applied: the task id is removed from `skip`. |
| `admin: <action> refused (<reason>)` | server | An action the run's state does not allow (the request answered 409). `<action>` is `pause`, `cancel-pause`, `continue`, `skip` or `unskip`. The reasons: `the run is finished`, `no runner of this run is alive`, `the process check is still pending`, `a pause is already asked for`, `no pause is asked for`, `a runner of this run is alive`, `the runner is starting`. A task action's reason starts with `task <id>: `, then one of `the run is finished`, `the task is skipped: it has its SKIPPED report`, `the task is not marked to be skipped`, `the task is already marked to be skipped`, `the task has started`, `the task's group has started`. Requests answered 400, 403, 404 or 413 leave no line. Neither do requests for a run folder without the feature marker: the server does not write into run folders it cannot administer, although user story 49 asks for a line for every refusal. |
| `admin: control.json ignored (<problem>)` | runner, server | The control file could not be read, so it means no commands. The problems: `it is not valid JSON`, `it is empty`, `version '<v>' is not one this runner knows` (`... this monitor knows` from the server). The runner writes it once until the problem changes; the server writes it with an admin action that reads it. |
| `admin: pause applied (<where>)` | runner | The runner found `pause` set at a read point and stops there. `<where>` is `at start` (right after the `Queue` line, before the preflight), `before task <id>`, `before group <first id>-<last id>`, or `after group <first id>-<last id>` (after its merge step). A pause asked during a group is applied only after its merge step. The runner window prints it in yellow. |
| `Queue - PAUSED (by the user)` | runner | Right after `admin: pause applied`. The runner then exits with code 0 and removes its lock. |
| `admin: skip applied (task <id>)` | runner | The runner reached a task listed in `skip` that is not DONE, and wrote its report `results\<id>.md`: `SKIPPED` on its first line, then a line saying the user skipped it from the monitor. A report already there is moved to `<id>.previous.md` first. The runner window prints it in yellow. |
| `[i/N] <title> - SKIPPED (by the user)` | runner | Right after `admin: skip applied`, in yellow. The task counts as finished from now on. |
| `[i/N] <title> - already SKIPPED, passed over` | runner | A re-run reaches a task whose report starts with `SKIPPED`, whether or not `skip` still lists it. |
| `Group <first id>-<last id> - passed over (all its tasks skipped)` | runner | Every task of a group not DONE was skipped at its start: no worktree, no merge step. |
| `Finished, <S> skipped: <D> of <N> tasks DONE. Reports: <folder>` | runner | The final line of a queue that finished with skipped tasks, in place of `All N tasks DONE. Reports: <folder>`. |

A pause asked while the last sequential task runs is never applied: the queue finishes, and its final line is the usual `All N tasks DONE`. A pause asked during a last group is applied after its merge step; Continue then only writes the final line.

The runner reads `control.json` before each sequential task that is not already DONE, before each group, and at start; never while a session runs. Its `version` is `1`. Tickets 01 and 02 use `pause` and `skip` (task ids as text); the server writes the other fields of the spec (`retry`, `resume`) empty.

**Skips and groups.** Skips of a group's tasks are read once, at the group's start, after the pause check before it: the tasks listed get their `SKIPPED` report and lines there. Two or more tasks left: the group runs with them only (its `starting` line lists them, and their sessions' prompts name only them). One left: that task runs as a sequential task in the main checkout, with no worktree, no branch and no merge step. None left: the `passed over` line. The group keeps its name `<first id>-<last id>` from `queue.json` either way, and the pause after the group is still checked. A re-run makes the same choice: the skipped tasks keep their `SKIPPED` report, and a group that started in an earlier run (one of its branches exists, or a task of it has a report other than `SKIPPED`) reads no skip entries again.

Before a sequential task, the skip is read before the pause: a task both skipped and paused before is skipped, and the pause applies at the next read point. A task the user marks between the runner's read of `control.json` and its `starting` line still runs; its entry stays in `skip` until un-skipped, and since it is no longer pending the page offers Un-skip for it only. The window is the moment between the read and the start, as for the brief edit of the spec.

**Run lock.** The runner writes its process id to `runner.lock` before its `Queue` line and removes the file when it exits, normally or by a stop or pause (not when it is killed). It creates the file only if it does not exist; it replaces a lock whose holder is gone, and goes on only if the file still names it a moment later. A runner that finds a lock naming a live PowerShell process running this run folder's `run.ps1` by its full path (not a `-ParallelTask` child) writes nothing to `progress.log`; its window shows, in red, `Another runner of this run folder is alive (process <pid>), so this one exits. Continue the queue from the monitor once that runner has stopped.`, and it exits with code 1. The `-ParallelTask` children neither check nor take the lock.

**Feature marker.** The runner carries the line `# task-queue control contract: 1`. The server offers admin actions only for run folders whose `run.ps1` carries it, and judges their runner by the lock: the runner is the process the lock names, so the window the skill opens (`-NoExit`) stops counting once its script has ended.

## Monitor: what ticket 01 added

- `GET /` carries `<meta name="admin-token" content="<token>">`, a random token made at each server start.
- `POST /api/admin` takes JSON `{ project, run, action }` with `action` one of `pause`, `cancel-pause`, `continue`. It needs the token in `X-Admin-Token` and an `Origin` of `http://127.0.0.1:<port>` or `http://localhost:<port>`; otherwise 403. Other methods there answer 405, as every non-GET request elsewhere. Answers: 200 `{ ok, action }`; 409 `{ error }` with the reason; 400 for a body that is not a JSON object, an unknown action or an invalid project or run name; 404 for an unknown run; 413 for a body over 1 MB. The server takes a fresh process snapshot before it judges an action. After a Continue, the new runner counts as alive (`the runner is starting`) until a process snapshot taken after the launch shows it, at most 30 s.
- `/api/run` answers `admin: { supported, actions }`: whether the run folder's runner copy has the marker, and the run-level actions allowed now. Run states gain `pausing` (pause asked, run running or no-session) and `paused` (after the `PAUSED` line, until the next `Queue` line). `paused` has a `finishedAt`, as the other stopped states.
- The page shows, under the run header of an unfinished run that supports admin actions, Pause (Cancel pause while one is asked) and Continue; an action not allowed now stays greyed and focusable. A refused action shows `<Action> refused: <reason>` beside them. The scene's sign reads PAUSED, the tab title starts with ⏸, and a notification says "Queue paused".

## Monitor: what ticket 02 added

- `POST /api/admin` takes task actions `{ project, run, action, task }` with `action` `skip` or `unskip`; a missing, invalid or unknown `task` answers 400. Skip is allowed for a pending task that is not marked yet, in no group that has started (a group has started once the runner wrote a line of it, or one of its tasks left `pending`), of a run not finished; un-skip for a task marked in `skip` that is not `skipped` yet. The runner need not be alive for either.
- `/api/run`: every task gains `skipPending` (pending and listed in `skip`) and `actions` (the task actions allowed now; empty for a run folder without the marker), and the state `skipped` (from its `SKIPPED` or `already SKIPPED` line). The run state `finished-with-skips` comes from the `Finished, ...` line; it is finished, as `done` is, so it has a `finishedAt` and no controls. A group left with fewer than two tasks by skips has the merge state `skipped`, and the task left in it is judged as a sequential task (its session belongs to the runner itself) and answers `group: null`, so the page shows it without its group's marks. `/api/runs` counts `skipped` tasks in `counts`.
- The page: the task drawer shows the task's allowed actions under its facts, Skip and Un-skip in one slot. Skip asks for confirmation in a dialog (Cancel has the focus; Esc closes only the dialog); Un-skip acts at once. A refusal shows `<Action> refused: <reason>` beside the button. A task marked to be skipped says so in the drawer and the tooltip, its worker is greyed in the queue line, and its name tag is dashed and grey. A skipped task has no figure: its desk stands grey and empty, with its name tag, in rows under the queue line, and the desk is its button. The run's badge, the run list and the scene's sign read `finished, N skipped`; the tab title starts with ✓, and the notification says `Queue finished, N skipped: D of T tasks DONE`.

## Check tooling

The checks of this spec run against the tooling of the earlier specs in `%TEMP%\task-queue-monitor-fixtures` (see the parallel-tasks README). Ticket 01 added:

- `check-admin.mjs`: `node check-admin.mjs [scenario...]` starts a monitor on port 4849 over `admin-root\` with the stub `claude` first in `PATH`, and plays `security`, `pause`, `cancel-pause`, `group`, `lock`, `old` and `unreadable` with the real runner: requests in, then `/api/run`, `progress.log`, the stub's calls, the lock file and the repository. Continue opens real runner windows; the check closes them at the end. About four minutes.
- `setup-admin-ui.mjs`: run folders under `admin-root\AdminUI` for checking the page's controls by hand in the browser pane (a monitor on port 4850 over `admin-root`, with the stub first in `PATH`).
- The stub `claude` learned `hold:<file>` (stay working until `<file>` appears beside the plan), and finds a run folder's `plan.json` by itself when no `STUB_PLAN` is set, as for a runner the monitor launched.
- `check-parallel.mjs` expects the new `admin` field in every run answer.

Ticket 02 added the `skip` scenario (skip and un-skip of a pending task, refusals, the `SKIPPED` report, the final line, the run list, a re-run) and `skip-group` (a group left with one task, a group passed over, a group of three left with two, skip refused in a started group, a re-run of a started group that reads no skips) to `check-admin.mjs`, now about six minutes; the `skip` and `skipped` run folders to `setup-admin-ui.mjs`; and `skipPending` and `actions` to the task fields `check-parallel.mjs` expects.

## Status

Ticket 01 is done. Checked: `check-admin.mjs` (all scenarios), the runner checks `check-runner.ps1` and `check-parallel.ps1`, and the monitor checks `check-states.mjs`, `check-http.mjs` and `check-parallel.mjs`, all passing; the page's controls by mouse and keyboard in Claude's browser pane, in light and dark and at 375 px, through a whole pause, cancel, pause, continue cycle on a stub run.

Ticket 02 is done. Checked: `check-admin.mjs` (all scenarios, the new `skip` and `skip-group` among them), `check-runner.ps1`, `check-parallel.ps1`, `check-states.mjs`, `check-http.mjs` and `check-parallel.mjs`, all passing; in Claude's browser pane, on a stub run: Skip with its dialog (Esc cancels only the dialog, Cancel has the focus), Un-skip at once, the focus kept on the button, the greyed workers in the queue line, the grey empty desks, the `skipped` merge sign, the drawer and report of a skipped task, and the `finished, N skipped` badges and sign, in light and dark and at 375 px.
