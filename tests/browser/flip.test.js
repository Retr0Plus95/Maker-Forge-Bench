import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const BANNER = 'SOLDER SIDE – seen from underneath';

/** Where R6's label sits across the drawing (0 = left edge, 1 = right edge), and how it's drawn. */
function r6(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#sheet-host').shadowRoot.querySelector('svg');
    const text = [...svg.querySelectorAll('text')].find((t) => t.textContent.trim() === 'R6');
    const s = svg.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    return {
      p: ((t.left + t.right) / 2 - s.left) / s.width,
      centreX: (t.left + t.right) / 2,
      box: { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
      a: text.getScreenCTM().a,
      transform: text.getAttribute('transform'),
    };
  });
}

const tab = (page, text) => page.locator('[role=tab]', { hasText: text });

describe('flip to the solder side', () => {
  let server; let browser; let page; let problems; let before0;

  before(async () => {
    server = await startDevServer(await copyFixture('fume-extractor'));
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')]
      .some((t) => t.textContent.trim() === 'R6'));
    await nextFrame(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('flipping mirrors the layout but keeps the text readable', async () => {
    before0 = await r6(page);
    assert.equal(before0.transform, null);
    await page.locator('#flip').click();
    await nextFrame(page);
    const flipped = await r6(page);
    assert.ok(Math.abs(flipped.p - (1 - before0.p)) <= 0.01, `R6 moved from ${before0.p} to ${flipped.p}`);
    assert.ok(flipped.a > 0, 'R6 still reads left to right');
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
    assert.equal(await page.locator('#flip-banner').textContent(), BANNER);
    assert.equal(await page.locator('#flip').textContent(), 'Back to component side');
  });

  test('flipping back restores the drawing exactly', async () => {
    await page.locator('#flip').click();
    await nextFrame(page);
    const back = await r6(page);
    assert.equal(back.transform, null);
    assert.ok(Math.abs(back.centreX - before0.centreX) <= 1);
    assert.equal(await page.locator('#flip-banner').isVisible(), false);
    assert.equal(await page.locator('#flip').textContent(), 'Flip to solder side');
  });

  test('only layout sheets can be flipped', async () => {
    await tab(page, 'SFE-01').click();
    await page.waitForFunction(() => document.querySelector('#flip').disabled);
    assert.equal(await page.locator('#flip').getAttribute('title'), 'Only layout sheets can be flipped.');
  });

  test('f toggles the flip, and a sheet stays flipped when you come back to it', async () => {
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    await page.locator('#stage').click();
    await page.keyboard.press('f');
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
    await tab(page, 'SFE-01').click();
    await page.waitForFunction(() => document.querySelector('#flip').disabled);
    assert.equal(await page.locator('#flip-banner').isVisible(), false);
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
  });

  test('Find part rings the right label on a flipped sheet', async () => {
    await page.locator('#find').fill('R6');
    await page.locator('#find-results button', { hasText: 'SFE-04' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'R6: 4 of 4, on SFE-04 Perfboard Layout');
    await nextFrame(page);
    const label = (await r6(page)).box;
    const ring = await page.evaluate(() => {
      const r = document.querySelector('#sheet-host').shadowRoot.querySelector('.bench-highlight rect').getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    assert.ok(ring.left <= label.left + 1 && ring.right >= label.right - 1 && ring.top <= label.top + 1 && ring.bottom >= label.bottom - 1,
      `ring ${JSON.stringify(ring)} contains R6 ${JSON.stringify(label)}`);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
