import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const tab = (page, text) => page.locator('[role=tab]', { hasText: text });
const progressText = (page) => page.locator('#checklist .progress-text').textContent();
const ready = async (page) => {
  await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
};
/** R6's label on the sheet on screen: whether it's marked done, and its fill colour. */
const r6Mark = (page) => page.evaluate(() => {
  const el = [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].find((t) => t.textContent.trim() === 'R6');
  return { done: el.hasAttribute('data-bench-done'), fill: getComputedStyle(el).fill };
});
const progressFile = (body) => Buffer.from(JSON.stringify({ format: 'bench-progress', version: 1, revision: 'Rev D', sheetPrints: {}, flipped: [], ...body }));

describe('the build checklist', () => {
  let dir; let server; let browser; let page; let problems;

  before(async () => {
    dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await ready(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('every part is listed, none ticked yet', async () => {
    assert.equal(await page.locator('#checklist input[type=checkbox]').count(), 37);
    assert.equal(await progressText(page), '0 of 37 soldered');
  });

  test('ticking a part turns its label green on every sheet', async () => {
    await tab(page, 'SFE-04').click();
    await page.locator('#checklist input[data-ref="R6"]').check();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
    assert.deepEqual(await r6Mark(page), { done: true, fill: 'rgb(61, 220, 132)' });
    assert.equal(await progressText(page), '1 of 37 soldered');
    await tab(page, 'SFE-01').click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
    assert.equal((await r6Mark(page)).done, true);
  });

  test('a tick can be undone and redone', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await progressText(page), '0 of 37 soldered');
    assert.equal((await r6Mark(page)).done, false);
    await page.keyboard.press('Control+y');
    assert.equal(await progressText(page), '1 of 37 soldered');
  });

  test('progress survives a reload', async () => {
    await page.reload();
    await ready(page);
    assert.equal(await progressText(page), '1 of 37 soldered');
    assert.equal(await page.locator('#checklist input[data-ref="R6"]').isChecked(), true);
  });

  test("Mark soldered on a part's card ticks it", async () => {
    await page.locator('#find').fill('q1');
    await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
    await page.locator('#find').press('Enter');
    await page.locator('#part-tick').click();
    assert.equal(await page.locator('#checklist input[data-ref="Q1"]').isChecked(), true);
    assert.equal(await page.locator('#part-tick').getAttribute('aria-pressed'), 'true');
    assert.equal(await progressText(page), '2 of 37 soldered');
  });

  test('progress can be saved as a file', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
    assert.equal(download.suggestedFilename(), 'Solder Fume Extractor-progress.json');
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.deepEqual(saved.ticked.sort(), ['Q1', 'R6']);
    assert.equal(saved.project, 'Solder Fume Extractor');
  });

  test('opening a progress file replaces the ticks, as one undoable change', async () => {
    await page.locator('#progress-open').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: progressFile({ project: 'Solder Fume Extractor', ticked: ['R4'] }) });
    await page.waitForFunction(() => document.querySelector('#checklist .progress-text').textContent === '1 of 37 soldered');
    assert.equal(await page.locator('#checklist input[data-ref="R4"]').isChecked(), true);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await progressText(page), '2 of 37 soldered');
  });

  test("a progress file for another project, or not progress at all, is refused", async () => {
    await page.locator('#progress-open').setInputFiles({ name: 'o.json', mimeType: 'application/json', buffer: progressFile({ project: 'Other', ticked: ['R4'] }) });
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'That progress file is for Other, not Solder Fume Extractor.');
    await page.locator('#progress-open').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await page.waitForFunction(() => document.querySelector('#status').textContent === "That file isn't Bench progress.");
    assert.equal(await progressText(page), '2 of 37 soldered');
  });

  test('a sheet that changed since ticking gets a note', async () => {
    const sfe04 = path.join(dir, 'docs', 'layout', 'SFE-04_Perfboard_Layout.svg');
    await writeFile(sfe04, (await readFile(sfe04, 'utf8')).replace('REV D', 'REV D2'));
    await page.waitForTimeout(1200);
    await page.reload();
    await ready(page);
    await page.waitForFunction(() => document.querySelector('#checklist-notes')?.textContent.length > 0);
    assert.equal(await page.locator('#checklist-notes').textContent(),
      'Sheet SFE-04 Perfboard layout changed since you ticked 2 parts: check them.');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
