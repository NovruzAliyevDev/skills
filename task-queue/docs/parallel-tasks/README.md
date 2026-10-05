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

The wording of the `progress.log` lines that parallel groups add, as the runner of ticket 01 writes them. Ticket 02 adds the conflict lines. The monitor tickets parse what is written here.

Every line starts with the timestamp and two spaces, as before. A group is named `<first id>-<last id>` after its task ids, for example `09-10`. A branch is `queue/<run folder name>/<task id>`.

| Line | Written when |
|---|---|
| `Group 09-10 - starting (tasks 09, 10)` | The group's sessions are about to start. It lists every task of the group, also on a re-run that starts only some of them. |
| `Group 09-10 - STOPPED (<reason>)` | The group ends without a merge step. The reasons: `the main checkout <path> has uncommitted or untracked files; commit or remove them`, `no worktree for task <id>: <git's message>`, and `not DONE: <ids>; nothing was merged`. |
| `Group 09-10 - merging` | The merge step starts: every task of the group is done. |
| `Group 09-10 - merged 09 (branch queue/<run>/09)` | That task's branch is merged, and its worktree and branch are removed. |
| `Group 09-10 - merge DONE` | The merge step ends with every branch merged. |
| `Group 09-10 - merge STOPPED (<reason>)` | The merge step fails. The reasons: `conflict merging task <id>, branch <branch>; the merge was undone`, and `git merge of task <id>, branch <branch>, failed: <git's message>`. |
| `Kept: task 10, branch queue/<run>/10, worktree <path>` | After `merge STOPPED`, once for each task of the group that is not merged. |
| `Group 09-10 - could not remove the worktree <path>; remove it by hand` | A merged task's worktree folder could not be deleted, before its `merged` line. The merge step goes on. |

Task lines keep their format. Inside a group:

- the lines of its tasks interleave, between `starting` and `merging`;
- a task that is done on a re-run writes `[i/n] <title> - already DONE, skipped` before the group's `starting` line;
- a parallel task has two more stop reasons: `STOPPED (report status 'DONE', but <n> uncommitted change(s) left in the worktree)`, where the report still starts with `DONE` and the next run starts the task again in its worktree; and `STOPPED (the runner failed: <message>)`, when the child process itself failed;
- `Open the session: cd "<path>"; claude --resume <id>` gives the task's worktree.

Every stop ends with one line that starts with `Fix the cause`, as before: after `Group ... - STOPPED`, after the `Kept:` lines, and after these two lines, which are written before the preflight:

- `queue.json: <problem>.` for an invalid `parallel` or `maxParallel` field;
- `Parallel groups need a git repository, and <path> is not one.` or `Parallel groups need a branch checked out in <path>, and none is.`

The session of a parallel task runs in a child process of the runner, whose command line is the runner's own followed by `-ParallelTask <task id>`: `powershell.exe -NoProfile -File "<run folder>\run.ps1" -ParallelTask "09"`.

## Status

Ticket 01 is done. The `Status:` line and checkboxes inside the ticket file are as they were written and were not updated.

## Check tooling

The runner and monitor checks run against tooling kept outside the repository, in `%TEMP%\task-queue-monitor-fixtures` (its own README documents it). That is deliberate: no fixtures or test suites are committed. The folder is temporary and may be gone; if so, rebuild it from the "Testing Decisions" of this spec and of the pixel-monitor spec.

The runner checks are in its `runner-check` folder: `check-runner.ps1` (the six scenarios from before groups) and `check-parallel.ps1` (groups, worktrees, merges, stops and re-runs, against throwaway git repositories). Both use the stub `claude` there and cost nothing.
