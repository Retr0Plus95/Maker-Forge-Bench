// A board or module from Maker Forge Shape's list (Bench 1.0, design §3) in words, for its part card:
// its size, mounting holes and the ports at its edges, as Shape knows them. No page code: unit-tested.

/** Shape's port kinds, as the card says them. */
export const PORT_WORDS = Object.freeze({
  micro: 'micro-USB', usbc: 'USB-C', usbmini: 'mini-USB', usba: 'USB-A', usba2: 'two USB-A', usbb: 'USB-B',
  dcpcb: 'DC jack', jack35: 'audio jack', rj45: 'network socket', hdmi: 'HDMI', hdmimicro: 'micro-HDMI', hdmimini: 'mini-HDMI',
});

/** Shape's edges: x0 and x1 are the left and right, y0 the front and y1 the back. */
export const EDGE_WORDS = Object.freeze({ x0: 'left', x1: 'right', y0: 'front', y1: 'back' });

const mm = (v) => String(Number(v));
const listed = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** { size, holes, ports, check } for a library entry with Shape's facts, or null for any other part. */
export function moduleFacts(entry) {
  const m = entry && entry.module;
  if (!m) return null;
  const holes = Array.isArray(m.holes) ? m.holes.length : 0;
  const screws = m.screw ? ` for ${m.screw} screws` : '';
  const edges = [];
  for (const edge of Object.keys(EDGE_WORDS)) {
    const counts = new Map();
    for (const p of Array.isArray(m.ports) ? m.ports : []) {
      if (p[0] === edge) counts.set(p[2], (counts.get(p[2]) || 0) + 1);
    }
    if (!counts.size) continue;
    const words = [...counts].map(([kind, n]) => `${PORT_WORDS[kind] || kind}${n > 1 ? ` (×${n})` : ''}`);
    edges.push(`${listed(words)} on the ${EDGE_WORDS[edge]} edge`);
  }
  return {
    size: `${mm(m.w)} × ${mm(m.d)} mm`,
    holes: holes ? `${holes} mounting ${holes === 1 ? 'hole' : 'holes'}${screws}` : 'no mounting holes',
    ports: edges.join('; '),
    check: Boolean(m.check),
  };
}

/** The card's line: "Module: 45 × 18 mm, no mounting holes, mini-USB on the left edge." */
export function moduleText(facts) {
  if (!facts) return '';
  const words = `Module: ${[facts.size, facts.holes, facts.ports].filter(Boolean).join(', ')}.`;
  return facts.check ? `${words} Sizes vary between makers: measure yours.` : words;
}
