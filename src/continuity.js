// The guided continuity test (0.5 big improvement B6): the multimeter's beep test, one probe pair at
// a time, made from the project's own netlist. No page code: unit-tested in Node.
import { pinText, wiringGroups } from './wiring.js';
import { pinLayout } from './pinout.js';

const leg = (ref, pin) => ({ ref, pin, text: `${ref} ${pinText(pin)}` });

/**
 * The tests: [{ id, kind: 'beep' | 'nobeep', a, b, line }].
 * - beep: each leg of a line against the next one: they must be joined.
 * - nobeep: neighbouring pins of a chip or header that sit on different lines: a solder bridge
 *   between them is the most common perfboard fault.
 */
export function continuityTests(board) {
  if (!board) return [];
  const tests = [];
  for (const g of wiringGroups(board)) {
    for (let k = 1; k < g.members.length; k++) {
      const a = g.members[k - 1];
      const b = g.members[k];
      tests.push({ id: `beep:${a.key}|${b.key}`, kind: 'beep', a: leg(a.ref, a.pin), b: leg(b.ref, b.pin), line: g.label });
    }
  }
  const netOf = new Map();
  for (const [net, members] of Object.entries(board.nets)) for (const [ref, pin] of members) netOf.set(`${ref}:${pin}`, net);
  for (const [ref, part] of Object.entries(board.parts)) {
    const layout = pinLayout(part, 'top');
    if (!layout) continue;
    const byPlace = new Map(layout.pins.map((p) => [`${p.col}:${p.row}`, p.pin]));
    for (const p of layout.pins) {
      const next = byPlace.get(`${p.col}:${p.row + 1}`);
      if (!next) continue;
      const n1 = netOf.get(`${ref}:${p.pin}`);
      const n2 = netOf.get(`${ref}:${next}`);
      if (!n1 || !n2 || n1 === n2) continue;
      tests.push({ id: `nobeep:${ref}:${p.pin}|${ref}:${next}`, kind: 'nobeep', a: leg(ref, p.pin), b: leg(ref, next), line: '' });
    }
  }
  return tests;
}

/** What a wrong answer means, in plain words. */
export function faultText(test) {
  return test.kind === 'beep'
    ? `No connection between ${test.a.text} and ${test.b.text} (${test.line}): a joint or a wire is missing. Reflow both joints and check the wire between them.`
    : `Short between ${test.a.text} and ${test.b.text}: look for a solder bridge between these neighbouring pins.`;
}

/** Where the test stands: { done, total, faults: [test], next: test | null }. results: { id: 'pass' | 'fail' } */
export function continuitySummary(tests, results) {
  const done = tests.filter((t) => results[t.id]).length;
  const faults = tests.filter((t) => results[t.id] === 'fail');
  return { done, total: tests.length, faults, next: tests.find((t) => !results[t.id]) || null };
}
