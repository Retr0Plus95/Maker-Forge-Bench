import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressError, changedSince, exportProgress, importProgress, sheetPrint } from '../../src/checklist.js';

const sample = { project: 'Solder Fume Extractor', revision: 'Rev D', ticked: ['R6', 'Q1'], sheetPrints: { 'SFE-04': '1:2' }, flipped: ['SFE-04'] };

test('progress round-trips through a file', () => {
  const text = exportProgress(sample);
  assert.equal(JSON.parse(text).format, 'bench-progress');
  assert.equal(JSON.parse(text).version, 1);
  assert.deepEqual(importProgress(text), sample);
});

test('anything that is not Bench progress is refused in plain words', () => {
  const message = "That file isn't Bench progress.";
  const good = JSON.parse(exportProgress(sample));
  for (const bad of ['{', '[]', '{"format":"x","version":1}', JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, ticked: [1] }), JSON.stringify({ ...good, ticked: ['<b>'] }),
    JSON.stringify({ ...good, flipped: 'SFE-04' }), JSON.stringify({ ...good, sheetPrints: { a: 3 } }),
    ' '.repeat(1048577)]) {
    assert.throws(() => importProgress(bad), (e) => e instanceof ProgressError && e.message === message, bad.slice(0, 40));
  }
});

test('a missing project or revision reads as null', () => {
  const back = importProgress(JSON.stringify({ format: 'bench-progress', version: 1, ticked: [], sheetPrints: {}, flipped: [] }));
  assert.equal(back.project, null);
  assert.equal(back.revision, null);
});

test('a sheet print is its size and modified time', () => {
  assert.equal(sheetPrint({ size: 12, mtime: 3.5 }), '12:3.5');
});

test('sheets that changed since ticking are named, with the right plural', () => {
  const prints = { 'SFE-04': '1:2', 'SFE-01': '5:5' };
  const sheets = [{ id: 'SFE-04', label: 'SFE-04 Perfboard layout', size: 1, mtime: 3 },
    { id: 'SFE-01', label: 'SFE-01 Main schematic', size: 5, mtime: 5 }, { id: 'NEW', label: 'New', size: 1, mtime: 1 }];
  assert.deepEqual(changedSince(prints, sheets, 1), ['Sheet SFE-04 Perfboard layout changed since you ticked 1 part: check them.']);
  assert.deepEqual(changedSince(prints, sheets, 3), ['Sheet SFE-04 Perfboard layout changed since you ticked 3 parts: check them.']);
  assert.deepEqual(changedSince(prints, sheets, 0), []);
  assert.deepEqual(changedSince({}, sheets, 2), []);
});
