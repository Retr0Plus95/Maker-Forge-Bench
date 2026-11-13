// Suggest a spot (0.6 design §2): where a part not placed yet could go on your board, close to the
// legs it connects to. Works in the anchor's frame (the project's own hole numbers, see myboard.js).
// No page code: unit-tested in Node.
import { footprint, placedLegs } from './boardcheck.js';
import { pinText } from './wiring.js';

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const key = (h) => `${h[0]},${h[1]}`;
// a quarter turn: (c, r) → (−r, c)
const TURNS = [(o) => o, (o) => [-o[1], o[0]], (o) => [-o[0], -o[1]], (o) => [o[1], -o[0]]];

/** Each leg's line: "ref:pin" → net. */
function netsOf(projectBoard) {
  const out = new Map();
  for (const [net, members] of Object.entries(projectBoard.nets || {})) for (const [ref, pin] of members) out.set(`${ref}:${pin}`, net);
  return out;
}

const overlaps = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.4 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.4;

/** "on U2 pin 7 and pin 8", "next to R8 pin 1", "3 holes from C10 −": the nearest leg on each pin's line. */
function reasonText(near, name) {
  const groups = [];
  for (const n of near) {
    if (!n) continue;
    const how = n.d === 0 ? 'on' : n.d === 1 ? 'next to' : `${n.d} holes from`;
    const label = `${pinText(n.leg.pin)}${name(n.leg.hole) ? ` (${name(n.leg.hole)})` : ''}`;
    const g = groups.find((x) => x.how === how && x.ref === n.leg.ref);
    if (g) g.pins.push(label);
    else groups.push({ how, ref: n.leg.ref, pins: [label] });
  }
  return groups.map((g) => `${g.how} ${g.ref} ${g.pins.join(' and ')}`).join(', ');
}

/**
 * The best spots for `ref` (not placed yet), best first: { spots: [{ pins, score, reason }], why }.
 * - The part's shape is its pins' offsets in the project, turned four ways.
 * - Each spot costs the hole distance from each leg to the nearest placed leg on its line, plus a
 *   little for a different line on a neighbouring hole.
 * - A leg may not land on a taken hole, except an underside part's leg on a leg of its own line
 *   (C5 soldered across the chip's pins 7 and 8); bodies on the same side may not overlap.
 * name(hole): the hole's printed name, for the reason (0.6 design §1).
 */
export function suggestSpots(projectBoard, placed, anchor, ref, { count = 3, name = () => null } = {}) {
  const part = projectBoard && projectBoard.parts[ref];
  if (!part || !anchor || ref === anchor) return { spots: [], why: 'Nothing to suggest for this part.' };
  const nets = netsOf(projectBoard);
  const others = { ...(placed || {}) };
  delete others[ref];
  const legs = placedLegs(projectBoard, others, anchor);
  const byHole = new Map();
  for (const l of legs) {
    if (!byHole.has(key(l.hole))) byHole.set(key(l.hole), []);
    byHole.get(key(l.hole)).push(l);
  }
  const pinNames = Object.keys(part.pins);
  const lineOf = (pin) => nets.get(`${ref}:${pin}`) || null;
  const targets = pinNames.map((pin) => (lineOf(pin) ? legs.filter((l) => nets.get(l.key) === lineOf(pin)) : []));
  if (!targets.some((t) => t.length)) {
    return { spots: [], why: `Place a part that ${ref} connects to first, then Bench can suggest a spot next to it.` };
  }
  const bottom = part.side === 'bottom';
  const { keepout, ...bare } = part; // a module's outline was drawn for sheet 4
  // bodies already on the board, on this part's side
  const bodies = [];
  for (const [r, pins] of Object.entries({ ...others, [anchor]: projectBoard.parts[anchor].pins })) {
    const base = projectBoard.parts[r];
    if (!base || base.side !== part.side) continue;
    const { keepout: k, ...rest } = base;
    const box = footprint(r === anchor ? base : { ...rest, pins }, projectBoard.pitch, r);
    if (box) bodies.push(box);
  }
  const first = part.pins[pinNames[0]];
  const offsets = pinNames.map((pin) => [part.pins[pin][0] - first[0], part.pins[pin][1] - first[1]]);
  const tried = new Set();
  const found = [];
  TURNS.forEach((turn, t) => {
    const offs = offsets.map(turn);
    const shapeKey = offs.map(key).join('|');
    if (tried.has(shapeKey)) return; // a two-leg part turned half way round is the same holes
    tried.add(shapeKey);
    // the body for this turn with its first leg at hole 0,0, moved to each spot below
    const box0 = footprint({ ...bare, pins: Object.fromEntries(pinNames.map((pin, i) => [pin, offs[i]])) }, projectBoard.pitch, ref);
    const starts = new Set();
    for (let radius = 4; radius <= 10 && !starts.size; radius += 6) {
      offs.forEach((o, i) => {
        for (const l of targets[i]) {
          for (let dc = -radius; dc <= radius; dc++) for (let dr = -radius; dr <= radius; dr++) starts.add(key([l.hole[0] + dc - o[0], l.hole[1] + dr - o[1]]));
        }
      });
    }
    for (const s of starts) {
      const [sc, sr] = s.split(',').map(Number);
      const holes = offs.map((o) => [sc + o[0], sr + o[1]]);
      let ok = true;
      let score = 0;
      const near = [];
      holes.forEach((h, i) => {
        if (!ok) return;
        const there = byHole.get(key(h)) || [];
        if (there.length && !(bottom && lineOf(pinNames[i]) && there.every((l) => nets.get(l.key) === lineOf(pinNames[i])))) {
          ok = false;
          return;
        }
        let best = null;
        for (const l of targets[i]) {
          const d = manhattan(h, l.hole);
          if (!best || d < best.d) best = { d, leg: l };
        }
        near.push(best);
        if (best) score += best.d;
        if (!there.length) {
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (const l of byHole.get(key([h[0] + dc, h[1] + dr])) || []) if (nets.get(l.key) !== lineOf(pinNames[i])) score += 0.5;
          }
        }
      });
      if (!ok) continue;
      if (box0) {
        const p = projectBoard.pitch;
        const box = [box0[0] + sc * p, box0[1] + sr * p, box0[2] + sc * p, box0[3] + sr * p];
        if (bodies.some((b) => overlaps(box, b))) continue;
      }
      // ties go to the drawing's own spot, then the drawing's own turn
      const fromDrawing = holes.reduce((sum, h, i) => sum + manhattan(h, part.pins[pinNames[i]]), 0);
      found.push({ pins: Object.fromEntries(pinNames.map((pin, i) => [pin, holes[i]])), score, fromDrawing, turn: t, near });
    }
  });
  found.sort((a, b) => a.score - b.score || a.fromDrawing - b.fromDrawing || a.turn - b.turn);
  const spots = [];
  const seen = new Set();
  for (const f of found) {
    const holesKey = Object.values(f.pins).map(key).sort().join('|');
    if (seen.has(holesKey)) continue;
    seen.add(holesKey);
    spots.push({ pins: f.pins, score: f.score, reason: reasonText(f.near, name) });
    if (spots.length >= count) break;
  }
  return { spots, why: spots.length ? '' : `No free spot near the parts ${ref} connects to.` };
}
