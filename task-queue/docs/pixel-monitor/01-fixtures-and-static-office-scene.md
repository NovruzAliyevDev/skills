# 01: Fixtures and a static office scene at a preview URL

**What to build:** The first end-to-end path of the pixel monitor, running beside the old page.

The user opens the monitor's temporary preview URL, picks a run in the run list, and sees that run as a pixel office:
- Every task is a worker standing in the place that matches its state (queue line, desk, done zone, alert corner), with its marker.
- A sign shows the run's state.
- Every worker is also a focusable button. Its accessible name gives the number, title, state and place, and a name tag sits above the worker's head.
- When a run folder changes, workers jump to their new place on the next poll. Walking, tooltips and the drawer come in later tickets.

The old page at `/` stays untouched until ticket 03, so a monitor already running on port 4747 keeps working.

This ticket also builds the fixture tooling that every later ticket checks against.

Part of the pixel monitor spec (spec.md in this feature folder).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

### Fixture tooling

- [ ] The tooling lives outside the skill folder, in a shared folder named `task-queue-monitor-fixtures` under the system temp directory, so tickets 02 and 03 can reuse it. Nothing is added to the skill folder.
- [ ] A generator recreates static run folders in the runner's exact formats (queue.json, briefs, progress.log lines, session logs, reports). It creates:
  - one run per final state: done, failed, stopped, preflight-failed, interrupted, not-started;
  - a run with more than 12 tasks;
  - a session log with subagents: an Agent call followed by a local_agent task start and a task notification with the same tool-use id;
  - a task with an earlier failed attempt;
  - a task missing its brief;
  - a report containing raw HTML and a `javascript:` link;
  - a run whose working directory is a small git repo with commits inside the run window;
  - a run whose working directory is not a repo.
- [ ] A fake runner: a PowerShell script placed in a run folder as that run's runner script. It plays a scenario without calling Claude.
  - It writes progress, session-log and report lines in the runner's formats.
  - While a task runs, it keeps a stand-in child process named claude.exe alive. This is needed because the server derives running and no-session only from the process table.
  - It can end the stand-in (no-session), exit mid-task (interrupted), finish with a FAILED report (stop), and emit subagent start and end events.
- [ ] The tooling is checked against the current monitor on a side port, with the queue-root variable pointing at the fixtures and the port variable set to anything but 4747. The old page shows every fixture's expected run and task states, and the fake runner's live states appear as it plays.

### Server

- [ ] The server serves browser modules at `/pixel/<name>.js`.
  - Only names made of lowercase letters, digits and hyphens are served, and only if the file exists.
  - Modules are sent as JavaScript with the existing no-store and nosniff headers.
  - The name is checked against the pattern before anything touches the disk.
- [ ] The server serves the new page at the temporary `/preview` URL, while `/` still serves the old page. These stay unchanged: the API, the GET-only rule, the Host check, the port and root variables, and the idle exit.
- [ ] HTTP checks:
  - `/`, `/preview`, the markdown library and every module answer 200 with the right content type;
  - traversal attempts, percent-encoded names and unknown names answer 404;
  - non-GET requests answer 405;
  - a foreign Host answers 403.

### Preview page

- [ ] The page is built from plain ES modules, split as in the spec: api, workers, sprites, scene, panel, main. No framework, npm, build step, image or font files, or CDN.
- [ ] It polls the run list every 4 s and the selected run every 2 s.
- [ ] Sidebar run list:
  - each run shows project, run, state badge, done/total, cost and a missing-brief warning;
  - the selection lives in the URL hash;
  - on load, the hash wins, then a running run, then the newest;
  - switching runs rebuilds the scene.
- [ ] The office scene is drawn at a fixed low world resolution and scaled up by an integer factor with smoothing off. It has:
  - one desk with helper spots;
  - a queue line;
  - a done zone;
  - an alert corner;
  - a door;
  - a run-state sign showing the run state in the badge colours.
- [ ] Workers are placed according to the spec's state table:
  - pending: in the queue, in task order, with the next task nearest the desk;
  - running, no-session and interrupted: at the desk, with a yellow "Zz" for the last two;
  - done: in the done zone, with a check;
  - failed and stopped: in the alert corner, with a red exclamation mark.
  - Sprites are string matrices defined in code.
- [ ] Each worker has one transparent, focusable button over its sprite.
  - Its accessible name is "NN · title · state · place", where the place is "queue position N", "desk", "done zone" or "alert corner".
  - The Tab order is task order.
  - A DOM name tag (the number and a truncated title) sits above each head.
  - The canvas is hidden from assistive technology.
  - There is no canvas hit-testing and no test-only hook.
- [ ] Base pixel chrome: square corners, 2 px borders, stepped block shadows, monospace uppercase headings and badges, and pixelated canvas rendering. Long text uses the system font.
- [ ] Checked in Claude's built-in browser pane against every static fixture:
  - the accessibility tree lists each worker with the right state and place;
  - there is a screenshot for each state;
  - editing a fixture's progress.log moves the worker on the next poll.
- [ ] The real queue root, the old page and any monitor on port 4747 are untouched.
