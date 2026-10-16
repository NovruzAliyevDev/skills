# 03: Blockers and order

**What to build:** The picker reads each ticket's `Blocked by` line. It orders the picked tickets so that every blocker runs before the tickets it blocks, and shows that order before Start. When a picked ticket depends on a ticket of its feature that is neither done nor picked, the picker names both in red and blocks Start. The server refuses the same selection. A `Blocked by` line the picker cannot read gives a warning on the ticket and blocks nothing.

Read [spec.md](spec.md) first:

- the blockers paragraph of "Reading tickets";
- the ordering step and the blocker refusal of `new-queue` in "Monitor: server";
- items 4, 6 and 7 of the picker in "Monitor: page";
- the reading and Start-refusal scenarios under "Testing Decisions".

Build it on the same seam, and extend `check-picker.mjs` and its fixture repository: a ticket with an unreadable `Blocked by` line, and blockers given out of number order.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `/api/tickets` gives each ticket its blockers (numbers of tickets in the same feature) and an `unread` flag. A line starting with `None` has no blockers. A line with no number of a ticket of its feature is unread. References to other features are ignored.
- [ ] `new-queue` orders the picked tickets: features alphabetically, then a topological order within each feature, with ties broken by number. `queue.json` and the briefs' task numbers follow that order.
- [ ] A picked ticket with a blocker that is neither picked nor done is refused with 409. The reason names the ticket and the blocker, and nothing is written. With ticket 02 in place, "done" is the effective state; before it, the `Status` line.
- [ ] The picker shows the order of the picked tickets with their task numbers, updated as boxes are ticked. Each blocking problem shows in red under it, and Start stays disabled with the reason. An unread `Blocked by` line shows a warning badge on its ticket.
- [ ] The order and the warnings are checked in Claude's browser pane by keyboard, in light and dark and at 375 px. The earlier checks still pass.
