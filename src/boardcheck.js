// Check my board (0.5 big improvement B2) and suggested wires (B3), for a board you laid out yourself.
// Everything works in the anchor's frame (the project's own hole numbers, see myboard.js).
// No page code: unit-tested in Node.
import { partGeometry } from './board3d-geometry.js';
import { pinText, wiringGroups } from './wiring.js';

/** Every placed leg: { key, ref, pin, hole }, the anchor's from the project, the rest from your taps. */
export function placedLegs(projectBoard, placed, anchor) {
  const legs = [];
  if (!projectBoard) return legs;
  if (anchor && projectBoard.parts[anchor]) {
    for (const [pin, hole] of Object.entries(projectBoard.parts[anchor].pins)) legs.push({ key: `${anchor}:${pin}`, ref: anchor, pin, hole });
  }
  for (const [ref, pins] of Object.entries(placed || {})) {
    if (ref === anchor || !projectBoard.parts[ref]) continue;
    for (const [pin, hole] of Object.entries(pins)) legs.push({ key: `${ref}:${pin}`, ref, pin, hole });
  }
  return legs;
}

/** A part's footprint on the board in mm: [x1, y1, x2, y2] of its body shapes (typical sizes). */
function footprint(part, pitch, ref) {
  let box = null;
  const grow = (x1, y1, x2, y2) => {
    box = box ? [Math.min(box[0], x1), Math.min(box[1], y1), Math.max(box[2], x2), Math.max(box[3], y2)] : [x1, y1, x2, y2];
  };
  for (const p of partGeometry(part, pitch, ref)) {
    if (!['body', 'socket', 'foam', 'wall'].includes(p.role)) continue;
    if (p.kind === 'box') grow(p.x - p.w / 2, p.y - p.d / 2, p.x + p.w / 2, p.y + p.d / 2);
    else if (p.kind === 'cyl' || p.kind === 'dome') grow(p.x - p.radius, p.y - p.radius, p.x + p.radius, p.y + p.radius);
    else if (p.kind === 'hcyl') grow(Math.min(p.x1, p.x2) - p.radius, Math.min(p.y1, p.y2) - p.radius, Math.max(p.x1, p.x2) + p.radius, Math.max(p.y1, p.y2) + p.radius);
    else if (p.kind === 'extrude') {
      const xs = p.outline.map(([x]) => x);
      const ys = p.outline.map(([, y]) => y);
      grow(p.x + Math.min(...xs), p.y + Math.min(...ys), p.x + Math.max(...xs), p.y + Math.max(...ys));
    }
  }
  return box;
}

/**
 * Findings for your placement: [{ kind, level: 'problem' | 'warning' | 'todo', refs, text }].
 * - clash: two legs in one hole
 * - overlap: two parts' bodies on top of each other (typical sizes)
 * - neighbours: legs of different lines on neighbouring holes (solder carefully)
 * - unplaced: parts not placed yet
 */
