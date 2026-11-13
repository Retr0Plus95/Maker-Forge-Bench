import test from 'node:test';
import assert from 'node:assert/strict';
import { continuitySummary, continuityTests, faultText } from '../../src/continuity.js';
import { parseProject } from '../../src/project.js';
import { exportProgress, importProgress } from '../../src/checklist.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const tests = continuityTests(board);

test('every line is tested leg to leg: it should beep', () => {
  const beeps = tests.filter((t) => t.kind === 'beep');
  const expected = Object.values(board.nets).filter((m) => m.length >= 2).reduce((n, m) => n + m.length - 1, 0);
  assert.equal(beeps.length, expected);
  assert.ok(beeps.some((t) => t.line === '+5 V' && [t.a.text, t.b.text].includes('U2 pin 7')));
});

test("neighbouring chip pins on different lines must not beep, but not two pins of one line", () => {
  const shorts = tests.filter((t) => t.kind === 'nobeep');
  assert.ok(shorts.some((t) => t.a.text === 'U2 pin 7' && t.b.text === 'U2 pin 8'), 'VCC next to GND');
  assert.ok(!shorts.some((t) => t.a.text === 'U2 pin 2'), 'pin 2 is not connected to anything');
  assert.ok(shorts.every((t) => t.a.ref === t.b.ref));
  assert.ok(shorts.some((t) => t.a.ref === 'J5'), 'headers too');
});

test('a wrong answer says what it means', () => {
  const beep = tests.find((t) => t.kind === 'beep');
  assert.match(faultText(beep), /No connection between .* a joint or a wire is missing/);
  const short = tests.find((t) => t.kind === 'nobeep');
  assert.match(faultText(short), /Short between .* solder bridge/);
});

test('the summary: done, faults, and the next test', () => {
  const results = { [tests[0].id]: 'pass', [tests[1].id]: 'fail' };
  const s = continuitySummary(tests, results);
  assert.equal(s.done, 2);
  assert.equal(s.total, tests.length);
  assert.deepEqual(s.faults.map((t) => t.id), [tests[1].id]);
  assert.equal(s.next.id, tests[2].id);
  assert.deepEqual(continuityTests(null), []);
});

test('progress files carry the continuity results', () => {
  const text = exportProgress({ project: 'x', revision: null, ticked: [], sheetPrints: {}, flipped: [], continuity: { a: 'pass', b: 'fail' } });
  assert.deepEqual(importProgress(text).continuity, { a: 'pass', b: 'fail' });
  const bad = JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [], continuity: { a: 'maybe', b: 5 } });
  assert.deepEqual(importProgress(bad).continuity, {});
});
