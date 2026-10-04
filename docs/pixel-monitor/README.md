# Pixel monitor: spec and tickets

The design record for the pixel-art rebuild of the task-queue monitor (`monitor/`).

- [spec.md](spec.md): problem, user stories, implementation decisions, testing plan.
- Tickets, in build order (each is blocked by the one before):
  1. [01-fixtures-and-static-office-scene.md](01-fixtures-and-static-office-scene.md)
  2. [02-full-static-monitor.md](02-full-static-monitor.md)
  3. [03-living-scene-and-launch.md](03-living-scene-and-launch.md)

## Status

All three tickets are done: 01 in `f5bffe7`, 02 in `fef888d`, 03 in `00ca98c`. The `Status:` lines and
checkboxes inside the ticket files are as they were written and were not updated.

## Fixtures

The checks ran against fixtures (static run folders, a fake runner, HTTP and state checks) that are kept
outside the repo, in `%TEMP%\task-queue-monitor-fixtures`. That is deliberate: the spec rules out committed
fixtures and test suites. The folder is temporary and may be gone; if so, rebuild the tooling from the
spec's "Testing Decisions".
