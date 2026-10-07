// The office: where the zones are, how workers and helpers walk and what they do in place, drawing on
// a canvas at world resolution scaled up by an integer factor, and the DOM overlay kept over the
// sprites: one button and one name tag per worker, a hover target per helper and a "+N" helper marker
// per desk, the run-state sign with a merge sign per parallel group under it, the "+N done" counter with
// its list, and the tooltip. The overlay is the only way in; the canvas is hidden from assistive technology.
import { color, confettiSprite, handsSprite, helperSprite, sceneSprite, workerSprite } from './sprites.js';
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
const DESK_FRONT = DESK.y + 13;                         // a figure whose feet are lower stands in front of the desk
const SEAT = { x: 174, y: DESK.y - 13 };                // the desk worker sits behind the desk, which hides the legs
const CHAIR = { x: SEAT.x - 2, y: SEAT.y + 4 };
const MONITOR = { x: 155, y: DESK.y - 12 };
const KEYBOARD = { x: SEAT.x + 1, y: DESK.y + 1 };
const HANDS = { x: KEYBOARD.x, y: KEYBOARD.y - 1 };
const HELPER_SIZE = { w: 10, h: 12 };
// Where a desk task's subagents stand, one per helper the office draws (HELPERS_SHOWN in workers.js):
// beside the desk and in front of it. A helper comes in at the door, walks along the aisle under the
// wall, then down the desk's left or right `side` to its spot, and leaves the same way back.
const HELPER_SPOTS = [
  { x: 136, y: 80, side: 136 }, { x: 204, y: 80, side: 204 }, { x: 150, y: 104, side: 136 }, { x: 186, y: 104, side: 204 },
];
const DOORWAY = { x: 16, y: WALL_H - HELPER_SIZE.h };
const AISLE_Y = 52;
const HELPERS_MORE = { x: 216, y: 82 };                 // a desk's "+N" marker of the helpers not drawn
// While a parallel group runs, each of its tasks has a desk of its own: the first desk is where the one
// desk always stood, and the others stand in a column under it, DESK_ROW apart, each with its chair, its
// helper spots and its "+N" marker. Desk d is the first desk moved down by d * DESK_ROW. Workers and
// helpers reach a lower desk by a lane beside the column (LANE), so they never walk through the desks above.
const DESK_ROW = 60;                                    // room for the front helpers and, under them, the next name tag at 1x
const LANE = { worker: 120, left: 124, right: 216 };      // x of a worker's lane, and of the helpers' lanes left and right of the desks
const DONE = { x: 236, y: 118, step: 20, perRow: 4 };    // the "+N done" counter takes the slot after its workers
// The alert corner holds two workers a row; a corner of more rows pushes the done zone down by as many.
const ALERT = { x: 292, y: 66, step: 20, perRow: 2 };
const ALERT_ZONE = { x: 264, y: WALL_H, w: WORLD_W - 264, h: 46 };
// Skipped tasks: a grey, empty desk each, in rows under the queue line, left of the workers' lane. `y` is
// how far under the queue line's last row the first row of desks stands.
const SKIPPED = { x: 8, y: 10, step: 54, perRow: 2 };
const SKIPPED_DESK = { w: 44, h: 13 };                  // the desk sprite's size
const SKIPPED_LOOK = { filter: 'grayscale(1)', alpha: 0.55 };
// Group marks, one colour per group in the run's order: a band under the feet of a group's workers in the
// queue line, a plaque on the desk of each of its workers, and their name tags' border.
const GROUP_COLORS = 4;                                 // the --scene-group-N tokens of index.html, in both themes
const GROUP_BAND = { y: SPRITE + 4, h: 2 };
const GROUP_PLAQUE = { x: 4, y: 6, w: 8, h: 4 };
const DOOR = { x: 10, y: WALL_H - 34 };
const WINDOW = { x: 222, y: 10 };
const BEACON = { x: 298, y: 16 };
const PLANT = { x: 36, y: WALL_H - 14 };
const MARKER_OFFSET = { x: 13, y: 0 };                  // markers sit beside the head, under the name tag
// The signs on the wall: the run state, and under it a merge sign per group, rows of them wrapping within
// SIGNS_WIDTH world pixels.
const SIGNS = { x: WORLD_W / 2, y: 10 };
const SIGNS_WIDTH = 180;
// A group's merge step, as the accessible name and tooltip of its sign say it; the sign shows the state's name.
const MERGE_LABEL = { waiting: 'waiting', merging: 'merging', resolving: 'resolving a conflict', merged: 'merged', failed: 'failed' };
const GAP = 6;                                          // CSS pixels between a tooltip or list and what it belongs to
const HIDE_DELAY_MS = 150;                              // time to move the pointer from a worker onto its tooltip

// Motion. Speeds are world pixels per millisecond; a walk frame lasts STRIDE_PX world pixels.
const WORKER_SPEED = 48 / 1000;
const HELPER_SPEED = 64 / 1000;
const STRIDE_PX = 8;
const CELEBRATION_MS = 1500;                            // two hops with the arms up, and confetti
const HOPS_MS = [0, 500];
const HOP_MS = 450;
const HOP_PX = 6;
const CONFETTI_COUNT = 16;
const GRAVITY = 150 / 1e6;                              // world pixels per ms²
const LOOP_MS = 80;                                    // how often figures standing still are drawn again
// Loops in place, in ms: idle figures bob and blink, the desk worker types and its screen scrolls,
// sleepers breathe under a rising "Zz", and the alert corner flashes while its worker waves.
const BOB_EVERY = 2400, BOB_FOR = 400, BLINK_EVERY = 3700, BLINK_FOR = 150;
const TYPE_MS = 200, SCREEN_MS = 900, BREATH_MS = 1200, ZZ_MS = 450, ALARM_MS = 400, HELPER_BOB_MS = 300;

