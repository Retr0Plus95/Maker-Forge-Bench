// Bridge risk (1.0.1, idea 24): joints on different lines one hole apart underneath, where too much
// solder joins them. For the project's own board; Check my board warns the same for yours.
// No page code: unit-tested in Node.
import { pinText } from './wiring.js';

/**
 * [{ id, kind, refs, buses, at, text }], top row first:
 * - pins: legs of two different parts ("R4 pin 2 (RST) is next to U2 pin 28 (SCL)")
 * - bus: a leg next to a bare bus of another line
 * - buses: two bare buses side by side, one entry for the whole run
 * One part's own legs (a chip's pins) are close by design, so they're left out; so is an underside
 * part soldered onto a leg of its own line, which shares that leg's hole.
 * at: between the two holes [c, r] (the middle of the run for buses), for marks in 3D.
 */
export function bridgeRisks(board) {
  if (!board || !board.parts) return [];
  const label = (net) => (board.netLabels && board.netLabels[net]) || net;
  const netOf = new Map();
  for (const [net, members] of Object.entries(board.nets || {})) for (const [ref, pin] of members) netOf.set(`${ref}:${pin}`, net);
  const holes = new Map();
  const hole = ([c, r]) => {
    const k = `${c},${r}`;
    if (!holes.has(k)) holes.set(k, { c, r, legs: [], nets: new Set(), bus: null });
    return holes.get(k);
  };
  for (const [ref, part] of Object.entries(board.parts)) {
    for (const [pin, h] of Object.entries(part.pins || {})) {
      const x = hole(h);
      const net = netOf.get(`${ref}:${pin}`);
      x.legs.push({ ref, pin, net, top: part.side !== 'bottom' });
      if (net) x.nets.add(net);
    }
  }
  (board.buses || []).forEach((bus, i) => {
    for (let c = Math.min(bus.from, bus.to); c <= Math.max(bus.from, bus.to); c++) {
      const x = hole([c, bus.row]);
      if (x.bus === null) x.bus = i;
      x.nets.add(bus.net);
    }
  });
  const refsOf = (x) => new Set(x.legs.map((l) => l.ref));
  const leg = (x) => x.legs.find((l) => l.top) || x.legs[0]; // the part you see, not one riding under it
  const legWords = (l, net) => `${l.ref} ${pinText(l.pin)} (${label(net)})`;
  const busWords = (i) => `the ${label(board.buses[i].net)} bus`;
  const found = [];
  const runs = new Map(); // two buses side by side: "i|j" → their neighbouring holes
  for (const a of holes.values()) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const b = holes.get(`${a.c + dc},${a.r + dr}`);
      if (!b || a.nets.size !== 1 || b.nets.size !== 1) continue;
      const [na] = a.nets;
      const [nb] = b.nets;
      if (na === nb) continue;
      const ra = refsOf(a);
      if ([...refsOf(b)].some((ref) => ra.has(ref))) continue;
      const at = [(a.c + b.c) / 2, (a.r + b.r) / 2];
      const id = `bridge:${a.c},${a.r}|${b.c},${b.r}`;
      if (a.legs.length && b.legs.length) {
        const [la, lb] = [leg(a), leg(b)];
        found.push({ id, kind: 'pins', refs: [la.ref, lb.ref], buses: [], at, text: `${legWords(la, na)} is next to ${legWords(lb, nb)}: keep the solder on each pad.`, row: a.r, col: a.c });
      } else if (a.legs.length || b.legs.length) {
        const [withLeg, net, other] = a.legs.length ? [a, na, b] : [b, nb, a];
        const l = leg(withLeg);
        found.push({ id, kind: 'bus', refs: [l.ref], buses: [other.bus], at, text: `${legWords(l, net)} is next to ${busWords(other.bus)}: keep the solder on its own pad.`, row: withLeg.r, col: withLeg.c });
      } else if (a.bus !== null && b.bus !== null && a.bus !== b.bus) {
        const key = `${a.bus}|${b.bus}`;
        if (!runs.has(key)) runs.set(key, []);
        runs.get(key).push([a, b]);
      }
    }
  }
  for (const [key, pairs] of runs) {
    const [i, j] = key.split('|').map(Number);
    pairs.sort((p, q) => p[0].c - q[0].c || p[0].r - q[0].r);
    const [a, b] = pairs[Math.floor((pairs.length - 1) / 2)];
    const [bi, bj] = [board.buses[i], board.buses[j]];
    found.push({ id: `bridge:bus${i}|bus${j}`, kind: 'buses', refs: [], buses: [i, j], at: [(a.c + b.c) / 2, (a.r + b.r) / 2],
      text: `The ${label(bi.net)} bus (row ${bi.row}) and the ${label(bj.net)} bus (row ${bj.row}) run side by side for ${pairs.length} ${pairs.length === 1 ? 'hole' : 'holes'}: keep a gap between them.`,
      row: Math.min(bi.row, bj.row), col: pairs[0][0].c });
  }
  return found.sort((p, q) => p.row - q.row || p.col - q.col).map(({ row, col, ...f }) => f);
}
