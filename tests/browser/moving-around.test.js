import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const selectedTab = (page) => page.evaluate(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent);

describe('moving around', () => {
  let server; let browser; let page; let problems; let dir;

  before(async () => {
    dir = await copyFixture('fume-extractor');
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

  test('? lists every keyboard shortcut', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('?');
    assert.equal(await page.locator('#help').isVisible(), true);
    const text = await page.locator('#help').textContent();
    for (const key of ['Ctrl+Z', 'Space', '1–9', 'B', 'T', 'U', '/']) assert.ok(text.includes(key), key);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#help').isVisible(), false);
  });

  test('number keys pick sheets', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('4');
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.startsWith('SFE-04'));
    await page.keyboard.press('1');
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.startsWith('SFE-01'));
  });

  test('the zoom level shows on the stage, and clicking it fits the sheet', async () => {
    const fitted = await page.locator('#zoom-level').textContent();
    assert.match(fitted, /^\d+ %$/);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('+');
    assert.notEqual(await page.locator('#zoom-level').textContent(), fitted);
    await page.locator('#zoom-level').click();
    assert.equal(await page.locator('#zoom-level').textContent(), fitted);
  });

  test('the last sheet you looked at is shown again after a reload', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('4');
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.startsWith('SFE-04'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    assert.match(await selectedTab(page), /^SFE-04/);
  });

  test('the live badge says when the project file was last updated', async () => {
    const project = JSON.parse(await readFile(PROJECT, 'utf8'));
    await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify({ ...project, name: `${project.name} ` }));
    await page.waitForFunction(() => /updated \d\d:\d\d/.test(document.querySelector('#live').textContent), null, { timeout: 15000 });
  });

  test('printing gives the wiring list and checklist, not the drawing', async () => {
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#stage').isVisible(), false);
    assert.equal(await page.locator('#wiring').isVisible(), true);
    assert.equal(await page.locator('#checklist').isVisible(), true);
    await page.emulateMedia({ media: 'screen' });
    assert.equal(await page.locator('#stage').isVisible(), true);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