// How far desk `desk` stands below the first one.
const deskDown = desk => desk * DESK_ROW;

// Slots in use: the queue's workers; the done zone's workers and the counter after them; the alert corner's.
const queueSlots = office => office.workers.filter(w => w.place === 'queue').length;
const doneWorkers = office => office.workers.filter(w => w.place === 'done').length;
const doneSlots = office => doneWorkers(office) + (office.collapsed.length ? 1 : 0);
const alertSlots = office => office.workers.filter(w => w.place === 'alert').length;
const skippedSlots = office => office.workers.filter(w => w.place === 'skipped').length;

// How the office is laid out for an office snapshot: its desks, its alert corner's rows, where the done
// zone starts under them, and where the skipped desks start under the queue line.
function layoutOf(office) {
  const alertRows = Math.max(1, Math.ceil(alertSlots(office) / ALERT.perRow));
  return { desks: office.desks || 1, alertRows, doneY: DONE.y + (alertRows - 1) * ROW,
    skippedY: zoneBottom(QUEUE, queueSlots(office)) + SKIPPED.y };
}

// The grey desk of skipped slot `slot`: its top left corner.
function skippedDesk(slot, layout) {
  const row = Math.floor(slot / SKIPPED.perRow), col = slot % SKIPPED.perRow;
  return { x: SKIPPED.x + col * SKIPPED.step, y: layout.skippedY + row * ROW };
}

// Where a worker stands, and how wide its name tag may be. A skipped task has no figure: its spot is at
// the middle of its grey desk's top, so its name tag sits above the desk and its button over it.
function spotOf(worker, layout) {
  const { place, slot } = worker;
  if (place === 'skipped') {
    const desk = skippedDesk(slot, layout);
    return { x: desk.x + (SKIPPED_DESK.w - SPRITE) / 2, y: desk.y - 2, tagWidth: SKIPPED.step - 6 };
  }
  if (place === 'queue') {
    const row = Math.floor(slot / QUEUE.perRow), col = slot % QUEUE.perRow;
    const fromDesk = row % 2 ? QUEUE.perRow - 1 - col : col;
    return { x: QUEUE.x - fromDesk * QUEUE.step, y: QUEUE.y + row * ROW, tagWidth: QUEUE.step - 2 };
  }
  if (place === 'done') {
    const row = Math.floor(slot / DONE.perRow), col = slot % DONE.perRow;
    return { x: DONE.x + col * DONE.step, y: layout.doneY + row * ROW, tagWidth: DONE.step - 2 };
  }
  if (place === 'alert') {
    const row = Math.floor(slot / ALERT.perRow), col = slot % ALERT.perRow;
    return { x: ALERT.x - col * ALERT.step, y: ALERT.y + row * ROW, tagWidth: worker.alone ? 40 : ALERT.step - 2 };
  }
  return { x: SEAT.x, y: SEAT.y + deskDown(slot), tagWidth: 56 };
}
const NARROW_TAG = QUEUE.step - 2;                      // a walking worker's name tag never crowds the others

// Where a zone's last row ends; it always has at least one row.
function zoneBottom(zone, slots, top = zone.y) {
  return top + Math.max(1, Math.ceil(slots / zone.perRow)) * ROW;
}

// The world grows taller for long queues and for more desks instead of shrinking the workers.
function worldHeight(office, layout) {
  const skipped = skippedSlots(office);
  return Math.max(MIN_WORLD_H, zoneBottom(QUEUE, queueSlots(office)), zoneBottom(DONE, doneSlots(office), layout.doneY),
    DESK_FRONT + 28 + deskDown(layout.desks - 1),
    skipped ? layout.skippedY + Math.ceil(skipped / SKIPPED.perRow) * ROW : 0);
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

// --- Walking: a figure stands at distance `s` along its route and walks toward `goal`, another
// distance along it, at constant speed. Routes are straight segments, with no pathfinding. ---

const dedupe = points => points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);

// Every segment is horizontal or vertical.
function routeLength(route) {
  let length = 0;
  for (let i = 1; i < route.length; i++) length += Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y);
  return length;
}

// The point at distance `s` along `route`, and the sideways direction of the segment it is on.
function pointAt(route, s) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (s <= length) {
      const t = length ? s / length : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: Math.sign(b.x - a.x) };
    }
    s -= length;
  }
  const end = route[route.length - 1];
  return { x: end.x, y: end.y, dx: 0 };
}

// A worker walks across, then up or down: out from behind the desk first, and never through it. To a
// lower desk it walks down the lane beside the desks first, then across to its seat.
function workerRoute(from, to, desk) {
  if (desk > 0 && from.x < to.x) {
    return dedupe([{ x: from.x, y: from.y }, { x: LANE.worker, y: from.y }, { x: LANE.worker, y: to.y }, { x: to.x, y: to.y }]);
  }
  return dedupe([{ x: from.x, y: from.y }, { x: to.x, y: from.y }, { x: to.x, y: to.y }]);
}

