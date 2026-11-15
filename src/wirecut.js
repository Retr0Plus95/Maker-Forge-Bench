// Wire to cut (1.0, taken from Maker Forge Shape's wire lengths): how long to cut every link and
// bare-wire bus on a perfboard, and the suggested wires on your own board.
// The rule (design §2): the length along the path, plus 5 mm at each end, rounded up to the next
// 5 mm. Pure: no page code, so it's tested in Node.

export const END_MM = 5;
export const STRIP_MM = 5;
export const STEP_MM = 5;

const isHole = (h) => Array.isArray(h) && Number.isFinite(h[0]) && Number.isFinite(h[1]);

/** The length along a path of holes in mm: each step's true distance in holes × the pitch. */
export function pathMm(path, pitch = 2.54) {
  if (!Array.isArray(path)) return 0;
  let mm = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (isHole(a) && isHole(b)) mm += Math.hypot(b[0] - a[0], b[1] - a[1]) * pitch;
  }
  return mm;
}

/** What to cut: the path plus both ends, rounded up to the next 5 mm (float noise doesn't round up). */
export function cutMm(path, pitch = 2.54) {
  const raw = pathMm(path, pitch) + 2 * END_MM;
  return Math.ceil(raw / STEP_MM - 1e-9) * STEP_MM;
}

const key = (c, r) => `${c},${r}`;

/**
 * Each hole's line name: the parts' pins first, then the bus rows fill any hole not yet named
 * (sheet 4's own rule in the fume extractor's render.py).
 */
export function holeNets(board) {
  const names = new Map();
  const labels = (board && board.netLabels) || {};
  const labelOf = (net) => (typeof labels[net] === 'string' && labels[net]) || net;
  for (const [net, members] of Object.entries((board && board.nets) || {})) {
    if (!Array.isArray(members)) continue;
    for (const m of members) {
      const pin = Array.isArray(m) && board.parts?.[m[0]]?.pins?.[m[1]];
      if (isHole(pin) && !names.has(key(pin[0], pin[1]))) names.set(key(pin[0], pin[1]), labelOf(net));
    }
  }
  for (const bus of (board && board.buses) || []) {
    const line = bus.label || labelOf(bus.net);
    if (!line || !Number.isFinite(bus.from) || !Number.isFinite(bus.to)) continue;
    const [lo, hi] = bus.from <= bus.to ? [bus.from, bus.to] : [bus.to, bus.from];
    for (let c = lo; c <= hi; c++) if (!names.has(key(c, bus.row))) names.set(key(c, bus.row), line);
  }
  return names;
}

/**
 * Every link and bus with its cut. Links keep their place in the project's list as `n`, which is
 * how sheet 4 numbers its wire list. Bridges are solder blobs, so they get no row.
 */
export function wireCut(board) {
  const pitch = Number.isFinite(board?.pitch) && board.pitch > 0 ? board.pitch : 2.54;
  const names = holeNets(board);
  const lineAt = (h) => names.get(key(h[0], h[1])) || null;
  const links = [];
  ((board && board.links) || []).forEach((link, i) => {
    const path = Array.isArray(link?.path) ? link.path.filter(isHole) : [];
    if (path.length < 2) return;
    const from = path[0];
    const to = path[path.length - 1];
    links.push({ n: i + 1, from: [from[0], from[1]], to: [to[0], to[1]], line: lineAt(from) || lineAt(to), cut: cutMm(path, pitch), strip: STRIP_MM });
  });
  const buses = [];
  for (const bus of (board && board.buses) || []) {
    if (!Number.isFinite(bus?.row) || !Number.isFinite(bus.from) || !Number.isFinite(bus.to)) continue;
    const labels = board.netLabels || {};
    const line = bus.label || labels[bus.net] || bus.net || null;
    buses.push({ row: bus.row, from: bus.from, to: bus.to, line, cut: cutMm([[bus.from, bus.row], [bus.to, bus.row]], pitch) });
  }
  const sum = (list) => list.reduce((mm, x) => mm + x.cut, 0);
  return {
    links,
    buses,
    totals: { insulated: { count: links.length, mm: sum(links) }, bare: { count: buses.length, mm: sum(buses) } },
  };
}

const COLOURS = { power: 'red', ground: 'black' };

/** The suggested wires on your own board (suggestAll's groups), each with its cut and a colour hint. */
export function suggestedCut(groups, pitch = 2.54) {
  const lines = [];
  const totals = { red: 0, black: 0, other: 0 };
  for (const g of Array.isArray(groups) ? groups : []) {
    const wires = (Array.isArray(g?.wires) ? g.wires : [])
      .filter((w) => Array.isArray(w?.path) && w.path.length >= 2)
      .map((w) => ({ path: w.path, cut: cutMm(w.path, pitch) }));
    if (!wires.length) continue;
    const colour = COLOURS[g.kind] || null;
    const mm = wires.reduce((s, w) => s + w.cut, 0);
    lines.push({ net: g.net, label: g.label || g.net, colour, wires, mm });
    totals[colour || 'other'] += mm;
  }
  return { lines, totals };
}

/** A length in words, rounded up so nobody cuts short: "about 55 cm", "about 1.3 m". */
export function lengthText(mm) {
  if (mm < 1000) return `about ${Math.ceil(mm / 50 - 1e-9) * 5} cm`;
  return `about ${(Math.ceil(mm / 100 - 1e-9) / 10).toFixed(1)} m`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hole = (h) => `${h[0]},${h[1]}`;

/** "Insulated wire: 44 links, about 1.3 m in all. Bare wire: 7 buses, about 55 cm." */
export function totalsText(cut) {
  const { insulated, bare } = cut.totals;
  const parts = [];
  if (insulated.count) parts.push(`Insulated wire: ${plural(insulated.count, 'link', 'links')}, ${lengthText(insulated.mm)} in all.`);
  if (bare.count) parts.push(`Bare wire: ${plural(bare.count, 'bus', 'buses')}, ${lengthText(bare.mm)}.`);
  return parts.join(' ');
}

/** "1. 2,1 → 2,2 (+12 V): cut 15 mm, strip 5 mm at each end" */
export function linkText(l) {
  return `${l.n}. ${hole(l.from)} → ${hole(l.to)}${l.line ? ` (${l.line})` : ''}: cut ${l.cut} mm, strip ${l.strip} mm at each end`;
}

/** "Row 2 (+12 V), 2 → 32: cut 90 mm" */
export function busText(b) {
  return `Row ${b.row}${b.line ? ` (${b.line})` : ''}, ${b.from} → ${b.to}: cut ${b.cut} mm`;
}

const COLOUR_WORDS = { red: 'red wire', black: 'black wire' };

/** "+5 V, red wire: 1 wire, 20 mm" */
export function suggestedLineText(line) {
  return `${line.label}, ${COLOUR_WORDS[line.colour] || 'any other colour'}: ${plural(line.wires.length, 'wire', 'wires')}, ${line.mm} mm`;
}

/** The whole list as plain text, for Copy. */
export function wireCutText(cut, suggested = null) {
  const out = ['Wire to cut', totalsText(cut)];
  if (cut.links.length) out.push('', 'Links (insulated wire):', ...cut.links.map(linkText));
  if (cut.buses.length) out.push('', 'Bare wire buses (no stripping):', ...cut.buses.map(busText));
  if (suggested && suggested.lines.length) out.push('', 'Suggested wires on my board:', ...suggested.lines.map(suggestedLineText));
  return out.join('\n');
}
