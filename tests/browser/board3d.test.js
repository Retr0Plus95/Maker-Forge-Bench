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
    assert.equal(await page.locator('[role=tab][aria-selected=true]').textContent(), 'SFE-01 Main schematic');
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

  test('without WebGL it says so and points to sheet 4', () => withProject(async (page) => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => !document.querySelector('#board3d-message').hidden, null, { timeout: 15000 });
    assert.equal(await page.locator('#board3d-message').textContent(), "This browser can't draw 3D here. Sheet 4 shows the same layout flat.");
  }, { args: ['--disable-webgl', '--disable-3d-apis'] }));
});
