import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function withProject(run, options) {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  const server = await startDevServer(dir);
  const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }, options);
  try {
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await run(page, problems);
  } finally {
    await browser.close();
    await server.stop();
  }
}

describe('the 3D board', () => {
  test('draws the board over the dimmed schematic, and clicking a part selects it', () => withProject(async (page, problems) => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    assert.equal(await page.locator('#board3d canvas').isVisible(), true);
    assert.equal(await page.locator('#board3d-toggle').getAttribute('aria-pressed'), 'true');
    assert.ok(Number(await page.evaluate(() => getComputedStyle(document.querySelector('#sheet-host')).opacity)) < 1, 'schematic dimmed');
    assert.equal(await page.locator('#tabs [role=tab][aria-selected=true]').textContent(), 'SFE-01 Main schematic');
    await nextFrame(page);
    const at = await page.evaluate(() => window.makerForge.board3d.screenOf('R8'));
    assert.ok(at, 'R8 is on screen');
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R8');
    await page.locator('#board3d-under').click();
    assert.equal(await page.evaluate(() => window.makerForge.board3d.view()), 'bottom');
    await page.locator('#board3d-toggle').click();
    assert.equal(await page.locator('#board3d').isVisible(), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#sheet-host')).opacity), '1');
    assert.deepEqual(problems, []);
  }));

  test('without WebGL it says so and points to sheet 4', () => withProject(async (page, problems) => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => !document.querySelector('#board3d-message').hidden, null, { timeout: 15000 });
    assert.equal(await page.locator('#board3d-message').textContent(), "This browser can't draw 3D here. Sheet 4 shows the same layout flat.");
    assert.deepEqual(problems, []);
  }, { args: ['--disable-webgl', '--disable-3d-apis'] }));

  test('the underside mirrors left to right, like Flip on sheet 4', () => withProject(async (page, problems) => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    await nextFrame(page);
    const where = () => page.evaluate(() => Object.fromEntries(['J0', 'R7', 'R6'].map((r) => [r, window.makerForge.board3d.screenOf(r)])));
    const top = await where();
    assert.ok(top.J0.x < top.R7.x && top.J0.y < top.R6.y, JSON.stringify(top));
    await page.locator('#board3d-under').click();
    await nextFrame(page);
    const under = await where();
    assert.ok(under.J0.x > under.R7.x, `columns mirrored: ${JSON.stringify(under)}`);
    assert.ok(under.J0.y < under.R6.y, `row 1 still at the top: ${JSON.stringify(under)}`);
    assert.deepEqual(problems, []);
  }));

  test('a click picks only what can be seen, and only with the main button', () => withProject(async (page, problems) => {
    const card = () => page.evaluate(() => document.querySelector('#part-card h2')?.firstChild?.textContent || null);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    await page.locator('#board3d-under').click();
    await nextFrame(page);
    const r6 = await page.evaluate(() => window.makerForge.board3d.screenOf('R6'));
    await page.mouse.click(r6.x, r6.y);
    await nextFrame(page);
    assert.notEqual(await card(), 'R6', 'R6 is on top, hidden behind the board');
    const y1 = await page.evaluate(() => window.makerForge.board3d.screenOf('Y1')); // the crystal hangs lowest: nothing hides it
    await page.mouse.click(y1.x, y1.y);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'Y1');
    await page.locator('#board3d-top').click();
    await nextFrame(page);
    const r8 = await page.evaluate(() => window.makerForge.board3d.screenOf('R8'));
    await page.mouse.click(r8.x, r8.y, { button: 'right' });
    await nextFrame(page);
    assert.equal(await card(), 'Y1', 'a right-click does not pick');
    assert.deepEqual(problems, []);
  }));
});
