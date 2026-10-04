Status: ready-for-agent

# Pixel-art monitor UI for task-queue runs

## Problem Statement

People who launch a task queue watch it through the monitor: a read-only local web page that shows every run, its tasks, the running session's activity, reports, commits and notifications. Today that page is a table-and-panels dashboard. It answers every question, but only after reading: to tell whether a queue is moving, idle, asleep or stopped, the user scans badges, times and a feed. Nothing conveys the queue as work flowing through, and nothing shows that the running session has fanned out to subagents unless the user reads the feed.

The user wants the monitor rebuilt as a pixel-art scene, in which each task is a small pixel worker that waits in line, works at a desk, celebrates when done or raises an alarm when it stops, with the running session's subagents as helpers. Everything the current page can show must stay available.

## Solution

The monitor page is replaced by a pixel-art office for the selected run, drawn on a canvas with plain browser JavaScript. Each task in the run is a worker with its own look:

- Waiting tasks stand in a queue line.
- The running task sits at the desk typing, with its subagents as small helpers around it.
- Finished tasks walk to the done zone and celebrate.
- A failed or stopped task stands in a red alert corner.
- An interrupted task, or one whose runner has lost its session process, sleeps at the desk in yellow.

When a state changes, the worker walks to its new place.

Hovering a worker shows its facts. Clicking it opens a side drawer with the task's live Activity, Report and Brief. These all stay: the run header, the commits made during the run, the progress log, the run list, browser notifications and the tab-title status. They get pixel frames, while long text stays in a readable font. Each worker has an invisible, focusable button over it, so the scene works by keyboard and screen reader, and checks can read it from the page's accessibility tree.

The server's API does not change. The server only learns to serve the new browser modules. The monitor stays read-only, works offline, has no dependencies, and starts the same way as today.

## User Stories

### Watching a run at a glance

1. As a task-queue user, I want each task in the selected run to appear as its own pixel worker, so that I can see the whole queue at a glance.
2. As a task-queue user, I want waiting tasks to stand in a queue line in task order with the next task nearest the desk, so that I can see what runs next.
3. As a task-queue user, I want the running task's worker to sit at the desk and type, so that I can tell instantly that work is happening.
4. As a task-queue user, I want finished tasks' workers to walk to the done zone, so that progress reads as movement through the office.
5. As a task-queue user, I want a short celebration when a task finishes while I am watching, so that completions are noticeable without reading anything.
6. As a task-queue user, I want a failed or stopped task's worker to stand in a red alert corner with a red exclamation mark, so that a stop is impossible to miss.
7. As a task-queue user, I want an interrupted task, or a runner that has lost its session, to show its worker asleep at the desk in yellow, so that I can tell "nobody is working" apart from "it failed".
8. As a task-queue user, I want workers to walk to their new place when a state changes, so that I can follow what just happened.
9. As a task-queue user, I want everyone already in place, with no walking, when I open the page or switch runs, so that I am not shown a replay of old history.
10. As a task-queue user, I want the run's own state (not started, running, done, stopped, preflight failed, interrupted, no session) shown on the scene, so that I know the queue's overall status even when nobody is at the desk.
11. As a task-queue user, I want a preflight failure to show on the scene with the preflight message, so that I know why no task started.
12. As a task-queue user, I want the running task's subagents to appear as small helper workers beside it, so that I can see when the session is fanning work out.
13. As a task-queue user, I want a helper to arrive when its subagent starts and leave when it finishes, so that the helpers on screen always match the subagents at work.
14. As a task-queue user, I want more than a few helpers to be summarised by a "+N" marker, so that a busy session does not clutter the desk.
15. As a task-queue user, I want each worker to look different, with the look derived from its task id, so that I can recognise a task by its look.
16. As a task-queue user, I want the same task id to look the same in every run, so that "worker 03" becomes familiar.
17. As a task-queue user, I want each worker to carry its number and a short title above its head, so that I can identify tasks without hovering.
18. As a task-queue user with a long queue, I want the done zone to show only the most recent finished workers plus a "+N done" counter when the run has more than 12 tasks, so that the scene stays readable.
19. As a task-queue user with a long queue, I want to open the "+N done" counter as a list and pick any finished task, so that no task's report becomes unreachable.
20. As a task-queue user with a long queue, I want the scene to grow taller and scroll rather than shrink the workers, so that every waiting worker stays visible and legible.

