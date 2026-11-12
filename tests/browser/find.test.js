import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyFixture, openPage, startDevServer, writePng } from './harness.js';

const statusIs = (page, text) => page.waitForFunction((t) => document.querySelector('#status').textContent === t, text);

/** Screen boxes of the ring and of the stage. */
function ringAndStage(page) {
  return page.evaluate(() => {
    const ring = document.querySelector('#sheet-host').shadowRoot.querySelector('.bench-highlight rect');
    const plain = (r) => r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    return { ring: plain(ring && ring.getBoundingClientRect()), stage: plain(document.querySelector('#stage').getBoundingClientRect()) };
  });
}

describe('Find part on the fume extractor', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await mkdir(path.join(dir, 'images'), { recursive: true });
    await writePng(dir, 'images/Verkstad ö.png');
    await writeFile(path.join(dir, 'docs', 'shapes-only.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>');
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('/ focuses the search box', async () => {
    await page.locator('#stage').click();
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'find');
  });

  test('typing lists the matches per sheet, and what can\'t be searched', async () => {
    await page.locator('#find').fill('R6');
    await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
    assert.deepEqual(await page.locator('#find-results button').allTextContents(),
      ['SFE-01 Schematic: 1', 'SFE-02 Reference: 2', 'SFE-04 Perfboard Layout: 1']);
    assert.deepEqual(await page.locator('#find-results .note').allTextContents(), [
      "Pictures can't be searched: Verkstad ö",
      "shapes-only: its text is drawn as shapes, so Find part can't read it.",
    ]);
  });

  test('Enter jumps to the first match and rings it', async () => {
    await page.locator('#find').press('Enter');
    await statusIs(page, 'R6: 1 of 4, on SFE-01 Schematic');
    assert.equal(await page.locator('[role=tab]', { hasText: 'SFE-01' }).getAttribute('aria-selected'), 'true');
    const { ring, stage } = await ringAndStage(page);
    assert.ok(ring, 'a ring is drawn');
    const cx = (ring.left + ring.right) / 2;
    const cy = (ring.top + ring.bottom) / 2;
    assert.ok(cx > stage.left && cx < stage.right && cy > stage.top && cy < stage.bottom, 'the ring is in view');
  });

  test('Enter and Shift+Enter go through every match, across sheets, and wrap', async () => {
    for (let i = 0; i < 3; i++) await page.locator('#find').press('Enter');
    await statusIs(page, 'R6: 4 of 4, on SFE-04 Perfboard Layout');
    assert.equal(await page.locator('[role=tab]', { hasText: 'SFE-04' }).getAttribute('aria-selected'), 'true');
    await page.locator('#find').press('Enter');
    await statusIs(page, 'R6: 1 of 4, on SFE-01 Schematic');
    await page.locator('#find').press('Shift+Enter');
    await statusIs(page, 'R6: 4 of 4, on SFE-04 Perfboard Layout');
  });

  test('n and N work outside the box', async () => {
    await page.locator('#stage').click();
    await page.keyboard.press('n');
    await statusIs(page, 'R6: 1 of 4, on SFE-01 Schematic');
    await page.keyboard.press('Shift+N');
    await statusIs(page, 'R6: 4 of 4, on SFE-04 Perfboard Layout');
  });

  test('clicking a sheet result jumps to its first match', async () => {
    await page.locator('#find-results button', { hasText: 'SFE-02' }).click();
    await statusIs(page, 'R6: 2 of 4, on SFE-02 Reference');
  });

  test('no match, and odd queries, are handled', async () => {
    await page.locator('#find').fill('zzz');
    await statusIs(page, 'No “zzz” on any sheet.');
    assert.equal(await page.locator('#find-results button').count(), 0);
    await page.locator('#find').fill('(');
    await page.locator('#find').press('Enter');
  });

  test('Esc clears the box and the ring', async () => {
    await page.locator('#find').fill('PWMCTL');
    await page.locator('#find').press('Enter');
    await statusIs(page, 'PWMCTL: 1 of 1, on SFE-04 Perfboard Layout');
    await page.locator('#find').press('Escape');
    assert.equal(await page.locator('#find').inputValue(), '');
    assert.equal((await ringAndStage(page)).ring, null);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('Find part on a KiCad-style drawing', () => {
  test('finds a label KiCad wrote as invisible text, and rings the lines you can see', async () => {
    const dir = await copyFixture('kicad-like');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await page.locator('#find').fill('R302');
      await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
      assert.deepEqual(await page.locator('#find-results button').allTextContents(), ['kicad-like: 1']);
      await page.locator('#find').press('Enter');
      await statusIs(page, 'R302: 1 of 1, on kicad-like');
      const overlap = await page.evaluate(() => {
        const root = document.querySelector('#sheet-host').shadowRoot;
        const ring = root.querySelector('.bench-highlight rect').getBoundingClientRect();
        const lines = [...root.querySelectorAll('g.stroked-text')].find((g) => g.querySelector('desc').textContent === 'R302').getBoundingClientRect();
        return ring.left < lines.right && lines.left < ring.right && ring.top < lines.bottom && lines.top < ring.bottom;
      });
      assert.ok(overlap, 'the ring is on the drawn label');
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
