import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSpots } from '../../src/suggest.js';
import { holeName, labelsMap } from '../../src/holenames.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const U2 = board.parts.U2.pins;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

test("C5 goes across the chip's pins 7 and 8, soldered onto them underneath", () => {
  const { spots } = suggestSpots(board, {}, 'U2', 'C5');
  assert.ok(spots.length >= 1);
  assert.ok(same(spots[0].pins['1'], U2['7']) && same(spots[0].pins['2'], U2['8']), JSON.stringify(spots[0]));
  assert.equal(spots[0].score, 0);
  assert.equal(spots[0].reason, 'on U2 pin 7 and pin 8');
});

test('C9 goes across pins 20 and 22, turned from how the drawing has it', () => {
  const { spots } = suggestSpots(board, {}, 'U2', 'C9');
  assert.ok(same(spots[0].pins['1'], U2['20']) && same(spots[0].pins['2'], U2['22']), JSON.stringify(spots[0]));
  assert.equal(spots[0].reason, 'on U2 pin 20 and pin 22');
});

test('the best three spots, all different, best first', () => {
  const { spots } = suggestSpots(board, {}, 'U2', 'C5');
  assert.equal(spots.length, 3);
  const keys = spots.map((s) => JSON.stringify(Object.values(s.pins).sort()));
  assert.equal(new Set(keys).size, 3);
  assert.ok(spots[0].score <= spots[1].score && spots[1].score <= spots[2].score);
});

test("a top part never shares a hole, and its body keeps clear of the chip's", () => {
  const { spots } = suggestSpots(board, {}, 'U2', 'R8');
  assert.ok(spots.length);
  const chipHoles = new Set(Object.values(U2).map(String));
  for (const s of spots) assert.ok(Object.values(s.pins).every((h) => !chipHoles.has(String(h))), JSON.stringify(s.pins));
  assert.match(spots[0].reason, /U2 pin \d+/);
});

test('a leg is never put on a hole of a different line, even underneath', () => {
  const { spots } = suggestSpots(board, { R8: { 1: [17, 14], 2: [17, 16] } }, 'U2', 'C5');
  assert.ok(same(spots[0].pins['1'], U2['7']), 'R8 pin 1 (+5 V) next to it is fine');
  const blocked = suggestSpots(board, { R6: { 1: [16, 14], 2: [17, 15] } }, 'U2', 'C5');
  assert.ok(blocked.spots.every((s) => Object.values(s.pins).every((h) => !same(h, [17, 15]))));
});

test('with nothing it connects to placed, it says what to do first', () => {
  const tiny = { pitch: 2.54, netLabels: {}, nets: { A: [['R1', '1'], ['R2', '1']], B: [['R2', '2'], ['R3', '1']] }, parts: {
    R1: { type: 'res', side: 'top', pins: { 1: [2, 2], 2: [2, 5] } },
    R2: { type: 'res', side: 'top', pins: { 1: [4, 2], 2: [4, 5] } },
    R3: { type: 'res', side: 'top', pins: { 1: [6, 2], 2: [6, 5] } },
  } };
  const r = suggestSpots(tiny, {}, 'R1', 'R3');
  assert.equal(r.spots.length, 0);
  assert.match(r.why, /^Place a part that R3 connects to first/);
  assert.equal(suggestSpots(tiny, { R2: { 1: [4, 2], 2: [4, 5] } }, 'R1', 'R3').spots[0].reason, 'next to R2 pin 2');
  assert.match(suggestSpots(board, {}, 'U2', 'U2').why, /Nothing to suggest/);
});

test('with hole names, the reason says where', () => {
  const map = labelsMap({ a: { pin: '1', text: 'L21' }, b: { pin: '14', text: 'L8' }, c: { pin: '28', text: 'O21' } }, board.parts.U2);
  const { spots } = suggestSpots(board, {}, 'U2', 'C5', { name: (h) => holeName(map, h) });
  assert.equal(spots[0].reason, 'on U2 pin 7 (L15) and pin 8 (L14)');
});

test('when nothing close fits, it looks farther', () => {
  // a crowd of 0 V legs fills every hole within 5 of R3's line, so the nearest free spot is farther out
  const crowd = {};
  const nets = { A: [['R1', '1'], ['R3', '1']], G: [] };
  for (let c = -5; c <= 7; c++) {
    for (let r = -5; r <= 7; r++) {
      if (c === 1 && r === 1) continue;
      const ref = `X${c + 5}_${r + 5}`;
      crowd[ref] = { type: 'underside', side: 'bottom', pins: { 1: [c, r] } };
      nets.G.push([ref, '1']);
    }
  }
  const tiny = { pitch: 2.54, netLabels: {}, nets, parts: { R1: { type: 'underside', side: 'top', pins: { 1: [1, 1] } }, R3: { type: 'res', side: 'top', pins: { 1: [20, 20], 2: [20, 23] } }, ...crowd } };
  const placed = Object.fromEntries(Object.entries(crowd).map(([ref, p]) => [ref, p.pins]));
  const { spots } = suggestSpots(tiny, placed, 'R1', 'R3');
  assert.ok(spots.length, 'found one farther out');
  assert.ok(spots[0].score > 4);
});
