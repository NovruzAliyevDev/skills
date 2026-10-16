# 02: The Node runner, sequential queues

**What to build:** `runner.mjs`, a port of `runner.ps1` for every queue without parallel groups. It covers:

- the run lock;
- the preflight call;
- sessions and the resume-once;
- verdicts, reports and `progress.log`;
- the control file: pause, skip, resume and retry;
- the ticket state writes.

The monitor copies it, with `platform.mjs`, into every new picker run folder as `run.mjs`, and launches it with `node` in a window of its own on both platforms. It recognises Node runners and their sessions. On Windows it keeps recognising and launching legacy `run.ps1` run folders.

After this ticket, a picker queue runs on a Mac from Start to its end.

`runner.ps1` stays in the repository until ticket 04, so that the parity checks below can run against it.

Read [spec.md](spec.md) first:

- "Runner", except parallel groups;
- "Monitor";
- "Old run folders";
- the port parity, lock and legacy scenarios under "Testing Decisions".

Build it on the one seam: the server, the run folder, then `node run.mjs` with the stub `claude` on a throwaway git repository. The stub becomes a Node script in this ticket. On macOS it is an executable `claude`. On Windows it is a `claude.cmd`, alongside the existing `claude.exe` stand-in.

**Blocked by:** 01

**Status:** in-progress

- [x] `skills/task-queue/runner.mjs` imports only Node's built-in modules and `./platform.mjs`. It starts as `node run.mjs`, carries the marker line `// task-queue control contract: 1`, sets the window title by escape sequence, and colours its lines with ANSI codes.
- [x] For each sequential scenario of the earlier checks (DONE, FAILED, no report then resume-once, pause, skip, hard stop then resume on Continue, retry resume and fresh with a note, an unreadable `control.json`, a bad preflight mode), the Node runner gives the same `progress.log` messages (timestamps removed), reports, exit codes and git history as `runner.ps1` on Windows.
- [x] Ticket state writes are the same as `runner.ps1`'s: `running`, `done`, `failed` and `skipped` at the same points, under the state lock, with `JSON.stringify(doc, null, 2)` layout and the exclude line added once. A failure to write goes to `progress.log` only.
- [x] Run lock: a second `node run.mjs` of the same run folder exits 1 with the message. A lock naming a dead pid, or a pid now used by another program, is taken over. When the process table cannot be read, the lock counts as live.
- [x] Sessions get the same environment variables and arguments as before. Their stdout is read as UTF-8 lines into `logs/<id>.jsonl`. A session started through `claude.cmd` receives a title holding `"`, `%`, `&` and `^` unchanged.
- [x] The server's `new-queue` copies `runner.mjs` as `run.mjs` with `platform.mjs`, and launches it with `openWindow`. Continue and Retry launch `run.mjs`. The run view shows a Node runner and its session as alive, and the hard stop kills both. A launch that throws answers 500, writes `admin: launch failed (<message>)`, and leaves the run not starting.
- [ ] On Windows, a legacy run folder still shows, stops, continues and retries through `run.ps1`. On macOS, launching admin actions on it are refused with `this run folder's runner is a PowerShell script`.
- [x] The idle exit counts Node and legacy runners.
- [ ] `check-picker.mjs` passes on Windows against the Node runner. On macOS, a picker queue of two tickets runs to the end with the stub, in a real Terminal window. The macOS run is recorded in the README of these docs; if no Mac was available, it says so.
