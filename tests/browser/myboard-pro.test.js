import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
// lined up with U2 pin 1 at (100,100) and pin 14 at (100,360): hole (c, r) is at x = 100 − 20(r − 13), y = 100 + 20(c − 11)
const px = (c, r) => [100 - 20 * (r - 13), 100 + 20 * (c - 11)];

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}
async function onScreen(page, x, y) {
  return page.evaluate(([X, Y]) => {
    const img = document.querySelector('#sheet-host').shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (X * r.width) / img.naturalWidth, y: r.top + (Y * r.height) / img.naturalHeight };
  }, [x, y]);
}
async function tapAt(page, x, y) {
  const pt = await onScreen(page, x, y);
  await page.mouse.click(pt.x, pt.y);
}
const at = (m, [x, y]) => Math.abs(m.cx - x) < 0.01 && Math.abs(m.cy - y) < 0.01;
const shadowAll = (page, selector) => page.evaluate((s) => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll(s)].map((n) => ({
  cx: Number(n.getAttribute('cx')), cy: Number(n.getAttribute('cy')), r: Number(n.getAttribute('r')), cls: n.getAttribute('class') || '',
  pin: n.getAttribute('data-pin'), net: n.getAttribute('data-net'), points: n.getAttribute('points'), text: n.textContent,
})), selector);

async function showPhoto(page) {
  if ((await page.locator('#tabs [role=tab][aria-selected=true]').textContent()) !== 'board-top') {
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
  }
}

describe('your board: check, move, suggested wires, and the marks', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(800, 700));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await showPhoto(page);
    await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 100, 100);
    await tapAt(page, 100, 360);
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8));
    await tapAt(page, ...px(30, 10));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('Check my board: two legs in one hole is a problem, and clicking it opens the part', async () => {
    await openCard(page, 'C10');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8)); // the + leg in R8 pin 1's hole
    await tapAt(page, ...px(30, 6));
    const clash = page.locator('#myboard-check li[data-kind="clash"]');
    assert.match(await clash.textContent(), /Two legs in one hole: R8 pin 1 and C10 \+/);
    await clash.locator('button').click();
    assert.equal(await page.evaluate(() => document.querySelector('#part-card h2').firstChild.textContent), 'R8');
    assert.match(await page.locator('#myboard-check').textContent(), /Not placed yet/);
  });

  test('drag a selected part on the photo: it moves on whole holes, and undo puts it back', async () => {
    await page.locator('#checklist li[data-ref="C10"] .checklist-name').click();
    const from = await onScreen(page, ...px(30, 6));
    const to = await onScreen(page, ...px(30, 4));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x + 3, to.y - 2, { steps: 4 });
    await page.mouse.up();
    const c10 = await shadowAll(page, '.bench-myboard circle[data-ref="C10"]');
    const plus = c10.find((m) => m.pin === 'p');
    assert.ok(at(plus, px(30, 6)), `the + leg moved two holes with the drag: ${plus.cx},${plus.cy}`);
    assert.equal(await page.locator('#myboard-check li[data-kind="clash"]').count(), 0, 'no clash any more');
    await page.locator('#stage').click({ position: { x: 1000, y: 10 } });
    await page.keyboard.press('Control+z');
    const back = (await shadowAll(page, '.bench-myboard circle[data-ref="C10"]')).find((m) => m.pin === 'p');
    assert.ok(at(back, px(30, 8)), `back: ${back.cx},${back.cy}`);
    await page.keyboard.press('Control+y');
  });

  test('suggested wires: drawn on the photo per line, with a shape to choose and words for each', async () => {
    await page.locator('#myboard-wires').check();
    const lines = await shadowAll(page, '.bench-myboard polyline[data-net="P5V"]');
    assert.ok(lines.length >= 2, `${lines.length} wires on +5 V`);
    const before = lines.map((l) => l.points).join(' ');
    const row = page.locator('#myboard-routes li[data-net="P5V"]');
    assert.match(await row.textContent(), /U2 pin \d+ to .*holes? across|U2 pin \d+ to .* down/);
    await row.locator('select').selectOption('rows');
    const after = (await shadowAll(page, '.bench-myboard polyline[data-net="P5V"]')).map((l) => l.points).join(' ');
    assert.notEqual(after, before, 'the other way round');
    await page.locator('#myboard-wires').uncheck();
    assert.equal((await shadowAll(page, '.bench-myboard polyline')).length, 0);
  });

  test('the marks: hide them, size them, line labels, pin names of the open part, and soldered parts filled', async () => {
    await page.locator('#myboard-marks').uncheck();
    assert.equal((await shadowAll(page, '.bench-myboard circle')).length, 0);
    await page.locator('#myboard-marks').check();
    const small = (await shadowAll(page, '.bench-myboard circle'))[0].r;
    await page.locator('#myboard-size').selectOption('large');
    assert.ok((await shadowAll(page, '.bench-myboard circle'))[0].r > small);
    await page.locator('#myboard-linelabels').check();
    assert.ok((await shadowAll(page, '.bench-myboard text.line-label')).some((t) => t.text === '+5 V'));
    await page.locator('#checklist li[data-ref="U2"] .checklist-name').click();
    assert.ok((await shadowAll(page, '.bench-myboard text.pin-name')).some((t) => t.text === 'PD2'));
    await page.locator('#checklist input[data-ref="R8"]').check();
    assert.ok((await shadowAll(page, '.bench-myboard circle[data-ref="R8"]')).every((m) => m.cls.includes('myboard-soldered')));
  });

  test("the open step's parts not placed yet, and Next part to place", async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    assert.match(await page.locator('#myboard-step-todo').textContent(), /Step 7, not placed yet: .*R12/);
    await page.locator('#myboard-next').click();
    assert.match(await page.locator('#myboard-status').textContent(), /^Placing \S+: tap the/);
    await page.keyboard.press('Escape');
  });

  test('Clear my board asks twice, and undo brings the parts back', async () => {
    await page.locator('#myboard-clear').click();
    assert.match(await page.locator('#myboard-clear').textContent(), /again/i);
    await page.locator('#myboard-clear').click();
    assert.equal((await shadowAll(page, '.bench-myboard circle[data-ref="R8"]')).length, 0);
    await page.locator('#stage').click({ position: { x: 1000, y: 10 } });
    await page.keyboard.press('Control+z');
    assert.equal((await shadowAll(page, '.bench-myboard circle[data-ref="R8"]')).length, 2);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
