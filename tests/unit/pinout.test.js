import test from 'node:test';
import assert from 'node:assert/strict';
import { pinLayout } from '../../src/pinout.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const at = (layout, pin) => layout.pins.find((p) => p.pin === pin);

test('a DIP seen from the top: pin 1 top left, down to 14, up the right side to 28', () => {
  const l = pinLayout(board.parts.U2, 'top');
  assert.equal(l.kind, 'dip');
  assert.equal(l.pins.length, 28);
  assert.deepEqual([at(l, '1').col, at(l, '1').row], [0, 0]);
  assert.deepEqual([at(l, '14').col, at(l, '14').row], [0, 13]);
  assert.deepEqual([at(l, '15').col, at(l, '15').row], [1, 13]);
  assert.deepEqual([at(l, '28').col, at(l, '28').row], [1, 0]);
  assert.equal(at(l, '7').labelSide, 'left');
  assert.equal(at(l, '22').labelSide, 'right');
  assert.equal(l.rows, 14);
});

test('underneath, the two rows swap sides', () => {
  const l = pinLayout(board.parts.U2, 'bottom');
  assert.deepEqual([at(l, '1').col, at(l, '1').row], [1, 0]);
  assert.deepEqual([at(l, '28').col, at(l, '28').row], [0, 0]);
  assert.equal(at(l, '7').labelSide, 'right');
  assert.equal(at(l, '20').labelSide, 'left');
});

test('a header is one row, pin 1 first', () => {
  const l = pinLayout(board.parts.J5, 'top');
  assert.equal(l.kind, 'row');
  assert.deepEqual(l.pins.map((p) => p.pin), ['1', '2', '3', '4', '5', '6']);
  assert.ok(l.pins.every((p, i) => p.col === 0 && p.row === i));
});

test('parts with fewer than three pins have no pin view', () => {
  assert.equal(pinLayout(board.parts.R8, 'top'), null);
  assert.equal(pinLayout(null, 'top'), null);
});

test('any other part with three or more pins lists its pins in order', () => {
  const l = pinLayout(board.parts.Q1, 'top');
  assert.equal(l.kind, 'row');
  assert.deepEqual(l.pins.map((p) => p.pin), ['E', 'B', 'C']);
});
