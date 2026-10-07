# 04: Monitor: parallel tasks at their own desks

**What to build:** While a group runs, the monitor shows it as it is: every running task of the group at its own desk with its own helpers, the group's tasks marked as belonging together, a task whose session is gone asleep at its own desk while the others keep typing, and every failed task of the group in the alert corner. Counts, the tab title and per-task notifications stay correct with several tasks running. Runs written before this feature look as they always did. The merge step and the conflict session come in ticket 05.

Read [spec.md](spec.md) first: "Monitor: server", "Monitor: page", and the monitor checks under "Testing Decisions". The progress lines the server parses are the contract written down in this folder's README by ticket 01. The pixel-monitor spec describes the scene this ticket extends.

Check it through the spec's second seam: fixture run folders and the fake runner on a side port, observed through the API and in Claude's built-in browser pane. Never use port 4747 or the real queue root. The fake runner learns to start and finish tasks side by side, keeping one stand-in session process per running task, in the process shape the real runner uses for a group.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The server tells the runner process from the child processes of its parallel tasks and attributes each live session process to its task.
- [ ] Running, no-session and interrupted are judged per task. The run is no-session only when no running task has a session.
- [ ] The run endpoint reports each task's group and the list of groups with their task ids. A run without groups answers exactly as before.
- [ ] The scene shows one desk per task at a desk, each with its own helper spots; desks beyond one row wrap, and workers are never shrunk.
- [ ] Each desk's helpers follow that task's own feed, with the existing limits per desk.
- [ ] The tasks of a group carry a visible group mark, in the queue line while they wait and at their desks while they run.
- [ ] A parallel worker's accessible name adds its group to the existing parts.
- [ ] With one session of a running group gone, only that task's worker sleeps at its desk.
- [ ] Two failed tasks of one group both stand in the alert corner.
- [ ] Tasks that finish while their siblings still run walk to the done zone and celebrate, as sequential ones do.
- [ ] The tab title, the done count and the run-state sign are correct while several tasks run.
- [ ] A finished task gives one notification as before; none is added per group.
- [ ] The commits made on the worktree branches appear in the run's commit list.
- [ ] The existing static fixture runs, written in the old format, display as before, and the existing state and HTTP checks pass.
- [ ] Checked in light and dark, and at phone width, with a group of five running.