### Details on demand

21. As a task-queue user, I want hovering a worker to show its title, state, start and end or elapsed time, duration, cost, last activity and stop reason, so that I get the facts the old task table showed without leaving the scene.
22. As a task-queue user, I want the tooltip to say when an earlier attempt of the task failed, so that I know a retry happened.
23. As a task-queue user, I want clicking a worker to open a side drawer for that task, so that I can dig into it.
24. As a task-queue user, I want the drawer's Activity tab to show the session's messages, tool calls, results and subagent groups live, so that I can follow the session as before.
25. As a task-queue user, I want the Activity feed to keep my scroll position unless I am already at the bottom, so that reading older items is not interrupted.
26. As a task-queue user, I want the Report tab to render the task's report as markdown, together with the earlier attempt's report when one exists, so that I can read results in the monitor.
27. As a task-queue user, I want the Brief tab to show the task's brief, so that I can check what the session was asked to do.
28. As a task-queue user, I want the open drawer to keep updating, so that a new report or a finished session shows up without reopening it.
29. As a task-queue user, I want the worker whose drawer is open to be highlighted in the scene, so that I know which task I am reading.
30. As a task-queue user, I want to close the drawer with a button or Esc, so that I can return to the full scene.
31. As a task-queue user, I want hovering a helper to show its subagent type and description, so that I know what it is doing.

### Run-level information

32. As a task-queue user, I want the run header to show model, effort, permission mode, working directory, start time, elapsed time, total cost and runner process state, so that the run's facts stay one glance away.
33. As a task-queue user, I want a warning when tasks are missing their brief files, so that I catch a broken run folder early.
34. As a task-queue user, I want to see the commits made during the run, so that I can connect tasks to code changes.
35. As a task-queue user, I want to open the raw progress log, so that I can check the runner's own record.

### Runs and navigation

36. As a task-queue user, I want the sidebar to list every run with its state badge, done count and cost, so that I can switch between queues.
37. As a task-queue user, I want the monitor to open the run named in the URL, else a running one, else the newest, so that links and reloads land where I expect.
38. As a task-queue user, I want switching runs to rebuild the scene for that run, so that workers from different runs never mix.

### Notifications and title

39. As a task-queue user, I want browser notifications when a task finishes, the queue finishes or the queue stops, so that I can work elsewhere while it runs.
40. As a task-queue user, I want the browser tab title to show the run's state icon and done count, so that I can watch from another tab.

### Look and feel

41. As a task-queue user, I want the scene, frames, badges and buttons to look like pixel art, so that the monitor has one coherent style.
42. As a task-queue user, I want long text (reports, briefs, the feed) in a normal readable font, so that the style never costs readability.
43. As a task-queue user, I want the monitor, scene included, to follow my system's light or dark theme, so that it fits my desktop.
44. As a task-queue user, I want the pixels to stay sharp at any window size, so that the art never looks blurry.
45. As a task-queue user on a narrow window or a phone, I want the layout to stack and the drawer to cover the screen, so that the monitor stays usable.
46. As a task-queue user, I want the monitor to keep the last known state and show a visible hint when the server stops answering, so that I do not mistake a dead monitor for a quiet queue.

### Accessibility

47. As a keyboard user, I want to Tab through the workers in task order and open one with Enter, so that I can use the monitor without a mouse.
48. As a keyboard user, I want the tooltip to appear when a worker has focus, so that I get the same facts as mouse users.
49. As a screen-reader user, I want each worker announced with its number, title, state, place and helper count, so that I can follow the scene without seeing it.
50. As a user who prefers reduced motion, I want workers to move to their new place without walking or confetti, so that the monitor does not distract me.

