// Bench 1.0.5 "The case": reading STL and 3MF parts, their size, plastic and fit, and what the READMEs say.
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  PRINTERS, browserInflate, cleanMaterial, cleanPrinter, fitOnBed, gramsText, isCasePart, meshFacts, metresText, parse3MF, parseSTL,
  partNotes, partWarnings, plastic, printHint, readPart, sizeText, unzip3MF, zipEntries, zipRead,
} from '../../src/caseparts.js';

const inflate = async (data) => new Uint8Array(inflateRawSync(data));

/** A closed box w × d × h with one corner at (x, y, z), outward-facing: 12 triangles. */
function box(w, d, h, [x, y, z] = [0, 0, 0]) {
  const p = (i, j, k) => [x + i * w, y + j * d, z + k * h];
  const quads = [
    [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)], // bottom (faces down)
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], // top
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)], // front (y = 0)
    [p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)], // back
    [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)], // left
    [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)], // right
  ];
  const out = [];
  for (const [a, b, c, e] of quads) out.push(...a, ...b, ...c, ...a, ...c, ...e);
  return out;
}

function binarySTL(tris) {
  const n = tris.length / 9;
  const buf = Buffer.alloc(84 + n * 50);
  buf.writeUInt32LE(n, 80);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) buf.writeFloatLE(tris[t * 9 + k], 84 + t * 50 + 12 + k * 4);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function asciiSTL(tris) {
  let s = 'solid part\n';
  for (let t = 0; t < tris.length / 9; t++) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (let v = 0; v < 3; v++) s += `   vertex ${tris[t * 9 + v * 3]} ${tris[t * 9 + v * 3 + 1]} ${tris[t * 9 + v * 3 + 2]}\n`;
    s += '  endloop\n endfacet\n';
  }
  return new TextEncoder().encode(s + 'endsolid part\n').buffer;
}

