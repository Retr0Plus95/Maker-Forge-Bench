import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer, fromMenu } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const ready = (page) => page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('basics', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    // a stand-in screen wake lock, so "Keep screen on" can be checked anywhere
    await page.addInitScript(() => {
      window.__wake = [];
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: async (type) => { window.__wake.push(type); const s = { released: false, release: async () => { s.released = true; }, addEventListener() {} }; return s; } },
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await ready(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('panel sections fold away from their heading, and stay folded', async () => {
    await page.locator('#wiring h2').click();
    assert.equal(await page.locator('#wiring details').first().isVisible(), false);
    assert.equal(await page.locator('#wiring h2').getAttribute('aria-expanded'), 'false');
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#wiring details').first().isVisible(), false);
    await page.locator('#wiring h2').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#wiring details').first().isVisible(), true);
  });

  test('the side panel hides for more drawing room, from its button or P', async () => {
    const before = await page.locator('#stage').evaluate((n) => n.clientWidth);
    await page.locator('#panel-toggle').click();
    assert.equal(await page.locator('#panel').isVisible(), false);
    assert.ok(await page.locator('#stage').evaluate((n) => n.clientWidth) > before);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('p');
    assert.equal(await page.locator('#panel').isVisible(), true);
  });

  test('buttons say their shortcut keys', async () => {
    assert.match(await page.locator('#board3d-toggle').getAttribute('title'), /\(B\)/);
    assert.match(await page.locator('#panel-toggle').getAttribute('title'), /\(P\)/);
    assert.match(await page.locator('#find').getAttribute('title'), /\(\/\)/);
    await page.locator('#checklist input[data-ref="R8"]').check();
    assert.match(await page.locator('#undo').getAttribute('title'), /Ctrl\+Z/);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
  });

  test('S marks the open part soldered, and again unmarks it', async () => {
    await openCard(page, 'R9');
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await openCard(page, 'R9');
    await page.locator('#part-card').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('s');
    assert.equal(await page.locator('#checklist input[data-ref="R9"]').isChecked(), true);
    await page.keyboard.press('s');
    assert.equal(await page.locator('#checklist input[data-ref="R9"]').isChecked(), false);
  });

  test('Keep screen on asks the browser to keep the screen awake', async () => {
    await fromMenu(page, '#wake');
    assert.equal(await page.locator('#wake').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => window.__wake), ['screen']);
    await fromMenu(page, '#wake');
    assert.equal(await page.locator('#wake').getAttribute('aria-pressed'), 'false');
  });

  test('Full screen fills the screen with Bench', async () => {
    await fromMenu(page, '#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement !== null);
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'true');
    await fromMenu(page, '#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement === null);
  });

  test('Easy reading can follow the system light or dark setting', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name=theme][value=system]').check();
    await page.locator('#settings-done').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  });

  test('the shopping list: what to buy, how many, copy or save as a spreadsheet', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.locator('#shopping-open').click();
    assert.equal(await page.locator('#shopping').isVisible(), true);
    const rows = await page.locator('#shopping tbody tr').allTextContents();
    assert.ok(rows.some((r) => r.startsWith('510kresistor') || /^5\s*10k\s*resistor/.test(r)), rows.join(' | '));
    await page.locator('#shopping-copy').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^5 × 10k resistor/m);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#shopping-csv').click()]);
    assert.match(download.suggestedFilename(), /shopping-list\.csv$/);
    await page.locator('#shopping-done').click();
    assert.equal(await page.locator('#shopping').isVisible(), false);
  });

  test('Start over needs a second click, clears the ticks, and undo brings them back', async () => {
    await page.locator('#checklist input[data-ref="R8"]').check();
    await page.locator('#start-over').click();
    assert.equal(await page.locator('#checklist input[data-ref="R8"]').isChecked(), true, 'one click only asks');
    assert.match(await page.locator('#start-over').textContent(), /again/i);
    await page.locator('#start-over').click();
    assert.equal(await page.locator('#checklist input[data-ref="R8"]').isChecked(), false);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#checklist input[data-ref="R8"]').isChecked(), true);
  });

  test('What to wire opens or closes every line at once', async () => {
    await page.locator('#wiring-open-all').click();
    assert.equal(await page.locator('#wiring details:not([open])').count(), 0);
    await page.locator('#wiring-close-all').click();
    assert.equal(await page.locator('#wiring details[open]').count(), 0);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
