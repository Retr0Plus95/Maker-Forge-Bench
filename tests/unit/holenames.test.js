import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLetters, holeName, letterIndex, lettersFor, parseLabel, solveLabels } from '../../src/holenames.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const U2 = parseProject(readFixture('forge-project/fume-extractor.json')).board.parts.U2.pins;

test('labels read the way people write them', () => {
  assert.deepEqual(parseLabel('L21'), { letters: 'L', num: 21, padded: false });
  assert.deepEqual(parseLabel(' l 08 '), { letters: 'L', num: 8, padded: true });
  assert.deepEqual(parseLabel('21L'), { letters: 'L', num: 21, padded: false });
  assert.equal(parseLabel('hello'), null);
  assert.equal(parseLabel(''), null);
});

test('letters, with skipped ones and AA after Z', () => {
  const all = boardLetters('');
  assert.equal(letterIndex('L', all), 12);
  assert.equal(lettersFor(27, all), 'AA');
  assert.equal(letterIndex('AA', all), 27);
  const noW = boardLetters('w');
  assert.equal(noW.length, 25);
  assert.equal(letterIndex('X', noW), 23);
  assert.equal(letterIndex('W', noW), null);
});

test("the owner's board: pin 1 at L21, pin 14 at L8, pin 28 at O21", () => {
  const r = solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'L8', 'O21');
  assert.equal(r.ok, true, r.why);
  assert.equal(holeName(r.map, U2['1']), 'L21');
  assert.equal(holeName(r.map, U2['7']), 'L15');
  assert.equal(holeName(r.map, U2['8']), 'L14');
  assert.equal(holeName(r.map, U2['14']), 'L8');
  assert.equal(holeName(r.map, U2['20']), 'O13');
  assert.equal(holeName(r.map, U2['22']), 'O15');
  assert.equal(holeName(r.map, U2['28']), 'O21');
});

test('a board with the letters down the side and numbers along the top works too', () => {
  const r = solveLabels(U2['1'], U2['14'], U2['28'], 'C5', 'P5', 'C8');
  assert.equal(r.ok, true, r.why);
  assert.equal(holeName(r.map, U2['7']), 'I5');
  assert.equal(holeName(r.map, U2['28']), 'C8');
});

test('leading zeros are kept when the board prints them', () => {
  const r = solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'L08', 'O21');
  assert.equal(holeName(r.map, U2['14']), 'L08');
  assert.equal(holeName(r.map, U2['8']), 'L14');
});

test("labels that don't fit say why", () => {
  assert.match(solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'L9', 'O21').why, /13 rows apart; those are 12/);
  assert.match(solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'M8', 'O21').why, /only the letter or only the number/);
  assert.match(solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'L8', 'O20').why, /same number as pin 1/);
  assert.match(solveLabels(U2['1'], U2['14'], U2['28'], 'L21', 'L8', 'x').why, /letter and a number/);
  assert.match(solveLabels(U2['1'], U2['14'], U2['28'], 'W21', 'W8', 'Z21', 'W').why, /skips/);
});

test('holes off the labels have no name', () => {
  const r = solveLabels(U2['1'], U2['14'], U2['28'], 'A21', 'A8', 'D21');
  assert.equal(holeName(r.map, [11, 20]), null, 'left of column A');
});

test('the pin across from pin 1, and the names along the edges', async () => {
  const { acrossPin, edgeName, labelsMap } = await import('../../src/holenames.js');
  const chip = parseProject(readFixture('forge-project/fume-extractor.json')).board.parts.U2;
  assert.equal(acrossPin(chip, '1', '14'), '28');
  assert.equal(acrossPin({ pins: { 1: [0, 0], 2: [1, 0] } }, '1', '2'), null, 'one row has nothing across');
  const map = labelsMap({ a: { pin: '1', text: 'L21' }, b: { pin: '14', text: 'L8' }, c: { pin: '28', text: 'O21' }, skip: '' }, chip);
  assert.equal(edgeName(map, 1, 13), 'L');
  assert.equal(edgeName(map, 1, 10), 'O');
  assert.equal(edgeName(map, 0, 17), '15');
  assert.equal(labelsMap({ a: { pin: '1', text: 'L21' }, b: { pin: '14', text: 'L9' }, c: { pin: '28', text: 'O21' } }, chip), null);
  assert.equal(labelsMap({ a: { pin: '99', text: 'L21' }, b: { pin: '14', text: 'L8' }, c: { pin: '28', text: 'O21' } }, chip), null);
});
