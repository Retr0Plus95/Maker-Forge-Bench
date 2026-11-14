// Bench 0.9 (design §2): which Maker Forge Library model draws a board part, and where it goes.
// Data in, answers out: no page code, unit-tested in Node.
//
// Frames: a model's footprint pins are mm from its pin 1 with y up, as seen from above (KiCad's 3D
// frame). The board's are mm with x right and y down the sheet, as board3d uses them. An `angle` turns
// the model about the vertical, from +x towards +y (clockwise as seen from above), after pin 1 is put
// on (x, y). `mirror` means the part is under the board, so its footprint is seen mirrored.

/** A model whose pins miss the part's holes by more than this (mm) isn't used: Bench keeps its own. */
export const MISS_LIMIT = 0.3;
const PITCH = 2.54;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fitOf = (e) => (e && e.fit) || {};
const pinsOf = (e) => (e && e.footprint && Array.isArray(e.footprint.pins) ? e.footprint.pins : []);
const spanOf = (e) => (pinsOf(e).length > 1 ? dist(pinsOf(e)[0], pinsOf(e)[1]) : 0);

/** The best entry by score (lowest), then the library's usual one (fit.default), then library order. */
function best(list, score = () => 0) {
  let top = null;
  let topScore = Infinity;
  for (const e of list) {
    const s = score(e);
    const better = s < topScore - 1e-6 || (Math.abs(s - topScore) <= 1e-6 && fitOf(e).default && !fitOf(top).default);
    if (better) {
      top = e;
      topScore = s;
    }
  }
  return top;
}

/** Bench's pin names in KiCad's pad order: diodes and LEDs cathode first, electrolytics + first, numbers by number. */
export function kicadPinOrder(part) {
  const names = Object.keys((part && part.pins) || {});
  const first = (...wanted) => {
    const hit = names.find((n) => wanted.includes(n));
    return hit ? [hit, ...names.filter((n) => n !== hit)] : names;
  };
  switch (part && part.type) {
    case 'led':
    case 'diode':
    case 'diode_stand':
      return first('K', 'k', 'C');
    case 'elec':
      return first('+', 'p', 'P', 'pos');
    default:
      if (names.length && names.every((n) => /^\d+$/.test(n))) return [...names].sort((a, b) => Number(a) - Number(b));
      return names; // three-leg parts, modules: the project's own order
  }
}

const inRow = (holes) => holes.length < 3 || holes.every((h) => {
  const [a, b] = holes;
  return Math.abs((b[0] - a[0]) * (h[1] - a[1]) - (b[1] - a[1]) * (h[0] - a[0])) < 1e-6;
});

const DO41 = /1N400[1-7]|1N49[3-4]|1N581[7-9]|UF400|FR10|SB1[0-9]0|BA15/i;
const DO201 = /1N54|1N58[2-4]|SB5|SR5|MBR3|SB3[0-9]|SR3|FR30|UF54/i;
const DO35 = /1N4148|1N914|1N4448|BAT4[1-9]|BAT85|1N60|BZX55|ZPD|ZENER/i;

function diodeFamily(value, D, standing) {
  if (DO201.test(value)) return 'DO-201AD';
  if (DO41.test(value)) return 'DO-41';
  if (DO35.test(value)) return 'DO-35';
  if (D >= 4.5) return 'DO-201AD';
  if (D >= 2.4) return 'DO-41';
  if (D > 0) return 'DO-35';
  return standing ? 'DO-201AD' : 'DO-41'; // as Bench draws them when nothing is said
}

/**
 * The library entry that draws this board part, or null (Bench keeps its own model).
 * part: a board part (type, pins in holes, mount, D, style, holder, female, half, body…) plus the
 * project's `value`. look: your Looks like choices, which win. A `model` id in either wins over all.
 */
