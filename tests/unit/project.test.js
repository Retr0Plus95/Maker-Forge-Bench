import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetsFromFiles } from '../../src/project.js';

const FUME_FILES = ['docs/layout/SFE-04_Perfboard_Layout.png', 'docs/layout/SFE-04_Perfboard_Layout.svg',
  'docs/layout/SFE-D1_Pot_Detail.png', 'docs/layout/SFE-D1_Pot_Detail.svg', 'docs/schematics/SFE-01_Schematic.png',
  'docs/schematics/SFE-01_Schematic.svg', 'docs/schematics/SFE-02_Reference.png', 'docs/schematics/SFE-02_Reference.svg',
  'docs/schematics/SFE-03_USB_Port.png', 'docs/schematics/SFE-03_USB_Port.svg', 'images/SFE-01_Schematic.png',
  'images/SFE-02_Reference.png', 'images/SFE-03_USB_Port.png', 'images/SFE-04_Perfboard_Layout.png',
  'images/SFE-D1_Pot_Detail.png', 'images/SFE-parts.jpg'].map((path) => ({ path, size: 1, mtime: 1 }));

test('fume extractor folder gives six sheets, SVGs preferred', () => {
  const s = sheetsFromFiles(FUME_FILES);
  assert.deepEqual(s.map((x) => [x.id, x.type, x.kind]), [
    ['SFE-01_Schematic', 'svg', 'schematic'], ['SFE-02_Reference', 'svg', 'schematic'], ['SFE-03_USB_Port', 'svg', 'schematic'],
    ['SFE-04_Perfboard_Layout', 'svg', 'layout'], ['SFE-D1_Pot_Detail', 'svg', 'layout'], ['SFE-parts', 'jpg', 'photo']]);
  assert.equal(s[3].path, 'docs/layout/SFE-04_Perfboard_Layout.svg');
  assert.equal(s[0].label, 'SFE-01 Schematic');
});

test('a PNG beats a JPG, and the shorter path wins a tie', () => {
  const s = sheetsFromFiles([{ path: 'a/b/x.png' }, { path: 'x.jpg' }, { path: 'c/x.png' }].map((f) => ({ ...f, size: 1, mtime: 1 })));
  assert.deepEqual(s.map((x) => x.path), ['c/x.png']);
});

test('keeps size and mtime from the file list', () => {
  const [s] = sheetsFromFiles([{ path: 'a.svg', size: 42, mtime: 7.5 }]);
  assert.equal(s.size, 42);
  assert.equal(s.mtime, 7.5);
});

test('ignores other files and keeps odd names', () => assert.deepEqual(
  sheetsFromFiles([{ path: 'forge-project.json' }, { path: 'Mapp med mellanslag/Ö-kort.SVG' }, { path: 'a.JPEG' }]
    .map((f) => ({ ...f, size: 1, mtime: 1 }))).map((x) => [x.id, x.type, x.path]),
  [['a', 'jpg', 'a.JPEG'], ['Ö-kort', 'svg', 'Mapp med mellanslag/Ö-kort.SVG']]));

test('a folder with no drawings gives no sheets', () => assert.deepEqual(sheetsFromFiles([]), []));
