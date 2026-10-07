// The art. A sprite is a text matrix: one character per pixel, '.' transparent, any other character a
// palette key. Each sprite is painted once per palette into an offscreen canvas, and cached until the
// theme changes.

// Workers are 16x16, painted in layers: the body, then a hair style, then the eyes of a frame. A layer's
// '.' leaves what is under it; a frame may then swap whole rows (legs, arms) or squash the body. Keys:
// o outline, s skin, S mouth, e eyes, h hair, c shirt, p trousers, k shoes. Frames face right; a sprite
// asked for mirrored faces left.
const _ = '................';
const BODY = [
  _,
  '.....oooooo.....',
  '....osssssso....',
  '...osssssssso...',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '...osssSSssso...',
  '....oooooooo....',
  '...occcccccco...',
  '..occcccccccco..',
  '..osoccccccoso..',
  '...opppoopppo...',
  '...okko..okko...',
];
const HAIR = {
  short: [
    _, _,
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hhh....hhh...',
    '...h........h...',
  ],
  long: [
    _, _,
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '.ohhhhh..hhhhho.',
    '.ohhh......hhho.',
    '.ohh........hho.',
    '.ohh........hho.',
    '.ohh........hho.',
    '.ohh........hho.',
    '.ohho......ohho.',
    '..oo........oo..',
  ],
  spiky: [
    '.....o.oo.o.....',
    '....ohohhoho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...hhhhhhhhhh...',
    '...hh......hh...',
  ],
  bun: [
    '......oooo......',
    '.....ohhhho.....',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hh......hh...',
    '...h........h...',
  ],
  fringe: [
    _, _,
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hhhhhhh.hh...',
    '...hhhh.....h...',
  ],
  buzz: [
    _, _,
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...h........h...',
  ],
};
const EYES = {
  open: [_, _, _, _, _, _, _, '......e..e......'],
  ahead: [_, _, _, _, _, _, _, '.......e..e.....'],   // looking the way it walks
  blink: [_, _, _, _, _, _, _, '.....ee..ee.....'],
  shut: [_, _, _, _, _, _, _, _, '.....ee..ee.....'],
};
// Rows 14-15 while walking: a stride, then the legs passing each other.
const STRIDE = ['..opppo..opppo..', '.okko......okko.'];
const PASSING = ['....oppppppo....', '....okkookko....'];
// Arms raised beside the head (rows 5-10), over a torso without hands (rows 11-13).
const ARMS_UP = [
  _, _, _, _, _,
  '.o............o.',
  'oso..........oso',
  'oso..........oso',
  'oco..........oco',
  '.oco........oco.',
  '..oco......oco..',
];
const TORSO = ['...occcccccco...', '...occcccccco...', '...occcccccco...'];
// stand, blink and bob idle; type at the desk with the hands sprite; sleep and sleep-bob breathe; walk1
// and walk2 walk; cheer has the arms up, to celebrate or to call for help.
const WORKER_FRAMES = {
  'stand': { eyes: 'open' },
  'blink': { eyes: 'blink' },
  'bob': { eyes: 'open', squash: true },
  'sleep': { eyes: 'shut' },
  'sleep-bob': { eyes: 'shut', squash: true },
  'walk1': { eyes: 'ahead', legs: STRIDE },
  'walk2': { eyes: 'ahead', legs: PASSING },
  'cheer': { eyes: 'open', arms: true },
};

// The typing hands on the keyboard, one hand lower than the other in turn. Key: s skin.
const HANDS = [
  ['..........ss..', '..ss......ss..', '..ss..........'],
  ['..ss..........', '..ss......ss..', '..........ss..'],
];

// Helpers, the desk task's subagents, are 10x12 in a cap of the accent colour. Keys as for workers,
// plus a for the cap.
const HELPER = [
  '..oooooo..',
  '.oaaaaaao.',
  'oaaaaaaaao',
  '.osssssso.',
  '.osesseso.',
  '.ossSSsso.',
  '..oooooo..',
  '.occcccco.',
  'osccccccso',
  '.occcccco.',
  '.oppooppo.',
  '.okkookko.',
];
const HELPER_FRAMES = {
  'stand': {},
  'bob': { squash: true },
  'walk1': { eyes: '.ossesseo.', legs: ['oppo..oppo', 'okko..okko'] },
  'walk2': { eyes: '.ossesseo.', legs: ['..oppppo..', '..okkkko..'] },
};

