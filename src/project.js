// What's in a project: its sheets and its parts (design §6). From forge-project.json when the
// folder has one, otherwise worked out from the folder's files and guessed from the drawings'
// labels. No page code. A project file is untrusted: every value is checked before use.

const TYPES = { svg: 'svg', png: 'png', jpg: 'jpg', jpeg: 'jpg' };
const RANK = { svg: 0, png: 1, jpg: 2 };
const LAYOUT = /layout|perfboard|stripboard|pcb/i;

export class ProjectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
  }
}

export const PROJECT_LIMITS = { maxBytes: 1048576, maxSheets: 200, maxParts: 2000, maxText: 2000 };

const KNOWN_KEYS = new Set(['format', 'version', 'name', 'revision', 'repo', 'sheets', 'parts', 'board', 'build']);
const REF = /^[A-Za-z0-9_+.\-]{1,20}$/;
const GUESSABLE = /^[A-Z]{1,3}[0-9]{1,3}[A-Z]?$/;
const KINDS = new Set(['schematic', 'layout', 'detail', 'photo']);
const SIDES = new Set(['component', 'solder']);
const TEXT_FIELDS = ['value', 'type', 'package', 'role', 'orientation', 'note', 'part'];

const text = (v) => (typeof v === 'string' ? v.slice(0, PROJECT_LIMITS.maxText) : undefined);
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const baseName = (path) => {
  const name = path.split('/').pop();
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
};

/** A path inside the project folder: relative, no "..", no backslashes or drive letters. */
export function isSafeRelativePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 500 &&
    !path.includes('\\') && !path.includes(':') && !path.startsWith('/') &&
    !path.split('/').some((s) => s === '' || s === '.' || s === '..');
}

/**
 * @param {{ path: string, size: number, mtime: number }[]} files
 * @returns {{ id: string, label: string, path: string, type: 'svg'|'png'|'jpg', kind: string,
 *             side: string, size: number, mtime: number, missing: boolean }[]}
 */
export function sheetsFromFiles(files) {
  const best = new Map();
  for (const file of files) {
    const name = file.path.split('/').pop();
    const dot = name.lastIndexOf('.');
    if (dot <= 0) continue;
    const type = TYPES[name.slice(dot + 1).toLowerCase()];
    if (!type) continue;
    const id = name.slice(0, dot);
    const key = id.toLowerCase();
    const current = best.get(key);
    const better = !current || RANK[type] < RANK[current.type] ||
      (RANK[type] === RANK[current.type] && file.path.length < current.path.length);
    if (better) best.set(key, { id, type, path: file.path, size: file.size, mtime: file.mtime });
  }
  return [...best.values()]
    .map(({ id, type, path, size, mtime }) => ({
      id,
      label: id.replace(/_/g, ' '),
      path,
      type,
      kind: type === 'jpg' ? 'photo' : LAYOUT.test(path) ? 'layout' : 'schematic',
      side: 'component',
      size,
      mtime,
      missing: false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true, sensitivity: 'base' }));
}

function readSheet(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || !isSafeRelativePath(raw.file)) return null;
  return {
    id: raw.id,
    title: text(raw.title) || '',
    file: raw.file,
    kind: KINDS.has(raw.kind) ? raw.kind : 'schematic',
    side: SIDES.has(raw.side) ? raw.side : 'component',
  };
}

function readPart(raw) {
  if (!isObject(raw) || typeof raw.ref !== 'string' || !REF.test(raw.ref)) return null;
  const part = { ref: raw.ref, polarized: raw.polarized === true, guessed: false };
  for (const field of TEXT_FIELDS) {
    const value = text(raw[field]);
    if (value !== undefined) part[field] = value;
  }
  const datasheet = text(raw.datasheet);
  if (datasheet && datasheet.startsWith('https://')) part.datasheet = datasheet;
  if (isSafeRelativePath(raw.datasheetFile)) part.datasheetFile = raw.datasheetFile;
  if (Number.isInteger(raw.qty) && raw.qty >= 1 && raw.qty <= 100000) part.qty = raw.qty;
  return part;
}

// ---- the board and the build steps (board-view design §3), written by the project's own tools ----
const BOARD_LIMITS = { parts: 2000, pins: 100, links: 5000, linkPoints: 50, nets: 500, members: 500, steps: 200 };
const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40;
// Pins and bridges sit on holes (whole numbers); a link may bend anywhere on the board (board.py uses 30.5, 1.6).
const isPoint = (h) => Array.isArray(h) && h.length === 2 && h.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0.5 && n <= 200);
const isHole = (h) => isPoint(h) && h.every(Number.isInteger);
const hole = (h) => [h[0], h[1]];
const side = (v, fallback) => (v === 'top' || v === 'bottom' ? v : fallback);
const BUILD_WHAT = new Set(['buses', 'links', 'bridges']);
// Names come from the file: keep them in objects with no prototype, so "constructor" or
// "__proto__" are ordinary names and never reach Object.prototype.
const table = () => Object.create(null);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isOutline = (k) => Array.isArray(k) && k.length === 4 && k.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 200);
/** pcb.py's rule when the file doesn't say: a resistor spanning 4 or more holes lies flat. */
function holeSpan(pins) {
  const [a, b] = Object.values(pins);
  return b ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) : 0;
}

