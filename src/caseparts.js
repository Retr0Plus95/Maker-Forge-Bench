// Bench 1.0.5 "The case" (docs/design/2026-11-27-release-1.0.5-design.md): the project's printed parts, read
// from its STL and 3MF files. The readers follow Maker Forge Shape's (src/core.js parseSTL and parse3MFModel), so
// both apps read a file the same way. No page code: unit-tested in Node. A 3MF is a zip; its deflate is undone by
// the browser's own DecompressionStream (passed in), so no library and no change to the security rules.
import { inline, parseMarkdown, pathFrom } from './readme.js';

export const CASE_EXT = /\.(stl|3mf)$/i;
export const MAX_PART = 64 * 1024 * 1024;      // a part file bigger than this isn't read
export const MAX_TRIS = 4e6;                     // nor one with more triangles (Shape's limit)
const MAX_UNZIPPED = 400 * 1024 * 1024;          // what a 3MF may unpack to, in all
const WELD_LIMIT = 500000;                       // the surface check runs on parts up to this many triangles

/** A printed part's file: an STL or 3MF in the project. */
export const isCasePart = (path) => CASE_EXT.test(String(path || ''));

// ---- STL ----

/** An STL (binary or text) as a flat list of triangles: x y z ×3 per triangle, in the file's units. */
export function parseSTL(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const dv = new DataView(bytes);
  if (bytes.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === bytes.byteLength) {
      if (n > MAX_TRIS) throw new RangeError('more than four million triangles');
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      return out;
    }
  }
  const text = new TextDecoder().decode(bytes);
  const re = /vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) {
    v.push(+m[1], +m[2], +m[3]);
    if (v.length > MAX_TRIS * 9) throw new RangeError('more than four million triangles');
  }
  if (!v.length || v.length % 9 || v.some((x) => !Number.isFinite(x))) throw new Error("isn't a readable STL");
  return new Float32Array(v);
}

// ---- 3MF: the zip around it ----

/** The files in a zip, from its central directory: [{ name, method, size, packed, offset }]. */
export function zipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("isn't a 3MF file (not a zip)");
  const count = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const entries = [];
  for (let k = 0; k < count && k < 20000; k++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) throw new Error('has a damaged zip directory');
    const method = dv.getUint16(at + 10, true);
    const packed = dv.getUint32(at + 20, true);
    const size = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extra = dv.getUint16(at + 30, true);
    const comment = dv.getUint16(at + 32, true);
    const offset = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    entries.push({ name, method, size, packed, offset });
    at += 46 + nameLen + extra + comment;
  }
  return entries;
}

/** One file of a zip as bytes. inflateRaw(Uint8Array) → Promise<Uint8Array> undoes deflate (method 8). */
export async function zipRead(buffer, entry, inflateRaw) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.size === 0xffffffff || entry.packed === 0xffffffff) throw new RangeError('is too big a 3MF (zip64)');
  if (entry.offset + 30 > bytes.length || dv.getUint32(entry.offset, true) !== 0x04034b50) throw new Error('has a damaged zip entry');
  const start = entry.offset + 30 + dv.getUint16(entry.offset + 26, true) + dv.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.packed);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error('uses a zip packing Bench can\'t open');
  const out = await inflateRaw(data, MAX_UNZIPPED);
  if (out.length > MAX_UNZIPPED) throw new RangeError('unpacks too big');
  return out;
}

/** The browser's own inflate (DecompressionStream), for zipRead. It stops as soon as the output passes `limit`. */
export async function browserInflate(data, limit = MAX_UNZIPPED) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      reader.cancel().catch(() => {});
      throw new RangeError('unpacks too big');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** A 3MF's model files as text: { files: { '/3D/3dmodel.model': xml, … }, main, config: { settings?, project? } }. */
