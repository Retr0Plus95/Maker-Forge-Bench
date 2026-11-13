import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const ticked = (page, ref) => page.locator(`#checklist input[data-ref="${ref}"]`).isChecked();

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('history: the build log, named versions and the build report', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the build log records what you did, with the time; the card says when a part was soldered', async () => {
    await page.locator('#checklist input[data-ref="R8"]').check();
    await page.locator('#checklist input[data-ref="R9"]').check();
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await page.locator('#log-open').click();
    const entries = await page.locator('#log-list li').allTextContents();
    assert.match(entries[0], /^\d\d:\d\d Undo Tick R9$/);
    assert.match(entries[1], /^\d\d:\d\d Tick R9$/);
    assert.match(entries[2], /^\d\d:\d\d Tick R8$/);
    assert.match(await page.locator('#log-time').textContent(), /^Time spent today: .+ · in all: .+$/);
    await page.locator('#log-filter').fill('R8');
    assert.equal(await page.locator('#log-list li').count(), 1);
    await page.locator('#log-copy').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Tick R8/);
    await page.locator('#log-done').click();
    await openCard(page, 'R8');
    assert.match(await page.locator('#part-card .part-soldered-at').textContent(), /^Soldered at \d\d:\d\d/);
  });

  test('the log is kept with your progress', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.locator('#log-open').click();
    assert.ok((await page.locator('#log-list li').count()) >= 3);
    await page.locator('#log-done').click();
  });

  test('named versions: save, change things, restore, undo the restore, delete (asks twice)', async () => {
    await page.locator('#versions-open').click();
    await page.locator('#version-name').fill('before power');
    await page.locator('#version-save').click();
    assert.match(await page.locator('#versions-list li').first().textContent(), /^before power/);
    await page.locator('#versions-done').click();
    await page.locator('#checklist input[data-ref="R7"]').check();
    assert.equal(await ticked(page, 'R7'), true);
    await page.locator('#versions-open').click();
    await page.locator('#versions-list li').first().locator('.version-restore').click();
    await page.locator('#versions-done').click();
    assert.equal(await ticked(page, 'R7'), false, 'back to the saved version');
    assert.equal(await ticked(page, 'R8'), true);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await ticked(page, 'R7'), true, 'undo takes the restore back');
    await page.locator('#versions-open').click();
    const del = page.locator('#versions-list li').first().locator('.version-delete');
    await del.click();
    assert.match(await del.textContent(), /again/i);
    await del.click();
    assert.equal(await page.locator('#versions-list li').count(), 0);
    await page.locator('#versions-done').click();
  });

  test('the build report downloads as a Markdown summary', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#report-save').click()]);
    assert.match(download.suggestedFilename(), /-build-report\.md$/);
    const text = await readFile(await download.path(), 'utf8');
    assert.match(text, /^# Build report: /);
    assert.match(text, /- Soldered: 2 of 37 parts/);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
