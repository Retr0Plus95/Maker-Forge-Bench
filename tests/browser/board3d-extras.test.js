import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());
const near = (a, b, tol = 0.5) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('3D board extras', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('keys: B turns the 3D board on, U shows the underside, T the top', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('b');
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    await page.keyboard.press('u');
    assert.equal(await page.evaluate(() => window.makerForge.board3d.view()), 'bottom');
    await page.keyboard.press('t');
    assert.equal(await page.evaluate(() => window.makerForge.board3d.view()), 'top');
  });

  test('each insulated link is one mesh', async () => {
    const i = await info(page);
    assert.equal(i.linkMeshes, i.links);
  });

  test("the selected part's holes light up and it lifts a little", async () => {
    await openCard(page, 'U2');
    const i = await info(page);
    assert.equal(i.selected, 'U2');
    assert.equal(i.litHoles, 28);
    assert.ok(i.lift > 0, `lift ${i.lift}`);
  });

  test('Wiring underneath can be hidden', async () => {
    await page.locator('#board3d-wiring').uncheck();
    assert.equal((await info(page)).wiring, false);
    await page.locator('#board3d-wiring').check();
    assert.equal((await info(page)).wiring, true);
  });

  test('double-click a part to turn to it; Reset view goes back', async () => {
    await nextFrame(page);
    const start = (await info(page)).target;
    const at = await page.evaluate(() => window.makerForge.board3d.screenOf('R8'));
    await page.mouse.dblclick(at.x, at.y);
    const focused = (await info(page)).target;
    assert.ok(!near(focused, start, 2), `target moved: ${focused}`);
    assert.equal(await page.evaluate(() => document.querySelector('#part-card h2')?.firstChild?.textContent), 'R8');
    await page.locator('#board3d-reset').click();
    assert.ok(near((await info(page)).target, start), 'back to the whole board');
  });

  test('the camera is remembered for the project', async () => {
    const at = await page.evaluate(() => window.makerForge.board3d.screenOf('R8'));
    await page.mouse.dblclick(at.x, at.y);
    const target = (await info(page)).target;
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 15000 });
    assert.ok(near((await info(page)).target, target), `kept: ${(await info(page)).target} vs ${target}`);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 15000 });
    assert.ok(near((await info(page)).target, target), 'still kept after a second reload');
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('b');
    assert.equal(await page.locator('#board3d').isVisible(), false);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
