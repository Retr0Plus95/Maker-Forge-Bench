import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_LIMITS, ProjectError, firstWord, guessParts, labelDone, parseProject, refOfLabel, sheetsForProject } from '../../src/project.js';
import { prepareSvg } from '../../src/sanitize.js';
import { indexSheet } from '../../src/search.js';
import { FUME_SVGS, nodeParser, readFixture } from './helpers.js';

const fume = parseProject(readFixture('forge-project/fume-extractor.json'));
const part = (ref) => fume.parts.find((p) => p.ref === ref);
const files = (paths) => paths.map((path) => ({ path, size: 1, mtime: 1 }));
const project = (body) => JSON.stringify({ format: 'forge-project', version: 1, name: 'h', ...body });

// The fume extractor's drawing files, as in 0.1's project test, without the parts photo.
const FUME_FILES_WITHOUT_PHOTO = files(['docs/layout/SFE-04_Perfboard_Layout.png', 'docs/layout/SFE-04_Perfboard_Layout.svg',
  'docs/layout/SFE-D1_Pot_Detail.png', 'docs/layout/SFE-D1_Pot_Detail.svg', 'docs/schematics/SFE-01_Schematic.png',
  'docs/schematics/SFE-01_Schematic.svg', 'docs/schematics/SFE-02_Reference.png', 'docs/schematics/SFE-02_Reference.svg',
  'docs/schematics/SFE-03_USB_Port.png', 'docs/schematics/SFE-03_USB_Port.svg', 'images/SFE-01_Schematic.png',
  'images/SFE-02_Reference.png', 'images/SFE-03_USB_Port.png', 'images/SFE-04_Perfboard_Layout.png',
  'images/SFE-D1_Pot_Detail.png', 'forge-project.json']);

test('reads the fume extractor project file', () => {
  assert.equal(fume.name, 'Solder Fume Extractor');
  assert.equal(fume.parts.length, 37);
  assert.equal(fume.sheets.length, 6);
  assert.equal(fume.revision, 'Rev D');
  assert.match(part('R6').role, /fail-safe/);
  assert.equal(part('U2').datasheet, 'https://www.microchip.com/en-us/product/ATmega328P');
  assert.equal(part('Q1').polarized, true);
  assert.equal(part('R6').polarized, false);
  assert.equal(part('R6').guessed, false);
});

