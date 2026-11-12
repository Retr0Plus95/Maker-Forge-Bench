// The 3D board's shapes, as plain numbers (board-view design §5). No page code, no three.js:
// unit-tested in Node. Millimetres; x along the columns, y down the rows, z up from the board's top.
// Sizes are typical catalogue bodies, matching pcb.py's checker, so the view says "typical size".

export const BOARD_THICKNESS = 1.6;
const LEAD = 0.3;
const LEAD_COLOUR = '#c0c4c8';

const mm = (hole, pitch) => [(hole[0] - 1) * pitch, (hole[1] - 1) * pitch];
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const lead = (from, to, role = 'lead') => ({ kind: 'wire', points: [from, to], radius: LEAD, colour: LEAD_COLOUR, role });

function holeSpan(part) {
  const [a, b] = Object.values(part.pins);
  return b ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) : 0;
}

/**
 * The shapes for one part: { kind: 'cyl' | 'box' | 'half' | 'hcyl' | 'wire', role, colour, ... }.
 * - cyl: upright cylinder, centre x,y, from z0 up h, radius
 * - box: centre x,y, from z0 up h, size w (along x) × d (along y)
 * - half: half cylinder, flat face toward +y ('down') or -y ('up'), centre x,y, z0, h, radius
 * - hcyl: lying cylinder from (x1,y1) to (x2,y2) at height z, radius
 * - wire: polyline of [x, y, z] points, radius
 */
