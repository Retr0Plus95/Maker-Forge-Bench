// Send to Shape (1.0): the board in Maker Forge Shape's own form, and writing it to Shape's
// Your parts list (localStorage 'makerforge.parts', which Shape reads on the same address).
// The form is Shape's encCleanBoards (src/app.html at b6e372b): { id, label, w, d, holes, screw,
// tall, ports, panel }, in mm, x from the board's left, y from its front. Pure: no page code.

import { partGeometry } from './board3d-geometry.js';

export const SHAPE_HOST = 'forge.retr0plus.se';
export const SHAPE_KEY = 'makerforge.parts';
export const SHAPE_MAX = 40;
export const SHAPE_URL = 'https://forge.retr0plus.se/';

const SCREWS = ['M2', 'M2.5', 'M3', 'M4'];
const EDGE_MM = 8; // a port within this of an edge is cut in the box's wall

/** Shape's list lives in its own address's storage: Bench reaches it only when it is served from there. */
export function canReachShape(hostname) {
  return hostname === SHAPE_HOST;
}

/** One id per project and board ('drawing' or 'mine'): 'bn' + 6 base-36 characters of FNV-1a. */
export function shapeId(name, which) {
  const text = `${name}|${which}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'bn' + h.toString(36).padStart(7, '0').slice(-6);
}

const isHole = (h) => Array.isArray(h) && Number.isFinite(h[0]) && Number.isFinite(h[1]);
const r2 = (v) => +v.toFixed(2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pitchOf = (board) => (Number.isFinite(board?.pitch) && board.pitch > 0 ? board.pitch : 2.54);

/** The holes the board uses: part pins, link holes and bus ends. */
function extent(board) {
  const holes = [];
  for (const part of Object.values(board?.parts || {})) for (const h of Object.values(part?.pins || {})) if (isHole(h)) holes.push(h);
  for (const link of board?.links || []) for (const h of link?.path || []) if (isHole(h)) holes.push(h);
  for (const bus of board?.buses || []) {
    if ([bus?.from, bus?.to, bus?.row].every(Number.isFinite)) holes.push([bus.from, bus.row], [bus.to, bus.row]);
  }
  if (!holes.length) return { minC: 0, maxC: 0, minR: 0, maxR: 0 };
  const cs = holes.map((h) => h[0]);
  const rs = holes.map((h) => h[1]);
  return { minC: Math.min(...cs), maxC: Math.max(...cs), minR: Math.min(...rs), maxR: Math.max(...rs) };
}

/** The board's size in mm: the holes it uses plus one hole all round, rounded to 0.1. */
export function defaultSize(board) {
  const p = pitchOf(board);
  const { minC, maxC, minR, maxR } = extent(board);
  return [+((maxC - minC + 2) * p).toFixed(1), +((maxR - minR + 2) * p).toFixed(1)];
}

/** How far a shape from partGeometry reaches above the board, or null for prints and joints. */
function topOf(s) {
  switch (s.kind) {
    case 'print':
    case 'joint':
      return null;
    case 'hcyl':
      return s.z + s.radius;
    case 'lathe':
      return Number.isFinite(s.x1) ? s.z + s.radius : s.z0 + s.h;
    case 'wire':
      return Math.max(...s.points.map((q) => q[2])) + s.radius;
    default: // cyl, box, sector, extrude, dome
      return Number.isFinite(s.z0) && Number.isFinite(s.h) ? s.z0 + s.h : null;
  }
}

/** Each top-side part's tallest point above the board in mm (Bench's own drawing), rounded up to 0.1. */
export function simpleHeights(board) {
  const out = {};
  const pitch = pitchOf(board);
  for (const [ref, part] of Object.entries(board?.parts || {})) {
    if (!part || part.side === 'bottom' || !part.pins) continue;
    let shapes;
    try { shapes = partGeometry(part, pitch, ref, {}); } catch { continue; }
    const tops = shapes.map(topOf).filter(Number.isFinite);
    if (tops.length && Math.max(...tops) > 0) out[ref] = Math.ceil(Math.max(...tops) * 10 - 1e-9) / 10;
  }
  return out;
}

// Copied from Maker Forge Shape (src/app.html at b6e372b, MIT): KICAD_PORTS with each kind's height
// above the board, and KICAD_PANEL. Bench matches them on a part's type, value and package.
export const SHAPE_PORTS = [[/USB[_-]?C|TYPE[_-]?C/i, 'usbc', 1.6], [/USB[_-]?Micro|Micro[_-]?B/i, 'micro', 1.6], [/USB[_-]?Mini|Mini[_-]?B/i, 'usbmini', 2], [/USB[_-]?A/i, 'usba', 3.5],
  [/USB[_-]?B/i, 'usbb', 5.5], [/Barrel|DC[_-]?Jack|PJ-?0\d\d/i, 'dcpcb', 5.6], [/RJ45|8P8C/i, 'rj45', 6.9], [/HDMI/i, 'hdmi', 3.2], [/Jack[_-]?3\.5|Audio[_-]?Jack|PJ-?3\d\d|SJ-?3/i, 'jack35', 3],
  [/micro[_-]?SD|TF[_-]?Card|SD[_-]?Card/i, 'sd', 1.5], [/SMA/i, 'sma', 3]];
export const SHAPE_PANEL = [[/LED[_-]?D?5(\.0)?mm|LED_D5/i, 'led5'], [/^LED|:LED|LED_/i, 'led3'], [/SW[_-]?Push.*12x12|Tactile.*12x12/i, 'tact12'], [/SW[_-]?Push|SW[_-]?Tactile|Button|TL\d{4}|SW-TH_4P|KEY[_-]?6X6|TS[_-]?\d{3,4}/i, 'tact'],
  [/Rotary[_-]?Encoder|EC11/i, 'encoder'], [/Potentiometer|[^a-z]Pot[_-]|^Pot/i, 'pot'], [/SW[_-]?Slide|SS12/i, 'slide'], [/Toggle/i, 'toggle'], [/Buzzer/i, 'buzzer']];

// Shape's names above are KiCad footprint names ("USB_Micro-B"); a project's values are people's words
// ("Micro USB socket", "DC jack"). These are tried first: whole words, spaces allowed, Shape's heights.
const BENCH_PORTS = [[/\bUSB[\s_-]?C\b|\btype[\s_-]?C\b/i, 'usbc', 1.6], [/\bmicro[\s_-]?USB\b|\bUSB[\s_-]?micro\b/i, 'micro', 1.6],
  [/\bmini[\s_-]?USB\b|\bUSB[\s_-]?mini\b/i, 'usbmini', 2], [/\bUSB[\s_-]?A\b/i, 'usba', 3.5], [/\bUSB[\s_-]?B\b/i, 'usbb', 5.5],
  [/\bbarrel\b|\bDC[\s_-]?(power[\s_-]?)?(jack|socket)\b/i, 'dcpcb', 5.6], [/\bRJ45\b|\b8P8C\b|\bethernet\b/i, 'rj45', 6.9], [/\bHDMI\b/i, 'hdmi', 3.2],
  [/\b(audio|headphone|3\.5[\s_-]?mm)[\s_-]?(jack|socket)\b/i, 'jack35', 3], [/\bmicro[\s_-]?SD\b|\bTF[\s_-]?card\b|\bSD[\s_-]?card\b/i, 'sd', 1.5]];

/** Bench's own part types that face out through a wall or the lid. */
function benchPanel(part, value) {
  switch (part.type) {
    case 'led': return part.D === 3 || /\b3\s*mm\b/i.test(value) ? 'led3' : 'led5';
    case 'button': return /12\s*[x×]\s*12|\b12\s*mm\b/i.test(value) ? 'tact12' : 'tact';
    case 'pot': return 'pot';
    case 'switch': return /toggle/i.test(value) ? 'toggle' : 'slide';
    case 'buzzer': return 'buzzer';
    default: return null;
  }
}

const WIRED = new Set(['header', 'terminal', 'connector']);

/**
 * The parts Shape cuts holes for, in its frame: ports at the edges [edge, along, kind, height],
 * panel parts on top [x, y, kind], and the headers, terminals and connectors that are neither
 * (their wires leave the box some other way). Parts under the board are left out.
 */
export function portsAndPanel(board, values = {}, size = defaultSize(board)) {
  const pitch = pitchOf(board);
  const { minC, maxR } = extent(board);
  const [w, d] = size;
  const ports = [];
  const panel = [];
  const wires = [];
  for (const [ref, part] of Object.entries(board?.parts || {})) {
    if (!part || part.side === 'bottom') continue;
    const pins = Object.values(part.pins || {}).filter(isHole);
    if (!pins.length) continue;
    const c = pins.reduce((s, h) => s + h[0], 0) / pins.length;
    const r = pins.reduce((s, h) => s + h[1], 0) / pins.length;
    const x = (c - minC + 1) * pitch;
    const y = (maxR - r + 1) * pitch;
    const value = typeof values[ref] === 'string' ? values[ref] : '';
    const hay = `${part.type || ''} ${value} ${part.package || ''}`;
    const port = BENCH_PORTS.find(([re]) => re.test(hay)) || SHAPE_PORTS.find(([re]) => re.test(hay));
    if (port) {
      const dist = { x0: x, x1: w - x, y0: y, y1: d - y };
      const edge = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0];
      if (dist[edge] < EDGE_MM) {
        ports.push([edge, r2(clamp(edge[0] === 'x' ? y : x, 0, edge[0] === 'x' ? d : w)), port[1], port[2]]);
        continue;
      }
    }
    const kind = benchPanel(part, value) || (SHAPE_PANEL.find(([re]) => re.test(hay)) || [])[1];
    if (kind) panel.push([r2(clamp(x, 0, w)), r2(clamp(y, 0, d)), kind]);
    else if (WIRED.has(part.type)) wires.push(ref);
  }
  return { ports, panel, wires };
}

/** Shape's encWireText: no <>&", spaces collapsed, at most 20 characters. */
const cleanLabel = (v) => (typeof v === 'string' ? v.replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '');

const NUMBER = String.raw`-?\d+(?:[.,]\d+)?`;
const BY_SPACE = new RegExp(`^(${NUMBER})\\s+(${NUMBER})$`); // "3,5 4,5": a decimal comma or point
const BY_COMMA = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/; // "3.5, 4.5" or "3,3"

/** Holes typed as "x,y" or "x y", one pair per ; or line, and how many pairs weren't two numbers. */
export function parseHoles(text) {
  const holes = [];
  let bad = 0;
  for (const pair of String(text).split(/[;\n]/).map((t) => t.trim()).filter(Boolean)) {
    const m = pair.match(BY_SPACE) || pair.match(BY_COMMA);
    if (m) holes.push([Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))]);
    else bad++;
  }
  return { holes, bad };
}

const holeWords = (n) => `${n} ${n === 1 ? 'hole' : 'holes'}`;

/** The holes Shape gets, and how many were off the board or past Shape's 16. */
function holesFor(holes, w, d) {
  if (holes && typeof holes === 'object' && !Array.isArray(holes) && Number.isFinite(holes.inset)) {
    const i = holes.inset;
    holes = [[i, i], [w - i, i], [i, d - i], [w - i, d - i]];
  }
  if (!Array.isArray(holes)) return { kept: [], outside: 0, over: 0 };
  const inside = holes.filter((h) => isHole(h) && h[0] >= 0 && h[0] <= w && h[1] >= 0 && h[1] <= d);
  return { kept: inside.slice(0, 16).map((h) => [r2(h[0]), r2(h[1])]), outside: holes.length - inside.length, over: Math.max(0, inside.length - 16) };
}

/** A typed size inside Shape's 5 to 300 mm, and what it was if that changed it. */
function fitSize(typed, fallback) {
  const v = Number(typed);
  if (!Number.isFinite(v)) return { mm: fallback, was: null };
  const mm = r2(clamp(v, 5, 300));
  return { mm, was: mm === r2(v) ? null : r2(v) };
}

/**
 * The board for Shape's Your parts, the refs whose wires leave the box, what was changed to fit
 * Shape (notes, in plain words) and what stops the send (problem, else null).
 * opts = { name, project, which, size: [w, d], holes: 'none' | { inset } | [[x, y]], holesBad, screw, tall }:
 * holesBad counts typed pairs that weren't two numbers. The id comes from the project's name (else
 * name), so a board renamed for Shape still replaces itself.
 */
export function shapeBoard(board, values, opts) {
  const fitW = fitSize(opts.size?.[0], 50);
  const fitD = fitSize(opts.size?.[1], 40);
  const w = fitW.mm;
  const d = fitD.mm;
  const { ports, panel, wires } = portsAndPanel(board, values, [w, d]);
  const tall = Number.isFinite(opts.tall) ? opts.tall : 10;
  const holes = holesFor(opts.holes, w, d);
  const notes = [];
  const resized = [['width', fitW], ['depth', fitD]].filter(([, f]) => f.was !== null)
    .map(([what, f], i) => `the ${what}${i === 0 ? ' is sent' : ''} as ${f.mm} mm (not ${f.was})`);
  if (resized.length) notes.push(`Shape takes boards 5 to 300 mm, so ${resized.join(' and ')}.`);
  const leftOut = holes.outside + (Number.isInteger(opts.holesBad) && opts.holesBad > 0 ? opts.holesBad : 0);
  if (leftOut) notes.push(`${holeWords(leftOut)} left out: each needs two numbers inside the board.`);
  if (holes.over) notes.push(`Shape keeps up to 16 holes, so ${holes.over} more ${holes.over === 1 ? 'was' : 'were'} left out.`);
  const inset = opts.holes && typeof opts.holes === 'object' && !Array.isArray(opts.holes) ? opts.holes.inset : null;
  const room = r2(Math.min(w, d) / 2);
  const problem = Number.isFinite(inset) && inset >= room ? `Holes ${r2(inset)} mm in from each corner don't fit a ${w} × ${d} mm board: use less than ${room} mm.` : null;
  return {
    board: {
      id: shapeId(typeof opts.project === 'string' && opts.project ? opts.project : opts.name, opts.which),
      label: cleanLabel(opts.name) || 'My board',
      w,
      d,
      holes: holes.kept,
      screw: SCREWS.includes(opts.screw) ? opts.screw : 'M3',
      tall: clamp(Math.ceil(tall - 1e-9), 1, 60),
      ports: ports.slice(0, 16),
      panel: panel.slice(0, 32),
    },
    wires,
    notes,
    problem,
  };
}

