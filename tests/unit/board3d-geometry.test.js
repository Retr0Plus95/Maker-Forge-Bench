import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_THICKNESS, SIZES, partGeometry, radiusAt, resistorProfile } from '../../src/board3d-geometry.js';
import { footprint } from '../../src/boardcheck.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const body = (ref) => partGeometry(board.parts[ref], board.pitch, ref).find((p) => p.role === 'body');

test('a standing resistor stands over its body hole, at its datasheet size (6.3 × 2.4 mm)', () => {
  const b = body('R8');
  assert.equal(b.kind, 'lathe');
  assert.ok(near(b.x, 63.5) && near(b.y, 12.7), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [1.2, 6.3]);
});

test("a resistor's body has its real outline: round end caps and a narrower waist (Yageo CFR-25)", () => {
  const profile = resistorProfile();
  assert.ok(near(radiusAt(profile, 0.8), 1.2), 'the cap is 2.4 mm across');
  assert.ok(near(radiusAt(profile, 3.15), 1.05), 'the waist is 2.1 mm across');
  assert.ok(radiusAt(profile, 0.05) < 1.0, 'the ends are rounded');
  assert.equal(profile.at(-1)[1], 6.3);
});

test('an electrolytic can sits between its pins, sized by its diameter', () => {
  const b = body('C1A');
  assert.equal(b.kind, 'lathe');
  assert.ok(near(b.x, 12.7) && near(b.y, 5.08), `${b.x},${b.y}`);
  assert.deepEqual([b.radius, b.h], [4, 11.5]);
});

test('an electrolytic has its rubber bung, the bead groove and the rolled top; the value is printed on the sleeve', () => {
  const prims = partGeometry(board.parts.C1A, board.pitch, 'C1A', { value: '470 µF 25 V' });
  const b = prims.find((p) => p.role === 'body');
  assert.ok(prims.some((p) => p.role === 'bung'));
  assert.ok(radiusAt(b.profile, 1.4) < 3.9, 'the groove');
  assert.ok(radiusAt(b.profile, 11.49) < 3.7, 'rolled over at the top');
  const value = prims.find((p) => p.kind === 'print' && p.text === '470µF 25V');
  const stripe = prims.find((p) => p.role === 'stripe');
  assert.ok(value && value.normal[0] * stripe.dir[0] + value.normal[1] * stripe.dir[1] < 0, 'on the far side from the stripe');
  const tall = partGeometry({ ...board.parts.C1A, H: 16 }, board.pitch, 'C1A').find((p) => p.role === 'body');
  assert.equal(tall.h, 16, 'a taller can when you say so');
});

test('the chip is a real PDIP-28 (34.7 × 7.24 × 3.3 mm) sitting in its socket over its pins', () => {
  const b = body('U2');
  assert.equal(b.kind, 'box');
  assert.ok(near(b.x, 41.91) && near(b.y, 26.67), `${b.x},${b.y}`);
  assert.ok(Math.abs(b.w - 34.7) < 0.3 && near(b.d, 6.6) && near(b.h, 3.3), `${b.w}x${b.d}x${b.h}`);
  const prims = partGeometry(board.parts.U2, board.pitch, 'U2', { value: 'ATmega328P-PU' });
  assert.ok(near(prims.find((p) => p.role === 'mould').d, 7.24), '7.24 mm across at the mould line');
  assert.equal(prims.filter((p) => p.role === 'socket').length, 4, 'two rails and two ends');
  const legs = prims.filter((p) => p.role === 'leg');
  assert.equal(legs.length, 28);
  assert.ok(legs.every((l) => near(l.w, 0.46) && near(l.d, 0.25)), 'flat 0.46 mm tips');
  assert.ok(prims.filter((p) => p.role === 'leg-shoulder').every((l) => near(l.w, 1.52)), '1.52 mm shoulders');
  assert.ok(prims.some((p) => p.role === 'notch') && prims.some((p) => p.role === 'dot'));
  assert.equal(prims.find((p) => p.kind === 'print').text, 'ATMEGA328P-PU');
  assert.equal(prims.filter((p) => p.kind === 'joint').length, 28, 'a solder joint under every leg');
});

