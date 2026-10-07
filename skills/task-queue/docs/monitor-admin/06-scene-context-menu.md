# 06: The scene's right-click menu

**What to build:** In the office scene, the user right-clicks a worker. A small menu in the scene's pixel style opens, listing that task's actions that are allowed right now: Skip, Un-skip, Retry and Edit brief. Shift+F10 or the context-menu key opens the same menu on a focused worker.

- Skip asks for confirmation as in the drawer.
- Un-skip acts at once.
- Retry opens the task's drawer on its retry form.
- Edit brief opens the drawer with the editor open.

Left click, Enter and hover keep their current behaviour: they open the drawer and show the tooltip. Queue-level actions stay in the header and side panel only.

Read [spec.md](spec.md) first:

- "Monitor: page" (scene, confirmation);
- the page checks under "Testing Decisions".

Check it in Claude's built-in browser pane, on the seam and tooling of ticket 01.

**Blocked by:** 02, 03, 04, 05

**Status:** ready-for-agent

- [ ] A right-click on a worker opens the menu with exactly the task actions the run answer allows for that task. A task with no allowed action gets no menu, and the browser's own menu does not open either.
- [ ] Shift+F10 and the context-menu key open the menu on a focused worker. Arrow keys move through it, Enter picks an item, and Esc closes it and gives the focus back to the worker.
- [ ] A click outside the menu, scrolling, or a change of run closes it.
- [ ] Skip asks for confirmation. Un-skip acts at once. Retry and Edit brief open the drawer on the retry form and on the open editor.
- [ ] Left click, Enter, hover and focus on workers, helpers, the counter and merge signs behave exactly as before.
- [ ] The menu is in the scene's pixel style, with no new sprites. Each item has an accessible name.
- [ ] Light, dark and 375 px are checked by screenshot.
- [ ] The scenarios of tickets 01 to 05 still pass.
