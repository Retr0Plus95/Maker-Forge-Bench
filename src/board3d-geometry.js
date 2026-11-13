// The 3D board's shapes, as plain numbers (board-view design §5, 0.5 big improvement B7). No page
// code, no three.js: unit-tested in Node. Millimetres; x along the columns, y down the rows, z up
// from the board's top. Sizes come from datasheets (the source is beside each).
import { resistorBands, capacitorCode, BAND_HEX } from './markings.js';

export const BOARD_THICKNESS = 1.6;
const LEAD = 0.3; // 0.6 mm tinned copper lead (radius)
const LEAD_COLOUR = '#c0c4c8';
const GOLD = '#d4af37';

export const SIZES = {
  // Yageo CFR-25 / MFR-25 (1/4 W): body 6.3 × 2.4 mm, 0.54–0.6 mm leads
  resistor: { len: 6.3, dia: 2.4 },
  // Typical 5 mm radial ceramic disc (Vishay K-series): 5 mm across, 2.5 mm thick
  ceramic: { dia: 5, thick: 2.5 },
  // Nichicon UVR / Panasonic radial cans: D × L
  electrolytic: { 5: 11, 6.3: 11, 8: 11.5, 10: 12.5 },
  // Microchip PDIP-28 (300 mil): body 34.7 × 7.2 × 3.3 mm, rows 7.62 mm apart
  dip: { width: 7.2, height: 3.3, end: 0.85 },
  // Mill-Max / generic DIP socket, 4.3 mm tall
  socket: { height: 4.3 },
  // Generic 2.54 mm pin header: 2.5 mm plastic, 0.64 mm square pins, 6 mm above the plastic
  header: { base: 2.5, pin: 0.64, above: 6, below: 3 },
  // Molex KK 254 (47053) 4-pin fan header: white, a back wall with the locking ramp
  fan: { base: 3, wall: 11.4, wallThick: 0.8, depth: 5 },
  // TO-92 (ON Semi PN2222A): 4.8 mm across, 3.7 mm flat to round, 4.6 mm tall
  to92: { radius: 2.4, flatOffset: 0.6, height: 4.6, lift: 2.6 },
  // DO-201AD (Vishay 1N5402): 5.3 × 9.5 mm, 1.3 mm leads
  do201: { dia: 5.3, len: 9.5, lead: 0.65 },
  // HC-49/S crystal: 11.4 × 4.7 × 3.5 mm
  hc49s: { len: 11.4, width: 4.7, height: 3.5 },
  // 5 mm LED (Kingbright L-7104): 5 mm dome, 5.8 mm flange, 8.6 mm tall
  led: { dia: 5, flange: 5.8, height: 8.6 },
};

const mm = (hole, pitch) => [(hole[0] - 1) * pitch, (hole[1] - 1) * pitch];
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const lead = (points, role = 'lead', radius = LEAD) => ({ kind: 'wire', points, radius, colour: LEAD_COLOUR, role });
/** A solder joint under the board at a leg (drawn as one instanced cone per joint). */
const joint = ([x, y]) => ({ kind: 'joint', x, y });

function holeSpan(part) {
  const [a, b] = Object.values(part.pins);
  return b ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) : 0;
}

/** The unit vector from a to b, and the length. */
function along(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, len };
}

/** A resistor's colour bands as thin rings along its body, from 1/5 of the way along. */
function bandRings(bands, from, to, z, radius, lying) {
  const out = [];
  const spots = [0.2, 0.34, 0.48, 0.8];
  bands.forEach((colour, i) => {
    const t = spots[i];
    const w = 0.55;
    if (lying) {
      const { ux, uy, len } = along(from, to);
      const cx = from[0] + ux * len * t;
      const cy = from[1] + uy * len * t;
      out.push({ kind: 'hcyl', x1: cx - ux * w / 2, y1: cy - uy * w / 2, x2: cx + ux * w / 2, y2: cy + uy * w / 2, z, radius: radius + 0.03, colour: BAND_HEX[colour], role: 'band' });
    } else {
      out.push({ kind: 'cyl', x: from[0], y: from[1], z0: z + (to - z) * t - w / 2, h: w, radius: radius + 0.03, colour: BAND_HEX[colour], role: 'band' });
    }
  });
  return out;
}

