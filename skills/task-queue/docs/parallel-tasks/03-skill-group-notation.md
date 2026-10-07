# 03: Skill: the group notation and the queue file

**What to build:** A user of `/task-queue` ends their task list with `[[9,10]]` and gets a queue that runs those tasks in parallel. The skill reads the notation, refuses what is invalid with a question, shows the groups in the confirmation list, offers the session limit as a setting, writes `parallel` and `maxParallel` into `queue.json`, and tells the user what is different about a queue with groups. A list without the notation is handled exactly as before. The skill never proposes or creates groups on its own.

Read [spec.md](spec.md) first: "Queue file" and "Skill instructions". This ticket changes the skill's instructions only; load the `writing-for-agents` skill before editing them.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The instructions describe the notation: double brackets at the end of the list, numbers that refer to the user's items in list order, several groups allowed.
- [ ] They tell the skill to ask the user, and not to guess, when a group has one task, names a number that is not in the list, has non-consecutive numbers, or shares a task with another group.
- [ ] They say that groups come only from the user's notation.
- [ ] `maxParallel` is offered with the other settings, with its default of 5.
- [ ] The confirmation list marks the groups. When there are groups, it states that every task will be asked to commit its work, and the skill checks that the working directory is a git repository with a branch checked out before showing the list.
- [ ] The `queue.json` example shows the two optional fields, and the instructions say to leave them out when there are no groups.
- [ ] The closing notes tell the user that the worktrees are in the run folder, that the main checkout must be left alone while a group runs because the merge lands there, that the window shows only start and finish lines during a group, and that a merge conflict stops the queue or starts a conflict session, whichever the installed runner does.
- [ ] The instruction file's opening description of the runner still matches what the runner does.
- [ ] The root README's description of the task-queue skill mentions parallel groups.
- [ ] Checked by a dry reading against three lists: one without the notation, one with a valid group, one with each kind of invalid group. For the valid one, a `queue.json` written by following the instructions passes the runner's validation from ticket 01.
