// Bench 1.0.4 "How to build it" (docs/design/2026-11-20-release-1.0.4-design.md): the project's README.md
// read into blocks, its build sections into steps, the drawing's wires of each step, a crop of the drawing
// for a step's picture, what's wrong or missing, and Bench's own mains safety list. No page code.

export const MAX_README = 256 * 1024;
export const MAX_BLOCKS = 5000;

// ---- Markdown, the small part READMEs use ----

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const ALIGN = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const QUOTE = /^ {0,3}>\s?/;

const blank = (line) => !line.trim();
const indentOf = (line) => line.match(/^ */)[0].length;

function cells(line) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { cur += '|'; i++; } else if (line[i] === '|') { parts.push(cur); cur = ''; } else cur += line[i];
  }
  parts.push(cur);
  const trimmed = line.trim();
  if (trimmed.startsWith('|')) parts.shift();
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) parts.pop();
  return parts.map((c) => c.trim());
}

/** True for a line that starts a block of its own (so a paragraph stops before it). */
function startsBlock(line, next) {
  return HEADING.test(line) || RULE.test(line) || FENCE.test(line) || QUOTE.test(line) || ITEM.test(line) ||
    (line.trim().startsWith('|') && next !== undefined && ALIGN.test(next));
}

/**
 * Markdown into blocks: { t:'h', level, text } · { t:'p', text } · { t:'list', ordered, start, items:[{ blocks }] } ·
 * { t:'table', head, rows } · { t:'quote', blocks } · { t:'code', text } · { t:'hr' }. Text is kept as written
 * (read it with inline()); HTML is never markup. At most MAX_BLOCKS blocks in all.
 */
export function parseMarkdown(text) {
  const budget = { left: MAX_BLOCKS };
  return blocksOf(String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), budget);
}

function blocksOf(lines, budget) {
  const out = [];
  let i = 0;
  const push = (b) => {
    if (budget.left <= 0) return false;
    budget.left--;
    out.push(b);
    return true;
  };
  while (i < lines.length && budget.left > 0) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = line.match(FENCE))) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(m[1])) body.push(lines[i++]);
      i++;
      push({ t: 'code', text: body.join('\n') });
    } else if ((m = line.match(HEADING))) {
      push({ t: 'h', level: m[1].length, text: m[2].trim() });
      i++;
    } else if (RULE.test(line)) {
      push({ t: 'hr' });
      i++;
    } else if (line.trim().startsWith('|') && i + 1 < lines.length && ALIGN.test(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      push({ t: 'table', head, rows });
    } else if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && !blank(lines[i]) && (QUOTE.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))) body.push(lines[i++].replace(QUOTE, ''));
      if (budget.left > 0) {
        budget.left--;
        out.push({ t: 'quote', blocks: blocksOf(body, budget) });
      }
    } else if ((m = line.match(ITEM))) {
      i = listAt(lines, i, budget, out);
    } else {
      const body = [line.trim()];
      i++;
      while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) body.push(lines[i++].trim());
      push({ t: 'p', text: body.join(' ') });
    }
  }
  return out;
}

/** A list from line i: its items, each read as blocks of its own. Gives the line after it. */
function listAt(lines, i, budget, out) {
  const first = lines[i].match(ITEM);
  const ordered = /\d/.test(first[2]);
  const list = { t: 'list', ordered, start: ordered ? Number.parseInt(first[2], 10) : 1, items: [] };
  budget.left--;
  out.push(list);
  const base = first[1].length;
  while (i < lines.length && budget.left > 0) {
    const m = lines[i].match(ITEM);
    if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
    const pad = m[1].length + m[2].length + Math.min(Math.max(m[3].length, 1), 4);
    const body = [m[4]];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (blank(line)) {
        let j = i;
        while (j < lines.length && blank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= pad) {
          for (; i < j; i++) body.push('');
          continue;
        }
        break;
      }
      if (indentOf(line) >= pad) {
        body.push(line.slice(pad));
        i++;
      } else if (!startsBlock(line, lines[i + 1]) && body.length && !blank(body[body.length - 1])) {
        body.push(line.trim()); // a lazy line: still the item's paragraph
        i++;
      } else {
        break;
      }
    }
    list.items.push({ blocks: blocksOf(body, budget) });
    let j = i;
    while (j < lines.length && blank(lines[j])) j++;
    const next = j < lines.length && lines[j].match(ITEM);
    if (!next || next[1].length !== base || /\d/.test(next[2]) !== ordered) break;
    i = j;
  }
  return i;
}

