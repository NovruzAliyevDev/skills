# 01: The platform module, and the monitor and its helpers on macOS

**What to build:** The tracer bullet. It adds the platform module and routes every OS call of the monitor through it. It also replaces the two PowerShell helpers of `ticket-queue` with Node scripts. After this ticket, on a Mac, `/ticket-queue` registers the repository, starts the monitor and opens the picker. `/queue-monitor` restarts an old monitor. The monitor lists processes, kills them and opens the browser. On Windows everything behaves as before.

The runner is still `runner.ps1` in this ticket. On a Mac, the picker's Start therefore writes the run folder and fails to launch, with the macOS refusal reason from the spec's Monitor section. Ticket 02 makes it run.

Read [spec.md](spec.md) first:

- "Vocabulary";
- "The platform module";
- "Monitor", except the parts about `run.mjs` and the Node runner;
- "Helpers and skills", for `register.mjs`, `ensure-monitor.mjs` and the `ticket-queue` and `queue-monitor` instructions;
- the platform module scenarios under "Testing Decisions".

Build it test-first. Call the platform module's functions directly. Run the helpers and the server as processes. Make `check-picker.mjs` portable as far as this ticket's parts go: paths from `os.tmpdir()` and `path.join`, and `register.mjs` instead of `register.ps1`.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] `skills/task-queue/platform.mjs` exports `processTable`, `killProcesses`, `portOwner`, `openWindow`, `startHidden`, `openUrl`, `claudeCommand` and `samePath`, with a Windows branch and a macOS branch each, and imports only Node's built-in modules. On any other platform, the window and browser functions throw `not supported on <platform>`.
- [x] `processTable()` lists the caller's own process with its parent, name, command line and a creation value that grows with time. On Windows, `claudeCommand()` finds a `claude.exe` and a `claude.cmd`, and an argument holding `"`, `%`, `&` and `^` reaches a `.cmd` stub unchanged.
- [ ] The server takes its process table, kills, browser opening and `samePath` from the platform module. No `powershell.exe`, `taskkill` or `cmd.exe` call is left in `server.mjs`. The hard stop kills a stand-in runner's tree on both platforms.
- [x] `register.mjs <path>` behaves as `register.ps1` did: the same output, the same register file, CamelCase names, a number for a taken name, and a whole-file write. Its queue root defaults to `~/.claude-queues`. `register.ps1` is deleted.
- [ ] `ensure-monitor.mjs [--port N] [--open <hash>]` behaves as `ensure-monitor.ps1` did, with the same messages and exit codes: an older monitor is replaced only when it runs a `server.mjs`, a stand-in runner stays alive, and a foreign program on the port is reported and left alone. With `--open` it opens the URL once the monitor answers. `ensure-monitor.ps1` is deleted.
- [x] `ticket-queue` and `queue-monitor` instructions run only `node "<script>" …` commands, in `sh` fences, and say `~/.claude-queues`.
- [x] The server's `VERSION` is 6.
- [ ] On Windows, `check-picker.mjs` passes as before (with the PowerShell runner still in place). On macOS, its scenarios that do not launch a runner pass. The macOS run is recorded in the README of these docs; if no Mac was available, it says so.
