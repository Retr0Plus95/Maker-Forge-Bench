import test from 'node:test';
import assert from 'node:assert/strict';
import { findLines, findValues, nextInStep } from '../../src/lookup.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));
const board = project.board;

test('Find knows line names and labels, spaces and case aside', () => {
  assert.deepEqual(findLines(board, '+5 V').map((l) => l.net), ['P5V']);
  assert.deepEqual(findLines(board, '+5v').map((l) => l.net), ['P5V']);
  assert.deepEqual(findLines(board, '0 v').map((l) => l.net), ['GND']);
  assert.deepEqual(findLines(board, 'gnd').map((l) => l.net), ['GND']);
  assert.deepEqual(findLines(board, 'tacha').map((l) => l.net).sort(), ['TACHA', 'TACHA_F']);
  assert.equal(findLines(board, 'P5V')[0].legs, board.nets.P5V.length);
  assert.deepEqual(findLines(board, 'R8'), [], 'a part name is not a line');
  assert.deepEqual(findLines(board, 't'), [], 'one or two letters only match a whole name');
  assert.deepEqual(findLines(null, '+5 V'), []);
});

test('Find knows values: "100 nF", "100n", "10k"', () => {
  const refs = (q) => findValues(project.parts, q).map((p) => p.ref).sort();
  const hundredNano = refs('100 nF');
  assert.ok(hundredNano.includes('C5') && hundredNano.includes('C9') && hundredNano.includes('C3'), hundredNano.join());
  assert.deepEqual(refs('100n'), hundredNano);
  assert.deepEqual(refs('100nf'), hundredNano);
  assert.ok(refs('10k').includes('R8'), refs('10k').join());
  assert.deepEqual(refs('nF'), [], 'a value needs a number');
  assert.deepEqual(refs('R8'), [], 'part names are found by Find part itself');
});

test('the next part in a step: the next one not soldered yet, round the step', () => {
  const step = project.build.find((s) => s.title === 'Fan drive and tach');
  const [first, second, third] = step.parts;
  assert.equal(nextInStep(step, first, new Set()), second);
  assert.equal(nextInStep(step, first, new Set([second])), third);
  assert.equal(nextInStep(step, step.parts.at(-1), new Set()), first);
  assert.equal(nextInStep(step, first, new Set(step.parts)), null);
});
