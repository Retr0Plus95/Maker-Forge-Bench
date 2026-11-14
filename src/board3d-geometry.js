// The 3D board's shapes, as plain numbers (board-view design §5, 0.5 big improvement B7, 0.8 §1).
// No page code, no three.js: unit-tested in Node. Millimetres; x along the columns, y down the rows,
// z up from the board's top. Sizes come from datasheets (the source is beside each).
import { resistorBands, capacitorCode, BAND_HEX } from './markings.js';

export const BOARD_THICKNESS = 1.6;
const LEAD = 0.3; // 0.6 mm tinned copper lead (radius)
const LEAD_COLOUR = '#c0c4c8';
const GOLD = '#d4af37';

export const SIZES = {
  // Yageo CFR-25 (1/4 W carbon film): 6.3 mm long, end caps 2.4 mm across and 1.4 mm long, 2.1 mm waist
  resistor: { len: 6.3, dia: 2.4, waist: 2.1, cap: 1.4 },
  // Typical 5 mm radial ceramic disc (Vishay K-series): 5 mm across, 2.5 mm thick; a dipped
  // multilayer one (KEMET C320): about 4.2 mm across, 2.6 mm thick
  ceramic: { dia: 5, thick: 2.5 },
  dipped: { dia: 4.2, thick: 2.6 },
  // Nichicon UVR / Panasonic radial cans: D × L; a 0.45 mm rubber bung, a bead groove 1.2 mm up
  electrolytic: { 5: 11, 6.3: 11, 8: 11.5, 10: 12.5 },
  // Microchip PDIP-28 (300 mil, drawing C04-070): 34.7 mm long, 3.3 mm tall, 7.24 mm across below
  // the mould line, 6.6 mm at the top; rows 7.62 mm apart; leads 1.52 mm wide at the shoulder,
  // 0.46 mm at the tip, 0.25 mm thick, 3.3 mm below the seating plane, which is 0.38 mm under the body
  dip: { width: 6.6, mould: 7.24, height: 3.3, end: 0.85, line: 1.25, shoulder: 1.52, tip: 0.46, thick: 0.25, below: 3.3, standoff: 0.4 },
  // Mill-Max / generic DIP socket, 4.3 mm tall
  socket: { height: 4.3 },
  // Würth 613 female header strip: 2.54 mm wide, 8.5 mm tall
  strip: { width: 2.54, height: 8.5 },
  // Generic 2.54 mm pin header: 2.5 mm plastic, 0.64 mm square pins, 6 mm above the plastic
  header: { base: 2.5, pin: 0.64, above: 6, below: 3 },
  // Molex KK 254 (47053) 4-pin fan header: white, a back wall with the locking ramp
  fan: { base: 3, wall: 11.4, wallThick: 0.8, depth: 5 },
  // TO-92 (ON Semi PN2222A): 4.8 mm across, 3.7 mm flat to round, 4.6 mm tall
  to92: { radius: 2.4, flatOffset: 0.6, height: 4.6, lift: 2.6 },
  // TO-220 (ST L7805 drawing): 10.2 mm wide, 4.5 mm thick, plastic 9.2 mm tall, 15.5 mm with the
  // 1.27 mm tab, a 3.8 mm hole 2.8 mm from the top; legs 0.8 × 0.5 mm, 1.4 mm wide at the shoulder,
  // 2.4 mm in front of the tab's back face
  to220: { width: 10.2, thick: 4.5, body: 9.2, total: 15.5, tab: 1.27, hole: 3.8, holeFromTop: 2.8, back: 2.4, lift: 3.0, lead: 0.8, leadThick: 0.5, shoulder: 1.4 },
  // DO-201AD (Vishay 1N5402): 5.3 × 9.5 mm, 1.3 mm leads
  do201: { dia: 5.3, len: 9.5, lead: 0.65 },
  // HC-49/S crystal: 11.4 × 4.7 × 3.5 mm, on a base 0.4 mm thick
  hc49s: { len: 11.4, width: 4.7, height: 3.5, base: 0.4 },
  // 5 mm LED (Kingbright L-7104): 5 mm dome, 5.8 mm flange (flat on the cathode side), 8.6 mm tall
  led: { dia: 5, flange: 5.8, height: 8.6, flat: 2.5 },
};

export const LED_COLOURS = { red: '#ff3b30', green: '#3ddc84', yellow: '#ffd60a', blue: '#3a86ff', white: '#f2f2f2' };

/** An LED colour named in a part's value ("5 mm green LED" → 'green'), or null. */
export function colourInValue(value) {
  const m = /\b(red|green|yellow|blue|white)\b/i.exec(String(value || ''));
  return m ? m[1].toLowerCase() : null;
}

const mm = (hole, pitch) => [(hole[0] - 1) * pitch, (hole[1] - 1) * pitch];
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const lead = (points, role = 'lead', radius = LEAD) => ({ kind: 'wire', points, radius, colour: LEAD_COLOUR, role });
/** A solder joint under the board at a leg (drawn as one instanced cone per joint). */
const joint = ([x, y]) => ({ kind: 'joint', x, y });

function holeSpan(part) {
  const [a, b] = Object.values(part.pins);
  return b ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) : 0;
}

/** The unit vector from a to b (along x when they're the same point), and the length. */
function along(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len) return { ux: 1, uy: 0, len: 0 };
  return { ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, len };
}

