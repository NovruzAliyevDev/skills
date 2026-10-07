# 05: Monitor: the merge sign and the conflict session

**What to build:** The monitor shows what happens between a group and the next task. Each group has a merge sign in the scene that says whether the merge is waiting, running, being resolved by a conflict session, done or failed. When a conflict session exists, it appears as a worker of its own, with live activity and a report in the drawer, and the user gets a notification when a merge conflicts. A queue that stopped in a merge shows why. The ticket ends with the one real check of the whole feature.

Read [spec.md](spec.md) first: "Monitor: server", "Monitor: page", and the last items of "Testing Decisions". The merge and conflict lines the server parses are in the contract in this folder's README, written by tickets 01 and 02.

Check it through the same seam as ticket 04. The fake runner learns to write the merge and conflict lines and to keep a stand-in process for the conflict session.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] The run endpoint reports each group's merge state: waiting, merging, resolving, merged or failed.
- [ ] The conflict session is reported as an extra task-like entry with its state, times, session id, cost, stop reason, and report and log facts. The feed and file endpoints serve its log and report as they serve a task's.
- [ ] Each group has a merge sign in the scene: a focusable control whose accessible name gives the group and the merge state. It shows every state correctly.
- [ ] Activating the merge sign opens the conflict session's drawer when one exists.
- [ ] The conflict session is a worker: at a desk with its helpers while it runs, asleep when its process is gone, then in the done zone or the alert corner.
- [ ] Its drawer shows Activity and Report, including the earlier attempt's report, and has no Brief tab.
- [ ] The task counts, the done count and the tab title do not count the conflict session as a task.
- [ ] A queue stopped by a failed merge shows the run as stopped, the merge sign as failed, and the stop reason on the conflict worker or the sign.
- [ ] A notification fires when a merge conflicts, besides the existing ones.
- [ ] Runs without groups, and runs in the old format, display as before; the checks of ticket 04 still pass.
- [ ] Real check, with real sessions on a scratch repository (the only step that costs money): a queue of three tasks with one group of two, launched through `/task-queue`, once where the group merges cleanly and once where it conflicts. Both are watched in the monitor from start to finish, and what was observed is recorded in this folder's README.