test('underside parts hang below the board, with no joints of their own', () => {
  for (const ref of ['C5', 'C8', 'C9', 'Y1']) {
    for (const p of partGeometry(board.parts[ref], board.pitch, ref, { value: '100 nF' })) {
      assert.notEqual(p.kind, 'joint', ref);
      if (p.kind === 'wire') continue;
      const lying = p.kind === 'hcyl' || (p.kind === 'lathe' && p.z0 === undefined);
      const topZ = lying ? p.z + p.radius : p.kind === 'print' ? p.z : p.z0 + p.h;
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
  assert.ok(body('R4').kind === 'lathe' && body('R4').x1 !== undefined, 'lying');
  const flat = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [1, 3] }, mount: 'flat' }, 2.54).find((p) => p.role === 'body');
  assert.ok(flat.kind === 'lathe' && flat.z0 === undefined);
  const stand = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [1, 6] }, mount: 'stand', body: '1' }, 2.54).find((p) => p.role === 'body');
  assert.ok(stand.kind === 'lathe' && near(stand.x, 0) && near(stand.y, 0), 'over pin 1');
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

test('the bands sit as on a real resistor: three by one cap, the tolerance band alone at the other', () => {
  const prims = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [6, 1] }, mount: 'flat' }, 2.54, 'R1', { value: '4.7k' });
  const b = prims.find((p) => p.role === 'body');
  const at = prims.filter((p) => p.role === 'band').map((q) => (q.x1 + q.x2) / 2 - b.x1);
  assert.equal(at.length, 4);
  assert.ok(at[2] < b.len / 2 && at[3] > b.len - 1.2, at.join(', '));
  assert.ok(at[3] - at[2] > 2.5, 'a clear gap before the tolerance band');
});

test('a resistor can have a blue (metal film) body', () => {
  const blue = partGeometry({ type: 'res', pins: { 1: [1, 1], 2: [6, 1] }, mount: 'flat', colour: 'blue' }, 2.54).find((p) => p.role === 'body');
  assert.equal(blue.colour, '#3f7fc4');
});

test('the chip can sit in two female header strips (8.5 mm), or be soldered straight in', () => {
  const sock = partGeometry(board.parts.U2, board.pitch, 'U2').find((p) => p.role === 'body');
  const strips = partGeometry({ ...board.parts.U2, holder: 'strips' }, board.pitch, 'U2');
  const rows = strips.filter((p) => p.role === 'socket');
  assert.equal(rows.length, 2);
  const long = (r) => Math.max(r.w, r.d);
  const short = (r) => Math.min(r.w, r.d);
  assert.ok(rows.every((r) => near(r.h, SIZES.strip.height) && Math.abs(long(r) - 35.56) < 0.01 && near(short(r), 2.54)), JSON.stringify(rows));
  const high = strips.find((p) => p.role === 'body');
  assert.ok(high.z0 > sock.z0 + 4, `higher up: ${high.z0} vs ${sock.z0}`);
  const none = partGeometry({ ...board.parts.U2, holder: 'none' }, board.pitch, 'U2');
  assert.equal(none.filter((p) => p.role === 'socket').length, 0);
  assert.ok(none.find((p) => p.role === 'body').z0 < 1);
  assert.ok(none.filter((p) => p.role === 'leg').every((l) => l.z0 < -BOARD_THICKNESS), 'the legs go through the board');
});

