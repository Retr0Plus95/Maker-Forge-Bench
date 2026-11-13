import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
// lined up with U2 pin 1 at (100,100) and pin 14 at (100,360): hole (c, r) is at x = 100 − 20(r − 13), y = 100 + 20(c − 11)
const px = (c, r) => [100 - 20 * (r - 13), 100 + 20 * (c - 11)];
const at = (m, [x, y]) => Math.abs(m.cx - x) < 0.01 && Math.abs(m.cy - y) < 0.01;

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}
async function tapAt(page, x, y) {
  const pt = await page.evaluate(([X, Y]) => {
    const img = document.querySelector('#sheet-host').shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (X * r.width) / img.naturalWidth, y: r.top + (Y * r.height) / img.naturalHeight };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}
const marks = (page, ref) => page.evaluate((r) => [...document.querySelector('#sheet-host').shadowRoot
  .querySelectorAll(`.bench-myboard circle[data-ref="${r}"]`)].map((n) => ({
  cx: Number(n.getAttribute('cx')), cy: Number(n.getAttribute('cy')), pin: n.getAttribute('data-pin'), cls: n.getAttribute('class') || '',
})), ref);

describe('suggest a spot', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(800, 700));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 100, 100);
    await tapAt(page, 100, 360);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("from C5's card: dashed marks across the chip's pins 7 and 8, with the reason", async () => {
    await openCard(page, 'C5');
    await page.locator('#part-suggest').click();
    await page.waitForFunction(() => document.querySelector('#myboard-suggest'));
    assert.match(await page.locator('#myboard-suggest').textContent(), /Suggested spot for C5 \(1 of 3\): on U2 pin 7 and pin 8\./);
    const m = await marks(page, 'C5');
    assert.ok(m.every((x) => x.cls.includes('myboard-suggest')));
    assert.ok(at(m.find((x) => x.pin === '1'), px(17, 13)) && at(m.find((x) => x.pin === '2'), px(18, 13)), JSON.stringify(m));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suggest-use');
  });

  test('Another spot moves on and comes round again; Esc stops', async () => {
    await page.locator('#suggest-another').click();
    assert.match(await page.locator('#myboard-suggest').textContent(), /\(2 of 3\)/);
    const second = await marks(page, 'C5');
    assert.ok(!at(second.find((x) => x.pin === '1'), px(17, 13)) || !at(second.find((x) => x.pin === '2'), px(18, 13)));
    await page.locator('#suggest-another').click();
    await page.locator('#suggest-another').click();
    assert.match(await page.locator('#myboard-suggest').textContent(), /\(1 of 3\)/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#myboard-suggest').count(), 0);
    assert.equal((await marks(page, 'C5')).length, 0);
  });

  test('Use this spot places it, the check finds no clash, and undo takes it off', async () => {
    await openCard(page, 'C5');
    await page.locator('#part-suggest').click();
    await page.locator('#suggest-use').click();
    assert.match(await page.locator('#myboard-status').textContent(), /^C5 placed: on U2 pin 7 and pin 8\./);
    const m = await marks(page, 'C5');
    assert.equal(m.length, 2);
    assert.ok(m.every((x) => !x.cls.includes('myboard-suggest')));
    assert.equal(await page.locator('#myboard-check li[data-kind="clash"]').count(), 0);
    await page.locator('#stage').click({ position: { x: 1000, y: 10 } });
    await page.keyboard.press('Control+z');
    assert.equal((await marks(page, 'C5')).length, 0);
  });

  test("Your board's Suggest a spot works on the open part: C9 across pins 20 and 22", async () => {
    await page.locator('#checklist li[data-ref="C9"] .checklist-name').click();
    await page.locator('#myboard-suggest-next').click();
    assert.match(await page.locator('#myboard-suggest').textContent(), /Suggested spot for C9 \(1 of \d\): on U2 pin 20 and pin 22\./);
    await page.locator('#suggest-stop').click();
    assert.equal(await page.locator('#myboard-suggest').count(), 0);
  });

  test('with hole names, the suggestion says which holes', async () => {
    await page.locator('#hn-edit').click();
    await page.locator('#hn-a').fill('L21');
    await page.locator('#hn-b').fill('L8');
    await page.locator('#hn-c').fill('O21');
    await page.locator('#hn-use').click();
    await openCard(page, 'C5');
    await page.locator('#part-suggest').click();
    const text = await page.locator('#myboard-suggest').textContent();
    assert.match(text, /on U2 pin 7 \(L15\) and pin 8 \(L14\)/);
    assert.match(text, /Its legs: pin 1 in L15, pin 2 in L14/);
    await page.keyboard.press('Escape');
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
