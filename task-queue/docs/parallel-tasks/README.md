# Parallel groups: spec and tickets

The design record for running some tasks of a queue at the same time, each in its own git worktree.

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets:
  1. [01-runner-group-in-worktrees.md](01-runner-group-in-worktrees.md): blocked by nothing.
  2. [02-runner-conflict-session.md](02-runner-conflict-session.md): blocked by 01.
  3. [03-skill-group-notation.md](03-skill-group-notation.md): blocked by 01.
  4. [04-monitor-parallel-desks.md](04-monitor-parallel-desks.md): blocked by 01.
  5. [05-monitor-merge-and-conflict-session.md](05-monitor-merge-and-conflict-session.md): blocked by 02 and 04.

After 01, tickets 02, 03 and 04 do not depend on each other. They touch different files (runner, skill instructions, monitor), except that 02 and 04 both add to this README.

## Progress line contract

The wording of the `progress.log` lines that parallel groups add, as the runner of tickets 01 and 02 writes them. The monitor tickets parse what is written here.

Every line starts with the timestamp and two spaces, as before. A group is named `<first id>-<last id>` after its task ids, for example `09-10`. A branch is `queue/<run folder name>/<task id>`.

| Line | Written when |
|---|---|
| `Group 09-10 - starting (tasks 09, 10)` | The group's sessions are about to start. It lists every task of the group, also on a re-run that starts only some of them. |
| `Group 09-10 - STOPPED (<reason>)` | The group ends without a merge step. The reasons: `the main checkout <path> has a merge in progress; commit it or run git merge --abort`, `the main checkout <path> has uncommitted or untracked files; commit or remove them`, `no worktree for task <id>: <git's message>`, and `not DONE: <ids>; nothing was merged`. |
| `Group 09-10 - merging` | The merge step starts: every task of the group is done. |
| `Group 09-10 - merged 09 (branch queue/<run>/09)` | That task's branch is merged, and its worktree and branch are removed. |
| `Group 09-10 - merge DONE` | The merge step ends with every branch merged. |
| `Group 09-10 - conflict merging 10 (branch queue/<run>/10)` | Merging that task's branch conflicts. The merge stays in progress in the main checkout for the conflict session. |
| `Group 09-10 - conflict session - starting` | The conflict session is called for that conflict. A group has one conflict session: a second conflict in the group writes this line again and resumes the same session. |
| `Group 09-10 - conflict session - session <id>` | The conflict session's id, once per run of the queue. |
| `Group 09-10 - conflict session - no report yet, resuming the session once` | The call ended cleanly without writing the report (after a second conflict: without writing it again). |
| `Group 09-10 - conflict session - DONE (session <id>, cost $<n>)` | The conflict is resolved: the report starts with `DONE`, the merge is committed and the main checkout is clean. The task's `merged` line follows. `, cost $<n>` is left out when the cost is unknown; after a second conflict it is the session's whole cost so far. |
| `Group 09-10 - conflict session - STOPPED (<reason>)` | The conflict is not resolved. The reasons: `exit code <n>, error flag <True or False>, report status '<first line>'`, as for a task, with `, but the report was not written again` added when the report is still the one from an earlier conflict of the group; `the runner failed: <message>`; and, for a report that starts with `DONE`, `report status 'DONE', but the merge is still in progress`, `report status 'DONE', but branch <branch> is not merged`, and `report status 'DONE', but <n> uncommitted change(s) left in the main checkout`. `Report: <path>` (when the session wrote it for this conflict) and `Log: <path>` follow, then `merge STOPPED`. |
| `Group 09-10 - merge STOPPED (<reason>)` | The merge step fails. The reasons: `conflict merging task <id>, branch <branch>; the merge was undone`, when the runner put the main checkout back at its commit before this merge (`git reset --hard` and `git clean -fd`) because the conflict session left the merge in progress, committed it, or left changes behind; `conflict merging task <id>, branch <branch>; no merge was left to undo`, when the conflict session gave up the merge itself and left the main checkout clean; `conflict merging task <id>, branch <branch>; the merge could not be undone: <git's message>`, or `...: the main checkout is no longer on <queue branch>` when the conflict session switched branches; and `git merge of task <id>, branch <branch>, failed: <git's message>`. |
| `Kept: task 10, branch queue/<run>/10, worktree <path>` | After `merge STOPPED`, once for each task of the group that is not merged. |
| `Open the conflict session: cd "<main checkout>"; claude --resume <id>` | After the `Kept:` lines, when a conflict session ran in this merge step and got a session id. |
| `Group 09-10 - could not remove the worktree <path>; remove it by hand` | A merged task's worktree folder could not be deleted, before its `merged` line. The merge step goes on. |

Task lines keep their format. Inside a group:

- the lines of its tasks interleave, between `starting` and `merging`;
- a task that is done on a re-run writes `[i/n] <title> - already DONE, skipped` before the group's `starting` line;
- a parallel task has two more stop reasons: `STOPPED (report status 'DONE', but <n> uncommitted change(s) left in the worktree)`, where the report still starts with `DONE` and the next run starts the task again in its worktree; and `STOPPED (the runner failed: <message>)`, when the child process itself failed;
- `Open the session: cd "<path>"; claude --resume <id>` gives the task's worktree.

