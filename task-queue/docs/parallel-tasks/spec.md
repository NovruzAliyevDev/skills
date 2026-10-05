Status: ready-for-agent

# Parallel groups in a task queue

## Problem Statement

A task queue runs its tasks strictly one after another: one headless session at a time, all in the same working tree. That is right when each task builds on the one before it. But queues often hold tasks that have nothing to do with each other (two unrelated tickets in the same repository), and they still wait in line. A queue of five half-hour tickets takes two and a half hours even when three of them could have run side by side.

The user cannot simply start two queues at once on the same repository either: two sessions editing, building, testing and committing in one working tree break each other's builds and collide in git.

The user wants to mark some tasks of a queue as safe to run at the same time, and have the queue run them in parallel without the sessions disturbing each other, then continue in order with everything they produced.

## Solution

The user ends their task list with a group notation such as `[[9,10]]`. The queue still runs in order, but when it reaches task 9 it starts tasks 9 and 10 together. Task 11 starts only after both have finished and their work has been brought together. Several groups are allowed (`[[3,4],[9,10,11]]`); only the user decides what is parallel.

Each task of a parallel group works in its own git worktree on its own branch, created from the queue's branch as it is when the group starts. The sessions build, test and commit there without seeing each other. When the whole group is done, the runner merges the branches back into the queue's branch in task order and removes the worktrees. If a merge conflicts, a separate session resolves the conflict, tests what it touched and commits the merge. If that session cannot, the merge is undone, the queue stops, and nothing is lost.

If a task in a group fails, the others in the group finish their work, then the queue stops. Running the queue again skips what is done and continues the failed task in its own worktree.

The runner window shows only start and finish lines while a group runs. The monitor shows the group live: every parallel task at its own desk with its own helpers, the group's merge step, and the conflict session when there is one.

A queue without groups behaves exactly as it does today.

## User Stories

### Declaring groups

1. As a task-queue user, I want to end my task list with `[[9,10]]`, so that I can say which tasks run in parallel without changing how I write the tasks.
2. As a task-queue user, I want to declare several groups in one queue (`[[3,4],[9,10]]`), so that every independent stretch of the queue can run in parallel.
3. As a task-queue user, I want a group to hold any number of tasks from two up, so that I am not limited to pairs.
4. As a task-queue user, I want only my own notation to make tasks parallel, so that the skill never parallelises tasks I did not mark.
5. As a task-queue user, I want a group with non-consecutive numbers (`[[3,9]]`) refused with a question, so that the order of the queue never becomes ambiguous.
6. As a task-queue user, I want a group of one task, a task named in two groups, or a number that is not in my list refused with a question, so that typos are caught before the queue starts.
7. As a task-queue user, I want the confirmation list to show which tasks form a group, so that I can check the grouping before launch.
8. As a task-queue user, I want to be told before launch when the working directory cannot support groups (not a git repository, no branch checked out), so that the queue does not fail at the first group.
9. As a task-queue user, I want to be told before launch that, in a queue with groups, every task is asked to commit its work, so that I know the queue will create commits.
10. As a task-queue user, I want to set how many sessions may run at once, with a default of 5, so that I can stay within my usage limits.

### Running a group