/** A zip of { name: text }, deflated (or stored with store: true). */
export function zip(files, { store = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(store ? 0 : 8, 10);
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

const RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

/** A 3MF model's XML for a mesh (tris), as one object with the given id. */
function meshObject(id, tris) {
  const v = [];
  const t = [];
  for (let i = 0; i < tris.length / 3; i++) v.push(`<vertex x="${tris[i * 3]}" y="${tris[i * 3 + 1]}" z="${tris[i * 3 + 2]}"/>`);
  for (let i = 0; i < tris.length / 9; i++) t.push(`<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"/>`);
  return `<object id="${id}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
}

test('a case part is an STL or 3MF file, any case', () => {
  assert.ok(isCasePart('case/stl/left-box.stl') && isCasePart('Knob.3MF') && isCasePart('a.STL'));
  assert.ok(!isCasePart('board.glb') && !isCasePart('stl/readme.md') && !isCasePart('x.stl.txt') && !isCasePart(''));
});

test('STL: binary and text give the same triangles, and the facts of a 60 × 40 × 30 box', () => {
  const tris = box(60, 40, 30, [5, -10, 2]);
  const a = parseSTL(binarySTL(tris));
  const b = parseSTL(asciiSTL(tris));
  assert.equal(a.length, 108);
  assert.deepEqual([...a], [...b]);
  const f = meshFacts(a);
  assert.equal(f.tris, 12);
  assert.deepEqual(f.size, [60, 40, 30]);
  assert.deepEqual(f.min, [5, -10, 2]);
  assert.ok(Math.abs(f.volume - 72000) < 1e-6, String(f.volume));
  assert.ok(Math.abs(f.area - 2 * (60 * 40 + 60 * 30 + 40 * 30)) < 1e-6);
  assert.equal(f.open, 0, 'closed');
  assert.equal(f.insideOut, false);
  assert.throws(() => parseSTL(new TextEncoder().encode('solid nothing\nendsolid\n').buffer), /readable STL/);
  assert.throws(() => parseSTL(new TextEncoder().encode('vertex 1 2 3\nvertex 4 5\n').buffer), /readable STL/);
});

test('the surface check: a missing face leaves open edges; a mirrored box is inside out', () => {
  const tris = box(10, 10, 10);
  const open = meshFacts(new Float32Array(tris.slice(0, 9 * 10))); // the right side's two triangles gone
  assert.equal(open.open, 4, 'the four edges round the hole');
  // two closed boxes meeting along an edge (as Maker Forge's boxes' pieces do): four triangles on that edge, no gap
  const touching = meshFacts(new Float32Array([...box(10, 10, 10), ...box(10, 10, 10, [10, 10, 0])]));
  assert.equal(touching.open, 0, 'an edge where two pieces meet is not a gap');
  const flipped = [];
  for (let t = 0; t < tris.length / 9; t++) flipped.push(...tris.slice(t * 9, t * 9 + 3), ...tris.slice(t * 9 + 6, t * 9 + 9), ...tris.slice(t * 9 + 3, t * 9 + 6));
  const inside = meshFacts(new Float32Array(flipped));
  assert.equal(inside.insideOut, true);
  assert.ok(Math.abs(inside.volume - 1000) < 1e-6, 'the volume is still counted');
  const w = partWarnings(inside, { fits: true }, [256, 256, 256]);
  assert.ok(w.some((x) => /inside out/.test(x.text)));
  assert.ok(partWarnings(open, { fits: true }, [256, 256, 256]).some((x) => x.level === 'info' && /4 open edges/.test(x.text)));
});

test('3MF: build items, components with transforms, a second model file, units, deflated or stored', async () => {
  const cube = box(10, 10, 10);
  const main = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources>
    ${meshObject(1, cube)}
    <object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/><component p:path="/3D/Objects/object_1.model" objectid="5"/></components></object>
  </resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 5"/></build></model>`;
  const other = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${meshObject(5, box(5, 5, 40))}</resources><build/></model>`;
  for (const store of [false, true]) {
    const bytes = zip({ '[Content_Types].xml': '<Types/>', '_rels/.rels': RELS, '3D/3dmodel.model': main, '3D/Objects/object_1.model': other }, { store });
    assert.deepEqual(zipEntries(bytes).map((e) => e.name), ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', '3D/Objects/object_1.model']);
    const { files, main: start } = await unzip3MF(bytes, inflate);
    assert.equal(start, '/3D/3dmodel.model');
    const tris = parse3MF(files, start);
    assert.equal(tris.length, 24 * 9, 'the cube moved 20 mm, and the tall block from the other file');
    const f = meshFacts(tris);
    assert.deepEqual(f.min, [0, 0, 5]);
    assert.deepEqual(f.size, [30, 10, 40], 'from x 0 to 30 (the cube at 20), lifted 5 mm by the item');
    const again = await readPart('knob.3mf', bytes, inflate);
    assert.deepEqual([...again], [...tris]);
  }
  const inch = `<model unit="inch"><resources>${meshObject(1, box(1, 2, 0.5))}</resources><build><item objectid="1"/></build></model>`;
  const f = meshFacts(parse3MF({ '/3D/3dmodel.model': inch }, '/3D/3dmodel.model'));
  assert.deepEqual(f.size.map((v) => Math.round(v * 100) / 100), [25.4, 50.8, 12.7], 'inches become millimetres');
  await assert.rejects(unzip3MF(new TextEncoder().encode('not a zip at all').buffer, inflate), /not a zip/);
  await assert.rejects(unzip3MF(zip({ 'a.txt': 'hello' }), inflate), /no 3D model/);
  assert.throws(() => parse3MF({ '/3D/3dmodel.model': '<model><resources/><build/></model>' }), /no triangles/);
});

test('3MF: components that name each other many times over stop at a budget instead of running away', () => {
  const comps = (id, of) => `<object id="${id}"><components>${Array.from({ length: 10 }, () => `<component objectid="${of}"/>`).join('')}</components></object>`;
  const xml = `<model><resources><object id="0"><components/></object>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => comps(i, i - 1)).join('')}</resources><build><item objectid="8"/></build></model>`;
  const t0 = Date.now();
  assert.throws(() => parse3MF({ '/3D/3dmodel.model': xml }, '/3D/3dmodel.model'), /too many parts inside/);
  assert.ok(Date.now() - t0 < 3000, '10⁸ calls would take minutes');
});

test('a zip that unpacks too big is stopped while it unpacks', async () => {
  const bomb = zip({ '3D/3dmodel.model': 'x'.repeat(2e6) });
  const entry = zipEntries(bomb)[0];
  const limited = async (data, limit) => { const out = await inflate(data); if (out.length > Math.min(limit, 1e6)) throw new RangeError('unpacks too big'); return out; };
  await assert.rejects(zipRead(bomb, entry, limited), /unpacks too big/);
  // the browser's own inflate (Node has DecompressionStream too) stops part way, and unpacks what fits
  const packed = new Uint8Array(deflateRawSync(Buffer.from('x'.repeat(2e6))));
  await assert.rejects(browserInflate(packed, 1e6), /unpacks too big/);
  assert.equal((await browserInflate(packed, 3e6)).length, 2e6);
  // and a whole 3MF read with it
  const bytes = zip({ '_rels/.rels': RELS, '3D/3dmodel.model': `<model><resources>${meshObject(1, box(4, 5, 6))}</resources><build><item objectid="1"/></build></model>` });
  assert.deepEqual(meshFacts(await readPart('a.3mf', bytes)).size, [4, 5, 6]);
});

test('3MF: a component loop or a missing object does not hang or break it', () => {
  const xml = `<model><resources>${meshObject(1, box(2, 2, 2))}<object id="7"><components><component objectid="7"/><component objectid="1"/><component objectid="99"/></components></object></resources><build><item objectid="7"/></build></model>`;
  const tris = parse3MF({ '/3D/3dmodel.model': xml }, '/3D/3dmodel.model');
  assert.equal(tris.length % 108, 0);
  assert.ok(tris.length >= 108 && tris.length <= 108 * 9, 'the cube, a few times through the loop at most');
});

test('plastic: walls and 15 % infill, and solid; the words for grams and metres', () => {
  const big = meshFacts(new Float32Array(box(100, 100, 100)));
  const p = plastic(big, 'PETG');
  // 60 000 mm² × 1.2 mm of wall = 72 000 mm³, plus 15 % of the 928 000 mm³ inside = 139 200: 211 200 mm³
  assert.ok(Math.abs(p.grams - 211.2 * 1.27) < 1e-6, String(p.grams));
  assert.ok(Math.abs(p.solidGrams - 1000 * 1.27) < 1e-6);
  assert.ok(Math.abs(p.metres - 211200 / (Math.PI * 0.875 * 0.875) / 1000) < 1e-6);
  const thin = meshFacts(new Float32Array(box(50, 50, 1)));
  assert.ok(Math.abs(plastic(thin, 'PLA').grams - plastic(thin, 'PLA').solidGrams) < 1e-9, 'a thin plate is all wall: solid');
  assert.ok(plastic(big, 'nonsense').grams < p.grams, 'an unknown plastic is PLA (lighter than PETG)');
  assert.equal(cleanMaterial('ABS'), 'ABS');
  assert.equal(cleanMaterial('__proto__'), 'PLA');
  assert.deepEqual([gramsText(0.4), gramsText(3.14), gramsText(268.2), gramsText(1530)], ['under 1 g', 'about 3.1 g', 'about 268 g', 'about 1.5 kg']);
  assert.deepEqual([metresText(0.2), metresText(88.43)], ['20 cm', '88.4 m']);
  assert.equal(sizeText([151.5, 222, 122.04]), '151.5 × 222 × 122 mm');
});

test('the bed: fits as it lies, turned on the bed, on another side, or not at all', () => {
  const bed = [256, 256, 256];
  assert.deepEqual(fitOnBed([151.5, 222, 122], bed), { fits: true, turned: false, side: null, over: 0 });
  assert.equal(fitOnBed([240, 200, 50], [250, 210, 220]).fits, true);
  assert.deepEqual(fitOnBed([200, 240, 50], [250, 210, 220]), { fits: true, turned: true, side: null, over: 0 }, 'turned 90° on the bed');
  const mk4 = [250, 210, 220];
  const tall = fitOnBed([40, 40, 240], mk4);
  assert.equal(tall.fits, false);
  assert.deepEqual(tall.side, [40, 240, 40], 'laid down (and turned across the bed) it fits');
  assert.equal(tall.over, 20);
  assert.equal(fitOnBed([40, 40, 270], bed).side, null, 'laid down it is still 270 mm long');
  const long = fitOnBed([303, 222, 122], bed);
  assert.equal(long.fits, false);
  assert.equal(long.side, null, '303 mm fits no side of a 256 mm printer');
  assert.equal(long.over, 47);
  const w = partWarnings(meshFacts(new Float32Array(box(303, 222, 122))), long, bed);
  assert.match(w[0].text, /Too big for your printer \(256 × 256 × 256 mm\) by 47 mm/);
  assert.match(partWarnings(meshFacts(new Float32Array(box(40, 40, 240))), tall, mk4)[0].text, /\(250 × 210 × 220 mm\) as it lies\. Laid on another side \(40 × 240 × 40 mm\) it fits/);
  assert.ok(partWarnings(meshFacts(new Float32Array(box(1, 0.5, 0.2))), { fits: true }, bed).some((x) => /inches or metres/.test(x.text)));
});

test('the printer setting: a known printer, or your own size within reason', () => {
  assert.deepEqual(cleanPrinter(null), { id: PRINTERS[0].id, bed: [256, 256, 256] });
  assert.deepEqual(cleanPrinter({ id: 'prusa-mk4', bed: [1, 2, 3] }), { id: 'prusa-mk4', bed: [250, 210, 220] }, "a known printer's own size");
  assert.deepEqual(cleanPrinter({ id: 'own', bed: [300, '320', 400.04] }), { id: 'own', bed: [300, 320, 400] });
  assert.deepEqual(cleanPrinter({ id: 'own', bed: [5, 300, 300] }), { id: 'own', bed: [256, 256, 256] }, 'a size too small to be a printer');
  assert.deepEqual(cleanPrinter({ id: 'own', bed: 'big' }).bed, [256, 256, 256]);
  assert.deepEqual(cleanPrinter({ id: '<b>' }).id, PRINTERS[0].id);
});

test('print notes: the plastic and supports, read from the words', () => {
  assert.deepEqual(printHint('PETG, upright, supports on'), { material: 'PETG', supports: true });
  assert.deepEqual(printHint('Clear PETG, no supports'), { material: 'PETG', supports: false });
  assert.deepEqual(printHint('PETG, as they lie (outside face down), no supports'), { material: 'PETG', supports: false });
  assert.deepEqual(printHint('TPU 95A, without support'), { material: 'TPU', supports: false });
  assert.deepEqual(printHint('as it lies'), { material: null, supports: null });
  assert.deepEqual(printHint('PLA; tree supports everywhere'), { material: 'PLA', supports: true });
});

test("the READMEs' tables: what each part is and how to print it, with wildcards and \"same\"", () => {
  // as the four-channel bench supply's case/README.md writes it
  const text = [
    '# The case', '', '## Files', '',
    '| File | What it is | Print |', '|---|---|---|',
    '| `stl/left-box.stl` | Left half: display and controls | PETG, upright, supports on |',
    '| `stl/left-lid.stl`, `stl/right-lid.stl` | The lids | PETG, as they lie, no supports |',
    '| `stl/*-pilot-light-lenses-2.stl` | The printed jewel lenses | Clear PETG, no supports |',
    '| `stl/plate-usb-socket.stl` | Output plate: a USB socket | PETG, as it lies (front face down) |',
    '| [stl/plate-blank.stl](stl/plate-blank.stl) | Output plate with no holes | same |',
    '| `maker-forge/psu-case-left.json` | The left half as a Maker Forge project | |',
    '', '## Hardware', '', '| Part | Qty |', '|---|---|', '| M3 insert | 8 |',
  ].join('\n');
  const parts = ['case/stl/left-box.stl', 'case/stl/left-lid.stl', 'case/stl/right-lid.stl', 'case/stl/left-pilot-light-lenses-2.stl',
    'case/stl/right-pilot-light-lenses-2.stl', 'case/stl/plate-usb-socket.stl', 'case/stl/plate-blank.stl', 'case/stl/right-box.stl'];
  const notes = partNotes([{ path: 'case/README.md', text }], parts);
  assert.deepEqual(notes.get('case/stl/left-box.stl'), { what: 'Left half: display and controls', print: 'PETG, upright, supports on', readme: 'case/README.md', order: 0 });
  assert.equal(notes.get('case/stl/right-lid.stl').what, 'The lids');
  assert.equal(notes.get('case/stl/right-pilot-light-lenses-2.stl').print, 'Clear PETG, no supports', 'a * in the name');
  assert.equal(notes.get('case/stl/plate-blank.stl').print, 'PETG, as it lies (front face down)', '"same" is the row above');
  assert.equal(notes.has('case/stl/right-box.stl'), false, 'a part the table leaves out has no notes');
  assert.deepEqual([...notes.keys()].map((p) => notes.get(p).order), [0, 1, 2, 3, 4, 5, 6], 'in the order the README lists them');
  // a README at the top naming a part in a folder; a table without a File column is ignored
  const top = partNotes([{ path: 'README.md', text: '| File | Print |\n|---|---|\n| case/stl/right-box.stl | PLA |\n\n| Name | What |\n|---|---|\n| case/stl/left-box.stl | x |' }], parts);
  assert.deepEqual([...top.keys()], ['case/stl/right-box.stl']);
  assert.equal(top.get('case/stl/right-box.stl').what, '');
});
