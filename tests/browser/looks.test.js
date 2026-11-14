import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}
const summary = (page) => page.locator('#part-looks-summary').textContent();
const pick = (page, field, label) => page.locator(`#look-${field}`).selectOption({ label });
async function undo(page) {
  await page.locator('#stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
}

describe('looks like: your parts as you fitted them', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("the chip's card says what it sits in; picking header strips is kept and undoable", async () => {
    await openCard(page, 'U2');
    assert.equal(await summary(page), 'In a DIP socket');
    await page.locator('#part-looks summary').click();
    await pick(page, 'holder', 'In two header strips');
    assert.equal(await summary(page), 'In two header strips');
    assert.ok(await page.locator('#part-looks').evaluate((d) => d.open), 'stays open while you choose');
    const saved = await page.evaluate(() => Object.entries(localStorage).map(([, v]) => v).find((v) => v.includes('"looks"')));
    assert.match(saved, /"U2":\{"holder":"strips"\}/);
    await undo(page);
    assert.equal(await summary(page), 'In a DIP socket');
    await page.keyboard.press('Control+y');
    assert.equal(await summary(page), 'In two header strips');
    await page.locator('#look-reset').click();
    assert.equal(await summary(page), 'In a DIP socket');
    assert.equal(await page.locator('#look-reset').count(), 0);
  });

  test('the buck module can be an L7805: the card, its pins and the warning follow, and undo brings the module back', async () => {
    await openCard(page, 'U1');
    if (!(await page.locator('#part-looks').evaluate((d) => d.open))) await page.locator('#part-looks summary').click();
    await pick(page, 'swap', 'L7805 regulator');
    await page.waitForFunction(() => document.querySelector('#part-card .part-value')?.textContent === 'L7805CV');
    assert.match(await page.locator('#part-looks-warning').textContent(), /USB port/);
    assert.match(await page.locator('#part-looks-note').textContent(), /IN to IN\+, GND to IN− and OUT−, OUT to OUT\+/);
    assert.match(await page.locator('#part-card .part-note').textContent(), /in place of MP1584EN buck module/);
    const pins = await page.locator('#part-card .part-connections li').allTextContents();
    assert.ok(pins.some((t) => t.startsWith('pin IN → +12 V')) && pins.some((t) => t.startsWith('pin OUT → +5 V')), pins.join(' | '));
    assert.equal(await page.locator('#look-facing').count(), 1, 'which way its printed side faces');
    assert.match(await page.locator('#part-howto summary').textContent(), /L7805/);
    await undo(page);
    await page.waitForFunction(() => document.querySelector('#part-card .part-value')?.textContent === 'MP1584EN buck module');
    assert.equal(await page.locator('#part-looks-warning').count(), 0);
  });

  test('the 3D view draws the parts as you fitted them', async () => {
    await openCard(page, 'U1');
    await pick(page, 'swap', 'L7805 regulator');
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.waitForFunction(() => window.makerForge.board3d.screenOf('U1'));
    await page.locator('#board3d-toggle').click();
  });

  test('your looks go into the progress file and come back from it', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.deepEqual(saved.looks, { U1: { swap: 'l7805' } });
    await openCard(page, 'U1');
    await page.locator('#look-reset').click();
    await page.waitForFunction(() => document.querySelector('#part-card .part-value')?.textContent === 'MP1584EN buck module');
    await page.locator('#progress-open').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await page.waitForFunction(() => document.querySelector('#part-card .part-value')?.textContent === 'L7805CV');
  });

  test("your board's placement of a swapped part follows its new pin names, and undo puts it back", async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
    const file = JSON.parse(await readFile(await download.path(), 'utf8'));
    file.looks = {};
    file.myBoard = { anchor: 'U2', photos: {}, placed: { U1: { INp: [40, 2], INn: [40, 4], OUTp: [44, 6], OUTn: [44, 4] } } };
    await page.locator('#progress-open').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.waitForFunction(() => document.querySelector('#part-card .part-value')?.textContent === 'MP1584EN buck module');
    const placed = async () => {
      const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
      return JSON.parse(await readFile(await d.path(), 'utf8')).myBoard.placed;
    };
    await pick(page, 'swap', 'L7805 regulator');
    assert.deepEqual((await placed()).U1, { IN: [40, 2], GND: [40, 4], OUT: [44, 6] });
    await pick(page, 'swap', 'As drawn: MP1584EN buck module');
    assert.equal((await placed()).U1, undefined, 'the module needs all four holes again: place it again');
    await undo(page);
    assert.deepEqual((await placed()).U1, { IN: [40, 2], GND: [40, 4], OUT: [44, 6] });
    await undo(page);
    assert.deepEqual((await placed()).U1, { INp: [40, 2], INn: [40, 4], OUTp: [44, 6], OUTn: [44, 4] });
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