/**
 * Put the board in Shape's Your parts: the one with the same id is replaced where it is, else the
 * board goes at the end. A list Bench can't read, a full list or a store that won't keep it are
 * left exactly as they were. storage: { getItem, setItem }.
 */
export function writeShapeParts(storage, entry) {
  const unreadable = { ok: false, why: "Shape's list in this browser can't be read, so Bench leaves it alone." };
  const blocked = { ok: false, why: "This browser wouldn't keep it (storage is full or blocked)." };
  let raw;
  try { raw = storage.getItem(SHAPE_KEY); } catch { return blocked; }
  let list = [];
  if (raw !== null && raw !== undefined) {
    try { list = JSON.parse(raw); } catch { return unreadable; }
    if (!Array.isArray(list)) return unreadable;
  }
  const at = list.findIndex((b) => b && typeof b === 'object' && b.id === entry.id);
  if (at < 0 && list.length >= SHAPE_MAX) return { ok: false, why: `Shape's Your parts is full (${SHAPE_MAX} boards): remove one in Shape first.` };
  const next = list.slice();
  if (at >= 0) next[at] = entry;
  else next.push(entry);
  try { storage.setItem(SHAPE_KEY, JSON.stringify(next)); } catch { return blocked; }
  return { ok: true, replaced: at >= 0 };
}
