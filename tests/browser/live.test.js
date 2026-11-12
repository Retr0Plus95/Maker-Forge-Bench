import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, PNG_16, copyFixture, nextFrame, openPage, startDevServer, writePng } from './harness.js';

const KEEP_MESSAGE = "SFE-04_Perfboard_Layout couldn't be read; keeping the previous one.";
const tab = (page, text) => page.locator('[role=tab]', { hasText: text });

const shownTextIncludes = (page, s, timeout = 3000) => page.waitForFunction(
  (needle) => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.includes(needle)),
  s, { timeout });

const wrapTransform = (page) => page.evaluate(() => document.querySelector('#sheet-host').style.transform);

/** The warning about the sheet on screen, or '' when there is none. */
const sheetNote = (page) => page.evaluate(() => {
  const n = document.querySelector('#sheet-note');
  return n && !n.hidden ? n.textContent : '';
});

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

  test('a half-saved file is kept back, and the warning stays until the next good save', async () => {
    const revE = original.replace('REV D', 'REV E');
    await writeFile(sfe04Path, revE.slice(0, 5000));
    await page.waitForFunction((m) => {
      const n = document.querySelector('#sheet-note');
      return n && !n.hidden && n.textContent === m;
    }, KEEP_MESSAGE, { timeout: 3000 });
    await shownTextIncludes(page, 'REV E', 100);
    await tab(page, 'SFE-01').click();
    await page.waitForFunction(() => document.querySelector('#sheet-note').hidden);
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#sheet-note').hidden);
    assert.equal(await sheetNote(page), KEEP_MESSAGE, 'back on SFE-04, the warning is back');
    await page.locator('#find').fill('R6');
    await page.locator('#find').fill('');
    assert.equal(await sheetNote(page), KEEP_MESSAGE, 'searching does not clear it');
    await writeFile(sfe04Path, revE);
    await page.waitForFunction(() => document.querySelector('#sheet-note').hidden, null, { timeout: 3000 });
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

describe('auto-refresh keeps up', () => {
  test('a changed picture is shown again', async () => {
    const dir = await copyFixture(null);
    await writePng(dir, 'pic.png');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('img')?.naturalWidth === 8);
      await writeFile(path.join(dir, 'pic.png'), PNG_16);
      await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img')?.naturalWidth === 16,
        null, { timeout: 3000 });
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a save that rebuilds the tabs while the sheet is being read still shows the new drawing', async () => {
    // A big sheet takes a while to read. A drawing program saving through a temp file adds and
    // removes a drawing at the same moment, which rebuilds the tabs meanwhile.
    const dir = await copyFixture('fume-extractor');
    const sfe04 = path.join(dir, 'docs', 'layout', 'SFE-04_Perfboard_Layout.svg');
    const padding = Array.from({ length: 100000 }, (_, i) =>
      `<rect x="${i % 1000}" y="${Math.floor(i / 1000)}" width="1" height="1" fill="none"/>`).join('');
    const big = (await readFile(sfe04, 'utf8')).replace('</svg>', `${padding}</svg>`);
    await writeFile(sfe04, big);
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await tab(page, 'SFE-04').click();
      await shownTextIncludes(page, 'REV D', 15000);
      const temp = path.join(dir, 'docs', 'zz-temp.svg');
      await Promise.all([
        writeFile(sfe04, big.replace('REV D', 'REV E')),
        writeFile(temp, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
      ]);
      await shownTextIncludes(page, 'REV E', 8000);
      await rm(temp);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('changes made while dev.py was stopped are caught up when it is back', async () => {
    const dir = await copyFixture('fume-extractor');
    const sfe04 = path.join(dir, 'docs', 'layout', 'SFE-04_Perfboard_Layout.svg');
    let server = await startDevServer(dir);
    const port = Number(new URL(server.url).port);
    const { browser, page } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await tab(page, 'SFE-04').click();
      await shownTextIncludes(page, 'REV D');
      await server.stop();
      await page.waitForFunction(() => document.querySelector('#live').textContent === 'Auto-refresh paused', null, { timeout: 5000 });
      await writeFile(sfe04, (await readFile(sfe04, 'utf8')).replace('REV D', 'REV E'));
      server = await startDevServer(dir, port);
      await page.waitForFunction(() => document.querySelector('#live').textContent === 'Auto-refresh on', null, { timeout: 10000 });
      await shownTextIncludes(page, 'REV E', 5000);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a sheet that could not be opened and is then fixed clears its message', async () => {
    const dir = await copyFixture(null);
    const sfe01 = await readFile(path.join(FIXTURES, 'fume-extractor', 'docs', 'schematics', 'SFE-01_Schematic.svg'), 'utf8');
    await writeFile(path.join(dir, 'broken.svg'), sfe01.slice(0, 5000));
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    const message = "broken.svg couldn't be read: the file is broken or only half-saved. Save it again.";
    try {
      await page.waitForFunction((m) => document.querySelector('#status').textContent === m, message);
      await writeFile(path.join(dir, 'broken.svg'), sfe01);
      await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('svg'), null, { timeout: 3000 });
      await page.waitForFunction((m) => document.querySelector('#status').textContent !== m, message, { timeout: 3000 });
      assert.equal(await page.locator('#stage-message').isVisible(), false);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
