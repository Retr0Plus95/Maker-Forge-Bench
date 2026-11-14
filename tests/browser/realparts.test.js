// Bench 0.9 Task 3: real KiCad parts in the 3D view, painted with Bench's markings.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, REPO, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';
import { MISS_LIMIT, modelFor, placeFor } from '../../src/library-match.js';
import { parseProject } from '../../src/project.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());
const screenOf = (page, ref) => page.evaluate((r) => window.makerForge.board3d.screenOf(r), ref);
const T = 1.6;
const PITCH = 2.54;
/** Chrome's own line for a request answered 404: the page can't keep it out of the console. */
const NOT_FOUND = /^console: Failed to load resource: the server responded with a status of 404 \(Not Found\)$/;

/** The parts the library should draw, worked out here from index.json and the project, as Bench does. */
async function expectedReal(json) {
  const index = JSON.parse(await readFile(path.join(REPO, 'src', 'library', 'index.json'), 'utf8'));
  const project = parseProject(json);
  const value = (ref) => (project.parts.find((q) => q.ref === ref) || {}).value;
  return Object.entries(project.board.parts).filter(([ref, part]) => {
    const placed = placeFor(modelFor({ ...part, ref, value: value(ref) }, {}, index), part);
    return placed && placed.miss <= MISS_LIMIT;
  }).map(([ref]) => ref).sort();
}

async function open3D({ project, viewport = { width: 1400, height: 950 }, before: setUp, realParts = true } = {}) {
  const dir = await copyFixture('fume-extractor');
  const json = project || await readFile(PROJECT, 'utf8');
  await writeFile(path.join(dir, 'forge-project.json'), json);
  const server = await startDevServer(dir);
  const opened = await openPage(server.url, viewport, { realParts, before: setUp });
  await opened.page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  return { server, json, ...opened };
}

async function show3D(page) {
  await page.locator('#board3d-toggle').click();
  await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
}