test('refuses files that are broken, not a project, or too big', () => {
  assert.throws(() => parseProject('{'), { code: 'json', message: /^forge-project\.json couldn't be read/ });
  assert.throws(() => parseProject('{"format":"x","version":1,"name":"a"}'), {
    code: 'format',
    message: 'forge-project.json isn\'t a Maker Forge project file: it needs "format": "forge-project", "version": 1 and a "name".',
  });
  assert.throws(() => parseProject(project({ name: '' })), { code: 'format' });
  assert.throws(() => parseProject(' '.repeat(PROJECT_LIMITS.maxBytes + 1)), {
    code: 'too-big', message: "forge-project.json is bigger than 1 MB, so it wasn't read.",
  });
  assert.ok(new ProjectError('json', 'x') instanceof Error);
});

test('drops hostile or broken values, keeps unknown sections', () => {
  const hostile = parseProject(project({
    board: { cols: 3 },
    parts: [{ ref: '<script>' }, { ref: 'R1', datasheet: 'javascript:alert(1)', datasheetFile: '../x.pdf', polarized: 'yes', qty: -2 },
      { ref: 'r1', datasheetFile: 'docs/ds/r1.pdf', qty: 3 }, { ref: 'R1', value: 'dup' }, 'not a part', { ref: 'C1', role: 'x'.repeat(5000) }],
    sheets: [{ id: 'S1', file: '../outside.svg' }, { id: 'S2', file: 'C:/x.svg' }, { id: 'S3', file: 'a.svg', kind: 'weird', side: 'nope' }, { file: 'b.svg' }],
  }));
  assert.deepEqual(hostile.parts.map((p) => p.ref), ['R1', 'r1', 'C1']);
  assert.equal(hostile.parts[0].datasheet, undefined);
  assert.equal(hostile.parts[0].datasheetFile, undefined);
  assert.equal(hostile.parts[0].polarized, false);
  assert.equal(hostile.parts[0].qty, undefined);
  assert.equal(hostile.parts[1].datasheetFile, 'docs/ds/r1.pdf');
  assert.equal(hostile.parts[1].qty, 3);
  assert.equal(hostile.parts[2].role.length, PROJECT_LIMITS.maxText);
  assert.deepEqual(hostile.sheets, [{ id: 'S3', title: '', file: 'a.svg', kind: 'schematic', side: 'component' }]);
  assert.deepEqual(hostile.extra, { board: { cols: 3 } });
});

test('sheets come from the project, in its order, with missing files marked', () => {
  const sheets = sheetsForProject(fume, FUME_FILES_WITHOUT_PHOTO);
  assert.deepEqual(sheets.map((s) => [s.id, s.label, s.kind, s.missing]), [
    ['SFE-01', 'SFE-01 Main schematic', 'schematic', false], ['SFE-02', 'SFE-02 Reference', 'detail', false],
    ['SFE-03', 'SFE-03 USB port', 'schematic', false], ['SFE-04', 'SFE-04 Perfboard layout', 'layout', false],
    ['SFE-D1', 'SFE-D1 Pot detail', 'detail', false], ['SFE-parts', 'SFE-parts Printed parts', 'photo', true]]);
  assert.equal(sheets[3].side, 'component');
  assert.equal(sheets[3].type, 'svg');
  assert.equal(sheets[5].type, 'jpg');
});

test("the folder's other drawings follow the project's sheets", () => {
  const p = parseProject(project({ sheets: [{ id: 'A', title: 'First', file: 'a.svg' }] }));
  const sheets = sheetsForProject(p, files(['a.svg', 'a.png', 'other/a.png', 'z.svg', 'b.png']));
  assert.deepEqual(sheets.map((s) => [s.id, s.label, s.path]), [['A', 'A First', 'a.svg'], ['b', 'b', 'b.png'], ['z', 'z', 'z.svg']]);
});

test('guesses parts from labels that look like part names', () => {
  const sfe04 = prepareSvg(readFixture(FUME_SVGS[3]), nodeParser(), 'SFE-04').doc;
  const guessed = guessParts(indexSheet('SFE-04', sfe04.documentElement));
  const refs = guessed.map((p) => p.ref);
  for (const r of ['R6', 'U2', 'D4', 'C1A']) assert.ok(refs.includes(r), r);
  for (const r of ['+12V', 'SFE-04', '28,12']) assert.ok(!refs.includes(r), r);
  assert.equal(new Set(refs).size, refs.length, 'each part once');
  assert.deepEqual(guessed[0], { ref: guessed[0].ref, polarized: false, guessed: true });
});

test('a label stands for a part by its whole text or its first word', () => {
  const known = (r) => ['U2', 'R6', 'D4'].includes(r);
  assert.equal(refOfLabel('U2 ATmega328P', known), 'U2');
  assert.equal(refOfLabel('R6', known), 'R6');
  assert.equal(refOfLabel('R60', known), null);
  assert.equal(refOfLabel('Q1 2N2222A', known), null);
  assert.equal(firstWord('R4,R6,R7'), 'R4');
});

test('a label is done only when every part it names is ticked', () => {
  const known = (r) => ['U2', 'R5', 'Q1', 'R4', 'R6', 'R7', 'D1'].includes(r);
  const ticked = (list) => (r) => list.includes(r);
  assert.equal(labelDone('U2 ATmega328P', known, ticked(['U2'])), true);
  assert.equal(labelDone('U2 pin 15 (D9/OC1A) → R5 → Q1 base', known, ticked(['U2'])), false);
  assert.equal(labelDone('U2 pin 15 (D9/OC1A) → R5 → Q1 base', known, ticked(['U2', 'R5', 'Q1'])), true);
  assert.equal(labelDone('R4,R6,R7', known, ticked(['R4'])), false);
  assert.equal(labelDone('R4,R6,R7', known, ticked(['R4', 'R6', 'R7'])), true);
  assert.equal(labelDone('D1 band to +12V row', known, ticked(['D1'])), true);
  assert.equal(labelDone('PWMCTL', known, ticked(['R5'])), false);
  assert.equal(labelDone('R6', known, ticked([])), false);
});
