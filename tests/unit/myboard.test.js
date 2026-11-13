import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorFor, anchorPins, cleanMyBoard, photoTransform, snap } from '../../src/myboard.js';
import { parseProject } from '../../src/project.js';
import { exportProgress, importProgress } from '../../src/checklist.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const near = (a, b, tol = 0.5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const U2 = board.parts.U2.pins;

test('the anchor is the part with the most pins, tapped at its pin 1 and the far end of that row', () => {
  assert.equal(anchorFor(board), 'U2');
  assert.deepEqual(anchorPins(board.parts.U2), { a: '1', b: '14' });
  assert.deepEqual(anchorPins(board.parts.J5), { a: '1', b: '6' });
  assert.equal(anchorFor(null), null);
});

test("on the owner's top photo, two taps put pin 28 where it really is", () => {
  // measured on the photo: U2 pin 1 at (646, 810), pin 14 at (646, 1270), pin 28 at about (754, 815)
  const t = photoTransform(U2['1'], U2['14'], [646, 810], [646, 1270], 'top');
  assert.ok(near(t.toPixel(U2['28']), [752, 810], 4), String(t.toPixel(U2['28'])));
  assert.ok(Math.abs(t.pitch - 35.4) < 0.1, String(t.pitch));
});

test('on the underside photo, the rows swap: pin 28 is left of pin 1', () => {
  // measured: pin 1 at (835, 867), pin 14 at (835, 1340), pin 28 at about (730, 870)
  const t = photoTransform(U2['1'], U2['14'], [835, 867], [835, 1340], 'bottom');
  assert.ok(near(t.toPixel(U2['28']), [726, 867], 5), String(t.toPixel(U2['28'])));
});

test('pixels and holes convert both ways, and taps snap to the nearest hole', () => {
  for (const side of ['top', 'bottom']) {
    const t = photoTransform(U2['1'], U2['14'], [100, 100], [100, 360], side);
    for (const f of [[11, 13], [24, 10], [3, 2], [-4, 30]]) assert.ok(near(t.toBoard(t.toPixel(f)), f, 1e-9), `${side} ${f}`);
    assert.deepEqual(snap(t.toBoard([203, 178])), snap(t.toBoard([200, 180])));
  }
  assert.deepEqual(snap([2.4, -1.6]), [2, -2]);
});

test('a turned photo works the same: the chip running left to right', () => {
  const t = photoTransform(U2['1'], U2['14'], [100, 500], [360, 500], 'top');
  assert.ok(near(t.toPixel(U2['28']), [100, 440], 1e-6), String(t.toPixel(U2['28'])));
});

test('two taps on the same spot give no transform', () => {
  assert.equal(photoTransform(U2['1'], U2['14'], [5, 5], [5, 5], 'top'), null);
  assert.equal(photoTransform(U2['1'], U2['1'], [5, 5], [9, 9], 'top'), null);
});

test('saved board data is checked: anything odd is dropped', () => {
  const isRef = (r) => /^[A-Za-z0-9_+.-]{1,20}$/.test(r);
  const clean = cleanMyBoard({
    anchor: 'U2',
    photos: {
      top: { side: 'top', a: { pin: '1', x: 646, y: 810 }, b: { pin: '14', x: 646, y: 1270 }, bright: true },
      bad: { side: 'sideways', a: { pin: '1', x: 1, y: 1 }, b: { pin: '14', x: 2, y: 2 } },
      nan: { side: 'top', a: { pin: '1', x: 'x', y: 1 }, b: { pin: '14', x: 2, y: 2 } },
    },
    placed: { R8: { 1: [13, 8], 2: [13, 9] }, '<b>': { 1: [1, 1] }, R9: { 1: [1.5, 2] }, R7: 'nope' },
  }, isRef);
  assert.equal(clean.anchor, 'U2');
  assert.deepEqual(Object.keys(clean.photos), ['top']);
  assert.equal(clean.photos.top.bright, true);
  assert.deepEqual(clean.placed, { R8: { 1: [13, 8], 2: [13, 9] } });
  assert.deepEqual(cleanMyBoard('junk', isRef), { anchor: null, photos: {}, placed: {} });
});

test('progress files carry your board, and older files read as empty', () => {
  const myBoard = { anchor: 'U2', photos: { top: { side: 'top', a: { pin: '1', x: 1, y: 2 }, b: { pin: '14', x: 1, y: 300 } } }, placed: { R8: { 1: [13, 8], 2: [13, 9] } } };
  const text = exportProgress({ project: 'x', revision: null, ticked: [], sheetPrints: {}, flipped: [], myBoard });
  assert.deepEqual(importProgress(text).myBoard, { ...myBoard, photos: { top: { ...myBoard.photos.top, bright: false } } });
  const old = JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [] });
  assert.deepEqual(importProgress(old).myBoard, { anchor: null, photos: {}, placed: {} });
});

test('your placements become a board the 3D view can draw, shifted to start at hole 2', async () => {
  const { boardFromPlacement } = await import('../../src/myboard.js');
  const placed = { R8: { 1: [13, 8], 2: [13, 10] }, C10: { p: [-3, 4], n: [-3, 6] } };
  const b = boardFromPlacement(board, placed, 'U2');
  assert.deepEqual(Object.keys(b.parts).sort(), ['C10', 'R8', 'U2']);
  const allHoles = Object.values(b.parts).flatMap((p) => Object.values(p.pins));
  assert.equal(Math.min(...allHoles.map((h) => h[0])), 2);
  assert.equal(Math.min(...allHoles.map((h) => h[1])), 2);
  assert.ok(b.cols >= Math.max(...allHoles.map((h) => h[0])) + 1 && b.rows >= Math.max(...allHoles.map((h) => h[1])) + 1);
  const shift = [2 - (-3), 2 - Math.min(4, 8, 10, 13)];
  assert.deepEqual(b.parts.R8.pins['1'], [13 + shift[0], 8 + shift[1]]);
  assert.equal(b.parts.R8.type, 'res');
  assert.equal(b.parts.C10.D, board.parts.C10.D, 'sizes come from the project');
  assert.deepEqual([b.buses, b.links, b.bridges], [[], [], []], 'your wiring is not known yet');
  assert.equal(b.placedCount, 2);
  assert.equal(boardFromPlacement(board, {}, null), null);
});
