# Ticket picker: spec and tickets

The design record for starting a queue from a repository's `.scratch` tickets in the monitor, and for the repository's ticket state file.

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets:
  1. [01-register-and-first-picker-queue.md](01-register-and-first-picker-queue.md): blocked by nothing. It also lays the ground: the `ticket-queue` skill, the repository register, the monitor's version, the repository actions, the `ticket` field.
  2. [02-ticket-state-file.md](02-ticket-state-file.md): blocked by 01.
  3. [03-blockers-and-order.md](03-blockers-and-order.md): blocked by 01.
  4. [04-repository-guards-and-mark.md](04-repository-guards-and-mark.md): blocked by 02.
  5. [05-skill-notes-and-real-check.md](05-skill-notes-and-real-check.md): blocked by 02, 03 and 04.

Tickets 02 and 03 do not depend on each other. Both touch `new-queue` and the picker page, though. Run them one after another, in the order above, rather than as a parallel group, to avoid merge conflicts.

## Status

01 is done. Its last criterion is only partly met: the picker queue ran to the end with the stub, but the earlier specs' checks could not be re-run, because their scripts and run folders in `%TEMP%\task-queue-monitor-fixtures` are gone and were not rebuilt.

02 is done. Its last criterion is only partly met, for the same reason as 01's: every stub scenario it names passes in `check-picker.mjs` (failure, skip, hard stop, retry, plus conflict, locks, an unreadable file, chat-flow and parallel runs and a folder outside git), but the earlier specs' checks are still gone and were not re-run.

03 is done. Its last criterion is only partly met, for the same reason: the order, the red blocking problems, the disabled Start and the unread warnings were checked in the browser pane by keyboard, in light and dark and at 375 px, and every `check-picker.mjs` scenario passes, but the earlier specs' checks are still gone and were not re-run. Picked tickets that wait on each other (a cycle) are refused too, by the server and the picker, which the spec does not name. A number right after another feature's name in a `Blocked by` line is read as that feature's and dropped, so `beta 02` never blocks on this feature's 02.

04 is done. Its last criterion is only partly met, for the same reason: every `check-picker.mjs` scenario passes, among them the Start refusals while a runner is starting and alive, Mark and its refusal, a ticket released from a stopped queue and picked again, and a `workDir` matched case-insensitively, but the earlier specs' checks are still gone and were not re-run. In the browser pane the live-runner block, the unfinished-run warning, the unreadable-file warning and the Mark menu were driven by keyboard, in light and dark and at 375 px; the pane was hidden, so the desktop-width screenshots came out cropped and that width was checked through the page's tree and layout instead. A ticket a live runner holds keeps its checkbox when its state allows; only its menu goes. Mark todo of a ticket tied to a run asks first, saying what Continue of that queue would still do, and no Mark is offered while the state file is unreadable.

05 is done. Checked: the `queue-monitor` skill's new step 1 against a stand-in monitor on port 4853 (a node script named `server.mjs` answering version 4): it was stopped and a monitor of version 5 started, a PowerShell process standing in for a runner stayed alive, a second run left the new monitor alone, and a program on the port not running a `server.mjs` was left alive with exit code 1. The README's `ticket-queue` section and the skills' notes by reading; `claude plugin validate .` passes with the plugin at 1.1.0.

## Real check (ticket 05)

Run on 2026-10-16 with real sessions (model `sonnet`, mode `auto`, effort unset), on a scratch repository `%TEMP%\ticket-picker-real-check\RealCheckPicker`: a tiny Node.js library (`add`, one `node --test` test) with a `CLAUDE.md` asking for a test per function and one commit per task, the ticket file included. Its `.scratch` held two features: `math` (01 `multiply`; 02 `divide`, `Blocked by: 01`) and `text` (01 `shout`), each with a `spec.md`, all `ready-for-agent`, committed with the code.

- The skill's steps by hand: `git rev-parse --show-toplevel`, `register.ps1` printing `RealCheckPicker` (into the real register, `%USERPROFILE%\.claude-queues\repos.json`), `ensure-monitor.ps1` starting a version 5 monitor on 4747 (none was running), and the picker opened at `#new:RealCheckPicker` in Claude's browser pane instead of `Start-Process`.
- Picking `math 02` alone showed `math 02 is blocked by math 01 Multiply, which is neither picked nor done.` and Start disabled. With all three picked, the order read `01 math 01 Multiply`, `02 math 02 Divide`, `03 text 01 Shout`. Model `sonnet` typed, then Start.
- At once: the page on the run's view, the run folder `RealCheckPicker\20261016-2137` with `ticket` fields and no groups, the three tickets `queued` and tied to their tasks, `.scratch/queue-state.json*` added to `.git/info/exclude`, `git status` clean. While 01 ran, the picker showed it `running`, the others `queued`, and the live-runner block with Start disabled.
- The queue ran in under two minutes: `All 3 tasks DONE`. The state file said `done` for all three, each still tied to its run and task; each ticket file said `Status: done` with every criterion ticked; `git status` was clean; the history held `Add multiply`, `Add divide` and `Add shout` over the starting commit; the tests passed (5). The picker then showed the three `done`, with no checkbox enabled.

Cost: $0.38 ($0.13, $0.13, $0.12).

Unexpected: the runner writes the state file with Windows PowerShell's `ConvertTo-Json`, so after its first write the file has that cmdlet's wide, ragged indentation instead of the server's two spaces. It stays valid JSON and every reader takes it, but it reads less easily than user story 47 asks. Nothing else was unexpected.

Fixed afterwards: the runner now writes `ConvertTo-Json -Compress` output through a small `Format-Json` that lays it out with two-space indents and a closing newline, the same bytes as the server's `JSON.stringify(doc, null, 2)`. The lock, the temp file and the rename are unchanged, and it runs on PowerShell 5.1. `node check-picker.mjs` passes all 167 checks against it, and a state file written by a real runner queue, with a backslash and a quote in its ticket keys, reads back as valid JSON identical to `JSON.stringify(doc, null, 2)`, with the backslashes escaped.

All five tickets of this spec are done, with the gap noted for 01 to 04: the earlier specs' checks are still gone and were not re-run.
