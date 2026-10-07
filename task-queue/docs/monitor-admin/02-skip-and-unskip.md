# 02: Skip and un-skip

**What to build:** In the drawer of a task that has not started, the user presses Skip and confirms. When the queue reaches that task, it passes over it. The task gets a `SKIPPED` report, turns grey, and its desk in the scene stays grey and empty. Until the queue reaches it, the task shows as marked to be skipped, and Un-skip undoes the mark.

Skips work inside a group that has not started yet:

- a group left with one task runs that task as an ordinary sequential task, with no worktree;
- a group left with no tasks is passed over with no merge step;
- the tasks of a group that has started cannot be skipped.

A queue that ends with skipped tasks reports "finished, N skipped" in the log, the page and the notification, never "all DONE". A re-run treats skipped tasks as finished.

Read [spec.md](spec.md) first:

- "Control file" (`skip`);
- "Runner" (skip, groups and skip);
- "Progress line contract";
- "Monitor: server" (allowed actions, new derived states);
- "Monitor: page" (task drawer, confirmation, new states in the scene);
- the skip scenarios under "Testing Decisions".

Build it test-first on the seam and tooling of ticket 01.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Skip and Un-skip are admin actions on the endpoint of ticket 01. Skip is allowed only for a task that has not started and is not in a group that has started. Un-skip is allowed only for a task marked to be skipped that has no `SKIPPED` report yet. Anything else answers 409 with the reason.
- [ ] Skip asks for confirmation in a dialog. Un-skip does not.
- [ ] A task listed in `skip` and not DONE gets `results\NN.md` with `SKIPPED` as its first line and a line saying the user skipped it. Its task line reads `SKIPPED (by the user)`, and the runner writes its admin line and prints it in yellow.
- [ ] A skipped task counts as finished on a re-run. Once it has its `SKIPPED` report, it stays skipped.
- [ ] At a group's start, the runner leaves the skipped tasks out of the group:
  - [ ] two or more tasks left: the group runs with them;
  - [ ] one left: that task runs as a sequential task in the main checkout;
  - [ ] none left: the group is passed over, with no worktree and no merge step.
- [ ] Skip entries for a group's tasks are not read again once the group has started.
- [ ] A queue that finishes with skips ends with its own final line in place of "All N tasks DONE". The run answer reports `finished-with-skips`, and the notification says how many were skipped.
- [ ] The run answer gives each task the state `skipped` and the `skipPending` flag, and lists the task actions allowed now. The drawer shows exactly those.
- [ ] A skipped task's desk is grey and empty. A task marked to be skipped is greyed in the queue line. No new sprites.
- [ ] The new controls work by keyboard, in light and dark, and at 375 px.
- [ ] The scenarios of ticket 01 still pass. The new progress lines are added to the contract in this folder's README.
