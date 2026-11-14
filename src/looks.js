// Your parts (0.8 design §2): what a board part really looks like, as you fitted it, and another
// part fitted in its place. The look fields can come from the project file's board section or from
// your own choices (kept with your progress). No page code: unit-tested in Node.
import { SIZES, colourInValue } from './board3d-geometry.js';
import { libraryFor } from './library.js';

const range = (min, max) => ({ min, max });

/** What each kind of part can look like: field → the allowed values, or a { min, max } range. */
export const LOOK_OPTIONS = {
  dip: { holder: ['socket', 'strips', 'none'] },
  res: { mount: ['flat', 'stand'], colour: ['beige', 'blue'] },
  elec: { D: [5, 6.3, 8, 10], H: range(5, 40) },
  cer: { style: ['disc', 'dipped'] },
  led: { colour: ['red', 'green', 'yellow', 'blue', 'white'] },
  header: { female: [false, true] },
  to220: { facing: ['down', 'up', 'left', 'right'] },
};

const LIBRARY_ID = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const OWN_ID = /^own:[0-9a-f]{16}$/;

/**
 * A look's 3D model (0.9), or null: a Maker Forge Library id, own:<16 hex> (a GLB you keep in this
 * browser) or project:<path> (a .glb or .wrl in the project, a plain path inside it).
 */
export function cleanModelChoice(v) {
  if (typeof v !== 'string') return null;
  if (OWN_ID.test(v) || LIBRARY_ID.test(v)) return v;
  if (!v.startsWith('project:')) return null;
  const path = v.slice('project:'.length);
  if (path.length > 300 || !/\.(glb|wrl)$/i.test(path) || /[\\:]/.test(path) || path.startsWith('/')) return null;
  return path.split('/').every((seg) => seg && seg !== '.' && seg !== '..') ? v : null;
}

const allowed = (rule, v) => (Array.isArray(rule) ? rule.includes(v) : typeof v === 'number' && Number.isFinite(v) && v >= rule.min && v <= rule.max);

/** Only the look fields that suit a part of this type, with allowed values: anything else is dropped. */
export function cleanLook(type, raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const options = Object.hasOwn(LOOK_OPTIONS, type) ? LOOK_OPTIONS[type] : {};
  for (const [field, rule] of Object.entries(options)) {
    if (Object.hasOwn(raw, field) && allowed(rule, raw[field])) out[field] = raw[field];
  }
  const model = Object.hasOwn(raw, 'model') ? cleanModelChoice(raw.model) : null; // any part can have its 3D model chosen
  if (model) out.model = model;
  return out;
}

/**
 * Another part that can go in a part's place, by the library entry of the part as drawn. pinMap:
 * each new pin and the old pins it takes over (the first one's hole is the new pin's).
 */
export const ALTERNATIVES = {
  mp1584: [{
    id: 'l7805',
    name: 'L7805 regulator',
    value: 'L7805CV',
    type: 'to220',
    card: { type: 'regulator', package: 'TO-220', polarized: true, orientation: 'Printed side towards you, legs down: IN, GND, OUT from left to right. The metal tab is GND.' },
    pinMap: { IN: ['INp'], GND: ['INn', 'OUTn'], OUT: ['OUTp'] },
    warning: "A 7805 burns the extra voltage off as heat: (input − 5 V) × current. From 12 V that's 0.7 W at 0.1 A (warm, fine) but 7 W at 1 A, far too hot. It can run the chip and a display, not a USB port: go back to a buck module for that.",
  }],
};

/** The parts that can go in this project part's place. */
export function alternativesFor(projectPart) {
  const lib = projectPart ? libraryFor(projectPart) : null;
  return lib && Object.hasOwn(ALTERNATIVES, lib.id) ? ALTERNATIVES[lib.id] : [];
}

const LOOK_FIELDS = new Set(['holder', 'mount', 'colour', 'D', 'H', 'style', 'female', 'facing', 'swap', 'model']);

