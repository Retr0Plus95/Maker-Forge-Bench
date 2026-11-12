import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const html = (page, name) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
const openSettings = async (page) => {
  await page.locator('#settings-button').click();
  await page.locator('#settings').waitFor({ state: 'visible' });
};
const closeSettings = (page) => page.locator('#settings-done').click();

describe('the Maker Forge family look and Easy reading', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await copyFixture('fume-extractor'));
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('dark is the default at the bench', async () => {
    assert.equal(await html(page, 'data-theme'), 'dark');
    assert.equal(await page.locator('#undo').isDisabled(), true);
  });

  test('switching to light is saved and survives a reload', async () => {
    await openSettings(page);
    await page.locator('#settings input[name=theme][value=light]').check();
    assert.equal(await html(page, 'data-theme'), 'light');
    await closeSettings(page);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    assert.equal(await html(page, 'data-theme'), 'light');
  });

  test('clear font, high contrast and text size', async () => {
    await openSettings(page);
    await page.locator('#settings input[name=clearFont]').check();
    await page.locator('#settings input[name=contrast]').check();
    await page.locator('#settings input[name=textSize][value="150"]').check();
    await closeSettings(page);
    assert.equal(await html(page, 'data-font'), 'clear');
    assert.equal(await html(page, 'data-contrast'), 'high');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '24px');
    await page.waitForFunction(() => document.fonts.check('16px "Atkinson Hyperlegible"'));
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /^"Atkinson Hyperlegible"/);
  });

  test('every setting can be undone and redone, by keyboard and by button', async () => {
    await page.locator('#stage').click();
    await page.keyboard.press('Control+z'); // text size back to 100 %
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '16px');
    assert.equal(await page.locator('#redo').getAttribute('title'), 'Redo Text size: 150%');
    await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '24px');
    assert.equal(await page.locator('#undo').getAttribute('title'), 'Undo Text size: 150%');
    await page.locator('#undo').click();
    await page.locator('#undo').click();
    await page.locator('#undo').click();
    assert.equal(await html(page, 'data-font'), null);
    assert.equal(await html(page, 'data-contrast'), null);
  });

  test('a flip can be undone', async () => {
    await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    await page.locator('#flip').click();
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
    assert.equal(await page.locator('#undo').getAttribute('title'), 'Undo Flip SFE-04 Perfboard Layout');
    await page.locator('#stage').click();
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#flip-banner').isVisible(), false);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.locator('#flip-banner').isVisible(), true);
  });

  test('the part panel sits beside the drawing, and saving shows', async () => {
    const { stage, panel } = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { stage: r('#stage').toJSON(), panel: r('#panel').toJSON() };
    });
    assert.ok(panel.left >= stage.right - 1, 'panel to the right of the stage');
    assert.ok(await page.locator('#saved').count());
  });

  test('no errors, and the fonts load under the security rules', () => assert.deepEqual(problems, []));
});

describe('on a phone', () => {
  test('the panel goes under the drawing, with no sideways scrolling', async () => {
    const server = await startDevServer(await copyFixture('fume-extractor'));
    const { browser, page, problems } = await openPage(server.url, { width: 375, height: 812 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await nextFrame(page);
      const { stage, panel, scroll } = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
        return { stage: r('#stage'), panel: r('#panel'), scroll: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.ok(panel.top >= stage.bottom - 1, 'panel below the stage');
      assert.ok(stage.height > 200, 'the drawing keeps room');
      assert.ok(scroll, 'no sideways scrolling');
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