describe('real parts in the 3D view', () => {
  let server; let browser; let page; let problems; let real; let json;

  before(async () => {
    ({ server, browser, page, problems, json } = await open3D());
    real = await expectedReal(json);
    await show3D(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('simple parts first, then the library\'s, and the loading bar goes away', async () => {
    assert.equal((await info(page)).parts, 32);
    for (const ref of ['R4', 'R6', 'C3', 'C4', 'C1A', 'C2', 'U2', 'Y1', 'U1']) assert.ok(real.includes(ref), `${ref} should be real`);
    await page.waitForFunction((n) => window.makerForge.board3d.info().realParts === n, real.length, { timeout: 30000 });
    const i = await info(page);
    assert.deepEqual([...i.realRefs].sort(), real);
    assert.equal(i.simpleParts, i.parts - real.length);
    assert.equal(i.models.R4, 'r-axial-din0207-l6.3-d2.5-p10.16-h');
    assert.equal(i.models.U2, 'dip-28-w7.62-socket');
    assert.equal(i.models.Y1, 'crystal-hc49-4h-v');
    await page.waitForFunction(() => document.querySelector('#board3d-loading').hidden);
  });

  test("R6 is painted: a tinted body and its colour bands; the electrolytic keeps its printed value", async () => {
    const i = await info(page);
    assert.ok([4, 5].includes(i.bands.R6.length), `R6 bands: ${i.bands.R6}`);
    assert.equal(i.tinted.R6, '#d9c39a');
    const value = (parseProject(json).parts.find((q) => q.ref === 'C1A') || {}).value;
    assert.ok(i.prints.C1A.some((t) => value.startsWith(t.slice(0, 3))), `C1A prints: ${i.prints.C1A}`);
  });

  test("the ATmega sits in its socket: KiCad's socket model with the chip's own model on top", async () => {
    const i = await info(page);
    assert.equal(i.models.U2, 'dip-28-w7.62-socket');
    assert.ok(i.realBoxes.U2.max[1] > 7, `U2's body reaches ${i.realBoxes.U2.max[1]} mm: socket 4 mm, chip 3.7 mm on top`);
    assert.deepEqual(i.prints.U2, ['ATMEGA328P-PU']);
  });

  test('Simple brings back the drawn parts, is kept after a reload, and Real swaps them back', async () => {
    await page.locator('#board3d-parts-simple').click();
    let i = await info(page);
    assert.equal(i.realParts, 0);
    assert.equal(i.simpleParts, 32);
    assert.equal(await page.locator('#board3d-parts-simple').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await show3D(page);
    await nextFrame(page);
    i = await info(page);
    assert.equal(i.realParts, 0, 'still Simple after a reload');
    assert.equal(await page.locator('#board3d-parts-simple').getAttribute('aria-pressed'), 'true');
    await page.locator('#board3d-parts-real').click();
    await page.waitForFunction((n) => window.makerForge.board3d.info().realParts === n, real.length, { timeout: 30000 });
    assert.equal(await page.locator('#board3d-parts-real').getAttribute('aria-pressed'), 'true');
  });

  test('picking a real R6 selects it, and explode and X-ray still work on it', async () => {
    await page.locator('#board3d-top').click();
    await nextFrame(page);
    const at = await screenOf(page, 'R6');
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R6');
    assert.equal((await info(page)).selected, 'R6');
    await page.locator('#board3d-explode').fill('1');
    const lifted = await screenOf(page, 'R6');
    assert.ok(Math.hypot(lifted.x - at.x, lifted.y - at.y) > 5, 'exploding moved it');
    await page.locator('#board3d-explode').fill('0');
    await page.locator('#board3d-xray').check();
    assert.equal((await info(page)).xray, true);
    await page.locator('#board3d-xray').uncheck();
  });

  test('a part under the board sits under it, on its holes', async () => {
    const i = await info(page);
    const box = i.realBoxes.C5;
    assert.ok(box.max[1] < -T, `C5's top is at ${box.max[1]}`);
    const project = parseProject(json);
    const holes = Object.values(project.board.parts.C5.pins).map(([c, r]) => [(c - 1) * PITCH, (r - 1) * PITCH]);
    for (const pin of i.realPins.C5) {
      const d = Math.min(...holes.map((h) => Math.hypot(h[0] - pin[0], h[1] - pin[1])));
      assert.ok(d <= 0.3, `a C5 pin is ${d.toFixed(2)} mm from its hole`);
    }
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('real parts: a missing or broken model file, and a part the library has no model for', () => {
  let server; let browser; let page; let problems; let real;

  before(async () => {
    const project = JSON.parse(await readFile(PROJECT, 'utf8'));
    project.board.parts.J4.pins = Object.fromEntries(Array.from({ length: 24 }, (_, k) => [String(k + 1), [k + 3, 19]]));
    ({ server, browser, page, problems } = await open3D({
      project: JSON.stringify(project, null, 1),
      before: async (p) => {
        await p.route('**/library/models/r-axial-din0207-l6.3-d2.5-p10.16-h.glb', (route) => route.fulfill({ status: 404, body: 'Not Found' }));
        await p.route('**/library/models/molex-kk-4.glb', (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'not a GLB at all' }));
      },
    }));
    real = (await expectedReal(JSON.stringify(project))).filter((ref) => !['R4', 'J2', 'J3'].includes(ref));
    await show3D(page);
    await page.waitForFunction((n) => window.makerForge.board3d.info().realParts === n, real.length, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#board3d-loading').hidden);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('those parts stay drawn simple, and say why', async () => {
    const i = await info(page);
    assert.equal(i.simpleParts, 4);
    for (const ref of ['R4', 'J2', 'J3']) assert.equal(i.whySimple[ref], "the model didn't load", ref);
    assert.equal(i.whySimple.J4, 'no library model fits');
    assert.ok(!i.realRefs.includes('J4'));
  });

  test('no errors', () => assert.deepEqual(problems.filter((p) => !NOT_FOUND.test(p)), []));
});

describe('real parts on a phone over a slow network', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await open3D({ viewport: { width: 375, height: 812 }, realParts: true }));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the drawn parts show at once, and the loading bar counts up', async () => {
    // three.js itself is fetched before the network slows: this is about the library's models
    await page.evaluate(() => Promise.all([import('./three.module.js'), import('./three-orbit-controls.js'), import('./three-gltf-loader.js')]));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
    const start = Date.now();
    await page.evaluate(() => document.querySelector('#board3d-toggle').click());
    await page.waitForFunction(() => window.makerForge.board3d.info()?.parts === 32, null, { timeout: 2000 });
    assert.ok(Date.now() - start <= 2000, `${Date.now() - start} ms`);
    assert.equal((await info(page)).realParts, 0, 'nothing real yet: the models are still coming');
    const count = () => page.evaluate(() => {
      const bar = document.querySelector('#board3d-loading');
      const m = /Real parts (\d+) of (\d+)/.exec(bar.textContent);
      return bar.hidden || !m ? null : Number(m[1]);
    });
    await page.waitForFunction(() => /Real parts \d+ of \d+/.test(document.querySelector('#board3d-loading').textContent) &&
      !document.querySelector('#board3d-loading').hidden, null, { timeout: 20000 });
    const first = await count();
    await page.waitForFunction((n) => {
      const m = /Real parts (\d+) of/.exec(document.querySelector('#board3d-loading').textContent);
      return m && Number(m[1]) > n;
    }, first, { timeout: 30000 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
