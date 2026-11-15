// Picking up where you left off (1.0.1, ideas 1 and 2): the last part you ticked, how long you've
// been away, and the time left at your own pace. No page code: unit-tested in Node.

const MIN = 60 * 1000;

/** The last part ticked as soldered, from the build log: { ref, t }, skipping ticks undone or unticked since. */
export function lastTick(log) {
  const cancelled = new Map();
  for (let k = (log || []).length - 1; k >= 0; k--) {
    const text = log[k].text;
    let m = /^(?:Undo Tick|Untick) (\S+)$/.exec(text);
    if (m) {
      cancelled.set(m[1], (cancelled.get(m[1]) || 0) + 1);
      continue;
    }
    m = /^(?:Redo )?Tick (\S+)$/.exec(text);
    if (!m) continue;
    if (cancelled.get(m[1])) cancelled.set(m[1], cancelled.get(m[1]) - 1);
    else return { ref: m[1], t: log[k].t };
  }
  return null;
}

/** How long since the last change in the build log, in ms (0 for an empty log). */
export function awayFor(log, now) {
  return log && log.length ? Math.max(0, now - log[log.length - 1].t) : 0;
}

/**
 * "About 50 minutes left for the 12 parts still to solder, at your pace so far.": your building time
 * divided by the parts you've ticked, times the parts left. Rounded to 5 minutes, or to 10 from an
 * hour on. Null before 3 ticked parts and 5 minutes of building, or with nothing left.
 */
export function timeLeft(spentMs, tickedCount, leftCount) {
  if (tickedCount < 3 || spentMs < 5 * MIN || leftCount <= 0) return null;
  const minutes = (spentMs / tickedCount) * leftCount / MIN;
  let words;
  const five = Math.max(5, Math.round(minutes / 5) * 5);
  if (five < 60) words = `${five} minutes`;
  else {
    const ten = Math.max(60, Math.round(minutes / 10) * 10);
    const h = Math.floor(ten / 60);
    const m = ten % 60;
    words = `${h} h${m ? ` ${m} min` : ''}`;
  }
  return `About ${words} left for the ${leftCount} ${leftCount === 1 ? 'part' : 'parts'} still to solder, at your pace so far.`;
}
