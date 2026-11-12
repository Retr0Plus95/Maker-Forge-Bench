import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, projectKey } from '../../src/store.js';

function memoryStorage() {
  const mem = new Map();
  return {
    mem,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    get length() { return mem.size; },
    key: (i) => [...mem.keys()][i] ?? null,
  };
}

test('values round-trip as JSON under the bench. prefix', () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  assert.equal(s.set('a', { t: [1] }), true);
  assert.deepEqual(s.get('a', null), { t: [1] });
  assert.equal(storage.mem.has('bench.a'), true);
  s.remove('a');
  assert.equal(s.get('a', 'gone'), 'gone');
});

test('broken values give the fallback, and other keys are left alone', () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  storage.mem.set('bench.bad', '{');
  storage.mem.set('other', '1');
  s.set('a', 1);
  assert.equal(s.get('bad', 'fb'), 'fb');
  assert.deepEqual(s.keys().sort(), ['a', 'bad']);
});

test('a full storage is reported, not thrown', () => {
  const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(createStore(storage).set('x', 1), false);
});

test('progress is saved per project and revision, or per folder', () => {
  assert.equal(projectKey({ name: 'Solder Fume Extractor', revision: 'Rev D' }, 'f'), 'progress:Solder Fume Extractor:Rev D');
  assert.equal(projectKey({ name: 'Lamp', revision: null }, 'f'), 'progress:Lamp:');
  assert.equal(projectKey(null, 'my folder'), 'progress:my folder:');
});