11. As a task-queue user, I want the tasks before a group to finish before the group starts, so that the group builds on their work.
12. As a task-queue user, I want all tasks of a group to start together when the queue reaches the group, so that they overlap as much as possible.
13. As a task-queue user, I want a group larger than the session limit to start its remaining tasks as running ones finish, so that the limit holds without me splitting the group.
14. As a task-queue user, I want the task after a group to start only when every task of the group is done and merged, so that it sees all of their work.
15. As a task-queue user, I want each parallel task to work in its own worktree and branch, so that sessions never see each other's half-finished changes.
16. As a task-queue user, I want the worktrees inside the run folder, so that everything belonging to a run is in one place.
17. As a task-queue user, I want each parallel session to prepare its own worktree (restore packages, install dependencies) as far as its task needs, so that a backend task does not pay for a frontend install.
18. As a task-queue user, I want a parallel session to be told that it starts in a fresh worktree with no build outputs, so that it does not mistake a missing build for a broken repository.
19. As a task-queue user, I want parallel sessions to read and update untracked project files (tickets, notes) in the main checkout, so that files outside git are neither missing nor lost with the worktree.
20. As a task-queue user, I want parallel sessions forbidden from changing tracked files in the main checkout, so that all code changes arrive through the merge.
21. As a task-queue user, I want a parallel task told which tasks run beside it and that it must not rely on their reports, so that it does not wait for or read unfinished work.
22. As a task-queue user, I want a parallel task to still see the reports of the tasks that ran before the group, so that context from earlier work is kept.
23. As a task-queue user, I want the existing safeguards (no background commands, long foreground timeouts, one resume when a session ends without a report) to apply to parallel sessions too, so that parallel tasks are as reliable as sequential ones.
24. As a task-queue user, I want the preflight to run once per queue, so that groups add no extra cost before work starts.

### Commits and clean trees

25. As a task-queue user, I want every task in a queue with groups told to commit its work, so that a group starts from, and merges into, a committed state.
26. As a task-queue user, I want the queue to stop before a group when the main working tree has uncommitted changes, so that parallel tasks never start from a state that misses earlier work.
27. As a task-queue user, I want a parallel task that reports DONE but leaves uncommitted changes in its worktree treated as stopped, so that no work is silently dropped by the merge.
28. As a task-queue user, I want the runner never to commit on my behalf, so that my repository's commit rules are only ever applied by a session that has read them.

### Merging

29. As a task-queue user, I want the runner to merge a finished group's branches into the queue's branch in task order, so that I never merge by hand.
30. As a task-queue user, I want a plain git merge (fast-forward when possible, a merge commit otherwise), so that the commit hashes named in reports stay valid.
31. As a task-queue user, I want the worktree and branch of a merged task removed, so that finished groups leave nothing behind.
32. As a task-queue user, I want a separate session to resolve a merge conflict, so that the queue can continue without me.
33. As a task-queue user, I want the conflict session to get the briefs and reports of the group's tasks, so that it resolves the conflict knowing what each side intended.
34. As a task-queue user, I want the conflict session to run the tests of what it touched before it commits the merge, so that a hand-written resolution is never committed unchecked.
35. As a task-queue user, I want the conflict session to write its own report, so that I can read how each conflict was resolved.
36. As a task-queue user, I want the merge undone and the queue stopped when the conflict session cannot resolve it or says only I can decide, so that my main working tree is left clean.
37. As a task-queue user, I want the branches and worktrees kept when a merge fails, so that no task's work is lost and I can inspect it.
38. As a task-queue user, I want no automatic build-and-test session after a merge without conflicts, so that parallel groups keep the time they save; I add a test task after the group when I want one.

### Failure and resuming

39. As a task-queue user, I want the other tasks of a group to finish when one of them fails, so that money already spent on them is not wasted.
40. As a task-queue user, I want the queue to stop after the group when any of its tasks did not finish, so that later tasks never build on a missing piece.
41. As a task-queue user, I want nothing merged from a group until all its tasks are done, so that the queue's branch never holds half a group.
42. As a task-queue user, I want running the queue again to skip the group's finished tasks, so that I pay for each task once.
43. As a task-queue user, I want the failed task to continue in its existing worktree, with a pointer to its earlier report, so that its partial work and any fix I made there are kept.
44. As a task-queue user, I want running the queue again after a failed merge to try the merge again, so that I can fix the cause and continue.
45. As a task-queue user, I want the stop message for a parallel task to give the command that opens its session in its worktree, so that I can look at what it did where it did it.
46. As a task-queue user, I want the stop message for a failed merge to name the branches and worktrees that were kept, so that I know where the work is.

### Watching: the runner window

