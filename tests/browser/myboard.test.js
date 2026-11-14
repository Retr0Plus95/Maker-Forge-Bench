import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, solidPng, startDevServer } from './harness.js';
import { parseProject } from '../../src/project.js';
import { photoTransform, snap } from '../../src/myboard.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const board = parseProject(await readFile(PROJECT, 'utf8')).board;
const U2 = board.parts.U2.pins;

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

/** Clicks the photo on screen at a pixel of the photo itself. */
async function tapAt(page, x, y) {
  const pt = await page.evaluate(([px, py]) => {
    const host = document.querySelector('#sheet-host');
    const img = host.shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (px * r.width) / img.naturalWidth, y: r.top + (py * r.height) / img.naturalHeight };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}

const marks = (page, ref) => page.evaluate((r) => [...document.querySelector('#sheet-host').shadowRoot
  .querySelectorAll(`.bench-myboard circle[data-ref="${r}"]`)].map((c) => ({ pin: c.getAttribute('data-pin'), x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) })), ref);
const close = (a, b) => Math.abs(a.x - b[0]) < 0.01 && Math.abs(a.y - b[1]) < 0.01;

async function showTab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
}

describe('your board, from your photos', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(600, 500));
    await writeFile(path.join(dir, 'my-board', 'board-under.png'), solidPng(600, 500, [30, 80, 50]));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('"My board" shows only on photos', async () => {
    assert.equal(await page.locator('#myboard-toggle').isVisible(), false);
    await showTab(page, 'board-top');
    assert.equal(await page.locator('#myboard-toggle').isVisible(), true);
  });

  test("two taps on the chip's pins 1 and 14 line the photo up, and its pins are marked", async () => {
    await page.locator('#myboard-toggle').click();
    assert.equal(await page.locator('#myboard-top').getAttribute('aria-pressed'), 'true');
    await page.locator('#myboard-line').click();
    assert.match(await page.locator('#myboard-status').textContent(), /tap U2 pin 1/i);
    await tapAt(page, 100, 100);
    assert.match(await page.locator('#myboard-status').textContent(), /tap U2 pin 14/i);
    await tapAt(page, 100, 360);
    assert.match(await page.locator('#myboard-status').textContent(), /lined up/i);
    const chip = await marks(page, 'U2');
    assert.equal(chip.length, 28);
    assert.ok(close(chip.find((m) => m.pin === '28'), [160, 100]), JSON.stringify(chip.find((m) => m.pin === '28')));
  });

  test('a part is placed by tapping its pins; the taps snap to holes; undo takes it off', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    assert.match(await page.locator('#myboard-status').textContent(), /R8.*pin 1/);
    await tapAt(page, 200, 140);
    assert.match(await page.locator('#myboard-status').textContent(), /R8.*pin 2/);
    await tapAt(page, 203, 178);
    const r8 = await marks(page, 'R8');
    assert.ok(close(r8.find((m) => m.pin === '1'), [200, 140]) && close(r8.find((m) => m.pin === '2'), [200, 180]), JSON.stringify(r8));
    assert.match(await page.locator('#part-card .part-myboard').textContent(), /Placed on your board/);
    await page.locator('#stage').click({ position: { x: 900, y: 10 } });
    await page.keyboard.press('Control+z');
    assert.equal((await marks(page, 'R8')).length, 0);
    await page.keyboard.press('Control+y');
    assert.equal((await marks(page, 'R8')).length, 2);
  });

  test('the underside photo, lined up the same way, shows the part mirrored where it really is', async () => {
    await showTab(page, 'board-under');
    assert.match(await page.locator('#myboard-status').textContent(), /not lined up yet/i, "another photo's status");
    await page.locator('#myboard-under').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 300, 100);
    await tapAt(page, 300, 360);
    const top = photoTransform(U2['1'], U2['14'], [100, 100], [100, 360], 'top');
    const under = photoTransform(U2['1'], U2['14'], [300, 100], [300, 360], 'bottom');
    const r8 = await marks(page, 'R8');
    assert.ok(close(r8.find((m) => m.pin === '1'), under.toPixel(snap(top.toBoard([200, 140])))), JSON.stringify(r8));
    assert.ok(close((await marks(page, 'U2')).find((m) => m.pin === '28'), [240, 100]), 'pin 28 left of pin 1 underneath');
  });

  test('everything is still there after a reload, and tapping a placed part opens its card', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await showTab(page, 'board-top');
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-myboard circle').length >= 30);
    await page.locator('#part-card').evaluate((n) => n.scrollIntoView());
    await tapAt(page, 200, 180);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R8');
  });

  test('"Show on photo" from another sheet goes to your photo with the part ringed', async () => {
    await page.getByRole('tab', { name: 'SFE-01 Main schematic' }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('svg'));
    await openCard(page, 'R8');
    await page.locator('#part-show-photo').click();
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.startsWith('board-'));
    await nextFrame(page);
    assert.ok(await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-myboard .myboard-selected').length > 0));
  });

  test('Brighter lightens a dark photo', async () => {
    if (!(await page.locator('#myboard').isVisible())) await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-bright').check();
    assert.match(await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img').style.filter), /brightness/);
    await page.locator('#myboard-bright').uncheck();
    assert.equal(await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img').style.filter), '');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('your board: the chip before any photo is lined up', () => {
  test("the chip's card offers to line up a photo, and that starts the taps", async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(600, 500));
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 });
    try {
      await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
      await openCard(page, 'U2');
      assert.match(await page.locator('#part-card .part-myboard').textContent(), /lines up your photos/);
      assert.equal(await page.locator('#part-place').count(), 0, 'the chip is not placed by tapping 28 holes');
      await page.locator('#part-line-up').click();
      await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent === 'board-top');
      assert.match(await page.locator('#myboard-status').textContent(), /tap U2 pin 1/i);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
