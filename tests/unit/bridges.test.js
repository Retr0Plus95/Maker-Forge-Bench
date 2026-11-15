import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeRisks } from '../../src/bridges.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const board = parseProject(readFixture('forge-project/fume-extractor.json')).board;

test('the fume extractor: 26 places to watch for a bridge underneath', () => {
  const risks = bridgeRisks(board);
  const count = (kind) => risks.filter((r) => r.kind === kind).length;
  assert.equal(risks.length, 26);
  assert.deepEqual([count('pins'), count('bus'), count('buses')], [5, 19, 2]);
  assert.ok(risks.every((r) => r.id.startsWith('bridge:') && r.text && Array.isArray(r.at)));
  assert.equal(new Set(risks.map((r) => r.id)).size, 26);
});

test("two parts' legs on different lines, one hole apart", () => {
  const r = bridgeRisks(board).find((f) => f.kind === 'pins' && f.refs.includes('R4'));
  assert.deepEqual(r.refs, ['R4', 'U2']);
  assert.equal(r.text, 'R4 pin 2 (RST) is next to U2 pin 28 (SCL): keep the solder on each pad.');
  assert.deepEqual(r.at, [10.5, 10]);
});

test('a leg next to a bare bus of another line', () => {
  const r = bridgeRisks(board).find((f) => f.kind === 'bus' && f.refs[0] === 'J2' && f.text.startsWith('J2 pin 1 '));
  assert.equal(r.text, 'J2 pin 1 (0 V) is next to the +12 V bus: keep the solder on its own pad.');
  assert.deepEqual(r.refs, ['J2']);
});

test('two bare buses side by side are one place, with how far they run', () => {
  const texts = bridgeRisks(board).filter((f) => f.kind === 'buses').map((f) => f.text);
  assert.ok(texts.includes('The +5 V bus (row 18) and the 0 V bus (row 19) run side by side for 17 holes: keep a gap between them.'), texts.join('\n'));
  assert.ok(texts.includes('The 0 V bus (row 17) and the +5 V bus (row 18) run side by side for 9 holes: keep a gap between them.'), texts.join('\n'));
});

test("one part's own legs, and an underside part riding on its own line, aren't listed", () => {
  const risks = bridgeRisks(board);
  assert.ok(risks.every((r) => new Set(r.refs).size === r.refs.length));
  assert.ok(!risks.some((r) => r.refs.includes('C5') || r.refs.includes('C8') || r.refs.includes('C9') || r.refs.includes('Y1')),
    risks.filter((r) => /C5|C8|C9|Y1/.test(r.text)).map((r) => r.text).join('\n'));
});

const tiny = (pinsB, netB = 'B') => ({
  pitch: 2.54,
  parts: { R1: { type: 'resistor', side: 'top', pins: { 1: [1, 1], 2: [1, 4] } }, R2: { type: 'resistor', side: 'top', pins: { 1: pinsB, 2: [9, 9] } } },
  buses: [], links: [], bridges: [],
  nets: { A: [['R1', '1']], [netB]: [['R2', '1']] },
  netLabels: {},
});

test('only straight neighbours on different lines count; no board, no list', () => {
  assert.equal(bridgeRisks(tiny([2, 1])).length, 1);
  assert.equal(bridgeRisks(tiny([1, 2])).length, 1);
  assert.equal(bridgeRisks(tiny([2, 2])).length, 0); // diagonal
  assert.equal(bridgeRisks(tiny([3, 1])).length, 0); // two holes apart
  const same = tiny([2, 1], 'A');
  same.nets = { A: [['R1', '1'], ['R2', '1']] };
  assert.equal(bridgeRisks(same).length, 0);
  assert.deepEqual(bridgeRisks(null), []);
  assert.deepEqual(bridgeRisks({ parts: {} }), []);
});