47. As a task-queue user, I want the runner window to show only start, finish and stop lines for the tasks of a running group, so that five sessions do not scroll over each other.
48. As a task-queue user, I want sequential tasks to keep showing every message and tool call in the window, so that queues without groups look as they do today.
49. As a task-queue user, I want the merge steps written to the window and to `progress.log`, so that the running record shows what was merged and when.
50. As a task-queue user, I want every parallel session's full stream still written to its own log file, so that nothing is lost by the quieter window.

### Watching: the monitor

51. As a task-queue user, I want every running task of a group at its own desk, so that I can see the parallel work at a glance.
52. As a task-queue user, I want each desk to show its own task's subagents as helpers, so that I can see which session is fanning out.
53. As a task-queue user, I want the tasks of a group visibly marked as belonging together, so that I can tell a group from the sequential tasks around it.
54. As a task-queue user, I want waiting tasks of a group shown as the group that runs next, so that I can see what will start together.
55. As a task-queue user, I want each group's merge step shown with its state (waiting, merged, conflict being resolved, failed), so that I know why a queue is between tasks or why it stopped.
56. As a task-queue user, I want the conflict session shown like a task, with its live activity, log and report, so that I can follow a conflict being resolved.
57. As a task-queue user, I want a parallel task whose session process is gone shown as asleep at its own desk, so that one lost session is not confused with the others still working.
58. As a task-queue user, I want several failed tasks of one group all shown in the alert corner, so that I see every failure, not only the first.
59. As a task-queue user, I want a browser notification for each task that finishes, for a merge conflict, and when the queue stops, so that I can work elsewhere while a group runs.
60. As a task-queue user, I want the tab title and the done count to stay correct while several tasks run, so that watching from another tab still works.
61. As a task-queue user, I want the commits made in the worktrees to appear in the run's commit list, so that I can connect parallel tasks to their changes.
62. As a task-queue user, I want runs made before this feature to display as they always did, so that my history stays readable.
63. As a keyboard or screen-reader user, I want each parallel worker's accessible name to say that it is at a desk and which group it belongs to, and the merge step to be focusable with its state, so that the group is as readable without sight as with it.

### Compatibility and maintenance

64. As a task-queue user, I want a queue without groups to run exactly as before, so that nothing changes for the queues I already use.
65. As a task-queue user, I want an old run folder to keep working with its own copy of the runner, so that the upgrade does not break a stopped queue I may still resume.
66. As the skill's maintainer, I want the runner checked against a stub `claude` and a throwaway git repository, so that parallel behaviour, merges and conflicts can be verified without spending real sessions.
67. As the skill's maintainer, I want the monitor checked against a fake runner that plays parallel scenarios, so that every group and merge state can be seen without a real queue.

## Implementation Decisions

### Vocabulary

- **Group**: two or more consecutive tasks of a queue that run at the same time.
- **Parallel task**: a task that belongs to a group. Every other task is a **sequential task**.
- **Main checkout**: the queue's working directory, where sequential tasks run and where groups are merged.
- **Queue branch**: the branch checked out in the main checkout when a group starts.
- **Merge step**: what the runner does after all tasks of a group are done: merge each task's branch into the queue branch, in task order.
- **Conflict session**: the headless session that resolves a merge conflict.

### Queue file

- `queue.json` gains two optional fields:
  - `parallel`: a list of groups, each a list of task ids in ascending order, for example `[["09","10"]]`;
  - `maxParallel`: the largest number of sessions running at once. The default is 5.
- A queue file without `parallel` runs exactly as today. `maxParallel` has no effect without groups.
- The runner validates the groups before the first task: each has at least two ids, the ids exist, they are consecutive in the queue's order, and no task is in two groups. An invalid file stops the queue before any session starts.

### Skill instructions

- The task list may end with the group notation. The numbers refer to the user's items in list order.
- The skill resolves the notation to task ids, applies the same validation as the runner, and asks the user about anything it refuses. It never proposes or creates groups itself.
- `maxParallel` is offered with the other settings, default 5.
- The confirmation list marks the groups and, when there are any, states that every task will be asked to commit its work and that the working directory must be a git repository with a branch checked out. The skill checks that condition when it writes the confirmation.
- The closing notes to the user explain: the worktrees are in the run folder; the main checkout must still be left alone while a group runs, because the merge lands there; during a group the window shows only start and finish lines and the monitor shows the rest.