export async function unzip3MF(buffer, inflateRaw = browserInflate) {
  const entries = zipEntries(buffer);
  const models = entries.filter((e) => /\.model$/i.test(e.name));
  if (!models.length) throw new Error('has no 3D model inside');
  let total = 0;
  const files = {};
  const decoder = new TextDecoder();
  for (const e of models) {
    total += e.size;
    if (total > MAX_UNZIPPED) throw new RangeError('unpacks too big');
    files['/' + e.name.replace(/^\/+/, '')] = decoder.decode(await zipRead(buffer, e, inflateRaw));
  }
  let main = null;
  const rels = entries.find((e) => /^_rels\/\.rels$/i.test(e.name));
  if (rels) {
    const xml = decoder.decode(await zipRead(buffer, rels, inflateRaw));
    const m = /<Relationship\b[^>]*Target="([^"]+\.model)"[^>]*Type="[^"]*3dmodel"/i.exec(xml) || /<Relationship\b[^>]*Type="[^"]*3dmodel"[^>]*Target="([^"]+\.model)"/i.exec(xml);
    if (m) main = '/' + m[1].replace(/^\/+/, '');
  }
  if (!main || !(main in files)) main = Object.keys(files).find((k) => /3dmodel\.model$/i.test(k)) || Object.keys(files)[0];
  // the slicer's settings, for the colours: which filament each part prints in, and each filament's colour
  const config = {};
  for (const [name, key] of [[/^metadata\/model_settings\.config$/i, 'settings'], [/^metadata\/project_settings\.config$/i, 'project']]) {
    const e = entries.find((x) => name.test(x.name));
    if (e && e.size <= 8 * 1024 * 1024) config[key] = decoder.decode(await zipRead(buffer, e, inflateRaw));
  }
  return { files, main, config };
}

const UNITS = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

/**
 * A 3MF's triangles in millimetres: every mesh, placed by its build items and components (as Shape's
 * parse3MFModel). files: { path: xml }, main: the start part. colours (optional): { settings, filaments } in, and
 * { slots, palette } out: each triangle's colour as palette[slots[t]] ('#rrggbb', or null for the part's own colour),
 * from slicer painting, Bambu's filament per object and part (settings: model_settings.config), or the file's base
 * materials and colour groups; slots stays null when the file gives no colours.
 */
