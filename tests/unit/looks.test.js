import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLooks, cleanLook, cleanLooks, lookFields, lookSummary } from '../../src/looks.js';
import { connectionsOf, parseProject, readBoard } from '../../src/project.js';
import { partGeometry } from '../../src/board3d-geometry.js';
import { continuityTests } from '../../src/continuity.js';
import { checkPlacement, footprint } from '../../src/boardcheck.js';
import { readFixture } from './helpers.js';

const fume = parseProject(readFixture('forge-project/fume-extractor.json'));
const board = fume.board;
const partOf = (ref) => fume.parts.find((p) => p.ref === ref) || null;

test('a look keeps only the fields that suit the part, with allowed values', () => {
  assert.deepEqual(cleanLook('dip', { holder: 'strips', colour: 'red' }), { holder: 'strips' });
  assert.deepEqual(cleanLook('dip', { holder: 'glue' }), {});
  assert.deepEqual(cleanLook('led', { colour: 'yellow' }), { colour: 'yellow' });
  assert.deepEqual(cleanLook('res', { colour: 'yellow' }), {}, 'a resistor is beige or blue');
  assert.deepEqual(cleanLook('res', { mount: 'stand' }), { mount: 'stand' });
  assert.deepEqual(cleanLook('elec', { D: 8, H: 16 }), { D: 8, H: 16 });
  assert.deepEqual(cleanLook('elec', { D: 7, H: 400 }), {});
  assert.deepEqual(cleanLook('elec', { H: '16' }), {});
  assert.deepEqual(cleanLook('header', { female: true }), { female: true });
  assert.deepEqual(cleanLook('header', { female: 'yes' }), {});
  assert.deepEqual(cleanLook('to220', { facing: 'up' }), { facing: 'up' });
  assert.deepEqual(cleanLook('mystery', { holder: 'strips' }), {});
  assert.deepEqual(cleanLook('toString', { holder: 'strips' }), {});
  assert.deepEqual(cleanLook('dip', null), {});
});

test("a project's board section can say how a part looks", () => {
  const b = readBoard({
    parts: {
      U9: { type: 'dip', pins: { 1: [1, 1], 2: [1, 4] }, holder: 'strips' },
      D9: { type: 'led', pins: { A: [3, 1], K: [4, 1] }, colour: 'red', holder: 'strips' },
      U8: { type: 'to220', pins: { IN: [6, 1], GND: [7, 1], OUT: [8, 1] }, facing: 'sideways' },
    },
  });
  assert.equal(b.parts.U9.holder, 'strips');
  assert.deepEqual([b.parts.D9.colour, b.parts.D9.holder], ['red', undefined]);
  assert.equal(b.parts.U8.facing, undefined);
  assert.equal(b.parts.U8.type, 'to220');
});

test('saved looks are checked for shape; junk and odd refs are dropped', () => {
  const looks = cleanLooks({
    U2: { holder: 'strips', evil: 'x' },
    R8: { mount: 'stand', colour: 'blue' },
    C1A: { H: 16, D: 'x'.repeat(80) },
    X1: 'nope',
    ['__proto__']: { holder: 'strips' },
    J9: {},
  }, (r) => /^[A-Z][A-Z0-9_]*$/.test(r));
  assert.deepEqual({ ...looks }, { U2: { holder: 'strips' }, R8: { mount: 'stand', colour: 'blue' }, C1A: { H: 16 } });
  assert.deepEqual({ ...cleanLooks(null) }, {});
  assert.deepEqual({ ...cleanLooks([1, 2]) }, {});
});

test('with no looks the board is the project board itself', () => {
  assert.equal(applyLooks(board, {}).board, board);
  assert.equal(applyLooks(board, null).board, board);
  assert.equal(applyLooks(null, { U2: { holder: 'strips' } }).board, null);
});

test('looks are applied to the board as you built it, leaving the project board alone', () => {
  const { board: built } = applyLooks(board, { U2: { holder: 'strips' }, R8: { mount: 'flat', colour: 'blue' }, R4: { mount: 'stand' }, C1A: { H: 16, holder: 'none' } }, partOf);
  assert.equal(built.parts.U2.holder, 'strips');
  assert.equal(board.parts.U2.holder, undefined, 'the project board is unchanged');
  assert.deepEqual([built.parts.R8.mount, built.parts.R8.body, built.parts.R8.colour], ['flat', undefined, 'blue']);
  assert.equal(board.parts.R8.body, '1');
  assert.deepEqual([built.parts.R4.mount, built.parts.R4.body], ['stand', '1'], 'standing on its first pin');
  assert.deepEqual([built.parts.C1A.H, built.parts.C1A.holder], [16, undefined]);
  assert.equal(built.parts.C3, board.parts.C3, 'untouched parts are shared');
  assert.equal(partGeometry(built.parts.U2, 2.54, 'U2').filter((p) => p.role === 'socket').length, 2, 'drawn in two strips');
});

