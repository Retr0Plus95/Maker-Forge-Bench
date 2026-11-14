import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const titles = (page) => page.locator('#steps .steps-list li > button').allTextContents();
async function undo(page) {
  await page.locator('#stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
}
const row = (page, title) => page.locator('#steps .steps-adjust li', { hasText: title });

describe('adjust the build steps', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('move a step up, skip one, and undo each', async () => {
    const before = await titles(page);
    assert.equal(before.length, 10);
    await page.locator('#steps-adjust').click();
    await row(page, 'Fan drive and tach').locator('.step-up').click();
    assert.equal(await page.evaluate(() => document.activeElement.className), 'step-up', 'the focus stays on the button');
    await page.locator('#steps-adjust').click();
    const moved = await titles(page);
    assert.equal(moved[5], 'Fan drive and tach');
    assert.equal(moved[6], before[5]);
    await page.locator('#steps-adjust').click();
    await row(page, 'The panel side').locator('.step-skip').click();
    assert.equal(await row(page, 'The panel side').locator('.step-skip').textContent(), 'Bring back');
    await page.locator('#steps-adjust').click();
    assert.equal((await titles(page)).length, 9);
    assert.match(await page.locator('#steps .steps-done').textContent(), /of 9 steps done/);
    await undo(page);
    assert.equal((await titles(page)).length, 10);
    await undo(page);
    assert.deepEqual(await titles(page), before);
  });

  test('add a step of your own after the open one; it has its own Done box', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'The power strip' }).click();
    await page.locator('#steps-adjust').click();
    await page.locator('#own-step-title').fill('Test the 5 V rail');
    await page.locator('#own-step-text').fill('Meter across C2: about 5.0 V before the chip goes in.');
    await page.locator('#own-step-add').click();
    await page.locator('#steps-adjust').click();
    const list = await titles(page);
    assert.equal(list[list.indexOf('The power strip') + 1], 'Test the 5 V rail');
    await page.locator('#steps .steps-list li button', { hasText: 'Test the 5 V rail' }).click();
    assert.match(await page.locator('#steps .step-why').textContent(), /about 5.0 V/);
    await page.locator('#step-done').check();
    assert.ok(await page.locator('#steps .steps-list li', { hasText: 'Test the 5 V rail' }).locator('.step-check').count());
  });

  test('your steps are kept after a reload, and Back to the project\'s steps puts them back', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
    assert.ok((await titles(page)).includes('Test the 5 V rail'));
    await page.locator('#steps-adjust').click();
    await page.locator('#steps-reset').click();
    await page.locator('#steps-adjust').click();
    assert.equal((await titles(page)).length, 10);
    assert.ok(!(await titles(page)).includes('Test the 5 V rail'));
    await undo(page);
    assert.ok((await titles(page)).includes('Test the 5 V rail'), 'undo brings them back');
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
