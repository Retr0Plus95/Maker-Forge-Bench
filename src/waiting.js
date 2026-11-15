// "I don't have this one yet" (1.0.1, idea 8): parts you're waiting for leave their step and come
// back in a Waiting for parts step at the end. Kept with your progress as a list of refs.
// No page code: unit-tested in Node.

const LIMIT = 2000;
export const WAITING_STEP = 'waiting';

/** Saved waiting parts, checked: refs only, each once. */
export function cleanWaiting(raw, isRef) {
  return [...new Set((Array.isArray(raw) ? raw : []).filter((r) => typeof r === 'string' && isRef(r)))].slice(0, LIMIT);
}

/**
 * The parts waiting now: marked and not soldered (ticking one means it came), and still in the
 * project (known(ref)).
 */
export function waitingNow(waiting, ticked, known = () => true) {
  return new Set([...(waiting || [])].filter((r) => !ticked.has(r) && known(r)));
}

/**
 * The steps you follow, with waiting parts taken out of theirs and put in a last step,
 * { id: 'waiting', title: 'Waiting for parts', parts, from: { ref: its step's title } }.
 * A step whose parts are all waiting is left out until they come.
 */
export function withWaiting(steps, waiting) {
  if (!waiting || !waiting.size) return steps;
  const out = [];
  const parts = [];
  const from = {};
  for (const s of steps) {
    const mine = s.parts.filter((r) => waiting.has(r));
    if (!mine.length) {
      out.push(s);
      continue;
    }
    for (const r of mine) {
      if (from[r]) continue;
      from[r] = s.title;
      parts.push(r);
    }
    const left = s.parts.filter((r) => !waiting.has(r));
    if (left.some((r) => !s.missing.includes(r))) out.push({ ...s, parts: left });
  }
  for (const r of waiting) if (!parts.includes(r)) parts.push(r);
  out.push({
    id: WAITING_STEP, title: 'Waiting for parts', parts, missing: [], what: [], from, waiting: true,
    why: 'Parts you marked "I don\'t have this one yet". Solder each when it comes: ticking it takes it off this list.',
  });
  return out;
}
