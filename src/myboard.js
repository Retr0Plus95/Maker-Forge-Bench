// Your board, from your photos (0.4 design F3). You tap two pins of one part (the anchor, normally
// the chip) on a photo of your own board; the part's shape is known from the project's board data,
// so the two taps fix the photo's scale, turn and mirror, and every hole on that photo is known.
// Placements are kept in the anchor's frame (the project's own hole numbers), so one placement
// shows on the top photo and the underside photo alike. No page code: unit-tested in Node.

const numericFirst = (names) => [...names].sort((a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : 0));

/** The board part with the most pins (the chip), or null. */
export function anchorFor(board) {
  if (!board) return null;
  let best = null;
  for (const [ref, part] of Object.entries(board.parts)) {
    const n = Object.keys(part.pins).length;
    if (n >= 2 && (!best || n > best.n)) best = { ref, n };
  }
  return best ? best.ref : null;
}

/** The two pins to tap: the first pin, and the pin farthest from it along the same row or column. */
export function anchorPins(part) {
  const names = numericFirst(Object.keys(part.pins));
  const a = names[0];
  const [ac, ar] = part.pins[a];
  let b = null;
  let bestD = -1;
  let bestAny = null;
  let bestAnyD = -1;
  for (const name of names.slice(1)) {
    const [c, r] = part.pins[name];
    const d = Math.hypot(c - ac, r - ar);
    if ((c === ac || r === ar) && d > bestD) {
      b = name;
      bestD = d;
    }
    if (d > bestAnyD) {
      bestAny = name;
      bestAnyD = d;
    }
  }
  return { a, b: b || bestAny };
}

// complex numbers as [re, im]
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const div = (p, q) => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};

/**
 * The photo's transform from two tapped pins: fA, fB are the pins' holes in the project's frame
 * ([col, row]); pA, pB where they were tapped (photo pixels). An underside photo is a mirror image.
 * Gives { toPixel([c, r]) → [x, y], toBoard([x, y]) → [c, r], pitch } (pitch: pixels per hole), or null.
 */
export function photoTransform(fA, fB, pA, pB, side) {
  const mirror = side === 'bottom' ? (f) => [-f[0], f[1]] : (f) => [f[0], f[1]];
  const u = sub(mirror(fB), mirror(fA));
  const v = sub(pB, pA);
  if (Math.hypot(...u) < 1e-9 || Math.hypot(...v) < 1e-9) return null;
  const z = div(v, u);
  const mA = mirror(fA);
  return {
    toPixel: (f) => add(pA, mul(z, sub(mirror(f), mA))),
    toBoard: (p) => mirror(add(mA, div(sub(p, pA), z))),
    pitch: Math.hypot(...z),
  };
}

/** The nearest hole. */
export const snap = ([c, r]) => [Math.round(c), Math.round(r)];

const LIMITS = { photos: 20, parts: 2000, pins: 100, coord: 1000, pixel: 100000 };
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40;
const isPixel = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= LIMITS.pixel;
const isHole = (h) => Array.isArray(h) && h.length === 2 && h.every((n) => Number.isInteger(n) && Math.abs(n) <= LIMITS.coord);
const tap = (t) => (isObject(t) && isName(t.pin) && isPixel(t.x) && isPixel(t.y) ? { pin: t.pin, x: t.x, y: t.y } : null);

/** Saved or imported board data, checked: anything odd is dropped, never fatal. */
export function cleanMyBoard(raw, isRef) {
  const out = { anchor: null, photos: {}, placed: {}, routes: {} };
  if (!isObject(raw)) return out;
  if (isObject(raw.routes)) {
    for (const [net, shape] of Object.entries(raw.routes).slice(0, 500)) {
      if (isName(net) && ['cols', 'rows', 'straight'].includes(shape)) out.routes[net] = shape;
    }
  }
  if (typeof raw.anchor === 'string' && isRef(raw.anchor)) out.anchor = raw.anchor;
  if (isObject(raw.photos)) {
    for (const [id, p] of Object.entries(raw.photos).slice(0, LIMITS.photos)) {
      if (typeof id !== 'string' || !id || id.length > 100 || !isObject(p) || (p.side !== 'top' && p.side !== 'bottom')) continue;
      const a = tap(p.a);
      const b = tap(p.b);
      if (!a || !b) continue;
      out.photos[id] = { side: p.side, a, b, bright: p.bright === true };
    }
  }
  if (isObject(raw.placed)) {
    let count = 0;
    for (const [ref, pins] of Object.entries(raw.placed)) {
      if (count >= LIMITS.parts) break;
      if (!isRef(ref) || !isObject(pins)) continue;
      const entries = Object.entries(pins);
      if (!entries.length || entries.length > LIMITS.pins || !entries.every(([pin, h]) => isName(pin) && isHole(h))) continue;
      out.placed[ref] = Object.fromEntries(entries.map(([pin, h]) => [pin, [h[0], h[1]]]));
      count++;
    }
  }
  return out;
}

/**
 * Your board for the 3D view (0.5 big improvement B4): the anchor where the project has it, and
 * every placed part on the holes you tapped, with types and sizes from the project. Shifted so the
 * first hole is 2 (a hole of board round the edge); no wiring, which isn't known.
 */
export function boardFromPlacement(projectBoard, placed, anchor, wirePaths = []) {
  if (!projectBoard || !anchor || !projectBoard.parts[anchor]) return null;
  const parts = { [anchor]: { ...projectBoard.parts[anchor], pins: { ...projectBoard.parts[anchor].pins } } };
  let placedCount = 0;
  for (const [ref, pins] of Object.entries(placed || {})) {
    const part = projectBoard.parts[ref];
    if (!part || ref === anchor) continue;
    const { keepout, ...rest } = part; // a module's outline was drawn for sheet 4, not your board
    parts[ref] = { ...rest, pins: { ...pins } };
    placedCount++;
  }
  const holes = Object.values(parts).flatMap((p) => Object.values(p.pins));
  const dc = 2 - Math.min(...holes.map((h) => h[0]));
  const dr = 2 - Math.min(...holes.map((h) => h[1]));
  for (const p of Object.values(parts)) {
    p.pins = Object.fromEntries(Object.entries(p.pins).map(([pin, [c, r]]) => [pin, [c + dc, r + dr]]));
  }
  const shifted = Object.values(parts).flatMap((p) => Object.values(p.pins));
  const links = wirePaths.map((path) => ({ path: path.map(([c, r]) => [c + dc, r + dr]), side: 'bottom' }));
  return {
    pitch: projectBoard.pitch,
    cols: Math.max(...shifted.map((h) => h[0])) + 1,
    rows: Math.max(...shifted.map((h) => h[1])) + 1,
    parts,
    buses: [],
    links,
    bridges: [],
    nets: projectBoard.nets,
    netLabels: projectBoard.netLabels,
    placedCount,
  };
}