// ---- lathe shapes: a profile [[r, t], ...] spun round an axis, t measured along it from 0
const maxOf = (profile, k) => Math.max(...profile.map((p) => p[k]));
/** Standing up at x,y, from z0. */
const latheUp = (profile, x, y, z0, more) => ({ kind: 'lathe', profile, x, y, z0, h: maxOf(profile, 1), radius: maxOf(profile, 0), ...more });
/** Lying at height z, from a to b (b is where t = len). */
const latheLying = (profile, a, b, z, more) => ({ kind: 'lathe', profile, x1: a[0], y1: a[1], x2: b[0], y2: b[1], z, len: maxOf(profile, 1), radius: maxOf(profile, 0), ...more });

/** The profile's radius at t (straight lines between its points; the widest where it steps). */
export function radiusAt(profile, t) {
  let best = 0;
  for (let k = 1; k < profile.length; k++) {
    const [r0, t0] = profile[k - 1];
    const [r1, t1] = profile[k];
    if (t < Math.min(t0, t1) || t > Math.max(t0, t1)) continue;
    best = Math.max(best, t1 === t0 ? Math.max(r0, r1) : r0 + ((r1 - r0) * (t - t0)) / (t1 - t0));
  }
  return best;
}

/** A carbon-film resistor L long: rounded end caps and a narrower waist. */
export function resistorProfile(L = SIZES.resistor.len) {
  const S = SIZES.resistor;
  const r = S.dia / 2;
  const w = S.waist / 2;
  const cap = Math.min(S.cap, L / 3);
  return [[0, 0], [r * 0.45, 0], [r * 0.8, 0.07], [r * 0.96, 0.25], [r, 0.55], [r, cap - 0.25], [w, cap + 0.1],
    [w, L - cap - 0.1], [r, L - cap + 0.25], [r, L - 0.55], [r * 0.96, L - 0.25], [r * 0.8, L - 0.07], [r * 0.45, L], [0, L]];
}

/** An electrolytic can from the top of its bung (t = 0.45) to its top: bead groove, rolled top edge. */
function canProfile(D, h) {
  const r = D / 2;
  return [[0, 0.45], [r - 0.06, 0.45], [r, 0.62], [r, 1.05], [r - 0.22, 1.25], [r - 0.22, 1.6], [r, 1.8], [r, h - 0.5],
    [r - 0.08, h - 0.2], [r - 0.3, h - 0.02], [r - 0.42, h], [0, h]];
}

/** A disc: flat faces with a rounded rim. */
function discProfile(dia, thick) {
  const r = dia / 2;
  return [[0, 0], [r * 0.78, 0], [r * 0.95, thick * 0.18], [r, thick * 0.5], [r * 0.95, thick * 0.82], [r * 0.78, thick], [0, thick]];
}

/** Where the bands sit along a body L long: three by one cap, the tolerance band alone at the other. */
function bandSpots(n, L) {
  const k = Math.min(1, L / SIZES.resistor.len);
  const spots = (n >= 5 ? [0.7, 1.45, 2.15, 2.85] : [0.75, 1.7, 2.5]).map((t) => t * k);
  return n <= 3 ? spots.slice(0, n) : [...spots.slice(0, n - 1), L - 0.75 * k];
}

/** Where a resistor's colour bands go along a body L long, from its pin 1 end: [{ t, w, colour }] (0.9: on a library model). */
export function bandLayout(bands, L) {
  const w = 0.5 * Math.min(1, L / SIZES.resistor.len);
  return bandSpots(bands.length, L).map((t, i) => ({ t, w, colour: BAND_HEX[bands[i]] }));
}

/** A resistor's colour bands as thin rings on its body, following the profile. */
function bandRings(bands, profile, place) {
  const L = maxOf(profile, 1);
  const w = 0.5 * Math.min(1, L / SIZES.resistor.len);
  return bandSpots(bands.length, L).map((t, i) => place(t, w, radiusAt(profile, t) + 0.03, BAND_HEX[bands[i]]));
}

/** A box's corners on the board, turned by its angle. */
export function boxCorners(p) {
  const c = Math.cos(p.angle || 0);
  const s = Math.sin(p.angle || 0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
    const [u, v] = [(i * p.w) / 2, (j * p.d) / 2];
    return [p.x + u * c - v * s, p.y + u * s + v * c];
  });
}

/**
 * The shapes for one part: { kind, role, colour, ... }.
 * - cyl: upright cylinder, centre x,y, from z0 up h, radius
 * - sector: part of an upright cylinder's wall (a stripe), centre x,y, z0, h, radius, dir [dx, dy] it faces, width (radians)
 * - box: centre x,y, from z0 up h, size w (along x) × d (along y), optional angle (radians, about z)
 * - hcyl: lying cylinder from (x1,y1) to (x2,y2) at height z, radius
 * - lathe: a profile [[r, t]] spun round an axis (0.8 §1): standing at x,y from z0 (h, radius),
 *   or lying from (x1,y1) to (x2,y2) at height z (len, radius)
 * - extrude: an outline ([x, y] around 0,0, mm) pushed up h from z0, turned by angle, at x,y;
 *   bevel: false for a sharp edge
 * - dome: a cylinder of radius and height h with a half-ball on top, from z0
 * - wire: polyline of [x, y, z] points, radius
 * - print: text on a flat face: centre x,y,z, size w × h, normal [x,y,z] it faces, up [x,y,z]
 * - joint: a solder joint under the board at x,y
 * @param details { value, label } from the project, for bands and printing
 * Part fields that change the look (0.8 §2): mount and colour ('blue') for resistors; D and H for
 * electrolytics; style ('dipped') for ceramics; colour for LEDs (else from the value); holder
 * ('socket' | 'strips' | 'none') for the chip; female for headers; facing for TO-220s.
 */
