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

const KNOWN_KEYS = new Set(['format', 'version', 'name', 'revision', 'repo', 'sheets', 'parts']);
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
  return {
    name: data.name.slice(0, PROJECT_LIMITS.maxText),
    revision: text(data.revision) || null,
    repo: text(data.repo) || null,
    sheets,
    parts,
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
