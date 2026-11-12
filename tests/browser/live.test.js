import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const KEEP_MESSAGE = "SFE-04_Perfboard_Layout couldn't be read; keeping the previous one.";
const tab = (page, text) => page.locator('[role=tab]', { hasText: text });

const shownTextIncludes = (page, s, timeout = 3000) => page.waitForFunction(
  (needle) => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.includes(needle)),
  s, { timeout });

const wrapTransform = (page) => page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.firstElementChild.style.transform);

describe('auto-refresh', () => {
  let dir; let sfe04Path; let original; let server; let browser; let page; let problems;

  before(async () => {
    dir = await copyFixture('fume-extractor');
    sfe04Path = path.join(dir, 'docs', 'layout', 'SFE-04_Perfboard_Layout.svg');
    original = await readFile(sfe04Path, 'utf8');
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#live').textContent === 'Auto-refresh on');
    await tab(page, 'SFE-04').click();
    await shownTextIncludes(page, 'REV D');
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('a changed sheet reloads in place, keeping zoom and flip', async () => {
    await page.locator('#stage').click();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.locator('#flip').click();
    await nextFrame(page);
    const before = await wrapTransform(page);
    await writeFile(sfe04Path, original.replace('REV D', 'REV E'));
    await shownTextIncludes(page, 'REV E');
    await nextFrame(page);
    assert.equal(await wrapTransform(page), before);
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
  });

  test('a half-saved file is kept back, and the next good save goes through', async () => {
    const revE = original.replace('REV D', 'REV E');
    await writeFile(sfe04Path, revE.slice(0, 5000));
    await page.waitForFunction((m) => document.querySelector('#status').textContent === m, KEEP_MESSAGE, { timeout: 3000 });
    await shownTextIncludes(page, 'REV E', 100);
    await writeFile(sfe04Path, revE);
    await page.waitForFunction((m) => document.querySelector('#status').textContent !== m, KEEP_MESSAGE, { timeout: 3000 });
    await shownTextIncludes(page, 'REV E', 100);
  });

  test('new and deleted drawings add and remove tabs', async () => {
    const extra = path.join(dir, 'docs', 'new-sheet.svg');
    await writeFile(extra, await readFile(path.join(dir, 'docs', 'layout', 'SFE-D1_Pot_Detail.svg')));
    await tab(page, 'new-sheet').waitFor({ timeout: 3000 });
    assert.equal(await tab(page, 'SFE-04').getAttribute('aria-selected'), 'true', 'the shown sheet stays selected');
    await rm(extra);
    await tab(page, 'new-sheet').waitFor({ state: 'detached', timeout: 3000 });
  });

  test('no errors while the server runs', () => assert.deepEqual(problems, []));

  test('stopping dev.py pauses auto-refresh', async () => {
    await server.stop();
    await page.waitForFunction(() => document.querySelector('#live').textContent === 'Auto-refresh paused', null, { timeout: 5000 });
  });
});