export function checkPlacement(projectBoard, placed, anchor) {
  if (!projectBoard || !anchor) return [];
  const legs = placedLegs(projectBoard, placed, anchor);
  const findings = [];
  const byHole = new Map();
  for (const l of legs) {
    const k = `${l.hole[0]},${l.hole[1]}`;
    if (!byHole.has(k)) byHole.set(k, []);
    byHole.get(k).push(l);
  }
  for (const group of byHole.values()) {
    if (group.length < 2) continue;
    findings.push({ kind: 'clash', level: 'problem', refs: [...new Set(group.map((l) => l.ref))],
      text: `Two legs in one hole: ${group.map((l) => `${l.ref} ${pinText(l.pin)}`).join(' and ')}.` });
  }
  // bodies on top of each other, same side of the board
  const parts = Object.entries({ ...Object.fromEntries((placed && Object.keys(placed)) ? Object.keys(placed).map((r) => [r, true]) : []), [anchor]: true })
    .map(([ref]) => ref).filter((ref) => projectBoard.parts[ref]);
  const shapes = parts.map((ref) => {
    const base = projectBoard.parts[ref];
    const { keepout, ...rest } = base;
    const part = ref === anchor ? base : { ...rest, pins: placed[ref] };
    return { ref, side: part.side, box: footprint(part, projectBoard.pitch, ref) };
  }).filter((s) => s.box);
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      if (a.side !== b.side) continue;
      const ox = Math.min(a.box[2], b.box[2]) - Math.max(a.box[0], b.box[0]);
      const oy = Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]);
      if (ox > 0.4 && oy > 0.4) {
        findings.push({ kind: 'overlap', level: 'problem', refs: [a.ref, b.ref], text: `${a.ref} and ${b.ref} sit on top of each other (typical sizes): move one of them.` });
      }
    }
  }
  // different lines on neighbouring holes, between different parts
  const netOf = new Map();
  for (const [net, members] of Object.entries(projectBoard.nets)) for (const [ref, pin] of members) netOf.set(`${ref}:${pin}`, projectBoard.netLabels[net] || net);
  const seen = new Set();
  for (const l of legs) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const others = byHole.get(`${l.hole[0] + dc},${l.hole[1] + dr}`) || [];
      for (const o of others) {
        if (o.ref === l.ref) continue;
        const n1 = netOf.get(l.key);
        const n2 = netOf.get(o.key);
        if (!n1 || !n2 || n1 === n2) continue;
        const id = [l.key, o.key].sort().join('|');
        if (seen.has(id)) continue;
        seen.add(id);
        findings.push({ kind: 'neighbours', level: 'warning', refs: [l.ref, o.ref],
          text: `${l.ref} ${pinText(l.pin)} (${n1}) is next to ${o.ref} ${pinText(o.pin)} (${n2}): solder these carefully, no bridge.` });
      }
    }
  }
  const missing = Object.keys(projectBoard.parts).filter((ref) => ref !== anchor && !(placed && placed[ref]));
  if (missing.length) findings.push({ kind: 'unplaced', level: 'todo', refs: missing, text: `Not placed yet: ${missing.join(', ')}.` });
  return findings;
}

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/**
 * Suggested wires for one line (B3): the shortest tree joining its placed legs (Prim's algorithm),
 * each join an L-shaped wire. shape: 'cols' (along the row first, then the column), 'rows' (the other
 * way), or 'straight'. Gives [{ from, to, path: [[c, r], ...], across, down }].
 */
export function suggestWires(legs, shape = 'cols') {
  if (legs.length < 2) return [];
  const inTree = [legs[0]];
  const rest = legs.slice(1);
  const wires = [];
  while (rest.length) {
    let best = null;
    for (const a of inTree) {
      for (let k = 0; k < rest.length; k++) {
        const d = shape === 'straight' ? Math.hypot(a.hole[0] - rest[k].hole[0], a.hole[1] - rest[k].hole[1]) : manhattan(a.hole, rest[k].hole);
        if (!best || d < best.d) best = { a, k, d };
      }
    }
    const b = rest.splice(best.k, 1)[0];
    inTree.push(b);
    const [ac, ar] = best.a.hole;
    const [bc, br] = b.hole;
    const corner = shape === 'rows' ? [ac, br] : [bc, ar];
    const path = shape === 'straight' || ac === bc || ar === br ? [[ac, ar], [bc, br]] : [[ac, ar], corner, [bc, br]];
    wires.push({ from: best.a, to: b, path, across: Math.abs(bc - ac), down: Math.abs(br - ar) });
  }
  return wires;
}

/** Suggested wires for every line with two or more placed legs: [{ net, label, kind, wires }]. */
export function suggestAll(projectBoard, placed, anchor, shapes = {}) {
  const legs = new Map(placedLegs(projectBoard, placed, anchor).map((l) => [l.key, l]));
  return wiringGroups(projectBoard)
    .map((g) => ({ net: g.net, label: g.label, kind: g.kind, legs: g.members.map((m) => legs.get(m.key)).filter(Boolean) }))
    .filter((g) => g.legs.length >= 2)
    .map((g) => ({ net: g.net, label: g.label, kind: g.kind, shape: shapes[g.net] || 'cols', wires: suggestWires(g.legs, shapes[g.net] || 'cols') }));
}

/** "U2 pin 7 to C10 +: 3 holes across, 6 down" */
export function wireText(w) {
  const parts = [];
  if (w.across) parts.push(`${w.across} ${w.across === 1 ? 'hole' : 'holes'} across`);
  if (w.down) parts.push(`${w.down} down`);
  return `${w.from.ref} ${pinText(w.from.pin)} to ${w.to.ref} ${pinText(w.to.pin)}: ${parts.join(', ') || 'next to each other'}`;
}
