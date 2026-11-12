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

test('Q1 is drawn round side up, as on sheet 4: its flat face points down the board', () => {
  assert.equal(body('Q1').facing, 'down');
});

test('the buck module sits on its taped-down outline, not over D1 and C1', () => {
  const b = body('U1');
  const [x1, y1, x2, y2] = [(0.6 - 1) * 2.54, (7.4 - 1) * 2.54, (9.3 - 1) * 2.54, (14.1 - 1) * 2.54];
  assert.ok(near(b.x, (x1 + x2) / 2) && near(b.y, (y1 + y2) / 2), `${b.x},${b.y}`);
  assert.ok(near(b.w, x2 - x1) && near(b.d, y2 - y1), `${b.w}x${b.d}`);
});

test('the fan headers are the tall white 4-pin kind', () => {
  const b = body('J2');
  assert.equal(b.colour, '#ececec');
  assert.equal(b.h, 6);
});

test('a flat resistor lies flat, a standing one stands, whatever its span', () => {
  assert.equal(body('R4').kind, 'hcyl');
  const flat = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [1, 3] }, mount: 'flat' }, 2.54).find((p) => p.role === 'body');
  assert.equal(flat.kind, 'hcyl');
  const stand = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [1, 6] }, mount: 'stand', body: '1' }, 2.54).find((p) => p.role === 'body');
  assert.equal(stand.kind, 'cyl');
});

test("the buck module's four wires reach the module from their holes", () => {
  const prims = partGeometry(board.parts.U1, board.pitch, 'U1');
  const b = prims.find((p) => p.role === 'body');
  const wires = prims.filter((p) => p.role === 'wire');
  assert.equal(wires.length, 4);
  for (const w of wires) {
    const [x, y] = w.points.at(-1);
    assert.ok(Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.d / 2, `ends on the module: ${x},${y}`);
  }
});