export function parse3MF(files, main, colours = null) {
  const norm = (p) => '/' + String(p || '').replace(/^\/+/, '');
  const attr = (tag, name) => {
    const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
    return m ? m[1] : null;
  };
  const objs = new Map();
  const groups = new Map(); // `${path}#${id}` → the colours of a base materials or colour group
  const hex = (c) => (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c || '') ? c.slice(0, 7).toUpperCase() : null);
  if (colours) {
    for (const [path0, xml] of Object.entries(files)) {
      const path = norm(path0);
      for (const g of xml.matchAll(/<(?:[a-z]+:)?(basematerials|colorgroup)\b([^>]*)>([\s\S]*?)<\/(?:[a-z]+:)?\1>/gi)) {
        const list = [...g[3].matchAll(/<(?:[a-z]+:)?(?:base|color)\b([^>]*)\/?>/gi)].map((c) => hex(attr(c[1], 'displaycolor') || attr(c[1], 'color')));
        groups.set(path + '#' + attr(g[2], 'id'), list);
      }
    }
  }
  const groupColour = (path, pid, index) => {
    const list = pid !== null ? groups.get(path + '#' + pid) : null;
    const c = list ? list[Number(index) || 0] : null;
    return c ? 'c:' + c : null;
  };
  for (const [path0, xml] of Object.entries(files)) {
    const path = norm(path0);
    const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
    let m;
    while ((m = objRe.exec(xml))) {
      const body = m[2];
      const V = [];
      const T = [];
      const F = colours ? [] : null;
      const comps = [];
      const own = colours ? groupColour(path, attr(m[1], 'pid'), attr(m[1], 'pindex')) : null;
      const vr = /<vertex\b([^>]*)\/?>/g;
      let v;
      while ((v = vr.exec(body))) V.push(+attr(v[1], 'x'), +attr(v[1], 'y'), +attr(v[1], 'z'));
      const tr = /<triangle\b([^>]*)\/?>/g;
      let t;
      while ((t = tr.exec(body))) {
        T.push(+attr(t[1], 'v1'), +attr(t[1], 'v2'), +attr(t[1], 'v3'));
        if (F) {
          const paint = paintSlot(attr(t[1], 'paint_color') || attr(t[1], 'slic3rpe:mmu_segmentation'));
          F.push(paint !== null ? 'f:' + paint : groupColour(path, attr(t[1], 'pid') ?? attr(m[1], 'pid'), attr(t[1], 'p1') ?? (attr(t[1], 'pid') ? 0 : attr(m[1], 'pindex'))) || own);
        }
      }
      const cr = /<component\b([^>]*)\/?>/g;
      let c;
      while ((c = cr.exec(body))) {
        const pp = attr(c[1], 'p:path');
        comps.push({ key: (pp ? norm(pp) : path) + '#' + attr(c[1], 'objectid'), m: attr(c[1], 'transform') });
      }
      objs.set(path + '#' + attr(m[1], 'id'), { V, T, F, comps });
      if (objs.size > 20000) break;
    }
  }
  const mat = (s) => {
    const a = (s || '').trim().split(/\s+/).map(Number);
    return a.length === 12 && a.every(Number.isFinite) ? a : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  };
  const mul = (A, B) => { // 3MF matrices act on row vectors: p' = p·M
    const r = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]);
    for (let j = 0; j < 3; j++) r.push(A[9] * B[j] + A[10] * B[3 + j] + A[11] * B[6 + j] + B[9 + j]);
    return r;
  };
  const mainPath = norm(main || Object.keys(files)[0]);
  const xml = files[Object.keys(files).find((k) => norm(k) === mainPath)] || '';
  const unit = UNITS[(/<model\b[^>]*\sunit="([a-z]+)"/i.exec(xml) || [])[1]] || 1;
  const out = [];
  const keys = colours ? [] : null; // each triangle's colour key, when colours are asked for
  const ext = bambuFilaments(colours && colours.settings);
  let calls = 0; // components can name each other many times over: a budget keeps a hostile file from running away
  const emit = (key, M, depth, inherit = null, item = null) => {
    const o = objs.get(key);
    if (!o || depth > 8) return;
    if (++calls > 200000) throw new RangeError('too many parts inside');
    const ok = (k) => Number.isInteger(k) && k >= 0 && 3 * k + 2 < o.V.length;
    for (let t = 0; t < o.T.length / 3; t++) {
      const a = o.T[3 * t];
      const b = o.T[3 * t + 1];
      const c = o.T[3 * t + 2];
      if (!ok(a) || !ok(b) || !ok(c)) continue;
      for (const k of [a, b, c]) {
        const x = o.V[3 * k];
        const y = o.V[3 * k + 1];
        const z = o.V[3 * k + 2];
        out.push((x * M[0] + y * M[3] + z * M[6] + M[9]) * unit, (x * M[1] + y * M[4] + z * M[7] + M[10]) * unit, (x * M[2] + y * M[5] + z * M[8] + M[11]) * unit);
      }
      if (keys) keys.push((o.F && o.F[t]) || inherit);
      if (out.length > 9 * MAX_TRIS) throw new RangeError('more than four million triangles');
    }
    for (const c of o.comps) {
      const part = depth === 0 && item ? ext.parts.get(item + '/' + c.key.slice(c.key.lastIndexOf('#') + 1)) : undefined;
      emit(c.key, mul(mat(c.m), M), depth + 1, part !== undefined ? 'f:' + part : inherit, null);
    }
  };
  const items = [];
  const ir = /<item\b([^>]*)\/?>/g;
  let it;
  while ((it = ir.exec(xml))) {
    const pp = attr(it[1], 'p:path');
    items.push({ key: (pp ? norm(pp) : mainPath) + '#' + attr(it[1], 'objectid'), m: attr(it[1], 'transform') });
  }
  const idOf = (k) => k.slice(k.lastIndexOf('#') + 1);
  if (items.length) {
    items.forEach((i) => {
      const e = ext.objects.get(idOf(i.key));
      emit(i.key, mat(i.m), 0, e !== undefined ? 'f:' + e : null, idOf(i.key));
    });
  } else objs.forEach((o, k) => { if (o.T.length) emit(k, mat(null), 0); });
  if (!out.length || out.some((x) => !Number.isFinite(x))) throw new Error('has no triangles Bench can read');
  if (colours) {
    const filaments = (colours.filaments || []).map(hex);
    const colourOf = (k) => {
      if (!k) return null;
      if (k.startsWith('c:')) return k.slice(2);
      const n = Number(k.slice(2)); // a filament, 0 = the first: the part's own colour unless the project names its colour
      if (n === 0) return null;
      return filaments[n] || SECOND[(n - 1) % SECOND.length];
    };
    const palette = [];
    const index = new Map();
    const slots = new Uint16Array(keys.length);
    keys.forEach((k, t) => {
      const c = colourOf(k);
      if (!index.has(c)) { index.set(c, palette.length); palette.push(c); }
      slots[t] = index.get(c);
    });
    const coloured = palette.some((c) => c !== null) && palette.length <= 64;
    colours.slots = coloured ? slots : null;
    colours.palette = coloured ? palette : [null];
  }
  return new Float32Array(out);
}