/** Saved looks (from progress), checked for shape: { ref: { field: value } }. The board decides later what applies. */
export function cleanLooks(raw, isRef = () => true) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [ref, look] of Object.entries(raw).slice(0, 2000)) {
    if (!isRef(ref) || !look || typeof look !== 'object' || Array.isArray(look)) continue;
    const clean = {};
    for (const [field, v] of Object.entries(look)) {
      if (!LOOK_FIELDS.has(field)) continue;
      if (field === 'model') {
        if (cleanModelChoice(v)) clean.model = v;
        continue;
      }
      if ((typeof v === 'string' && v.length > 0 && v.length <= 40) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) clean[field] = v;
    }
    if (Object.keys(clean).length) out[ref] = clean;
  }
  return out;
}

/** The new part in the old one's holes, or null when the old part lacks a pin the new one needs. */
function swapPart(base, alt) {
  const pins = {};
  const also = {};
  const map = {}; // old pin → new pin
  for (const [pin, olds] of Object.entries(alt.pinMap)) {
    const there = olds.filter((o) => Object.hasOwn(base.pins, o));
    if (!there.length) return null;
    pins[pin] = base.pins[there[0]];
    if (there.length > 1) also[pin] = there.slice(1).map((o) => base.pins[o]);
    for (const o of there) map[o] = pin;
  }
  const part = { type: alt.type, pins, side: base.side };
  if (base.keepout) part.keepout = base.keepout;
  if (Object.keys(also).length) part.also = also; // more holes wired to that pin (both 0 V pads)
  return { part, map };
}

/** The nets with a swapped part's old pin names turned into its new ones. */
function remapNets(nets, ref, map) {
  const out = Object.assign(Object.create(null), nets);
  for (const [net, members] of Object.entries(nets)) {
    if (!members.some(([r]) => r === ref)) continue;
    const seen = new Set();
    out[net] = [];
    for (const [r, pin] of members) {
      const p = r === ref ? map[pin] : pin;
      if (!p || seen.has(`${r}\u0000${p}`)) continue;
      seen.add(`${r}\u0000${p}`);
      out[net].push([r, p]);
    }
  }
  return out;
}

/**
 * The board as you built it: { board, cards, pinMaps }.
 * - board: the project's board with each part's look applied and swapped parts in place
 * - cards: what changes on a swapped part's card (value, type, note, warning)
 * - pinMaps: a swapped part's old pin → new pin, for your placements
 * With no looks it's the project's own board object.
 * partOf(ref): the project's part (value, type), to find the alternatives.
 */
export function applyLooks(board, looks, partOf = () => null) {
  if (!board || !looks || !Object.keys(looks).length) return { board, cards: {}, pinMaps: {} };
  const parts = Object.assign(Object.create(null), board.parts);
  const cards = Object.create(null);
  const pinMaps = Object.create(null);
  let nets = board.nets;
  for (const [ref, look] of Object.entries(looks)) {
    if (!Object.hasOwn(board.parts, ref)) continue;
    const base = board.parts[ref];
    let part = base;
    const alt = look.swap ? alternativesFor(partOf(ref)).find((a) => a.id === look.swap) : null;
    const swapped = alt ? swapPart(base, alt) : null;
    if (swapped) {
      part = swapped.part;
      pinMaps[ref] = swapped.map;
      nets = remapNets(nets, ref, swapped.map);
      const was = partOf(ref);
      const lib = was ? libraryFor(was) : null;
      const name = (o) => (lib && lib.pins && lib.pins[o]) || o;
      const wiredTo = Object.entries(swapped.map).reduce((acc, [o, pin]) => ({ ...acc, [pin]: [...(acc[pin] || []), name(o)] }), {});
      cards[ref] = {
        value: alt.value,
        ...alt.card,
        note: `Fitted in place of ${was && was.value ? was.value : 'the part on the drawing'}.`,
        swapped: alt.name,
        warning: alt.warning,
        wiredTo: `On sheet 4 it's wired to the old part's holes: ${Object.entries(wiredTo).map(([pin, olds]) => `${pin} to ${olds.join(' and ')}`).join(', ')}.`,
      };
    }
    const extra = cleanLook(part.type, look);
    if (Object.keys(extra).length) {
      part = { ...part, ...extra };
      if (part.type === 'res' && extra.mount === 'flat') delete part.body;
      if (part.type === 'res' && extra.mount === 'stand' && !(part.body && Object.hasOwn(part.pins, part.body))) part.body = Object.keys(part.pins)[0];
    }
    if (part !== base) parts[ref] = part;
  }
  return { board: { ...board, parts, nets }, cards, pinMaps };
}

