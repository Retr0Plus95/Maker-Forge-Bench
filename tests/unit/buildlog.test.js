import test from 'node:test';
import assert from 'node:assert/strict';
import { LOG_LIMIT, addVersion, buildReport, cleanLog, cleanVersions, duration, logAdd, logText, solderedAt, timeSpent } from '../../src/buildlog.js';
import { exportProgress, importProgress } from '../../src/checklist.js';

const MIN = 60000;

test('the log keeps the newest entries, checked', () => {
  let log = [];
  for (let k = 0; k < LOG_LIMIT + 5; k++) log = logAdd(log, `entry ${k}`, 1000 + k);
  assert.equal(log.length, LOG_LIMIT);
  assert.equal(log[0].text, 'entry 5');
  assert.deepEqual(cleanLog([{ t: 5, text: 'ok' }, { t: 'x', text: 'no' }, { t: 6, text: '' }, 'junk']), [{ t: 5, text: 'ok' }]);
});

test('time spent counts the gaps under 15 minutes', () => {
  const log = [{ t: 0, text: 'a' }, { t: 10 * MIN, text: 'b' }, { t: 12 * MIN, text: 'c' }, { t: 60 * MIN, text: 'd' }, { t: 65 * MIN, text: 'e' }];
  assert.equal(timeSpent(log), 17 * MIN);
  assert.equal(timeSpent(log, 60 * MIN), 5 * MIN, 'only since a time');
  assert.equal(duration(17 * MIN), '17 min');
  assert.equal(duration(85 * MIN), '1 h 25 min');
  assert.equal(duration(20000), 'under a minute');
});

test('when a part was soldered, from its Tick entries', () => {
  const log = [{ t: 100, text: 'Tick R8' }, { t: 200, text: 'Untick R8' }, { t: 300, text: 'Tick R9' }];
  assert.equal(solderedAt(log, 'R9'), 300);
  assert.equal(solderedAt(log, 'R8'), null, 'unticked again');
  assert.equal(solderedAt([...log, { t: 400, text: 'Tick R8' }], 'R8'), 400);
  assert.match(logText(log).split('\n')[0], /^\d{4}-\d\d-\d\d \d\d:\d\d {2}Tick R9$/);
});

test('named versions: newest first, a name replaces the older one, at most 20', () => {
  let v = [];
  v = addVersion(v, 'before power', { ticked: ['R1'] }, 1);
  v = addVersion(v, 'after fans', { ticked: ['R1', 'R2'] }, 2);
  v = addVersion(v, 'before power', { ticked: [] }, 3);
  assert.deepEqual(v.map((x) => x.name), ['before power', 'after fans']);
  assert.deepEqual(v[0].data, { ticked: [] });
  for (let k = 0; k < 30; k++) v = addVersion(v, `v${k}`, {}, 10 + k);
  assert.equal(v.length, 20);
  assert.deepEqual(cleanVersions([{ name: ' ok ', at: 1, data: {} }, { name: '', at: 1, data: {} }, { name: 'x', at: 'no', data: {} }]), [{ name: 'ok', at: 1, data: {} }]);
});

test('the build report says where the build stands', () => {
  const text = buildReport({
    project: 'Fume', revision: 'Rev D', now: Date.UTC(2026, 10, 13, 12, 0), soldered: 3, parts: 37, wired: 10, legs: 80, stepsDone: 2, steps: 10,
    checksDone: 1, checks: 4, continuityDone: 5, continuity: 90, faults: ['Short between U2 pin 7 and U2 pin 8'], placed: 2, boardParts: 32,
    time: 85 * MIN, unsoldered: ['R1', 'R2'], notes: { R9: 'used 4.7k', 'step.fans': 'twisted tach wires' },
  });
  assert.match(text, /^# Build report: Fume \(Rev D\)/);
  assert.match(text, /- Soldered: 3 of 37 parts/);
  assert.match(text, /- Continuity test: 5 of 90 pairs, 1 fault/);
  assert.match(text, /- Time spent: 1 h 25 min/);
  assert.match(text, /## Continuity faults\n- Short between U2 pin 7 and U2 pin 8/);
  assert.match(text, /- \*\*Step fans\*\*: twisted tach wires/);
});

test('progress files carry the build log', () => {
  const text = exportProgress({ project: 'x', revision: null, ticked: [], sheetPrints: {}, flipped: [], log: [{ t: 5, text: 'Tick R1' }] });
  assert.deepEqual(importProgress(text).log, [{ t: 5, text: 'Tick R1' }]);
  const old = JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [] });
  assert.deepEqual(importProgress(old).log, []);
});
