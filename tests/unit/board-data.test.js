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
  assert.deepEqual({ ...b.parts.R8, pins: { ...b.parts.R8.pins } }, { type: 'res', pins: { 1: [26, 6], 2: [26, 8] }, side: 'top', body: '1', mount: 'stand' });
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
  assert.deepEqual({ ...b.nets }, { GND: [['R2', '1']] });
  assert.equal(readBoard('nope'), null);
});

test('build steps mark parts the project does not have', () => {
  const steps = readBuild([{ id: 'a', title: 'A', why: 'w', parts: ['R1', 'ZZ9'], what: ['buses', 'nonsense'] }, 'junk'], (r) => r === 'R1');
  assert.deepEqual(steps, [{ id: 'a', title: 'A', why: 'w', parts: ['R1', 'ZZ9'], what: ['buses'], missing: ['ZZ9'] }]);
});

test('the shape details the 3D view needs are kept: which way Q1 faces, the module outline, header size, mount', () => {
  const p = fume.board.parts;
  assert.equal(p.Q1.round, 'up');
  assert.deepEqual(p.U1.keepout, [0.6, 7.4, 9.3, 14.1]);
  assert.equal(p.J2.half, 2.9);
  assert.equal(p.R4.mount, 'flat');
  assert.equal(p.R4.body, undefined, 'a flat resistor has no body pin');
  const b = readBoard({
    parts: {
      Q9: { type: 'to92', pins: { E: [1, 1], B: [2, 1], C: [3, 1] }, round: 'sideways' },
      J9: { type: 'header', pins: { 1: [1, 3] }, half: 99 },
      U9: { type: 'module', pins: { a: [1, 5] }, keepout: [1, 2, 3] },
      U8: { type: 'module', pins: { a: [1, 6] }, keepout: [1, 2, 'x', 4] },
      U7: { type: 'module', pins: { a: [1, 7] }, keepout: [1, 2, 900, 4] },
      R9: { type: 'res', pins: { 1: [5, 1], 2: [5, 2] }, body: '1', mount: 'wobbly' },
      R8: { type: 'res', pins: { 1: [6, 1], 2: [6, 2] }, body: '1', mount: 'flat' },
      R7: { type: 'res', pins: { 1: [7, 1], 2: [7, 6] }, body: '1' },
    },
  });
  assert.equal(b.parts.Q9.round, undefined);
  assert.equal(b.parts.J9.half, undefined);
  for (const ref of ['U9', 'U8', 'U7']) assert.equal(b.parts[ref].keepout, undefined, ref);
  assert.deepEqual([b.parts.R9.mount, b.parts.R9.body], ['stand', '1'], 'no valid mount: stands when it spans under 4 holes');
  assert.deepEqual([b.parts.R8.mount, b.parts.R8.body], ['flat', undefined], 'the file says flat');
  assert.deepEqual([b.parts.R7.mount, b.parts.R7.body], ['flat', undefined], 'an older file: 5 holes apart lies flat, like pcb.py');
});

test('refs and net names like constructor, toString and __proto__ are ordinary names', () => {
  const b = readBoard(JSON.parse(`{
    "parts": {
      "constructor": { "type": "res", "pins": { "1": [1, 1], "2": [1, 2] } },
      "__proto__": { "type": "res", "pins": { "1": [2, 1], "2": [2, 2] } },
      "R1": { "type": "res", "pins": { "1": [3, 1], "constructor": [3, 2] }, "body": "constructor" },
      "R2": { "type": "res", "pins": { "1": [4, 1], "2": [4, 2] }, "body": "toString" }
    },
    "nets": { "toString": [["constructor", "1"], ["R1", "1"]], "__proto__": [["__proto__", "1"]] },
    "netLabels": { "hasOwnProperty": "x" }
  }`));
  assert.deepEqual(Object.keys(b.parts).sort(), ['R1', 'R2', '__proto__', 'constructor']);
  assert.equal(b.parts.toString, undefined);
  assert.equal(b.parts.R1.body, 'constructor', 'a pin may be called constructor');
  assert.equal(b.parts.R2.body, undefined, 'toString is not one of its pins');
  assert.deepEqual(Object.keys(b.nets).sort(), ['__proto__', 'toString']);
  assert.equal(b.nets.valueOf, undefined);
  assert.deepEqual(connectionsOf(b, 'R2'), []);
  assert.deepEqual(connectionsOf(b, 'constructor').map((c) => c.label), ['toString']);
  assert.deepEqual(connectionsOf(b, '__proto__').map((c) => c.net), ['__proto__']);
});

test('a project file full of junk entries is read quickly', () => {
  const parts = {};
  for (let i = 0; i < 1999; i++) parts[`R${i}`] = { type: 'res', pins: { 1: [1, 1], 2: [1, 2] } }; // one under the limit
  for (let i = 0; i < 60000; i++) parts[`X${i}`] = 0;
  const nets = {};
  for (let i = 0; i < 499; i++) nets[`N${i}`] = [['R1', '1']];
  for (let i = 0; i < 60000; i++) nets[`Y${i}`] = 0;
  const started = Date.now();
  const b = readBoard({ parts, nets });
  assert.equal(Object.keys(b.parts).length, 1999);
  assert.equal(Object.keys(b.nets).length, 499);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

test('board size from many pins does not overflow the argument list', () => {
  const pins = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, [1 + (i % 50), 1 + Math.floor(i / 50)]]));
  const parts = {};
  for (let i = 0; i < 2000; i++) parts[`U${i}`] = { type: 'dip', pins };
  const b = readBoard({ parts });
  assert.deepEqual([b.cols, b.rows], [50, 2]);
});

test('the board and build sections are not also copied into extra', () => {
  const p = parseProject(JSON.stringify({ format: 'forge-project', version: 1, name: 'x', board: {}, build: [], other: 1 }));
  assert.deepEqual(p.extra, { other: 1 });
});
