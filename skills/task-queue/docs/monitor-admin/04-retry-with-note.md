# 04: Retry with a note

**What to build:** The drawer of a failed or stopped task offers Retry, but only while no runner is alive. The user picks how to retry and may add a short note:

- **Resume**: the task's last session is resumed. It is told that its earlier attempt did not finish, gets that attempt's report path, and gets the user's note.
- **From scratch**: a new session starts, as a re-run does today. Before that, the note is appended to the brief under a heading saying it is the user's note for a retry, with the time. The Brief tab then shows the note.

Retry also launches the queue again from that task. A task with no session to resume is offered only the from-scratch mode. A failed parallel task is retried in its own worktree.

Read [spec.md](spec.md) first:

- "Control file" (`retry`, one-shot entries);
- "Runner" (retry);
- "Progress line contract";
- "Monitor: server" (allowed actions, continue);
- "Monitor: page" (task drawer);
- the retry scenarios under "Testing Decisions".

Build it test-first on the seam and tooling of ticket 01.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Retry is an admin action, allowed for a failed or stopped task when no runner is alive. Resume mode is allowed only when the task has a session id. Anything else answers 409 with the reason.
- [ ] Retry writes a `retry` entry with the mode, an `id` unique to this request and the note. It then launches the runner as Continue does. No confirmation is asked.
- [ ] In from-scratch mode with a note, the server first appends the note to the brief under a heading with the time. The file is written whole.
- [ ] Resume mode: the stub is called with `--resume` and the task's last session id. The message includes the earlier report's path and the note.
- [ ] From-scratch mode: the stub starts a new session, and the brief in its prompt ends with the note.
- [ ] The runner writes an admin line with the mode and the entry's `id` when it applies a retry, and prints it in yellow. A used entry is never applied again.
- [ ] A failed parallel task is retried in its existing worktree, and its group is merged after.
- [ ] The drawer's retry form offers the two modes, with resume left out when there is no session, plus a note field. A refused retry shows the reason and keeps the note.
- [ ] The form works by keyboard, in light and dark, and at 375 px.
- [ ] The scenarios of tickets 01 to 03 still pass. The new progress lines are added to the contract in this folder's README.
