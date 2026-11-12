import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/history.js';

const tracker = () => {
  const log = [];
  const act = (n) => ({ label: n, apply: () => log.push(`+${n}`), revert: () => log.push(`-${n}`) });
  return { log, act };
};

test('do, undo and redo run in order, and a new change clears redo', () => {
  const { log, act } = tracker();
  const h = createHistory();
  h.do(act('a'));
  h.do(act('b'));
  assert.equal(h.undo(), 'b');
  assert.equal(h.redo(), 'b');
  h.undo();
  h.do(act('c'));
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo(), null);
  assert.deepEqual(log, ['+a', '+b', '-b', '+b', '-b', '+c']);
});

test('the oldest changes drop off past the limit', () => {
  const { act } = tracker();
  const h = createHistory(3);
  for (const n of ['a', 'b', 'c', 'd', 'e']) h.do(act(n));
  let undone = 0;
  while (h.undo()) undone++;
  assert.equal(undone, 3);
  assert.equal(h.canUndo(), false);
});

test('subscribers hear every change, with the labels', () => {
  const { act } = tracker();
  const h = createHistory();
  const seen = [];
  h.subscribe((s) => seen.push([s.canUndo, s.canRedo, s.undoLabel, s.redoLabel]));
  h.do(act('x'));
  h.undo();
  h.clear();
  assert.deepEqual(seen, [[true, false, 'x', null], [false, true, null, 'x'], [false, false, null, null]]);
});

test('a change that fails to apply is not recorded', () => {
  const h = createHistory();
  assert.throws(() => h.do({ label: 'bad', apply: () => { throw new Error('no'); }, revert: () => {} }));
  assert.equal(h.canUndo(), false);
});