### Safety and operation

51. As a task-queue user, I want the monitor to stay read-only, so that looking can never change or stop a queue.
52. As a task-queue user, I want reports and briefs containing raw HTML or script links to render inert, so that a session's output cannot run code in my browser.
53. As a task-queue user, I want the monitor to work offline with nothing downloaded (no CDN, fonts or packages), so that it starts wherever node runs.
54. As a task-queue user, I want to start the monitor exactly as before (same command, port and idle shutdown), so that nothing in my workflow changes.

### Maintenance

55. As the skill's maintainer, I want the page split into small browser modules with clear jobs, so that I can change the art or the scene without touching data loading.
56. As the skill's maintainer, I want the server to serve only an explicit set of static files, so that the new module folder cannot expose anything else on disk.
57. As the skill's maintainer, I want the sprites defined as text in code, so that I can edit the art in any editor without image tools.
58. As the skill's maintainer, I want to check the monitor against fake run folders and a fake runner on a separate port, so that I can see every state without spending real sessions or disturbing real queues.

## Implementation Decisions

### Boundaries

- The monitor page is replaced entirely, with no route to the old page. Before overwriting it, the implementing session copies the old page outside the skill folder, into its own scratch or temp directory. Nothing of the old page stays in the skill folder.
- In the server, only the set of static files it serves changes. These stay as they are:
  - the API;
  - run and task state derivation;
  - the process-table liveness check;
  - the git log window;
  - feed parsing;
  - the Host check;
  - GET-only (405 otherwise);
  - the port and queue-root environment variables;
  - the start command;
  - the two-hour idle exit.
- The page stays dependency-free: plain JavaScript ES modules, with no framework, build step, npm, new vendored library, image or font files, or CDN. The vendored markdown library and its license stay.
- The runner, the skill's instructions and the run folder format are not touched.

### Server: static files

- The server serves exactly three things:
  - the page at `/`;
  - the vendored markdown library at its current URL;
  - browser modules at `/pixel/<name>.js`, where `<name>` is lowercase letters, digits and hyphens and the file exists in the module folder.
- Modules are sent as JavaScript with the existing no-store and nosniff headers.
- Everything else gets 404. A name is checked against the pattern before anything touches the disk, so dots, slashes, backslashes and percent-encoded sequences never reach a file path.

### API the page relies on (unchanged)

- `GET /api/runs` returns `root`, `livenessAt` and, per run: `project`, `run`, `state`, `total`, `counts` by task state, `missingBriefs`, `cost`, `startedAt`, `finishedAt`.
- `GET /api/run?project&run` returns:
  - run `state`, `startedAt`, `finishedAt`, `preflight`;
  - `tasks`: `index`, `id`, `title`, `state`, `start`, `end`, `sessionId`, `cost`, `reason`, `hasBrief`, `resultMtime`, `hasPrevious`, `logSize`, `lastActivity`;
  - `settings`: `workDir`, `permissionMode`, `model`, `effort`;
  - `runner`: `known`, `alive`, `session`, `pid`;
  - `livenessAt`;
  - `commits`: null before the run starts, else an error, or a list of `hash`, `date`, `author`, `ref`, `subject`;
  - `progress`: lines of `time` and `message`.
- `GET /api/feed?project&run&task&offset` returns `items`, the next `offset`, `size`, and a `missing` or `reset` flag.
  - Item kinds: `session`, `init`, `text`, `tool`, `result`, `raw`, `agent` (a subagent started: `id`, `type`, description) and `agent-end` (a subagent finished: `id`, `status`).
  - Items written by a subagent carry its id as `sub`.
