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

// ---- two-colour 3MF ----
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readPartFull } from '../../src/caseparts.js';

const inflate = async (data) => new Uint8Array(inflateRawSync(data));

/** A zip of { name: text }, deflated. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, dir, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

/** A mesh's XML: tris as triangles, each with the attributes extra(t) gives. */
function mesh(tris, extra = () => '') {
  const v = [];
  const t = [];
  for (let i = 0; i < tris.length / 3; i++) v.push(`<vertex x="${tris[i * 3]}" y="${tris[i * 3 + 1]}" z="${tris[i * 3 + 2]}"/>`);
  for (let i = 0; i < tris.length / 9; i++) t.push(`<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"${extra(i)}/>`);
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh>`;
}
const model = (body) => `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">${body}</model>`;
const distinct = (full) => [...new Set(Array.from(full.slots, (s) => full.palette[s]))];

test('3MF colours: slicer painting, with the filament colours the project names', async () => {
  const body = model(`<resources><object id="1" type="model">${mesh(box(10, 10, 10), (t) => (t < 2 ? ' paint_color="8"' : ''))}</object></resources><build><item objectid="1"/></build>`);
  const file = zip({
    '3D/3dmodel.model': body,
    'Metadata/project_settings.config': JSON.stringify({ filament_colour: ['#FFFFFF', '#E02020FF'] }),
  });
  const full = await readPartFull('front.3mf', file, inflate);
  assert.equal(full.tris.length, 12 * 9);
  assert.equal(full.slots.length, 12);
  assert.deepEqual(new Set(distinct(full)), new Set([null, '#E02020']), 'unpainted is the part\'s own colour; painted 8 is the second filament');
  assert.equal(full.palette[full.slots[0]], '#E02020');
  assert.equal(full.palette[full.slots[5]], null);
});

test("3MF colours: Bambu's filament per part, from model_settings.config", async () => {
  const objects = model(`<resources><object id="1" type="model">${mesh(box(10, 10, 2))}</object><object id="2" type="model">${mesh(box(4, 4, 1, [0, 0, 2]))}</object></resources>`);
  const main = model(`<resources><object id="3" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"/><component p:path="/3D/Objects/object_1.model" objectid="2" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"/></components></object></resources><build><item objectid="3"/></build>`);
  const settings = '<config><object id="3"><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"><metadata key="extruder" value="1"/></part><part id="2" subtype="normal_part"><metadata key="extruder" value="2"/></part></object></config>';
  const file = zip({ '3D/3dmodel.model': main, '3D/Objects/object_1.model': objects, 'Metadata/model_settings.config': settings });
  const full = await readPartFull('panel.3mf', file, inflate);
  assert.equal(full.slots.length, 24);
  assert.equal(full.palette[full.slots[0]], null, 'filament 1 is the part\'s own colour');
  assert.ok(full.palette[full.slots[12]], 'filament 2 has a colour of its own');
  assert.notEqual(full.palette[full.slots[12]], null);
});

test('3MF colours: base materials and colour groups, by object and by triangle', async () => {
  const body = model(`<resources><basematerials id="5"><base name="Black" displaycolor="#202020FF"/><base name="Red" displaycolor="#D03030"/></basematerials>`
    + `<object id="1" type="model" pid="5" pindex="0">${mesh(box(10, 10, 10), (t) => (t === 3 ? ' pid="5" p1="1"' : ''))}</object></resources><build><item objectid="1"/></build>`);
  const full = await readPartFull('knob.3mf', zip({ '3D/3dmodel.model': body }), inflate);
  assert.deepEqual(distinct(full).sort(), ['#202020', '#D03030']);
  assert.equal(full.palette[full.slots[3]], '#D03030');
});

test('one colour, an STL, or parts with no colours given: no slots', async () => {
  const plain = model(`<resources><object id="1" type="model">${mesh(box(10, 10, 10))}</object><object id="2" type="model"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/></components></object></resources><build><item objectid="2"/></build>`);
  const full = await readPartFull('knob.3mf', zip({ '3D/3dmodel.model': plain }), inflate);
  assert.equal(full.slots, null, 'two components with no colours stay one colour');
  assert.equal(full.tris.length, 24 * 9);
  const stl = new Float32Array(box(5, 5, 5));
  const buf = Buffer.alloc(84 + 12 * 50);
  buf.writeUInt32LE(12, 80);
  for (let t = 0; t < 12; t++) for (let k = 0; k < 9; k++) buf.writeFloatLE(stl[t * 9 + k], 84 + t * 50 + 12 + k * 4);
  const s = await readPartFull('a.stl', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(s.slots, null);
  assert.equal(s.tris.length, 12 * 9);
});