export function partGeometry(part, pitch = 2.54, ref = '') {
  const pins = Object.fromEntries(Object.entries(part.pins).map(([name, hole]) => [name, mm(hole, pitch)]));
  const pts = Object.values(pins);
  const [cx, cy] = centre(pts);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const T = BOARD_THICKNESS;
  const out = [];

  switch (part.type) {
    case 'res': {
      const names = Object.keys(pins);
      if (holeSpan(part) >= 4 || !part.body) {
        const [a, b] = pts;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ux = (b[0] - a[0]) / len;
        const uy = (b[1] - a[1]) / len;
        const half = Math.min(3.25, len / 2);
        out.push({ kind: 'hcyl', x1: cx - ux * half, y1: cy - uy * half, x2: cx + ux * half, y2: cy + uy * half, z: 1.25, radius: 1.25, colour: '#d9c39a', role: 'body' });
        out.push(lead([a[0], a[1], 0], [cx - ux * half, cy - uy * half, 1.25]), lead([b[0], b[1], 0], [cx + ux * half, cy + uy * half, 1.25]));
      } else {
        const bodyAt = pins[part.body];
        const other = pins[names.find((n) => n !== part.body)];
        out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: 0.3, radius: 1.3, h: 6.5, colour: '#d9c39a', role: 'body' });
        out.push({ kind: 'wire', points: [[other[0], other[1], 0], [other[0], other[1], 7.6], [bodyAt[0], bodyAt[1], 7.6], [bodyAt[0], bodyAt[1], 6.8]], radius: LEAD, colour: LEAD_COLOUR, role: 'lead' });
      }
      break;
    }
    case 'cer': {
      const alongX = Math.abs(xs[0] - xs[1]) >= Math.abs(ys[0] - ys[1]);
      out.push({ kind: 'box', x: cx, y: cy, z0: 1.2, w: alongX ? 4.5 : 2.6, d: alongX ? 2.6 : 4.5, h: 4.5, colour: '#d9822b', role: 'body' });
      for (const p of pts) out.push(lead([p[0], p[1], 0], [p[0] + (cx - p[0]) * 0.4, p[1] + (cy - p[1]) * 0.4, 1.4]));
      break;
    }
    case 'elec': {
      const D = part.D || 6.3;
      const h = D >= 8 ? 11.5 : 11;
      out.push({ kind: 'cyl', x: cx, y: cy, z0: 0.3, radius: D / 2, h, colour: '#1d3557', role: 'body' });
      const n = pins.n || pts[1];
      const len = Math.hypot(n[0] - cx, n[1] - cy) || 1;
      out.push({ kind: 'cyl', x: cx + ((n[0] - cx) / len) * (D / 2 - 0.5), y: cy + ((n[1] - cy) / len) * (D / 2 - 0.5), z0: 0.35, radius: D * 0.14, h: h - 0.1, colour: '#cfd6dd', role: 'stripe' });
      break;
    }
    case 'diode_stand': {
      const D = part.D || 5.4;
      const bodyName = part.body || Object.keys(pins)[1];
      const bodyAt = pins[bodyName];
      const other = pins[Object.keys(pins).find((nm) => nm !== bodyName)];
      out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: 0.3, radius: D / 2, h: 9.5, colour: '#232323', role: 'body' });
      out.push({ kind: 'cyl', x: bodyAt[0], y: bodyAt[1], z0: 7.9, radius: D / 2 + 0.06, h: 1.6, colour: '#bdbdbd', role: 'band' });
      out.push({ kind: 'wire', points: [[other[0], other[1], 0], [other[0], other[1], 10.6], [bodyAt[0], bodyAt[1], 10.6], [bodyAt[0], bodyAt[1], 9.8]], radius: 0.65, colour: LEAD_COLOUR, role: 'lead' });
      break;
    }
    case 'to92': {
      const b = pins.B || [cx, cy];
      const facing = part.round === 'up' ? 'down' : 'up'; // round side up on sheet 4 means the flat face points down
      out.push({ kind: 'half', x: b[0], y: b[1] + (facing === 'down' ? 0.6 : -0.6), z0: 2, radius: 2.4, h: 4.8, facing, colour: '#232323', role: 'body' });
      for (const p of pts) out.push(lead([p[0], p[1], 0], [p[0], p[1], 2.1]));
      break;
    }
    case 'dip': {
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      out.push({ kind: 'box', x: (x1 + x2) / 2, y: (y1 + y2) / 2, z0: 0, w: x2 - x1 + 3.2, d: y2 - y1 + 3.2, h: 3, colour: '#2b2b2b', role: 'body' });
      out.push({ kind: 'box', x: (x1 + x2) / 2, y: (y1 + y2) / 2, z0: 3, w: x2 - x1 + 2.4, d: Math.max(1, y2 - y1 - 1), h: 3.2, colour: '#141414', role: 'chip' });
      const one = pins['1'] || [x1, y1];
      const notchX = Math.abs(one[0] - x1) <= Math.abs(one[0] - x2) ? x1 + 0.4 : x2 - 0.4;
      out.push({ kind: 'cyl', x: notchX, y: (y1 + y2) / 2, z0: 6.2, radius: 0.9, h: 0.12, colour: '#5a5a5a', role: 'notch' });
      break;
    }
    case 'header': {
      const half = part.half || 1.27;
      const tall = half > 2 ? 6 : 2.5;
      const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      out.push({ kind: 'box', x: (x1 + x2) / 2, y: (y1 + y2) / 2, z0: 0, w: x2 - x1 + 2.54, d: y2 - y1 + 2 * half, h: tall, colour: half > 2 ? '#ececec' : '#151515', role: 'body' });
      for (const p of pts) out.push({ kind: 'box', x: p[0], y: p[1], z0: 0, w: 0.64, d: 0.64, h: tall + (half > 2 ? 0.5 : 6), colour: '#d4af37', role: 'pin' });
      break;
    }
    case 'module': {
      const k = part.keepout;
      const [x1, y1] = k ? mm([k[0], k[1]], pitch) : [Math.min(...xs) - 3, Math.min(...ys) - 3];
      const [x2, y2] = k ? mm([k[2], k[3]], pitch) : [Math.max(...xs) + 3, Math.max(...ys) + 3];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      out.push({ kind: 'box', x: mx, y: my, z0: 0, w: x2 - x1, d: y2 - y1, h: 1, colour: '#e6e6e6', role: 'foam' });
      out.push({ kind: 'box', x: mx, y: my, z0: 1, w: x2 - x1, d: y2 - y1, h: 1.6, colour: '#1e6b52', role: 'body' });
      out.push({ kind: 'box', x: mx, y: my, z0: 2.6, w: Math.min(6, x2 - x1), d: Math.min(6, y2 - y1), h: 3, colour: '#3a3a3a', role: 'inductor' });
      for (const p of pts) out.push({ kind: 'wire', points: [[p[0], p[1], 0], [p[0], p[1], 1.5], [p[0] + (mx - p[0]) * 0.15, p[1] + (my - p[1]) * 0.15, 2.6]], radius: 0.4, colour: '#d23b3b', role: 'wire' });
      break;
    }
    case 'underside': {
      const crystal = /^Y/i.test(ref);
      const alongX = pts.length < 2 || Math.abs(xs[0] - xs[1]) >= Math.abs(ys[0] - ys[1]);
      const [w, d, h] = crystal ? [10.5, 4.5, 3.5] : [4, 2.5, 2.5];
      out.push({ kind: 'box', x: cx, y: cy, z0: -T - 0.4 - h, w: alongX ? w : d, d: alongX ? d : w, h, colour: crystal ? '#c8ccd0' : '#d9822b', role: 'body' });
      for (const p of pts) out.push(lead([p[0], p[1], -T], [p[0] + (cx - p[0]) * 0.3, p[1] + (cy - p[1]) * 0.3, -T - 0.6]));
      break;
    }
    default:
      out.push({ kind: 'box', x: cx, y: cy, z0: part.side === 'bottom' ? -T - 3 : 0, w: Math.max(3, Math.max(...xs) - Math.min(...xs) + 2), d: Math.max(3, Math.max(...ys) - Math.min(...ys) + 2), h: 3, colour: '#8a8a8a', role: 'body' });
  }
  return out;
}

/** The colour a bus is drawn in, from its label, as sheet 4 colours them. */
export function busColour(label) {
  if (/\+\s*12/.test(label)) return '#e5484d';
  if (/\+\s*5/.test(label)) return '#3fb6e8';
  return '#d9dde1';
}
