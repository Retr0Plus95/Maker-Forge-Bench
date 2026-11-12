import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionsOf, parseProject, readBoard, readBuild } from '../../src/project.js';
import { readFixture } from './helpers.js';

const fume = parseProject(readFixture('forge-project/fume-extractor.json'));

test('the fume extractor project carries its board and build steps', () => {
  const b = fume.board;
  assert.equal(Object.keys(b.parts).length, 32);
  assert.equal(b.buses.length, 7);
  assert.equal(b.bridges.length, 2);
  assert.deepEqual([b.cols, b.rows, b.pitch], [32, 20, 2.54]);
  assert.deepEqual(b.parts.R8, { type: 'res', pins: { 1: [26, 6], 2: [26, 8] }, side: 'top', body: '1' });
  assert.equal(b.parts.C5.side, 'bottom');
  assert.ok(b.links.some((l) => l.path.some(([c, r]) => c === 30.5 && r === 1.6)), 'half-hole bends kept');
  assert.equal(fume.build.length, 10);
  assert.equal(fume.build[6].title, 'Fan drive and tach');
  assert.deepEqual(fume.build[6].missing, []);
});

test('connections of a part, pin by pin', () => {
  assert.deepEqual(connectionsOf(fume.board, 'R8'), [
    { pin: '1', net: 'P5V', label: '+5 V', others: fume.board.nets.P5V.filter(([r, p]) => !(r === 'R8' && p === '1')) },
    { pin: '2', net: 'TACHA_F', label: 'TACHA_F', others: [['J2', '3'], ['R12', '1']] },
  ]);
  assert.deepEqual(connectionsOf(fume.board, 'RV1'), []);
  assert.deepEqual(connectionsOf(null, 'R8'), []);
});

test('hostile board data is dropped, not fatal', () => {
  const b = readBoard({
    cols: 10, rows: 10,
    parts: { R1: { type: 'res', pins: { 1: [1e9, 2], 2: [2, 2] } }, R2: { type: 'res', pins: { 1: [1, 1], 2: [1, 3] } }, '<b>': { type: 'res', pins: { 1: [1, 1] } } },
    links: [{ path: Array.from({ length: 200 }, (_, i) => [1, 1 + (i % 9)]) }, { path: [[1, 1], [2.5, 3]] }, { path: [[1, 1], [1.3, 2]] }],
    buses: [{ row: 2, from: 1, to: 9, net: 'x'.repeat(80) }, { row: 3, from: 1, to: 9, net: 'GND', label: '0 V' }],
    nets: { GND: [['R2', '1'], [5, 6]], ['n'.repeat(80)]: [['R2', '2']] },
  });
  assert.deepEqual(Object.keys(b.parts), ['R2']);
  assert.equal(b.links.length, 2, 'bends anywhere on the board are fine; 200 points are not');
  assert.deepEqual(b.buses.map((x) => x.net), ['GND']);
  assert.deepEqual(b.nets, { GND: [['R2', '1']] });
  assert.equal(readBoard('nope'), null);
});

test('build steps mark parts the project does not have', () => {
  const steps = readBuild([{ id: 'a', title: 'A', why: 'w', parts: ['R1', 'ZZ9'], what: ['buses', 'nonsense'] }, 'junk'], (r) => r === 'R1');
  assert.deepEqual(steps, [{ id: 'a', title: 'A', why: 'w', parts: ['R1', 'ZZ9'], what: ['buses'], missing: ['ZZ9'] }]);
});
