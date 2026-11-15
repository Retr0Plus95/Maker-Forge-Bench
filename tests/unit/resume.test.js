import test from 'node:test';
import assert from 'node:assert/strict';
import { awayFor, lastTick, timeLeft } from '../../src/resume.js';

const MIN = 60 * 1000;

test('time left, from your own pace: rounded to 5 minutes, or to 10 from an hour on', () => {
  assert.equal(timeLeft(10 * MIN, 4, 5), 'About 15 minutes left for the 5 parts still to solder, at your pace so far.');
  assert.equal(timeLeft(30 * MIN, 6, 12), 'About 1 h left for the 12 parts still to solder, at your pace so far.');
  assert.equal(timeLeft(60 * MIN, 3, 4), 'About 1 h 20 min left for the 4 parts still to solder, at your pace so far.');
  assert.equal(timeLeft(40 * MIN, 3, 1), 'About 15 minutes left for the 1 part still to solder, at your pace so far.');
  assert.equal(timeLeft(6 * MIN, 6, 1), 'About 5 minutes left for the 1 part still to solder, at your pace so far.');
  assert.equal(timeLeft(58 * MIN, 5, 5), 'About 1 h left for the 5 parts still to solder, at your pace so far.', '58 minutes rounds up to the hour');
});

test('no guess before three ticked parts and five minutes of building, or with nothing left', () => {
  assert.equal(timeLeft(10 * MIN, 2, 5), null);
  assert.equal(timeLeft(4 * MIN, 4, 5), null);
  assert.equal(timeLeft(30 * MIN, 6, 0), null);
});

test('the last part ticked, from the build log, skipping ticks undone or unticked since', () => {
  assert.deepEqual(lastTick([{ t: 1, text: 'Tick R4' }, { t: 2, text: 'Tick R6' }]), { ref: 'R6', t: 2 });
  assert.deepEqual(lastTick([{ t: 1, text: 'Tick R4' }, { t: 2, text: 'Tick R6' }, { t: 3, text: 'Undo Tick R6' }]), { ref: 'R4', t: 1 });
  assert.deepEqual(lastTick([{ t: 1, text: 'Tick R4' }, { t: 2, text: 'Untick R4' }]), null);
  assert.deepEqual(lastTick([{ t: 1, text: 'Tick R4' }, { t: 2, text: 'Undo Tick R4' }, { t: 3, text: 'Redo Tick R4' }]), { ref: 'R4', t: 3 });
  assert.deepEqual(lastTick([{ t: 1, text: 'Tick step 4' }, { t: 2, text: 'Tick all 10k' }]), null);
  assert.equal(lastTick([]), null);
});

test('how long since the last change', () => {
  assert.equal(awayFor([], 1000), 0);
  assert.equal(awayFor([{ t: 100, text: 'Tick R4' }, { t: 400, text: 'Note on R4' }], 1000), 600);
});
