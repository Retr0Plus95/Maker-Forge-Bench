import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

async function tapAt(page, x, y) {
  const pt = await page.evaluate(([px, py]) => {
    const img = document.querySelector('#sheet-host').shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (px * r.width) / img.naturalWidth, y: r.top + (py * r.height) / img.naturalHeight };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}

describe('your board in 3D', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(600, 500));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('before a photo is lined up there is only sheet 4', async () => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    assert.equal(await page.locator('#board3d-mine').isVisible(), false);
    assert.equal((await info(page)).parts, 32);
    await page.locator('#board3d-toggle').click();
  });

  test('line up, place R8, and the 3D view shows your board: the chip and R8', async () => {
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 100, 100);
    await tapAt(page, 100, 360);
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    await tapAt(page, 200, 140);
    await tapAt(page, 200, 180);
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.locator('#board3d-mine').click();
    await page.waitForFunction(() => window.makerForge.board3d.info()?.parts === 2, null, { timeout: 20000 });
    assert.equal(await page.locator('#board3d-mine').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#board3d-mine-note').textContent(), '2 of 32 parts placed');
    await page.locator('#board3d-sheet4').click();
    await page.waitForFunction(() => window.makerForge.board3d.info()?.parts === 32, null, { timeout: 20000 });
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