/** The board section, checked: anything out of range is dropped, never fatal. */
export function readBoard(raw) {
  if (!isObject(raw)) return null;
  const parts = table();
  let partCount = 0;
  for (const [ref, p] of Object.entries(isObject(raw.parts) ? raw.parts : {})) {
    if (partCount >= BOARD_LIMITS.parts) break;
    if (!REF.test(ref) || !isObject(p) || !isName(p.type) || !isObject(p.pins)) continue;
    const entries = Object.entries(p.pins);
    if (!entries.length || entries.length > BOARD_LIMITS.pins || !entries.every(([pin, h]) => isName(pin) && isHole(h))) continue;
    const pins = table();
    for (const [pin, h] of entries) pins[pin] = hole(h);
    const part = { type: p.type, pins, side: side(p.side, 'top') };
    if (isName(p.body) && own(pins, p.body)) part.body = p.body;
    if (typeof p.D === 'number' && p.D > 0 && p.D <= 50) part.D = p.D;
    if (p.round === 'up' || p.round === 'down') part.round = p.round;
    if (typeof p.half === 'number' && p.half > 0 && p.half <= 10) part.half = p.half;
    if (isOutline(p.keepout)) part.keepout = [...p.keepout];
    if (part.type === 'res') {
      part.mount = p.mount === 'flat' || p.mount === 'stand' ? p.mount : holeSpan(pins) >= 4 ? 'flat' : 'stand';
      if (part.mount === 'flat') delete part.body; // lying flat, no body over a pin
    }
    if (!own(parts, ref)) partCount++;
    parts[ref] = part;
  }
  const inRange = (n) => Number.isInteger(n) && n >= 1 && n <= 200;
  const buses = (Array.isArray(raw.buses) ? raw.buses : [])
    .filter((b) => isObject(b) && inRange(b.row) && inRange(b.from) && inRange(b.to) && isName(b.net))
    .slice(0, BOARD_LIMITS.links)
    .map((b) => ({ row: b.row, from: b.from, to: b.to, net: b.net, label: isName(b.label) ? b.label : b.net, side: side(b.side, 'bottom') }));
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l) => isObject(l) && Array.isArray(l.path) && l.path.length >= 2 && l.path.length <= BOARD_LIMITS.linkPoints && l.path.every(isPoint))
    .slice(0, BOARD_LIMITS.links)
    .map((l) => ({ path: l.path.map(hole), side: side(l.side, 'bottom') }));
  const bridges = (Array.isArray(raw.bridges) ? raw.bridges : [])
    .filter((b) => isObject(b) && Array.isArray(b.holes) && b.holes.length === 2 && b.holes.every(isHole))
    .slice(0, BOARD_LIMITS.links)
    .map((b) => ({ holes: b.holes.map(hole), side: side(b.side, 'bottom') }));
  const nets = table();
  let netCount = 0;
  for (const [name, members] of Object.entries(isObject(raw.nets) ? raw.nets : {})) {
    if (netCount >= BOARD_LIMITS.nets) break;
    if (!isName(name) || !Array.isArray(members)) continue;
    const ok = members.filter((m) => Array.isArray(m) && m.length === 2 && REF.test(m[0]) && isName(m[1])).slice(0, BOARD_LIMITS.members);
    if (!ok.length) continue;
    if (!own(nets, name)) netCount++;
    nets[name] = ok.map(([ref, pin]) => [ref, pin]);
  }
  const netLabels = table();
  for (const [name, label] of Object.entries(isObject(raw.netLabels) ? raw.netLabels : {})) {
    if (isName(name) && isName(label)) netLabels[name] = label;
  }
  for (const bus of buses) if (!netLabels[bus.net] && bus.label !== bus.net) netLabels[bus.net] = bus.label;
  const pitch = typeof raw.pitch === 'number' && raw.pitch > 0 && raw.pitch <= 10 ? raw.pitch : 2.54;
  const most = (axis) => {
    let n = 1;
    for (const p of Object.values(parts)) for (const h of Object.values(p.pins)) n = Math.max(n, Math.ceil(h[axis]));
    return n;
  };
  return {
    pitch,
    cols: inRange(raw.cols) ? raw.cols : most(0),
    rows: inRange(raw.rows) ? raw.rows : most(1),
    parts, buses, links, bridges, nets, netLabels,
  };
}

/** The build steps, checked. Parts the project doesn't know are kept but listed in `missing`. */
export function readBuild(raw, isKnown) {
  return (Array.isArray(raw) ? raw : []).filter(isObject).slice(0, BOARD_LIMITS.steps).map((step, i) => {
    const parts = (Array.isArray(step.parts) ? step.parts : []).filter((r) => typeof r === 'string' && REF.test(r)).slice(0, BOARD_LIMITS.members);
    return {
      id: isName(step.id) ? step.id : `step-${i + 1}`,
      title: text(step.title) || `Step ${i + 1}`,
      why: text(step.why) || '',
      parts,
      what: (Array.isArray(step.what) ? step.what : []).filter((w) => BUILD_WHAT.has(w)),
      missing: parts.filter((r) => !isKnown(r)),
    };
  });
}

