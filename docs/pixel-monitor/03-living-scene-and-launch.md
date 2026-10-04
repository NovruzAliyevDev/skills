# 03: Living scene and launch

**What to build:** The office comes alive and replaces the old page.
- Workers walk to their new place when a state changes, and celebrate when they finish.
- The running task's subagents appear as small helpers who walk in from the door and leave when their work ends.
- The pixel page then moves to `/`, the preview URL and the old page go away, and the spec's full checklist passes.

Everything is checked with the fixture tooling from ticket 01, mainly the fake runner.

Part of the pixel monitor spec (spec.md in this feature folder).

**Blocked by:** 02 (Full static monitor on the preview page)

**Status:** ready-for-agent

### Motion

- [ ] On a state change, a worker walks from where it is to its new slot:
  - at constant speed, along straight segments;
  - with a 2-frame walk cycle, mirrored for direction.
  - A newer change during the walk sends it to the new target instead.
- [ ] A run's first snapshot (page load or run switch) places every worker and helper directly, with no walks and no celebrations.
- [ ] Animations by place:
  - a worker reaching the done zone through a live transition celebrates with a short jump and confetti, about 1.5 s;
  - queue workers idle (bob, blink);
  - the desk worker types (2 frames);
  - no-session and interrupted workers sleep with "Zz";
  - the alert corner plays an alarm loop.
- [ ] With prefers-reduced-motion there is no walking, confetti or idle loop.
- [ ] The long-run collapse still holds while workers walk into the done zone.

### Helpers

- [ ] The desk task's session log is read incrementally by one reader. When the drawer's Activity shows the same task, both share that reader.
- [ ] A helper starts with the feed's `agent` item and ends with its `agent-end` item. All helpers leave when the session's `result` item arrives or the task leaves the desk.
- [ ] Helper movement:
  - helpers enter at the door, walk to a free helper spot, and walk out when they end;
  - at most 4 are drawn, and any more show as a "+N" marker;
  - on a run's first snapshot, active helpers are placed directly.
- [ ] The desk worker's accessible name adds "· N helpers".
  - Hovering a helper shows its subagent type and description.
  - Clicking a helper opens the parent task's drawer on Activity.
  - Helpers are not in the Tab order.

### Launch

- [ ] The old page is copied outside the skill folder, into the session's scratch or temp directory. Then the pixel page replaces it at `/`, and the `/preview` URL is removed. No route to the old page remains.
- [ ] The spec's full checklist (Testing Decisions) passes on a side-port server:
  - every state;
  - live transitions, as a screenshot sequence;
  - helpers;
  - tooltip and drawer;
  - long runs;
  - run list and hash;
  - run header, commits, progress.log and tab title;
  - the hostile report;
  - light and dark themes;
  - 375 px width;
  - the HTTP rules, with `/preview` now answering 404.
- [ ] The skill's description of the monitor (SKILL.md) is checked, and its wording changes only if something no longer matches.
- [ ] The user is told that a monitor already running on port 4747 keeps the old server code in memory and must be restarted to serve the new page. The session does not restart it.
