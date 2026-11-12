import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QUESTION, contextText } from '../../src/ask.js';

test('the context block for a part, with the default question', () => {
  const ctx = {
    app: 'bench', project: 'Solder Fume Extractor', revision: 'Rev D', sheet: 'SFE-04 Perfboard layout',
    part: { ref: 'R6', value: '10k', type: 'resistor', role: 'Holds Q1 off, so the fans run at 100 % (fail-safe).' },
    onSheets: ['SFE-01 Main schematic', 'SFE-02 Reference', 'SFE-04 Perfboard layout'],
    nearbyText: ['10k', 'Q1'],
  };
  assert.equal(contextText(ctx, ''), [
    `Question: ${DEFAULT_QUESTION}`,
    'Project: Solder Fume Extractor (Rev D)',
    'Part: R6, 10k resistor',
    'Role: Holds Q1 off, so the fans run at 100 % (fail-safe).',
    'On sheets: SFE-01 Main schematic, SFE-02 Reference, SFE-04 Perfboard layout',
    'Nearby on SFE-04 Perfboard layout: 10k, Q1',
  ].join('\n'));
});

test('lines with nothing to say are left out, and the question is trimmed', () => {
  assert.equal(contextText({ part: { ref: 'X1' } }, '  Which way round?  '), 'Question: Which way round?\nPart: X1');
});

test('orientation and note get their own lines', () => {
  const text = contextText({ part: { ref: 'Q1', value: '2N2222A', orientation: 'Flat face down.', note: 'Check the pinout.' } }, 'x');
  assert.equal(text, 'Question: x\nPart: Q1, 2N2222A\nOrientation: Flat face down.\nNote: Check the pinout.');
});
