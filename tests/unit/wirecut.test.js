import test from 'node:test';
import assert from 'node:assert/strict';
import { cutMm, lengthText, pathMm, suggestedCut, wireCut, wireCutText } from '../../src/wirecut.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

test('a link is its path plus 5 mm at each end, rounded up to 5 mm', () => {
  near(pathMm([[2, 1], [2, 2]]), 2.54);
  assert.equal(cutMm([[2, 1], [2, 2]]), 15);
  assert.equal(cutMm([[3, 1], [3, 4]]), 20); // 17.62 → 20
  assert.equal(cutMm([[22, 1], [22, 3], [25, 3], [25, 7], [26, 8]]), 40); // a diagonal step counts as a diagonal
});

test('a zero-length step or a repeated hole adds nothing (Review Focus 1)', () => {
  assert.equal(cutMm([[5, 5], [5, 5]]), 10);
  assert.equal(cutMm([[5, 5], [5, 5], [5, 6]]), 15);
});

test("the fume extractor: 44 links numbered like sheet 4's wire list, 7 bare buses", () => {
  const c = wireCut(board);
  assert.equal(c.links.length, 44);
  assert.deepEqual(c.links[0], { n: 1, from: [2, 1], to: [2, 2], line: '+12 V', cut: 15, strip: 5 });
  assert.equal(c.buses.length, 7);
  assert.deepEqual(c.buses[0], { row: 2, from: 2, to: 32, line: '+12 V', cut: 90 });
  assert.deepEqual(c.totals, { insulated: { count: 44, mm: 1235 }, bare: { count: 7, mm: 520 } });
});

test('lengths in words, rounded up', () => {
  assert.equal(lengthText(520), 'about 55 cm');
  assert.equal(lengthText(1235), 'about 1.3 m');
  assert.equal(lengthText(1200), 'about 1.2 m');
});

test('suggested wires on your own board: lengths and a colour per kind of line', () => {
  const s = suggestedCut([
    { net: 'P5V', label: '+5 V', kind: 'power', wires: [{ path: [[1, 1], [1, 3]] }] },
    { net: 'GND', label: '0 V', kind: 'ground', wires: [{ path: [[2, 1], [2, 2]] }, { path: [[2, 2], [4, 2]] }] },
    { net: 'TACH', label: 'TACH', kind: 'signal', wires: [{ path: [[6, 1], [6, 2]] }] },
  ]);
  assert.deepEqual(s.lines.map((l) => [l.label, l.colour, l.mm]), [['+5 V', 'red', 20], ['0 V', 'black', 35], ['TACH', null, 15]]);
  assert.deepEqual(s.totals, { red: 20, black: 35, other: 15 });
});

test('the copy text has every link with its cut', () => {
  const t = wireCutText(wireCut(board));
  assert.match(t, /^1\. 2,1 → 2,2 \(\+12 V\): cut 15 mm, strip 5 mm at each end$/m);
  assert.match(t, /^Row 2 \(\+12 V\), 2 → 32: cut 90 mm$/m);
});
