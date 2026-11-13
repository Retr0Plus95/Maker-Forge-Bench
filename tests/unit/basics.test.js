import test from 'node:test';
import assert from 'node:assert/strict';
import { shoppingList, shoppingCsv, shoppingText } from '../../src/bom.js';
import { cleanSettings, themeFor } from '../../src/settings.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));

test('the shopping list groups parts by what you buy', () => {
  const rows = shoppingList(project.parts);
  const tenK = rows.find((r) => r.value === '10k' && r.type === 'resistor');
  assert.equal(tenK.count, 5);
  assert.equal(tenK.refs.length, 5);
  assert.ok(tenK.refs.includes('R8'));
  assert.equal(rows.reduce((n, r) => n + r.count, 0), project.parts.length, 'every part is on the list once');
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].type.localeCompare(r.type) <= 0), 'grouped by type');
});

test('a quantity in the project file counts', () => {
  const rows = shoppingList([{ ref: 'W1', value: 'wire', type: 'wire', qty: 3 }, { ref: 'W2', value: 'wire', type: 'wire' }]);
  assert.deepEqual(rows.map((r) => [r.value, r.count]), [['wire', 4]]);
});

test('the shopping list as text', () => {
  const lines = shoppingText(shoppingList(project.parts)).split('\n');
  assert.ok(lines.some((l) => /^5 × 10k resistor \(.*R8.*\)$/.test(l)), lines.join(' | '));
});

test('the shopping list as a spreadsheet file, quoted, and never running a formula', () => {
  const csv = shoppingCsv([{ count: 2, value: 'say "hi", ok', type: 'x', package: '', refs: ['A1', 'A2'] }]);
  assert.equal(csv, 'Quantity,Value,Type,Package,Parts\r\n2,"say ""hi"", ok",x,,A1 A2\r\n');
  const row = shoppingCsv([{ count: 1, value: '=HYPERLINK("x")', type: 't', package: '', refs: ['A'] }]).split('\r\n')[1];
  assert.equal(row, `1,"'=HYPERLINK(""x"")",t,,A`);
});

test('Easy reading can follow the system light or dark setting', () => {
  assert.equal(cleanSettings({ theme: 'system' }).theme, 'system');
  assert.equal(cleanSettings({ theme: 'purple' }).theme, 'dark');
  assert.equal(themeFor({ theme: 'system' }, true), 'dark');
  assert.equal(themeFor({ theme: 'system' }, false), 'light');
  assert.equal(themeFor({ theme: 'light' }, true), 'light');
});