// Confetti pieces, in colours that read on the light and the dark floor alike.
const CONFETTI = [
  { color: '#e8505b', rows: ['xx'] }, { color: '#f6c445', rows: ['x', 'x'] }, { color: '#3fb27f', rows: ['xx'] },
  { color: '#4a8fe7', rows: ['x'] }, { color: '#a86ce0', rows: ['x', 'x'] }, { color: '#ff8f3f', rows: ['xx'] },
];

// A worker's look comes from these palettes, chosen to read on the light and the dark floor alike.
const SKINS = [
  { s: '#f7d9bd', S: '#c98f73' }, { s: '#f2c7a0', S: '#b9765c' }, { s: '#e0a97e', S: '#a5654a' },
  { s: '#c1855a', S: '#874f35' }, { s: '#93603d', S: '#5e3825' }, { s: '#6e472c', S: '#422819' },
];
const HAIRS = ['#2e2523', '#a9adb5', '#7a4b2a', '#b5793d', '#e2c271', '#b9502d', '#4f3123'];
const SHIRTS = ['#4c7fd6', '#2e9d8f', '#8a5cc8', '#e0883a', '#d8649a', '#6e9a3c', '#c9a227', '#5d6f96'];
const STYLES = Object.keys(HAIR);

// Furniture and markers: `colors` maps each key to a colour token (a CSS custom property) or a colour.
const doorRow = inner => `od${inner}do`;
const doorPanel = [doorRow(`ww${'d'.repeat(14)}ww`), ...Array(10).fill(doorRow(`wwd${'w'.repeat(12)}dww`)), doorRow(`ww${'d'.repeat(14)}ww`)];
const windowRow = (left = 'b'.repeat(13), right = 'b'.repeat(13)) => `of${left}ff${right}fo`;
// A monitor showing three lines of text: while someone types, the text scrolls between two screens.
const monitorRows = lines => [
  'oooooooooooooooo',
  'ommmmmmmmmmmmmmo',
  'ombbbbbbbbbbbbmo',
  ...lines.flatMap(line => [`omb${line}mo`, 'ombbbbbbbbbbbbmo']),
  'ommmmmmmmmmmmmmo',
  'oooooooooooooooo',
  '......oMMo......',
  '.....oMMMMo.....',
  '....oooooooo....',
];
const MONITOR_COLORS = { o: '--scene-ink', m: '--scene-metal', M: '--scene-metal-light', b: '--scene-screen', L: '--scene-screen-line' };
const BEACON_ROWS = [
  '...oooo...',
  '..orrrro..',
  '.orrwwrro.',
  '.orrwrrro.',
  '.orrrrrro.',
  'oooooooooo',
  'ommmmmmmmo',
  'oooooooooo',
];

