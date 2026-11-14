import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISS_LIMIT, bendLegs, canBendLegs, entryForModelPath, holesFor, kicadPinOrder, modelFor, placeFor, placeInOutline, placeModel } from '../../src/library-match.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const index = JSON.parse(readFileSync(new URL('../../src/library/index.json', import.meta.url), 'utf8'));
const byId = (id) => index.parts.find((p) => p.id === id);
const idOf = (part, look = {}) => (modelFor(part, look, index) || { id: null }).id;
const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} is not within ${d} of ${b}`);

test('resistors: lying flat by the nearest pitch, standing over one or two holes', () => {
  assert.equal(idOf({ type: 'res', mount: 'flat', pins: { 1: [0, 0], 2: [4, 0] } }), 'r-axial-din0207-l6.3-d2.5-p10.16-h');
  assert.equal(idOf({ type: 'res', mount: 'flat', pins: { 1: [0, 0], 2: [0, 3] } }), 'r-axial-din0207-l6.3-d2.5-p7.62-h');
  assert.equal(idOf({ type: 'res', mount: 'stand', pins: { 1: [0, 0], 2: [1, 0] } }), 'r-axial-din0207-l6.3-d2.5-p2.54-v');
  assert.equal(idOf({ type: 'res', mount: 'stand', pins: { 1: [0, 0], 2: [0, 2] } }), 'r-axial-din0207-l6.3-d2.5-p5.08-v');
  assert.equal(idOf({ type: 'res', pins: { 1: [0, 0], 2: [4, 0] } }), 'r-axial-din0207-l6.3-d2.5-p10.16-h', 'flat when not said');
  assert.equal(idOf({ type: 'res', mount: 'flat', pins: { 1: [0, 0], 2: [4, 0] } }, { mount: 'stand' }), 'r-axial-din0207-l6.3-d2.5-p5.08-v',
    'your look wins over the drawing');
});

test('electrolytics by diameter, then the nearest pitch', () => {
  assert.equal(idOf({ type: 'elec', D: 8, pins: { p: [0, 0], n: [3.5 / 2.54, 0] } }), 'cp-radial-d8.0-p3.50');
  assert.equal(idOf({ type: 'elec', D: 8, pins: { p: [0, 0], n: [0, 2] } }), 'cp-radial-d8.0-p5.00');
  assert.equal(idOf({ type: 'elec', D: 6.3, pins: { p: [0, 0], n: [0, 2] } }), 'cp-radial-d6.3-p2.50');
  assert.equal(idOf({ type: 'elec', pins: { p: [0, 0], n: [1, 0] } }, { D: 10 }), 'cp-radial-d10.0-p2.50');
  assert.equal(idOf({ type: 'elec', D: 9.5, pins: { p: [0, 0], n: [2, 0] } }), 'cp-radial-d10.0-p5.00', 'the nearest diameter');
});

test('ceramics by style; the usual 5 mm disc when several fit', () => {
  assert.equal(idOf({ type: 'cer', pins: { 1: [0, 0], 2: [1, 0] } }), 'c-disc-d5.0-w2.5-p2.50');
  assert.equal(idOf({ type: 'cer', pins: { 1: [0, 0], 2: [2, 0] } }), 'c-disc-d5.0-w2.5-p5.00');
  assert.equal(idOf({ type: 'cer', style: 'dipped', pins: { 1: [0, 0], 2: [1, 0] } }), 'c-rect-l4.0-w2.5-p2.50');
});

test('diodes by their value: 1N4007 DO-41, 1N5402 DO-201AD, 1N4148 DO-35', () => {
  const flat = (value, span = 4) => ({ type: 'diode', value, pins: { K: [0, 0], A: [span, 0] } });
  assert.equal(idOf(flat('1N4007')), 'd-do-41-sod81-p10.16-h');
  assert.equal(idOf(flat('1N5402', 5)), 'd-do-201ad-p12.70-h');
  assert.equal(idOf(flat('1N4148', 3)), 'd-do-35-sod27-p7.62-h');
  assert.equal(idOf(flat('1N5819')), 'd-do-41-sod81-p10.16-h', 'a Schottky in DO-41');
  // standing: the body sits over the pin `body` names, so body A means the cathode lead comes down from the top
  assert.equal(idOf({ type: 'diode_stand', value: '1N5402G', body: 'A', pins: { K: [2, 2], A: [2, 4] } }), 'd-do-201ad-p5.08-v-kathodeup');
  assert.equal(idOf({ type: 'diode_stand', value: '1N4007', body: 'K', pins: { K: [0, 0], A: [1, 0] } }), 'd-do-41-sod81-p2.54-v-anodeup');
});

test('LEDs: 5 mm unless the value or D says 3 mm', () => {
  assert.equal(idOf({ type: 'led', pins: { A: [0, 0], K: [1, 0] } }), 'led-d5.0');
  assert.equal(idOf({ type: 'led', value: '3mm red', pins: { A: [0, 0], K: [1, 0] } }), 'led-d3.0');
  assert.equal(idOf({ type: 'led', D: 3, pins: { A: [0, 0], K: [1, 0] } }), 'led-d3.0');
});

test('our own MP1584 module by its value; an unknown module has none', () => {
  assert.equal(idOf({ type: 'module', value: 'MP1584EN buck module', pins: { INp: [4, 2], INn: [4, 4], OUTp: [8, 6], OUTn: [8, 4] } }), 'mp1584-module');
  assert.equal(idOf({ type: 'module', value: 'XL4015', pins: { INp: [4, 2], INn: [4, 4] } }), null);
  assert.equal(idOf({ type: 'module', pins: { INp: [4, 2] } }), null);
});

test('chips by pin count, holder and row width', () => {
  const dip = (n, gap, holder) => {
    const pins = {};
    for (let k = 1; k <= n / 2; k++) pins[k] = [k, 5];
    for (let k = n / 2 + 1; k <= n; k++) pins[k] = [n + 1 - k, 5 - gap];
    return holder ? { type: 'dip', holder, pins } : { type: 'dip', pins };
  };
  assert.equal(idOf(dip(28, 3, 'socket')), 'dip-28-w7.62-socket');
  assert.equal(idOf(dip(28, 3, 'none')), 'dip-28-w7.62');
  assert.equal(idOf(dip(28, 6, 'socket')), 'dip-28-w15.24-socket');
  assert.equal(idOf(dip(8, 3)), 'dip-8-w7.62-socket', 'a socket when not said (as Bench draws it)');
  assert.equal(idOf(dip(8, 3), { holder: 'strips' }), 'dip-8-w7.62', 'the chip alone in header strips');
  assert.equal(idOf(dip(12, 3, 'socket')), null, 'no DIP-12 in the library');
});

test('headers by count, rows and female; fan headers are Molex KK', () => {
  const row = (n, extra = {}) => ({ type: 'header', pins: Object.fromEntries(Array.from({ length: n }, (_, k) => [String(k + 1), [k, 0]])), ...extra });
  assert.equal(idOf(row(4, { female: true })), 'socket-1x04');
  assert.equal(idOf(row(4)), 'header-1x04');
  assert.equal(idOf(row(4), { female: true }), 'socket-1x04');
  assert.equal(idOf(row(4, { half: 2.9 })), 'molex-kk-4');
  const two = { type: 'header', pins: {} };
  for (let k = 0; k < 5; k++) { two.pins[String(2 * k + 1)] = [k, 0]; two.pins[String(2 * k + 2)] = [k, 1]; }
  assert.equal(idOf(two), 'header-2x05');
  assert.equal(idOf(row(11)), null, 'no 1 x 11 header');
});

test('a model chosen in Looks like or in the project wins over the type rule', () => {
  const res = { type: 'res', mount: 'flat', pins: { 1: [0, 0], 2: [4, 0] } };
  assert.equal(idOf(res, { model: 'r-axial-din0309-l9.0-d3.2-p12.70-h' }), 'r-axial-din0309-l9.0-d3.2-p12.70-h');
  assert.equal(idOf({ ...res, model: 'r-axial-din0204-l3.6-d1.6-p7.62-h' }), 'r-axial-din0204-l3.6-d1.6-p7.62-h');
  assert.equal(idOf(res, { model: 'no-such-model' }), 'r-axial-din0207-l6.3-d2.5-p10.16-h', 'an unknown id falls back');
  assert.equal(idOf({ type: 'underside', pins: { 1: [0, 0], 2: [1, 0] } }), null);
  assert.equal(modelFor(null, {}, index), null);
  assert.equal(modelFor(res, {}, null), null);
});

test('the fume extractor: which parts get a library model', () => {
  const fume = parseProject(readFixture('forge-project/fume-extractor.json'));
  const value = (ref) => (fume.parts.find((p) => p.ref === ref) || {}).value;
  const got = (ref) => idOf({ ...fume.board.parts[ref], ref, value: value(ref) });
  assert.equal(got('R4'), 'r-axial-din0207-l6.3-d2.5-p10.16-h');
  assert.equal(got('R8'), 'r-axial-din0207-l6.3-d2.5-p5.08-v');
  assert.equal(got('C1A'), 'cp-radial-d8.0-p5.00');
  assert.equal(got('D1'), 'd-do-201ad-p5.08-v-kathodeup');
  assert.equal(got('U1'), 'mp1584-module');
  assert.equal(got('U2'), 'dip-28-w7.62-socket');
  assert.equal(got('Q1'), 'to-92-inline-wide');
  assert.equal(got('J2'), 'molex-kk-4');
  assert.equal(got('J0'), 'header-1x02');
  assert.equal(got('Y1'), 'crystal-hc49-4h-v', 'the crystal under the board');
  assert.equal(got('C5'), 'c-disc-d5.0-w2.5-p2.50', 'a ceramic under the board');
});

test('underside parts: a crystal by its Y ref, a ceramic by its C ref, anything else keeps its own model', () => {
  assert.equal(idOf({ type: 'underside', ref: 'Y1', pins: { 1: [0, 0], 2: [1, 0] } }), 'crystal-hc49-4h-v');
  assert.equal(idOf({ type: 'underside', ref: 'C8', pins: { 1: [0, 0], 2: [2, 0] } }), 'c-disc-d5.0-w2.5-p5.00');
  assert.equal(idOf({ type: 'underside', ref: 'C9', style: 'dipped', pins: { 1: [0, 0], 2: [1, 0] } }), 'c-rect-l4.0-w2.5-p2.50');
  assert.equal(idOf({ type: 'underside', ref: 'R1', pins: { 1: [0, 0], 2: [1, 0] } }), null);
  assert.equal(idOf({ type: 'underside', pins: { 1: [0, 0], 2: [1, 0] } }), null);
});

test('radial parts can have their legs bent to holes their model does not match', () => {
  assert.equal(canBendLegs({ type: 'elec' }), true);
  assert.equal(canBendLegs({ type: 'underside' }), true);
  assert.equal(canBendLegs({ type: 'res' }), false);
  assert.equal(canBendLegs({ type: 'dip' }), false);
  // a 6.3 mm can with legs 2.5 mm apart on holes 5.08 apart: centred, legs bent out
  const out = bendLegs(byId('cp-radial-d6.3-p2.50'), [[0, 0], [0, 5.08]]);
  near(out.angle, 90);
  near(out.x, 0);
  near(out.y, 1.29);
  assert.equal(out.mirror, false);
  assert.equal(out.legs.length, 2);
  near(out.legs[0].from[1], 1.29);
  near(out.legs[0].to[1], 0);
  near(out.legs[1].from[1], 3.79);
  near(out.legs[1].to[1], 5.08);
  // the crystal's legs 4.88 apart into holes 2.54 apart, under the board: bent in, mirrored
  const xtal = bendLegs(byId('crystal-hc49-4h-v'), [[0, 0], [2.54, 0]], { side: 'bottom' });
  near(xtal.angle, 0);
  near(xtal.x, -1.17);
  near(xtal.legs[1].from[0], 3.71);
  assert.equal(xtal.mirror, true);
  assert.equal(bendLegs(byId('to-92-inline-wide'), [[0, 0], [2.54, 0], [5.08, 0]]), null, 'only two legs bend');
  assert.equal(bendLegs(byId('cp-radial-d6.3-p2.50'), [[0, 0], [0, 12.7]]), null, 'too far to bend');
});

test('a resistor without a mount stands over short spans and lies over long ones, as Bench draws it', () => {
  assert.equal(idOf({ type: 'res', pins: { 1: [0, 0], 2: [1, 0] } }), 'r-axial-din0207-l6.3-d2.5-p2.54-v');
  assert.equal(idOf({ type: 'res', pins: { 1: [0, 0], 2: [0, 2] } }), 'r-axial-din0207-l6.3-d2.5-p5.08-v');
  assert.equal(idOf({ type: 'res', pins: { 1: [0, 0], 2: [0, 4] } }), 'r-axial-din0207-l6.3-d2.5-p10.16-h');
});

test("holesFor: the holes in mm on the board, in the model pins' order", () => {
  assert.deepEqual(holesFor({ type: 'led', pins: { A: [2, 1], K: [3, 1] } }), [[5.08, 0], [2.54, 0]], 'cathode first');
  assert.deepEqual(holesFor({ type: 'res', mount: 'stand', body: '2', pins: { 1: [1, 1], 2: [1, 3] } }), [[0, 5.08], [0, 0]],
    "a standing resistor's body pin first: KiCad's body stands on pad 1");
  assert.deepEqual(holesFor({ type: 'res', mount: 'stand', body: '1', pins: { 1: [1, 1], 2: [1, 3] } }), [[0, 0], [0, 5.08]]);
  assert.deepEqual(holesFor({ type: 'res', pins: { 1: [1, 1], 2: [1, 2] } }), [[0, 0], [0, 2.54]], 'standing, body on pin 1 when not said');
});

test('placeFor: on its holes, a module in its outline, or radial legs bent', () => {
  const fume = parseProject(readFixture('forge-project/fume-extractor.json'));
  const parts = fume.board.parts;
  const r4 = placeFor(byId('r-axial-din0207-l6.3-d2.5-p10.16-h'), parts.R4);
  near(r4.miss, 0);
  assert.equal(r4.legs, undefined);
  near(r4.x, 9 * 2.54);
  near(r4.y, 5 * 2.54);
  const r12 = placeFor(byId('r-axial-din0207-l6.3-d2.5-p5.08-v'), parts.R12);
  near(r12.y, 10 * 2.54, 0.01, 'R12 stands on its pin 2');
  const u1 = placeFor(byId('mp1584-module'), parts.U1);
  assert.equal(u1.miss, 0);
  assert.equal(u1.angle, 0);
  const c2 = placeFor(byId('cp-radial-d6.3-p2.50'), parts.C2);
  assert.equal(c2.miss, 0);
  assert.equal(c2.legs.length, 2);
  near(c2.legs[0].to[1], 5 * 2.54, 0.01, "C2's + leg goes to its + hole");
  const y1 = placeFor(byId('crystal-hc49-4h-v'), parts.Y1);
  assert.equal(y1.mirror, true);
  assert.equal(y1.legs.length, 2);
  const tooMany = placeFor(byId('header-1x04'), { type: 'header', side: 'top', pins: { 1: [1, 1], 2: [2, 1] } });
  assert.equal(tooMany.miss, Infinity);
  const far = placeFor(byId('r-axial-din0207-l6.3-d2.5-p10.16-h'), { type: 'res', mount: 'flat', side: 'top', pins: { 1: [1, 1], 2: [1, 4] } });
  assert.ok(far.miss > MISS_LIMIT, "a resistor's legs are not bent: it misses");
  assert.equal(placeFor(null, parts.R4), null);
});

test('KiCad pin order: diodes and LEDs cathode first, electrolytics + first, chips by number', () => {
  assert.deepEqual(kicadPinOrder({ type: 'led', pins: { A: [0, 0], K: [1, 0] } }), ['K', 'A']);
  assert.deepEqual(kicadPinOrder({ type: 'diode_stand', pins: { A: [0, 0], K: [1, 0] } }), ['K', 'A']);
  assert.deepEqual(kicadPinOrder({ type: 'elec', pins: { p: [0, 0], n: [1, 0] } }), ['p', 'n']);
  assert.deepEqual(kicadPinOrder({ type: 'elec', pins: { n: [0, 0], p: [1, 0] } }), ['p', 'n']);
  assert.deepEqual(kicadPinOrder({ type: 'elec', pins: { '-': [0, 0], '+': [1, 0] } }), ['+', '-']);
  assert.deepEqual(kicadPinOrder({ type: 'dip', pins: { 10: [0, 0], 2: [1, 0], 1: [2, 0] } }), ['1', '2', '10']);
  assert.deepEqual(kicadPinOrder({ type: 'to92', pins: { E: [0, 0], B: [1, 0], C: [2, 0] } }), ['E', 'B', 'C']);
  assert.deepEqual(kicadPinOrder({ type: 'module', pins: { INp: [0, 0], INn: [0, 2], OUTp: [4, 4], OUTn: [4, 2] } }), ['INp', 'INn', 'OUTp', 'OUTn']);
});

test('placing a model: pin 1 on hole 1, turned towards hole 2; miss says how far the rest are off', () => {
  const r = byId('r-axial-din0207-l6.3-d2.5-p10.16-h');
  const down = placeModel(r, [[0, 0], [0, 10.16]]);
  near(down.angle, 90);
  near(down.x, 0);
  near(down.y, 0);
  assert.equal(down.mirror, false);
  assert.ok(down.miss < 0.01);
  near(placeModel(r, [[5, 5], [15.16, 5]]).angle, 0);
  near(placeModel(r, [[0, 0], [0, 12.7]]).miss, 2.54);
  assert.ok(placeModel(r, [[0, 0], [0, 12.7]]).miss > MISS_LIMIT);
  assert.equal(MISS_LIMIT, 0.3);
});

test('placing a chip: the rows land on the right side, and under the board it is mirrored', () => {
  const dip = byId('dip-8-w7.62');
  const right = [[0, 0], [0, 2.54], [0, 5.08], [0, 7.62], [7.62, 7.62], [7.62, 5.08], [7.62, 2.54], [7.62, 0]];
  const left = right.map(([x, y]) => [-x, y]);
  const top = placeModel(dip, right);
  near(top.angle, 0);
  assert.ok(top.miss < 0.01);
  assert.ok(placeModel(dip, left).miss > 7, 'seen from above, the second row is on the right of pins 1-4');
  const under = placeModel(dip, left, { side: 'bottom' });
  assert.equal(under.mirror, true);
  assert.ok(under.miss < 0.01, 'under the board the footprint is mirrored');
  // the fume extractor's ATmega: pins 1-14 run right along a row, 15-28 come back three holes up
  const atmega = byId('dip-28-w7.62-socket');
  const holes = [];
  for (let k = 0; k < 14; k++) holes.push([2.54 * (11 + k), 2.54 * 13]);
  for (let k = 0; k < 14; k++) holes.push([2.54 * (24 - k), 2.54 * 10]);
  const placed = placeModel(atmega, holes);
  near(placed.angle, -90);
  assert.ok(placed.miss < 0.01);
});

test('a model with more pins than the part has holes never fits', () => {
  assert.equal(placeModel(byId('dip-8-w7.62'), [[0, 0], [0, 2.54]]).miss, Infinity);
  assert.equal(placeModel(byId('dip-8-w7.62'), []).miss, Infinity);
});

test('a module wired in place sits in its outline, turned to fit', () => {
  const mp = byId('mp1584-module');
  const wide = placeInOutline(mp, [0, 0, 22, 17]);
  near(wide.angle, 0);
  near(wide.x, 1.5); // IN+ pad, 1.5 mm in from the top left corner
  near(wide.y, 1.5);
  assert.equal(wide.mirror, false);
  assert.equal(wide.miss, 0);
  const tall = placeInOutline(mp, [0, 0, 17, 22]);
  near(tall.angle, 90);
  near(tall.x, 15.5);
  near(tall.y, 1.5);
});

test('a KiCad model path finds its library entry', () => {
  assert.equal(entryForModelPath('${KICAD6_3DMODEL_DIR}/LED_THT.3dshapes/LED_D5.0mm.wrl', index).id, 'led-d5.0');
  assert.equal(entryForModelPath('${KICAD9_3DMODEL_DIR}/LED_THT.3dshapes/LED_D5.0mm.step', index).id, 'led-d5.0');
  assert.equal(entryForModelPath('${KISYS3DMOD}/Package_DIP.3dshapes/DIP-8_W7.62mm.STP', index).id, 'dip-8-w7.62');
  assert.equal(entryForModelPath('${KICAD9_3DMODEL_DIR}/Nope.3dshapes/Nope.step', index), null);
  assert.equal(entryForModelPath('', index), null);
});
