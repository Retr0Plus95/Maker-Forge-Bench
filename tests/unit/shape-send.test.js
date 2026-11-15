import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_HOST, SHAPE_KEY, SHAPE_MAX, SHAPE_URL, canReachShape, defaultSize, parseHoles, portsAndPanel, shapeBoard, shapeId, simpleHeights, writeShapeParts } from '../../src/shape-send.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));
const board = project.board;
const values = Object.fromEntries(project.parts.map((p) => [p.ref, p.value]));

// shapeAccepts: the checks Shape's encCleanBoards makes (app.html at b6e372b), copied into the test
const KINDS = ['usbc', 'micro', 'usbmini', 'usba', 'usbb', 'dcpcb', 'rj45', 'hdmi', 'jack35', 'sd', 'sma', 'led3', 'led5', 'tact', 'tact12', 'encoder', 'pot', 'slide', 'toggle', 'buzzer'];
const SCREWS = ['M2', 'M2.5', 'M3', 'M4'];
function shapeAccepts(b) {
  const inW = (x) => Number.isFinite(x) && x >= 0 && x <= b.w;
  const inD = (y) => Number.isFinite(y) && y >= 0 && y <= b.d;
  return /^[a-z0-9]{4,10}$/.test(b.id) && b.w >= 5 && b.w <= 300 && b.d >= 5 && b.d <= 300 &&
    Array.isArray(b.holes) && b.holes.length <= 16 && b.holes.every(([x, y]) => inW(x) && inD(y)) &&
    SCREWS.includes(b.screw) && b.tall >= 1 && b.tall <= 60 &&
    Array.isArray(b.ports) && b.ports.length <= 16 && b.ports.every((q) => ['x0', 'x1', 'y0', 'y1'].includes(q[0]) && KINDS.includes(q[2])) &&
    Array.isArray(b.panel) && b.panel.length <= 32 && b.panel.every((q) => inW(q[0]) && inD(q[1]) && KINDS.includes(q[2])) &&
    typeof b.label === 'string' && !/[<>&"]/.test(b.label) && b.label.length <= 20;
}

test("Shape's address and list", () => {
  assert.equal(SHAPE_HOST, 'forge.retr0plus.se');
  assert.equal(SHAPE_KEY, 'makerforge.parts');
  assert.equal(SHAPE_MAX, 40);
  assert.equal(SHAPE_URL, 'https://forge.retr0plus.se/');
});

test('only forge.retr0plus.se reaches Shape', () => {
  assert.equal(canReachShape('forge.retr0plus.se'), true);
  for (const h of ['localhost', '127.0.0.1', 'retr0plus.se', 'forge.retr0plus.se.example.com']) assert.equal(canReachShape(h), false);
});

test('one id per project and board, in the form Shape keeps', () => {
  assert.match(shapeId('Solder Fume Extractor', 'drawing'), /^bn[a-z0-9]{6}$/);
  assert.equal(shapeId('Solder Fume Extractor', 'drawing'), shapeId('Solder Fume Extractor', 'drawing'));
  assert.notEqual(shapeId('Solder Fume Extractor', 'drawing'), shapeId('Solder Fume Extractor', 'mine'));
});

test("the fume extractor's board: its size, its tallest part, and its headers as wires", () => {
  assert.deepEqual(defaultSize(board), [81.3, 53.3]);
  const h = simpleHeights(board);
  assert.ok(Object.values(h).every((v) => v > 0));
  assert.ok(h.C1A > h.R2);
  assert.equal(h.C5, undefined, 'parts under the board have no height above it');
  const { board: b, wires } = shapeBoard(board, values, { name: 'Solder Fume Extractor', which: 'drawing', size: defaultSize(board),
    holes: { inset: 3 }, screw: 'M3', tall: Math.max(...Object.values(h)) });
  assert.deepEqual(b.holes, [[3, 3], [78.3, 3], [3, 50.3], [78.3, 50.3]]);
  assert.deepEqual([b.ports, b.panel], [[], []]);
  assert.ok(['J0', 'J2', 'J3', 'J4', 'J5', 'J6'].every((r) => wires.includes(r)));
  assert.ok(shapeAccepts(b));
});

test('a USB-C at the edge is a port, an LED on top is a panel part, a socket in the middle is only wires', () => {
  const small = { pitch: 2.54, nets: {}, netLabels: {}, links: [], buses: [], bridges: [], parts: {
    J1: { type: 'connector', side: 'top', pins: { 1: [1, 4], 2: [1, 5] } }, // the left edge
    D1: { type: 'led', side: 'top', D: 5, pins: { A: [10, 5], K: [11, 5] } },
    J2: { type: 'connector', side: 'top', pins: { 1: [10, 6], 2: [11, 6] } }, // the middle: 10.2 mm from the front, 15.2 from the back
    R1: { type: 'res', side: 'top', pins: { 1: [1, 1], 2: [20, 9] } }, // spans the board: 20 × 9 holes
    C9: { type: 'cer', side: 'bottom', pins: { 1: [5, 8], 2: [6, 8] } } } }; // underneath: ignored
  const r = portsAndPanel(small, { J1: 'USB-C receptacle', D1: 'red LED', J2: 'USB-C socket', R1: '1k', C9: '100n' });
  assert.deepEqual(r.ports.map((q) => [q[0], q[2], q[3]]), [['x0', 'usbc', 1.6]]);
  assert.deepEqual(r.panel.map((q) => q[2]), ['led5']);
  assert.deepEqual(r.wires, ['J2']);
});

// a connector at the left edge, with the value given (R1 spans the board so the size stays 20 × 9 holes)
const portAt = (value) => portsAndPanel({ pitch: 2.54, parts: {
  J1: { type: 'connector', side: 'top', pins: { 1: [1, 4], 2: [1, 5] } },
  R1: { type: 'res', side: 'top', pins: { 1: [1, 1], 2: [20, 9] } } } }, { J1: value }).ports.map((q) => [q[2], q[3]]);

test('ports written in plain words are found too: Micro USB, USB C, DC jack, audio jack', () => {
  assert.deepEqual(portAt('Micro USB socket'), [['micro', 1.6]]);
  assert.deepEqual(portAt('USB C socket'), [['usbc', 1.6]]);
  assert.deepEqual(portAt('Mini USB'), [['usbmini', 2]]);
  assert.deepEqual(portAt('USB A socket'), [['usba', 3.5]]);
  assert.deepEqual(portAt('USB B socket'), [['usbb', 5.5]]);
  assert.deepEqual(portAt('DC jack 5.5 mm'), [['dcpcb', 5.6]]);
  assert.deepEqual(portAt('DC power socket'), [['dcpcb', 5.6]]);
  assert.deepEqual(portAt('3.5 mm audio jack'), [['jack35', 3]]);
  assert.deepEqual(portAt('Ethernet socket'), [['rj45', 6.9]]);
  assert.deepEqual(portAt('micro SD card slot'), [['sd', 1.5]]);
});

test('USB words that are not a socket stay wires', () => {
  for (const v of ['USB breakout board', 'USB cable connector', 'USB to serial adapter']) assert.deepEqual(portAt(v), [], v);
});

test('the id follows the project, not the name typed for Shape, so renaming still replaces', () => {
  const b = shapeBoard(board, values, { project: 'Solder Fume Extractor', name: 'Fume box', which: 'drawing', size: [50, 40], holes: 'none', screw: 'M3', tall: 12 }).board;
  assert.equal(b.id, shapeId('Solder Fume Extractor', 'drawing'));
  assert.equal(b.label, 'Fume box');
});

test("Bench's own panel parts: 3 mm LEDs, 12 mm buttons, knobs, switches and buzzers", () => {
  const part = (type, more = {}) => ({ type, side: 'top', pins: { 1: [10, 5], 2: [11, 5] }, ...more });
  const kinds = (parts, vals) => portsAndPanel({ pitch: 2.54, parts: { ...parts, R1: part('res', { pins: { 1: [1, 1], 2: [20, 9] } }) } }, vals).panel.map((q) => q[2]);
  assert.deepEqual(kinds({ D1: part('led', { D: 3 }) }, { D1: 'green LED' }), ['led3']);
  assert.deepEqual(kinds({ D1: part('led') }, { D1: 'LED 3 mm red' }), ['led3']);
  assert.deepEqual(kinds({ S1: part('button') }, { S1: 'tactile 6x6' }), ['tact']);
  assert.deepEqual(kinds({ S1: part('button') }, { S1: 'tactile 12 x 12' }), ['tact12']);
  assert.deepEqual(kinds({ RV1: part('pot') }, { RV1: '10k' }), ['pot']);
  assert.deepEqual(kinds({ SW1: part('switch') }, { SW1: 'toggle SPDT' }), ['toggle']);
  assert.deepEqual(kinds({ SW1: part('switch') }, { SW1: 'SS12D00' }), ['slide']);
  assert.deepEqual(kinds({ BZ1: part('buzzer') }, { BZ1: '5 V' }), ['buzzer']);
});

test('a long or odd name becomes a label Shape accepts (Review Focus 4)', () => {
  const { board: b } = shapeBoard(board, values, { name: 'My <b>really</b> long "project" & more', which: 'drawing', size: [50, 40], holes: 'none', screw: 'M3', tall: 12 });
  assert.equal(b.label, 'My breally/b long pr');
  assert.ok(shapeAccepts(b));
});

test('tall is a whole mm from 1 to 60, and holes typed in stay on the board', () => {
  const at = (opts) => shapeBoard(board, values, { name: 'X', which: 'mine', size: [50, 40], holes: 'none', screw: 'M3', tall: 12, ...opts }).board;
  assert.equal(at({ tall: 12.2 }).tall, 13);
  assert.equal(at({ tall: 0 }).tall, 1);
  assert.equal(at({ tall: 99 }).tall, 60);
  assert.deepEqual(at({ holes: [[2, 2], [48, 38], [70, 10]] }).holes, [[2, 2], [48, 38]]);
  assert.equal(at({ screw: 'M5' }).screw, 'M3');
});

// 1.0 deferred minors, fixed after the merge: nothing is changed to fit Shape without saying so
test('a size past 5 to 300 mm, holes off the board and holes past 16 are said, not changed silently', () => {
  const sent = (opts) => shapeBoard(board, values, { name: 'X', which: 'mine', size: [50, 40], holes: 'none', screw: 'M3', tall: 12, ...opts });
  const odd = sent({ size: [400, 2], holes: [[350, 1]] });
  assert.equal(odd.board.w, 300);
  assert.equal(odd.board.d, 5);
  assert.deepEqual(odd.notes, [
    'Shape takes boards 5 to 300 mm, so the width is sent as 300 mm (not 400) and the depth as 5 mm (not 2).',
    '1 hole left out: each needs two numbers inside the board.',
  ]);
  const many = sent({ holes: Array.from({ length: 20 }, (_, i) => [2 + i, 2]), holesBad: 2 });
  assert.equal(many.board.holes.length, 16);
  assert.deepEqual(many.notes, ['2 holes left out: each needs two numbers inside the board.', 'Shape keeps up to 16 holes, so 4 more were left out.']);
  assert.deepEqual(sent({}).notes, []);
  assert.equal(sent({}).problem, null);
});

test("holes in from the corners that would meet in the middle stop the send, saying what fits", () => {
  const at = (inset) => shapeBoard(board, values, { name: 'X', which: 'mine', size: [40, 30], holes: { inset }, screw: 'M3', tall: 12 });
  assert.equal(at(15).problem, "Holes 15 mm in from each corner don't fit a 40 × 30 mm board: use less than 15 mm.");
  assert.equal(at(14.9).problem, null);
  assert.deepEqual(at(14.9).board.holes, [[14.9, 14.9], [25.1, 14.9], [14.9, 15.1], [25.1, 15.1]]);
});

test('holes typed as "x,y" or "x y", with a decimal point or comma, one pair per ; or line', () => {
  assert.deepEqual(parseHoles('3,3; 78,3'), { holes: [[3, 3], [78, 3]], bad: 0 });
  assert.deepEqual(parseHoles('3,5 4,5\n10.5 2'),{ holes: [[3.5, 4.5], [10.5, 2]], bad: 0 });
  assert.deepEqual(parseHoles('3.5, 4.5; oops; 1,2,3; 7'), { holes: [[3.5, 4.5]], bad: 3 });
  assert.deepEqual(parseHoles('  '), { holes: [], bad: 0 });
});

const memory = (raw = null) => { let v = raw; return { getItem: () => v, setItem: (k, x) => { v = x; } }; };
const one = shapeBoard(board, values, { name: 'Solder Fume Extractor', which: 'drawing', size: [81.3, 53.3], holes: 'none', screw: 'M3', tall: 14 }).board;

test('writing: added, then replaced, never doubled', () => {
  const st = memory();
  assert.deepEqual(writeShapeParts(st, one), { ok: true, replaced: false });
  assert.deepEqual(writeShapeParts(st, { ...one, tall: 15 }), { ok: true, replaced: true });
  const list = JSON.parse(st.getItem());
  assert.equal(list.length, 1);
  assert.equal(list[0].tall, 15);
});

test('a full list says so and changes nothing', () => {
  const others = Array.from({ length: 40 }, (_, k) => ({ ...one, id: `zz${String(k).padStart(4, '0')}` }));
  const st = memory(JSON.stringify(others));
  const before = st.getItem();
  const r = writeShapeParts(st, one);
  assert.equal(r.ok, false);
  assert.match(r.why, /full \(40 boards\)/);
  assert.equal(st.getItem(), before);
});

test("a list Bench can't read is left alone (Review Focus 2)", () => {
  for (const raw of ['{oops', '{"a":1}', '"text"']) {
    const st = memory(raw);
    const r = writeShapeParts(st, one);
    assert.equal(r.ok, false);
    assert.match(r.why, /can't be read/);
    assert.equal(st.getItem(), raw);
  }
});

test("a browser that won't store says so", () => {
  const r = writeShapeParts({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } }, one);
  assert.equal(r.ok, false);
  assert.match(r.why, /wouldn't keep it/);
});
