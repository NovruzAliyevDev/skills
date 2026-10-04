// The art. A sprite is a text matrix: one character per pixel, '.' transparent, any other character a
// palette key. Each sprite is painted once into an offscreen canvas and cached.

// Workers: 16x16. Keys: o outline, h hair, s skin, S mouth, e eyes, c shirt, p trousers, k shoes.
const WORKER = {
  stand: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '..ohhhhhhhhhho..',
    '..ohhhsssshhho..',
    '..ohssssssssho..',
    '..osssessessso..',
    '..osssssssssso..',
    '...osssSSssso...',
    '....oooooooo....',
    '...occcccccco...',
    '..occcccccccco..',
    '..osoccccccoso..',
    '...opppoopppo...',
    '...okko..okko...',
  ],
  sleep: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '..ohhhhhhhhhho..',
    '..ohhhsssshhho..',
    '..ohssssssssho..',
    '..osssssssssso..',
    '..osseesseesso..',
    '...osssSSssso...',
    '....oooooooo....',
    '...occcccccco...',
    '..occcccccccco..',
    '..osoccccccoso..',
    '...opppoopppo...',
    '...okko..okko...',
  ],
};

// The one look every worker has for now.
const LOOK = { o: '#2b2533', h: '#5b3a29', s: '#f2c7a0', S: '#b9765c', e: '#2b2533', c: '#4c7fd6', p: '#3c4250', k: '#2b2533' };

// Furniture and markers: `colors` maps each key to a colour token (a CSS custom property) or a colour.
const doorRow = inner => `od${inner}do`;
const doorPanel = [doorRow(`ww${'d'.repeat(14)}ww`), ...Array(10).fill(doorRow(`wwd${'w'.repeat(12)}dww`)), doorRow(`ww${'d'.repeat(14)}ww`)];
const windowRow = (left = 'b'.repeat(13), right = 'b'.repeat(13)) => `of${left}ff${right}fo`;

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
  monitor: {
    colors: { o: '--scene-ink', m: '--scene-metal', M: '--scene-metal-light', b: '--scene-screen', L: '--scene-screen-line' },
    rows: [
      'oooooooooooooooo',
      'ommmmmmmmmmmmmmo',
      'ombbbbbbbbbbbbmo',
      'ombLLLLbbbbbbbmo',
      'ombbbbbbbbbbbbmo',
      'ombLLbLLLLbbbbmo',
      'ombbbbbbbbbbbbmo',
      'ombbLLLbbbbbbbmo',
      'ombbbbbbbbbbbbmo',
      'ommmmmmmmmmmmmmo',
      'oooooooooooooooo',
      '......oMMo......',
      '.....oMMMMo.....',
      '....oooooooo....',
    ],
  },
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
  beacon: {
    colors: { o: '--scene-ink', r: '--bad', w: '#ffffff', m: '--scene-metal' },
    rows: [
      '...oooo...',
      '..orrrro..',
      '.orrwwrro.',
      '.orrwrrro.',
      '.orrrrrro.',
      'oooooooooo',
      'ommmmmmmmo',
      'oooooooooo',
    ],
  },
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

export function workerSprite(frame) {
  return cached(`worker|${frame}`, () => paint(frame, WORKER[frame], key => LOOK[key]));
}

export function sceneSprite(name) {
  const def = SCENE[name];
  return cached(`scene|${name}`, () => paint(name, def.rows, key => def.colors[key] && color(def.colors[key])));
}
