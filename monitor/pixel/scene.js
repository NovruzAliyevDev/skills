// The office: where the zones are, drawing on a canvas at world resolution scaled up by an integer
// factor, and the DOM overlay kept over the sprites: one button and one name tag per worker, and the
// run-state sign. The overlay is the only way in; the canvas is hidden from assistive technology.
import { color, sceneSprite, workerSprite } from './sprites.js';
import { STATE_LABEL, esc } from './panel.js';

// World geometry, in world pixels. Worker rows are 30 apart: a 16 px sprite and room for its name tag.
const WORLD_W = 320;
const MIN_WORLD_H = 164;
const WALL_H = 48;
const ROW = 30;
const SPRITE = 16;
const MAX_CSS_SCALE = 4;
const QUEUE = { place: 'queue', x: 104, y: 74, step: 20, perRow: 6 };   // slot 0 is nearest the desk; the line snakes in rows
const DESK = { x: 152, y: 88 };
const SEAT = { x: 174, y: DESK.y - 13 };                // the desk worker sits behind the desk, which hides the legs
const CHAIR = { x: SEAT.x - 2, y: SEAT.y + 4 };
const MONITOR = { x: 155, y: DESK.y - 12 };
const KEYBOARD = { x: SEAT.x + 1, y: DESK.y + 1 };
// Where the desk task's subagents stand: beside the desk and in front of it. Helpers are up to 10x12.
const HELPER_SPOTS = [{ x: 136, y: 80 }, { x: 204, y: 80 }, { x: 150, y: 104 }, { x: 186, y: 104 }];
const DONE = { place: 'done', x: 236, y: 118, step: 20, perRow: 4 };
const ALERT = { x: 292, y: 66, step: 20 };
const ALERT_ZONE = { x: 264, y: WALL_H, w: WORLD_W - 264, h: 46 };
const DOOR = { x: 10, y: WALL_H - 34 };
const WINDOW = { x: 222, y: 10 };
const BEACON = { x: 298, y: 16 };
const PLANT = { x: 36, y: WALL_H - 14 };
const MARKER_OFFSET = { x: 13, y: 0 };                  // markers sit beside the head, under the name tag

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

// Where a zone's last row ends; it always has at least one row.
function zoneBottom(zone, workers) {
  const count = workers.filter(w => w.place === zone.place).length;
  return zone.y + Math.max(1, Math.ceil(count / zone.perRow)) * ROW;
}

// The world grows taller for long queues instead of shrinking the workers.
function worldHeight(workers) {
  return Math.max(MIN_WORLD_H, zoneBottom(QUEUE, workers), zoneBottom(DONE, workers));
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

function drawRoom(ctx, height, workers) {
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
  const queued = Math.max(QUEUE.perRow, workers.filter(w => w.place === 'queue').length);
  for (let slot = 0; slot < queued; slot++) {
    const { x, y } = spotOf({ place: 'queue', slot });
    fill(x + 2, y + SPRITE + 1, SPRITE - 4, 2, '--scene-hazard');
  }

  for (const { x, y } of HELPER_SPOTS) fill(x + 1, y + 13, 8, 2, '--scene-metal-light');

  // The done zone: a rug under its rows.
  const doneBottom = zoneBottom(DONE, workers) - 8;
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
  ctx.drawImage(workerSprite(worker.anim === 'sleep' ? 'sleep' : 'stand'), spot.x, spot.y);
}

function drawMarker(ctx, worker, spot) {
  if (worker.marker) ctx.drawImage(sceneSprite(worker.marker), spot.x + MARKER_OFFSET.x, spot.y + MARKER_OFFSET.y);
}

// Puts `nodes` in this order under `parent`, moving only the ones out of place: a moved node loses focus.
function keepOrder(parent, nodes) {
  nodes.forEach((node, i) => { if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] || null); });
}

export function createScene(host) {
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const sign = document.createElement('div');
  const tags = document.createElement('div');
  const crew = document.createElement('div');
  stage.className = 'stage';
  canvas.setAttribute('aria-hidden', 'true');
  sign.className = 'sign';
  sign.setAttribute('role', 'status');
  tags.setAttribute('aria-hidden', 'true');
  stage.append(canvas, sign, tags, crew);
  host.replaceChildren(stage);

  const ctx = canvas.getContext('2d');
  const elements = new Map();                    // task id -> { button, tag }
  let office = { state: null, workers: [] };
  let spots = new Map();
  let height = MIN_WORLD_H;
  let scale = null;
  let frame = 0;

  const px = v => `${v * scale.css}px`;

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
  }

  // One button and one tag per task, kept across updates so focus survives a move; buttons stay in task order.
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
        el.tag.className = 'tag';
        el.tag.append(document.createElement('b'), document.createElement('span'));
        elements.set(worker.id, el);
      }
      if (el.button.getAttribute('aria-label') !== worker.label) el.button.setAttribute('aria-label', worker.label);
      const [number, title] = el.tag.children;
      if (number.textContent !== worker.number) number.textContent = worker.number;
      if (title.textContent !== worker.title) title.textContent = worker.title;
    }
    keepOrder(crew, office.workers.map(w => elements.get(w.id).button));
    keepOrder(tags, office.workers.map(w => elements.get(w.id).tag));
  }

  function draw() {
    ctx.setTransform(scale.device, 0, 0, scale.device, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawRoom(ctx, height, office.workers);
    const atDesk = office.workers.filter(w => w.place === 'desk' && w.slot === 0);
    const others = office.workers.filter(w => !atDesk.includes(w));
    ctx.drawImage(sceneSprite('chair'), CHAIR.x, CHAIR.y);
    for (const worker of atDesk) drawWorker(ctx, worker, spots.get(worker.id));
    ctx.drawImage(sceneSprite('desk'), DESK.x, DESK.y);
    ctx.drawImage(sceneSprite('monitor'), MONITOR.x, MONITOR.y);
    ctx.drawImage(sceneSprite('keyboard'), KEYBOARD.x, KEYBOARD.y);
    for (const worker of others) drawWorker(ctx, worker, spots.get(worker.id));
    for (const worker of office.workers) drawMarker(ctx, worker, spots.get(worker.id));
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  return {
    // A new snapshot of the run: every worker jumps straight to its place.
    update(next) {
      office = next;
      spots = new Map(office.workers.map(w => [w.id, spotOf(w)]));
      height = worldHeight(office.workers);
      if (sign.dataset.state !== office.state) {
        sign.dataset.state = office.state;
        sign.className = `sign s-${office.state}`;
        sign.innerHTML = `<span class="sr-only">Run state: </span>${esc(STATE_LABEL[office.state] || office.state)}`;
      }
      syncElements();
      resize();
      positionOverlay();
      redraw();
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.remove();
    },
  };
}