/** Colours for a second, third… filament when the file doesn't name them. */
const SECOND = ['#E04A3A', '#2F6FD0', '#F2F2F2', '#30A050', '#202020', '#F0C020'];

/** Slicer painting on a triangle (Bambu paint_color, PrusaSlicer mmu_segmentation) as a filament, 0 = the first; null: none. */
function paintSlot(code) {
  const s = String(code || '').toUpperCase();
  if (s === '4') return 0;
  if (s === '8') return 1;
  if (/^[0-9A-F]C$/.test(s)) return parseInt(s[0], 16) + 2;
  return null; // unpainted, or split finer than one triangle
}

/** Bambu's model_settings.config: the filament (0 = the first) of each object and each of its parts. */
function bambuFilaments(xml) {
  const objects = new Map();
  const parts = new Map();
  if (!xml) return { objects, parts };
  const extruder = (text) => {
    const m = /<metadata\b[^>]*\bkey="extruder"[^>]*\bvalue="(\d+)"/.exec(text) || /<metadata\b[^>]*\bvalue="(\d+)"[^>]*\bkey="extruder"/.exec(text);
    const e = m ? Number(m[1]) : 0;
    return e > 0 && e < 256 ? e - 1 : undefined;
  };
  for (const m of String(xml).matchAll(/<object\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const e = extruder(m[2].replace(/<part\b[\s\S]*?<\/part>/g, ''));
    if (e !== undefined) objects.set(m[1], e);
    for (const p of m[2].matchAll(/<part\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)) {
      const pe = extruder(p[2]);
      if (pe !== undefined) parts.set(m[1] + '/' + p[1], pe);
    }
  }
  return { objects, parts };
}

/** A Bambu project's filament colours (project_settings.config, JSON), or []. */
function filamentColours(json) {
  try {
    const list = JSON.parse(json || 'null')?.filament_colour;
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string').slice(0, 32) : [];
  } catch {
    return [];
  }
}

/**
 * A part file's triangles and colours, by its name: { tris, slots, palette } (see parse3MF). An STL has no colours.
 */
export async function readPartFull(path, buffer, inflateRaw = browserInflate) {
  if (/\.3mf$/i.test(path)) {
    const { files, main, config } = await unzip3MF(buffer, inflateRaw);
    const colours = { settings: config.settings || null, filaments: filamentColours(config.project) };
    const tris = parse3MF(files, main, colours);
    return { tris, slots: colours.slots, palette: colours.palette };
  }
  return { tris: parseSTL(buffer), slots: null, palette: [null] };
}

/** A part file's triangles, by its name: STL or 3MF. */
export async function readPart(path, buffer, inflateRaw = browserInflate) {
  if (/\.3mf$/i.test(path)) {
    const { files, main } = await unzip3MF(buffer, inflateRaw);
    return parse3MF(files, main);
  }
  return parseSTL(buffer);
}

// ---- what a part is: size, plastic, surface ----

/**
 * The facts Bench shows for a part: { tris, min, max, size [x,y,z], volume (mm³), area (mm²), open (edges on a gap in
 * the surface: used by an odd number of triangles; null when not checked), insideOut, onBed (mm² of downward faces on
 * its lowest level) }.
 */
export function meshFacts(tris) {
  const n = Math.floor(tris.length / 9);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  let area = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    for (let k = 0; k < 9; k++) {
      const v = tris[o + k];
      const a = k % 3;
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
    const ax = tris[o]; const ay = tris[o + 1]; const az = tris[o + 2];
    const bx = tris[o + 3] - ax; const by = tris[o + 4] - ay; const bz = tris[o + 5] - az;
    const cx = tris[o + 6] - ax; const cy = tris[o + 7] - ay; const cz = tris[o + 8] - az;
    const nx = by * cz - bz * cy; const ny = bz * cx - bx * cz; const nz = bx * cy - by * cx;
    area += Math.hypot(nx, ny, nz) / 2;
    vol += (ax * nx + ay * ny + az * nz) / 6;
  }
  // the area of the downward faces on its lowest level: what stands on the bed as it lies
  let onBed = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    if (tris[o + 2] - min[2] > 0.05 || tris[o + 5] - min[2] > 0.05 || tris[o + 8] - min[2] > 0.05) continue;
    const nz = (tris[o + 3] - tris[o]) * (tris[o + 7] - tris[o + 1]) - (tris[o + 4] - tris[o + 1]) * (tris[o + 6] - tris[o]);
    if (nz < 0) onBed -= nz / 2;
  }
  let open = null;
  if (n && n <= WELD_LIMIT) {
    const ids = new Map();
    const idOf = (o) => {
      const key = `${tris[o]},${tris[o + 1]},${tris[o + 2]}`;
      let id = ids.get(key);
      if (id === undefined) { id = ids.size; ids.set(key, id); }
      return id;
    };
    const v = new Uint32Array(n * 3);
    for (let i = 0; i < n * 3; i++) v[i] = idOf(i * 3);
    const N = ids.size + 1;
    const edges = new Map();
    for (let t = 0; t < n; t++) {
      for (let e = 0; e < 3; e++) {
        const a = v[t * 3 + e];
        const b = v[t * 3 + ((e + 1) % 3)];
        if (a === b) continue;
        const key = a < b ? a * N + b : b * N + a;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    // a gap's edge is used by one triangle (or three…); an edge where two solid pieces meet is used by four, which
    // slicers print fine (Maker Forge's boxes have many), so only odd counts are gaps
    open = 0;
    for (const c of edges.values()) if (c % 2) open++;
  }
  const size = n ? [max[0] - min[0], max[1] - min[1], max[2] - min[2]] : [0, 0, 0];
  return { tris: n, min, max, size, volume: Math.abs(vol), area, open, insideOut: vol < 0, onBed };
}

// ---- printers and plastics ----

/** Printers by their bed: width × depth × height, mm. "own" is a size you type. */
export const PRINTERS = Object.freeze([
  { id: 'bambu-256', label: 'Bambu Lab X1, P1 or A1 (256 mm)', bed: [256, 256, 256] },
  { id: 'bambu-mini', label: 'Bambu Lab A1 mini (180 mm)', bed: [180, 180, 180] },
  { id: 'prusa-mk4', label: 'Prusa MK4 (250 × 210 mm)', bed: [250, 210, 220] },
  { id: 'prusa-core', label: 'Prusa Core One (250 × 220 mm)', bed: [250, 220, 270] },
  { id: 'prusa-mini', label: 'Prusa MINI (180 mm)', bed: [180, 180, 180] },
  { id: 'ender-220', label: 'Creality Ender-3 or K1 (220 mm)', bed: [220, 220, 250] },
  { id: 'own', label: 'My own size', bed: null },
]);

/** The printer setting read back from storage: { id, bed }. Anything odd is the first printer. */
export function cleanPrinter(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const found = PRINTERS.find((p) => p.id === r.id) || PRINTERS[0];
  if (found.id !== 'own') return { id: found.id, bed: [...found.bed] };
  const bed = Array.isArray(r.bed) ? r.bed.slice(0, 3).map(Number) : [];
  const ok = bed.length === 3 && bed.every((v) => Number.isFinite(v) && v >= 20 && v <= 2000);
  return { id: 'own', bed: ok ? bed.map((v) => Math.round(v * 10) / 10) : [...PRINTERS[0].bed] };
}

/** Plastics with their density (g/cm³), for the weight. */
export const MATERIALS = Object.freeze({ PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, PC: 1.2, Nylon: 1.14 });
export const cleanMaterial = (v) => (typeof v === 'string' && Object.hasOwn(MATERIALS, v) ? v : 'PLA');
const FILAMENT_MM2 = Math.PI * 0.875 * 0.875; // 1.75 mm filament
const WALL = 1.2;     // mm of solid plastic under every surface (three 0.4 mm walls, or the top and bottom layers)
const INFILL = 0.15;  // and 15 % inside

/**
 * About how much plastic a part takes: { grams, metres } of 1.75 mm filament, counting solid walls and 15 % infill
 * (a slicer gives the exact figure), and { solidGrams } if it were printed solid.
 */
export function plastic(facts, material = 'PLA') {
  const density = MATERIALS[cleanMaterial(material)];
  const shell = Math.min(facts.volume, facts.area * WALL);
  const mm3 = shell + Math.max(0, facts.volume - shell) * INFILL;
  return { grams: (mm3 / 1000) * density, metres: mm3 / FILAMENT_MM2 / 1000, solidGrams: (facts.volume / 1000) * density };
}

/**
 * Whether a part fits the bed: as it lies in the file (turned flat on the bed if that helps), or else on
 * another side. { fits, turned (true: turned 90° on the bed), side: [x,y,z] it would fit on, or null; over: mm too
 * big as it lies }.
 */
export function fitOnBed(size, bed) {
  const [x, y, z] = size;
  const [W, D, H] = bed;
  const flat = (a, b, h) => h <= H && ((a <= W && b <= D) || (a <= D && b <= W));
  if (flat(x, y, z)) return { fits: true, turned: !(x <= W && y <= D), side: null, over: 0 };
  const over = Math.max(0, z - H, Math.min(Math.max(x - W, y - D), Math.max(x - D, y - W)));
  for (const [a, b, h] of [[x, z, y], [y, z, x]]) {
    if (flat(a, b, h)) return { fits: false, turned: false, side: [a, b, h], over };
  }
  return { fits: false, turned: false, side: null, over };
}

// ---- what the project's READMEs say about each part ----

const plainOf = (cell) => inline(cell).map((r) => (r.t === 'img' ? r.alt || '' : r.text || '')).join('').trim();
const SAME = /^(same|as above|ditto|〃|")\.?$/i;
const MATERIAL_WORDS = [['PETG', /\bpetg\b/i], ['PLA', /\bpla\b/i], ['ABS', /\babs\b/i], ['ASA', /\basa\b/i], ['TPU', /\btpu\b/i], ['PC', /\bpc\b|\bpolycarbonate\b/i], ['Nylon', /\bnylon\b|\bpa\d*\b/i]];

/** What a README's print notes say: { material, supports: true | false | null }. */
export function printHint(text) {
  const t = String(text || '');
  const found = MATERIAL_WORDS.find(([, re]) => re.test(t));
  let supports = null;
  if (/\bno supports?\b|\bwithout supports?\b|\bsupports? off\b|\bsupport-free\b|\bno support needed\b/i.test(t)) supports = false;
  else if (/\bsupports? on\b|\bwith supports?\b|\bneeds? supports?\b|\bsupports? needed\b|\bsupports? (?:under|everywhere|from the bed)\b/i.test(t)) supports = true;
  return { material: found ? found[0] : null, supports };
}

/** A README's table cell's file names: code spans, links and plain words that end in .stl or .3mf. */
function namesIn(cell) {
  const out = [];
  for (const r of inline(cell)) {
    if (r.t === 'code' || r.t === 'text' || r.t === 'b' || r.t === 'i') {
      for (const m of String(r.text).matchAll(/[^\s,;`'"()|]+\.(?:stl|3mf)\b/gi)) out.push(m[0]);
    } else if (r.t === 'link') {
      if (isCasePart(r.href)) out.push(r.href);
      else for (const m of String(r.text).matchAll(/[^\s,;`'"()|]+\.(?:stl|3mf)\b/gi)) out.push(m[0]);
    }
  }
  return out;
}

const globRe = (pattern) => new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$', 'i');

/** "4", "4 pcs", "x2": the count, 1–999; null when it says no number (or zero). */
function countOf(text) {
  const m = /\d+/.exec(String(text || ''));
  const n = m ? Number(m[0]) : 0;
  return n > 0 ? Math.min(999, n) : null;
}

/**
 * The rows of the parts tables in the project's READMEs: a table whose head has a File column and a What, Notes,
 * Print or Material column (a Qty column gives the count). Gives [{ names, what, print, count, readme }].
 */
function tableRows(readmes) {
  const out = [];
  for (const { path: readme, text } of readmes) {
    for (const block of parseMarkdown(text)) {
      if (block.t !== 'table') continue;
      const head = block.head.map((c) => plainOf(c).toLowerCase());
      const fileCol = head.findIndex((h) => /\bfiles?\b|\bparts?\b|\bstl\b/.test(h));
      const other = (re) => head.findIndex((h, i) => i !== fileCol && re.test(h));
      let whatCol = other(/\bwhat\b|\bdescription\b|\bpurpose\b|\bit is\b/);
      if (whatCol < 0) whatCol = other(/\bnotes?\b|\bcomments?\b/);
      const printCol = other(/\bprint|\bsettings?\b|\bmaterial\b|\bfilament\b/);
      const qtyCol = other(/\bqty\b|\bquantity\b|\bcount\b|\bhow many\b|^no\.?$/);
      if (fileCol < 0 || (whatCol < 0 && printCol < 0)) continue;
      let lastPrint = '';
      for (const row of block.rows) {
        const what = whatCol >= 0 ? plainOf(row[whatCol] || '') : '';
        let print = printCol >= 0 ? plainOf(row[printCol] || '') : '';
        if (SAME.test(print)) print = lastPrint;
        if (print) lastPrint = print;
        const count = qtyCol >= 0 ? countOf(plainOf(row[qtyCol] || '')) : null;
        out.push({ names: namesIn(row[fileCol] || '').map((name) => pathFrom(readme, name)), shown: namesIn(row[fileCol] || ''), what, print, count, readme });
      }
    }
  }
  return out;
}

const matcher = (want) => {
  const re = want.includes('*') ? globRe(want) : null;
  return (p) => (re ? re.test(p) : p.toLowerCase() === want.toLowerCase());
};

/**
 * What each part is and how to print it, from the tables in the project's READMEs (see tableRows). readmes:
 * [{ path, text }], parts: the part paths. Gives Map path → { what, print, readme, order, count? } (order: where it
 * comes in the README, for sorting; count: how many to print, when the table has a Qty column).
 */
export function partNotes(readmes, parts) {
  const notes = new Map();
  let order = 0;
  for (const row of tableRows(readmes)) {
    for (const want of row.names) {
      const match = matcher(want);
      for (const p of parts) {
        if (notes.has(p) || !match(p)) continue;
        const note = { what: row.what, print: row.print, readme: row.readme, order: order++ };
        if (row.count) note.count = row.count;
        notes.set(p, note);
      }
    }
  }
  return notes;
}

/** The files the READMEs' parts tables list that no part in the project is: [{ name (as written), readme }]. */
export function listedMissing(readmes, parts) {
  const out = [];
  const seen = new Set();
  for (const row of tableRows(readmes)) {
    row.names.forEach((want, i) => {
      if (parts.some(matcher(want)) || seen.has(want.toLowerCase())) return;
      seen.add(want.toLowerCase());
      out.push({ name: row.shown[i], readme: row.readme });
    });
  }
  return out;
}

/** One line of a CSV file, with quoted fields. */
function csvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * What BOM.csv says about the parts: its printed rows (Category "printed", or with no category column every row naming
 * an .stl or .3mf), matched to the parts by file name, with or without the extension or a folder. A Notes column with
 * no Material column gives the material up to its first ";". Gives the same Map as partNotes.
 */
export function bomNotes(csv, bomPath, parts) {
  const notes = new Map();
  const lines = String(csv || '').split(/\r?\n/).filter((l) => l.trim()).slice(0, 2000);
  if (lines.length < 2) return notes;
  const head = csvLine(lines[0]).map((c) => c.toLowerCase());
  const col = (re) => head.findIndex((c) => re.test(c));
  const category = col(/categ|type|kind/);
  const item = col(/item|part|name|file/);
  const qty = col(/qty|quantity|count/);
  const material = col(/material|filament/);
  const comment = col(/note|comment/);
  if (item < 0) return notes;
  const stem = (p) => p.split('/').pop().toLowerCase().replace(CASE_EXT, '');
  let order = 0;
  for (const line of lines.slice(1)) {
    const cells = csvLine(line);
    const name = cells[item] || '';
    if (category >= 0 ? !/print/i.test(cells[category] || '') : !CASE_EXT.test(name)) continue;
    let print = material >= 0 ? cells[material] || '' : '';
    let what = comment >= 0 ? cells[comment] || '' : '';
    if (material < 0 && what) {
      const cut = what.indexOf(';');
      print = cut < 0 ? what : what.slice(0, cut).trim();
      what = cut < 0 ? '' : what.slice(cut + 1).trim();
    }
    const want = name.split('/').pop().toLowerCase();
    const count = qty >= 0 ? countOf(cells[qty]) : null;
    for (const p of parts) {
      const base = p.split('/').pop().toLowerCase();
      if (notes.has(p) || !(base === want || (!CASE_EXT.test(want) && stem(p) === want))) continue;
      const note = { what, print, readme: bomPath, order: order++ };
      if (count) note.count = count;
      notes.set(p, note);
    }
  }
  return notes;
}

// ---- words ----

/** "151.5 × 222 × 122 mm". */
export function sizeText(size) {
  const f = (v) => String(Math.round(v * 10) / 10);
  return `${f(size[0])} × ${f(size[1])} × ${f(size[2])} mm`;
}

/** "about 180 g" (rounded the way a scale would read it). */
export function gramsText(g) {
  if (g < 1) return 'under 1 g';
  if (g < 10) return `about ${Math.round(g * 10) / 10} g`;
  if (g < 1000) return `about ${Math.round(g)} g`;
  return `about ${Math.round(g / 100) / 10} kg`;
}

/** "62 m" of filament. */
export const metresText = (m) => (m < 1 ? `${Math.max(1, Math.round(m * 100))} cm` : `${Math.round(m * 10) / 10} m`);

/** The things to look at for a part: [{ level: 'warn' | 'info', text }]. */
export function partWarnings(facts, fit, bed) {
  const out = [];
  if (!fit.fits) {
    const b = `${bed[0]} × ${bed[1]} × ${bed[2]} mm`;
    out.push({ level: 'warn', text: fit.side
      ? `Too big for your printer (${b}) as it lies. Laid on another side (${sizeText(fit.side)}) it fits.`
      : `Too big for your printer (${b}) by ${Math.ceil(fit.over)} mm, whichever way it lies.` });
  }
  const biggest = Math.max(...facts.size);
  if (biggest > 0 && biggest < 3) out.push({ level: 'warn', text: `It's only ${Math.round(biggest * 100) / 100} mm across: the file may be in inches or metres. Your slicer can scale it.` });
  const mm = (v) => String(Math.round(v * 10) / 10);
  if (facts.min && facts.min[2] > 0.05) out.push({ level: 'info', text: `It sits ${mm(facts.min[2])} mm above the bed in the file. Most slicers drop it onto the bed; check before you print.` });
  if (facts.min && facts.min[2] < -0.05) out.push({ level: 'info', text: `It goes ${mm(-facts.min[2])} mm below the bed in the file. Most slicers lift it onto the bed, but some cut that part off; check before you print.` });
  if (facts.tris && facts.onBed !== undefined && facts.onBed < 10 && biggest >= 3) out.push({ level: 'warn', text: 'As it lies it touches the bed only at a point or an edge: lay it on a flat side in your slicer, or it needs supports.' });
  if (facts.insideOut) out.push({ level: 'warn', text: 'Its surface faces inwards (inside out). Most slicers turn it round; if yours prints nothing, fix it in Maker Forge\'s model doctor.' });
  if (facts.open) out.push({ level: 'info', text: `Its surface has ${facts.open} open ${facts.open === 1 ? 'edge' : 'edges'}. Slicers usually mend small gaps; if layers look wrong, fix it in Maker Forge's model doctor.` });
  return out;
}

/** Tidy part paths kept as printed (in progress): project paths to STL or 3MF files. */
export const PRINTED_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\\:*?"<>|\n]{1,300}\.(?:stl|3mf)$/i;
