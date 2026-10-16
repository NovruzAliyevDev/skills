# 04: The chat flow on both platforms, docs and cleanup

**What to build:** This ticket moves the chat flow of `/task-queue` to Node and finishes the switch:

- `launch.mjs` replaces the PowerShell read-back and the `Start-Process` lines of the skill;
- `runner.ps1` is deleted;
- every check of the earlier specs is portable;
- the README and the plugin say Windows and macOS.

After this ticket, no `.ps1` file and no PowerShell instruction is left in the plugin. The only exceptions are the platform module's Windows calls to `powershell.exe` and the legacy launch of an old `run.ps1`.

Read [spec.md](spec.md) first:

- "Helpers and skills";
- "Old run folders";
- "Out of Scope";
- "Further Notes".

**Blocked by:** 03

**Status:** in-progress

- [x] `skills/task-queue/launch.mjs --check <run folder>` prints `workDir` and whether it exists, and exits 1 naming the problem when `queue.json` does not read or a task has no brief. `launch.mjs <run folder>` does the same check, copies `runner.mjs` and `platform.mjs` in when they are missing, opens the runner's window, and starts or replaces the monitor and opens it.
- [x] The `task-queue` skill's steps 4 and 5 use only `node "<script>" …` commands in `sh` fences. Its run folder layout lists `run.mjs` and `platform.mjs`, and it says `~/.claude-queues`. The `queue.json` example gives `workDir` both as a Windows path with doubled backslashes and as a macOS path.
- [x] `skills/task-queue/runner.ps1` is deleted. A search of the repository finds no `.ps1` file, and `powershell` only in `platform.mjs`, the legacy launch in `server.mjs`, and these docs. It also appears in comments of `runner.mjs` that explain where it keeps the old runner's behaviour, and in the README's note on legacy run folders; those were accepted when the ticket was closed.
- [ ] The checks of the earlier specs (`check-picker.mjs`, `check-admin.mjs`, the parallel-task checks) run on both platforms with `node`, with no `.ps1` and no `powershell.exe` of their own, and pass on Windows.
- [x] The README's requirements say Windows 10/11 or macOS 13+, Node.js, `claude` on the `PATH` and git. Its commands are `node …` commands. Its paths use `~/.claude-queues`, and it has a short macOS note on the Terminal Automation prompt.
- [x] The plugin is `2.0.0` in `plugin.json` and `marketplace.json`, its description names Windows and macOS, and `claude plugin validate .` passes.
