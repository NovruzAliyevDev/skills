# 03: The Node runner, parallel groups

**What to build:** The rest of `runner.ps1` ported to `runner.mjs`. That is everything about parallel groups:

- checking the groups in `queue.json` and `maxParallel`;
- applying skips to a group;
- worktrees and branches, and the `--parallel-task <id>` child processes, at most `maxParallel` at a time;
- the quiet window of a group's tasks;
- the uncommitted-work check;
- the merge step;
- the conflict session, its resume for a later conflict of the same group, and its undo;
- the removal of merged worktrees and branches.

The monitor recognises a Node runner's parallel children and their sessions, so a group's tasks show their workers and the hard stop kills the whole tree.

Read [spec.md](spec.md) first:

- "Runner", above all the paths and the child processes;
- "Recognising runners and sessions" under "Monitor";
- the port parity scenarios under "Testing Decisions".

Build it on the same seam, against the parallel-task checks of the earlier specs, made portable.

**Blocked by:** 02

**Status:** in-progress

- [x] A group's tasks run in worktrees under `wt/<id>` in the run folder, on `queue/<run folder>/<id>`, each in a `node run.mjs --parallel-task <id>` child started with `process.execPath`, at most `maxParallel` at a time. The session folder inside a worktree matches the queue's folder in the repository.
- [x] For each parallel scenario of the earlier checks (all DONE then merged, one FAILED with nothing merged, uncommitted work left in a worktree, a conflict resolved, a conflict failed and undone, a second conflict resuming the conflict session, a group reduced to one task by skips, a group fully skipped, a bad `parallel` entry, a hard stop during the merge step), the Node runner gives the same `progress.log` messages (timestamps removed), reports, branches, worktrees and git history as `runner.ps1` on Windows.
- [x] A child writes no ticket state. A queue with groups still gets the commit note in its prompts.
- [ ] The monitor shows each parallel task's child and session alive and the merge state, and the hard stop kills the runner, its children and their sessions on both platforms.
- [ ] The earlier parallel-task checks pass on Windows against the Node runner. On macOS, one queue with a group of two tasks and a forced conflict runs to the end with the stub. The macOS run is recorded in the README of these docs; if no Mac was available, it says so.
