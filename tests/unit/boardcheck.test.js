import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlacement, placedLegs, suggestAll, suggestWires, wireText } from '../../src/boardcheck.js';
import { cleanMyBoard } from '../../src/myboard.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const isRef = (r) => /^[A-Za-z0-9_+.-]{1,20}$/.test(r);

test('placed legs: the anchor from the project, the rest from your taps', () => {
  const legs = placedLegs(board, { R8: { 1: [30, 2], 2: [30, 4] } }, 'U2');
  assert.equal(legs.length, 30);
  assert.deepEqual(legs.find((l) => l.key === 'R8:2').hole, [30, 4]);
});

test('two legs in one hole is a problem', () => {
  const f = checkPlacement(board, { R8: { 1: [11, 13], 2: [11, 15] } }, 'U2'); // R8 pin 1 on U2 pin 1's hole
  const clash = f.find((x) => x.kind === 'clash');
  assert.ok(clash, JSON.stringify(f.map((x) => x.kind)));
  assert.match(clash.text, /Two legs in one hole: .*U2 pin 1.*R8 pin 1|Two legs in one hole: .*R8 pin 1.*U2 pin 1/);
  assert.equal(clash.level, 'problem');
});

test('bodies on top of each other are a problem; far apart they are fine', () => {
  const near = checkPlacement(board, { C1A: { p: [30, 2], n: [30, 4] }, C1B: { p: [31, 2], n: [31, 4] } }, 'U2');
  assert.ok(near.some((x) => x.kind === 'overlap' && x.refs.includes('C1A') && x.refs.includes('C1B')));
  const far = checkPlacement(board, { C1A: { p: [30, 2], n: [30, 4] }, C1B: { p: [40, 2], n: [40, 4] } }, 'U2');
  assert.ok(!far.some((x) => x.kind === 'overlap'));
});

test('different lines on neighbouring holes is a warning; everything not placed is listed', () => {
  // R8 pin 1 (+5 V) right next to U2 pin 1 (RST)
  const f = checkPlacement(board, { R8: { 1: [10, 13], 2: [10, 16] } }, 'U2');
  const w = f.find((x) => x.kind === 'neighbours');
  assert.ok(w && w.level === 'warning', JSON.stringify(f.map((x) => x.kind)));
  assert.match(w.text, /solder these carefully/);
  const todo = f.find((x) => x.kind === 'unplaced');
  assert.ok(todo.refs.includes('C10') && !todo.refs.includes('R8') && !todo.refs.includes('U2'));
});

test('suggested wires: the shortest tree, L-shaped, both ways or straight', () => {
  const legs = [{ key: 'A:1', ref: 'A', pin: '1', hole: [1, 1] }, { key: 'B:1', ref: 'B', pin: '1', hole: [4, 3] }, { key: 'C:1', ref: 'C', pin: '1', hole: [4, 9] }];
  const cols = suggestWires(legs, 'cols');
  assert.equal(cols.length, 2);
  assert.deepEqual(cols[0].path, [[1, 1], [4, 1], [4, 3]]);
  assert.deepEqual(cols[1].path, [[4, 3], [4, 9]], 'already in line: one straight piece');
  assert.deepEqual(suggestWires(legs, 'rows')[0].path, [[1, 1], [1, 3], [4, 3]]);
  assert.deepEqual(suggestWires(legs, 'straight')[0].path, [[1, 1], [4, 3]]);
  assert.equal(wireText(cols[0]), 'A pin 1 to B pin 1: 3 holes across, 2 down');
  assert.deepEqual(suggestWires(legs.slice(0, 1)), []);
});

test('suggestions for every line with two or more placed legs, each with its shape', () => {
  const placed = { C10: { p: [16, 8], n: [16, 6] }, R8: { 1: [20, 8], 2: [20, 6] } };
  const all = suggestAll(board, placed, 'U2', { P5V: 'rows' });
  const five = all.find((g) => g.net === 'P5V');
  assert.ok(five && five.shape === 'rows' && five.wires.length >= 2, JSON.stringify(all.map((g) => g.net)));
  assert.ok(all.every((g) => g.wires.length === new Set(g.wires.flatMap((w) => [w.from.key, w.to.key])).size - 1));
});

test('the chosen wire shapes are kept with your board, checked', () => {
  const clean = cleanMyBoard({ anchor: 'U2', photos: {}, placed: {}, routes: { P5V: 'rows', GND: 'zigzag', ['x'.repeat(50)]: 'cols' } }, isRef);
  assert.deepEqual(clean.routes, { P5V: 'rows' });
});

test("with hole names, findings and wires say where on your board", async () => {
  const { labelsMap, holeName } = await import('../../src/holenames.js');
  const map = labelsMap({ a: { pin: '1', text: 'L21' }, b: { pin: '14', text: 'L8' }, c: { pin: '28', text: 'O21' } }, board.parts.U2);
  const name = (h) => holeName(map, h);
  const clash = checkPlacement(board, { R8: { 1: [11, 13], 2: [11, 15] } }, 'U2', name).find((x) => x.kind === 'clash');
  assert.match(clash.text, /^Two legs in one hole \(L21\): /);
  const near = checkPlacement(board, { R8: { 1: [10, 13], 2: [10, 16] } }, 'U2', name).find((x) => x.kind === 'neighbours');
  assert.match(near.text, /\(L22\)/);
  assert.match(near.text, /\(L21\)/);
  const legs = [{ key: 'U2:7', ref: 'U2', pin: '7', hole: [17, 13] }, { key: 'C10:p', ref: 'C10', pin: 'p', hole: [19, 14] }];
  assert.equal(wireText(suggestWires(legs)[0], name), 'U2 pin 7 (L15) to C10 + (K13): 2 holes across, 1 down');
});
