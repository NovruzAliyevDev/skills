# 05: Edit a brief

**What to build:** The Brief tab of a task that has not started has an Edit button. It turns the brief into a text box with Save and Cancel. Save writes the brief, and the session that later runs the task gets the new text. If the task started in the meantime, the save is refused with the reason, and the text the user typed stays in the box. This works for the tasks of a group that has not started. It does not work for a running group's tasks.

Read [spec.md](spec.md) first:

- "Monitor: server" (brief edit, allowed actions);
- "Monitor: page" (task drawer, feedback);
- the brief-edit scenario under "Testing Decisions";
- the brief-edit race under "Further Notes".

Build it test-first on the seam and tooling of ticket 01.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Edit brief is an admin action, allowed only for a task that has not started and is not in a group that has started. Anything else answers 409 with the reason, and the brief file is unchanged.
- [ ] The server writes the brief whole: a temporary file, then a rename. A reader never sees half of it.
- [ ] The server writes an admin line saying the brief was edited. No confirmation is asked.
- [ ] After an edit of a pending task, the next session's prompt carries the new brief.
- [ ] An edit of a running task is refused, and the file is unchanged.
- [ ] Brief text with markdown, raw HTML or a `javascript:` link is stored as typed and still renders inert in the Brief tab.
- [ ] The editor works by keyboard, in light and dark, and at 375 px.
- [ ] The scenarios of tickets 01 to 04 still pass.