// ---- inside a line ----

const TOKENS = [
  ['code', /`([^`\n]+)`/],
  ['img', /!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/],
  ['link', /\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/],
  ['b', /\*\*(?=\S)(.+?)\*\*|(?<![\w])__(?=\S)(.+?)__(?![\w])/],
  ['i', /\*(?=[^\s*])(.+?)\*|(?<![\w])_(?=[^\s_])(.+?)_(?![\w])/],
];

const plain = (text) => inline(text).map((r) => (r.t === 'img' ? r.alt : r.text)).join('');

/**
 * A line into runs: { t:'text'|'b'|'i'|'code', text } · { t:'link', text, href } · { t:'img', alt, src }.
 * Bold and italic hold plain text (what's inside them is flattened). Anything else, HTML too, is text.
 */
export function inline(text) {
  const runs = [];
  const add = (run) => {
    const last = runs[runs.length - 1];
    if (run.t === 'text' && last && last.t === 'text') last.text += run.text;
    else if (run.t !== 'text' || run.text) runs.push(run);
  };
  let rest = String(text || '');
  while (rest) {
    let best = null;
    for (const [t, re] of TOKENS) {
      const m = rest.match(re);
      if (m && (!best || m.index < best.m.index)) best = { t, m };
    }
    if (!best) { add({ t: 'text', text: rest }); break; }
    const { t, m } = best;
    add({ t: 'text', text: rest.slice(0, m.index) });
    if (t === 'code') add({ t, text: m[1] });
    else if (t === 'img') add({ t, alt: m[1], src: m[2] });
    else if (t === 'link') add({ t, text: plain(m[1]), href: m[2] });
    else add({ t, text: plain(m[1] ?? m[2]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return runs;
}

// ---- the guide ----

const ROLES = [
  ['safety', /\bsafety\b|\bwarnings?\b/],
  ['trouble', /troubleshoot/],
  ['power', /power[- ]?(up|on)\b|first (power|start|switch)|\btesting\b|bring[- ]?up/],
  ['assembly', /assembl|putting it together|build order|how to build/],
  ['wiring', /\bwir(e|es|ing)\b/],
];
const READ_ONLY = new Set(['safety', 'trouble']);

/** All the text of some blocks, as plain words. */
export function blocksText(blocks) {
  return blocks.map((b) => {
    if (b.t === 'p' || b.t === 'h') return plain(b.text);
    if (b.t === 'code') return b.text;
    if (b.t === 'list') return b.items.map((it) => blocksText(it.blocks)).join(' ');
    if (b.t === 'quote') return blocksText(b.blocks);
    if (b.t === 'table') return [b.head, ...b.rows].map((r) => r.map(plain).join(' ')).join(' ');
    return '';
  }).join(' ');
}

/** Every inline run of some blocks, with the text before each (for a short bold word). */
function runsOf(blocks, out = []) {
  for (const b of blocks) {
    if (b.t === 'p' || b.t === 'h') out.push(inline(b.text));
    else if (b.t === 'list') for (const it of b.items) runsOf(it.blocks, out);
    else if (b.t === 'quote') runsOf(b.blocks, out);
    else if (b.t === 'table') for (const r of [b.head, ...b.rows]) for (const c of r) out.push(inline(c));
  }
  return out;
}

/** The bold words a step leans on: 3 to 40 characters with a letter, or a short one with the word before it. */
function termsOf(blocks) {
  const terms = [];
  for (const runs of runsOf(blocks)) {
    runs.forEach((r, k) => {
      if (r.t !== 'b') return;
      const word = r.text.trim().replace(/[:.,;]+$/, '').trim();
      if (!word) return;
      if (word.length >= 3 && word.length <= 40 && /\p{L}/u.test(word)) terms.push(word);
      else if (word.length <= 2) {
        const before = k > 0 && runs[k - 1].t === 'text' ? runs[k - 1].text.match(/([\p{L}\p{N}]+)\s+$/u) : null;
        if (before) terms.push(`${before[1]} ${word}`);
      }
    });
  }
  return [...new Set(terms)];
}

/** A section's short title: its heading's words before any bracket or colon. */
const titleOf = (heading) => plain(heading).split(/\s[(:—–-]\s?|\(/)[0].trim() || plain(heading);

/**
 * The README's build sections, in its order: { sections: [{ role, kind:'steps'|'read', slug, heading, title,
 * level, before, steps, after }] }; a step is { id:'readme:<slug>:<n>', n, blocks, text, named, terms }.
 */
export function readGuide(text) {
  const blocks = parseMarkdown(text);
  const sections = [];
  let cur = null;
  const seen = {};
  for (const b of blocks) {
    if (b.t === 'h') {
      const role = b.level >= 2 && b.level <= 3 ? (ROLES.find(([, re]) => re.test(plain(b.text).toLowerCase())) || [null])[0] : null;
      if (cur && b.level <= cur.level) cur = null;
      if (role && (!cur || b.level > cur.level)) {
        seen[role] = (seen[role] || 0) + 1;
        cur = { role, level: b.level, heading: b.text, title: titleOf(b.text), slug: seen[role] > 1 ? `${role}-${seen[role]}` : role, blocks: [] };
        sections.push(cur);
        continue;
      }
      if (!cur) continue;
    }
    if (cur) cur.blocks.push(b);
  }
  return {
    sections: sections.map(({ blocks: body, ...s }) => {
      const at = READ_ONLY.has(s.role) ? -1 : body.findIndex((b) => b.t === 'list' && b.ordered);
      if (at < 0) return { ...s, kind: 'read', before: body, steps: [], after: [] };
      const list = body[at];
      const steps = list.items.map((it, k) => {
        const n = list.start + k;
        const words = blocksText(it.blocks);
        return { id: `readme:${s.slug}:${n}`, n, blocks: it.blocks, text: words, named: [...new Set(words.match(/\bW\d{1,3}\b/g) || [])], terms: termsOf(it.blocks) };
      });
      return { ...s, kind: 'steps', before: body.slice(0, at), steps, after: body.slice(at + 1) };
    }),
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWords = (hay, term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(hay);

/**
 * The drawing's wires a step is about: [{ sheetId, wire, by }]. Those it names (by: null); when it names
 * none and it's a wiring step, those whose ends hold one of its bold words on whole words (by: the word).
 */
export function stepWires(step, role, reads) {
  const tables = reads.filter((r) => r.hasTable);
  const out = [];
  const seen = new Set();
  const add = (r, wire, by) => {
    const key = `${r.sheetId}#${wire.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sheetId: r.sheetId, wire, by });
  };
  for (const id of step.named) for (const r of tables) for (const w of r.wires) if (w.id === id) add(r, w, null);
  if (step.named.length || role !== 'wiring') return out;
  for (const r of tables) {
    for (const w of r.wires) {
      const ends = [norm(w.from), norm(w.to)];
      const term = step.terms.find((t) => ends.some((e) => hasWords(e, norm(t))));
      if (term) add(r, w, term);
    }
  }
  return out;
}

