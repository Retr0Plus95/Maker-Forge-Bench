// Find by line and by value (0.4 improvements 1 and 9), and the next part in a step (11).
// No page code: unit-tested in Node.

const squash = (s) => s.toLowerCase().replace(/\s+/g, '');

/**
 * Lines whose name or label is the query (spaces and case aside), or, for three or more
 * letters, starts with it: [{ net, label, legs }].
 */
export function findLines(board, query) {
  const q = squash(query || '');
  if (!board || !q) return [];
  const found = [];
  for (const [net, members] of Object.entries(board.nets)) {
    const label = board.netLabels[net] || net;
    const names = [squash(net), squash(label)];
    if (names.includes(q) || (q.length >= 3 && names.some((n) => n.startsWith(q)))) found.push({ net, label, legs: members.length });
  }
  return found;
}

const valueKey = (v) => squash(v).replace(/ω|Ω|ohms?/gi, '');

/** Parts whose value is the query, or starts with it ("100n" finds 100 nF). The query needs a number. */
export function findValues(parts, query) {
  const q = valueKey(query || '');
  if (!/\d/.test(q)) return [];
  return parts.filter((p) => p.value && p.ref.toLowerCase() !== q && valueKey(p.value).startsWith(q));
}

/** The next part in the step after ref that isn't soldered yet, going round; null when all are. */
export function nextInStep(step, ref, ticked) {
  const parts = step.parts.filter((r) => !step.missing.includes(r));
  const start = parts.indexOf(ref);
  for (let k = 1; k <= parts.length; k++) {
    const candidate = parts[(start + k) % parts.length];
    if (candidate !== ref && !ticked.has(candidate)) return candidate;
  }
  return null;
}

/**
 * The command palette's search (0.5 extra 52): items whose label or hint has every word of the
 * query, best first (label starts with the query, then a word of it does, then anywhere).
 */
export function paletteMatch(items, query, limit = 40) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, limit);
  const q = words.join(' ');
  return items
    .map((item) => {
      const label = item.label.toLowerCase();
      const all = `${label} ${(item.hint || '').toLowerCase()}`;
      if (!words.every((w) => all.includes(w))) return null;
      const score = label.startsWith(q) ? 0 : label.split(/[\s,]+/).some((w) => w.startsWith(words[0])) ? 1 : 2;
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label, 'en', { numeric: true }))
    .slice(0, limit)
    .map((m) => m.item);
}