/** What each of a part's pins connects to, from the board's netlist, in pin order. */
export function connectionsOf(board, ref) {
  if (!board) return [];
  const found = [];
  for (const [net, members] of Object.entries(board.nets)) {
    for (const [r, pin] of members) {
      if (r !== ref) continue;
      found.push({ pin, net, label: board.netLabels[net] || net, others: members.filter(([r2, p2]) => !(r2 === ref && p2 === pin)) });
    }
  }
  return found.sort((a, b) => a.pin.localeCompare(b.pin, 'en', { numeric: true }));
}

/** Reads and checks forge-project.json. Throws ProjectError with a plain-words message. */
export function parseProject(json) {
  if (json.length > PROJECT_LIMITS.maxBytes) {
    throw new ProjectError('too-big', "forge-project.json is bigger than 1 MB, so it wasn't read.");
  }
  let data;
  try {
    data = JSON.parse(json);
  } catch (error) {
    throw new ProjectError('json', `forge-project.json couldn't be read (${error.message}). Fix the file, or remove it and Bench will guess the parts.`);
  }
  if (!isObject(data) || data.format !== 'forge-project' || data.version !== 1 || typeof data.name !== 'string' || !data.name.trim()) {
    throw new ProjectError('format', 'forge-project.json isn\'t a Maker Forge project file: it needs "format": "forge-project", "version": 1 and a "name".');
  }
  const sheets = (Array.isArray(data.sheets) ? data.sheets : []).map(readSheet).filter(Boolean)
    .slice(0, PROJECT_LIMITS.maxSheets);
  const parts = [];
  const seen = new Set();
  for (const raw of Array.isArray(data.parts) ? data.parts : []) {
    const part = readPart(raw);
    if (!part || seen.has(part.ref)) continue;
    seen.add(part.ref);
    parts.push(part);
    if (parts.length === PROJECT_LIMITS.maxParts) break;
  }
  const extra = {};
  for (const [key, value] of Object.entries(data)) if (!KNOWN_KEYS.has(key)) extra[key] = value;
  const board = readBoard(data.board);
  const known = new Set([...parts.map((p) => p.ref), ...Object.keys(board ? board.parts : {})]);
  return {
    name: data.name.slice(0, PROJECT_LIMITS.maxText),
    revision: text(data.revision) || null,
    repo: text(data.repo) || null,
    sheets,
    parts,
    board,
    build: readBuild(data.build, (r) => known.has(r)),
    extra,
  };
}

/** The project's sheets first, in its order, then the folder's other drawings. */
export function sheetsForProject(project, files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const listed = [];
  for (const ps of project.sheets) {
    const type = TYPES[ps.file.split('.').pop().toLowerCase()];
    if (!type) continue;
    const file = byPath.get(ps.file);
    listed.push({
      id: ps.id,
      label: ps.title ? `${ps.id} ${ps.title}` : ps.id,
      path: ps.file,
      type,
      kind: ps.kind,
      side: ps.side,
      size: file ? file.size : 0,
      mtime: file ? file.mtime : 0,
      missing: !file,
    });
  }
  const listedPaths = new Set(project.sheets.map((s) => s.file));
  const listedNames = new Set(project.sheets.map((s) => baseName(s.file)));
  const others = sheetsFromFiles(files.filter((f) => !listedPaths.has(f.path) && !listedNames.has(baseName(f.path))));
  return [...listed, ...others];
}

/** A label's first word: "U2 ATmega328P" → "U2", "R4,R6,R7" → "R4". Drawings often put the value after the ref. */
export function firstWord(labelText) {
  return labelText.split(/[\s,]+/)[0];
}

/** The part a label stands for: the whole label, or else its first word, if that's a known ref. */
export function refOfLabel(labelText, isKnown) {
  if (isKnown(labelText)) return labelText;
  const word = firstWord(labelText);
  return word !== labelText && isKnown(word) ? word : null;
}

/**
 * Whether a label counts as done: it must be (or start with) a known ref, and every known ref it
 * names must be ticked. "U2 ATmega328P" follows U2; "U2 pin 15 → R5 → Q1 base" waits for all three.
 */
export function labelDone(labelText, isKnown, isTicked) {
  if (!isKnown(labelText) && !isKnown(firstWord(labelText))) return false;
  const refs = new Set(labelText.split(/[^A-Za-z0-9_+.\-]+/).filter((t) => t && isKnown(t)));
  if (isKnown(labelText)) refs.add(labelText);
  return refs.size > 0 && [...refs].every(isTicked);
}

/** Parts guessed from labels that start with a part name (R6, C1A, "U2 ATmega328P"), each once, in order seen. */
export function guessParts(labels) {
  const seen = new Set();
  const parts = [];
  for (const label of labels) {
    const ref = firstWord(label.text);
    if (!GUESSABLE.test(ref) || seen.has(ref)) continue;
    seen.add(ref);
    parts.push({ ref, polarized: false, guessed: true });
  }
  return parts;
}
