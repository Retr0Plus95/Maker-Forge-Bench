import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWaiting, waitingNow, withWaiting } from '../../src/waiting.js';
import { exportProgress, importProgress } from '../../src/checklist.js';

const step = (id, title, parts, extra = {}) => ({ id, title, parts, missing: [], what: [], ...extra });
const steps = [step('one', 'One', ['R1', 'R2']), step('two', 'Two', ['R3']), step('links', 'Links', [], { what: ['links'] })];

test('a waiting part leaves its step for a Waiting for parts step at the end', () => {
  const out = withWaiting(steps, new Set(['R2', 'R3']));
  assert.deepEqual(out.map((s) => s.id), ['one', 'links', 'waiting']);
  assert.deepEqual(out[0].parts, ['R1']);
  const w = out[2];
  assert.equal(w.title, 'Waiting for parts');
  assert.deepEqual(w.parts, ['R2', 'R3']);
  assert.deepEqual(w.from, { R2: 'One', R3: 'Two' });
  assert.match(w.why, /I don't have this one yet/);
  assert.deepEqual(w.missing, []);
});

test('nothing waiting: the steps as they were; a step with nothing to tick stays', () => {
  const out = withWaiting(steps, new Set());
  assert.equal(out.length, 3);
  out.forEach((s, i) => assert.equal(s, steps[i]));
  assert.deepEqual(withWaiting(steps, new Set(['R1'])).map((s) => s.id), ['one', 'two', 'links', 'waiting']);
});

test("a waiting part that's in no step still comes in the Waiting step", () => {
  const w = withWaiting(steps, new Set(['R9'])).at(-1);
  assert.deepEqual(w.parts, ['R9']);
  assert.deepEqual(w.from, {});
});

test('a part counts as waiting while it is marked and not soldered', () => {
  assert.deepEqual([...waitingNow(['R2'], new Set(['R2']))], []);
  assert.deepEqual([...waitingNow(['R2', 'R3'], new Set(['R2']))], ['R3']);
  assert.deepEqual([...waitingNow(['R2', 'R3'], new Set(), (r) => r !== 'R3')], ['R2'], 'parts no longer in the project are left out');
});

test('waiting parts saved and read back, checked', () => {
  const isRef = (r) => /^[A-Za-z0-9_+.\-]{1,20}$/.test(r);
  assert.deepEqual(cleanWaiting(['R1', 'R1', 'bad ref!', 5, 'C2'], isRef), ['R1', 'C2']);
  assert.deepEqual(cleanWaiting(null, isRef), []);
  const base = { project: 'p', revision: '1', ticked: [], sheetPrints: {}, flipped: [] };
  assert.deepEqual(importProgress(exportProgress({ ...base, waiting: ['R6', 'not a ref!'] })).waiting, ['R6']);
  assert.deepEqual(importProgress(JSON.stringify({ format: 'bench-progress', version: 1, ...base })).waiting, [], 'an older file still opens');
});
