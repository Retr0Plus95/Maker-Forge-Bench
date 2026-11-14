// Your own build steps (0.8 design §3): the project's steps in your order, some skipped, with steps
// of your own added. Kept with your progress as { order, skipped, added }. No page code: unit-tested.

export const NO_EDITS = Object.freeze({ order: [], skipped: [], added: [] });
const LIMITS = { ids: 300, added: 100, title: 120, text: 1000 };
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 60;
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Saved changes, checked: anything odd is dropped. */
export function cleanStepEdits(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { order: [], skipped: [], added: [] };
  const ids = (v) => [...new Set((Array.isArray(v) ? v : []).filter(isId))].slice(0, LIMITS.ids);
  const added = (Array.isArray(raw.added) ? raw.added : [])
    .filter((a) => a && typeof a === 'object' && isId(a.id) && text(a.title, LIMITS.title))
    .slice(0, LIMITS.added)
    .map((a) => ({ id: a.id, title: text(a.title, LIMITS.title), text: text(a.text, LIMITS.text) }));
  return { order: ids(raw.order), skipped: ids(raw.skipped), added };
}

export const hasEdits = (edits) => Boolean(edits && (edits.order.length || edits.skipped.length || edits.added.length));

/** Every step in your order: the project's ({ ...step, skipped }) and your own ({ id, title, why, own: true }). */
export function stepsWithEdits(build, edits) {
  const e = edits || NO_EDITS;
  const byId = new Map(build.map((s) => [s.id, s]));
  for (const a of e.added) if (!byId.has(a.id)) byId.set(a.id, { id: a.id, title: a.title, why: a.text, parts: [], what: [], missing: [], own: true });
  const order = [...new Set(e.order)].filter((id) => byId.has(id));
  // a step the project added since: after the step before it in the project
  build.forEach((s, i) => {
    if (order.includes(s.id)) return;
    let at = 0;
    for (let k = i - 1; k >= 0; k--) {
      const prev = order.indexOf(build[k].id);
      if (prev >= 0) { at = prev + 1; break; }
    }
    order.splice(at, 0, s.id);
  });
  for (const a of e.added) if (!order.includes(a.id)) order.push(a.id);
  const skipped = new Set(e.skipped);
  return order.map((id) => ({ ...byId.get(id), skipped: skipped.has(id), own: Boolean(byId.get(id).own) }));
}

const withOrder = (edits, order) => ({ ...(edits || NO_EDITS), order });

/** Moves a step delta places (−1 up, +1 down) in your order. */
export function moveStep(build, edits, id, delta) {
  const order = stepsWithEdits(build, edits).map((s) => s.id);
  const from = order.indexOf(id);
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  if (from < 0 || to === from) return edits || NO_EDITS;
  order.splice(from, 1);
  order.splice(to, 0, id);
  return withOrder(edits, order);
}

/** Skips a step (on) or brings it back. */
export function setSkipped(edits, id, on) {
  const e = edits || NO_EDITS;
  const skipped = e.skipped.filter((s) => s !== id);
  if (on) skipped.push(id);
  return { ...e, skipped };
}

/** Adds a step of your own after afterId (at the end without one): { edits, id }, or null without a title. */
export function addOwnStep(build, edits, { title, text: body }, afterId) {
  const t = text(title, LIMITS.title);
  if (!t) return null;
  const e = edits || NO_EDITS;
  const taken = new Set([...build.map((s) => s.id), ...e.added.map((a) => a.id)]);
  let n = e.added.length + 1;
  while (taken.has(`own-${n}`)) n++;
  const id = `own-${n}`;
  const order = stepsWithEdits(build, e).map((s) => s.id);
  const after = afterId ? order.indexOf(afterId) : -1;
  order.splice(after >= 0 ? after + 1 : order.length, 0, id);
  return { edits: { ...e, order, added: [...e.added, { id, title: t, text: text(body, LIMITS.text) }] }, id };
}

/** Takes a step of your own out. */
export function removeOwnStep(edits, id) {
  const e = edits || NO_EDITS;
  return { order: e.order.filter((s) => s !== id), skipped: e.skipped.filter((s) => s !== id), added: e.added.filter((a) => a.id !== id) };
}
