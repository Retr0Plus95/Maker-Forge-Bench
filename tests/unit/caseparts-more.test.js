// Bench 1.0.5 extras: counts and materials from the README's parts table or BOM.csv, the files the table lists that
// aren't there, and how a part sits on the bed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bomNotes, listedMissing, meshFacts, partNotes, partWarnings, fitOnBed } from '../../src/caseparts.js';

/** A closed box w × d × h with one corner at (x, y, z), outward-facing: 12 triangles. */
function box(w, d, h, [x, y, z] = [0, 0, 0]) {
  const p = (i, j, k) => [x + i * w, y + j * d, z + k * h];
  const quads = [
    [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)],
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
    [p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)],
    [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)],
    [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
  ];
  const out = [];
  for (const [a, b, c, e] of quads) out.push(...a, ...b, ...c, ...a, ...c, ...e);
  return new Float32Array(out);
}

/** A square pyramid standing on its tip at (0, 0, 0), 20 mm wide at the top, 20 mm tall. */
function onTip() {
  const t = [0, 0, 0];
  const a = [-10, -10, 20]; const b = [10, -10, 20]; const c = [10, 10, 20]; const d = [-10, 10, 20];
  return new Float32Array([...t, ...b, ...a, ...t, ...c, ...b, ...t, ...d, ...c, ...t, ...a, ...d, ...a, ...b, ...c, ...a, ...c, ...d]);
}

const words = (list) => list.map((w) => `${w.level}: ${w.text}`);

test('the parts table: a Qty column gives the count, Material the print, Notes what it is', () => {
  const text = [
    '## Printed parts', '',
    '| File | Qty | Material | Notes |', '|---|---|---|---|',
    '| `stl/foot.stl` | 4 | TPU | Under each corner |',
    '| `stl/front.3mf` | 1 | PETG | Two colours |',
    '| `stl/clip.stl` | 2 pcs | same | |',
  ].join('\n');
  const parts = ['case/stl/foot.stl', 'case/stl/front.3mf', 'case/stl/clip.stl'];
  const notes = partNotes([{ path: 'case/README.md', text }], parts);
  assert.deepEqual(notes.get('case/stl/foot.stl'), { what: 'Under each corner', print: 'TPU', readme: 'case/README.md', order: 0, count: 4 });
  assert.equal(notes.get('case/stl/front.3mf').count, 1);
  assert.equal(notes.get('case/stl/clip.stl').count, 2, '"2 pcs" is two');
  assert.equal(notes.get('case/stl/clip.stl').print, 'PETG', '"same" is the row above');
  // with no Qty column there's no count (one of each)
  const plain = partNotes([{ path: 'README.md', text: '| File | Print |\n|---|---|\n| a.stl | PLA |' }], ['a.stl']);
  assert.equal(plain.get('a.stl').count, undefined);
  // a silly count is kept within reason
  const silly = partNotes([{ path: 'README.md', text: '| File | Qty | Print |\n|---|---|---|\n| a.stl | 0 | PLA |\n| b.stl | 99999 | PLA |' }], ['a.stl', 'b.stl']);
  assert.equal(silly.get('a.stl').count, undefined, 'zero is no count');
  assert.equal(silly.get('b.stl').count, 999);
});

test('BOM.csv: its printed rows give the count, material and notes, matched by file name with or without .stl', () => {
  const csv = [
    'Category,Item,Qty,Material,Notes',
    'Electronics,"Resistor 10k",4,,',
    'Printed,foot,4,TPU,"Under each corner, pressed in"',
    'printed,stl/Front.3MF,1,PETG,',
    'Printed,lost-part.stl,1,PLA,',
  ].join('\n');
  const parts = ['case/stl/foot.stl', 'case/stl/front.3mf', 'case/stl/box.stl'];
  const notes = bomNotes(csv, 'case/BOM.csv', parts);
  assert.deepEqual(notes.get('case/stl/foot.stl'), { what: 'Under each corner, pressed in', print: 'TPU', readme: 'case/BOM.csv', order: 0, count: 4 });
  assert.equal(notes.get('case/stl/front.3mf').print, 'PETG', 'any case, a folder in the name');
  assert.equal(notes.has('case/stl/box.stl'), false);
  assert.equal(notes.size, 2, 'the electronics row is not a printed part');
  // with no category column, a row naming a model file is a printed part; with no item column, nothing
  const loose = bomNotes('Part,Quantity,Comment\nfoot.stl,2,PLA; with a brim\nM3 screw,8,', 'BOM.csv', ['foot.stl']);
  assert.equal(loose.get('foot.stl').count, 2);
  assert.equal(loose.get('foot.stl').print, 'PLA', 'the comment up to its first ; is the material');
  assert.equal(loose.get('foot.stl').what, 'with a brim');
  assert.equal(bomNotes('Qty,Notes\n1,x', 'BOM.csv', ['foot.stl']).size, 0);
  assert.equal(bomNotes('', 'BOM.csv', ['foot.stl']).size, 0);
});

test("the files a parts table lists that aren't in the project", () => {
  const text = [
    '| File | What it is |', '|---|---|',
    '| `stl/box.stl` | The box |',
    '| `stl/lid.stl`, `stl/hinge.stl` | The lid and its hinge |',
    '| `stl/*-lens.stl` | Lenses |',
    '| `stl/*-knob.stl` | Knobs |',
    '| [the panel](stl/panel.3mf) | Front panel |',
  ].join('\n');
  const parts = ['case/stl/box.stl', 'case/stl/lid.stl', 'case/stl/red-lens.stl'];
  assert.deepEqual(listedMissing([{ path: 'case/README.md', text }], parts), [
    { name: 'stl/hinge.stl', readme: 'case/README.md' },
    { name: 'stl/*-knob.stl', readme: 'case/README.md' },
    { name: 'stl/panel.3mf', readme: 'case/README.md' },
  ]);
  assert.deepEqual(listedMissing([{ path: 'README.md', text: '| Name | What |\n|---|---|\n| gone.stl | x |' }], []), [], 'not a parts table');
});

test('how a part sits on the bed: on a face, above it, below it, or on a point', () => {
  const flat = meshFacts(box(20, 20, 10));
  assert.equal(Math.round(flat.onBed), 400, 'its whole bottom is on the bed');
  assert.deepEqual(words(partWarnings(flat, fitOnBed(flat.size, [256, 256, 256]), [256, 256, 256])), []);

  const up = meshFacts(box(20, 20, 10, [0, 0, 5]));
  assert.deepEqual(words(partWarnings(up, fitOnBed(up.size, [256, 256, 256]), [256, 256, 256])),
    ['info: It sits 5 mm above the bed in the file. Most slicers drop it onto the bed; check before you print.']);
  const down = meshFacts(box(20, 20, 10, [0, 0, -2.5]));
  assert.deepEqual(words(partWarnings(down, fitOnBed(down.size, [256, 256, 256]), [256, 256, 256])),
    ['info: It goes 2.5 mm below the bed in the file. Most slicers lift it onto the bed, but some cut that part off; check before you print.']);

  const tip = meshFacts(onTip());
  assert.equal(tip.onBed, 0);
  assert.deepEqual(words(partWarnings(tip, fitOnBed(tip.size, [256, 256, 256]), [256, 256, 256])),
    ['warn: As it lies it touches the bed only at a point or an edge: lay it on a flat side in your slicer, or it needs supports.']);
});