const SCENE = {
  desk: {
    colors: { o: '--scene-ink', t: '--scene-wood', w: '--scene-wood', d: '--scene-wood-dark', k: '--scene-metal-light' },
    rows: [
      'o'.repeat(44),
      `o${'t'.repeat(42)}o`,
      `o${'t'.repeat(42)}o`,
      `o${'d'.repeat(42)}o`,
      'o'.repeat(44),
      `.o${'w'.repeat(27)}o${'w'.repeat(12)}o.`,
      `.o${'w'.repeat(27)}o${'w'.repeat(5)}kk${'w'.repeat(5)}o.`,
      `.o${'w'.repeat(27)}o${'d'.repeat(12)}o.`,
      `.o${'w'.repeat(27)}o${'w'.repeat(12)}o.`,
      `.o${'w'.repeat(27)}o${'w'.repeat(5)}kk${'w'.repeat(5)}o.`,
      `.o${'w'.repeat(27)}o${'w'.repeat(12)}o.`,
      `.${'o'.repeat(42)}.`,
      `.oo${'.'.repeat(38)}oo.`,
    ],
  },
  monitor: { colors: MONITOR_COLORS, rows: monitorRows(['LLLLbbbbbbb', 'LLbLLLLbbbb', 'bLLLbbbbbbb']) },
  'monitor-scrolled': { colors: MONITOR_COLORS, rows: monitorRows(['LLbLLLLbbbb', 'bLLLbbbbbbb', 'LLLLLbLLbbb']) },
  keyboard: {
    colors: { o: '--scene-ink', K: '--scene-metal-light' },
    rows: ['oooooooooooooo', 'oKKKKKKKKKKKKo', 'oooooooooooooo'],
  },
  chair: {
    colors: { o: '--scene-ink', m: '--scene-metal', M: '--scene-metal-light' },
    rows: [
      '....oooooooooooo....',
      '...oMMMMMMMMMMMMo...',
      '..oMmmmmmmmmmmmmMo..',
      ...Array(9).fill('..oMmmmmmmmmmmmmMo..'),
      '..oMMMMMMMMMMMMMMo..',
      '...oooooooooooooo...',
    ],
  },
  door: {
    colors: { o: '--scene-ink', d: '--scene-wood-dark', w: '--scene-wood', k: '--scene-metal-light' },
    rows: [
      'o'.repeat(22),
      `o${'d'.repeat(20)}o`,
      doorRow('w'.repeat(18)),
      ...doorPanel,
      doorRow('w'.repeat(18)),
      doorRow(`${'w'.repeat(15)}kkw`),
      doorRow(`${'w'.repeat(15)}kkw`),
      doorRow('w'.repeat(18)),
      ...doorPanel,
      doorRow('w'.repeat(18)),
      doorRow('w'.repeat(18)),
      'o'.repeat(22),
    ],
  },
  window: {
    colors: { o: '--scene-ink', f: '--scene-wall-trim', b: '--scene-sky', c: '--scene-cloud' },
    rows: [
      'o'.repeat(32),
      `o${'f'.repeat(30)}o`,
      windowRow(),
      windowRow('bbbcccbbbbbbb'),
      windowRow('bbcccccbbbbbb', 'bbbbbbbbccbbb'),
      windowRow(undefined, 'bbbbbbbccccbb'),
      windowRow(), windowRow(), windowRow(),
      `o${'f'.repeat(30)}o`,
      windowRow(), windowRow(), windowRow(), windowRow(), windowRow(), windowRow(), windowRow(),
      `o${'f'.repeat(30)}o`,
      'o'.repeat(32),
    ],
  },
  plant: {
    colors: { o: '--scene-ink', g: '--scene-leaf', G: '--scene-leaf-dark', p: '--scene-pot' },
    rows: [
      '.....gg.....',
      '....gGgg....',
      '..gg.gG.gg..',
      '.gGgg.g.gGg.',
      '.gggGgggggg.',
      '..gGgggGgg..',
      '.gggggggGgg.',
      'gGggGgggggGg',
      '.ggggGggggg.',
      '..gggggggg..',
      '....gggg....',
      '..oooooooo..',
      '..oppppppo..',
      '..oppppppo..',
      '...oppppo...',
      '...oppppo...',
      '...oooooo...',
    ],
  },
  // The alert corner's beacon: lit while someone stands there, flashing unless motion is reduced.
  beacon: { colors: { o: '--scene-ink', r: '--bad', w: '#ffffff', m: '--scene-metal' }, rows: BEACON_ROWS },
  'beacon-off': { colors: { o: '--scene-ink', r: '--scene-metal', w: '--scene-metal-light', m: '--scene-metal' }, rows: BEACON_ROWS },
  check: {
    colors: { g: '--ok', w: '#ffffff' },
    rows: [
      '.ggggggg.',
      'ggggggggg',
      'ggggggwwg',
      'gwwggwwgg',
      'ggwwwwggg',
      'gggwwgggg',
      '.ggggggg.',
    ],
  },
  alert: {
    colors: { r: '--bad', w: '#ffffff' },
    rows: [
      '.rrrrrr.',
      'rrrwwrrr',
      'rrrwwrrr',
      'rrrwwrrr',
      'rrrwwrrr',
      'rrrrrrrr',
      'rrrwwrrr',
      '.rrrrrr.',
    ],
  },
  zz: {
    colors: { y: '--warn' },
    rows: [
      '....yyyyy',
      '.......y.',
      '......y..',
      '.....y...',
      '....yyyyy',
      'yyy......',
      '.y.......',
      'yyy......',
    ],
  },
};

const cache = new Map();
const tokens = new Map();

// A colour token's value as the page's theme sets it now, e.g. color('--scene-floor'); plain colours pass through.
export function color(value) {
  if (!value.startsWith('--')) return value;
  if (!tokens.has(value)) tokens.set(value, getComputedStyle(document.documentElement).getPropertyValue(value).trim());
  return tokens.get(value);
}

