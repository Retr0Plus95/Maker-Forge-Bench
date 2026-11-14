import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());
const view = (page) => page.evaluate(() => window.makerForge.board3d.view());
const screenOf = (page, ref) => page.evaluate((r) => window.makerForge.board3d.screenOf(r), ref);

describe('the 3D board: look, controls and tools', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await nextFrame(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('studio light, soft shadows and a solder joint under every leg', async () => {
    const i = await info(page);
    assert.equal(i.env, true);
    assert.equal(i.shadows, true);
    assert.ok(i.joints.soldered + i.joints.bare > 80, `${JSON.stringify(i.joints)} joints`);
    assert.equal(await page.locator('#zoom-level').isVisible(), false, "the sheet's zoom badge steps aside");
  });

  test('view buttons: front, side, 3/4 and fit', async () => {
    await page.locator('#board3d-front').click();
    assert.equal(await view(page), 'front');
    await page.locator('#board3d-side').click();
    assert.equal(await view(page), 'side');
    await page.locator('#board3d-iso').click();
    assert.equal(await view(page), 'iso');
    const before = (await info(page)).camera;
    await page.locator('#board3d-fit').click();
    const after = (await info(page)).camera;
    assert.notDeepEqual(after, before, 'fit moved the camera');
  });

  test('the view cube: clicking its top face looks from the top', async () => {
    await page.locator('#board3d-iso').click();
    const cube = (await info(page)).cube;
    await page.mouse.click(cube.x + cube.size / 2, cube.y + cube.size * 0.3);
    assert.equal(await view(page), 'top');
  });

  test('hovering a part names it', async () => {
    const at = await screenOf(page, 'C1A');
    await page.mouse.move(at.x, at.y);
    await page.waitForFunction(() => window.makerForge.board3d.info().hover === 'C1A');
    assert.match(await page.locator('.board3d-tip').textContent(), /^C1A · 100 /);
    await page.mouse.move(5, 300);
  });

  test('the arrow keys turn the board', async () => {
    const before = (await info(page)).camera;
    await page.locator('#board3d-view canvas').focus();
    await page.keyboard.press('ArrowLeft');
    assert.notDeepEqual((await info(page)).camera, before);
  });

  test('exploded view lifts the parts off the board', async () => {
    const before = await screenOf(page, 'C1A');
    await page.locator('#board3d-explode').fill('1');
    assert.equal((await info(page)).explode, 1);
    const after = await screenOf(page, 'C1A');
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 10, 'it moved');
    await page.locator('#board3d-explode').fill('0');
  });

  test('X-ray, labels, and the cut-away', async () => {
    await page.locator('#board3d-xray').check();
    assert.equal((await info(page)).xray, true);
    await page.locator('#board3d-xray').uncheck();
    await page.locator('#board3d-labels').uncheck();
    assert.equal((await info(page)).labels, false);
    await page.locator('#board3d-labels').check();
    await page.locator('#board3d-clip').fill('0.5');
    assert.equal((await info(page)).clip, 0.5);
    await page.locator('#board3d-clip').fill('1');
    assert.equal((await info(page)).clip, null);
  });

  test('measuring: two clicks give the distance in mm and in holes', async () => {
    await page.locator('#board3d-top').click();
    await page.locator('#board3d-measure-toggle').click();
    const a = await screenOf(page, 'R8');
    const b = await screenOf(page, 'R9');
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    const m = (await info(page)).measure;
    assert.ok(m && m.mm > 3, JSON.stringify(m));
    assert.match(await page.locator('#board3d-measure').textContent(), /^\d+\.\d mm · \d+\.\d holes$/);
    await page.locator('#board3d-measure-toggle').click();
    assert.equal((await info(page)).measuring, false);
  });

  test('"Build up to this step" hides the later steps\' parts', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'The DIP socket' }).click();
    await page.locator('#board3d-upto').check();
    assert.ok((await info(page)).hidden > 20, `${(await info(page)).hidden} hidden`);
    await page.locator('#board3d-upto').uncheck();
    assert.equal((await info(page)).hidden, 0);
  });

  test('Play the steps builds the board up one step at a time', async () => {
    await page.locator('#board3d-play').click();
    assert.equal(await page.locator('#board3d-play').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 1 of 10: Bare-wire buses');
    await page.waitForFunction(() => document.querySelector('#steps .step-title')?.textContent.startsWith('Step 2'), null, { timeout: 5000 });
    assert.ok((await info(page)).hidden > 0);
    await page.locator('#board3d-play').click();
    assert.equal(await page.locator('#board3d-play').getAttribute('aria-pressed'), 'false');
  });

  test("a line's Show lights its parts in 3D too", async () => {
    await page.locator('#wiring details[data-net="TACHA_F"] summary').click();
    await page.locator('#wiring details[data-net="TACHA_F"] .wire-show').click();
    assert.deepEqual((await info(page)).net.sort(), ['J2', 'R12', 'R8']);
  });

  test('save a picture, and the board as STL', async () => {
    const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#board3d-png').click()]);
    assert.match(png.suggestedFilename(), /-3d\.png$/);
    const [stl] = await Promise.all([page.waitForEvent('download'), page.locator('#board3d-stl').click()]);
    assert.match(stl.suggestedFilename(), /-board\.stl$/);
    const bytes = await readFile(await stl.path());
    const triangles = bytes.readUInt32LE(80);
    assert.ok(triangles > 1000, `${triangles} triangles`);
    assert.equal(bytes.length, 84 + triangles * 50);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
