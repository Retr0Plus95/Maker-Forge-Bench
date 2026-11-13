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