function paint(name, rows, colorOf) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) => {
    if (row.length !== canvas.width) throw new Error(`sprite ${name}: row ${y} is ${row.length} wide, not ${canvas.width}`);
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      const fill = colorOf(row[x]);
      if (!fill) throw new Error(`sprite ${name}: no colour for '${row[x]}'`);
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

function cached(cacheKey, build) {
  let canvas = cache.get(cacheKey);
  if (!canvas) cache.set(cacheKey, canvas = build());
  return canvas;
}

// Drops every sprite and colour token read so far: the next draw paints them in the current theme.
export function resetSprites() {
  cache.clear();
  tokens.clear();
}

// Paints `layers` over `base`, all text matrices of the same size.
function stack(name, base, ...layers) {
  const rows = base.map(row => [...row]);
  for (const layer of layers) {
    layer.forEach((row, y) => {
      if (row.length !== rows[y].length) throw new Error(`sprite ${name}: layer row ${y} is ${row.length} wide, not ${rows[y].length}`);
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') rows[y][x] = row[x];
    });
  }
  return rows.map(row => row.join(''));
}

// FNV-1a over the text, then a final mix, so ids one character apart differ in every part of the look.
// The seed was picked so that task numbers next to each other get different shirts.
const LOOK_SEED = 17120;

function hash(text) {
  let h = (0x811c9dc5 ^ LOOK_SEED) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// A worker's look depends on its task id alone, so a given task number looks the same in every run.
export function lookOf(id) {
  let h = hash(String(id));
  const pick = list => { const item = list[h % list.length]; h = Math.floor(h / list.length); return item; };
  const look = { skin: pick(SKINS), hair: pick(HAIRS), style: pick(STYLES), shirt: pick(SHIRTS) };
  return { ...look, key: [look.skin.s, look.hair, look.style, look.shirt].join(' ') };
}

// `base` with `rows` put in from row `at` on.
function withRows(base, at, rows) {
  return base.map((row, y) => (y >= at && y < at + rows.length ? rows[y - at] : row));
}

// The body one pixel lower over the same feet: the bob of an idle or a breathing figure.
function squash(rows) {
  return ['.'.repeat(rows[0].length), ...rows.slice(0, -2), rows[rows.length - 1]];
}

const mirrored = rows => rows.map(row => [...row].reverse().join(''));

// Outline, eyes, shoes and trousers follow the theme; the look does not.
function figureColors(look) {
  const ink = color('--scene-ink');
  return { o: ink, e: ink, k: ink, p: color('--scene-trousers'), s: look.skin.s, S: look.skin.S, h: look.hair, c: look.shirt };
}

// `frame` names one of WORKER_FRAMES; `mirror` turns the worker to face left.
export function workerSprite(look, frame, mirror = false) {
  return cached(`worker|${look.key}|${frame}|${mirror}`, () => {
    const name = `worker ${look.style} ${frame}`, def = WORKER_FRAMES[frame];
    let rows = stack(name, BODY, HAIR[look.style], EYES[def.eyes]);
    if (def.legs) rows = withRows(rows, 14, def.legs);
    if (def.arms) rows = withRows(stack(name, rows, ARMS_UP), 11, TORSO);
    if (def.squash) rows = squash(rows);
    const colors = figureColors(look);
    return paint(name, mirror ? mirrored(rows) : rows, key => colors[key]);
  });
}

// A helper wears the skin and the shirt of `look` (see lookOf). `frame` names one of HELPER_FRAMES.
export function helperSprite(look, frame, mirror = false) {
  return cached(`helper|${look.key}|${frame}|${mirror}`, () => {
    const def = HELPER_FRAMES[frame];
    let rows = HELPER;
    if (def.eyes) rows = withRows(rows, 4, [def.eyes]);
    if (def.legs) rows = withRows(rows, 10, def.legs);
    if (def.squash) rows = squash(rows);
    const colors = { ...figureColors(look), a: color('--accent') };
    return paint(`helper ${frame}`, mirror ? mirrored(rows) : rows, key => colors[key]);
  });
}

// The desk worker's hands on the keyboard; `frame` is 0 or 1.
export function handsSprite(look, frame) {
  return cached(`hands|${look.key}|${frame}`, () => paint('hands', HANDS[frame], () => look.skin.s));
}

// The `piece`-th piece of confetti; the pieces repeat.
export function confettiSprite(piece) {
  const kind = piece % CONFETTI.length, def = CONFETTI[kind];
  return cached(`confetti|${kind}`, () => paint('confetti', def.rows, () => def.color));
}

export function sceneSprite(name) {
  const def = SCENE[name];
  return cached(`scene|${name}`, () => paint(name, def.rows, key => def.colors[key] && color(def.colors[key])));
}
