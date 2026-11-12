import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSvg } from '../../src/sanitize.js';
import { indexSheet, matchesQuery, search } from '../../src/search.js';
import { FUME_SVGS, nodeParser, readFixture, sheetIdOf } from './helpers.js';

const prepared = (rel) => prepareSvg(readFixture(rel), nodeParser(), rel).doc;
const docs = FUME_SVGS.map((rel) => [sheetIdOf(rel), prepared(rel)]);
const ALL = docs.flatMap(([id, doc]) => indexSheet(id, doc.documentElement));
const counts = (q) => Object.fromEntries([...search(ALL, q).bySheet].map(([id, l]) => [id, l.length]));

test('indexes every non-empty label', () => {
  const sfe04 = docs[3][1];
  const labels = indexSheet('SFE-04_Perfboard_Layout', sfe04.documentElement);
  assert.equal(labels.length, 445);
  assert.equal(labels[0].sheetId, 'SFE-04_Perfboard_Layout');
  assert.equal(labels[0].el.localName, 'text');
  assert.ok(labels.every((l) => l.text.length > 0 && l.text === l.text.trim()));
});

test('finds parts across sheets', () => {
  assert.deepEqual(counts('R6'), { 'SFE-01_Schematic': 1, 'SFE-02_Reference': 2, 'SFE-04_Perfboard_Layout': 1 });
  assert.deepEqual(counts('r6'), counts('R6'));
  assert.deepEqual(counts('1N5402G'), { 'SFE-01_Schematic': 1, 'SFE-02_Reference': 1, 'SFE-03_USB_Port': 3, 'SFE-04_Perfboard_Layout': 1 });
  assert.equal(search(ALL, 'R6').total, 4);
});

test('finds net names and hole coordinates', () => {
  assert.deepEqual(counts('PWMCTL'), { 'SFE-04_Perfboard_Layout': 1 });
  assert.deepEqual(counts('28,12'), { 'SFE-04_Perfboard_Layout': 1 });
});

test('matches whole tokens only', () => {
  assert.equal(search(ALL, 'R60').total, 0);
  assert.equal(matchesQuery('R4,R6,R7,R8,R9', 'R6'), true);
  assert.equal(matchesQuery('R16', 'R6'), false);
  assert.equal(matchesQuery('R6x', 'R6'), false);
  assert.equal(matchesQuery('ÖR6', 'R6'), false);
  assert.equal(matchesQuery('  R6  ', ' R6 '), true);
});

test('empty and odd queries are safe', () => {
  assert.equal(search(ALL, '   ').total, 0);
  assert.equal(matchesQuery('R6', ''), false);
  for (const q of ['(', '[R6', '.*', '\\']) assert.doesNotThrow(() => search(ALL, q));
  assert.equal(search(ALL, '.*').total, 0);
});

test('finds KiCad labels written as invisible text', () => {
  const kicad = prepared('kicad-like/kicad-like.svg');
  assert.equal(search(indexSheet('kicad-like', kicad.documentElement), 'R302').total, 1);
});

test('keeps sheets in first-seen order', () => {
  assert.deepEqual([...search(ALL, 'R6').bySheet.keys()], ['SFE-01_Schematic', 'SFE-02_Reference', 'SFE-04_Perfboard_Layout']);
});
