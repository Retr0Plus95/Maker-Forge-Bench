import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queuedFetch } from '../../src/fetchqueue.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const answer = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

test('never more than `max` requests in progress at once, and every one is answered', async () => {
  let now = 0;
  let peak = 0;
  const fake = async (url) => {
    now += 1;
    peak = Math.max(peak, now);
    await tick(5);
    now -= 1;
    return answer(200, { url });
  };
  const get = queuedFetch(fake, { max: 4 });
  const answers = await Promise.all(Array.from({ length: 32 }, (_, i) => get(`m${i}.glb`)));
  assert.equal(peak, 4);
  assert.equal(answers.length, 32);
  assert.ok(answers.every((r) => r.ok));
});

test('a "429 Too Many Requests" is asked again after the wait the host gives, at most twice', async () => {
  const waits = [];
  let calls = 0;
  const fake = async () => {
    calls += 1;
    return calls < 3 ? answer(429, { 'retry-after': '5' }) : answer(200);
  };
  const get = queuedFetch(fake, { max: 2, sleep: async (ms) => { waits.push(ms); } });
  const r = await get('a.glb');
  assert.equal(r.status, 200);
  assert.deepEqual(waits, [5000, 5000]);

  calls = -10; // always refused
  const refused = await get('b.glb');
  assert.equal(refused.status, 429, 'gives up and hands the refusal back');
});

test('the wait is kept sensible: missing or odd Retry-After means 2 s, never more than 10 s', async () => {
  const waits = [];
  for (const h of [undefined, 'soon', '0', '600']) {
    let first = true;
    const fake = async () => {
      if (first) { first = false; return answer(429, h === undefined ? {} : { 'retry-after': h }); }
      return answer(200);
    };
    await queuedFetch(fake, { sleep: async (ms) => { waits.push(ms); } })('x');
  }
  assert.deepEqual(waits, [2000, 2000, 2000, 10000]);
});

test('a failed request frees its place for the next one', async () => {
  let n = 0;
  const fake = async () => {
    n += 1;
    if (n === 1) throw new Error('offline');
    return answer(200);
  };
  const get = queuedFetch(fake, { max: 1 });
  await assert.rejects(get('a'), /offline/);
  assert.equal((await get('b')).status, 200);
});
