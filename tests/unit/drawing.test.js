import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSvg } from '../../src/sanitize.js';
import { indexSheet } from '../../src/search.js';
import {
  cleanDrawingProgress, drawingNeeds, endsOf, expectedVolts, notAPart, parseTransform, questionOf, readChecks,
  readDrawing, readNotes, readWireTable, rowsOf, sheetTexts, wiresText,
} from '../../src/drawing.js';
import { FUME_SVGS, nodeParser, readFixture, sheetIdOf } from './helpers.js';

const PSU = 'psu-like/wiring.svg';
const root = (rel) => prepareSvg(readFixture(rel), nodeParser(), rel).doc.documentElement;
const svg = (body) => prepareSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">${body}</svg>`, nodeParser(), 't.svg').doc.documentElement;
const psuTexts = sheetTexts(root(PSU));
const psu = readDrawing('wiring', psuTexts);
const byId = (list, id) => list.find((x) => x.id === id);
/** Texts laid out by hand: [text, x, y]. */
const laid = (rows, size = 5) => rows.map(([text, x, y]) => ({ text, x, y, size, el: null }));

test('transforms: translate, scale, matrix and rotate compose left to right', () => {
  assert.deepEqual(parseTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
  assert.deepEqual(parseTransform('matrix(1 0 0 1 5 6)'), [1, 0, 0, 1, 5, 6]);
  const r = parseTransform('rotate(90)');
  assert.ok(Math.abs(r[1] - 1) < 1e-9 && Math.abs(r[2] + 1) < 1e-9);
  assert.deepEqual(parseTransform('nonsense(1)'), [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(parseTransform(null), [1, 0, 0, 1, 0, 0]);
});

test('a label kept as a comment before its letter shapes is read, with its place and size', () => {
  const t = psuTexts.find((x) => x.text === 'W9');
  assert.deepEqual([t.x, t.y], [420, 90]);
  assert.ok(Math.abs(t.size - 5.2) < 1e-9, 'matplotlib: the scale times 100 is the size in points');
  assert.equal(t.el.localName, 'g');
  assert.equal(psuTexts.length, 91);
});

test('real <text> counts too, through its own and its parents\' transforms; a comment alone does not', () => {
  const texts = sheetTexts(svg(`<!-- just a note --><rect width="1" height="1"/>
    <g transform="translate(10 5)"><text x="2" y="3" font-size="4">R6 10k</text></g>
    <text transform="translate(1 1)"><tspan x="7" y="8">U2</tspan></text><text x="0" y="0"> </text>`));
  assert.deepEqual(texts.map((t) => [t.text, t.x, t.y, t.size]), [['R6 10k', 12, 8, 4], ['U2', 8, 9, 10]]);
});

test('Find part indexes comment labels like any other text', () => {
  const labels = indexSheet('wiring', root(PSU));
  assert.ok(labels.some((l) => l.text === 'U1 KIT BOARD' && l.el.localName === 'g'));
  assert.equal(indexSheet('k', root('kicad-like/kicad-like.svg')).every((l) => l.el.localName === 'text'), true);
});

test('rows: baselines within half a text height share a row, left to right', () => {
  const rows = rowsOf(laid([['b', 20, 10], ['a', 5, 11], ['c', 0, 30]]));
  assert.deepEqual(rows.map((r) => r.texts.map((t) => t.text)), [['a', 'b'], ['c']]);
});

test('the wire table: one wire per row, in order, with its ends, its wire and its note', () => {
  assert.deepEqual(psu.wires.map((w) => w.id), ['W1', 'W2', 'W3', 'W7', 'W8', 'W9', 'W13', 'W17', 'W18']);
  const w9 = byId(psu.wires, 'W9');
  assert.deepEqual([w9.from, w9.to, w9.wire, w9.note], ['U1 OUT +', 'J1 + red post', '0.5 mm² red', 'up to 0.7 A']);
  assert.deepEqual(w9.fromEnds, [{ ref: 'U1', end: 'OUT +', text: 'U1 OUT +' }]);
  assert.deepEqual(byId(psu.wires, 'W17').toEnds.map((e) => e.ref), ['M1', 'LED1']);
  assert.deepEqual(psu.wires.filter((w) => w.mains).map((w) => w.id), ['W1', 'W2', 'W3']);
  assert.deepEqual(byId(psu.wires, 'W13').notes, [1]);
  assert.equal(psu.hasTable, true);
});

test('a list beside the table on the same lines stays out of it; its title ends nothing in the table', () => {
  assert.ok(psu.wires.every((w) => !/Unplugged|C1 big cap/.test(`${w.note} ${w.wire}`)));
  assert.equal(byId(psu.wires, 'W18').note, '');
});

test('no table: no From and To headers; a header with no rows gives an empty one', () => {
  assert.equal(readWireTable(laid([['FROM', 0, 0], ['WHERE', 30, 0]])), null);
  const empty = readWireTable(laid([['From', 0, 0], ['To', 30, 0]]));
  assert.deepEqual(empty.wires, []);
});

test('wires with no number column are numbered in order; Swedish headers work', () => {
  const t = readWireTable(laid([['Från', 0, 0], ['Till', 40, 0], ['R1 1', 0, 10], ['U1 2', 40, 10], ['R2 2', 0, 20], ['U1 3', 40, 20]]));
  assert.deepEqual(t.wires.map((w) => [w.id, w.from, w.to]), [['W1', 'R1 1', 'U1 2'], ['W2', 'R2 2', 'U1 3']]);
});

test('the checks list: key and sentence, wrapped lines joined, the next title not taken in', () => {
  assert.deepEqual(psu.checks.map((c) => c.key), ['OFF', 'TP1', 'TP2', 'LIMIT']);
  assert.equal(psu.checks[3].text, 'Short OUT through the meter; A knob up to 0.5 A. Stay at or under 0.7 A.');
  assert.deepEqual(psu.checks[1].volts, { min: 24, max: 27 });
  assert.equal(psu.checks[1].tp, 'TP1');
  assert.equal(readChecks(laid([['Nothing here', 0, 0]])), null);
});

test('the notes list: a number, then its lines; a table column called NOTE is not the notes', () => {
  assert.deepEqual(psu.notes, [
    { n: 1, text: "METER TRAP: the meter's thin black goes to OUT −, never to GND." },
    { n: 4, text: 'Which AC24V screws? Beep each screw to the diodes; the two that beep take W7 and W8.' },
  ]);
  assert.equal(readNotes(laid([['NOTES', 0, 0, 7]])), null);
});

test('ends, volts and questions read the way builders write them', () => {
  assert.deepEqual(endsOf('X1 wire A'), [{ ref: 'X1', end: 'wire A', text: 'X1 wire A' }]);
  assert.deepEqual(endsOf('the fan'), [{ ref: null, end: 'the fan', text: 'the fan' }]);
  assert.deepEqual(endsOf(''), []);
  assert.deepEqual(expectedVolts('C1 big cap: 24–27 V with no load (≈ 20 V loaded).'), { min: 24, max: 27 });
  assert.deepEqual(expectedVolts('OUT: 0 → ≈ 20 V with the V knob'), { min: 0, max: 20 });
  assert.deepEqual(expectedVolts('set 12.0 V'), { min: 12, max: 12 });
  assert.deepEqual(expectedVolts('4,98 V'), { min: 4.98, max: 4.98 });
  assert.equal(expectedVolts('A knob up to 0.5 A'), null);
  assert.equal(questionOf('Mains first. Which AC24V screws? Beep them.'), 'Which AC24V screws?');
  assert.equal(questionOf('No question here.'), null);
});

test('tags and test points on the drawing; parts drawn outside the table', () => {
  assert.deepEqual([...psu.tags.keys()], ['W1', 'W2', 'W3', 'W7', 'W8', 'W9', 'W13', 'W21']);
  assert.deepEqual([...psu.testPoints.keys()], ['TP1', 'TP2', 'TP3']);
  assert.ok(psu.partRefs.has('U1') && psu.partRefs.has('LED1') && !psu.partRefs.has('Q9'));
});

test('what Bench needs from the test drawing, each with what it is about', () => {
  const needs = drawingNeeds([psu], { hasBoard: false });
  assert.deepEqual(needs.map((n) => n.id), [
    'undrawn:wiring:Q9', 'notag:wiring', 'extratag:wiring', 'ask:wiring:4', 'tpcheck:wiring', 'reading:wiring:TP2',
  ]);
  assert.equal(byId(needs, 'notag:wiring').text, 'W17 and W18 have no tag on the drawing, so Show can only ring the parts at their ends.');
  assert.equal(byId(needs, 'extratag:wiring').text, 'W21 is on the drawing but not in the wire table.');
  const ask = byId(needs, 'ask:wiring:4');
  assert.deepEqual([ask.question, ask.wires, ask.fixInDrawing], ['Which AC24V screws?', ['W7', 'W8'], false]);
  assert.equal(ask.text, 'Note 4 asks "Which AC24V screws?" before W7 and W8.');
  assert.equal(byId(needs, 'tpcheck:wiring').text, 'TP3 is on the drawing, but no check says what it should read.');
  assert.equal(byId(needs, 'reading:wiring:TP2').text, "The TP2 check doesn't say what it should read.");
});

test('a repeated number, a missing end and a table with no tags at all: one item for the tags', () => {
  const r = readDrawing('s', laid([
    ['W', 0, 0], ['From', 10, 0], ['To', 60, 0],
    ['1', 0, 10], ['R1 1', 10, 10], ['U1 2', 60, 10],
    ['1', 0, 20], ['R2 1', 10, 20], ['U1 3', 60, 20],
    ['2', 0, 30], ['R3 1', 10, 30],
    ['R1', 200, 200], ['R2', 210, 200], ['R3', 220, 200], ['U1', 230, 200],
  ]));
  const needs = drawingNeeds([r], { hasBoard: false });
  assert.deepEqual(needs.map((n) => n.id), ['repeat:s:W1', 'noend:s:W2', 'notag:s']);
  assert.equal(needs[1].text, 'W2 has no "to" in the wire table.');
  assert.match(needs[2].text, /^The wires have no tags/);
});

test('no wire table, no project board: Bench says what it needs; with a board it says nothing', () => {
  const r = readDrawing('s', laid([['R1 10k', 0, 0], ['U1', 30, 0]]));
  const needs = drawingNeeds([r, readDrawing('blank', [])], { hasBoard: false, shapes: ['blank'], labelOf: (id) => `Sheet ${id}`, partsFound: 2 });
  assert.deepEqual(needs.map((n) => n.id), ['shapes:blank', 'notable']);
  assert.equal(needs[0].text, "Sheet blank: its text is drawn as shapes, so Bench can't read it. It needs the drawing saved with its text kept as text.");
  assert.match(needs[1].text, /^Bench found 2 parts on the drawings but no wire table/);
  assert.deepEqual(drawingNeeds([r], { hasBoard: true, shapes: ['blank'] }), []);
});

test('the real reading of a table names its tags and test points, so they are not guessed as parts', () => {
  const isNot = notAPart([psu]);
  assert.ok(isNot('W9') && isNot('W21') && isNot('TP1') && isNot('TP3'));
  assert.ok(!isNot('U1') && !isNot('Q9'));
  assert.equal(notAPart([readDrawing('s', laid([['W9', 0, 0]]))])('W9'), false, 'a W9 with no table may be a part');
});

test('the wire list as text, ticked by sheet and wire', () => {
  const text = wiresText(psu, new Set(['wiring#W1']), 'wiring');
  assert.match(text, /^Wires from wiring: 1 of 9 done/);
  assert.match(text, /\[x\] W1 {2}X1 wire A → F1 in {3}mains 0\.75 mm² · through the clamp/);
  assert.match(text, /\[ \] W18 {2}Q9 leg → J2 − black post {3}0\.25 mm²/);
});

test('progress read back from storage or a file: anything odd is dropped', () => {
  assert.deepEqual(cleanDrawingProgress(null), { done: [], answers: {}, dismissed: [], steps: [], safety: [] });
  const clean = cleanDrawingProgress({
    done: ['wiring#W9', 'wiring#W9', 'bad', 7, 'x#Q1'],
    answers: { 'ask:wiring:4': '  left and middle  ', 'ask:wiring:5': '', '__proto__': 'x', 'BAD KEY': 'y' },
    dismissed: ['notag:wiring', 42, 'Not A Need', 'readme:left', 'readme:wire:readme:wiring:5:W22'],
    steps: ['readme:wiring:3', 'readme:wiring:3', 'readme:Bad:1', 'wiring:2', 9],
    safety: ['unplugged', 'beep', 'not-a-line', 3],
  });
  assert.deepEqual(clean.done, ['wiring#W9']);
  assert.deepEqual({ ...clean.answers }, { 'ask:wiring:4': 'left and middle' });
  assert.deepEqual(clean.dismissed, ['notag:wiring', 'readme:left', 'readme:wire:readme:wiring:5:W22']);
  assert.deepEqual(clean.steps, ['readme:wiring:3'], 'the README steps ticked (1.0.4)');
  assert.deepEqual(clean.safety, ['unplugged', 'beep'], 'the safety lines ticked (1.0.4)');
});

test('the fume extractor drawings have no wire table, checks or notes to read, so Bench shows them as before', () => {
  const reads = FUME_SVGS.map((rel) => readDrawing(sheetIdOf(rel), sheetTexts(root(rel))));
  for (const r of reads) {
    assert.equal(r.hasTable, false, r.sheetId);
    assert.deepEqual(r.wires, [], r.sheetId);
    assert.deepEqual(r.checks, [], r.sheetId);
  }
  assert.deepEqual(drawingNeeds(reads, { hasBoard: true, shapes: [], partsFound: 40 }), []);
});
