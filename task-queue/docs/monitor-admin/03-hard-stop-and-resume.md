# 03: Hard stop and resume

**What to build:** The user presses Stop in the header and confirms. Every running session of the queue is killed at once: sequential, parallel and conflict sessions alike. Each cut-off task shows the red stopped mark at its desk. A merge left in progress in the main checkout is undone, so the checkout is clean. A group's worktrees and branches stay where they are.

When the user then presses Continue, each killed task resumes its own session. The session is told that the user stopped it and that it should carry on with its task and write its report. A parallel task resumes in its worktree. Tasks that were already DONE stay DONE, and a merge that was cut off is tried again.

Read [spec.md](spec.md) first:

- "Control file" (`resume`, one-shot entries);
- "Runner" (resume after a hard stop);
- "Progress line contract";
- "Monitor: server" (hard stop, allowed actions);
- "Monitor: page" (header, confirmation, new states in the scene);
- the stop scenarios under "Testing Decisions".

Build it test-first on the seam and tooling of ticket 01. The stub's wait-for-release ability keeps the sessions alive until they are killed.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Stop is an admin action, allowed only while the runner is alive. It asks for confirmation in a dialog.
- [ ] The server finds the runner, its `-ParallelTask` children and their session processes in the process table it already reads, and kills that whole tree. No process of the queue is alive afterwards.
- [ ] For each task that had a running session, the server writes a `resume` entry with the session id and an `id` unique to this request.
- [ ] If a merge was in progress in the main checkout, the server runs `git merge --abort` there. The main checkout is clean afterwards.
- [ ] The server writes its admin lines (which tasks were cut off, and whether a merge was undone), then `Queue - STOPPED (by the user)`. A cut-off task's state is `stopped`, with a reason saying the user stopped it.
- [ ] The run lock left by the killed runner does not stop Continue: its process is dead.
- [ ] On Continue, the runner resumes each task with an unused `resume` entry with the stopped-by-user message, and writes an admin line naming the entry's `id`. A used entry is never applied again. The no-report rule applies.
- [ ] Stop during a group of two, with one task already DONE, leaves both worktrees and branches. Continue resumes only the unfinished task in its worktree, then merges.
- [ ] Stop during a conflict session: Continue tries the merge again.
- [ ] A cut-off task shows the existing red stopped mark at its desk. No new sprites.
- [ ] The scenarios of tickets 01 and 02 still pass. The new progress lines are added to the contract in this folder's README.
