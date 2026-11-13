import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

/** Taps the unrotated photo at one of its own pixels. */
async function tapAt(page, x, y) {
  const pt = await page.evaluate(([px, py]) => {
    const img = document.querySelector('#sheet-host').shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (px * r.width) / img.naturalWidth, y: r.top + (py * r.height) / img.naturalHeight };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}

const markCount = (page, ref) => page.evaluate((r) => document.querySelector('#sheet-host').shadowRoot.querySelectorAll(`.bench-myboard circle[data-ref="${r}"]`).length, ref);
const markOnScreen = (page, ref, pin) => page.evaluate(([r, p]) => {
  const c = document.querySelector('#sheet-host').shadowRoot.querySelector(`.bench-myboard circle[data-ref="${r}"][data-pin="${p}"]`);
  const b = c.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [ref, pin]);

describe('your board: take a part off, and turn a sideways photo', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(600, 500));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 100, 100);
    await tapAt(page, 100, 360);
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    await tapAt(page, 200, 140);
    await tapAt(page, 200, 180);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('"Take off my board" removes a placed part, and undo puts it back', async () => {
    assert.equal(await markCount(page, 'R8'), 2);
    await page.locator('#part-unplace').click();
    assert.equal(await markCount(page, 'R8'), 0);
    assert.match(await page.locator('#part-card .part-myboard').textContent(), /Not on your board/);
    await page.locator('#stage').click({ position: { x: 900, y: 10 } });
    await page.keyboard.press('Control+z');
    assert.equal(await markCount(page, 'R8'), 2);
  });

  test('a photo turns a quarter at a time, its marks turn with it, and tapping still finds parts', async () => {
    const before = await markOnScreen(page, 'R8', '1');
    await page.locator('#rotate').click();
    await nextFrame(page);
    const after = await markOnScreen(page, 'R8', '1');
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 5, 'the mark moved with the photo');
    await page.locator('#checklist li[data-ref="C5"] .checklist-name').click(); // another part, staying on the photo
    await page.mouse.click(after.x, after.y);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R8');
  });

  test('the turn is remembered for that photo', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    assert.equal(await page.locator('#rotate').getAttribute('data-turn'), '90');
    await page.locator('#stage').click({ position: { x: 900, y: 10 } });
    for (let i = 0; i < 3; i++) await page.keyboard.press('r');
    assert.equal(await page.locator('#rotate').getAttribute('data-turn'), '0');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