- `GET /api/file?project&run&task&kind`, where kind is `brief`, `result` or `previous`, returns `text`, or 404.
- Task states: pending, running, done, failed, stopped, interrupted, no-session.
- Run states: not-started, running, done, stopped, preflight-failed, interrupted, no-session.

### Browser modules

The page loads one entry module. Six modules split the work:

- **api**: polling and caching.
  - It polls the run list every 4 s and the selected run every 2 s.
  - It keeps one incremental feed reader per task in use, shared by everyone who reads that task. The desk task's feed drives the helpers and the drawer task's feed drives Activity; when both are the same task, they share one reader.
  - It handles the reset and missing flags.
  - When a poll fails, it keeps the last snapshot and marks the page offline until the next success.
- **workers**: the scene model, with no drawing and no DOM.
  - It turns a run snapshot plus the helper list into workers, each with a place, slot, look, animation state and accessible name.
  - It compares consecutive snapshots to start walks and celebrations.
  - It places everything directly on a run's first snapshot.
  - It applies the long-run collapse rule.
  - It maintains the helper list from feed items.
- **sprites**: the art.
  - Workers are 16×16 sprites and helpers are smaller. There are also furniture sprites and markers: a red exclamation mark, a sleep "Zz", confetti and a check.
  - All sprites are string matrices with palette keys, defined in code.
  - It builds cached offscreen canvases per sprite, frame and palette, and rebuilds them when the theme changes.
  - It picks each worker's look from a hash of its task id.
- **scene**: layout, drawing and the overlay.
  - It draws at a fixed low world resolution, scaled up by an integer factor with image smoothing off, in a `requestAnimationFrame` loop.
  - It lays out the zones.
  - It keeps the DOM overlay (worker buttons, name tags, counters, helper tooltips) positioned over the sprites.
  - The canvas is hidden from assistive technology.
- **panel**: everything outside the scene, ported from the old page: the sidebar run list, the run header, the drawer, the run-level sections, markdown rendering with the existing safety rules, and HTML escaping.
- **main**: the wiring: run selection and the URL hash, notifications and the permission button, the tab title, the theme listener and keyboard shortcuts.

### Scene layout and states

The runner runs tasks one at a time. So at most one task is at the desk (running, no-session or interrupted), and at most one is in the alert corner. The office therefore has:

- one desk, with helper spots around it;
- a queue line;
- a done zone;
- an alert corner;
- a door;
- a run-state sign.

| Task state | Place | Animation | Marker |
|---|---|---|---|
| pending | queue line, in task order, next task nearest the desk | idle (bob, blink) | none |
| running | desk | typing, 2 frames | helpers around the desk |
| no-session, interrupted | desk | asleep | yellow "Zz" |
| done | done zone, in task order | celebrates on a live arrival, then idle | check |
| failed, stopped | alert corner | alarm loop | red exclamation mark |

- The run-state sign shows the run state in the run badge colours. For preflight-failed, the sign's tooltip carries the preflight message.
- A long queue wraps into more rows: the world grows taller and the page scrolls. Workers are never shrunk.
- A run with more than 12 tasks collapses the done zone:
  - The 4 most recent done workers stay, and the rest become a "+N done" counter.
  - The counter is a button that opens a list of the collapsed tasks (number, title, duration, cost).
  - Choosing an entry opens that task's drawer.

### Motion

- On a state change, the worker walks from where it is to its new slot:
  - at constant speed, along straight segments, with no pathfinding;
  - with a 2-frame walk cycle, mirrored for direction.
  - A newer change during the walk sends it to the new target instead.
- A run's first snapshot (page load or run switch) places every worker and helper directly, with no walks and no celebrations.
- The celebration is a short jump with confetti, about 1.5 s long. It plays only when a worker reaches the done zone through a live transition.
- With prefers-reduced-motion, workers move to their slot without walking, and confetti and idle loops are off.

### Helpers (subagents)

