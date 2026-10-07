# 01: Pause and Continue

**What to build:** The tracer bullet. The user presses Pause in the monitor's header. The queue finishes its current task, or its current group and that group's merge step, and stops cleanly. The page shows "pausing" until then and "paused" after, and the scene's workers sit and wait under a "PAUSED" heading. Before the pause takes effect, the user can press Cancel pause, and the queue goes on. On a paused, stopped or interrupted queue, Continue opens the runner again in its own visible window, and the queue goes on from the next task.

This ticket also lays the ground every later ticket stands on:

- the admin endpoint, its token and origin checks;
- the control file, with only `pause` in it for now;
- the runner's feature marker, which decides whether a run folder gets controls;
- the run lock, so that a second runner of the same run folder exits at once;
- admin lines in `progress.log`.

Read [spec.md](spec.md) first:

- "Vocabulary";
- "Control file";
- "Runner" (pause, run lock, feature marker);
- "Progress line contract";
- "Monitor: server" (API, security, allowed actions, continue, new derived states);
- "Monitor: page" (header, feedback);
- the matching scenarios under "Testing Decisions".

Build it test-first on the one seam the spec describes: page or HTTP request, then the server, the run folder, and the real runner with the stub `claude` on a throwaway git repository. The stub learns to stay working until a release file appears. Rebuild the check tooling from the earlier specs if `%TEMP%\task-queue-monitor-fixtures` is gone.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The server accepts POST on one admin endpoint and still answers 405 for every other non-GET request. It still listens on 127.0.0.1 only and refuses a foreign Host.
- [ ] Each server start makes a random token, and the page receives it with the page itself. A request without the token, with a wrong token, or with an Origin other than the monitor's own answers 403 and changes nothing.
- [ ] Pause, Cancel pause and Continue each answer 200 when applied, 409 with the reason when the run's state does not allow them, and 400 for a malformed request.
- [ ] The server is the only writer of `control.json` and replaces it whole on every write. The file carries a `version`. A missing control file means no commands. An unreadable one is ignored, and an admin line says so.
- [ ] The runner reads the control file before each sequential task, before each group and after each merge step, and never while a session runs. With `pause` set, it writes `Queue - PAUSED (by the user)` and its admin line, and exits with code 0.
- [ ] Pause asked during a group takes effect only after that group's merge step.
- [ ] A re-run with `pause` still set pauses again before doing anything. Continue clears `pause` before it launches the runner.
- [ ] Continue launches the run folder's `run.ps1` in a new visible PowerShell window, as the skill does, and writes its admin line.
- [ ] The runner takes `runner.lock` at start and removes it when it exits normally. A second runner of the same run folder started by hand exits at once and writes nothing to `progress.log`. A lock naming a dead process does not stop a runner. The parallel child processes neither check nor take the lock.
- [ ] The runner carries the feature marker. Runs whose runner copy lacks it, and finished runs, get no controls in the page, and admin requests for them are refused.
- [ ] The run answer gains the run states `pausing` and `paused`, whether the run supports admin actions, and which run-level actions are allowed now. The page's header shows exactly those: Pause, or Cancel pause while pausing, and Continue. Stop comes in ticket 03.
- [ ] Controls appear on any unfinished run in the run list, not only the newest.
- [ ] A refused action shows its reason next to the control that sent it. The page updates from its normal polling.
- [ ] While paused, workers sit and wait and the scene heading reads "PAUSED". No new sprites.
- [ ] The new controls work by keyboard, in light and dark, and at 375 px.
- [ ] Queues without a control file run exactly as before. The runner checks from the earlier specs and the monitor's existing state, HTTP and parallel checks still pass.
- [ ] The wording of every new progress line (pause, admin lines, lock refusal) is recorded in a progress line contract in this folder's README.
