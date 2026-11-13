import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_THICKNESS, partGeometry } from '../../src/board3d-geometry.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const body = (ref) => partGeometry(board.parts[ref], board.pitch, ref).find((p) => p.role === 'body');

test('a standing resistor stands over its body hole, at its datasheet size (6.3 × 2.4 mm)', () => {
  const b = body('R8');
  assert.equal(b.kind, 'cyl');
  assert.ok(near(b.x, 63.5) && near(b.y, 12.7), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [1.2, 6.3]);
});

test('an electrolytic can sits between its pins, sized by its diameter', () => {
  const b = body('C1A');
  assert.equal(b.kind, 'cyl');
  assert.ok(near(b.x, 12.7) && near(b.y, 5.08), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [4, 11.5]);
});

test('the chip is a real PDIP-28 (34.7 × 7.2 × 3.3 mm) sitting in its socket over its pins', () => {
  const b = body('U2');
  assert.equal(b.kind, 'box');
  assert.ok(near(b.x, 41.91) && near(b.y, 26.67), `${b.x},${b.y}`);
  assert.ok(Math.abs(b.w - 34.7) < 0.3 && near(b.d, 7.2) && near(b.h, 3.3), `${b.w}x${b.d}x${b.h}`);
  const prims = partGeometry(board.parts.U2, board.pitch, 'U2', { value: 'ATmega328P-PU' });
  assert.equal(prims.filter((p) => p.role === 'socket').length, 4, 'two rails and two ends');
  assert.equal(prims.filter((p) => p.role === 'leg').length, 28);
  assert.ok(prims.some((p) => p.role === 'notch') && prims.some((p) => p.role === 'dot'));
  assert.equal(prims.find((p) => p.kind === 'print').text, 'ATMEGA328P-PU');
  assert.equal(prims.filter((p) => p.kind === 'joint').length, 28, 'a solder joint under every leg');
});

test('underside parts hang below the board, with no joints of their own', () => {
  for (const ref of ['C5', 'C8', 'C9', 'Y1']) {
    for (const p of partGeometry(board.parts[ref], board.pitch, ref, { value: '100 nF' })) {
      assert.notEqual(p.kind, 'joint', ref);
      if (p.kind === 'wire') continue;
      const topZ = p.kind === 'hcyl' ? p.z + p.radius : p.kind === 'print' ? p.z : p.z0 + p.h;
      assert.ok(topZ <= -BOARD_THICKNESS + 1e-9, `${ref} ${p.role} ${topZ}`);
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

test('the fan headers are the white 4-pin kind with a back wall and its ramp (Molex KK 254)', () => {
  const prims = partGeometry(board.parts.J2, board.pitch, 'J2');
  assert.equal(body('J2').colour, '#ececec');
  const wall = prims.find((p) => p.role === 'wall');
  assert.ok(wall && wall.z0 + wall.h > 11, 'about 11.4 mm tall');
  assert.ok(prims.some((p) => p.role === 'ramp'));
  assert.equal(prims.filter((p) => p.role === 'pin').length, 4);
});

test("a resistor's colour bands come from its value", () => {
  const bands = partGeometry(board.parts.R8, board.pitch, 'R8', { value: '10k' }).filter((p) => p.role === 'band');
  assert.deepEqual(bands.map((b) => b.colour), ['#7a4a1e', '#1b1b1b', '#f77f00', '#c9a227']);
  assert.equal(partGeometry(board.parts.R8, board.pitch, 'R8', {}).filter((p) => p.role === 'band').length, 0, 'no value, no bands');
});

test('an electrolytic has its stripe on the − side, an aluminium top with its vent, and the − printed', () => {
  const prims = partGeometry(board.parts.C1A, board.pitch, 'C1A');
  const stripe = prims.find((p) => p.role === 'stripe');
  const n = board.parts.C1A.pins.n;
  const b = body('C1A');
  assert.ok(stripe.dir[1] * ((n[1] - 1) * 2.54 - b.y) >= 0, 'faces the − leg');
  assert.ok(prims.some((p) => p.role === 'top') && prims.filter((p) => p.role === 'vent').length === 2);
  assert.ok(prims.some((p) => p.kind === 'print' && p.text === '−'));
});

test('a ceramic disc stands on edge with its code printed, and a TO-92 shows its name on the flat face', () => {
  const cer = partGeometry({ type: 'cer', pins: { 1: [1, 1], 2: [3, 1] }, side: 'top' }, 2.54, 'C3', { value: '100 nF' });
  assert.equal(cer.find((p) => p.kind === 'print').text, '104');
  const q = partGeometry(board.parts.Q1, board.pitch, 'Q1', { value: '2N2222A' });
  assert.equal(q.find((p) => p.role === 'body').kind, 'extrude');
  assert.equal(q.find((p) => p.kind === 'print').text, '2N2222A');
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