- Only the desk task has helpers. A helper starts with the feed's `agent` item and ends with its `agent-end` item.
  - This was checked against the real session logs. Every Agent call (they run in the background by default) is followed first by a task start of type local_agent, then later by a task notification with the same tool-use id. The server already turns these two events into the `agent` and `agent-end` items.
  - Fallback: all helpers leave when the session's `result` item arrives or the task leaves the desk.
- A helper enters at the door, walks to a free helper spot, and walks back out when it ends. At most 4 helpers are drawn; any more show as a "+N" marker.
- Hovering a helper shows its subagent type and description. Clicking it opens the parent task's drawer on Activity. Helpers are not in the Tab order.

### Worker look

- A deterministic hash of the task id picks the skin tone, hair colour and style, and shirt colour from fixed palettes chosen to read on both themes. Task ids are 01, 02, … in every run, so a given number looks the same in every run.
- Status colours come from the existing status tokens. Scene surfaces (floor, walls, furniture) come from new light and dark tokens next to them. Sprites read the tokens when the cache is built.

### Overlay (the confirmed test seam)

- Every drawn worker has a transparent, focusable button over its sprite.
  - Its accessible name is number, title, state and place, joined by " · ". The place is "queue position N", "desk", "done zone" or "alert corner".
  - The desk worker's name adds the helper count. Example: "03 · Ticket 62 push handling · running · desk · 2 helpers".
- A visible name tag (the number and a short, truncated title) sits above the worker's head. It is DOM text, not canvas text.
- Hover or focus shows the tooltip:
  - number and title;
  - state;
  - start and end, or elapsed time;
  - duration;
  - cost;
  - last activity, while running;
  - the stop reason;
  - a note when an earlier attempt failed.
- Click or Enter opens the drawer. The Tab order is task order, followed by the "+N done" counter. Esc closes the tooltip first, then the drawer.
- There is no canvas hit-testing and no test-only global or hook. The overlay is the only way in, for users and for checks alike.

### Drawer

- The drawer is closed on load. It opens when a worker, a helper or a "+N done" list entry is activated.
  - Header: number, title, state badge and the tooltip facts.
  - Tabs: Activity (default), Report and Brief.
  - It closes with a close button or Esc.
  - The open task's worker is highlighted in the scene.
  - On narrow screens, the drawer covers the screen.
- Activity behaves as today:
  - session separators;
  - assistant text as markdown;
  - tool lines;
  - the session result with turns, duration and cost;
  - subagent groups as collapsible sections;
  - raw lines.
  - It loads incrementally by offset, starts over when the log was truncated, and auto-scrolls only when already at the bottom.
- Report reloads when the result's modification time or the earlier-attempt flag changes. The earlier attempt's report is a collapsible section, loaded when opened.
- Brief loads when its tab is shown.

### Page layout and style

- Sidebar:
  - the title and the queue root;
  - the "Enable notifications" button, while the permission is still undecided;
  - the run list: project, run, state badge, done/total, cost and a missing-brief warning.
  - The selection is kept in the URL hash as today. On load, the hash wins, then a running run, then the newest.
- Main column:
  - the run header: project, run, state badge, model, effort, permission mode, workDir, start time, elapsed time, cost, runner process state with its age, the preflight line and the missing-brief warning;
  - the scene;
  - collapsible "Commits during the run" and "progress.log" sections.
- Below the old page's narrow-screen breakpoint, the sidebar stacks above the main column.
- Pixel chrome: square corners, 2 px borders, stepped block shadows, monospace uppercase headings and badges, and pixelated canvas rendering.
- Reports, briefs and the feed use the system font.
- Light and dark follow the system theme as today. The scene follows too, rebuilding its sprite cache when the theme changes.
- UI text stays in English.

### Notifications and title

- The notification and tab-title logic carries over unchanged:
  - A notification fires when a task finishes, when the queue finishes, and when the queue stops in a bad state.
  - The title shows the state icon, done/total, a bad-state label and the project.

## Testing Decisions