export function partGeometry(part, pitch = 2.54, ref = '', details = {}) {
  const pins = Object.fromEntries(Object.entries(part.pins).map(([name, hole]) => [name, mm(hole, pitch)]));
  const pts = Object.values(pins);
  const [cx, cy] = centre(pts);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const T = BOARD_THICKNESS;
  const below = -T - 1; // where a trimmed leg ends under the board
  const out = [];
  const joints = () => { if (part.side !== 'bottom') for (const p of pts) out.push(joint(p)); };

  switch (part.type) {
    case 'res': {
      const names = Object.keys(pins);
      const bands = resistorBands(details.value);
      const colour = part.colour === 'blue' ? '#3f7fc4' : '#d9c39a';
      const r = SIZES.resistor.dia / 2;
      const flat = part.mount ? part.mount === 'flat' : holeSpan(part) >= 4; // pcb.py's rule when the file doesn't say
      const bodyPin = part.body && pins[part.body] ? part.body : names[0];
      if (flat || pts.length < 2) {
        const [a, b] = pts.length >= 2 ? pts : [pts[0], pts[0]];
        const { ux, uy, len } = along(a, b);
        const half = Math.max(1.2, Math.min(SIZES.resistor.len / 2, len / 2 - 0.8));
        const z = r + 0.3;
        const e1 = [cx - ux * half, cy - uy * half];
        const e2 = [cx + ux * half, cy + uy * half];
        const profile = resistorProfile(2 * half);
        out.push(latheLying(profile, e1, e2, z, { colour, role: 'body' }));
        if (bands) {
          out.push(...bandRings(bands, profile, (t, w, radius, c) => ({
            kind: 'hcyl', x1: e1[0] + ux * (t - w / 2), y1: e1[1] + uy * (t - w / 2), x2: e1[0] + ux * (t + w / 2), y2: e1[1] + uy * (t + w / 2), z, radius, colour: c, role: 'band',
          })));
        }
        // each lead bends over a little radius on its way in
        const bend = Math.min(0.6, Math.max(0, len / 2 - half - 0.1));
        out.push(lead([[a[0], a[1], below], [a[0], a[1], z - bend], [a[0] + ux * bend, a[1] + uy * bend, z], [e1[0], e1[1], z]]),
          lead([[b[0], b[1], below], [b[0], b[1], z - bend], [b[0] - ux * bend, b[1] - uy * bend, z], [e2[0], e2[1], z]]));
      } else {
        const bodyAt = pins[bodyPin];
        const other = pins[names.find((n) => n !== bodyPin)];
        const z0 = 0.8;
        const profile = resistorProfile();
        const top = z0 + SIZES.resistor.len;
        out.push(latheUp(profile, bodyAt[0], bodyAt[1], z0, { colour, role: 'body' }));
        if (bands) out.push(...bandRings(bands, profile, (t, w, radius, c) => ({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: z0 + t - w / 2, h: w, radius, colour: c, role: 'band' })));
        out.push(lead([[bodyAt[0], bodyAt[1], below], [bodyAt[0], bodyAt[1], z0]]));
        out.push(lead([[other[0], other[1], below], [other[0], other[1], top + 1.4], [bodyAt[0], bodyAt[1], top + 1.4], [bodyAt[0], bodyAt[1], top]]));
      }
      joints();
      break;
    }
    case 'cer': {
      const dipped = part.style === 'dipped';
      const S = dipped ? SIZES.dipped : SIZES.ceramic;
      const colour = dipped ? '#2f6fd6' : '#d9822b';
      const [a, b] = pts.length >= 2 ? pts : [pts[0], pts[0]];
      const { ux, uy } = along(a, b);
      // the disc stands on edge, its face across the line between the legs
      const nx = -uy;
      const ny = ux;
      const zc = 1.6 + S.dia / 2;
      const legTop = zc - S.dia / 2 + 0.4;
      out.push(latheLying(discProfile(S.dia, S.thick), [cx - nx * S.thick / 2, cy - ny * S.thick / 2], [cx + nx * S.thick / 2, cy + ny * S.thick / 2], zc, { colour, role: 'body' }));
      for (const p of pts) {
        const top = [cx + (p[0] - cx) * 0.45, cy + (p[1] - cy) * 0.45];
        out.push(lead([[p[0], p[1], below], [p[0], p[1], 1.2], [top[0], top[1], legTop]]));
        // the coating runs a little way down each leg
        const s = 0.55;
        out.push({ kind: 'wire', points: [[p[0] + (top[0] - p[0]) * s, p[1] + (top[1] - p[1]) * s, 1.2 + (legTop - 1.2) * s], [top[0], top[1], legTop + 0.3]], radius: 0.5, colour, role: 'coating', metal: 0 });
      }
      const code = capacitorCode(details.value);
      if (code) out.push({ kind: 'print', text: code, x: cx + nx * (S.thick / 2 + 0.02), y: cy + ny * (S.thick / 2 + 0.02), z: zc, w: 3.4, h: 1.6, normal: [nx, ny, 0], up: [0, 0, 1], colour: dipped ? '#e8eef8' : '#3a2200', role: 'print' });
      joints();
      break;
    }
    case 'elec': {
      const D = part.D || 6.3;
      const h = part.H || SIZES.electrolytic[D] || (D >= 8 ? 11.5 : 11);
      const z0 = 0.4;
      const r = D / 2;
      out.push({ kind: 'cyl', x: cx, y: cy, z0, radius: r - 0.45, h: 0.47, colour: '#2b2b2b', role: 'bung' });
      out.push(latheUp(canProfile(D, h), cx, cy, z0, { colour: '#1d2b4a', role: 'body' }));
      out.push({ kind: 'cyl', x: cx, y: cy, z0: z0 + h - 0.03, radius: r - 0.42, h: 0.05, colour: '#c9ccd1', role: 'top', metal: 0.8 });
      out.push({ kind: 'box', x: cx, y: cy, z0: z0 + h + 0.03, w: D * 0.62, d: 0.22, h: 0.05, colour: '#7d8288', role: 'vent' });
      out.push({ kind: 'box', x: cx, y: cy, z0: z0 + h + 0.03, w: 0.22, d: D * 0.62, h: 0.05, colour: '#7d8288', role: 'vent' });
      const n = pins.n || pts[1] || [cx, cy + 1];
      const nl = Math.hypot(n[0] - cx, n[1] - cy) || 1;
      const [dx, dy] = nl === 1 && n[0] === cx && n[1] === cy ? [0, 1] : [(n[0] - cx) / nl, (n[1] - cy) / nl];
      out.push({ kind: 'sector', x: cx, y: cy, z0: z0 + 2, h: h - 2.6, radius: r + 0.02, dir: [dx, dy], width: 0.9, colour: '#cfd6dd', role: 'stripe' });
      out.push({ kind: 'print', text: '−', x: cx + dx * (r + 0.06), y: cy + dy * (r + 0.06), z: z0 + h * 0.62, w: 1.8, h: 1.8, normal: [dx, dy, 0], up: [0, 0, 1], colour: '#1d2b4a', role: 'print' });
      // the value runs up the sleeve on the far side from the stripe
      const value = (details.value || '').replace(/\s+(?=[µunp]?F\b)/g, '').replace(/\s+(?=V\b)/g, '');
      if (value) {
        out.push({ kind: 'print', text: value.slice(0, 12), x: cx - dx * (r + 0.05), y: cy - dy * (r + 0.05), z: z0 + 1.8 + (h - 2.4) / 2, w: Math.min(h - 3, 9), h: Math.min(1.5, D * 0.3), normal: [-dx, -dy, 0], up: [dy, -dx, 0], colour: '#e6edf5', role: 'print' });
      }
      for (const p of pts) out.push(lead([[p[0], p[1], below], [p[0], p[1], z0]]));
      joints();
      break;
    }
    case 'diode_stand': {
      const S = SIZES.do201;
      const D = part.D || S.dia;
      const r = D / 2;
      const bodyName = part.body || Object.keys(pins)[1] || Object.keys(pins)[0];
      const bodyAt = pins[bodyName];
      const other = pins[Object.keys(pins).find((nm) => nm !== bodyName)] || bodyAt;
      const z0 = 0.8;
      const L = S.len;
      out.push(latheUp([[0, 0], [r - 0.5, 0], [r - 0.1, 0.15], [r, 0.6], [r, L - 0.6], [r - 0.1, L - 0.15], [r - 0.5, L], [0, L]], bodyAt[0], bodyAt[1], z0, { colour: '#232323', role: 'body' }));
      out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: z0 + L - 2.2, radius: r + 0.04, h: 1.4, colour: '#bdbdbd', role: 'band' }); // the cathode end is up: its leg loops over
      out.push(lead([[bodyAt[0], bodyAt[1], below], [bodyAt[0], bodyAt[1], z0]], 'lead', S.lead));
      out.push(lead([[other[0], other[1], below], [other[0], other[1], z0 + L + 1.4], [bodyAt[0], bodyAt[1], z0 + L + 1.4], [bodyAt[0], bodyAt[1], z0 + L]], 'lead', S.lead));
      joints();
      break;
    }
    case 'to92': {
      const S = SIZES.to92;
      const b = pins.B || [cx, cy];
      const facing = part.round === 'up' ? 'down' : 'up'; // round side up on sheet 4 means the flat face points down
      const fy = facing === 'down' ? 1 : -1;
      const by = b[1] + fy * S.flatOffset;
      // the D: a half circle on the round side, the flat face toward fy
      const outline = [];
      for (let k = 0; k <= 16; k++) {
        const t = Math.PI * (k / 16);
        outline.push([S.radius * Math.cos(t), -fy * S.radius * Math.sin(t)]);
      }
      out.push({ kind: 'extrude', x: b[0], y: by, z0: S.lift, h: S.height, outline, colour: '#232323', role: 'body', facing });
      out.push({ kind: 'print', text: (details.value || '').slice(0, 8), x: b[0], y: by + fy * 0.03, z: S.lift + S.height * 0.55, w: 4, h: 1.2, normal: [0, fy, 0], up: [0, 0, 1], colour: '#cfcfcf', role: 'print' });
      for (const p of pts) out.push(lead([[p[0], p[1], below], [p[0], p[1], 1.2], [b[0] + (p[0] - b[0]) * 0.5, by, S.lift]]));
      joints();
      break;
    }
    case 'to220': {
      const S = SIZES.to220;
      const order = ['IN', 'GND', 'OUT'].every((n) => pins[n]) ? ['IN', 'GND', 'OUT'] : Object.keys(pins).sort();
      // legs in three holes in a row; otherwise (in a module's place) it stands in the part's outline,
      // wired to its holes
      const holes = order.map((n) => part.pins[n]);
      const step = holes.length > 1 ? [holes[1][0] - holes[0][0], holes[1][1] - holes[0][1]] : [1, 0];
      const inRow = Math.abs(step[0]) + Math.abs(step[1]) === 1 &&
        holes.every((h, i) => h[0] === holes[0][0] + i * step[0] && h[1] === holes[0][1] + i * step[1]);
      let legs = holes.map((h) => mm(h, pitch));
      if (!inRow) {
        const k = part.keepout;
        const mid = k ? [Math.round((k[0] + k[2]) / 2), Math.round((k[1] + k[3]) / 2)]
          : [Math.round(holes.reduce((t, h) => t + h[0], 0) / holes.length), Math.round(holes.reduce((t, h) => t + h[1], 0) / holes.length)];
        legs = holes.map((_, i) => mm([mid[0] + i - Math.floor(holes.length / 2), mid[1]], pitch));
        const wire = (from, to) => ({ kind: 'wire', points: [[from[0], from[1], below], [from[0], from[1], 1.2], [to[0], to[1], 1.2]], radius: 0.4, colour: '#d23b3b', role: 'wire' });
        order.forEach((n, i) => {
          out.push(wire(pins[n], legs[i]));
          for (const h of (part.also && part.also[n]) || []) {
            const at = mm(h, pitch);
            out.push(wire(at, legs[i]));
            if (part.side !== 'bottom') out.push(joint(at));
          }
          if (part.side !== 'bottom') out.push(joint(legs[i]));
        });
      }
      const [cx, cy] = centre(legs);
      const first = legs[0];
      const last = legs[legs.length - 1];
      const { ux, uy } = along(first, last);
      const want = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[part.facing] || [0, 1];
      let f = [-uy, ux]; // the printed face points this way
      if (f[0] * want[0] + f[1] * want[1] < 0) f = [uy, -ux];
      const angle = Math.atan2(uy, ux);
      const at = (k) => [cx + f[0] * k, cy + f[1] * k];
      const front = S.thick - S.back; // the printed face, in front of the legs
      const plastic = S.thick - S.tab;
      const [px, py] = at(front - plastic / 2);
      const [tx, ty] = at(-S.back + S.tab / 2);
      out.push({ kind: 'box', x: px, y: py, z0: S.lift, w: S.width, d: plastic, h: S.body, angle, colour: '#1f1f1f', role: 'body', facing: part.facing || 'down' });
      out.push({ kind: 'box', x: tx, y: ty, z0: S.lift, w: S.width, d: S.tab, h: S.total, angle, colour: '#c9ccd1', role: 'tab', metal: 0.85 });
      const [h1x, h1y] = at(-S.back - 0.05);
      const [h2x, h2y] = at(-S.back + S.tab + 0.05);
      out.push({ kind: 'hcyl', x1: h1x, y1: h1y, x2: h2x, y2: h2y, z: S.lift + S.total - S.holeFromTop, radius: S.hole / 2, colour: '#0b0b0b', role: 'hole' });
      const [fx, fy] = at(front + 0.02);
      out.push({ kind: 'print', text: (details.value || '').split(/\s/)[0].slice(0, 10), x: fx, y: fy, z: S.lift + S.body * 0.55, w: 8, h: 1.6, normal: [f[0], f[1], 0], up: [0, 0, 1], colour: '#d0d0d0', role: 'print' });
      for (const p of legs) {
        out.push({ kind: 'box', x: p[0], y: p[1], z0: S.lift - 1.6, w: S.shoulder, d: S.leadThick, h: 1.6, angle, colour: LEAD_COLOUR, role: 'leg-shoulder', metal: 0.7 });
        out.push({ kind: 'box', x: p[0], y: p[1], z0: below, w: S.lead, d: S.leadThick, h: S.lift - 1.6 - below, angle, colour: LEAD_COLOUR, role: 'leg', metal: 0.7 });
      }
      joints();
      break;
    }
    case 'dip': {
      const S = SIZES.dip;
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const alongX = x2 - x1 >= y2 - y1;
      const length = (alongX ? x2 - x1 : y2 - y1) + 2 * S.end; // 33.02 + 1.7 = 34.7 mm for 28 pins
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const rowGap = alongX ? y2 - y1 : x2 - x1;
      // a box lying along the chip (w) and across it (d)
      const lengthwise = (x, y, z0, w, d, h, colour, role, more = {}) => ({ kind: 'box', x, y, z0, w: alongX ? w : d, d: alongX ? d : w, h, colour, role, ...more });
      const rowAt = (side) => (alongX ? [mx, my + side * rowGap / 2] : [mx + side * rowGap / 2, my]);
      const holder = part.holder === 'strips' || part.holder === 'none' ? part.holder : 'socket';
      let seat; // the seating plane: where the leads' shoulders stop
      if (holder === 'socket') {
        const sock = SIZES.socket.height;
        // two rails under the pin rows, joined at the ends
        for (const side of [-1, 1]) out.push(lengthwise(...rowAt(side), 0, length, 2.3, sock, '#191919', 'socket'));
        for (const end of [-1, 1]) {
          out.push(lengthwise(alongX ? mx + end * (length / 2 - 0.6) : mx, alongX ? my : my + end * (length / 2 - 0.6), 0, 1.2, rowGap, sock - 0.6, '#191919', 'socket'));
        }
        for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: sock - 0.02, w: 0.9, d: 0.9, h: 0.05, colour: GOLD, role: 'contact', metal: 0.7 });
        seat = sock + 0.05;
      } else if (holder === 'strips') {
        // two female header strips, one under each row of pins (as on the owner's board)
        const H = SIZES.strip;
        const rowLen = (alongX ? x2 - x1 : y2 - y1) + 2.54;
        for (const side of [-1, 1]) out.push(lengthwise(...rowAt(side), 0, rowLen, H.width, H.height, '#141414', 'socket'));
        for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: H.height - 0.02, w: 1.0, d: 1.0, h: 0.05, colour: '#050505', role: 'contact' });
        seat = H.height + 0.05;
      } else {
        seat = 0.05; // soldered straight in
      }
      // the chip: 7.24 mm across below the mould line, where the leads come out, 6.6 mm at the top
      const z0 = seat + S.standoff;
      out.push(lengthwise(mx, my, z0, length, S.width, S.height, '#202020', 'body'));
      out.push(lengthwise(mx, my, z0 + 0.02, length - 0.1, S.mould, S.line + 0.1, '#232323', 'mould'));
      const one = pins['1'] || [x1, y1];
      const endSign = alongX ? (Math.abs(one[0] - x1) <= Math.abs(one[0] - x2) ? -1 : 1) : (Math.abs(one[1] - y1) <= Math.abs(one[1] - y2) ? -1 : 1);
      // the notch: a half circle cut into pin 1's end
      const notch = [];
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (Math.PI * k) / 12;
        const [u, v] = [-endSign * Math.cos(a), Math.sin(a)]; // u: along the chip, inward; v: across
        notch.push(alongX ? [u, v] : [v, u]);
      }
      const nx = alongX ? mx + endSign * (length / 2 - 0.01) : mx;
      const ny = alongX ? my : my + endSign * (length / 2 - 0.01);
      out.push({ kind: 'extrude', x: nx, y: ny, z0: z0 + S.height - 0.02, h: 0.04, outline: notch, colour: '#0c0c0c', role: 'notch', bevel: false });
      const dot = alongX ? [one[0] - endSign * 1.6, my + (one[1] - my) * 0.55] : [mx + (one[0] - mx) * 0.55, one[1] - endSign * 1.6];
      out.push({ kind: 'cyl', x: dot[0], y: dot[1], z0: z0 + S.height - 0.01, radius: 0.45, h: 0.04, colour: '#0c0c0c', role: 'dot' });
      // the leads: out of the mould line, down to the seating plane wide, then the narrow tip
      const zl = z0 + S.line;
      const tipEnd = holder === 'none' ? below : seat - 3;
      const edge = S.mould / 2;
      const rowHalf = rowGap / 2;
      for (const p of pts) {
        const side = alongX ? Math.sign(p[1] - my) : Math.sign(p[0] - mx);
        const mid = (edge + rowHalf) / 2;
        const reach = rowHalf - edge + S.thick + 0.3; // from inside the body to the bend
        const bx = alongX ? p[0] : mx + side * mid;
        const by = alongX ? my + side * mid : p[1];
        const leg = (x, y, z, w, h, role) => ({ kind: 'box', x, y, z0: z, w: alongX ? w : S.thick, d: alongX ? S.thick : w, h, colour: '#c8ccd0', role, metal: 0.7 });
        out.push({ kind: 'box', x: bx, y: by, z0: zl - S.thick / 2, w: alongX ? S.shoulder : reach, d: alongX ? reach : S.shoulder, h: S.thick, colour: '#c8ccd0', role: 'leg-top', metal: 0.7 });
        out.push(leg(p[0], p[1], seat, S.shoulder, zl + S.thick / 2 - seat, 'leg-shoulder'));
        out.push(leg(p[0], p[1], tipEnd, S.tip, seat - tipEnd, 'leg'));
      }
      if (details.value) {
        out.push({ kind: 'print', text: details.value.toUpperCase().slice(0, 16), x: mx, y: my, z: z0 + S.height + 0.02, w: Math.min(length - 6, 24), h: 2.2, normal: [0, 0, 1], up: alongX ? [0, -1, 0] : [1, 0, 0], colour: '#bdbdbd', role: 'print' });
      }
      joints();
      break;
    }
    case 'header': {
      const H = SIZES.header;
      const half = part.half || 1.27;
      const fan = half > 2;
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const alongX = x2 - x1 >= y2 - y1;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const len = (alongX ? x2 - x1 : y2 - y1) + 2.54;
      if (fan) {
        const F = SIZES.fan;
        out.push({ kind: 'box', x: mx, y: my, z0: 0, w: alongX ? len : F.depth, d: alongX ? F.depth : len, h: F.base, colour: '#ececec', role: 'body' });
        // the back wall with its locking ramp
        const wx = alongX ? mx : mx + (F.depth / 2 - F.wallThick / 2);
        const wy = alongX ? my - (F.depth / 2 - F.wallThick / 2) : my;
        out.push({ kind: 'box', x: wx, y: wy, z0: F.base, w: alongX ? len : F.wallThick, d: alongX ? F.wallThick : len, h: F.wall - F.base, colour: '#ececec', role: 'wall' });
        out.push({ kind: 'box', x: alongX ? mx : wx - 0.9, y: alongX ? wy + 0.9 : my, z0: F.wall - 3.2, w: alongX ? 3.2 : 1.0, d: alongX ? 1.0 : 3.2, h: 2.4, colour: '#dcdcdc', role: 'ramp' });
        for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: -H.below, w: H.pin, d: H.pin, h: H.below + F.wall - 1, colour: GOLD, role: 'pin', metal: 0.7 });
      } else if (part.female) {
        const S = SIZES.strip;
        out.push({ kind: 'box', x: mx, y: my, z0: 0, w: alongX ? len : S.width, d: alongX ? S.width : len, h: S.height, colour: '#141414', role: 'body' });
        for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: S.height - 0.02, w: 1.0, d: 1.0, h: 0.05, colour: '#050505', role: 'contact' });
      } else {
        out.push({ kind: 'box', x: mx, y: my, z0: 0, w: alongX ? len : H.base, d: alongX ? H.base : len, h: H.base, colour: '#151515', role: 'body' });
        const tip = 0.6;
        for (const p of pts) {
          out.push({ kind: 'box', x: p[0], y: p[1], z0: -H.below, w: H.pin, d: H.pin, h: H.below + H.base + H.above - tip, colour: GOLD, role: 'pin', metal: 0.7 });
          out.push({ kind: 'box', x: p[0], y: p[1], z0: H.base + H.above - tip, w: H.pin * 0.55, d: H.pin * 0.55, h: tip, colour: GOLD, role: 'tip', metal: 0.7 }); // the pointed end
        }
      }
      joints();
      break;
    }
    case 'led': {
      const L = SIZES.led;
      const colour = LED_COLOURS[part.colour] || LED_COLOURS[colourInValue(details.value)] || LED_COLOURS.green;
      const [a, k] = [pins.A || pins['1'] || pts[0], pins.K || pins['2'] || pts[1] || pts[0]];
      const kl = Math.hypot(k[0] - cx, k[1] - cy);
      const [kx, ky] = kl ? [(k[0] - cx) / kl, (k[1] - cy) / kl] : [0, 1];
      // the flange, with its flat on the cathode side (drawn 0.12 mm in: the bevel adds it back)
      const fr = L.flange / 2 - 0.12;
      const flat = L.flat - 0.12;
      const flange = [];
      for (let s = 0; s < 48; s++) {
        const t = (2 * Math.PI * s) / 48;
        let [x, y] = [fr * Math.cos(t), fr * Math.sin(t)];
        const toward = x * kx + y * ky;
        if (toward > flat) [x, y] = [x - (toward - flat) * kx, y - (toward - flat) * ky];
        flange.push([x, y]);
      }
      out.push({ kind: 'extrude', x: cx, y: cy, z0: 1.15, h: 0.7, outline: flange, colour, role: 'flange', clear: true });
      const r = L.dia / 2;
      const z0 = 1.9;
      const H = 1.0 + L.height - z0; // the top is 8.6 mm above the flange's underside
      const dome = [];
      for (let s = 0; s <= 10; s++) dome.push([r * Math.cos((Math.PI / 2) * (s / 10)), H - r + r * Math.sin((Math.PI / 2) * (s / 10))]);
      dome[dome.length - 1][0] = 0;
      out.push(latheUp([[0, 0], [r, 0], ...dome], cx, cy, z0, { colour, role: 'body', clear: true }));
      out.push(lead([[a[0], a[1], below], [a[0], a[1], 1.0]]), lead([[k[0], k[1], below], [k[0], k[1], 1.0]]));
      joints();
      break;
    }
    case 'module': {
      const k = part.keepout;
      const [x1, y1] = k ? mm([k[0], k[1]], pitch) : [Math.min(...xs) - 3, Math.min(...ys) - 3];
      const [x2, y2] = k ? mm([k[2], k[3]], pitch) : [Math.max(...xs) + 3, Math.max(...ys) + 3];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const w = x2 - x1;
      const d = y2 - y1;
      const top = 2.6; // foam tape 1 mm, board 1.6 mm
      out.push({ kind: 'box', x: mx, y: my, z0: 0, w, d, h: 1, colour: '#e6e6e6', role: 'foam' });
      out.push({ kind: 'box', x: mx, y: my, z0: 1, w, d, h: 1.6, colour: '#1e6b52', role: 'body' });
      // MP1584 module parts (typical listing photo layout): inductor, chip, trimmer, diode, capacitors
      const at = (fx, fy) => [x1 + w * fx, y1 + d * fy];
      const [ix, iy] = at(0.36, 0.5);
      out.push({ kind: 'box', x: ix, y: iy, z0: top, w: Math.min(5.8, w * 0.4), d: Math.min(5.2, d * 0.45), h: 4.5, colour: '#3a3a3a', role: 'inductor' });
      out.push({ kind: 'print', text: '4R7', x: ix, y: iy, z: top + 4.52, w: 3.6, h: 1.8, normal: [0, 0, 1], up: [0, -1, 0], colour: '#d0d0d0', role: 'print' });
      const [sx, sy] = at(0.72, 0.5);
      out.push({ kind: 'box', x: sx, y: sy, z0: top, w: 3.9, d: 4.9, h: 1.5, colour: '#151515', role: 'chip' });
      const [tx, ty] = at(0.3, 0.16);
      out.push({ kind: 'box', x: tx, y: ty, z0: top, w: 3.4, d: 3.4, h: 2, colour: '#2463eb', role: 'trimmer' });
      out.push({ kind: 'cyl', x: tx, y: ty, z0: top + 2, radius: 1.1, h: 0.4, colour: '#d4af37', role: 'screw', metal: 0.7 });
      const [dx, dy] = at(0.72, 0.86);
      out.push({ kind: 'box', x: dx, y: dy, z0: top, w: 4.3, d: 2.6, h: 2.2, colour: '#1b1b1b', role: 'diode' });
      for (const [fx, fy] of [[0.12, 0.5], [0.9, 0.2]]) {
        const [cxp, cyp] = at(fx, fy);
        out.push({ kind: 'box', x: cxp, y: cyp, z0: top, w: 1.6, d: 3.2, h: 1.1, colour: '#c8a96e', role: 'cap' });
      }
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      for (const p of pts) {
        const ex = clamp(p[0], x1 + 1, x2 - 1);
        const ey = clamp(p[1], y1 + 1, y2 - 1);
        out.push({ kind: 'wire', points: [[p[0], p[1], below], [p[0], p[1], 3.5], [ex, ey, 3.5], [ex, ey, top]], radius: 0.4, colour: '#d23b3b', role: 'wire' });
      }
      joints();
      break;
    }
    case 'underside': {
      const crystal = /^Y/i.test(ref);
      const alongX = pts.length < 2 || Math.abs(xs[0] - xs[1]) >= Math.abs(ys[0] - ys[1]);
      if (crystal) {
        const S = SIZES.hc49s;
        // a rounded-end outline: two half circles r across, joined by straights 2·straight long
        const capsule = (r, straight) => {
          const o = [];
          for (let k = 0; k <= 12; k++) o.push([straight + r * Math.cos(-Math.PI / 2 + Math.PI * k / 12), r * Math.sin(-Math.PI / 2 + Math.PI * k / 12)]);
          for (let k = 0; k <= 12; k++) o.push([-straight + r * Math.cos(Math.PI / 2 + Math.PI * k / 12), r * Math.sin(Math.PI / 2 + Math.PI * k / 12)]);
          return o;
        };
        const r = S.width / 2;
        const angle = alongX ? 0 : Math.PI / 2;
        out.push({ kind: 'extrude', x: cx, y: cy, z0: -T - 0.4 - S.height, h: S.height - S.base, outline: capsule(r, S.len / 2 - r), angle, colour: '#c8ccd0', role: 'body', metal: 0.85 });
        out.push({ kind: 'extrude', x: cx, y: cy, z0: -T - 0.4 - S.base, h: S.base, outline: capsule(r + 0.25, S.len / 2 - r), angle, colour: '#b4b8bd', role: 'flange', metal: 0.85, bevel: false });
        if (details.value) out.push({ kind: 'print', text: details.value.replace(/\s*crystal/i, ''), x: cx, y: cy, z: -T - 0.6 - S.height, w: 7, h: 2, normal: [0, 0, -1], up: alongX ? [0, -1, 0] : [1, 0, 0], colour: '#3a3a3a', role: 'print' });
      } else {
        // a ceramic capacitor soldered straight onto two pins underneath, its disc hanging down
        const dipped = part.style === 'dipped';
        const S = dipped ? SIZES.dipped : SIZES.ceramic;
        const colour = dipped ? '#2f6fd6' : '#d9822b';
        const [a, b] = pts.length >= 2 ? pts : [pts[0], pts[0]];
        const { ux, uy } = along(a, b);
        const nx = -uy;
        const ny = ux;
        const zc = -T - 1.4 - S.dia / 2;
        out.push(latheLying(discProfile(S.dia, S.thick), [cx - nx * S.thick / 2, cy - ny * S.thick / 2], [cx + nx * S.thick / 2, cy + ny * S.thick / 2], zc, { colour, role: 'body' }));
        const code = capacitorCode(details.value);
        if (code) out.push({ kind: 'print', text: code, x: cx + nx * (S.thick / 2 + 0.02), y: cy + ny * (S.thick / 2 + 0.02), z: zc, w: 3.4, h: 1.6, normal: [nx, ny, 0], up: [0, 0, -1], colour: dipped ? '#e8eef8' : '#3a2200', role: 'print' });
      }
      for (const p of pts) out.push(lead([[p[0], p[1], -T], [p[0] + (cx - p[0]) * 0.3, p[1] + (cy - p[1]) * 0.3, -T - 1.6]]));
      break;
    }
    default:
      out.push({ kind: 'box', x: cx, y: cy, z0: part.side === 'bottom' ? -T - 3 : 0, w: Math.max(3, Math.max(...xs) - Math.min(...xs) + 2), d: Math.max(3, Math.max(...ys) - Math.min(...ys) + 2), h: 3, colour: '#8a8a8a', role: 'body' });
      joints();
  }
  return out;
}

/** The colour a bus is drawn in, from its label, as sheet 4 colours them. */
export function busColour(label) {
  if (/\+\s*12/.test(label)) return '#e5484d';
  if (/\+\s*5/.test(label)) return '#3fb6e8';
  return '#d9dde1';
}
