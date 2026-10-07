# 07: Skill notes and the real check

**What to build:** The skill tells its user, when it launches a queue, that the monitor can stop, pause, continue, skip, retry and edit the briefs of unfinished queues. It also says that a queue is better continued from the monitor than by hand, because the run lock refuses a second runner. Then the whole feature is checked once with real sessions, and the result is recorded in this folder's README.

Read [spec.md](spec.md) first:

- "Skill instructions";
- "Compatibility";
- the real check under "Testing Decisions".

Read the parallel-tasks README's "Real check" section for how the last real check was run and recorded.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The skill's step 5 notes describe the monitor's controls and the advice to continue from the monitor. They no longer call the monitor read-only. The skill's own behaviour does not change.
- [ ] The skill's notes are checked by reading.
- [ ] Real check, on a scratch repository with a `CLAUDE.md` holding commit rules: a queue of three tasks with one group of two, run following the skill's steps 4 and 5 by hand, and watched in Claude's built-in browser pane:
  - [ ] stop during the group, then continue: the killed sessions resume and the group merges;
  - [ ] skip the last task before it is reached: it gets its `SKIPPED` report, and the run finishes with "1 skipped";
  - [ ] make one task fail, then retry it with resume and a note: the resumed session sees the note.
- [ ] This folder's README records the real check: what ran, what was seen, the cost. It also states the tickets' status, and holds the completed progress line contract.
