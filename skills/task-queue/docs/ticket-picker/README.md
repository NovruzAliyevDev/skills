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

No ticket is done yet.
