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

const group = (page, label) => page.locator('#wiring details').filter({ has: page.locator('summary', { hasText: label }) }).first();

describe('what to wire', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#wiring details').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('every line is listed, supplies first, with a count', async () => {
    const heads = await page.locator('#wiring details summary').allTextContents();
    assert.match(heads[0], /^\+12 V 0 of \d+ wired$/);
    assert.match(heads[1], /^\+5 V 0 of \d+ wired$/);
    assert.match(heads[2], /^0 V 0 of \d+ wired$/);
  });

  test('ticking a leg in the list shows on the part card, and undo takes it back', async () => {
    await group(page, '+5 V').locator('summary').click();
    await page.locator('#wiring input[data-wire="U2:7"]').check();
    assert.match(await group(page, '+5 V').locator('summary').textContent(), /^\+5 V 1 of \d+ wired$/);
    await openCard(page, 'U2');
    assert.equal(await page.locator('#part-card input[data-wire="U2:7"]').isChecked(), true);
    assert.match(await page.locator('#part-card .part-unwired').textContent(), /^Still to wire: pins? /);
    assert.doesNotMatch(await page.locator('#part-card .part-unwired').textContent(), /\b7\b/);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#wiring input[data-wire="U2:7"]').isChecked(), false);
    assert.equal(await page.locator('#part-card input[data-wire="U2:7"]').isChecked(), false);
    await page.keyboard.press('Control+y');
    assert.equal(await page.locator('#wiring input[data-wire="U2:7"]').isChecked(), true);
  });

  test('a tick on the card shows in the list; all pins wired says so', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-card input[data-wire="R8:1"]').check();
    await page.locator('#part-card input[data-wire="R8:2"]').check();
    assert.equal(await page.locator('#part-card .part-unwired').textContent(), 'All its pins are wired.');
    assert.equal(await page.locator('#wiring input[data-wire="R8:1"]').isChecked(), true);
  });

  test('the wired ticks stay after a reload', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#wiring details').length > 0);
    assert.equal(await page.locator('#wiring input[data-wire="U2:7"]').isChecked(), true);
    assert.equal(await page.locator('#wiring input[data-wire="R8:2"]').isChecked(), true);
  });

  test('"Only not wired" hides what is done', async () => {
    await page.locator('#wiring-open-only').check();
    assert.equal(await page.locator('#wiring input[data-wire="U2:7"]').count(), 0);
    assert.ok(await page.locator('#wiring input[data-wire="U2:20"]').count() > 0);
    await page.locator('#wiring-open-only').uncheck();
    assert.equal(await page.locator('#wiring input[data-wire="U2:7"]').count(), 1);
  });

  test("a line's Show rings its parts on the drawing", async () => {
    await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R8'));
    await group(page, 'TACHA_F').locator('summary').click();
    await group(page, 'TACHA_F').locator('button', { hasText: 'Show' }).click();
    const rings = await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-net rect').length);
    assert.ok(rings >= 2, `rings: ${rings}`);
  });

  test('Copy as text puts the list on the clipboard', async () => {
    await page.locator('#wiring-copy').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('copied'));
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^\+12 V: \d+ of \d+ wired$/m);
    assert.ok(clip.includes('  [x] U2 pin 7'));
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