const choices = (list) => list.map(([value, label]) => ({ value, label }));

/**
 * The choices on a part's card: [{ field, label, current, choices: [{ value, label }] }].
 * base: the project's board part; look: your choices for it; projectPart: its value and type.
 */
export function lookFields(base, look = {}, projectPart = null) {
  if (!base) return [];
  const fields = [];
  const alts = alternativesFor(projectPart);
  const alt = look.swap ? alts.find((a) => a.id === look.swap) || null : null;
  if (alts.length) {
    fields.push({ field: 'swap', label: 'Part fitted', current: alt ? alt.id : '', choices: [{ value: '', label: `As drawn: ${projectPart.value || ''}`.trim() }, ...alts.map((a) => ({ value: a.id, label: a.name }))] });
  }
  const type = alt ? alt.type : base.type;
  const mine = cleanLook(type, look);
  const now = (field, fallback) => (Object.hasOwn(mine, field) ? mine[field] : !alt && base[field] !== undefined ? base[field] : fallback);
  switch (type) {
    case 'dip':
      fields.push({ field: 'holder', label: 'Chip holder', current: now('holder', 'socket'), choices: choices([['socket', 'In a DIP socket'], ['strips', 'In two header strips'], ['none', 'Soldered in']]) });
      break;
    case 'res':
      fields.push({ field: 'mount', label: 'Mounted', current: now('mount', 'flat'), choices: choices([['flat', 'Lying flat'], ['stand', 'Standing up']]) });
      fields.push({ field: 'colour', label: 'Body', current: now('colour', 'beige'), choices: choices([['beige', 'Beige (carbon film)'], ['blue', 'Blue (metal film)']]) });
      break;
    case 'elec': {
      const D = now('D', 6.3);
      const H = now('H', SIZES.electrolytic[D] || 11);
      const heights = [...new Set([7, 11, 11.5, 12.5, 16, 20, 25, H])].sort((a, b) => a - b);
      fields.push({ field: 'D', label: 'Diameter', current: D, choices: LOOK_OPTIONS.elec.D.map((d) => ({ value: d, label: `${d} mm` })) });
      fields.push({ field: 'H', label: 'Height', current: H, choices: heights.map((h) => ({ value: h, label: `${h} mm` })) });
      break;
    }
    case 'cer':
      fields.push({ field: 'style', label: 'Kind', current: now('style', 'disc'), choices: choices([['disc', 'Orange disc'], ['dipped', 'Blue dipped (multilayer)']]) });
      break;
    case 'led':
      fields.push({ field: 'colour', label: 'Colour', current: now('colour', colourInValue(projectPart && projectPart.value) || 'green'), choices: choices([['red', 'Red'], ['green', 'Green'], ['yellow', 'Yellow'], ['blue', 'Blue'], ['white', 'White']]) });
      break;
    case 'header':
      if (!(base.half > 2)) fields.push({ field: 'female', label: 'Kind', current: now('female', false), choices: choices([[false, 'Pins (male)'], [true, 'Sockets (female)']]) });
      break;
    case 'to220':
      fields.push({ field: 'facing', label: 'Printed side faces', current: now('facing', 'down'), choices: choices([['down', 'Down the board'], ['up', 'Up the board'], ['left', 'Left'], ['right', 'Right']]) });
      break;
    default:
  }
  return fields;
}

/** "In two header strips · Beige": what each field is now, in words. */
export function lookSummary(fields) {
  return fields.map((f) => (f.choices.find((c) => c.value === f.current) || { label: String(f.current) }).label).join(' · ');
}
