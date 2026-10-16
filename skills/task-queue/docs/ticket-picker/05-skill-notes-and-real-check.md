# 05: Skill notes, README and the real check

**What to build:** The skills and the README describe the picker. The `queue-monitor` skill replaces an older monitor, as `ticket-queue` does. The plugin's version goes up. One real check with real sessions shows that a queue started from the picker leaves every ticket done, both in the state file and in the ticket files.

Read [spec.md](spec.md) first:

- "The `ticket-queue` skill";
- the real check under "Testing Decisions".

Read [../monitor-admin/README.md](../monitor-admin/README.md) for how the earlier real check was run and recorded.

**Blocked by:** 02, 03, 04

**Status:** done

- [x] The `queue-monitor` skill checks the running monitor's version and replaces an older one, with the same rule as `ticket-queue`: only a process whose command line runs a `server.mjs`.
- [x] The repository README gains `ticket-queue` in the skills table and a section on it: what it does, the picker, the state file and its states, how the file stays out of git, and marking by hand. The `task-queue` section mentions the picker as the other way to start a queue.
- [x] `version` in `.claude-plugin/plugin.json` is raised, and its description names `ticket-queue`. `claude plugin validate .` passes.
- [x] The skills' notes are checked by reading.
- [x] The real check runs on a scratch repository: two features, three tickets in all, one blocked by another. The repository is registered with the skill's steps, and the queue is started from the picker in Claude's browser pane on the monitor at 4747. At the end the state file says `done` for all three, each ticket file says `Status: done` with its criteria ticked, `git status` is clean, and the history holds the tasks' commits. The check, its cost and anything unexpected are recorded in this folder's README.
