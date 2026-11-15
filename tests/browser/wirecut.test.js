// Bench 1.0: Wire to cut (design §2), taken from Maker Forge Shape's wire lengths. Every link and
// bus with its length to cut, totals in plain words, the guide pointing here, and your own
// board's suggested wires with a colour each.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const px = (c, r) => [100 - 20 * (r - 13), 100 + 20 * (c - 11)];

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

async function projectWithPhoto() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  await mkdir(path.join(dir, 'my-board'));
  await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(800, 700));
  return dir;
}

describe('wire to cut', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await projectWithPhoto());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('Wire to cut lists every link with its length, numbered like sheet 4', async () => {
    assert.equal(await page.locator('#wirecut li[data-link]').count(), 44);
    assert.match(await page.locator('#wirecut li[data-link]').first().textContent(), /2,1 → 2,2 \(\+12 V\): cut 15 mm, strip 5 mm at each end/);
    assert.match(await page.locator('#wirecut-buses').textContent(), /Row 2 \(\+12 V\), 2 → 32: cut 90 mm/);
  });

  test('the totals say how much wire to cut', async () => {
    assert.equal(await page.locator('#wirecut-totals').textContent(), 'Insulated wire: 44 links, about 1.3 m in all. Bare wire: 7 buses, about 55 cm.');
  });

  test("the guide's links step points to Wire to cut", async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'Insulated links' }).click();
    const what = await page.locator('#steps .step-what').textContent();
    assert.match(what, /44 insulated links, about 1\.3 m of wire: the lengths are in Wiring → Wire to cut\./);
    assert.doesNotMatch(await page.locator('body').textContent(), /see the wire list on sheet 4/);
  });

  test('Copy as text copies the cut list', async () => {
    await page.locator('#wirecut-copy').click();
    await page.waitForFunction(() => /Wire list copied/.test(document.querySelector('#status')?.textContent || ''));
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(text, /^1\. 2,1 → 2,2/m);
    assert.match(text, /^Insulated wire: 44 links/m);
  });

  test('your own board: suggested wires get lengths and a colour each', async () => {
    assert.equal(await page.locator('#wirecut-mine').count(), 0, 'nothing of yours before a photo is lined up');
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
    await openCard(page, 'C10');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 6));
    await tapAt(page, ...px(30, 4));
    await page.locator('#myboard-wires').check();
    const mine = page.locator('#wirecut-mine li');
    assert.ok(await mine.count() >= 1, 'a line of suggested wires');
    assert.match(await mine.first().textContent(), /, (red wire|black wire|any other colour): \d+ wires?, \d+ mm/);
    await page.locator('#myboard-wires').uncheck();
    assert.equal(await page.locator('#wirecut-mine').count(), 0);
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});

describe('wire to cut in the tabs', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await projectWithPhoto());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { tabs: true }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('on the Wiring tab, Wire to cut sits under What to wire', async () => {
    assert.equal(await page.locator('#wirecut').isVisible(), false, 'not on the guide');
    await page.locator('#panel-tabs [role=tab]', { hasText: 'Wiring' }).click();
    assert.equal(await page.locator('#wirecut').isVisible(), true);
    const order = await page.evaluate(() => Boolean(document.querySelector('#wiring').compareDocumentPosition(document.querySelector('#wirecut')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.ok(order, 'after What to wire');
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
