import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, boxes, copyFixture, nextFrame, openPage, startDevServer, writePng } from './harness.js';

const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const TABS = ['SFE-01 Schematic', 'SFE-02 Reference', 'SFE-03 USB Port', 'SFE-04 Perfboard Layout', 'SFE-D1 Pot Detail', 'Verkstad ö'];

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
  describe(`viewer at ${viewport.width}×${viewport.height}`, () => {
    let server; let browser; let page; let problems; let firstFit;

    before(async () => {
      const dir = await copyFixture('fume-extractor');
      await mkdir(path.join(dir, 'images'), { recursive: true });
      await writePng(dir, 'images/SFE-01_Schematic.png');
      await writePng(dir, 'images/Verkstad ö.png');
      server = await startDevServer(dir);
      ({ browser, page, problems } = await openPage(server.url, viewport));
      await page.locator('#tabs [role=tab]').first().waitFor();
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await nextFrame(page);
    });

    after(async () => {
      await browser?.close();
      await server?.stop();
    });

    test('one tab per drawing, SVGs preferred, first selected', async () => {
      assert.deepEqual(await page.locator('#tabs [role=tab]').allTextContents(), TABS);
      assert.equal(await page.locator('#tabs [role=tab]').first().getAttribute('aria-selected'), 'true');
    });

    test('the first sheet is shown fitted inside the stage', async () => {
      const { sheet, stage } = await boxes(page);
      firstFit = sheet;
      assert.ok(sheet.left >= stage.left - 1 && sheet.right <= stage.right + 1, 'fits across');
      assert.ok(sheet.top >= stage.top - 1 && sheet.bottom <= stage.bottom + 1, 'fits down');
    });

    test('the wheel zooms in and keeps the point under the pointer', async () => {
      const before = await boxes(page);
      const cx = before.stage.left + before.stage.width * 0.4;
      const cy = before.stage.top + before.stage.height * 0.5;
      const sx = (cx - before.sheet.left) / before.sheet.width;
      const sy = (cy - before.sheet.top) / before.sheet.height;
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -300);
      await nextFrame(page);
      const afterZoom = await boxes(page);
      assert.ok(afterZoom.sheet.width > before.sheet.width * 1.2, 'zoomed in');
      assert.ok(near(afterZoom.sheet.left + sx * afterZoom.sheet.width, cx), 'x stays under the pointer');
      assert.ok(near(afterZoom.sheet.top + sy * afterZoom.sheet.height, cy), 'y stays under the pointer');
    });

    test('dragging moves the drawing by the same amount', async () => {
      const b = await boxes(page);
      const x = b.stage.left + b.stage.width / 2;
      const y = b.stage.top + b.stage.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 60, y - 40, { steps: 3 });
      await page.mouse.move(x - 120, y - 80, { steps: 3 });
      await page.mouse.up();
      await nextFrame(page);
      const a = await boxes(page);
      assert.ok(near(a.sheet.left, b.sheet.left - 120) && near(a.sheet.top, b.sheet.top - 80));
    });

    test('keys: 0 fits, + and - zoom, arrows pan', async () => {
      await page.keyboard.press('0');
      await nextFrame(page);
      const fitted = (await boxes(page)).sheet;
      assert.ok(near(fitted.left, firstFit.left) && near(fitted.width, firstFit.width), '0 fits again');
      await page.keyboard.press('+');
      await nextFrame(page);
      const bigger = (await boxes(page)).sheet;
      assert.ok(bigger.width > fitted.width, '+ zooms in');
      await page.keyboard.press('-');
      await nextFrame(page);
      assert.ok((await boxes(page)).sheet.width < bigger.width, '- zooms out');
      const b = await boxes(page);
      await page.keyboard.press('ArrowRight');
      await nextFrame(page);
      const a = await boxes(page);
      assert.ok(near(a.sheet.left, b.sheet.left - b.stage.width * 0.1), 'ArrowRight moves the drawing left');
    });

    test('a double-click doubles the size', async () => {
      const b = await boxes(page);
      await page.mouse.dblclick(b.stage.left + b.stage.width / 2, b.stage.top + b.stage.height / 2);
      await nextFrame(page);
      assert.ok(near((await boxes(page)).sheet.width, b.sheet.width * 2));
    });

    test('a picture sheet shows the picture', async () => {
      await page.locator('[role=tab]', { hasText: 'Verkstad ö' }).click();
      await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img')?.naturalWidth === 8);
      assert.equal(await page.locator('[role=tab]', { hasText: 'Verkstad ö' }).getAttribute('aria-selected'), 'true');
    });

    test('no sideways scrolling and no errors', async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.deepEqual(problems, []);
    });
  });
}

