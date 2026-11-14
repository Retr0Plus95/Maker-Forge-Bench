import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
// lined up with U2 pin 1 at (100,100) and pin 14 at (100,360): hole (c, r) is at x = 100 − 20(r − 13), y = 100 + 20(c − 11)
const px = (c, r) => [100 - 20 * (r - 13), 100 + 20 * (c - 11)];
// the owner's board: U2 pin 1 at L21, pin 14 at L8, pin 28 at O21, so hole (c, r) is letter 12 − (r − 13), number 21 − (c − 11)

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
async function nameHoles(page, a, b, c, skip = '') {
  await page.locator('#hn-a').fill(a);
  await page.locator('#hn-b').fill(b);
  await page.locator('#hn-c').fill(c);
  await page.locator('#hn-skip').fill(skip);
  await page.locator('#hn-use').click();
}

describe('hole names like your board', () => {
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
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8));
    await tapAt(page, ...px(30, 10));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the form asks for three of the chip pins, and says why names that cannot be right are refused', async () => {
    assert.equal(await page.locator('#part-where').count(), 0, 'no names yet');
    await page.locator('#hn-edit').click();
    assert.deepEqual(await page.locator('.hn-field span').allTextContents(), ['U2 pin 1', 'U2 pin 14', 'U2 pin 28', 'Letters it skips (if any)']);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hn-a');
    await nameHoles(page, 'L21', 'L9', 'O21');
    assert.match(await page.locator('#hn-why').textContent(), /13 rows apart; those are 12/);
    assert.equal(await page.locator('#hn-b').inputValue(), 'L9', 'what you typed stays to fix');
    await page.locator('#hn-b').fill('l8');
    await page.locator('#hn-b').press('Enter');
    assert.match(await page.locator('#hn-summary').textContent(), /U2 pin 1 is at L21/);
    assert.match(await page.locator('#myboard-status').textContent(), /Hole names on/);
  });

  test("cards say where each leg goes on your board", async () => {
    await openCard(page, 'R8');
    assert.equal(await page.locator('#part-where').textContent(), 'On your board: pin 1 at Q2, pin 2 at O2');
    await openCard(page, 'U2');
    assert.equal(await page.locator('#part-where').textContent(), 'On your board: pin 1 at L21, pin 14 at L8');
  });

  test('the guide says where each part goes on your board, or on sheet 4 when it is not placed yet (0.8)', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    const where = (ref) => page.locator('#steps .step-parts li').filter({ has: page.locator('.part-link', { hasText: new RegExp(`^${ref}$`) }) }).locator('.step-part-where');
    assert.equal(await where('R8').textContent(), 'Your board: pin 1 at Q2 · pin 2 at O2');
    assert.match(await where('R9').textContent(), /^pin 1 at \d+,\d+ · pin 2 at \d+,\d+$/);
  });

  test('hovering a hole on the photo names it and what is in it', async () => {
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    const pt = await onScreen(page, ...px(17, 13)); // U2 pin 7
    await page.mouse.move(pt.x, pt.y);
    await page.waitForFunction(() => !document.querySelector('#label-tip').hidden);
    assert.equal(await page.locator('#label-tip').textContent(), 'L15 · U2 pin 7');
    const empty = await onScreen(page, ...px(20, 16));
    await page.mouse.move(empty.x, empty.y);
    await page.waitForFunction(() => document.querySelector('#label-tip').textContent === 'I12');
  });

  test('check findings and suggested wires use the names', async () => {
    await openCard(page, 'C10');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8)); // the + leg in R8 pin 1's hole
    await tapAt(page, ...px(30, 6));
    assert.match(await page.locator('#myboard-check li[data-kind="clash"]').textContent(), /^Two legs in one hole \(Q2\): R8 pin 1 and C10 \+/);
    await page.keyboard.press('Control+z');
    await page.locator('#myboard-wires').check();
    assert.match(await page.locator('#myboard-routes li[data-net="P5V"]').textContent(), /U2 pin \d+ \([A-Z]\d+\) to .*\([A-Z]\d+\)/);
    await page.locator('#myboard-wires').uncheck();
  });

  test('undo, redo, turning them off, and they are kept after a reload', async () => {
    await page.locator('#stage').click({ position: { x: 1000, y: 10 } });
    await page.locator('#hn-off').click();
    assert.match(await page.locator('#hn-summary').textContent(), /Type three/);
    await page.keyboard.press('Control+z');
    assert.match(await page.locator('#hn-summary').textContent(), /L21/);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    if (await page.locator('#myboard').isHidden()) await page.locator('#myboard-toggle').click();
    assert.match(await page.locator('#hn-summary').textContent(), /U2 pin 1 is at L21/);
  });

  test("the continuity test says where the chip's legs are", async () => {
    for (let k = 0; k < 60 && !/U2/.test(await page.locator('#continuity-now .cont-pair').textContent()); k++) await page.locator('#cont-skip').click();
    assert.match(await page.locator('#continuity-now .cont-pair').textContent(), /U2 pin \d+ \([A-Z]\d+\)/);
  });

  test('the 3D view of your board has the names along its edges', async () => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.locator('#board3d-mine').click();
    await page.waitForFunction(() => (window.makerForge.board3d.info()?.edgeNames || []).length > 0, null, { timeout: 20000 });
    const names = (await page.evaluate(() => window.makerForge.board3d.info())).edgeNames;
    for (const n of ['L', 'O', '21', '8', '2']) assert.ok(names.includes(n), `${n} in ${names.join(' ')}`);
    await page.locator('#board3d-toggle').click();
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
