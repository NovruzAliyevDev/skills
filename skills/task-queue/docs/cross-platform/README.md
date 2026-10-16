# Cross-platform: spec and tickets

The design record for running the plugin on macOS as well as Windows. Every PowerShell script is moved to Node.js, and everything that differs between the two platforms goes into one platform module.

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets:
  1. [01-platform-module-and-helpers.md](01-platform-module-and-helpers.md): blocked by nothing. The platform module, the monitor's OS calls, `register.mjs` and `ensure-monitor.mjs`.
  2. [02-node-runner-sequential.md](02-node-runner-sequential.md): blocked by 01.
  3. [03-node-runner-parallel-groups.md](03-node-runner-parallel-groups.md): blocked by 02.
  4. [04-chat-flow-docs-and-cleanup.md](04-chat-flow-docs-and-cleanup.md): blocked by 03.
  5. [05-real-check-on-both-platforms.md](05-real-check-on-both-platforms.md): blocked by 04.

The tickets form one chain, and each one touches the runner or the server. Run them one after another, not as a parallel group.

Tickets 01 to 03 each end with a check on macOS. A queue running on Windows cannot do that part. When no Mac was available, the ticket records that here, and the Mac checks are made up in ticket 05.

## Status

No ticket started yet.
