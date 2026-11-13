import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const cardRef = (page) => page.evaluate(() => document.querySelector('#part-card h2')?.firstChild?.textContent || null);

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('part card helpers and the parts library', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("a resistor's colour bands are drawn from its value", async () => {
    await openCard(page, 'R8');
    assert.equal(await page.locator('#part-bands .band').count(), 4);
    assert.equal(await page.locator('#part-bands .bands-text').textContent(), 'brown black orange gold');
  });

  test("a ceramic capacitor says what's printed on it", async () => {
    await openCard(page, 'C5');
    assert.equal(await page.locator('#part-card .part-code').textContent(), 'Printed on it: 104 (100 nF)');
  });

  test('polarised parts get a picture of which way round, from the library', async () => {
    await openCard(page, 'C10');
    assert.equal(await page.locator('#part-polarity-picture[data-kind="electrolytic"]').count(), 1);
    await openCard(page, 'D2');
    assert.equal(await page.locator('#part-polarity-picture[data-kind="led"]').count(), 1);
    assert.match(await page.locator('#part-card .part-library-polarity').textContent(), /long leg is the anode/);
  });

  test('the chip: how to use it, and pin names in the pin view', async () => {
    await openCard(page, 'U2');
    const how = page.locator('#part-howto');
    assert.match(await how.locator('summary').textContent(), /How to use it/);
    assert.match(await how.textContent(), /Pin 1 \(RESET\) needs a 10k pull-up/);
    assert.match(await how.textContent(), /Microchip ATmega328P datasheet/);
    await page.locator('#part-pins').click();
    assert.equal(await page.locator('#pin-view [data-pin="4"] .pin-name').textContent(), 'PD2');
    assert.equal(await page.locator('#pin-view [data-pin="7"] .pin-label').textContent(), '+5 V', 'the line label stays');
    await page.locator('#pin-view [data-pin="4"]').click();
    assert.match(await page.locator('#pin-name').textContent(), /PD2 INT0 · D2/);
    await page.locator('#part-pins').click();
  });

  test('Copy puts the part and its value on the clipboard', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-copy').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'R8 10k');
  });

  test('"Tick all 5 × 10k" ticks every part with that value, in one undo step', async () => {
    await page.locator('#part-tick-value').click();
    for (const ref of ['R4', 'R7', 'R8', 'R9']) assert.equal(await page.locator(`#checklist input[data-ref="${ref}"]`).isChecked(), true, ref);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#checklist input[data-ref="R4"]').isChecked(), false);
  });

  test('"Mark all its pins wired" ticks every connected pin of the part', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-wire-all').click();
    assert.equal(await page.locator('#part-card .part-unwired').textContent(), 'All its pins are wired.');
  });

  test('previous and next part, by button and by , and .', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-next').click();
    const next = await cardRef(page);
    assert.notEqual(next, 'R8');
    await page.locator('#part-card').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press(',');
    assert.equal(await cardRef(page), 'R8');
    await page.keyboard.press('.');
    assert.equal(await cardRef(page), next);
  });

  test('"Search the web" opens a search for the part, only when clicked', async () => {
    await openCard(page, 'U2');
    const href = await page.locator('#part-search').getAttribute('href');
    assert.ok(href.startsWith('https://duckduckgo.com/?q='), href);
    assert.ok(decodeURIComponent(href).includes('ATmega328P-PU datasheet'), href);
    assert.equal(await page.locator('#part-search').getAttribute('rel'), 'noopener noreferrer');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
