// The build checklist's data: progress files and "this sheet changed" notes (design §7.7).
// No page code. A progress file is untrusted: it's checked before anything is used.
import { cleanMyBoard } from './myboard.js';
import { cleanLog } from './buildlog.js';

export class ProgressError extends Error {
  constructor() {
    super("That file isn't Bench progress.");
    this.name = 'ProgressError';
  }
}

const MAX_BYTES = 1048576;
const REF = /^[A-Za-z0-9_+.\-]{1,20}$/;
const isStringList = (v, test) => Array.isArray(v) && v.length <= 5000 && v.every((x) => typeof x === 'string' && test(x));
const shortString = (x) => x.length > 0 && x.length <= 200;

/** A sheet file's fingerprint: if it differs later, the drawing changed. */
export function sheetPrint(sheet) {
  return `${sheet.size}:${sheet.mtime}`;
}

export function exportProgress({ project, revision, ticked, sheetPrints, flipped, wired = [], myBoard = null, notes = {}, checks = [], continuity = {}, log = [] }) {
  return JSON.stringify({ format: 'bench-progress', version: 1, project, revision, ticked, sheetPrints, flipped, wired, myBoard, notes, checks, continuity, log }, null, 2);
}

// Fields added after 0.3 are optional: a file without them, or with bad entries, still opens.
const MAX_WIRED = 20000;
const notesMap = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([ref, text]) => REF.test(ref) && typeof text === 'string' && text.length > 0 && text.length <= 2000).slice(0, 5000))
  : {});
const continuityMap = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([id, r]) => id.length <= 200 && (r === 'pass' || r === 'fail')).slice(0, 20000))
  : {});
const wiredList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 100).slice(0, MAX_WIRED) : []);

export function importProgress(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new ProgressError();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProgressError();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== 'bench-progress' || data.version !== 1) {
    throw new ProgressError();
  }
  const prints = data.sheetPrints;
  if (!isStringList(data.ticked, (x) => REF.test(x)) || !isStringList(data.flipped, shortString) ||
      !prints || typeof prints !== 'object' || Array.isArray(prints) ||
      !Object.entries(prints).every(([k, v]) => shortString(k) && typeof v === 'string' && v.length <= 100)) {
    throw new ProgressError();
  }
  const optional = (v) => (typeof v === 'string' && v.length <= 2000 ? v : null);
  return {
    project: optional(data.project),
    revision: optional(data.revision),
    ticked: [...data.ticked],
    sheetPrints: { ...prints },
    flipped: [...data.flipped],
    wired: wiredList(data.wired),
    myBoard: cleanMyBoard(data.myBoard, (r) => REF.test(r)),
    notes: notesMap(data.notes),
    checks: wiredList(data.checks).slice(0, 1000),
    continuity: continuityMap(data.continuity),
    log: cleanLog(data.log),
  };
}

/** One note per sheet whose file changed since the progress was saved, when anything is ticked. */
export function changedSince(sheetPrints, sheets, tickedCount) {
  if (!tickedCount) return [];
  const parts = tickedCount === 1 ? 'part' : 'parts';
  return sheets
    .filter((s) => sheetPrints[s.id] !== undefined && sheetPrints[s.id] !== sheetPrint(s))
    .map((s) => `Sheet ${s.label} changed since you ticked ${tickedCount} ${parts}: check them.`);
}

// ---- a board file (0.6 design §3): your board alone, to keep or move to another computer ----
export class BoardFileError extends Error {
  constructor() {
    super("That file isn't a Bench board file.");
    this.name = 'BoardFileError';
  }
}

/** Your photos' line-ups, placements, wire shapes and hole names. The photos stay in your folder. */
export function exportBoard({ project, revision, myBoard }) {
  return JSON.stringify({ format: 'bench-board', version: 1, project, revision, myBoard }, null, 2);
}

/** A board file, or a progress file's board, checked: { project, myBoard }. */
export function importBoard(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new BoardFileError();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BoardFileError();
  }
  const known = data && typeof data === 'object' && !Array.isArray(data) && data.version === 1
    && (data.format === 'bench-board' || data.format === 'bench-progress');
  if (!known || !data.myBoard || typeof data.myBoard !== 'object') throw new BoardFileError();
  return {
    project: typeof data.project === 'string' && data.project.length <= 2000 ? data.project : null,
    myBoard: cleanMyBoard(data.myBoard, (r) => REF.test(r)),
  };
}