test('a TO-220 regulator: 10.2 mm wide, its tab with the hole behind, three legs, the printed face as told', () => {
  const part = { type: 'to220', side: 'top', pins: { IN: [5, 5], GND: [6, 5], OUT: [7, 5] } };
  const prims = partGeometry(part, 2.54, 'U1', { value: 'L7805CV regulator' });
  const b = prims.find((p) => p.role === 'body');
  const tab = prims.find((p) => p.role === 'tab');
  assert.ok(near(b.w, 10.2) && near(b.h, 9.2) && near(tab.h, 15.5) && near(tab.d, 1.27));
  assert.ok(b.y > tab.y, 'faces down the board by default: the tab is behind');
  assert.ok(near(b.d + tab.d, 4.5), '4.5 mm thick with the tab');
  assert.ok(near(prims.find((p) => p.role === 'hole').radius, 1.9));
  assert.equal(prims.filter((p) => p.role === 'leg').length, 3);
  assert.equal(prims.find((p) => p.kind === 'print').text, 'L7805CV');
  const up = partGeometry({ ...part, facing: 'up' }, 2.54, 'U1');
  assert.ok(up.find((p) => p.role === 'body').y < up.find((p) => p.role === 'tab').y);
  const standing = { type: 'to220', side: 'top', pins: { IN: [5, 5], GND: [5, 6], OUT: [5, 7] } };
  assert.ok(Math.abs(partGeometry(standing, 2.54, 'U1').find((p) => p.role === 'body').angle - Math.PI / 2) < 1e-9);
  const box = footprint(standing, 2.54, 'U1');
  assert.ok(box[3] - box[1] > 10 && box[2] - box[0] < 5, `turned with its legs: ${box}`);
});

test('an LED gets its colour from the value, and its flange is flat on the cathode side', () => {
  const part = { type: 'led', side: 'top', pins: { A: [1, 1], K: [2, 1] } };
  const red = partGeometry(part, 2.54, 'D2', { value: '5 mm red LED' });
  assert.equal(red.find((p) => p.role === 'body').colour, '#ff3b30');
  const flange = red.find((p) => p.role === 'flange');
  const xs = flange.outline.map(([x]) => x);
  assert.ok(Math.max(...xs) < Math.abs(Math.min(...xs)) - 0.2, 'cut flat toward K (+x)');
  assert.equal(partGeometry({ ...part, colour: 'yellow' }, 2.54, 'D2', { value: '5 mm red LED' }).find((p) => p.role === 'body').colour, '#ffd60a', 'what you fitted wins');
  const top = red.find((p) => p.role === 'body');
  assert.ok(near(top.z0 + top.h, 9.6), '8.6 mm tall from the flange');
});

test('a ceramic can be a blue dipped one, its coating running down the legs', () => {
  const part = { type: 'cer', side: 'top', pins: { 1: [1, 1], 2: [3, 1] } };
  const disc = partGeometry(part, 2.54, 'C3');
  assert.equal(disc.filter((p) => p.role === 'coating').length, 2);
  const dipped = partGeometry({ ...part, style: 'dipped' }, 2.54, 'C3').find((p) => p.role === 'body');
  assert.ok(dipped.colour === '#2f6fd6' && near(dipped.radius, 2.1));
});

test('header pins have pointed tips; a female header is a tall strip with an opening at each pin', () => {
  const pins = { 1: [1, 1], 2: [2, 1], 3: [3, 1] };
  const male = partGeometry({ type: 'header', side: 'top', pins }, 2.54, 'J9');
  assert.equal(male.filter((p) => p.role === 'tip').length, 3);
  const female = partGeometry({ type: 'header', side: 'top', pins, female: true }, 2.54, 'J9');
  assert.ok(near(female.find((p) => p.role === 'body').h, 8.5));
  assert.equal(female.filter((p) => p.role === 'contact').length, 3);
});

test('the crystal sits on its base flange', () => {
  const prims = partGeometry(board.parts.Y1, board.pitch, 'Y1');
  const flange = prims.find((p) => p.role === 'flange');
  const b = prims.find((p) => p.role === 'body');
  assert.ok(flange && near(flange.z0 + flange.h, -BOARD_THICKNESS - 0.4) && near(b.z0 + b.h, flange.z0));
});
