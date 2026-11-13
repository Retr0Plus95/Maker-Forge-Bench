import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLook } from '../../src/looks.js';
import { readBoard } from '../../src/project.js';

test('a look keeps only the fields that suit the part, with allowed values', () => {
  assert.deepEqual(cleanLook('dip', { holder: 'strips', colour: 'red' }), { holder: 'strips' });
  assert.deepEqual(cleanLook('dip', { holder: 'glue' }), {});
  assert.deepEqual(cleanLook('led', { colour: 'yellow' }), { colour: 'yellow' });
  assert.deepEqual(cleanLook('res', { colour: 'yellow' }), {}, 'a resistor is beige or blue');
  assert.deepEqual(cleanLook('elec', { H: 16 }), { H: 16 });
  assert.deepEqual(cleanLook('elec', { H: 400 }), {});
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