// A helper's spot at a desk.
function helperSpot(spot, desk) {
  const { x, y, side } = HELPER_SPOTS[spot];
  return { x, y: y + deskDown(desk), side };
}

function helperRoute(spot, desk) {
  const { x, y, side } = helperSpot(spot, desk);
  const lane = desk ? (side < SEAT.x ? LANE.left : LANE.right) : side;
  return dedupe([DOORWAY, { x: DOORWAY.x, y: AISLE_Y }, { x: lane, y: AISLE_Y }, { x: lane, y }, { x, y }]);
}

// Puts a figure at distance `s` along `route`.
function standAt(figure, s) {
  const { x, y } = pointAt(figure.route, s);
  Object.assign(figure, { s, x, y });
}

// A figure on `route`, standing at distance `s` along it and headed for its end.
function figureOn(route, s = 0) {
  const figure = { facing: 1, walked: 0 };
  setRoute(figure, route, s);
  return figure;
}

// Sends a figure along a new route, from distance `s` on it, to its end.
function setRoute(figure, route, s = 0) {
  Object.assign(figure, { route, length: routeLength(route), goal: routeLength(route) });
  standAt(figure, s);
}

const walking = figure => figure.s !== figure.goal;

// Puts a walking figure where its walk ends, at once.
function finish(figure) {
  standAt(figure, figure.goal);
}

// A helper whose subagent ended walks its route back to the door; one at work again turns back to its spot.
function leave(figure) {
  Object.assign(figure, { leaving: true, goal: 0 });
}

function comeBack(figure) {
  Object.assign(figure, { leaving: false, goal: figure.length });
}

// Moves a walking figure on by `ms` of walking at `speed`. Returns whether it moved.
function stepFigure(figure, ms, speed) {
  if (!walking(figure)) return false;
  const direction = Math.sign(figure.goal - figure.s);
  const step = Math.min(Math.abs(figure.goal - figure.s), speed * ms);
  const s = figure.s + direction * step, { x, y, dx } = pointAt(figure.route, s);
  Object.assign(figure, { s, x, y });
  figure.walked += step;
  if (dx) figure.facing = dx * direction;
  return true;
}

const walkFrame = figure => (Math.floor(figure.walked / STRIDE_PX) % 2 ? 'walk2' : 'walk1');

// The height of a celebrating worker's hop, `ms` into its celebration.
function hop(ms) {
  for (const start of HOPS_MS) {
    const u = (ms - start) / HOP_MS;
    if (u >= 0 && u <= 1) return Math.round(4 * HOP_PX * u * (1 - u));
  }
  return 0;
}

// Confetti thrown up from a worker's head: each piece flies on its own and falls.
function confettiFrom(figure, now) {
  return Array.from({ length: CONFETTI_COUNT }, (_, piece) => ({
    piece, x: figure.x + SPRITE / 2, y: figure.y + 2,
    vx: (Math.random() * 2 - 1) * 0.04, vy: -(0.04 + Math.random() * 0.05), at: now,
  }));
}

// A stable time offset per figure, in ms, so the loops of figures side by side do not run in step.
function offsetOf(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 10007;
  return h * 37;
}

// Whether time `t` falls in the second of two alternating stretches of `ms`: the beat of two-frame loops.
const offBeat = (t, ms) => Math.floor(t / ms) % 2 === 1;
const blinking = t => t % BLINK_EVERY < BLINK_FOR;

function drawRoom(ctx, height, office, layout) {
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

  for (let desk = 0; desk < layout.desks; desk++) {
    for (let spot = 0; spot < HELPER_SPOTS.length; spot++) {
      const { x, y } = helperSpot(spot, desk);
      fill(x + 1, y + HELPER_SIZE.h + 1, HELPER_SIZE.w - 2, 2, '--scene-metal-light');
    }
  }

  // The done zone: a rug under its rows.
  const top = layout.doneY;
  const doneBottom = zoneBottom(DONE, doneSlots(office), top) - 8;
  fill(DONE.x - 8, top - 16, WORLD_W - DONE.x + 4, doneBottom - top + 16, '--scene-rug-edge');
  fill(DONE.x - 6, top - 14, WORLD_W - DONE.x, doneBottom - top + 12, '--scene-rug');

  // The alert corner: red floor inside hazard stripes.
  const z = { ...ALERT_ZONE, h: ALERT_ZONE.h + (layout.alertRows - 1) * ROW };
  fill(z.x, z.y, z.w, z.h, '--scene-alert-floor');
  for (let y = z.y; y < z.y + z.h; y++) {
    for (let x = z.x; x < z.x + z.w; x++) {
      if (x >= z.x + 3 && y < z.y + z.h - 3) continue;
      fill(x, y, 1, 1, ((x + y) >> 2) % 2 ? '--scene-hazard' : '--scene-ink');
    }
  }

  ctx.drawImage(sceneSprite('door'), DOOR.x, DOOR.y);
  ctx.drawImage(sceneSprite('window'), WINDOW.x, WINDOW.y);
  ctx.drawImage(sceneSprite('plant'), PLANT.x, PLANT.y);
}