/**
 * The shapes for one part: { kind, role, colour, ... }.
 * - cyl: upright cylinder, centre x,y, from z0 up h, radius
 * - sector: part of an upright cylinder's wall (a stripe), centre x,y, z0, h, radius, dir [dx, dy] it faces, width (radians)
 * - box: centre x,y, from z0 up h, size w (along x) × d (along y), optional angle (radians, about z)
 * - hcyl: lying cylinder from (x1,y1) to (x2,y2) at height z, radius
 * - extrude: an outline ([x, y] around 0,0, mm) pushed up h from z0, turned by angle, at x,y
 * - dome: a cylinder of radius and height h with a half-ball on top, from z0
 * - wire: polyline of [x, y, z] points, radius
 * - print: text on a flat face: centre x,y,z, size w × h, normal [x,y,z] it faces, up [x,y,z]
 * - joint: a solder joint under the board at x,y
 * @param details { value, label } from the project, for bands and printing
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
      const S = SIZES.resistor;
      const r = S.dia / 2;
      const names = Object.keys(pins);
      const bands = resistorBands(details.value);
      const flat = part.mount ? part.mount === 'flat' : holeSpan(part) >= 4; // pcb.py's rule when the file doesn't say
      if (flat || !part.body) {
        const [a, b] = pts;
        const { ux, uy, len } = along(a, b);
        const half = Math.min(S.len / 2, len / 2 - 0.8);
        const z = r + 0.3;
        const e1 = [cx - ux * half, cy - uy * half];
        const e2 = [cx + ux * half, cy + uy * half];
        out.push({ kind: 'hcyl', x1: e1[0], y1: e1[1], x2: e2[0], y2: e2[1], z, radius: r, colour: '#d9c39a', role: 'body' });
        if (bands) out.push(...bandRings(bands, e1, e2, z, r, true));
        out.push(lead([[a[0], a[1], below], [a[0], a[1], z], [e1[0], e1[1], z]]), lead([[b[0], b[1], below], [b[0], b[1], z], [e2[0], e2[1], z]]));
      } else {
        const bodyAt = pins[part.body];
        const other = pins[names.find((n) => n !== part.body)];
        const z0 = 0.8;
        const top = z0 + S.len;
        out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0, radius: r, h: S.len, colour: '#d9c39a', role: 'body' });
        if (bands) out.push(...bandRings(bands, bodyAt, top, z0, r, false));
        out.push(lead([[bodyAt[0], bodyAt[1], below], [bodyAt[0], bodyAt[1], z0]]));
        out.push(lead([[other[0], other[1], below], [other[0], other[1], top + 1.4], [bodyAt[0], bodyAt[1], top + 1.4], [bodyAt[0], bodyAt[1], top]]));
      }
      joints();
      break;
    }
    case 'cer': {
      const S = SIZES.ceramic;
      const [a, b] = pts;
      const { ux, uy } = along(a, b);
      // the disc stands on edge, its face across the line between the legs
      const nx = -uy;
      const ny = ux;
      const zc = 1.6 + S.dia / 2;
      out.push({ kind: 'hcyl', x1: cx - nx * S.thick / 2, y1: cy - ny * S.thick / 2, x2: cx + nx * S.thick / 2, y2: cy + ny * S.thick / 2, z: zc, radius: S.dia / 2, colour: '#d9822b', role: 'body' });
      for (const p of pts) out.push(lead([[p[0], p[1], below], [p[0], p[1], 1.2], [cx + (p[0] - cx) * 0.45, cy + (p[1] - cy) * 0.45, zc - S.dia / 2 + 0.4]]));
      const code = capacitorCode(details.value);
      if (code) out.push({ kind: 'print', text: code, x: cx + nx * (S.thick / 2 + 0.02), y: cy + ny * (S.thick / 2 + 0.02), z: zc, w: 3.4, h: 1.6, normal: [nx, ny, 0], up: [0, 0, 1], colour: '#3a2200', role: 'print' });
      joints();
      break;
    }
    case 'elec': {
      const D = part.D || 6.3;
      const h = SIZES.electrolytic[D] || (D >= 8 ? 11.5 : 11);
      const z0 = 0.4;
      out.push({ kind: 'cyl', x: cx, y: cy, z0, radius: D / 2, h, colour: '#1d2b4a', role: 'body' });
      out.push({ kind: 'cyl', x: cx, y: cy, z0: z0 + h - 0.02, radius: D / 2 - 0.3, h: 0.06, colour: '#c9ccd1', role: 'top', metal: 0.8 });
      out.push({ kind: 'box', x: cx, y: cy, z0: z0 + h + 0.03, w: D * 0.62, d: 0.22, h: 0.05, colour: '#7d8288', role: 'vent' });
      out.push({ kind: 'box', x: cx, y: cy, z0: z0 + h + 0.03, w: 0.22, d: D * 0.62, h: 0.05, colour: '#7d8288', role: 'vent' });
      const n = pins.n || pts[1];
      const nl = Math.hypot(n[0] - cx, n[1] - cy) || 1;
      out.push({ kind: 'sector', x: cx, y: cy, z0: z0 + 0.4, h: h - 0.8, radius: D / 2 + 0.02, dir: [n[0] - cx, n[1] - cy], width: 0.9, colour: '#cfd6dd', role: 'stripe' });
      out.push({ kind: 'print', text: '−', x: cx + ((n[0] - cx) / nl) * (D / 2 + 0.06), y: cy + ((n[1] - cy) / nl) * (D / 2 + 0.06), z: z0 + h * 0.62, w: 1.8, h: 1.8, normal: [n[0] - cx, n[1] - cy, 0], up: [0, 0, 1], colour: '#1d2b4a', role: 'print' });
      for (const p of pts) out.push(lead([[p[0], p[1], below], [p[0], p[1], z0]]));
      joints();
      break;
    }
    case 'diode_stand': {
      const S = SIZES.do201;
      const D = part.D || S.dia;
      const bodyName = part.body || Object.keys(pins)[1];
      const bodyAt = pins[bodyName];
      const other = pins[Object.keys(pins).find((nm) => nm !== bodyName)];
      const z0 = 0.8;
      out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0, radius: D / 2, h: S.len, colour: '#232323', role: 'body' });
      out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: z0 + S.len - 2.2, radius: D / 2 + 0.04, h: 1.4, colour: '#bdbdbd', role: 'band' }); // the cathode end is up: its leg loops over
      out.push(lead([[bodyAt[0], bodyAt[1], below], [bodyAt[0], bodyAt[1], z0]], 'lead', S.lead));
      out.push(lead([[other[0], other[1], below], [other[0], other[1], z0 + S.len + 1.4], [bodyAt[0], bodyAt[1], z0 + S.len + 1.4], [bodyAt[0], bodyAt[1], z0 + S.len]], 'lead', S.lead));
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
    case 'dip': {
      const S = SIZES.dip;
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const alongX = x2 - x1 >= y2 - y1;
      const length = (alongX ? x2 - x1 : y2 - y1) + 2 * S.end; // 33.02 + 1.7 = 34.7 mm for 28 pins
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const sock = SIZES.socket.height;
      // the socket: two rails under the pin rows, joined at the ends
      const rowGap = alongX ? y2 - y1 : x2 - x1;
      for (const side of [-1, 1]) {
        const rx = alongX ? mx : mx + side * rowGap / 2;
        const ry = alongX ? my + side * rowGap / 2 : my;
        out.push({ kind: 'box', x: rx, y: ry, z0: 0, w: alongX ? length : 2.3, d: alongX ? 2.3 : length, h: sock, colour: '#191919', role: 'socket' });
      }
      for (const end of [-1, 1]) {
        out.push({ kind: 'box', x: alongX ? mx + end * (length / 2 - 0.6) : mx, y: alongX ? my : my + end * (length / 2 - 0.6), z0: 0, w: alongX ? 1.2 : rowGap, d: alongX ? rowGap : 1.2, h: sock - 0.6, colour: '#191919', role: 'socket' });
      }
      for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: sock - 0.02, w: 0.9, d: 0.9, h: 0.05, colour: GOLD, role: 'contact', metal: 0.7 });
      // the chip on top, its legs bent down into the socket
      const z0 = sock + 0.6;
      out.push({ kind: 'box', x: mx, y: my, z0, w: alongX ? length : S.width, d: alongX ? S.width : length, h: S.height, colour: '#202020', role: 'body' });
      const one = pins['1'] || [x1, y1];
      const endSign = alongX ? (Math.abs(one[0] - x1) <= Math.abs(one[0] - x2) ? -1 : 1) : (Math.abs(one[1] - y1) <= Math.abs(one[1] - y2) ? -1 : 1);
      const nx = alongX ? mx + endSign * (length / 2 - 0.05) : mx;
      const ny = alongX ? my : my + endSign * (length / 2 - 0.05);
      out.push({ kind: 'cyl', x: nx, y: ny, z0: z0 + S.height - 0.01, radius: 1.0, h: 0.04, colour: '#0c0c0c', role: 'notch' });
      const dot = alongX ? [one[0] - endSign * 1.6, my + (one[1] - my) * 0.55] : [mx + (one[0] - mx) * 0.55, one[1] - endSign * 1.6];
      out.push({ kind: 'cyl', x: dot[0], y: dot[1], z0: z0 + S.height - 0.01, radius: 0.45, h: 0.04, colour: '#0c0c0c', role: 'dot' });
      for (const p of pts) {
        const ex = alongX ? p[0] : mx + Math.sign(p[0] - mx) * S.width / 2;
        const ey = alongX ? my + Math.sign(p[1] - my) * S.width / 2 : p[1];
        out.push({ kind: 'wire', points: [[ex, ey, z0 + 1.2], [p[0], p[1], z0 + 1.2], [p[0], p[1], sock + 0.05]], radius: 0.24, colour: '#c8ccd0', role: 'leg' });
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
      } else {
        out.push({ kind: 'box', x: mx, y: my, z0: 0, w: alongX ? len : H.base, d: alongX ? H.base : len, h: H.base, colour: '#151515', role: 'body' });
        for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: -H.below, w: H.pin, d: H.pin, h: H.below + H.base + H.above, colour: GOLD, role: 'pin', metal: 0.7 });
      }
      joints();
      break;
    }
    case 'led': {
      const L = SIZES.led;
      const [a, k] = [pins.A || pins['1'] || pts[0], pins.K || pins['2'] || pts[1] || pts[0]];
      out.push({ kind: 'cyl', x: cx, y: cy, z0: 1.0, radius: L.flange / 2, h: 1.0, colour: '#2a9d4b', role: 'flange' });
      out.push({ kind: 'dome', x: cx, y: cy, z0: 2.0, radius: L.dia / 2, h: L.height - 1 - L.dia / 2, colour: '#3ddc84', role: 'body', clear: true });
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
        const r = S.width / 2;
        const straight = S.len / 2 - r;
        const outline = [];
        for (let k = 0; k <= 12; k++) outline.push([straight + r * Math.cos(-Math.PI / 2 + Math.PI * k / 12), r * Math.sin(-Math.PI / 2 + Math.PI * k / 12)]);
        for (let k = 0; k <= 12; k++) outline.push([-straight + r * Math.cos(Math.PI / 2 + Math.PI * k / 12), r * Math.sin(Math.PI / 2 + Math.PI * k / 12)]);
        out.push({ kind: 'extrude', x: cx, y: cy, z0: -T - 0.4 - S.height, h: S.height, outline, angle: alongX ? 0 : Math.PI / 2, colour: '#c8ccd0', role: 'body', metal: 0.85 });
        if (details.value) out.push({ kind: 'print', text: details.value.replace(/\s*crystal/i, ''), x: cx, y: cy, z: -T - 0.42 - S.height, w: 7, h: 2, normal: [0, 0, -1], up: alongX ? [0, -1, 0] : [1, 0, 0], colour: '#3a3a3a', role: 'print' });
      } else {
        // a ceramic capacitor soldered straight onto two pins underneath, its disc hanging down
        const S = SIZES.ceramic;
        const [a, b] = pts.length >= 2 ? pts : [pts[0], pts[0]];
        const { ux, uy } = along(a, b);
        const nx = -uy;
        const ny = ux;
        const zc = -T - 1.4 - S.dia / 2;
        out.push({ kind: 'hcyl', x1: cx - nx * S.thick / 2, y1: cy - ny * S.thick / 2, x2: cx + nx * S.thick / 2, y2: cy + ny * S.thick / 2, z: zc, radius: S.dia / 2, colour: '#d9822b', role: 'body' });
        const code = capacitorCode(details.value);
        if (code) out.push({ kind: 'print', text: code, x: cx + nx * (S.thick / 2 + 0.02), y: cy + ny * (S.thick / 2 + 0.02), z: zc, w: 3.4, h: 1.6, normal: [nx, ny, 0], up: [0, 0, -1], colour: '#3a2200', role: 'print' });
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
