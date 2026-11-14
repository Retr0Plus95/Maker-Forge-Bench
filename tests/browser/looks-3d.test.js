// Bench 0.9 Task 4: Looks like picks a part's 3D model: one that fits from the library, one in the
// project folder, or your own GLB (kept in this browser).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, PNG_16, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const TINY_GLB = path.join(FIXTURES, 'kicad3d', 'tiny.glb'); // the converter's, from tiny.wrl: 10.16 × 2.54 × 5.08 mm
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());

/** A GLB's JSON and binary chunks, and back. */
function readGlb(buf) {
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  const at = 20 + len;
  return { json, bin: buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at)) };
}
function writeGlb(json, bin) {
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const b = pad(bin, 0);
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'ascii');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.write(type, 4, 'ascii');
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([head, chunk(j, 'JSON'), chunk(b, 'BIN\0')]);
}

/** The same tiny model saved in metres, as other programs write glTF. */
function inMetres(buf) {
  const { json, bin } = readGlb(buf);
  const root = json.nodes.find((n) => n.name === 'model');
  root.scale = root.scale.map((s) => s / 1000);
  return writeGlb(json, bin);
}

/** A 10 mm square (in metres) with a 16×16 PNG on it. */
function texturedSquare() {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0.01, 0]).buffer);
  const uv = Buffer.from(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]).buffer);
  const idx = Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
  const png = PNG_16;
  const bin = Buffer.concat([pos, uv, idx, png]);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'LABEL', pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, doubleSided: true }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 32 },
      { buffer: 0, byteOffset: 80, byteLength: 12 },
      { buffer: 0, byteOffset: 92, byteLength: png.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [0.01, 0.01, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };
  return writeGlb(json, bin);
}

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
  if (!(await page.locator('#part-looks').evaluate((d) => d.open))) await page.locator('#part-looks summary').click();
}
async function undo(page, key = 'Control+z') {
  await page.locator('#stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(key);
}
const realModel = (page, ref, id) => page.waitForFunction(([r, m]) => window.makerForge.board3d.info()?.models[r] === m, [ref, id], { timeout: 20000 });
const size = (box) => [0, 1, 2].map((k) => box.max[k] - box.min[k]);

describe('looks like: a part\'s 3D model', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'models'), { recursive: true });
    await copyFile(TINY_GLB, path.join(dir, 'models', 'tiny.glb'));
    await copyFile(path.join(FIXTURES, 'kicad3d', 'tiny.wrl'), path.join(dir, 'models', 'tiny.wrl'));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { realParts: true }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.waitForFunction(() => window.makerForge.board3d.info().realParts > 20, null, { timeout: 30000 });
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the models that fit are listed; picking one is one undo step, and kept after a reload', async () => {
    await openCard(page, 'C1A');
    const listed = await page.locator('#look-models [data-model]').evaluateAll((bs) => bs.map((b) => b.dataset.model));
    assert.ok(listed.includes(''), 'automatic first');
    assert.ok(listed.includes('cp-radial-d8.0-p5.00'), listed.join(' '));
    assert.ok(listed.includes('cp-radial-d10.0-p5.00'), listed.join(' '));
    assert.ok(!listed.some((m) => m.startsWith('r-axial')), 'no resistors for a capacitor');
    assert.equal((await info(page)).models.C1A, 'cp-radial-d8.0-p5.00');
    await page.locator('#look-models [data-model="cp-radial-d10.0-p5.00"]').click();
    await realModel(page, 'C1A', 'cp-radial-d10.0-p5.00');
    assert.equal(await page.locator('#look-models [data-model="cp-radial-d10.0-p5.00"]').getAttribute('aria-pressed'), 'true');
    await undo(page);
    await realModel(page, 'C1A', 'cp-radial-d8.0-p5.00');
    await undo(page, 'Control+y');
    await realModel(page, 'C1A', 'cp-radial-d10.0-p5.00');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.locator('#board3d-toggle').click();
    await realModel(page, 'C1A', 'cp-radial-d10.0-p5.00');
  });

  test("the project folder's .glb and .wrl are offered too (a .wrl through dev.py)", async () => {
    await openCard(page, 'J6');
    await page.locator('#look-models [data-model="project:models/tiny.glb"]').click();
    await realModel(page, 'J6', 'project:models/tiny.glb');
    await page.locator('#look-models [data-model="project:models/tiny.wrl"]').click();
    await realModel(page, 'J6', 'project:models/tiny.wrl');
    const box = size((await info(page)).realBoxes.J6);
    assert.ok(Math.abs(Math.max(...box) - 10.16) < 0.05, `the .wrl in mm: ${box}`);
  });

  test('your own GLB is used and kept in this browser; one in metres comes out the same size', async () => {
    await openCard(page, 'R6');
    await page.locator('#look-own-file').setInputFiles(TINY_GLB);
    await page.waitForFunction(() => /^own:[0-9a-f]{16}$/.test(window.makerForge.board3d.info()?.models.R6 || ''), null, { timeout: 20000 });
    const mm = size((await info(page)).realBoxes.R6);
    await openCard(page, 'R5');
    await page.locator('#look-own-file').setInputFiles({ name: 'tiny-in-metres.glb', mimeType: 'model/gltf-binary', buffer: inMetres(await readFile(TINY_GLB)) });
    await page.waitForFunction(() => /^own:/.test(window.makerForge.board3d.info()?.models.R5 || ''), null, { timeout: 20000 });
    const m = size((await info(page)).realBoxes.R5);
    mm.forEach((v, k) => assert.ok(Math.abs(m[k] - v) <= v * 0.01 + 1e-6, `metres ${m} vs mm ${mm}`));
    assert.ok(Math.abs(Math.max(...mm) - 10.16) < 0.05, `mm: ${mm}`);
    const own = await page.locator('#look-models [data-model^="own:"]').count();
    assert.equal(own, 2, 'both of your own models are listed');
  });

  test('a file over 5 MB and one that is not a GLB are refused, saying why', async () => {
    await openCard(page, 'C4');
    const big = Buffer.alloc(6 * 1024 * 1024);
    big.write('glTF', 0, 'ascii');
    await page.locator('#look-own-file').setInputFiles({ name: 'huge.glb', mimeType: 'model/gltf-binary', buffer: big });
    await page.waitForFunction(() => /5 MB/.test(document.querySelector('#look-models-status')?.textContent || ''));
    await page.locator('#look-own-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.waitForFunction(() => /GLB/.test(document.querySelector('#look-models-status')?.textContent || '') &&
      !/5 MB/.test(document.querySelector('#look-models-status')?.textContent || ''));
    assert.ok(!/^own:/.test((await info(page)).models.C4 || ''), 'C4 kept its model');
  });

  test('a GLB with a picture on it shows the picture, within the page\'s security rules', async () => {
    await openCard(page, 'C4');
    await page.locator('#look-own-file').setInputFiles({ name: 'label.glb', mimeType: 'model/gltf-binary', buffer: texturedSquare() });
    await page.waitForFunction(() => /^own:/.test(window.makerForge.board3d.info()?.models.C4 || ''), null, { timeout: 20000 });
    assert.ok((await info(page)).textures.C4 >= 1, 'the PNG is on it');
    const box = size((await info(page)).realBoxes.C4);
    assert.ok(Math.abs(Math.max(...box) - 10) < 0.05, `scaled from metres: ${box}`);
  });

  test("your own models survive a reload; the progress file names them but doesn't hold them, and says so", async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => /^own:/.test(window.makerForge.board3d.info()?.models.R6 || ''), null, { timeout: 20000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
    const text = await readFile(await download.path(), 'utf8');
    const saved = JSON.parse(text);
    assert.match(saved.looks.R6.model, /^own:[0-9a-f]{16}$/);
    assert.ok(text.length < 50000, 'no model bytes in it');
    assert.ok(!text.includes('glTF'));
    assert.match(await page.locator('#status').textContent(), /own 3D model/i);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