The conflict session's report is `results\merge-<first id>-<last id>.md` and its log `logs\merge-<first id>-<last id>.jsonl`, for example `merge-09-10.md`. A re-run that meets a conflict again starts a new conflict session and keeps the earlier report as `results\merge-<first id>-<last id>.previous.md`.

Every stop ends with one line that starts with `Fix the cause`, as before: after `Group ... - STOPPED`, after the `Kept:` lines, and after these two lines, which are written before the preflight:

- `queue.json: <problem>.` for an invalid `parallel` or `maxParallel` field;
- `Parallel groups need a git repository, and <path> is not one.` or `Parallel groups need a branch checked out in <path>, and none is.`

The session of a parallel task runs in a child process of the runner, whose command line is the runner's own followed by `-ParallelTask <task id>`: `powershell.exe -NoProfile -File "<run folder>\run.ps1" -ParallelTask "09"`.

## Status

Tickets 01 to 04 are done. Ticket 05 is done except its last item, the real check with real sessions on a scratch repository, which costs money and has not been run yet. The `Status:` lines and checkboxes inside the ticket files are as they were written and were not updated.

## Check tooling

The runner and monitor checks run against tooling kept outside the repository, in `%TEMP%\task-queue-monitor-fixtures` (its own README documents it). That is deliberate: no fixtures or test suites are committed. The folder is temporary and may be gone; if so, rebuild it from the "Testing Decisions" of this spec and of the pixel-monitor spec.

The runner checks are in its `runner-check` folder: `check-runner.ps1` (the six scenarios from before groups) and `check-parallel.ps1` (groups, worktrees, merges, conflict sessions, stops and re-runs, against throwaway git repositories). Both use the stub `claude` there and cost nothing.

The monitor checks for groups are `check-parallel.mjs` in the fixtures folder, with the fake runner's group scenarios (`group`, `group-fail`, `group-five`, `group-process`): the fake runner starts each task of a group in a child process `run.ps1 ... -ParallelTask "<id>"` with its own stand-in session, as the real runner does. `check-states.mjs` and `check-http.mjs` still cover the runs without groups.

## Monitor: what ticket 04 added

- `/api/run` answers, for a run whose `queue.json` has groups, `groups` (`[{ id: "09-10", tasks: ["09", "10"] }]`) and each task's `group` (its group's id, or null). A run without groups answers exactly as before.
- The server tells the runner from its `-ParallelTask` child processes: a session of the runner belongs to the sequential task, a session of a child to that child's task. A running parallel task is no-session when its child lives without a session, and interrupted when its child is gone; the run is no-session only when no running task has a session. The runner's `session` field says whether any session lives.
- The scene gives every task at a desk its own desk, in a column under the first one, with its own helpers and "+N" marker; a task keeps its desk while it stays at one. The alert corner holds two workers a row and pushes the done zone down when it needs more. A group's tasks have a band under their feet in the queue line, a plaque on their desk and a name tag framed in the group's colour; their accessible names end with `group <id>` (before the helper count at a desk).
- One notification per finished task, also when several finish between two polls.

## Monitor: what ticket 05 added

- `/api/run` answers, for a run with groups, each group's merge step in `groups`: `merge` (`waiting` until its `merging` line, `merging`, `resolving` from a `conflict merging` line until the conflict session ends, `merged` after `merge DONE`, `failed` after `merge STOPPED`), `merged` (the task ids merged in the current merge step) and `reason` (the `merge STOPPED` reason). A `Queue` line (a re-run) puts every merge that did not end in `merged` back to `waiting`, and marks a conflict session still open then as interrupted: its runner died with it.
- It also answers `conflicts`: one entry per group that had a conflict session, with `id` (`merge-<group>`, the name of its log and report), `kind: "conflict"`, `group`, `title`, `conflictTask` (the task whose branch conflicted last), `state`, `start`, `end`, `sessionId`, `cost`, `reason` and the report and log facts of a task. A `merging` line starts a new merge step: its first conflict starts a new entry, a later one resumes it (same start and session id). A merge step that ends in `merge DONE` without a conflict drops the entry of an earlier attempt, so a finished queue keeps no failed conflict session in the alert corner; its report stays in `results`. The conflict session runs in the runner's own process, so its running, no-session and interrupted are judged as a sequential task's, and it counts for the run's no-session.
- `/api/feed` and `/api/file` take `task=merge-<group>`; `kind=brief` answers 404. `/api/runs` adds, for a run with groups, `conflicts` (how many `conflict merging` lines there are) for the page's notification; its `cost`, and the header's, include the conflict sessions. Task counts and the tab title leave them out.
- The scene has a row of merge signs under the run-state sign, one button per group, edged in the group's colour, coloured and labelled by its merge state ("Merge of group 01-02: resolving a conflict · opens the conflict session"). Its tooltip gives the merged tasks, the conflicting task and the stop reason; activating it opens the conflict session's drawer.
- The conflict session is a worker named "M Merge 01-02": at a desk with its helpers while it runs, asleep when its process is gone, in the done zone or the alert corner after. Its drawer has Activity and Report (with the earlier attempt's), no Brief, and a "Conflict merging" fact.
- A notification fires for every merge conflict.
- The fake runner plays the merge step and the conflict session (`merging`, `merge <n>`, `merge-done`, `conflict <n>`, `resolve`, `refuse`, `rerun`), in the scenarios `merge`, `conflict`, `conflict-refused` and `conflict-killed`; `check-parallel.mjs` checks them.
