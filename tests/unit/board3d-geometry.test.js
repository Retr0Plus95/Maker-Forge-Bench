import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_THICKNESS, partGeometry } from '../../src/board3d-geometry.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const body = (ref) => partGeometry(board.parts[ref], board.pitch, ref).find((p) => p.role === 'body');

test('a standing resistor stands over its body hole', () => {
  const b = body('R8');
  assert.equal(b.kind, 'cyl');
  assert.ok(near(b.x, 63.5) && near(b.y, 12.7), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [1.3, 6.5]);
});

test('an electrolytic can sits between its pins, sized by its diameter', () => {
  const b = body('C1A');
  assert.equal(b.kind, 'cyl');
  assert.ok(near(b.x, 12.7) && near(b.y, 5.08), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [4, 11.5]);
});

test('the DIP socket covers its pins', () => {
  const b = body('U2');
  assert.equal(b.kind, 'box');
  assert.ok(near(b.x, 41.91) && near(b.y, 26.67), `${b.x},${b.y}`);
  assert.ok(near(b.w, 36.22) && near(b.d, 10.82), `${b.w}x${b.d}`);
});

test('underside parts hang below the board', () => {
  for (const ref of ['C5', 'C8', 'C9', 'Y1']) {
    for (const p of partGeometry(board.parts[ref], board.pitch, ref)) {
      if (p.kind === 'wire') continue;
      assert.ok(p.z0 < 0 && p.z0 + p.h <= -BOARD_THICKNESS + 1e-9, `${ref} ${p.role}`);
    }
  }
});

test('every fume extractor part gets a body, and unknown types a plain box', () => {
  for (const [ref, part] of Object.entries(board.parts)) assert.ok(body(ref), ref);
  const odd = partGeometry({ type: 'mystery', pins: { 1: [2, 2], 2: [4, 2] }, side: 'top' }, 2.54, 'X1');
  assert.equal(odd.find((p) => p.role === 'body').kind, 'box');
});