/** Every picture in the blocks a guide shows. */
function picturesOf(blocks, out = []) {
  for (const runs of runsOf(blocks)) for (const r of runs) if (r.t === 'img') out.push(r.src);
  return out;
}

/** True for an address on the web (never loaded) rather than a file of the project. */
export const isWeb = (src) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(src);

/** A picture's path in the project, from the README's folder. */
export function pathFrom(readmePath, src) {
  const parts = String(readmePath || '').split('/').slice(0, -1);
  const raw = String(src).split(/[?#]/)[0];
  let file = raw;
  try { file = decodeURI(raw); } catch { /* a badly written address is kept as written */ }
  for (const p of file.replace(/^\.\//, '').split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}

/** Each step's wires, for a whole guide: Map step id → [{ sheetId, wire, by }]. */
export function guideWires(guide, reads) {
  const map = new Map();
  for (const s of guide.sections) for (const st of s.steps) map.set(st.id, stepWires(st, s.role, reads));
  return map;
}

/**
 * What's wrong or missing between the README, the drawing and the folder: [{ id, kind, text }].
 * hasFile(path) says whether a file is in the project; readmePath places the README's pictures.
 */
export function guideNeeds(guide, reads, hasFile, readmePath = 'README.md') {
  const needs = [];
  const tables = reads.filter((r) => r.hasTable);
  const onDrawing = new Set(tables.flatMap((r) => r.wires.map((w) => w.id)));
  const wires = guideWires(guide, reads);
  if (tables.length) {
    for (const s of guide.sections) {
      for (const st of s.steps) {
        for (const id of st.named) {
          if (!onDrawing.has(id)) needs.push({ id: `readme:wire:${st.id}:${id}`, kind: 'wire', text: `Step ${st.n} of ${s.title} names ${id}, which isn't on the drawing.` });
        }
      }
    }
  }
  const shown = guide.sections.flatMap((s) => [...s.before, ...s.steps.flatMap((st) => st.blocks), ...s.after]);
  for (const src of new Set(picturesOf(shown))) {
    if (isWeb(src)) continue;
    const path = pathFrom(readmePath, src);
    if (!hasFile(path)) needs.push({ id: `readme:pic:${path}`.slice(0, 200), kind: 'pic', text: `The README shows ${path}, which isn't in the folder.` });
  }
  const used = new Set([...wires.values()].flat().map((x) => `${x.sheetId}#${x.wire.id}`));
  if (used.size) {
    const left = tables.flatMap((r) => r.wires.filter((w) => !used.has(`${r.sheetId}#${w.id}`)).map((w) => w.id));
    const list = [...new Set(left)];
    if (list.length) {
      needs.push({ id: 'readme:left', kind: 'left', text: `No step mentions ${list.join(', ')}. ${list.length === 1 ? "It's" : "They're"} in the Wiring tab.` });
    }
  }
  return needs;
}

/**
 * Where to crop the drawing for a step's picture: around the tags of its wires and the labels of the parts at
 * their ends, padded, wider than high, inside the sheet's box { x, y, w, h }. Null when none is on the drawing.
 */
export function cropFor(read, texts, wireIds, box) {
  const labels = [];
  for (const id of wireIds) {
    labels.push(...(read.tags.get(id) || []));
    const wire = read.wires.find((w) => w.id === id);
    if (!wire) continue;
    for (const ref of new Set([...wire.fromEnds, ...wire.toEnds].map((e) => e.ref).filter(Boolean))) {
      const t = texts.find((x) => !read.used.has(x) && x.text.split(' ')[0] === ref);
      if (t) labels.push(t);
    }
  }
  if (!labels.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const t of labels) {
    const size = t.size || 5;
    x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x + size * 0.6 * t.text.length);
    y0 = Math.min(y0, t.y - size); y1 = Math.max(y1, t.y);
  }
  const pad = Math.max(box.w, box.h) / 25;
  let w = Math.max(x1 - x0 + 2 * pad, box.w / 6);
  let h = Math.max(y1 - y0 + 2 * pad, box.h / 6);
  if (w < h * 1.6) w = h * 1.6; else h = Math.max(h, w / 2.5);
  w = Math.min(w, box.w); h = Math.min(h, box.h);
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
  const x = Math.min(Math.max(cx - w / 2, box.x), box.x + box.w - w);
  const y = Math.min(Math.max(cy - h / 2, box.y), box.y + box.h - h);
  const r = (v) => Math.round(v * 10) / 10;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

// ---- mains safety ----

/** True when words talk about mains: "mains", or 110–240 V. */
export const mentionsMains = (text) => /\bmains\b|\b(?:100|110|115|120|220|230|240)\s?V(?:AC|~)?(?![\p{L}\p{N}])/iu.test(String(text || ''));

/** Bench's own list before mains work (design §6.5). */
export const SAFETY = Object.freeze([
  { id: 'unplugged', text: 'Unplugged: the plug is out of the wall, not just switched off.' },
  { id: 'fuse', text: 'Fuse first: the fuse sits in the mains wire before the switch.' },
  { id: 'covered', text: 'Every mains joint covered: heat-shrink over it, no bare copper showing.' },
  { id: 'apart', text: 'Mains kept apart: tied down, away from the low-voltage wires and the board.' },
  { id: 'clamp', text: "Cable held: clamped where it comes in, so a pull can't reach the joints." },
  { id: 'earth', text: "Metal you can touch goes to the plug's earth pin. (A plastic case with a double-insulated transformer needs no earth.)" },
  { id: 'beep', text: 'Before you plug in, with the plug out and the meter on beep: the mains pins to anything low-voltage are silent.' },
]);
export const SAFETY_IDS = new Set(SAFETY.map((s) => s.id));

// ---- which file ----

/** The project's README: README.md (any case) at the top, else the one in the shallowest folder. */
export function pickReadme(files) {
  const found = files.map((f) => f.path).filter((p) => /(^|\/)readme\.md$/i.test(p));
  found.sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : a > b ? 1 : 0));
  return found[0] || null;
}
