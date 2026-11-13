import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

// Phones and tablets (0.7 design §4): a touch phone at 375 × 812.
const PHONE = { width: 375, height: 812 };
const TOUCH = { context: { hasTouch: true, isMobile: true } };
const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const shownSvg = (page) => page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));

/** Everything on screen that sticks out sideways (the drawing, and the sheet strip's tabs, may). */
function sticksOut(page) {
  return page.evaluate(() => {
    const out = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${width})`);
    for (const node of document.querySelectorAll('body *')) {
      if (node.closest('#tabs > *, #stage, #stage2, .visually-hidden, .tool-word, datalist, option, script')) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < -1 || r.right > width + 1) out.push(`${node.localName}${node.id ? `#${node.id}` : ''}.${node.className} ${Math.round(r.left)}…${Math.round(r.right)}`);
    }
    return out.slice(0, 8);
  });
}

describe('on a touch phone', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, PHONE, {
      ...TOUCH,
      before: (p) => p.addInitScript(() => localStorage.setItem('bench.panelWidth', '520')), // dragged wide on a computer
    }));
    await shownSvg(page);
    await nextFrame(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the header folds its tools into a Menu; Undo, Redo and Find stay', async () => {
    const menu = page.locator('#menu-toggle');
    assert.equal(await menu.isVisible(), true);
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#calc-open').isVisible(), false);
    assert.equal(await page.locator('#flip').isVisible(), false);
    assert.equal(await page.locator('#find').isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Undo' }).isVisible(), true);
    const head = await page.locator('#top').boundingBox();
    assert.ok(head.height < 170, `the header stays small (${head.height})`);

    await menu.tap();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.equal(await menu.textContent(), 'Close menu');
    for (const id of ['#calc-open', '#settings-button', '#flip', '#panel-toggle']) assert.equal(await page.locator(id).isVisible(), true, id);
    assert.equal(await page.locator('#split').isVisible(), false, 'side by side needs a wide screen');
    assert.deepEqual(await sticksOut(page), []);

    await page.locator('#settings-button').tap(); // a tool was used: the menu folds away
    await page.waitForFunction(() => document.querySelector('#settings').open);
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    const dialog = await page.locator('#settings').boundingBox();
    assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= PHONE.width, 'the dialog fits');
    await page.keyboard.press('Escape');

    await menu.tap();
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.tap();
    await page.touchscreen.tap(180, 500); // a tap outside the header
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  });

  test('the sheets are a strip that scrolls sideways, not rows of tabs', async () => {
    const strip = await page.evaluate(() => {
      const tabs = document.querySelector('#tabs');
      const tops = new Set([...tabs.querySelectorAll('[role=tab]')].map((t) => Math.round(t.getBoundingClientRect().top)));
      return { rows: tops.size, scrolls: tabs.scrollWidth > tabs.clientWidth, overflow: getComputedStyle(tabs).overflowX };
    });
    assert.deepEqual(strip, { rows: 1, scrolls: true, overflow: 'auto' });
  });

  test('the panel is a sheet under the drawing: tap or swipe its handle for taller or shorter', async () => {
    const handle = page.locator('#panel-handle');
    const sizes = () => page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { stage: r('#stage').toJSON(), panel: r('#panel').toJSON(), work: r('#workspace').toJSON() };
    });
    let { stage, panel, work } = await sizes();
    assert.ok(panel.top >= stage.bottom - 1, 'under the drawing');
    assert.ok(panel.width >= PHONE.width - 1, 'the full width, whatever width was dragged on a computer');
    assert.ok(panel.height < work.height * 0.5 && stage.height > 250, `short: the drawing keeps room (${panel.height}, ${stage.height})`);
    assert.equal(await handle.getAttribute('aria-label'), 'Make the panel taller');

    await handle.tap();
    ({ panel, work } = await sizes());
    assert.ok(panel.height > work.height * 0.75, `tall (${panel.height} of ${work.height})`);
    assert.equal(await handle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('bench.panelTall')), 'true');

    // a swipe down on the handle makes it short again
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.dispatchEvent('#panel-handle', 'pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, button: 0 });
    await page.dispatchEvent('#panel-handle', 'pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y + 120, isPrimary: true, button: 0 });
    await page.dispatchEvent('#panel-handle', 'click');
    ({ panel, work } = await sizes());
    assert.ok(panel.height < work.height * 0.5, 'short again, and the click after the swipe changed nothing');
    assert.equal(await handle.getAttribute('aria-label'), 'Make the panel taller');
  });

  test('tapping a part on the drawing opens its card, and nothing sticks out sideways', async () => {
    const { x, y } = await page.evaluate(() => {
      const el = [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].find((e) => /^R\d+$/.test(e.textContent.trim()));
      const r = el.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
    await page.touchscreen.tap(x, y);
    await page.waitForFunction(() => /^R\d+/.test(document.querySelector('#part-card h2')?.textContent || ''));
    await page.waitForFunction(() => document.querySelector('#part-card').getBoundingClientRect().top < innerHeight);
    assert.deepEqual(await sticksOut(page), []);
    await page.locator('#panel-handle').tap();
    assert.deepEqual(await sticksOut(page), [], 'the tall sheet too');
    await page.locator('#panel-handle').tap();
  });

  test('Hide panel (in the menu) gives the drawing the whole screen, and Show panel brings it back', async () => {
    await page.locator('#menu-toggle').tap();
    await page.locator('#panel-toggle').tap();
    assert.equal(await page.locator('#panel').isVisible(), false);
    const stage = await page.locator('#stage').boundingBox();
    const work = await page.locator('#workspace').boundingBox();
    assert.ok(Math.abs(stage.height - work.height) < 2, 'the drawing fills the space');
    await page.locator('#menu-toggle').tap();
    assert.equal(await page.locator('#panel-toggle').textContent(), 'Show panel');
    await page.locator('#panel-toggle').tap();
    assert.equal(await page.locator('#panel').isVisible(), true);
  });

  test('no page errors', () => assert.deepEqual(problems, []));
});

describe('the start screen on a phone', () => {
  test('fits the width, with the menu still there', async () => {
    const server = await startDevServer(null);
    const { browser, page, problems } = await openPage(server.url, PHONE, TOUCH);
    try {
      await page.waitForFunction(() => !document.querySelector('#start').hidden);
      assert.equal(await page.locator('#start-repo').isVisible(), true);
      assert.deepEqual(await sticksOut(page), []);
      await page.locator('#menu-toggle').tap();
      assert.deepEqual(await sticksOut(page), []);
      const expected = /404 \(No project folder: open one in the page\.\)$/;
      assert.deepEqual(problems.filter((p) => !expected.test(p)), []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

describe('on a tablet', () => {
  test('the panel stays beside or under the drawing, with every tool in the header', async () => {
    const server = await startDevServer(await copyFixture('fume-extractor'));
    const { browser, page, problems } = await openPage(server.url, { width: 820, height: 1180 }, TOUCH);
    try {
      await shownSvg(page);
      assert.equal(await page.locator('#menu-toggle').isVisible(), false);
      assert.equal(await page.locator('#calc-open').isVisible(), true);
      assert.equal(await page.locator('#panel-handle').isVisible(), false);
      assert.deepEqual(await sticksOut(page), []);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
