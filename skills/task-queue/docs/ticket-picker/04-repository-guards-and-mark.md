# 04: Repository guards and marking tickets by hand

**What to build:** The picker guards the repository's working tree. While a runner of any queue of this repository is alive or starting, Start is blocked and says why. When the repository has an unfinished queue whose runner is not alive, the picker warns and links to it, but Start stays possible. Each ticket gets a small menu with Mark done or Mark todo. It records work done outside a queue, or releases a ticket from a queue the user will not continue. The menu is not offered for a ticket a live runner is working through.

Read [spec.md](spec.md) first:

- the repository's runs in `/api/tickets`, the live-runner refusal of `new-queue`, and `mark` in "Monitor: server";
- items 2 and 4 of the picker in "Monitor: page";
- "Further Notes";
- the Start-refusal and Mark scenarios under "Testing Decisions".

Build it on the same seam, and extend `check-picker.mjs`.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `/api/tickets` reports the repository's runs: those whose `queue.json` `workDir` matches the repository's path case-insensitively. It says whether any runner of them is alive or starting, and lists the unfinished ones whose runner is not.
- [ ] `new-queue` answers 409 while a runner of the repository is alive or starting, and writes nothing.
- [ ] `mark` with `done` or `todo` writes a manual entry, dropping any `run` and `task`. It answers 409 for a ticket held by a live or starting runner. A manual entry is never rewritten by the run reconciliation.
- [ ] A ticket marked `todo` out of a stopped queue can be picked into a new queue.
- [ ] The picker shows the live-runner block with Start disabled, the unfinished-run warning with its link, and the unreadable state file warning. Each ticket's menu offers Mark done or Mark todo as its state allows, and has no menu while a live runner holds it.
- [ ] The guards and the menu are checked in Claude's browser pane by keyboard, in light and dark and at 375 px. The earlier checks still pass.
