# 02: The ticket state file

**What to build:** The repository's `.scratch/queue-state.json` follows its tickets through a queue. Pressing Start marks the picked tickets `queued`. A ticket turns `running` when its session starts, then `done`, `failed` or `skipped` when the session reports. A ticket cut off by a hard stop turns `failed`, and a retried or continued ticket turns `running` again. The picker shows each ticket's state as a badge. Tickets that are done, queued or running cannot be picked, and queued and running ones link to the run holding them. The state file never shows up in `git status`. When the file and a run disagree, the run wins.

Read [spec.md](spec.md) first:

- "The ticket state file", all of it;
- "Runner";
- "Changes to existing actions" under "Monitor: server";
- the state scenarios under "Testing Decisions".

Build it on the same seam as ticket 01, and extend `check-picker.mjs`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The state file has the spec's shape. A writer creating it first adds `.scratch/queue-state.json*` to the repository's `info/exclude` (from `git rev-parse --git-path info/exclude`) once. `.gitignore` is untouched, a folder outside git gets no line, and `git status` stays clean through a whole queue.
- [ ] The server and the runner write under the lock file: created only if absent, retried up to 10 s, and taken over after 60 s. Each writer changes only its own entries and writes through a temporary file and a rename. Two writers at once both land their entries.
- [ ] Start writes `queued` entries tied to the new run and its task ids.
- [ ] The runner writes `running` at a task's `starting` line, its verdict (`done` or `failed`) at its end, and `skipped` when a skip is applied. A retried or resumed task writes `running` again. A runner of a run folder without `ticket` fields never touches a state file, and neither does a `-ParallelTask` child.
- [ ] A runner that cannot write logs `ticket state: could not update <key> (<why>)` and goes on.
- [ ] The hard stop writes `failed` for each task of a picker queue it cut off.
- [ ] The effective state follows the spec's order. A tied entry follows its run's task through the mapping and is rewritten when it differs. A manual entry is taken as it is. With no entry, the ticket's `Status` line decides. A task pending in a stopped or paused run stays `queued`.
- [ ] A state file that is not valid JSON is read as empty, shown in `/api/tickets` as unreadable with its reason, and never overwritten by any writer.
- [ ] Picking a `queued` or `running` ticket answers 409 and writes nothing.
- [ ] The picker shows the state badge on each ticket. Done, queued and running tickets have their checkbox disabled, and queued and running ones link to their run. The badges are checked in Claude's browser pane in light and dark and at 375 px, and update while a queue runs.
- [ ] With the stub, a queue whose second ticket fails leaves the first `done`, the second `failed` and the third `queued`. A skip, a hard stop and a retry each give the state the spec names. The earlier checks still pass.