### Runner: order of work

- The runner walks the queue in order. A sequential task runs as today. On reaching the first task of a group, it runs the whole group, then the merge step, then continues after the group's last task.
- Before a group starts, the runner checks the main checkout:
  - it is a git repository with a branch checked out (also checked once before the first task, so a queue with groups fails early);
  - `git status` reports nothing: no modified, staged or untracked files. Otherwise the queue stops with a message that names the cause.
- For each parallel task that is not already done, the runner creates a branch named `queue/<run folder name>/<task id>` and a worktree at `<run folder>\wt\<task id>`, both from the queue branch's current commit. A worktree that already exists from an earlier attempt is reused as it is.
- Each parallel session runs in its own child process of the runner, with the worktree as its working directory. At most `maxParallel` run at once; the rest of the group start as others finish, in task order.
- A parallel session is called as a sequential one is, with these differences:
  - it gets the main checkout as an extra allowed directory, besides the run folder;
  - its prompt adds the parallel notes below;
  - its messages and tool calls are not printed to the window; they still go to its log file.
- The no-report rule applies unchanged: a session that ends cleanly without a report is resumed once.
- After a parallel session reports DONE, the runner checks its worktree with `git status`. Anything uncommitted turns the task into a stop, with a reason that says so.
- A task of a group that fails does not interrupt the others. When every started task of the group has ended, and any still waiting for a slot have run too, the runner stops the queue if any of them is not done. Nothing is merged.

### Runner: prompts

- In a queue with groups, every task's prompt (sequential and parallel) tells the session to commit its work following the repository's own commit rules, and that uncommitted work will stop the queue.
- A parallel task's prompt also says:
  - which tasks run beside it, and that their reports must not be relied on;
  - that it works in a fresh worktree of the repository, without build outputs or installed dependencies, and prepares what its task needs;
  - where the main checkout is; that files the repository does not track (tickets, notes, local settings) are there and are to be read and updated there; that tracked files in the main checkout must not be changed;
  - that work left uncommitted in the worktree is lost.
- Queues without groups keep today's prompt word for word.

### Runner: merge step

- The merge step runs when every task of the group is done. It is also what a re-run performs first when it finds a group fully done but not yet merged.
- A task counts as merged when its branch no longer exists. A done task whose branch exists still needs merging.
- For each unmerged task in task order, the runner runs a plain `git merge` of its branch in the main checkout: a fast-forward when possible, otherwise a merge commit with git's default message. After a successful merge it removes the task's worktree, build outputs included, and deletes the branch.
- On a conflict the runner starts the conflict session in the main checkout, with the merge in progress. Its prompt names the conflicting branch, the briefs and reports of the group's tasks, and tells it to resolve the conflict, run the tests of what it touched, commit the merge, and write its report with DONE or FAILED as the first line. If a decision is only the user's, it reports FAILED instead of guessing.
  - The report is `results\merge-<first id>-<last id>.md` and the log `logs\merge-<first id>-<last id>.jsonl`, named after the group.
  - A group has one conflict session. If a later branch of the same group conflicts too, that session is resumed with the new conflict and rewrites its report to cover both.
  - The no-report rule applies to it as to any session.
- The merge is accepted when the conflict session reports DONE, no merge is in progress, and the main checkout is clean. Otherwise the runner aborts the merge if one is still in progress, stops the queue, and keeps the remaining branches and worktrees. Branches already merged stay merged.
- The runner never commits, rebases or pushes on its own.

### Runner: resuming

- Running the runner again:
  - skips done tasks, sequential or parallel;
  - for a group with unfinished tasks, starts only those, each in its existing worktree, with today's pointer to the earlier attempt's report;
  - for a group that is done but not merged, goes straight to the merge step. An earlier conflict report is kept as the previous attempt, as task reports are.
