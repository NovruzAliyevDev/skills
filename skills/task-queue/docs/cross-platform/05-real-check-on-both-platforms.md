# 05: The real check on macOS and Windows

**What to build:** Nothing new. This ticket runs the plugin as the user will, with real sessions, on a Mac and on Windows, and records what happened. It is the only ticket that costs money.

The Mac part has to be run on a Mac, by the user or by a session running there. When this ticket runs on Windows only, it does the Windows part, writes down exactly what is left for the Mac, and stays not done.

Read [spec.md](spec.md) first: "Testing Decisions", the manual checks and the real check.

**Blocked by:** 04

**Status:** in-progress

The Windows part ran on 2026-10-17; see "Real check (ticket 05)" in [README.md](README.md). Every criterion below names macOS or both platforms, so none is ticked yet. On Windows, everything in them was met except that nobody looked at the runner window's colours, because no screenshot of it could be taken.

- [ ] On each platform, the plugin is installed from this repository, a scratch repository is made (as in the ticket picker's real check: two features, three tickets, one blocked by another), and `/ticket-queue` opens the picker. All three tickets are started with model `sonnet`. At the end, the state file says `done` for all three, each ticket file says `Status: done`, `git status` is clean, and the tasks' commits are in the history.
- [ ] On each platform, a chat-flow `/task-queue` with one parallel group of two tasks runs to the end: both merged, worktrees and branches removed.
- [ ] On macOS: the runner opens in a Terminal window titled with the queue, with coloured lines. The Automation prompt appears on the first launch. After refusing it, the monitor's launch answers the Automation error, and allowing it in System Settings makes Continue work. The browser opens on the picker.
- [ ] On Windows: the runner window, its title and colours are as before. A legacy run folder made before this change still shows, stops and continues.
- [ ] The README of these docs records both runs: the date, the model, the cost, and anything unexpected.
