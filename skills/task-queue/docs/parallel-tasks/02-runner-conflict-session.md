# 02: Runner: the conflict session

**What to build:** When merging a group's branch conflicts, the queue no longer stops at once. The runner starts a conflict session in the main checkout, with the merge in progress. That session resolves the conflict knowing what each task intended, runs the tests of what it touched, commits the merge and writes its report; the runner then continues with the remaining branches and the rest of the queue. When the session cannot resolve it, or reports that only the user can decide, the merge is aborted, the queue stops, and the unmerged work stays in its branches and worktrees. Running the queue again tries the merge again.

Read [spec.md](spec.md) first: "Runner: merge step", "Runner: resuming", "Runner: progress record", and the conflict scenarios under "Testing Decisions".

Build it test-first on the tooling of ticket 01. The stub `claude` learns to resolve a conflict and commit the merge, and to refuse.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] On a conflict, a session starts in the main checkout with the merge in progress. Its prompt names the conflicting branch and the briefs and reports of the group's tasks, and asks it to resolve, test what it touched, commit the merge and write its report.
- [ ] The report is `results\merge-<first id>-<last id>.md` with DONE or FAILED as its first line, and the log is `logs\merge-<first id>-<last id>.jsonl`.
- [ ] The conflict session runs with the queue's permission mode, model and effort, and with the same background-command settings and single resume after a missing report as a task's session.
- [ ] After a DONE report with no merge in progress and a clean main checkout, the runner removes that task's worktree and branch, merges the remaining branches, and continues the queue.
- [ ] After a FAILED report, an error, or a DONE report that leaves a merge in progress or a dirty main checkout, the runner aborts any merge still in progress, stops the queue, and keeps the unmerged branches and worktrees. Branches merged before the conflict stay merged.
- [ ] In a group of three, a second conflict resumes the same conflict session, and its report covers both conflicts.
- [ ] Running the queue again after a failed merge tries the merge again; the earlier conflict report is kept as the previous attempt.
- [ ] `progress.log` and the window get lines for the conflict, the conflict session's start, session id, DONE (with cost) or STOPPED. Their wording is added to the contract in this folder's README.
- [ ] The stop message of a failed merge names the kept branches and worktrees and gives the command that opens the conflict session.
- [ ] The scenarios of ticket 01 and the six original scenarios still pass.
