# 02: Full static monitor on the preview page

**What to build:** Everything the old page can show becomes reachable on the preview page, and the scene gets its final look:
- Hovering or focusing a worker shows its facts.
- Clicking a worker opens the task drawer with live Activity, Report and Brief.
- The run header, the commits made during the run, the progress log, the tab title, browser notifications and an offline marker come back.
- In a run with more than 12 tasks, older finished workers fold into a "+N done" counter that lists them.
- Every worker gets its own look.
- The scene follows the light or dark theme and stays sharp at any size.

Workers still jump to their new place instead of walking. Everything is checked with the fixture tooling from ticket 01. The old page at `/` stays untouched.

Part of the pixel monitor spec (spec.md in this feature folder).

**Blocked by:** 01 (Fixtures and a static office scene at a preview URL)

**Status:** ready-for-agent

### Tooltip and drawer

- [ ] Hovering or focusing a worker shows a tooltip with:
  - number and title;
  - state;
  - start and end, or elapsed time;
  - duration;
  - cost;
  - last activity, while running;
  - the stop reason;
  - a note when an earlier attempt failed.
- [ ] The drawer is closed on load. Click or Enter on a worker opens it.
  - Header: number, title, state badge and the tooltip facts.
  - Tabs: Activity (default), Report and Brief.
  - The open task's worker is highlighted in the scene.
  - It closes with a close button. Esc closes the tooltip first, then the drawer.
  - At narrow widths the drawer covers the screen.
- [ ] Activity is ported from the old page:
  - session separators;
  - assistant text as markdown;
  - tool lines;
  - the session result with turns, duration and cost;
  - subagent groups as collapsible sections;
  - raw lines.
  - It loads incrementally by offset, starts over when the log was truncated, and auto-scrolls only when already at the bottom.
- [ ] Report reloads when the result's modification time or the earlier-attempt flag changes. The earlier attempt's report is a collapsible section, loaded when opened. Brief loads when its tab is shown. Missing files show the old page's empty-state messages.
- [ ] Markdown keeps the old safety rules: raw HTML is escaped, and `javascript:`, `data:` and `vbscript:` links are neutralised. The hostile fixture report renders inert.

### Run panels

- [ ] The run header shows project, run, state badge, model, effort, permission mode, workDir, start time, elapsed time, cost, runner process state with its age, the preflight line and the missing-brief warning.
- [ ] Two collapsible sections:
  - "Commits during the run": the git fixture lists its commits, the non-repo fixture shows the git error, and a not-started run says so;
  - "progress.log".
- [ ] For preflight-failed, the run-state sign's tooltip carries the preflight message.
- [ ] The tab title and notifications, including the "Enable notifications" button, carry over unchanged from the old page.
- [ ] When polls fail, the last state stays on screen and an offline marker appears. It clears on the next successful poll. Check this by stopping and restarting the side-port server.
- [ ] Below the old page's narrow-screen breakpoint, the sidebar stacks above the main column.

### Long runs

- [ ] A run with more than 12 tasks keeps the 4 most recent done workers in the done zone. The rest become a "+N done" counter button.
  - The counter comes after the workers in the Tab order.
  - It opens a list of the hidden tasks (number, title, duration, cost).
  - Choosing an entry opens that task's drawer.
- [ ] A long queue wraps into more rows: the world grows taller and the page scrolls. Workers never shrink.

### Looks and theme

- [ ] A deterministic hash of the task id picks skin tone, hair colour and style, and shirt colour from fixed palettes that read well on both themes. A given task id looks the same in every run.
- [ ] Scene surfaces (floor, walls, furniture) use new light and dark tokens next to the existing status tokens. A theme change rebuilds the sprite cache without a page reload.
- [ ] Pixels stay square and sharp at any window width and device pixel ratio.

### Checks

- [ ] In Claude's built-in browser pane, against the fixtures:
  - tooltip and drawer contents for each state;
  - the hostile report renders inert;
  - the long-run counter and its list;
  - light and dark themes (colour-scheme emulation);
  - 375 px width.
- [ ] The real queue root, the old page and any monitor on port 4747 are untouched.
