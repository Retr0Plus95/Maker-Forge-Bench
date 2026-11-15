// At the bench (1.0.1, ideas 5, 6 and 7): a soldering tip for each kind of part, the tools a step
// needs, and how much solder the whole board takes. No page code: unit-tested in Node.

const TIPS = {
  resistor: 'Bend the legs to fit, push it down to the board, solder one leg, check it sits right, then the other. Trim the legs after.',
  'capacitor-ceramic': 'Not fussy: either way round, and it takes the heat well.',
  'capacitor-electrolytic': 'The stripe marks the minus leg (the shorter one). Backwards it can swell or pop, so check before soldering.',
  led: "LEDs don't like heat: about 3 seconds a leg, then let it cool. The short leg is minus.",
  diode: 'The band marks the cathode (the minus end). Check it matches the drawing before soldering.',
  transistor: 'Match its flat side to the drawing, and keep each joint short: about 3 seconds a leg.',
  ic: 'If it goes in a socket, solder the socket, not the chip. Do two opposite corner pins first, check it sits flat, then the rest. The pins are close: a little solder each.',
  connector: 'Solder one pin, check it sits straight and flat, then the rest.',
  crystal: 'Keep it flat on the board and the joints quick.',
  potentiometer: 'Solder its legs quickly, and its mounting tabs too if it has them: they take the strain when you turn it.',
  switch: "The plastic melts easily: quick joints, and don't press on it while the solder sets.",
  fuse: 'Solder the holder first and put the fuse in afterwards.',
  module: 'Check its pin labels match the drawing before soldering: it only fits one way. Do two corner pins first.',
};
// the card library's kinds (library.js), for a part whose project names no type
const LIBRARY_KINDS = { led: 'led', electrolytic: 'capacitor-electrolytic', rectifier: 'diode', crystal: 'crystal', potentiometer: 'potentiometer',
  '2n2222': 'transistor', bc547: 'transistor', atmega328p: 'ic', mp1584: 'module', l7805: 'transistor', fan4: 'connector' };

const WHAT_TIPS = {
  links: 'Cut each link to its length (Wiring → Wire to cut), strip 5 mm at each end, and lay it flat on the board.',
  buses: 'Pull the bare wire straight first (one end in pliers, pull the other), then solder both ends and about every third hole.',
  bridges: 'Heat both pads, add solder to each and let the two blobs flow together into one.',
};

const kindOf = (part, libraryId) => (part && TIPS[part.type] ? part.type : LIBRARY_KINDS[libraryId] || null);

/** One line of advice for soldering this part, from its type (or its library entry), or null. */
export function tipFor(part, libraryId) {
  const kind = kindOf(part, libraryId);
  return kind ? TIPS[kind] : null;
}

const TOOLS = ['flush cutters', 'pliers', 'wire strippers', 'tape or Blu-Tack to hold it', 'multimeter'];
const LEGS = new Set(['resistor', 'capacitor-ceramic', 'capacitor-electrolytic', 'led', 'diode', 'transistor', 'crystal']);
const BEND = new Set(['resistor', 'diode']);
const HOLD = new Set(['connector', 'ic', 'module']);

/**
 * What to have at hand for a step, besides the iron and solder: legged parts → flush cutters; parts
 * whose legs are bent and bare buses → pliers; links → wire strippers; headers, sockets and modules →
 * something to hold them; a step about checking or measuring → a multimeter.
 * parts: the step's parts as project parts (with type).
 */
export function toolsFor(step, parts) {
  const need = new Set();
  const what = (step && step.what) || [];
  for (const p of parts || []) {
    if (LEGS.has(p.type)) need.add('flush cutters');
    if (BEND.has(p.type)) need.add('pliers');
    if (HOLD.has(p.type)) need.add('tape or Blu-Tack to hold it');
  }
  if (what.includes('links')) need.add('flush cutters').add('wire strippers');
  if (what.includes('buses')) need.add('flush cutters').add('pliers');
  if (!(parts || []).length && !what.length && /check|measure|power.?up/i.test((step && step.title) || '')) need.add('multimeter');
  return TOOLS.filter((t) => need.has(t));
}

/** A step's tips: its own for links, buses and bridges, then one per kind of part, first seen first. */
export function stepTips(step, parts, libraryIdOf = () => null) {
  const tips = ((step && step.what) || []).filter((w) => WHAT_TIPS[w]).map((w) => WHAT_TIPS[w]);
  const seen = new Set();
  for (const p of parts || []) {
    const kind = kindOf(p, libraryIdOf(p));
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    tips.push(TIPS[kind]);
  }
  return tips;
}

/**
 * How much soldering the board is: every hole with solder in it, once (each part leg, each link end,
 * both holes of a bridge, each bare bus at both ends and about every third hole), and the solder for
 * it: about 8 mm of 0.8 mm wire a joint, plus a fifth to spare, rounded up to the next 0.5 m.
 * { joints, metres }, or null without a board.
 */
export function solderNeeded(board) {
  if (!board || !board.parts) return null;
  const holes = new Set();
  const add = (h) => { if (Array.isArray(h) && Number.isInteger(h[0]) && Number.isInteger(h[1])) holes.add(`${h[0]},${h[1]}`); };
  for (const part of Object.values(board.parts)) for (const h of Object.values(part.pins || {})) add(h);
  for (const link of board.links || []) {
    add(link.path[0]);
    add(link.path[link.path.length - 1]);
  }
  for (const bridge of board.bridges || []) for (const h of bridge.holes) add(h);
  for (const bus of board.buses || []) {
    const [lo, hi] = [Math.min(bus.from, bus.to), Math.max(bus.from, bus.to)];
    for (let c = lo; c <= hi; c += 3) add([c, bus.row]);
    add([hi, bus.row]);
  }
  const joints = holes.size;
  return { joints, metres: Math.ceil((joints * 8 * 1.2) / 500) / 2 };
}