- A good check drives only the monitor's real inputs and asserts only on what a user can see or the server answers.
  - Inputs: a run folder written the way the runner writes it, plus the presence or absence of the runner and session processes.
  - Assertions: the page's accessibility tree and text, screenshots, and HTTP responses. A check never reaches into module internals.
- There is one seam: run folder → page. The page is observed in Claude's built-in browser pane, where the user watches live. The server's static-file rules are checked with plain HTTP requests.
- Fixtures live outside the skill folder, in the implementing session's temp or scratch directory, and are not committed.
  - **Static run folders:**
    - one per final state: done, failed, stopped, preflight-failed, interrupted, not-started;
    - a run with more than 12 tasks;
    - a feed with subagents;
    - a task with an earlier failed attempt;
    - a task missing its brief;
    - a report containing raw HTML and a `javascript:` link, to check that markdown stays inert.
  - **A fake runner:** a PowerShell script that writes progress, feed and report lines in the runner's formats without calling Claude.
    - While a task runs, it keeps a stand-in child process named claude.exe alive. This is needed because the server derives running and no-session only from the process table.
    - Ending the stand-in gives no-session. Killing the fake runner gives interrupted. A FAILED report gives a stop.
    - Appended subagent start and end events drive the helpers.
- The server under test runs with the queue-root variable pointing at the fixtures and the port variable set to something other than 4747. The real queue root, and any monitor already running on 4747, are not touched.
- Checks:
  - Every task state appears in its place with its marker; each is checked by accessible name plus a screenshot. The run-state sign matches the run state, including preflight-failed with its message.
  - Live transitions from the fake runner make workers walk (checked with a screenshot sequence) and celebrate on done. A reload or a run switch shows no walking.
  - Helpers come and go with subagent start and end, and the desk worker's accessible name carries the helper count.
  - Hover and focus show the tooltip facts. Click and Enter open the drawer, and Esc closes it.
  - Activity, Report (including the earlier attempt) and Brief show the right content and update live.
  - In a run with more than 12 tasks, the done zone collapses to 4 workers plus a counter, and the counter's list opens collapsed tasks.
  - The run list, the hash deep link and the selection fallback work.
  - The run header facts, the Commits and progress.log sections, and the tab title show the right values.
  - The hostile report renders inert.
  - The page is checked in light and dark (colour-scheme emulation) and at phone width (375 px).
  - HTTP checks:
    - `/`, the markdown library and every module answer 200 with the right type;
    - traversal attempts, encoded names and unknown names answer 404;
    - non-GET requests answer 405;
    - a foreign Host answers 403.
- Browser notifications are not checked in the pane, since they need a permission prompt. Their logic is carried over unchanged.
- Prior art: none. The repo has no tests and no test harness, and none are added. npm is off the table, so there is no browser automation suite. This follows the verification plan agreed in the design discussion.

## Out of Scope

- Changes to the API, state derivation, the liveness logic, the runner, the skill's instructions or the run folder format.
- Any control over queues (start, stop, retry, assigning tasks). The monitor stays read-only.
- Showing several runs at once, or mini scenes in the run list.
- Sprite sheets, image files, web fonts, CDNs, npm packages, frameworks, a build step or new vendored libraries.
- Sound, talking to workers, or other game features.
- Keeping the old page, or a route to it.
- A committed test suite, committed fixtures, or CI.
- Changes to when or how browser notifications fire.

## Further Notes

- This spec comes from a design interview with the user, and the decisions above are theirs, except for these defaults, which were chosen while writing the spec and can be overruled:
  - the drawer starting closed;
  - the reduced-motion handling;
  - the offline marker;
  - the helper tooltips and the helper click target;
  - the "+N done" list;
  - the counts of 4 visible done workers and 4 visible helpers;
  - name tags as DOM text;
  - the 1.5 s celebration.
- The skill's own description of the monitor (tasks and their states, the running session's activity, reports, commits, notifications) stays accurate. Update its wording only if something no longer matches.
