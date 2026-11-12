// The text index behind Find part (design §7.3). No page code.
// Every <text> counts, including invisible ones: KiCad 9 writes each label as <text opacity="0">
// over the lines it draws.

const SVG_NS = 'http://www.w3.org/2000/svg';
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** @returns {{ sheetId: string, text: string, el: Element }[]} in document order */
export function indexSheet(sheetId, root) {
  const labels = [];
  for (const el of Array.from(root.getElementsByTagNameNS(SVG_NS, 'text'))) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) labels.push({ sheetId, text, el });
  }
  return labels;
}

/** True when the query appears in the text as a whole token: no letter or digit right before or after. */
export function matchesQuery(text, query) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const t = text.toLowerCase();
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    const before = i === 0 ? '' : t[i - 1];
    const after = t[i + q.length] ?? '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

/** @returns {{ total: number, bySheet: Map<string, { sheetId: string, text: string, el: Element }[]> }} */
export function search(labels, query) {
  const bySheet = new Map();
  let total = 0;
  for (const label of labels) {
    if (!matchesQuery(label.text, query)) continue;
    if (!bySheet.has(label.sheetId)) bySheet.set(label.sheetId, []);
    bySheet.get(label.sheetId).push(label);
    total++;
  }
  return { total, bySheet };
}