// Corner brackets around the worker whose drawer is open, or around a skipped task's desk (`size`). The
// top ones sit just under its name tag.
function drawHighlight(ctx, x, y, size = { w: SPRITE, h: SPRITE }) {
  const left = x - 2, right = x + size.w + 1, top = y, bottom = y + size.h + 1, arm = 4;
  ctx.fillStyle = color('--accent');
  for (const [cx, cy, dx, dy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]]) {
    ctx.fillRect(dx > 0 ? cx : cx - arm + 1, cy, arm, 1);
    ctx.fillRect(cx, dy > 0 ? cy : cy - arm + 1, 1, arm);
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

// `onOpen(taskId, tab)` is called when a worker, an entry of the "+N done" list, a helper (with tab
// 'activity'), or a merge sign whose group has a conflict session (with its id) is activated.
export function createScene(host, { onOpen }) {
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const board = document.createElement('div');
  const sign = document.createElement('div');
  const mergeRow = document.createElement('div');
  const tags = document.createElement('div');
  const helperLayer = document.createElement('div');
  const crew = document.createElement('div');
  const counter = document.createElement('button');
  const list = document.createElement('div');
  const tip = document.createElement('div');
  stage.className = 'stage';
  canvas.setAttribute('aria-hidden', 'true');
  sign.className = 'sign';
  sign.setAttribute('role', 'status');
  sign.hidden = true;                            // until the run's first snapshot says its state
  board.className = 'signs';
  mergeRow.className = 'merge-signs';
  board.append(sign, mergeRow);
  tags.setAttribute('aria-hidden', 'true');
  // Helpers are for the pointer only: the desk worker's name says how many there are.
  helperLayer.setAttribute('aria-hidden', 'true');
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
  stage.append(canvas, board, tags, helperLayer, crew, tip);
  host.replaceChildren(stage);

  const ctx = canvas.getContext('2d');
  const elements = new Map();                    // task id -> { button, tag }
  const walkers = new Map();                     // task id -> its worker's figure
  const helpers = new Map();                     // helper id -> its figure, kept while it walks out
  const targets = new Map();                     // helper id -> its hover target
  const mores = new Map();                       // task id -> its desk's "+N" marker
  const mergeSigns = new Map();                  // group id -> its merge sign
  let office = { state: null, preflightError: null, workers: [], collapsed: [], merges: [], desks: 1, helpers: [], otherHelpers: [], first: true };
  let layout = layoutOf(office);
  let openId = null;                             // the task whose drawer is open
  let height = MIN_WORLD_H;
  let scale = null;
  let room = null, roomKey = '';                 // the room, drawn once per layout and theme
  let frame = 0, loopTimer = 0, lastFrameAt = 0;

  // With reduced motion, figures go to their place at once, with no walking, confetti or loops.
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let still = motion.matches;

  const px = v => `${v * scale.css}px`;
  const workerOf = id => office.workers.find(w => w.id === id);

  // --- The tooltip: for the hovered element or the focused worker, whichever came last, until Esc. ---

  let hovered = null, focused = null, byFocus = false, shownFor = null, dismissed = false, hideTimer = 0;

  // What a pointer or focus event is about: a worker button, a helper, a sign, or the tooltip itself.
  function tipTarget(node) {
    return node instanceof Element ? node.closest('.worker, .helper, .helpers-more, .sign, .tip') : null;
  }

  function tipHtml(target) {
    if (target === sign) return office.preflightError && `<p class="tip-title">${badge(office.state)}</p><p>${esc(office.preflightError)}</p>`;
    if (target.classList.contains('merge-sign')) return mergeTipHtml(office.merges.find(m => m.group === target.dataset.group));
    const parent = workerOf(target.dataset.task);
    const owner = parent && office.desks > 1 ? `<p class="muted">Subagents of ${esc(parent.number)} ${esc(parent.title)}</p>` : '';
    if (target.classList.contains('helpers-more')) {
      const others = office.otherHelpers.find(o => o.task === target.dataset.task)?.list || [];
      return others.length && `<p class="tip-title">${others.length} more ${others.length === 1 ? 'helper' : 'helpers'}</p>` +
        `<ul class="tip-list">${others.map(h => `<li><b>${esc(h.type)}</b> ${esc(h.description)}</li>`).join('')}</ul>${owner}`;
    }
    if (target.classList.contains('helper')) {
      const helper = office.helpers.find(h => h.id === target.dataset.helper);
      return helper && `<p class="tip-title">Helper · <b>${esc(helper.type)}</b></p><p>${esc(helper.description)}</p>` +
        (parent ? `<p class="muted">Subagent of ${esc(parent.number)} ${esc(parent.title)}</p>` : '');
    }
    const worker = workerOf(target.dataset.id);
    if (!worker) return null;
    const group = worker.conflict ? `<p class="muted">Conflict session of the merge of group ${esc(worker.group)}</p>`
      : worker.group ? `<p class="muted">Parallel group ${esc(worker.group)}</p>` : '';
    return `<p class="tip-title"><b>${esc(worker.number)}</b> ${esc(worker.title)}</p>${group}${badge(worker.state)}${taskFacts(worker.task)}`;
  }

  // A merge sign's tooltip: the merge step's state, the branches merged so far, why it failed, and the
  // conflict session to open.
  function mergeTipHtml(merge) {
    if (!merge) return null;
    const conflict = merge.conflict && workerOf(merge.conflict);
    const rows = [];
    if (merge.merged.length) rows.push(['Merged', merge.merged.map(id => `task ${id}`).join(', ')]);
    if (conflict?.task.conflictTask) rows.push(['Conflict merging', `task ${conflict.task.conflictTask}`]);
    if (merge.reason) rows.push(['Stop reason', merge.reason]);
    const facts = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');
    return `<p class="tip-title">Merge of group ${esc(merge.group)}</p>` +
      `<span class="badge m-${esc(merge.state)}">${esc(MERGE_LABEL[merge.state] || merge.state)}</span>` +
      (facts ? `<dl class="task-facts">${facts}</dl>` : '') +
      (conflict ? `<p class="muted">Conflict session ${esc(STATE_LABEL[conflict.state] || conflict.state)}: activate the sign to open it.</p>` : '');
  }

  function showTip() {
    if (hovered && !hovered.isConnected) hovered = null;
    if (focused && !focused.isConnected) focused = null;
    const target = dismissed ? null : byFocus ? focused || hovered : hovered || focused;
    const html = target && tipHtml(target);
    if (!html) return hideTip();
    if (shownFor !== target) shownFor?.removeAttribute('aria-describedby');
    shownFor = target;
    if (target.classList.contains('worker') || target.classList.contains('merge-sign')) target.setAttribute('aria-describedby', tip.id);
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
  mergeRow.addEventListener('focusin', e => {
    focused = e.target.closest('.merge-sign');
    byFocus = true;
    dismissed = false;
    showTip();
  });
  mergeRow.addEventListener('focusout', () => { focused = null; showTip(); });
  // A merge sign opens its group's conflict session, when there is one.
  mergeRow.addEventListener('click', e => {
    const merge = office.merges.find(m => m.group === e.target.closest('.merge-sign')?.dataset.group);
    if (merge?.conflict) onOpen(merge.conflict);
  });
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
  // A helper, or a "+N" marker, opens its task's drawer on Activity, where its subagent's work shows.
  helperLayer.addEventListener('click', e => {
    const task = e.target.closest('.helper, .helpers-more')?.dataset.task;
    if (task) onOpen(task, 'activity');
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

  // --- Drawing: on the next animation frame, once for however many changes come before it. While
  // something walks or celebrates, every frame is drawn; while figures only loop in place, a frame
  // every LOOP_MS. ---

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(onFrame);
  }

  function onFrame(now) {
    frame = 0;
    clearTimeout(loopTimer);
    const sinceLast = lastFrameAt ? now - lastFrameAt : 0;
    lastFrameAt = now;
    const moving = advance(sinceLast, now);
    draw(now);
    if (moving) {
      positionOverlay();
      requestDraw();
      return;
    }
    lastFrameAt = 0;
    if (!still && (walkers.size || helpers.size)) loopTimer = setTimeout(requestDraw, LOOP_MS);
  }

  // Walks and celebrations, `ms` after the frame before. Returns whether anything moves.
  function advance(ms, now) {
    let moving = false;
    for (const figure of walkers.values()) {
      moving = stepFigure(figure, ms, WORKER_SPEED) || moving;
      if (figure.cheerOnArrival && !walking(figure)) {
        figure.cheerOnArrival = false;
        figure.cheer = { at: now, confetti: confettiFrom(figure, now) };
      }
      if (figure.cheer && now - figure.cheer.at >= CELEBRATION_MS) figure.cheer = null;
      if (figure.cheer) moving = true;
    }
    for (const [id, figure] of helpers) {
      moving = stepFigure(figure, ms, HELPER_SPEED) || moving;
      if (figure.leaving && !walking(figure)) helpers.delete(id);
    }
    return moving;
  }

  function roomCanvas() {
    const key = `${height}|${queueSlots(office)}|${doneSlots(office)}|${layout.desks}|${layout.alertRows}`;
    if (room && roomKey === key) return room;
    room = document.createElement('canvas');
    room.width = WORLD_W;
    room.height = height;
    drawRoom(room.getContext('2d'), height, office, layout);
    roomKey = key;
    return room;
  }

  // The frame a worker shows where it stands.
  function restFrame(worker, now) {
    const t = now + offsetOf(worker.id);
    if (still) return worker.anim === 'sleep' ? 'sleep' : 'stand';
    if (worker.anim === 'sleep') return offBeat(t, BREATH_MS) ? 'sleep-bob' : 'sleep';
    if (worker.anim === 'alarm') return offBeat(now, ALARM_MS) ? 'cheer' : 'stand';   // in time with the beacon
    if (worker.anim === 'type') return blinking(t) ? 'blink' : 'stand';
    return t % BOB_EVERY >= BOB_EVERY - BOB_FOR ? 'bob' : blinking(t) ? 'blink' : 'stand';
  }

  // A worker marked to be skipped is drawn greyed, as a skipped task's desk is.
  function drawWorker(worker, figure, now) {
    const x = Math.round(figure.x), y = Math.round(figure.y);
    if (worker.skipPending) greyed(true);
    if (walking(figure)) ctx.drawImage(workerSprite(worker.look, walkFrame(figure), figure.facing < 0), x, y);
    else if (figure.cheer) ctx.drawImage(workerSprite(worker.look, 'cheer'), x, y - hop(now - figure.cheer.at));
    else ctx.drawImage(workerSprite(worker.look, restFrame(worker, now)), x, y);
    if (worker.skipPending) greyed(false);
  }

  // Draws what follows in grey and faded, until called with false.
  function greyed(on) {
    if (!on) return ctx.restore();
    ctx.save();
    ctx.filter = SKIPPED_LOOK.filter;
    ctx.globalAlpha = SKIPPED_LOOK.alpha;
  }

  // A skipped task's desk: the desk and its dark screen, grey and empty, with no chair and no worker.
  function drawSkippedDesk(worker) {
    const { x, y } = skippedDesk(worker.slot, layout);
    greyed(true);
    ctx.drawImage(sceneSprite('desk'), x, y);
    ctx.drawImage(sceneSprite('monitor'), x + MONITOR.x - DESK.x, y + MONITOR.y - DESK.y);
    greyed(false);
  }

  function drawHelper(id, figure, now) {
    const { look } = figure.helper;
    let sprite;
    if (walking(figure)) sprite = helperSprite(look, walkFrame(figure), figure.facing < 0);
    else sprite = helperSprite(look, !still && offBeat(now + offsetOf(id), HELPER_BOB_MS) ? 'bob' : 'stand');
    ctx.drawImage(sprite, Math.round(figure.x), Math.round(figure.y));
  }

  const groupToken = worker => `--scene-group-${worker.groupIndex % GROUP_COLORS}`;
  const groupColor = worker => color(groupToken(worker));

  // A desk, its screen and keyboard, the hands of the worker typing there, and the plaque of its worker's
  // group.
  function drawDesk(desk, now) {
    const down = deskDown(desk);
    const seated = office.workers.find(w => w.place === 'desk' && w.slot === desk && !walking(walkers.get(w.id)));
    const typist = seated?.anim === 'type' ? seated : null;
    const moving = typist && !still;
    ctx.drawImage(sceneSprite('desk'), DESK.x, DESK.y + down);
    ctx.drawImage(sceneSprite(moving && offBeat(now, SCREEN_MS) ? 'monitor-scrolled' : 'monitor'), MONITOR.x, MONITOR.y + down);
    ctx.drawImage(sceneSprite('keyboard'), KEYBOARD.x, KEYBOARD.y + down);
    if (typist) ctx.drawImage(handsSprite(typist.look, moving && offBeat(now, TYPE_MS) ? 1 : 0), HANDS.x, HANDS.y + down);
    if (seated?.group) {
      const { x, y, w, h } = GROUP_PLAQUE;
      ctx.fillStyle = color('--scene-ink');
      ctx.fillRect(DESK.x + x - 1, DESK.y + down + y - 1, w + 2, h + 2);
      ctx.fillStyle = groupColor(seated);
      ctx.fillRect(DESK.x + x, DESK.y + down + y, w, h);
    }
  }

  // The band under the feet of a group's workers waiting in the queue line; neighbours' bands join.
  function drawQueueBands() {
    for (const worker of office.workers) {
      const figure = walkers.get(worker.id);
      if (worker.place !== 'queue' || !worker.group || walking(figure)) continue;
      ctx.fillStyle = groupColor(worker);
      ctx.fillRect(Math.round(figure.x) - (QUEUE.step - SPRITE) / 2, Math.round(figure.y) + GROUP_BAND.y, QUEUE.step, GROUP_BAND.h);
    }
  }

  // A worker's marker shows once it stands in its place. The "Zz" rises and the "!" bounces, staying
  // under the name tag.
  function drawMarker(worker, figure, now) {
    if (!worker.marker || walking(figure) || figure.cheer) return;
    let dy = 0;
    if (!still && worker.marker === 'zz') dy = 2 - (Math.floor((now + offsetOf(worker.id)) / ZZ_MS) % 3);
    if (!still && worker.marker === 'alert') dy = offBeat(now, ALARM_MS) ? 0 : 1;
    ctx.drawImage(sceneSprite(worker.marker), Math.round(figure.x) + MARKER_OFFSET.x, Math.round(figure.y) + MARKER_OFFSET.y + dy);
  }

  function drawConfetti(now) {
    for (const figure of walkers.values()) {
      for (const p of figure.cheer?.confetti || []) {
        const t = now - p.at;
        ctx.drawImage(confettiSprite(p.piece), Math.round(p.x + p.vx * t), Math.round(p.y + p.vy * t + (GRAVITY * t * t) / 2));
      }
    }
  }

  // Figures are drawn from the back of the room to the front, the desk among them, so a worker behind
  // the desk is hidden below the waist and a helper in front of it is not.
  function draw(now) {
    ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(roomCanvas(), 0, 0);
    const alarm = office.workers.some(w => w.anim === 'alarm' && !walking(walkers.get(w.id)));
    ctx.drawImage(sceneSprite(alarm && (still || offBeat(now, ALARM_MS)) ? 'beacon' : 'beacon-off'), BEACON.x, BEACON.y);
    drawQueueBands();
    for (let desk = 0; desk < layout.desks; desk++) ctx.drawImage(sceneSprite('chair'), CHAIR.x, CHAIR.y + deskDown(desk));
    const layers = office.workers.map(worker => {
      if (worker.place === 'skipped') return { feet: skippedDesk(worker.slot, layout).y + SKIPPED_DESK.h, paint: () => drawSkippedDesk(worker) };
      const figure = walkers.get(worker.id);
      return { feet: figure.y + SPRITE, paint: () => drawWorker(worker, figure, now) };
    });
    for (const [id, figure] of helpers) layers.push({ feet: figure.y + HELPER_SIZE.h, paint: () => drawHelper(id, figure, now) });
    for (let desk = 0; desk < layout.desks; desk++) layers.push({ feet: DESK_FRONT + deskDown(desk), paint: () => drawDesk(desk, now) });
    layers.sort((a, b) => a.feet - b.feet);
    for (const layer of layers) layer.paint();
    for (const worker of office.workers) drawMarker(worker, walkers.get(worker.id), now);
    drawConfetti(now);
    const open = walkers.get(openId), openWorker = workerOf(openId);
    if (openWorker?.place === 'skipped') {
      const desk = skippedDesk(openWorker.slot, layout);
      drawHighlight(ctx, desk.x, desk.y, SKIPPED_DESK);
    } else if (open) drawHighlight(ctx, Math.round(open.x), Math.round(open.y));
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
    requestDraw();
  }

  // Buttons and name tags follow their workers, and hover targets their helpers, while they walk.
  function positionOverlay() {
    if (!scale) return;
    Object.assign(board.style, { left: px(SIGNS.x), top: px(SIGNS.y) });
    mergeRow.style.maxWidth = px(SIGNS_WIDTH);
    for (const worker of office.workers) {
      const figure = walkers.get(worker.id), { button, tag } = elements.get(worker.id);
      const x = Math.round(figure.x), y = Math.round(figure.y);
      const tagWidth = walking(figure) ? Math.min(NARROW_TAG, figure.spot.tagWidth) : figure.spot.tagWidth;
      // A skipped task's button covers its desk.
      const box = worker.place === 'skipped' ? { ...skippedDesk(worker.slot, layout), ...SKIPPED_DESK } : { x, y, w: SPRITE, h: SPRITE };
      Object.assign(button.style, { left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h) });
      Object.assign(tag.style, { left: px(x + SPRITE / 2), top: px(y - 1), maxWidth: px(tagWidth) });
    }
    for (const [id, target] of targets) {
      const figure = helpers.get(id);
      Object.assign(target.style, { left: px(Math.round(figure.x)), top: px(Math.round(figure.y)), width: px(HELPER_SIZE.w), height: px(HELPER_SIZE.h) });
    }
    for (const { task, desk } of office.otherHelpers) {
      Object.assign(mores.get(task).style, { left: px(HELPERS_MORE.x), top: px(HELPERS_MORE.y + deskDown(desk)) });
    }
    const slot = spotOf({ place: 'done', slot: doneWorkers(office) }, layout);
    Object.assign(counter.style, { left: px(slot.x), top: px(slot.y + 3) });
    placeTip();
    placeList();
  }

  // One button and one tag per task, kept across updates so focus survives a move; buttons stay in task
  // order, followed by the counter and its list. One hover target per helper drawn.
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
      // A group's mark on the name tag, while its worker waits in the queue line or sits at a desk.
      const marked = !!worker.group && (worker.place === 'queue' || worker.place === 'desk');
      el.tag.classList.toggle('grouped', marked);
      if (marked) el.tag.style.setProperty('--group', `var(${groupToken(worker)})`);
      el.tag.classList.toggle('skipped', worker.place === 'skipped' || worker.skipPending);
    }
    keepOrder(crew, [...office.workers.map(w => elements.get(w.id).button), counter, list]);
    keepOrder(tags, office.workers.map(w => elements.get(w.id).tag));

    const drawn = new Set(office.helpers.map(h => h.id));
    for (const [id, target] of targets) {
      if (!drawn.has(id)) { target.remove(); targets.delete(id); }
    }
    for (const helper of office.helpers) {
      if (targets.has(helper.id)) continue;
      const target = document.createElement('div');
      target.className = 'helper';
      target.dataset.helper = helper.id;
      target.dataset.task = helper.task;
      helperLayer.append(target);
      targets.set(helper.id, target);
    }
    const waiting = new Set(office.otherHelpers.map(o => o.task));
    for (const [task, marker] of mores) {
      if (!waiting.has(task)) { marker.remove(); mores.delete(task); }
    }
    for (const { task, list: others } of office.otherHelpers) {
      let marker = mores.get(task);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'helpers-more';
        marker.dataset.task = task;
        helperLayer.append(marker);
        mores.set(task, marker);
      }
      marker.textContent = `+${others.length}`;
    }
    syncMergeSigns();
    syncCounter();
    markOpen();
  }

  // One merge sign per group, in the run's order, kept across updates so focus survives. Its accessible
  // name gives the group and the merge state, and whether it opens a conflict session.
  function syncMergeSigns() {
    const groups = new Set(office.merges.map(m => m.group));
    for (const [group, button] of mergeSigns) {
      if (!groups.has(group)) { button.remove(); mergeSigns.delete(group); }
    }
    for (const merge of office.merges) {
      let button = mergeSigns.get(merge.group);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.group = merge.group;
        mergeSigns.set(merge.group, button);
      }
      button.className = `sign merge-sign m-${merge.state}`;   // markOpen marks the open one again
      button.style.setProperty('--group', `var(--scene-group-${merge.groupIndex % GROUP_COLORS})`);
      const label = `Merge of group ${merge.group}: ${MERGE_LABEL[merge.state] || merge.state}${merge.conflict ? ' · opens the conflict session' : ''}`;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      const text = `Merge ${merge.group} · ${merge.state}`;
      if (button.textContent !== text) button.textContent = text;
    }
    keepOrder(mergeRow, office.merges.map(m => mergeSigns.get(m.group)));
  }

  // Workers go to their spots: they walk when they move while someone watches, else they are placed
  // there. Helpers walk in from the door and back out, unless the office says to place them. A change
  // that comes while the page is hidden is not played back later.
  function moveFigures() {
    const live = !office.first && !still && !document.hidden;
    const ids = new Set(office.workers.map(w => w.id));
    for (const id of walkers.keys()) if (!ids.has(id)) walkers.delete(id);
    for (const worker of office.workers) {
      const spot = spotOf(worker, layout);
      let figure = walkers.get(worker.id);
      // A worker whose spot moved with the layout (the done zone under a deeper alert corner) walks there too.
      const shifted = figure && (figure.spot.x !== spot.x || figure.spot.y !== spot.y);
      // A skipped task's worker never walks to its desk: the desk only shows there, empty.
      if (!figure) walkers.set(worker.id, figure = figureOn([spot]));
      else if (!live || worker.place === 'skipped') setRoute(figure, [spot]);
      else if (worker.moved || shifted) {
        setRoute(figure, workerRoute(figure, spot, worker.place === 'desk' ? worker.slot : 0));
        figure.cheer = null;
      }
      figure.spot = spot;
      figure.cheerOnArrival = live && worker.state === 'done' && (worker.celebrate || !!figure.cheerOnArrival);
      if (!live) figure.cheer = null;
    }

    const drawn = new Set(office.helpers.map(h => h.id));
    for (const [id, figure] of helpers) {
      if (drawn.has(id) || figure.leaving) continue;
      if (live) leave(figure);
      else helpers.delete(id);
    }
    for (const helper of office.helpers) {
      let figure = helpers.get(helper.id);
      if (!figure) {
        const route = helperRoute(helper.spot, helper.desk);
        figure = figureOn(route, live && helper.arrive === 'walk' ? 0 : routeLength(route));
        helpers.set(helper.id, figure);
      } else if (figure.leaving) comeBack(figure);
      figure.helper = helper;
    }
  }

  // Everyone in place at once: for reduced motion, and for a page put out of sight.
  function settle() {
    for (const figure of walkers.values()) {
      finish(figure);
      Object.assign(figure, { cheer: null, cheerOnArrival: false });
    }
    for (const [id, figure] of helpers) {
      if (figure.leaving) helpers.delete(id);
      else finish(figure);
    }
  }

  function jumpToPlaces() {
    settle();
    positionOverlay();
    requestDraw();
  }

  function onMotion() {
    still = motion.matches;
    if (still) jumpToPlaces();
  }
  motion.addEventListener('change', onMotion);

  // A page put out of sight finishes its walks at once, so nothing is played back when it shows again.
  function onVisibility() {
    if (document.hidden) jumpToPlaces();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // The open task's worker, or the counter when that task is folded into it.
  function markOpen() {
    for (const [id, { button, tag }] of elements) {
      if (id === openId) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      tag.classList.toggle('open', id === openId);
    }
    counter.classList.toggle('open', office.collapsed.some(c => c.id === openId));
    for (const merge of office.merges) mergeSigns.get(merge.group)?.classList.toggle('open', !!openId && merge.conflict === openId);
    if (!list.hidden) renderList();
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
    // The office of a new snapshot, or of new helpers (see createOffice).
    update(next) {
      office = next;
      layout = layoutOf(office);
      moveFigures();
      // A desk stays while its worker walks away from it, and a figure still walking from a desk that is
      // gone keeps the world tall enough for its walk; the next snapshot after the walk lets both go.
      for (const figure of walkers.values()) {
        const from = figure.route[0], desk = (from.y - SEAT.y) / DESK_ROW;
        if (walking(figure) && from.x === SEAT.x && Number.isInteger(desk) && desk >= 0) layout.desks = Math.max(layout.desks, desk + 1);
      }
      let reach = 0;
      for (const [figure, size] of [...[...walkers.values()].map(f => [f, SPRITE]), ...[...helpers.values()].map(f => [f, HELPER_SIZE.h])]) {
        if (walking(figure)) reach = Math.max(reach, ...figure.route.map(p => p.y + size + 4));
      }
      height = Math.max(worldHeight(office, layout), reach);
      // A preflight failure's message is the sign's tooltip, and part of its text for screen readers.
      const preflight = office.preflightError ? `<span class="sr-only">. ${esc(office.preflightError)}</span>` : '';
      sign.className = `sign s-${office.state}`;
      sign.hidden = false;
      const state = office.state === 'finished-with-skips' ? `finished, ${skippedSlots(office)} skipped` : STATE_LABEL[office.state] || office.state;
      setHtml(sign, `<span class="sr-only">Run state: </span>${esc(state)}${preflight}`);
      syncElements();
      resize();
      positionOverlay();
      showTip();                                 // new facts for the tooltip shown, or none if its target left
      requestDraw();
    },
    // Draws again, with the sprites and colours of the theme now in force.
    redraw() {
      room = null;
      requestDraw();
    },
    // Highlights the worker of the task whose drawer is open; null when none is.
    setOpen(id) {
      openId = id;
      markOpen();
      requestDraw();
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
      clearTimeout(loopTimer);
      clearTimeout(hideTimer);
      observer.disconnect();
      ratioQuery.removeEventListener('change', onPixelRatio);
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      closeList(false);
      removeEventListener('scroll', onViewport, true);
      removeEventListener('resize', onViewport);
      stage.remove();
    },
  };
}