export function modelFor(part, look = {}, index, { pitch = PITCH } = {}) {
  if (!part || !part.pins || !index || !Array.isArray(index.parts)) return null;
  const all = index.parts;
  const chosen = (look && look.model) || part.model;
  if (chosen) {
    const e = all.find((p) => p.id === chosen);
    if (e) return e;
  }
  const f = { ...part, ...(look || {}) };
  const of = (kind) => all.filter((e) => e.kind === kind);
  const holes = kicadPinOrder(part).map((n) => part.pins[n]).filter(Array.isArray).map(([x, y]) => [x * pitch, y * pitch]);
  const gap = holes.length > 1 ? dist(holes[0], holes[1]) : 0;
  const bySpan = (list) => best(list, (e) => Math.abs(spanOf(e) - gap));
  const value = String(f.value || '');
  switch (part.type) {
    case 'res':
      return bySpan(of('res').filter((e) => fitOf(e).mount === (f.mount || 'flat')));
    case 'cer':
      return bySpan(of('cer').filter((e) => fitOf(e).style === (f.style || 'disc')));
    case 'film':
      return bySpan(of('film'));
    case 'elec': {
      const list = of('elec');
      const want = Number(f.D) || 6.3;
      const D = best(list, (e) => Math.abs(fitOf(e).D - want));
      return D ? bySpan(list.filter((e) => fitOf(e).D === fitOf(D).D)) : null;
    }
    case 'diode':
    case 'diode_stand': {
      const standing = part.type === 'diode_stand' || f.mount === 'stand';
      const family = diodeFamily(value, Number(f.D) || 0, standing);
      const names = Object.keys(part.pins);
      const body = f.body || names[1] || names[0]; // the pin the body sits over, as board3d draws it
      const up = body === 'A' ? 'K' : 'A'; // the other lead comes down from the top
      return bySpan(of('diode').filter((e) => fitOf(e).family === family && fitOf(e).mount === (standing ? 'stand' : 'flat') &&
        (!standing || fitOf(e).up === up)));
    }
    case 'led': {
      const size = Number(f.D) === 3 || /\b3\s?mm\b/i.test(value) ? 3 : 5;
      return best(of('led').filter((e) => fitOf(e).size === size && !fitOf(e).clear && fitOf(e).mount !== 'flat'));
    }
    case 'to92': {
      const legs = gap > 0 && gap < 1.9 ? 'narrow' : 'inline';
      return best(of('to92').filter((e) => fitOf(e).legs === legs && !fitOf(e).long));
    }
    case 'to220':
      return best(of('to220').filter((e) => fitOf(e).mount === 'stand' && pinsOf(e).length === holes.length));
    case 'dip': {
      const n = holes.length;
      const holder = (f.holder || 'socket') === 'socket' ? 'socket' : 'none'; // in header strips: the chip alone
      const width = n >= 4 ? dist(holes[0], holes[n - 1]) : 7.62;
      return best(of('dip').filter((e) => fitOf(e).pins === n && fitOf(e).holder === holder), (e) => Math.abs(fitOf(e).width - width));
    }
    case 'header': {
      const n = holes.length;
      if (f.half > 2) return best(of('connector').filter((e) => fitOf(e).style === 'kk' && fitOf(e).count === n)); // a fan header
      const rows = inRow(holes) ? 1 : 2;
      return best(of('header').filter((e) => fitOf(e).rows === rows && fitOf(e).count === n && fitOf(e).female === Boolean(f.female) && !fitOf(e).bent));
    }
    case 'module':
      return of('module').find((e) => fitOf(e).value && value.toUpperCase().includes(String(fitOf(e).value).toUpperCase())) || null;
    case 'underside':
      return null;
    default: // types Bench will draw later (pots, buttons, terminals…): the usual one with as many pins
      return best(of(part.type).filter((e) => pinsOf(e).length === holes.length));
  }
}

const degrees = (rad) => {
  let d = (rad * 180) / Math.PI;
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return Math.abs(d) < 1e-9 ? 0 : d;
};

/**
 * Where a model goes: pin 1 on hole 1, turned so its pin 2 points at hole 2. holes: the part's pins
 * in KiCad order (kicadPinOrder), as [x, y] mm on the board. miss: the farthest any model pin lands
 * from its hole (Infinity when the model has more pins than the part has holes).
 */
export function placeModel(entry, holes, { side } = {}) {
  const pins = pinsOf(entry);
  const mirror = side === 'bottom';
  const at = holes && holes[0] ? holes[0] : [0, 0];
  if (!pins.length || !Array.isArray(holes) || pins.length > holes.length) return { x: at[0], y: at[1], angle: 0, mirror, miss: Infinity };
  // the model's pins in the board frame: y turned over, except under the board, where the mirror turns it back
  const off = pins.map(([px, py]) => [px - pins[0][0], mirror ? py - pins[0][1] : -(py - pins[0][1])]);
  let angle = 0;
  if (pins.length > 1) angle = Math.atan2(holes[1][1] - at[1], holes[1][0] - at[0]) - Math.atan2(off[1][1], off[1][0]);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let miss = 0;
  off.forEach(([dx, dy], i) => {
    miss = Math.max(miss, Math.hypot(at[0] + dx * c - dy * s - holes[i][0], at[1] + dx * s + dy * c - holes[i][1]));
  });
  return { x: at[0], y: at[1], angle: degrees(angle), mirror, miss };
}

/**
 * Where a module wired in place goes (the fume extractor's buck module sits on foam tape, wired to
 * holes): its board outline centred in the part's outline [x1, y1, x2, y2] mm, turned 90° when the
 * outline runs the other way. miss is 0: nothing has to line up with holes.
 */
export function placeInOutline(entry, outline, { side } = {}) {
  const mirror = side === 'bottom';
  const box = entry && entry.model && entry.model.box;
  if (!box || !Array.isArray(outline) || outline.length !== 4) return null;
  const [[bx1, by1], [bx2, by2]] = box;
  const [y1, y2] = mirror ? [by1, by2] : [-by2, -by1]; // the board frame's y runs down
  const centre = [(bx1 + bx2) / 2, (y1 + y2) / 2];
  const wide = Math.abs(outline[2] - outline[0]) >= Math.abs(outline[3] - outline[1]);
  const turn = wide !== (bx2 - bx1 >= by2 - by1);
  const c = turn ? [-centre[1], centre[0]] : centre; // turned 90°: (x, y) → (−y, x)
  const mid = [(outline[0] + outline[2]) / 2, (outline[1] + outline[3]) / 2];
  return { x: mid[0] - c[0], y: mid[1] - c[1], angle: turn ? 90 : 0, mirror, miss: 0 };
}

/** The entry for a KiCad project's model path (${KICAD9_3DMODEL_DIR}/LED_THT.3dshapes/LED_D5.0mm.step), or null. */
export function entryForModelPath(path, index) {
  if (!index || !Array.isArray(index.parts)) return null;
  const segs = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (segs.length < 2) return null;
  const key = segs.slice(-2).join('/').replace(/\.(step|stp|wrl)$/i, '').toLowerCase();
  return index.parts.find((e) => e.source && e.source.path &&
    e.source.path.replace(/\.(step|stp|wrl)$/i, '').toLowerCase() === key) || null;
}
