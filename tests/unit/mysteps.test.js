import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_EDITS, addOwnStep, cleanStepEdits, hasEdits, moveStep, removeOwnStep, setSkipped, stepsWithEdits } from '../../src/mysteps.js';

const build = [
  { id: 'power', title: 'Power', why: '', parts: ['J0', 'D1'], what: [], missing: [] },
  { id: 'chip', title: 'The chip', why: '', parts: ['U2'], what: [], missing: [] },
  { id: 'fans', title: 'Fans', why: '', parts: ['J2', 'J3'], what: [], missing: [] },
];
const ids = (steps) => steps.map((s) => s.id);

test("with no changes they're the project's steps, in order", () => {
  assert.deepEqual(ids(stepsWithEdits(build, NO_EDITS)), ['power', 'chip', 'fans']);
  assert.deepEqual(ids(stepsWithEdits(build, null)), ['power', 'chip', 'fans']);
  assert.equal(hasEdits(NO_EDITS), false);
  assert.ok(stepsWithEdits(build, NO_EDITS).every((s) => !s.skipped && !s.own));
});

test('move a step up or down; the ends stay put', () => {
  let edits = moveStep(build, NO_EDITS, 'fans', -1);
  assert.deepEqual(ids(stepsWithEdits(build, edits)), ['power', 'fans', 'chip']);
  edits = moveStep(build, edits, 'power', -1);
  assert.deepEqual(ids(stepsWithEdits(build, edits)), ['power', 'fans', 'chip'], 'already first');
  edits = moveStep(build, edits, 'power', 1);
  assert.deepEqual(ids(stepsWithEdits(build, edits)), ['fans', 'power', 'chip']);
  assert.equal(hasEdits(edits), true);
  assert.deepEqual(ids(stepsWithEdits(build, NO_EDITS)), ['power', 'chip', 'fans'], 'edits are new objects');
});

test('skip a step and bring it back', () => {
  const edits = setSkipped(NO_EDITS, 'chip', true);
  const steps = stepsWithEdits(build, edits);
  assert.deepEqual(steps.map((s) => [s.id, s.skipped]), [['power', false], ['chip', true], ['fans', false]]);
  assert.deepEqual(setSkipped(edits, 'chip', false).skipped, []);
});

test('add your own step after one, and take it out again', () => {
  const { edits, id } = addOwnStep(build, NO_EDITS, { title: 'Test the 5 V rail', text: 'Meter on C2: about 5.0 V.' }, 'power');
  const steps = stepsWithEdits(build, edits);
  assert.deepEqual(ids(steps), ['power', id, 'chip', 'fans']);
  const mine = steps[1];
  assert.deepEqual([mine.title, mine.why, mine.own, mine.parts], ['Test the 5 V rail', 'Meter on C2: about 5.0 V.', true, []]);
  const second = addOwnStep(build, edits, { title: 'Clean the flux', text: '' }, null);
  assert.notEqual(second.id, id);
  assert.equal(ids(stepsWithEdits(build, second.edits)).at(-1), second.id, 'at the end without a step to follow');
  assert.deepEqual(ids(stepsWithEdits(build, removeOwnStep(second.edits, id))), ['power', 'chip', 'fans', second.id]);
  assert.equal(addOwnStep(build, NO_EDITS, { title: '   ', text: 'x' }, null), null, 'a step needs a title');
});

test('when the project changes its steps, yours still fit: new steps slot in, gone ones drop out', () => {
  const edits = moveStep(build, NO_EDITS, 'fans', -2); // fans, power, chip
  const next = [build[0], { id: 'test', title: 'Test', why: '', parts: [], what: [], missing: [] }, build[2]]; // chip gone, test new
  assert.deepEqual(ids(stepsWithEdits(next, edits)), ['fans', 'power', 'test']);
});

test('saved changes are checked; junk is dropped', () => {
  const clean = cleanStepEdits({
    order: ['power', 7, 'x'.repeat(300), 'chip', 'power'],
    skipped: ['fans', null],
    added: [{ id: 'own-1', title: 'Mine', text: 'Do this' }, { id: 'own-2', title: '' }, { title: 'no id' }, 'junk'],
    extra: true,
  });
  assert.deepEqual(clean, { order: ['power', 'chip'], skipped: ['fans'], added: [{ id: 'own-1', title: 'Mine', text: 'Do this' }] });
  assert.deepEqual(cleanStepEdits(null), NO_EDITS);
  assert.deepEqual(cleanStepEdits([1]), NO_EDITS);
});
