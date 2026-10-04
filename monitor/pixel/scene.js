// The office: where the zones are, drawing on a canvas at world resolution scaled up by an integer
// factor, and the DOM overlay kept over the sprites: one button and one name tag per worker, the
// run-state sign, the "+N done" counter with its list, and the tooltip. The overlay is the only way in;
// the canvas is hidden from assistive technology.
import { color, sceneSprite, workerSprite } from './sprites.js';
import { STATE_LABEL, badge, esc, money, setHtml, taskDuration, taskFacts } from './panel.js';

// World geometry, in world pixels. Worker rows are 30 apart: a 16 px sprite and room for its name tag.
const WORLD_W = 320;
const MIN_WORLD_H = 164;
const WALL_H = 48;
const ROW = 30;
const SPRITE = 16;
const MAX_CSS_SCALE = 4;
const QUEUE = { x: 104, y: 74, step: 20, perRow: 6 };   // slot 0 is nearest the desk; the line snakes in rows
const DESK = { x: 152, y: 88 };
const SEAT = { x: 174, y: DESK.y - 13 };                // the desk worker sits behind the desk, which hides the legs
const CHAIR = { x: SEAT.x - 2, y: SEAT.y + 4 };
const MONITOR = { x: 155, y: DESK.y - 12 };
const KEYBOARD = { x: SEAT.x + 1, y: DESK.y + 1 };
// Where the desk task's subagents stand: beside the desk and in front of it. Helpers are up to 10x12.
const HELPER_SPOTS = [{ x: 136, y: 80 }, { x: 204, y: 80 }, { x: 150, y: 104 }, { x: 186, y: 104 }];
const DONE = { x: 236, y: 118, step: 20, perRow: 4 };    // the "+N done" counter takes the slot after its workers
const ALERT = { x: 292, y: 66, step: 20 };
const ALERT_ZONE = { x: 264, y: WALL_H, w: WORLD_W - 264, h: 46 };
const DOOR = { x: 10, y: WALL_H - 34 };
const WINDOW = { x: 222, y: 10 };
const BEACON = { x: 298, y: 16 };
const PLANT = { x: 36, y: WALL_H - 14 };
const MARKER_OFFSET = { x: 13, y: 0 };                  // markers sit beside the head, under the name tag
const GAP = 6;                                          // CSS pixels between a tooltip or list and what it belongs to
const HIDE_DELAY_MS = 150;                              // time to move the pointer from a worker onto its tooltip

// Where a worker stands, and how wide its name tag may be.
function spotOf(worker) {
  const { place, slot } = worker;
  if (place === 'queue') {
    const row = Math.floor(slot / QUEUE.perRow), col = slot % QUEUE.perRow;
    const fromDesk = row % 2 ? QUEUE.perRow - 1 - col : col;
    return { x: QUEUE.x - fromDesk * QUEUE.step, y: QUEUE.y + row * ROW, tagWidth: QUEUE.step - 2 };
  }
  if (place === 'done') {
    const row = Math.floor(slot / DONE.perRow), col = slot % DONE.perRow;
    return { x: DONE.x + col * DONE.step, y: DONE.y + row * ROW, tagWidth: DONE.step - 2 };
  }
  if (place === 'alert') return { x: ALERT.x - slot * ALERT.step, y: ALERT.y, tagWidth: slot ? ALERT.step - 2 : 40 };
  // The runner runs one task at a time; should two be at the desk, the others stand beside it.
  return slot ? { x: DESK.x + 46 + (slot - 1) * 18, y: SEAT.y + 4, tagWidth: 16 } : { x: SEAT.x, y: SEAT.y, tagWidth: 56 };
}

// Slots in use: the queue's workers; the done zone's workers and the counter after them.
const queueSlots = office => office.workers.filter(w => w.place === 'queue').length;
const doneWorkers = office => office.workers.filter(w => w.place === 'done').length;
const doneSlots = office => doneWorkers(office) + (office.collapsed.length ? 1 : 0);

// Where a zone's last row ends; it always has at least one row.
function zoneBottom(zone, slots) {
  return zone.y + Math.max(1, Math.ceil(slots / zone.perRow)) * ROW;
}

// The world grows taller for long queues instead of shrinking the workers.
function worldHeight(office) {
  return Math.max(MIN_WORLD_H, zoneBottom(QUEUE, queueSlots(office)), zoneBottom(DONE, doneSlots(office)));
}