test('the MP1584 module can be an L7805: its pins map across, and everything follows', () => {
  const { board: built, cards, pinMaps } = applyLooks(board, { U1: { swap: 'l7805', facing: 'up' } }, partOf);
  const u1 = built.parts.U1;
  const was = board.parts.U1.pins;
  assert.equal(u1.type, 'to220');
  assert.deepEqual(u1.pins, { IN: was.INp, GND: was.INn, OUT: was.OUTp });
  assert.deepEqual(u1.also, { GND: [was.OUTn] }, 'the second 0 V pad is wired too');
  assert.equal(u1.facing, 'up');
  assert.deepEqual(pinMaps.U1, { INp: 'IN', INn: 'GND', OUTn: 'GND', OUTp: 'OUT' });
  assert.equal(cards.U1.value, 'L7805CV');
  assert.match(cards.U1.note, /in place of MP1584EN buck module/);
  assert.match(cards.U1.warning, /USB port/);
  // the lines follow: U1 IN is on +12 V, GND on 0 V (once), OUT on +5 V
  assert.ok(built.nets.P12V.some(([r, p]) => r === 'U1' && p === 'IN'));
  assert.equal(built.nets.GND.filter(([r]) => r === 'U1').length, 1);
  assert.ok(built.nets.P5V.some(([r, p]) => r === 'U1' && p === 'OUT'));
  assert.ok(board.nets.P5V.some(([r, p]) => r === 'U1' && p === 'OUTp'), 'the project board is unchanged');
  assert.deepEqual(connectionsOf(built, 'U1').map((c) => c.pin).sort(), ['GND', 'IN', 'OUT']);
  // the continuity test names its pins, the check knows its shape
  assert.ok(continuityTests(built).some((t) => /U1 (IN|GND|OUT)/.test(`${t.a.text} ${t.b.text}`)), JSON.stringify(continuityTests(built).slice(0, 3)));
  assert.ok(Array.isArray(checkPlacement(built, { U1: u1.pins }, 'U2')));
  // drawn standing in the module's outline, wired to its four holes
  const prims = partGeometry(u1, 2.54, 'U1', { value: 'L7805CV' });
  const body = prims.find((p) => p.role === 'body');
  const k = u1.keepout.map((v) => (v - 1) * 2.54);
  assert.ok(body.x > k[0] && body.x < k[2] && body.y > k[1] && body.y < k[3], `${body.x},${body.y} in ${k}`);
  assert.equal(prims.filter((p) => p.role === 'wire').length, 4);
  assert.equal(prims.filter((p) => p.kind === 'joint').length, 7, 'three legs and four wire ends');
  assert.ok(footprint(u1, 2.54, 'U1'));
});

test('a swap only applies where the library offers it', () => {
  const { board: built, cards } = applyLooks(board, { U2: { swap: 'l7805' }, U1: { swap: 'lm317' } }, partOf);
  assert.equal(built.parts.U2.type, 'dip');
  assert.equal(built.parts.U1.type, 'module');
  assert.deepEqual({ ...cards }, {});
});

test("a part's card offers what it can look like, with what it is now", () => {
  const holder = lookFields(board.parts.U2, {}, partOf('U2'));
  assert.deepEqual(holder.map((f) => [f.field, f.current]), [['holder', 'socket']]);
  assert.equal(lookSummary(lookFields(board.parts.U2, { holder: 'strips' }, partOf('U2'))), 'In two header strips');
  assert.deepEqual(lookFields(board.parts.R8, {}, partOf('R8')).map((f) => [f.field, f.current]), [['mount', 'stand'], ['colour', 'beige']]);
  const can = lookFields(board.parts.C1A, {}, partOf('C1A'));
  assert.deepEqual(can.map((f) => [f.field, f.current]), [['D', 8], ['H', 11.5]]);
  assert.ok(can[1].choices.some((c) => c.value === 16));
  const u1 = lookFields(board.parts.U1, {}, partOf('U1'));
  assert.deepEqual(u1.map((f) => f.field), ['swap']);
  assert.deepEqual(u1[0].choices.map((c) => c.label), ['As drawn: MP1584EN buck module', 'L7805 regulator']);
  const swapped = lookFields(board.parts.U1, { swap: 'l7805' }, partOf('U1'));
  assert.deepEqual(swapped.map((f) => [f.field, f.current]), [['swap', 'l7805'], ['facing', 'down']]);
  assert.deepEqual(lookFields(board.parts.J2, {}, partOf('J2')), [], 'a fan header is what it is');
  assert.deepEqual(lookFields({ type: 'led', pins: {} }, {}, { value: '5 mm red LED' })[0].current, 'red');
});