- The stop message for a parallel task gives the command to open its session from its worktree. The stop message for a merge names the branches and worktrees that were kept.

### Runner: progress record

- Task lines keep today's format (`[index/total] title - starting`, `- session`, `- DONE (...)`, `- STOPPED (...)`, `- already DONE, skipped`), so lines of several running tasks may interleave.
- New lines mark a group's start (which tasks), each branch merged, a conflict and the conflict session's start, session id, DONE or STOPPED, and the merge step's end. Their exact wording is fixed in the runner ticket and is the contract the monitor parses.
- The final "fix the cause" line is written once, after the last task of the group has ended.

### Monitor: server

- The server tells the runner process from its parallel child processes, and attributes each live session process to its task, so that running and no-session are judged per task. The run is no-session only when no running task has a session.
- The server derives, from `queue.json` and the progress record:
  - per task: its group, or none;
  - per group: its task ids and the merge step's state: `waiting` (group not finished), `merging`, `resolving` (conflict session running), `merged`, or `failed`;
  - the conflict session as an extra task-like entry (id, state, start, end, session id, cost, reason, report and log facts) that the feed and file endpoints serve like a task's.
- These are additions to the run endpoint's answer. Existing fields keep their meaning, and a run without groups answers as today.
- The commit list already covers all refs, so commits made on worktree branches appear in it.
- Run folders written by earlier runners are read as before.

### Monitor: page

- The scene has as many desks as there are tasks at a desk (running, no-session or interrupted), each with its own helper spots. Desks beyond one row wrap; workers are never shrunk.
- Each desk's helpers come from that task's own feed. The helper limits per desk are unchanged.
- The alert corner holds every failed or stopped task, not at most one.
- The tasks of a group share a visible group mark: in the queue line while they wait, at their desks while they run.
- Each group has a merge sign in the scene: a focusable control whose accessible name gives the group and the merge state. Activating it opens the conflict session's drawer when one exists.
- The conflict session, once it exists, is a worker of its own: at a desk while it runs, then in the done zone or the alert corner. Its drawer shows Activity and Report; it has no Brief.
- A parallel worker's accessible name adds its group to the existing parts.
- Notifications: one per finished task as today, one when a merge conflicts, and the existing ones when the queue finishes or stops. None per group.
- The tab title, done count and run-state sign count tasks only; the conflict session is not a task in those counts.

### Compatibility

- A run folder holds its own copy of the runner, so existing run folders keep their behaviour. The handoff rule stands: before re-running an old folder with the new runner, copy the runner in.
- The runner stays Windows PowerShell 5.1 compatible.

## Testing Decisions

- A good check drives only real inputs and asserts only on what a user or the next program can observe. It never reaches into the runner's functions or the page's modules.
- There are two seams, both existing ones, extended:
  1. **Run folder + `claude` on the PATH + a git repository → the runner's observable results.** Inputs: a `queue.json`, briefs, a stub `claude`, a throwaway git repository as the working directory. Observed: `progress.log`, the reports, the stub's record of calls (arguments, working directory, environment), and the repository's state (branches, worktrees, commit graph, working tree status).
  2. **Run folder → monitor.** Inputs: a run folder written the way the runner writes it, plus live or absent runner and session processes. Observed: the API answers, and the page in Claude's built-in browser pane (accessibility tree, text, screenshots).