// Device pixels per world pixel: the largest whole number that fits the width, so every world pixel is
// a whole block of device pixels. At most 4 CSS pixels; where even one device pixel does not fit, the
// scene scrolls sideways.
function scaleFor(cssWidth) {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.floor((cssWidth * dpr) / WORLD_W);
  const device = Math.max(1, Math.min(fit, Math.floor(MAX_CSS_SCALE * dpr)));
  return { device, css: device / dpr };
}

function drawRoom(ctx, height, office) {
  const fill = (x, y, w, h, c) => { ctx.fillStyle = color(c); ctx.fillRect(x, y, w, h); };
  fill(0, 0, WORLD_W, WALL_H, '--scene-wall');
  fill(0, 0, WORLD_W, 4, '--scene-ceiling');
  fill(0, WALL_H - 4, WORLD_W, 3, '--scene-wall-trim');
  fill(0, WALL_H - 1, WORLD_W, 1, '--scene-ink');
  fill(0, WALL_H, WORLD_W, height - WALL_H, '--scene-floor');
  for (let y = WALL_H + 8, row = 0; y < height; y += 8, row++) {
    fill(0, y, WORLD_W, 1, '--scene-floor-line');
    for (let x = (row % 2) * 24 + 12; x < WORLD_W; x += 48) fill(x, y - 7, 1, 7, '--scene-floor-line');
  }

  // Waiting spots: a mark under the feet of every queue slot in use, and a full first row.
  const queued = Math.max(QUEUE.perRow, queueSlots(office));
  for (let slot = 0; slot < queued; slot++) {
    const { x, y } = spotOf({ place: 'queue', slot });
    fill(x + 2, y + SPRITE + 1, SPRITE - 4, 2, '--scene-hazard');
  }

  for (const { x, y } of HELPER_SPOTS) fill(x + 1, y + 13, 8, 2, '--scene-metal-light');

  // The done zone: a rug under its rows.
  const doneBottom = zoneBottom(DONE, doneSlots(office)) - 8;
  fill(DONE.x - 8, DONE.y - 16, WORLD_W - DONE.x + 4, doneBottom - DONE.y + 16, '--scene-rug-edge');
  fill(DONE.x - 6, DONE.y - 14, WORLD_W - DONE.x, doneBottom - DONE.y + 12, '--scene-rug');

  // The alert corner: red floor inside hazard stripes.
  const z = ALERT_ZONE;
  fill(z.x, z.y, z.w, z.h, '--scene-alert-floor');
  for (let y = z.y; y < z.y + z.h; y++) {
    for (let x = z.x; x < z.x + z.w; x++) {
      if (x >= z.x + 3 && y < z.y + z.h - 3) continue;
      fill(x, y, 1, 1, ((x + y) >> 2) % 2 ? '--scene-hazard' : '--scene-ink');
    }
  }

  ctx.drawImage(sceneSprite('door'), DOOR.x, DOOR.y);
  ctx.drawImage(sceneSprite('window'), WINDOW.x, WINDOW.y);
  ctx.drawImage(sceneSprite('beacon'), BEACON.x, BEACON.y);
  ctx.drawImage(sceneSprite('plant'), PLANT.x, PLANT.y);
}

function drawWorker(ctx, worker, spot) {
  ctx.drawImage(workerSprite(worker.look, worker.anim === 'sleep' ? 'sleep' : 'stand'), spot.x, spot.y);
}

function drawMarker(ctx, worker, spot) {
  if (worker.marker) ctx.drawImage(sceneSprite(worker.marker), spot.x + MARKER_OFFSET.x, spot.y + MARKER_OFFSET.y);
}

// Corner brackets around the worker whose drawer is open. The top ones sit just under its name tag.
function drawHighlight(ctx, spot) {
  const left = spot.x - 2, right = spot.x + SPRITE + 1, top = spot.y, bottom = spot.y + SPRITE + 1, arm = 4;
  ctx.fillStyle = color('--accent');
  for (const [x, y, dx, dy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]]) {
    ctx.fillRect(dx > 0 ? x : x - arm + 1, y, arm, 1);
    ctx.fillRect(x, dy > 0 ? y : y - arm + 1, 1, arm);
  }
}

// Puts `nodes` in this order under `parent`, moving only the ones out of place: a moved node loses focus.
function keepOrder(parent, nodes) {
  nodes.forEach((node, i) => { if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] || null); });
}

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

