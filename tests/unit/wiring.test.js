import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroundLabel, isPowerLabel, pinText, stillToWire, wiringGroups, wiringText } from '../../src/wiring.js';
import { connectionsOf, parseProject } from '../../src/project.js';
import { exportProgress, importProgress } from '../../src/checklist.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;

test('supply and 0 V lines are recognised from their labels', () => {
  assert.ok(isPowerLabel('+5 V') && isPowerLabel('+12 V') && isPowerLabel('+3.3V'));
  assert.ok(!isPowerLabel('TACHA') && !isPowerLabel('0 V'));
  assert.ok(isGroundLabel('0 V', 'GND') && isGroundLabel('GND', 'X') && isGroundLabel('anything', 'GND'));
  assert.ok(!isGroundLabel('+5 V', 'P5V'));
});

test('pins read the way they are marked on the part', () => {
  assert.equal(pinText('7'), 'pin 7');
  assert.equal(pinText('p'), '+');
  assert.equal(pinText('n'), '−');
  assert.equal(pinText('OUTp'), 'OUT+');
  assert.equal(pinText('INn'), 'IN−');
  assert.equal(pinText('K'), 'K (band)');
  assert.equal(pinText('B'), 'B');
});

test('the wiring list: supplies first, then 0 V, then signals A to Z, one line each', () => {
  const groups = wiringGroups(board);
  assert.deepEqual(groups.slice(0, 3).map((g) => g.label), ['+12 V', '+5 V', '0 V']);
  assert.deepEqual(groups.slice(0, 3).map((g) => g.kind), ['power', 'power', 'ground']);
  const five = groups[1];
  assert.ok(five.members.some((m) => m.key === 'U2:7' && m.text === 'U2 pin 7'), 'chip pin 7 is on +5 V');
  assert.ok(five.members.some((m) => m.key === 'U2:20'));
  assert.ok(five.members.some((m) => m.key === 'U1:OUTp' && m.text === 'U1 OUT+'));
  const signals = groups.slice(3).map((g) => g.label);
  assert.deepEqual(signals, [...signals].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  assert.ok(groups.every((g) => g.members.length >= 2), 'a line with one member needs no wire');
  assert.deepEqual(wiringGroups(null), []);
});

test('copy as text says what is wired and what is not', () => {
  const groups = wiringGroups(board).slice(1, 2);
  const text = wiringText(groups, new Set(['U2:7']));
  const lines = text.split('\n');
  assert.match(lines[0], /^\+5 V: 1 of \d+ wired$/);
  assert.ok(lines.includes('  [x] U2 pin 7'));
  assert.ok(lines.includes('  [ ] U2 pin 20'));
});

test("a part's pins still to wire", () => {
  const conns = connectionsOf(board, 'R8');
  assert.deepEqual(stillToWire('R8', conns, new Set()), ['1', '2']);
  assert.deepEqual(stillToWire('R8', conns, new Set(['R8:1'])), ['2']);
  assert.deepEqual(stillToWire('R8', conns, new Set(['R8:1', 'R8:2'])), []);
});

test('progress files carry the wired ticks, and older files read as none', () => {
  const text = exportProgress({ project: 'x', revision: null, ticked: ['R1'], sheetPrints: {}, flipped: [], wired: ['U2:7', 'R8:1'] });
  assert.deepEqual(importProgress(text).wired, ['U2:7', 'R8:1']);
  const old = JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [] });
  assert.deepEqual(importProgress(old).wired, []);
  const bad = JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [], wired: [5, 'x'.repeat(300)] });
  assert.deepEqual(importProgress(bad).wired, [], 'bad entries are dropped, not fatal');
});
