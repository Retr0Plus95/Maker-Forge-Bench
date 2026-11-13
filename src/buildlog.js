// History (0.5 big improvement B10): the build log (what you did, when) and named versions of your
// progress; and the build report (improvement 47). No page code: unit-tested in Node.

export const LOG_LIMIT = 2000;
const GAP = 15 * 60 * 1000; // a pause longer than this isn't counted as building time

/** Adds an entry, keeping the newest LOG_LIMIT. */
export function logAdd(log, text, t = Date.now()) {
  const next = [...log, { t, text }];
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
}

/** Entries from storage or a file, checked. */
export function cleanLog(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((e) => e && typeof e === 'object' && Number.isFinite(e.t) && e.t > 0 && typeof e.text === 'string' && e.text.length > 0 && e.text.length <= 300)
    .slice(-LOG_LIMIT)
    .map((e) => ({ t: e.t, text: e.text }));
}

/** Building time: the gaps between entries shorter than 15 minutes, in ms; since = only entries after it. */
export function timeSpent(log, since = 0) {
  let total = 0;
  for (let k = 1; k < log.length; k++) {
    if (log[k].t < since) continue;
    const gap = log[k].t - log[k - 1].t;
    if (gap > 0 && gap <= GAP) total += gap;
  }
  return total;
}

/** "1 h 25 min", "12 min", "under a minute" */
export function duration(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'under a minute';
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

/** When a part was last ticked as soldered, from the log (its "Tick R8" entries), or null. */
export function solderedAt(log, ref) {
  for (let k = log.length - 1; k >= 0; k--) {
    if (log[k].text === `Tick ${ref}` || log[k].text === `Redo Tick ${ref}`) return log[k].t;
    if (log[k].text === `Untick ${ref}`) return null;
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
export const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** The log as text, newest first. */
export function logText(log) {
  return [...log].reverse().map((e) => `${day(e.t)} ${clock(e.t)}  ${e.text}`).join('\n');
}

export const VERSION_LIMIT = 20;

/** Saved versions, checked: [{ name, at, data }] (data is checked again when restored). */
export function cleanVersions(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((v) => v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim() && v.name.length <= 80 && Number.isFinite(v.at) && v.data && typeof v.data === 'object')
    .slice(0, VERSION_LIMIT)
    .map((v) => ({ name: v.name.trim(), at: v.at, data: v.data }));
}

/** Adds a version at the front; the same name replaces the older one; at most VERSION_LIMIT. */
export function addVersion(versions, name, data, at = Date.now()) {
  const clean = name.trim().slice(0, 80) || `Version ${versions.length + 1}`;
  return [{ name: clean, at, data }, ...versions.filter((v) => v.name !== clean)].slice(0, VERSION_LIMIT);
}

/**
 * The build report (Markdown): soldered, wired, steps, checks before power, continuity, notes,
 * your board and time spent. s: everything needed, already worked out by the page.
 */
export function buildReport(s) {
  const lines = [
    `# Build report: ${s.project}${s.revision ? ` (${s.revision})` : ''}`,
    '',
    `Made by Maker Forge Bench on ${day(s.now)} at ${clock(s.now)}.`,
    '',
    '## Progress',
    `- Soldered: ${s.soldered} of ${s.parts} parts`,
    `- Wired: ${s.wired} of ${s.legs} legs`,
    `- Steps done: ${s.stepsDone} of ${s.steps}`,
    `- Checks before power: ${s.checksDone} of ${s.checks}`,
    `- Continuity test: ${s.continuityDone} of ${s.continuity} pairs, ${s.faults.length} ${s.faults.length === 1 ? 'fault' : 'faults'}`,
    `- Your board: ${s.placed} of ${s.boardParts} parts placed on your photos`,
    `- Time spent: ${duration(s.time)}`,
    '',
  ];
  if (s.unsoldered.length) lines.push('## Not soldered yet', s.unsoldered.join(', '), '');
  if (s.faults.length) lines.push('## Continuity faults', ...s.faults.map((f) => `- ${f}`), '');
  const notes = Object.entries(s.notes);
  if (notes.length) lines.push('## Your notes', ...notes.map(([ref, text]) => `- **${ref.replace(/^step\./, 'Step ')}**: ${text}`), '');
  return lines.join('\n');
}