// Puts a floating box (fixed position) centred on `anchor`, a rect, on the preferred side of it when the
// window has room there, else on the other side, and always inside the window.
function placeBeside(box, anchor, preferAbove) {
  const width = box.offsetWidth, height = box.offsetHeight;
  const viewW = document.documentElement.clientWidth, viewH = document.documentElement.clientHeight;
  const above = anchor.top - GAP - height, below = anchor.bottom + GAP;
  const fitsAbove = above >= GAP, fitsBelow = below + height <= viewH - GAP;
  const top = preferAbove ? (fitsAbove || !fitsBelow ? above : below) : (fitsBelow || !fitsAbove ? below : above);
  box.style.left = `${clamp(anchor.left + anchor.width / 2 - width / 2, GAP, viewW - width - GAP)}px`;
  box.style.top = `${clamp(top, GAP, viewH - height - GAP)}px`;
}

// `onOpen(taskId)` is called when a worker, or an entry of the "+N done" list, is activated.
export function createScene(host, { onOpen }) {
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const sign = document.createElement('div');
  const tags = document.createElement('div');
  const crew = document.createElement('div');
  const counter = document.createElement('button');
  const list = document.createElement('div');
  const tip = document.createElement('div');
  stage.className = 'stage';
  canvas.setAttribute('aria-hidden', 'true');
  sign.className = 'sign';
  sign.setAttribute('role', 'status');
  tags.setAttribute('aria-hidden', 'true');
  counter.type = 'button';
  counter.className = 'counter';
  counter.setAttribute('aria-expanded', 'false');
  counter.setAttribute('aria-controls', 'done-list');
  list.className = 'done-list';
  list.id = 'done-list';
  list.setAttribute('role', 'dialog');
  list.setAttribute('aria-label', 'Finished tasks not shown in the office');
  list.hidden = true;
  tip.className = 'tip';
  tip.id = 'scene-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  stage.append(canvas, sign, tags, crew, tip);
  host.replaceChildren(stage);

  const ctx = canvas.getContext('2d');
  const elements = new Map();                    // task id -> { button, tag }
  let office = { state: null, preflightError: null, workers: [], collapsed: [] };
  let openId = null;                             // the task whose drawer is open
  let spots = new Map();
  let height = MIN_WORLD_H;
  let scale = null;
  let frame = 0;

  const px = v => `${v * scale.css}px`;

  // --- The tooltip: for the hovered element or the focused worker, whichever came last, until Esc. ---

  let hovered = null, focused = null, byFocus = false, shownFor = null, dismissed = false, hideTimer = 0;

  // What a pointer or focus event is about: a worker button, the sign, or the tooltip itself.
  function tipTarget(node) {
    return node instanceof Element ? node.closest('.worker, .sign, .tip') : null;
  }

  function tipHtml(target) {
    if (target === sign) return office.preflightError && `<p class="tip-title">${badge(office.state)}</p><p>${esc(office.preflightError)}</p>`;
    const worker = office.workers.find(w => w.id === target.dataset.id);
    if (!worker) return null;
    return `<p class="tip-title"><b>${esc(worker.number)}</b> ${esc(worker.title)}</p>${badge(worker.state)}${taskFacts(worker.task)}`;
  }

  function showTip() {
    if (hovered && !hovered.isConnected) hovered = null;
    if (focused && !focused.isConnected) focused = null;
    const target = dismissed ? null : byFocus ? focused || hovered : hovered || focused;
    const html = target && tipHtml(target);
    if (!html) return hideTip();
    if (shownFor !== target) shownFor?.removeAttribute('aria-describedby');
    shownFor = target;
    if (target.classList.contains('worker')) target.setAttribute('aria-describedby', tip.id);
    setHtml(tip, html);
    tip.hidden = false;
    placeTip();
  }

  function hideTip() {
    shownFor?.removeAttribute('aria-describedby');
    shownFor = null;
    tip.hidden = true;
  }

  // Above the worker and its name tag when there is room in the window, else below it.
  function placeTip() {
    if (tip.hidden) return;
    const { left, width, top, bottom } = shownFor.getBoundingClientRect();
    const tag = shownFor.classList.contains('worker') && elements.get(shownFor.dataset.id)?.tag;
    placeBeside(tip, { left, width, bottom, top: tag ? Math.min(top, tag.getBoundingClientRect().top) : top }, true);
  }

  stage.addEventListener('pointerover', e => {
    const target = tipTarget(e.target);
    if (!target) return;
    clearTimeout(hideTimer);
    if (target === tip) return;
    hovered = target;
    byFocus = false;
    dismissed = false;
    showTip();
  });
  // Leaving waits a moment, so the pointer can reach the tooltip and stay on it.
  stage.addEventListener('pointerout', e => {
    const from = tipTarget(e.target);
    if (!from || from === tipTarget(e.relatedTarget)) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { hovered = null; showTip(); }, HIDE_DELAY_MS);
  });
  crew.addEventListener('focusin', e => {
    focused = e.target.closest('.worker');
    byFocus = true;
    dismissed = false;
    showTip();
  });
  crew.addEventListener('focusout', () => { focused = null; showTip(); });
  crew.addEventListener('click', e => {
    const worker = e.target.closest('.worker');
    if (worker) return onOpen(worker.dataset.id);
    if (e.target.closest('.counter')) return list.hidden ? openList() : closeList(true);
    const entry = e.target.closest('[data-entry]');
    if (entry) {
      closeList(true);                           // the counter has the focus, so it gets it back when the drawer closes
      onOpen(entry.dataset.entry);
    }
  });

  // --- The "+N done" counter: in a long run, a button after the workers that lists the finished tasks
  // folded away; choosing one opens its drawer. ---

  function syncCounter() {
    const count = office.collapsed.length;
    counter.hidden = !count;
    const text = `+${count} done`;
    if (counter.textContent !== text) counter.textContent = text;
    if (!count) closeList(false);
    else if (!list.hidden) renderList();
  }

  // A focused entry gets its focus back after a rewrite.
  function renderList() {
    const entries = office.collapsed.map(c => `<li><button type="button" data-entry="${esc(c.id)}"${c.id === openId ? ' aria-current="true"' : ''}>` +
      `<b>${esc(c.number)}</b><span class="title">${esc(c.title)}</span>` +
      `<span class="num">${esc(taskDuration(c.task))}</span><span class="num">${money(c.task.cost)}</span></button></li>`).join('');
    const focusedEntry = list.contains(document.activeElement) ? document.activeElement.dataset.entry : null;
    if (setHtml(list, `<p>Finished earlier</p><ul>${entries}</ul>`) && focusedEntry) {
      list.querySelector(`[data-entry="${CSS.escape(focusedEntry)}"]`)?.focus();
    }
  }

  function openList() {
    renderList();
    list.hidden = false;
    counter.setAttribute('aria-expanded', 'true');
    placeList();
    list.querySelector('button')?.focus();
    document.addEventListener('pointerdown', onPointerOutside, true);
  }

  // Returns whether the list was open. `refocus` gives the focus back to the counter.
  function closeList(refocus) {
    if (list.hidden) return false;
    list.hidden = true;
    counter.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerOutside, true);
    if (refocus && !counter.hidden) counter.focus();
    return true;
  }

  function onPointerOutside(e) {
    if (!list.contains(e.target) && !counter.contains(e.target)) closeList(false);
  }

  // Below the counter when there is room in the window, else above it.
  function placeList() {
    if (!list.hidden) placeBeside(list, counter.getBoundingClientRect(), false);
  }

  // Up and down arrows, Home and End move between the entries; leaving the list by Tab closes it.
  list.addEventListener('keydown', e => {
    const entries = [...list.querySelectorAll('button')];
    const i = entries.indexOf(document.activeElement);
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: entries.length - 1 }[e.key];
    if (next === undefined || !entries.length) return;
    e.preventDefault();
    entries[clamp(next, 0, entries.length - 1)].focus();
  });
  list.addEventListener('focusout', e => {
    if (e.relatedTarget && !list.contains(e.relatedTarget) && e.relatedTarget !== counter) closeList(false);
  });

  const onViewport = () => { placeTip(); placeList(); };
  addEventListener('scroll', onViewport, true);
  addEventListener('resize', onViewport);

  // Draws on the next animation frame, once for however many changes come before it.
  function redraw() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function resize() {
    const next = scaleFor(host.clientWidth);
    if (scale && next.device === scale.device && next.css === scale.css && canvas.height === height * next.device) return;
    scale = next;
    canvas.width = WORLD_W * scale.device;       // resizing the canvas also resets its context
    canvas.height = height * scale.device;
    stage.style.width = px(WORLD_W);
    stage.style.height = px(height);
    stage.style.setProperty('--px', scale.css);
    positionOverlay();
    redraw();
  }

  function positionOverlay() {
    if (!scale) return;
    Object.assign(sign.style, { left: px(WORLD_W / 2), top: px(10) });
    for (const worker of office.workers) {
      const spot = spots.get(worker.id), { button, tag } = elements.get(worker.id);
      Object.assign(button.style, { left: px(spot.x), top: px(spot.y), width: px(SPRITE), height: px(SPRITE) });
      Object.assign(tag.style, { left: px(spot.x + SPRITE / 2), top: px(spot.y - 1), maxWidth: px(spot.tagWidth) });
    }
    const slot = spotOf({ place: 'done', slot: doneWorkers(office) });
    Object.assign(counter.style, { left: px(slot.x), top: px(slot.y + 3) });
    placeTip();
    placeList();
  }

  // One button and one tag per task, kept across updates so focus survives a move; buttons stay in task
  // order, followed by the counter and its list.
  function syncElements() {
    const ids = new Set(office.workers.map(w => w.id));
    for (const [id, { button, tag }] of elements) {
      if (!ids.has(id)) { button.remove(); tag.remove(); elements.delete(id); }
    }
    for (const worker of office.workers) {
      let el = elements.get(worker.id);
      if (!el) {
        el = { button: document.createElement('button'), tag: document.createElement('div') };
        el.button.type = 'button';
        el.button.className = 'worker';
        el.button.dataset.id = worker.id;
        el.tag.className = 'tag';
        el.tag.append(document.createElement('b'), document.createElement('span'));
        elements.set(worker.id, el);
      }
      if (el.button.getAttribute('aria-label') !== worker.label) el.button.setAttribute('aria-label', worker.label);
      const [number, title] = el.tag.children;
      if (number.textContent !== worker.number) number.textContent = worker.number;
      if (title.textContent !== worker.title) title.textContent = worker.title;
    }
    keepOrder(crew, [...office.workers.map(w => elements.get(w.id).button), counter, list]);
    keepOrder(tags, office.workers.map(w => elements.get(w.id).tag));
    syncCounter();
    markOpen();
  }

  // The open task's worker, or the counter when that task is folded into it.
  function markOpen() {
    for (const [id, { button, tag }] of elements) {
      if (id === openId) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      tag.classList.toggle('open', id === openId);
    }
    counter.classList.toggle('open', office.collapsed.some(c => c.id === openId));
    if (!list.hidden) renderList();
  }

  function draw() {
    ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawRoom(ctx, height, office);
    const atDesk = office.workers.filter(w => w.place === 'desk' && w.slot === 0);
    const others = office.workers.filter(w => !atDesk.includes(w));
    ctx.drawImage(sceneSprite('chair'), CHAIR.x, CHAIR.y);
    for (const worker of atDesk) drawWorker(ctx, worker, spots.get(worker.id));
    ctx.drawImage(sceneSprite('desk'), DESK.x, DESK.y);
    ctx.drawImage(sceneSprite('monitor'), MONITOR.x, MONITOR.y);
    ctx.drawImage(sceneSprite('keyboard'), KEYBOARD.x, KEYBOARD.y);
    for (const worker of others) drawWorker(ctx, worker, spots.get(worker.id));
    for (const worker of office.workers) drawMarker(ctx, worker, spots.get(worker.id));
    if (spots.has(openId)) drawHighlight(ctx, spots.get(openId));
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  // A window moved to a screen with another pixel ratio keeps its CSS size, so no resize reports that.
  let ratioQuery = null;
  function watchPixelRatio() {
    ratioQuery?.removeEventListener('change', onPixelRatio);
    ratioQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratioQuery.addEventListener('change', onPixelRatio);
  }
  function onPixelRatio() {
    watchPixelRatio();
    resize();
  }
  watchPixelRatio();

  return {
    // A new snapshot of the run: every worker jumps straight to its place.
    update(next) {
      office = next;
      spots = new Map(office.workers.map(w => [w.id, spotOf(w)]));
      height = worldHeight(office);
      // A preflight failure's message is the sign's tooltip, and part of its text for screen readers.
      const preflight = office.preflightError ? `<span class="sr-only">. ${esc(office.preflightError)}</span>` : '';
      sign.className = `sign s-${office.state}`;
      setHtml(sign, `<span class="sr-only">Run state: </span>${esc(STATE_LABEL[office.state] || office.state)}${preflight}`);
      syncElements();
      resize();
      positionOverlay();
      showTip();                                 // new facts for the tooltip shown, or none if its worker left
      redraw();
    },
    // Draws again, with the sprites and colours of the theme now in force.
    redraw,
    // Highlights the worker of the task whose drawer is open; null when none is.
    setOpen(id) {
      openId = id;
      markOpen();
      redraw();
    },
    // Esc: hides the tooltip if one shows, else closes the "+N done" list if it is open. Returns whether
    // it did either.
    dismiss() {
      if (tip.hidden) return closeList(true);
      dismissed = true;
      hideTip();
      return true;
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      observer.disconnect();
      ratioQuery.removeEventListener('change', onPixelRatio);
      closeList(false);
      removeEventListener('scroll', onViewport, true);
      removeEventListener('resize', onViewport);
      stage.remove();
    },
  };
}
