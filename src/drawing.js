// Reading a drawing (1.0.3 design §5): every piece of text it holds and where it sits, then its wire
// table, its checks list and its notes, and what Bench still needs to make the steps.
// No page code: it works on any DOM Level 2 document, so it's unit-tested in Node.
import { PRINTED_PATH } from './caseparts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_TEXT = 500; // one label's characters
const MAX_TEXTS = 20000; // labels read from one sheet
const PART = /^[A-Z]{1,3}[0-9]{1,3}[A-Z]?$/; // R6, TB1, LED1, PM1: a part's name
const TAG = /^W(\d{1,3})$/; // a wire's tag on the drawing
const TEST_POINT = /^TP\d{1,3}$/;
const MAINS = /\bmains\b|\b(110|115|120|220|230|240)\s*V\b/i;
const NOTE_REF = /\bnotes?\s+(\d{1,2})\b/gi;

// ---- text with a place ----

/** [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
const IDENTITY = [1, 0, 0, 1, 0, 0];
const times = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** An SVG transform list: translate, scale, rotate, matrix, skewX and skewY. Anything else is ignored. */
export function parseTransform(value) {
  let m = IDENTITY;
  if (typeof value !== 'string') return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (let hit = re.exec(value); hit; hit = re.exec(value)) {
    const n = hit[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((v) => !Number.isFinite(v))) continue;
    let t = IDENTITY;
    if (hit[1] === 'matrix' && n.length === 6) t = n;
    else if (hit[1] === 'translate') t = [1, 0, 0, 1, n[0] || 0, n[1] || 0];
    else if (hit[1] === 'scale') t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (hit[1] === 'rotate') {
      const a = ((n[0] || 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] || 0, n[2] || 0];
      t = times(times([1, 0, 0, 1, cx, cy], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (hit[1] === 'skewX') t = [1, 0, Math.tan(((n[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (hit[1] === 'skewY') t = [1, Math.tan(((n[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = times(m, t);
  }
  return m;
}

/** The transform from an element's own space to the sheet's, its own transform included. */
function toSheet(element) {
  const chain = [];
  for (let e = element; e && e.nodeType === 1; e = e.parentNode) chain.unshift(e);
  return chain.reduce((m, e) => times(m, parseTransform(e.getAttribute('transform'))), IDENTITY);
}

const firstNumber = (v) => {
  const n = Number(String(v || '').trim().split(/[\s,]+/)[0]);
  return Number.isFinite(n) ? n : 0;
};

/** The font size an element has, from its own or an ancestor's font-size attribute or style. */
function fontSize(element) {
  for (let e = element; e && e.nodeType === 1; e = e.parentNode) {
    const attr = e.getAttribute('font-size');
    const style = /font-size\s*:\s*([\d.]+)/.exec(e.getAttribute('style') || '');
    const v = Number.parseFloat(attr || (style ? style[1] : ''));
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 10;
}

const clip = (s) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/** The letters a plotting tool draws for a label: a group of <use> or <path> shapes, no <text>. */
function isLetterGroup(e) {
  if (!e || e.nodeType !== 1 || e.localName !== 'g') return false;
  if (e.getElementsByTagNameNS(SVG_NS, 'text').length) return false;
  for (let c = e.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && (c.localName === 'use' || c.localName === 'path')) return true;
  }
  return false;
}

function nextElement(node) {
  let n = node.nextSibling;
  while (n && n.nodeType !== 1) n = n.nextSibling;
  return n;
}

/**
 * Every piece of text in a cleaned sheet, in document order, with its place in the sheet's units:
 * [{ text, x, y, size, el }]. Two kinds: <text> elements (KiCad's invisible ones too), and a comment
 * followed by the letter shapes it names, the way matplotlib keeps each label (1.0.3 design §3).
 */
export function sheetTexts(root) {
  const out = [];
  const walk = (node) => {
    for (let c = node.firstChild; c && out.length < MAX_TEXTS; c = c.nextSibling) {
      if (c.nodeType === 8) {
        const letters = nextElement(c);
        const text = clip(c.data || '');
        if (!text || !isLetterGroup(letters)) continue;
        const m = toSheet(letters);
        out.push({ text, x: m[4], y: m[5], size: scaleOf(m) * 100, el: letters });
      } else if (c.nodeType === 1) {
        if (c.localName === 'text' && c.namespaceURI === SVG_NS) {
          const text = clip(c.textContent || '');
          if (!text) continue;
          const span = c.getElementsByTagNameNS(SVG_NS, 'tspan')[0];
          const lx = c.hasAttribute('x') || !span ? firstNumber(c.getAttribute('x')) : firstNumber(span.getAttribute('x'));
          const ly = c.hasAttribute('y') || !span ? firstNumber(c.getAttribute('y')) : firstNumber(span.getAttribute('y'));
          const m = toSheet(c);
          out.push({ text, x: m[0] * lx + m[2] * ly + m[4], y: m[1] * lx + m[3] * ly + m[5], size: fontSize(c) * scaleOf(m), el: c });
        } else {
          walk(c);
        }
      }
    }
  };
  walk(root);
  return out;
}

// ---- rows and lists ----

/** Texts on one line: baselines within half a text height. Sorted top to bottom, left to right. */
export function rowsOf(texts) {
  const sorted = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const t of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(t.y - row.y) <= Math.max(row.size, t.size) * 0.5) {
      row.texts.push(t);
    } else {
      rows.push({ y: t.y, size: t.size, texts: [t] });
    }
  }
  for (const row of rows) row.texts.sort((a, b) => a.x - b.x);
  return rows;
}

const HEADERS = {
  from: /^(from|från)$/i,
  to: /^(to|till)$/i,
  no: /^(w|no\.?|nr\.?|#|wire\s*no\.?|wire\s*#)$/i,
  wire: /^(wire|cable|size|kabel|area)$/i,
  note: /^(notes?|anm\.?|comment)$/i,
  colour: /^(colou?r|färg)$/i,
  length: /^(length|längd|mm)$/i,
  at: /^(at|where|grid|var)$/i,
};

/**
 * The rows under a header or a title, cell by cell: texts that start under one of the columns, one
 * row after another while they keep coming at about the same spacing and size.
 * columns: [{ key, x }]; returns [[{ key, text, t }]].
 */
function rowsUnder(texts, top, columns, size, { gapTimes = 2.6 } = {}) {
  const tol = Math.max(size * 1.6, 3);
  const columnOf = (t) => {
    let best = null;
    for (const c of columns) {
      const d = Math.abs(t.x - c.x);
      if (d <= tol && (!best || d < best.d)) best = { key: c.key, d };
    }
    return best ? best.key : null;
  };
  // a bigger text under the columns (the next list's title) ends this one
  const inColumns = texts.filter((t) => t.y > top + size * 0.5 && columnOf(t));
  const title = Math.min(Infinity, ...inColumns.filter((t) => t.size > size * 1.2).map((t) => t.y));
  const rows = rowsOf(inColumns.filter((t) => t.y < title - size * 0.5 && t.size >= size * 0.8 && t.size <= size * 1.2));
  const out = [];
  let last = top;
  let spacing = null;
  for (const row of rows) {
    const gap = row.y - last;
    if (gap > (spacing ? spacing * gapTimes : size * 4)) break;
    if (spacing === null) spacing = Math.max(gap, size);
    out.push(row.texts.map((t) => ({ key: columnOf(t), text: t.text, t })));
    last = row.y;
  }
  return out;
}

/** "U1 OUT +" → { ref: 'U1', end: 'OUT +' }; "M1 red, LED1 +" → two ends. */
export function endsOf(cell) {
  return String(cell || '').split(/\s*,\s*/).map((piece) => piece.trim()).filter(Boolean).map((piece) => {
    const [first, ...rest] = piece.split(/\s+/);
    return PART.test(first) ? { ref: first, end: rest.join(' '), text: piece } : { ref: null, end: piece, text: piece };
  });
}

/** The volts a check expects: "24–27 V" → { min: 24, max: 27 }; "≈ 20 V", "12.0 V" → one value. Null when none. */
export function expectedVolts(text) {
  const s = String(text || '').replace(/,(?=\d)/g, '.');
  const range = /(\d+(?:\.\d+)?)\s*(?:–|-|to|→)\s*≈?\s*(\d+(?:\.\d+)?)\s*V\b/i.exec(s);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const one = /(\d+(?:\.\d+)?)\s*V\b/i.exec(s);
  return one ? { min: Number(one[1]), max: Number(one[1]) } : null;
}

const notesIn = (text) => [...String(text || '').matchAll(NOTE_REF)].map((m) => Number(m[1]));

/** The wire table: a row with a From and a To header, and the rows under it. Null when there's none. */
export function readWireTable(texts) {
  for (const row of rowsOf(texts)) {
    const columns = [];
    for (const t of row.texts) {
      const key = Object.keys(HEADERS).find((k) => HEADERS[k].test(t.text));
      if (key && !columns.some((c) => c.key === key)) columns.push({ key, x: t.x, t });
    }
    if (!columns.some((c) => c.key === 'from') || !columns.some((c) => c.key === 'to')) continue;
    const rows = rowsUnder(texts, row.y, columns, row.size);
    const used = new Set([...columns.map((c) => c.t), ...rows.flat().map((c) => c.t)]);
    const wires = rows.map((cells, i) => {
      const get = (key) => cells.filter((c) => c.key === key).map((c) => c.text).join(' ').trim();
      const no = get('no').replace(/^W/i, '');
      const wire = {
        no: /^\d{1,3}$/.test(no) ? no : String(i + 1),
        from: get('from'),
        to: get('to'),
        wire: [get('wire'), get('colour'), get('length')].filter(Boolean).join(' · '),
        note: get('note'),
      };
      wire.id = `W${wire.no}`;
      wire.fromEnds = endsOf(wire.from);
      wire.toEnds = endsOf(wire.to);
      wire.notes = notesIn(wire.note);
      wire.mains = MAINS.test(wire.wire) || MAINS.test(wire.note);
      return wire;
    }).filter((w) => w.from || w.to || w.wire || w.note);
    return { wires, used, header: row };
  }
  return null;
}

/** A titled list (checks, notes): the title, then rows of a key column and a text column. */
function titledList(texts, title, keyTest) {
  // the first title with a list under it ("NOTE" heading a table column has none)
  for (const head of texts.filter((t) => title.test(t.text))) {
    const list = listUnder(texts, head, keyTest);
    if (list && list.items.length) return list;
  }
  return null;
}

function listUnder(texts, head, keyTest) {
  const size = head.size;
  // the columns: the key starts under the title, the text is the next column to its right
  const near = texts.filter((t) => t.y > head.y && t.y < head.y + size * 8 && t !== head);
  const keys = near.filter((t) => keyTest(t.text) && Math.abs(t.x - head.x) <= Math.max(size * 1.6, 3));
  if (!keys.length) return null;
  const keyX = keys[0].x;
  const right = near.filter((t) => t.x > keyX + 1 && Math.abs(t.y - keys[0].y) <= size).sort((a, b) => a.x - b.x)[0];
  if (!right) return null;
  const rows = rowsUnder(texts, head.y, [{ key: 'key', x: keyX }, { key: 'text', x: right.x }], keys[0].size, { gapTimes: 4 });
  const items = [];
  const used = new Set([head]);
  for (const cells of rows) {
    const key = cells.filter((c) => c.key === 'key' && keyTest(c.text)).map((c) => c.text).join(' ');
    const words = cells.filter((c) => c.key === 'text').map((c) => c.text).join(' ');
    for (const c of cells) used.add(c.t);
    if (key) items.push({ key, text: words, t: cells[0].t });
    else if (items.length && words) items[items.length - 1].text = `${items[items.length - 1].text} ${words}`.trim();
  }
  return { items, used };
}

/** The checks list: a title with "check", rows of a short key (OFF, TP1, LIMIT) and a sentence. */
export function readChecks(texts) {
  const list = titledList(texts, /\bchecks?\b/i, (s) => /^[A-Z][A-Z0-9+\-]{0,7}$/.test(s));
  if (!list) return null;
  return {
    checks: list.items.map((it, i) => ({
      i, key: it.key, text: it.text, tp: TEST_POINT.test(it.key) ? it.key : null, volts: expectedVolts(it.text),
    })),
    used: list.used,
  };
}

/** The notes list: a title "notes", a number on its own, and the lines to its right. */
export function readNotes(texts) {
  const list = titledList(texts, /^notes?$/i, (s) => /^\d{1,2}$/.test(s));
  if (!list) return null;
  return { notes: list.items.map((it) => ({ n: Number(it.key), text: it.text })), used: list.used };
}

/** The question a note asks, up to its first "?": "Which AC24V screws?". Null when it asks none. */
export function questionOf(text) {
  const at = String(text || '').indexOf('?');
  if (at < 0) return null;
  const before = text.slice(0, at + 1);
  const start = Math.max(before.lastIndexOf('. ') + 1, before.lastIndexOf(': ') + 1, 0);
  return before.slice(start).trim();
}

/**
 * Everything one sheet says about the wiring: { sheetId, wires, checks, notes, tags, testPoints,
 * partRefs, readable }. tags and testPoints: Map name → [text]; partRefs: Set of part names drawn
 * outside the tables (a mention anywhere counts).
 */
export function readDrawing(sheetId, texts) {
  const table = readWireTable(texts);
  const checks = readChecks(texts);
  const notes = readNotes(texts);
  const used = new Set([...(table ? table.used : []), ...(checks ? checks.used : []), ...(notes ? notes.used : [])]);
  const tags = new Map();
  const testPoints = new Map();
  const partRefs = new Set();
  for (const t of texts) {
    if (table && table.used.has(t)) continue;
    const words = t.text.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (TAG.test(t.text)) {
      if (!tags.has(t.text)) tags.set(t.text, []);
      tags.get(t.text).push(t);
      continue;
    }
    if (TEST_POINT.test(t.text) && !(checks && checks.used.has(t))) {
      if (!testPoints.has(t.text)) testPoints.set(t.text, []);
      testPoints.get(t.text).push(t);
      continue;
    }
    for (const w of words) if (PART.test(w)) partRefs.add(w);
  }
  return {
    sheetId,
    readable: texts.length > 0,
    wires: table ? table.wires : [],
    hasTable: Boolean(table),
    checks: checks ? checks.checks : [],
    notes: notes ? notes.notes : [],
    tags,
    testPoints,
    partRefs,
    used,
  };
}

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * What Bench still needs, from every sheet's reading (1.0.3 design §4.3), in the order to deal with
 * them: [{ id, kind, sheetId, text, wires: [id], question, fixInDrawing }]. o: { hasBoard, shapes:
 * [sheetId] (SVGs with nothing to read), labelOf(sheetId), partsFound }.
 */
export function drawingNeeds(reads, o = {}) {
  const needs = [];
  const labelOf = o.labelOf || ((id) => id);
  const add = (need) => needs.push({ wires: [], question: null, fixInDrawing: true, ...need });
  for (const r of reads) {
    if (!r.hasTable) continue;
    const s = r.sheetId;
    const seen = new Map();
    for (const w of r.wires) seen.set(w.id, (seen.get(w.id) || 0) + 1);
    for (const [id, n] of seen) {
      if (n > 1) add({ id: `repeat:${s}:${id}`, kind: 'repeat', sheetId: s, wires: [id], text: `${id} is in the wire table ${n} times: check the numbers.` });
    }
    for (const w of r.wires) {
      const missing = [!w.from && '"from"', !w.to && '"to"'].filter(Boolean);
      if (missing.length) add({ id: `noend:${s}:${w.id}`, kind: 'noend', sheetId: s, wires: [w.id], text: `${w.id} has no ${missing.join(' or ')} in the wire table.` });
    }
    const undrawn = new Map();
    for (const w of r.wires) {
      for (const e of [...w.fromEnds, ...w.toEnds]) {
        if (e.ref && !r.partRefs.has(e.ref)) {
          if (!undrawn.has(e.ref)) undrawn.set(e.ref, []);
          if (!undrawn.get(e.ref).includes(w.id)) undrawn.get(e.ref).push(w.id);
        }
      }
    }
    for (const [ref, ws] of undrawn) {
      add({ id: `undrawn:${s}:${ref}`, kind: 'undrawn', sheetId: s, wires: ws, text: `${ref} is in the wire table (${list(ws)}) but drawn nowhere else: check its name.` });
    }
    const ids = [...new Set(r.wires.map((w) => w.id))];
    const untagged = ids.filter((id) => !r.tags.has(id));
    if (untagged.length === ids.length && ids.length) {
      add({ id: `notag:${s}`, kind: 'notag', sheetId: s, wires: ids, text: 'The wires have no tags (W1, W2...) on the drawing, so Show can only ring the parts at their ends.' });
    } else if (untagged.length) {
      add({ id: `notag:${s}`, kind: 'notag', sheetId: s, wires: untagged, text: `${list(untagged)} ${plural(untagged.length, 'has', 'have')} no tag on the drawing, so Show can only ring the parts at ${plural(untagged.length, 'its', 'their')} ends.` });
    }
    const extra = [...r.tags.keys()].filter((tag) => !ids.includes(tag)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (extra.length) {
      add({ id: `extratag:${s}`, kind: 'extratag', sheetId: s, text: `${list(extra)} ${plural(extra.length, 'is', 'are')} on the drawing but not in the wire table.` });
    }
    for (const note of r.notes) {
      const question = questionOf(note.text);
      const ws = r.wires.filter((w) => w.notes.includes(note.n)).map((w) => w.id);
      if (question && ws.length) {
        add({ id: `ask:${s}:${note.n}`, kind: 'ask', sheetId: s, wires: ws, question, fixInDrawing: false, text: `Note ${note.n} asks "${question}" before ${list(ws)}.` });
      }
    }
  }
  for (const r of reads) {
    const s = r.sheetId;
    const checked = new Set(r.checks.filter((c) => c.tp).map((c) => c.tp));
    const unchecked = [...r.testPoints.keys()].filter((tp) => !checked.has(tp)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (unchecked.length && r.checks.length) {
      add({ id: `tpcheck:${s}`, kind: 'tpcheck', sheetId: s, text: `${list(unchecked)} ${plural(unchecked.length, 'is', 'are')} on the drawing, but no check says what ${plural(unchecked.length, 'it', 'they')} should read.` });
    }
    for (const c of r.checks) {
      if (c.tp && !c.volts) add({ id: `reading:${s}:${c.tp}`, kind: 'reading', sheetId: s, text: `The ${c.tp} check doesn't say what it should read.` });
    }
  }
  if (!o.hasBoard) {
    for (const s of o.shapes || []) {
      add({ id: `shapes:${s}`, kind: 'shapes', sheetId: s, text: `${labelOf(s)}: its text is drawn as shapes, so Bench can't read it. It needs the drawing saved with its text kept as text.` });
    }
    const readable = reads.filter((r) => r.readable);
    if (readable.length && !reads.some((r) => r.hasTable)) {
      const found = o.partsFound ? `found ${o.partsFound} ${plural(o.partsFound, 'part', 'parts')} on the drawings but` : 'can read the drawings but found';
      add({ id: 'notable', kind: 'notable', sheetId: readable[0].sheetId, text: `Bench ${found} no wire table, so it can't list which wires go where. It needs a table with From and To columns on a drawing.` });
    }
  }
  return needs;
}

/** The wire list as plain text, for copying. */
export function wiresText(read, done, label) {
  const lines = [`Wires from ${label}: ${read.wires.filter((w) => done.has(`${read.sheetId}#${w.id}`)).length} of ${read.wires.length} done`];
  for (const w of read.wires) {
    const extra = [w.wire, w.note].filter(Boolean).join(' · ');
    lines.push(`  [${done.has(`${read.sheetId}#${w.id}`) ? 'x' : ' '}] ${w.id}  ${w.from || '?'} → ${w.to || '?'}${extra ? `   ${extra}` : ''}`);
  }
  return lines.join('\n');
}

const KEY = /^[^\s#]{1,200}#W\d{1,3}$/;
const NEED = /^[a-z]{2,10}(:[^\n]{1,200})?$/;
const STEP = /^readme:[a-z0-9-]{1,60}:\d{1,4}$/; // a README step ticked (1.0.4)
const SAFETY_LINE = /^(unplugged|fuse|covered|apart|clamp|earth|beep)$/; // readme.js SAFETY

/** The drawing's progress read back from storage or a file: anything odd is dropped. */
export function cleanDrawingProgress(raw) {
  const out = { done: [], answers: {}, dismissed: [], steps: [], safety: [], printed: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (Array.isArray(raw.printed)) out.printed = [...new Set(raw.printed.filter((k) => typeof k === 'string' && PRINTED_PATH.test(k)))].slice(0, 500); // case parts printed (1.0.5)
  if (Array.isArray(raw.steps)) out.steps = [...new Set(raw.steps.filter((k) => typeof k === 'string' && STEP.test(k)))].slice(0, 2000);
  if (Array.isArray(raw.safety)) out.safety = [...new Set(raw.safety.filter((k) => typeof k === 'string' && SAFETY_LINE.test(k)))];
  if (Array.isArray(raw.done)) out.done = [...new Set(raw.done.filter((k) => typeof k === 'string' && KEY.test(k)))].slice(0, 5000);
  if (Array.isArray(raw.dismissed)) out.dismissed = [...new Set(raw.dismissed.filter((k) => typeof k === 'string' && NEED.test(k)))].slice(0, 2000);
  if (raw.answers && typeof raw.answers === 'object' && !Array.isArray(raw.answers)) {
    const answers = Object.create(null);
    for (const [k, v] of Object.entries(raw.answers).slice(0, 2000)) {
      if (NEED.test(k) && typeof v === 'string' && v.trim()) answers[k] = v.trim().slice(0, 500);
    }
    out.answers = answers;
  }
  return out;
}

/** True for the part names a reading says are wire tags or test points, not parts. */
export function notAPart(reads) {
  const names = new Set();
  for (const r of reads) {
    if (r.hasTable) for (const w of r.wires) names.add(w.id);
    if (r.hasTable) for (const tag of r.tags.keys()) names.add(tag);
    for (const c of r.checks) if (c.tp) names.add(c.tp);
    if (r.checks.length) for (const tp of r.testPoints.keys()) names.add(tp);
  }
  return (ref) => names.has(ref);
}