- The skill's instructions have no automated seam. They are checked by reading, and once by a real small queue on a scratch repository, which costs real sessions.
- Prior art: the runner checks and the monitor fixtures built for the runner fix and the pixel monitor (a stub `claude` and `check-runner.ps1` with six scenarios; static run folders, a fake runner with scenarios, state and HTTP checks). They live outside the repository in a temp folder and may be gone; if so they are rebuilt from the pixel-monitor spec's "Testing Decisions" and this section. Nothing is committed, as before.
- Runner checks (seam 1). The stub gains what a parallel session can do: commit a change in its working directory, leave a change uncommitted, wait for a release file, and resolve or refuse a conflict. Scenarios:
  - a queue without groups behaves as before (the six existing scenarios still pass);
  - a group of two: both sessions are alive at the same time (each waits until the other has started), each in its own worktree and branch, with the main checkout as an allowed directory; after the group the queue branch holds both commits, worktrees and branches are gone, and the next task starts after the merge;
  - `maxParallel` smaller than the group: never more sessions alive than the limit;
  - one task FAILED: the other finishes, the queue stops, nothing is merged, both worktrees remain; a re-run starts only the failed task, in the same worktree, then merges;
  - DONE with an uncommitted change: the task is stopped with that reason;
  - a dirty main checkout before the group: the queue stops before any parallel session starts;
  - a conflict resolved by the conflict session: the merge is committed, the report exists, the queue continues;
  - a conflict the session refuses: the merge is aborted, the main checkout is clean, branches and worktrees remain, the queue stops; a re-run tries the merge again;
  - a second conflict in a group of three resumes the same conflict session;
  - an invalid `parallel` field, and a working directory that is not a git repository, stop the queue before the first session;
  - prompts: with groups, every task's prompt carries the commit instruction and parallel tasks carry the parallel notes; without groups, the prompt is unchanged.
- Monitor checks (seam 2). The fake runner gains commands to start and finish tasks side by side, with one stand-in session process per running task, and to write the group and merge lines. Checks:
  - the API reports groups, per-task states and each merge state for every scenario;
  - the page shows one desk per running task with its own helpers, the group mark, the merge sign in every state, the conflict session as a worker with a working drawer, several workers in the alert corner, and one sleeping desk when a single session is lost;
  - a static run folder from before this feature displays as before;
  - notifications are not checked in the pane, as before.
- One real check at the end, with real sessions on a scratch repository: a queue of three tasks with one group of two, once without and once with a conflict. It is the only check that costs money.

## Out of Scope

- A dependency graph between tasks, or groups of non-consecutive tasks.
- The skill suggesting or choosing groups.
- Running several queues at once on one repository.
- Parallel tasks in the same working tree without worktrees.
- A setup command in `queue.json` that prepares worktrees; sessions prepare their own.
- Copying untracked files into worktrees.
- An automatic build or test session after a merge without conflicts.
- Rebasing, cherry-picking, squashing or pushing by the runner.
- Killing the other sessions of a group when one fails.
- Retrying a failed task automatically.
- Handling of usage limits beyond `maxParallel`.
- Any control over a queue from the monitor; it stays read-only.
- A committed test suite or committed fixtures.

## Further Notes

- This spec comes from a design interview with the user; the decisions above are theirs, except for these defaults chosen while writing, which can be overruled:
  - "clean" before a group means that `git status` reports nothing, untracked files included;
  - one conflict session per group, resumed for a later conflict in the same group. The user confirmed the report name `merge-09-10.md`; this keeps that name valid for groups of three or more;
  - the merge is shown in the monitor as a sign in the scene and the conflict session as a worker. The interview said "a line in the side panel", but the page has no task list outside the scene;
  - the merge states' names, and the conflict session being left out of the task counts;
  - the runner validating `parallel` itself, in addition to the skill.
- Time cost of a worktree, estimated from repository size and not measured: for the user's largest repository (about 8,400 tracked files, 34 .NET projects and an Angular app), about 3 to 6 minutes per backend task (checkout, restore, a full first build) and 6 to 14 minutes when the task needs the frontend's dependencies installed. Parallel builds also share the CPU. Groups pay off for tasks that run well over 10 minutes.
- That repository ignores its `docs/` and `tasks/` folders in git, which is why parallel sessions get the main checkout as an allowed directory.
- Worktree paths are about 15 characters longer than the main checkout's. No path-length problem is expected, but a repository with very deep paths could hit the Windows limit.
- Suggested tickets, in build order: the runner; the skill instructions and queue file; the monitor. The first is checkable for free with the stub; the last depends on the first's progress lines.