describe('fitting when the stage changes size', () => {
  test('a sheet shown while the stage had no size is fitted once it gets one', async () => {
    const server = await startDevServer(await copyFixture('fume-extractor'));
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      // Like a page loaded in a hidden pane: the stage has no size when the first sheet is shown.
      await page.addInitScript(() => {
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'interactive') document.querySelector('#stage').style.display = 'none';
        });
      });
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await page.evaluate(() => { document.querySelector('#stage').style.display = ''; });
      await nextFrame(page);
      const { sheet, stage } = await boxes(page);
      assert.ok(sheet.width > stage.width * 0.5 || sheet.height > stage.height * 0.5, `fitted: ${sheet.width}×${sheet.height} in ${stage.width}×${stage.height}`);
      assert.ok(sheet.left >= stage.left - 1 && sheet.right <= stage.right + 1 && sheet.top >= stage.top - 1 && sheet.bottom <= stage.bottom + 1);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a fitted sheet follows the window, a zoomed one stays put', async () => {
    const server = await startDevServer(await copyFixture('fume-extractor'));
    const { browser, page, problems } = await openPage(server.url, { width: 640, height: 480 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await nextFrame(page);
      const small = (await boxes(page)).sheet;
      await page.setViewportSize({ width: 1280, height: 800 });
      await nextFrame(page);
      const big = await boxes(page);
      assert.ok(big.sheet.width > small.width * 1.3, 'grew with the window');
      assert.ok(big.sheet.right <= big.stage.right + 1 && big.sheet.bottom <= big.stage.bottom + 1, 'still fits');
      await page.locator('#stage').click();
      await page.keyboard.press('+');
      await nextFrame(page);
      const zoomed = (await boxes(page)).sheet;
      await page.setViewportSize({ width: 900, height: 700 });
      await nextFrame(page);
      assert.ok(Math.abs((await boxes(page)).sheet.width - zoomed.width) <= 1, 'your zoom is kept');
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

describe('drawings that push the viewer', () => {
  test("a drawing's own CSS can't cover the app or take over zoom", async () => {
    const dir = await copyFixture(null);
    await writeFile(path.join(dir, 'hostile.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">' +
      '<style>div{transform:scale(9)!important} svg{position:fixed!important;left:0!important;top:0!important;' +
      'width:100vw!important;height:100vh!important;z-index:99!important}</style><rect width="200" height="100" fill="#345"/></svg>');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await nextFrame(page);
      const onTop = await page.evaluate(() => {
        const r = document.querySelector('#tabs [role=tab]').getBoundingClientRect();
        return document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)?.getAttribute('role');
      });
      assert.equal(onTop, 'tab', 'the tabs can still be clicked');
      const before = (await boxes(page)).sheet;
      await page.locator('#stage').click();
      await page.keyboard.press('+');
      await nextFrame(page);
      assert.ok((await boxes(page)).sheet.width > before.width * 1.2, '+ still zooms');
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a small drawing can be zoomed far past its fit', async () => {
    const dir = await copyFixture(null);
    await writeFile(path.join(dir, 'small.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30" width="50mm" height="30mm">' +
      '<rect width="50" height="30" fill="#345"/><text x="5" y="15" font-size="3" fill="#fff">R1</text></svg>');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      await nextFrame(page);
      const fitted = (await boxes(page)).sheet;
      await page.locator('#stage').click();
      for (let i = 0; i < 12; i++) await page.keyboard.press('+');
      await nextFrame(page);
      const zoomed = (await boxes(page)).sheet;
      assert.ok(zoomed.width > fitted.width * 10, `zoomed ${zoomed.width / fitted.width}× past the fit`);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});

describe('folders that need a message', () => {
  test('an empty folder says what to do', async () => {
    const dir = await copyFixture(null);
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#status').textContent.length > 0);
      assert.equal(await page.locator('#status').textContent(),
        `No drawings found in ${path.basename(dir)}. Bench shows SVG, PNG and JPG files: add some to the folder, or check the folder you gave dev.py.`);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a broken drawing gets a message and the other tabs still work', async () => {
    const dir = await copyFixture(null);
    const src = path.join(FIXTURES, 'fume-extractor', 'docs');
    const sfe01 = await readFile(path.join(src, 'schematics', 'SFE-01_Schematic.svg'), 'utf8');
    await writeFile(path.join(dir, 'broken.svg'), sfe01.slice(0, 5000));
    await writeFile(path.join(dir, 'SFE-04_Perfboard_Layout.svg'), await readFile(path.join(src, 'layout', 'SFE-04_Perfboard_Layout.svg')));
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      const message = "broken.svg couldn't be read: the file is broken or only half-saved. Save it again.";
      await page.waitForFunction((m) => document.querySelector('#status').textContent === m, message);
      assert.equal(await page.locator('#stage-message').textContent(), message);
      await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
      await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('svg'));
      assert.equal(await page.locator('#stage-message').isVisible(), false);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
