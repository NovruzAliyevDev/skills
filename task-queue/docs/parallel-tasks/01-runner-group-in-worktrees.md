# 01: Runner: a parallel group runs in worktrees and merges cleanly

**What to build:** A queue whose `queue.json` declares a group runs from start to finish: the tasks before the group run in order, the group's tasks run at the same time, each in its own git worktree and branch, the runner merges their branches into the queue branch in task order and removes the worktrees, and the queue continues with the next task. When a task of the group fails, the others finish, the queue stops, and running it again continues the failed task in its worktree. A merge that conflicts is aborted and stops the queue; the conflict session comes in ticket 02. A queue without groups behaves exactly as before.

Read [spec.md](spec.md) first: "Vocabulary", "Queue file", every "Runner:" section, and the runner checks under "Testing Decisions". Everything there applies to this ticket except the conflict session.

Start with the prefactor: make running one task (first call, the single resume, the DONE/STOPPED verdict) something the runner can also do in a child process, with no change in behaviour. The six existing runner scenarios must pass before and after.

Build it test-first against the stub `claude` and a throwaway git repository (the spec's first seam). The check tooling is outside the repository in a temp folder and may be gone; its location and how to rebuild it are in the spec and in the pixel-monitor README.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The six existing runner scenarios pass unchanged after the prefactor and at the end.
- [ ] A queue file without `parallel` produces the same calls, prompt text, window output and `progress.log` lines as before.
- [ ] An invalid `parallel` field (a group of one, an unknown id, non-consecutive ids, a task in two groups) stops the queue before any session starts, with a message naming the problem.
- [ ] With groups, a working directory that is not a git repository, or has no branch checked out, stops the queue before the first task.
- [ ] Before a group, a main checkout where `git status` reports anything stops the queue before any parallel session starts.
- [ ] Each parallel task gets the branch `queue/<run folder name>/<task id>` and the worktree `<run folder>\wt\<task id>`, created from the queue branch's commit at the group's start.
- [ ] The sessions of a group are alive at the same time, each with its worktree as working directory and with the run folder and the main checkout as allowed directories.
- [ ] Never more than `maxParallel` sessions are alive; a larger group starts its remaining tasks, in task order, as others finish. The default is 5.
- [ ] In a queue with groups, every task's prompt carries the commit instruction, and a parallel task's prompt carries the parallel notes from the spec (sibling tasks, fresh worktree, main checkout rules, uncommitted work is lost).
- [ ] The background-command settings and the single resume after a missing report apply to parallel sessions.
- [ ] A parallel task that reports DONE with uncommitted changes in its worktree is stopped, with a reason that says so.
- [ ] After a fully done group, the queue branch holds every task's commits (fast-forward or merge commit, never a rebase), the worktrees and branches are gone, and the next task starts only then.
- [ ] When one task of a group fails, the others run to their end, nothing is merged, the queue stops, and worktrees and branches remain.
- [ ] Running the queue again skips the group's done tasks, runs the failed one in its existing worktree with the pointer to its earlier report, then merges.
- [ ] Running the queue again on a group that is done but unmerged goes straight to the merge.
- [ ] A merge conflict aborts the merge, leaves the main checkout clean, keeps the unmerged branches and worktrees, and stops the queue with a message that names them.
- [ ] While a group runs, the window shows only its start, finish and stop lines; every session's full stream is in its own log file. Sequential tasks still show messages and tool calls.
- [ ] `progress.log` keeps today's task-line format and gains lines for the group's start, each merged branch and the merge step's end. Their wording is written down in this folder's README as the contract for the monitor tickets.
- [ ] The stop message of a parallel task gives the command that opens its session from its worktree.
- [ ] The runner never commits, rebases or pushes, and still runs on Windows PowerShell 5.1.
