import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const shown = (page, id) => page.locator(`#${id}`).isVisible();
const openTab = (page) => page.evaluate(() => document.querySelector('#panel').dataset.tab);
async function undo(page) {
  await page.locator('#stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
}

describe('the panel in tabs, and the guide', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }, { tabs: true }));
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('it opens on the guide: one tab at a time, each with its count', async () => {
    assert.equal(await openTab(page), 'guide');
    assert.deepEqual(await page.locator('#panel-tabs [role=tab]').evaluateAll((tabs) => tabs.map((t) => t.firstChild.textContent)),
      ['Guide', 'Wiring', 'Checks', 'Parts', 'All'], 'no Board tab without a photo of your board open');
    assert.equal(await page.locator('#ptab-guide').getAttribute('aria-label'), 'Guide, 0 of 10 done');
    assert.equal(await page.locator('#ptab-guide .tab-count').textContent(), '0/10');
    assert.equal(await shown(page, 'steps'), true);
    for (const id of ['wiring', 'checks', 'continuity', 'checklist']) assert.equal(await shown(page, id), false, id);
    assert.equal(await shown(page, 'part-card'), true, 'the card is on every tab');
  });

  test('a tab is kept after a reload; the arrow keys move between tabs', async () => {
    await page.locator('#ptab-parts').click();
    assert.equal(await shown(page, 'checklist'), true);
    assert.equal(await shown(page, 'steps'), false);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
    assert.equal(await openTab(page), 'parts');
    await page.locator('#ptab-parts').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await openTab(page), 'checks');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ptab-checks');
    assert.equal(await shown(page, 'checks'), true);
    await page.keyboard.press('Home');
    assert.equal(await openTab(page), 'guide');
  });

  test('picking a part from another tab keeps the card on top', async () => {
    await page.locator('#ptab-parts').click();
    await page.locator('#checklist .checklist-name[data-open="R4"]').click();
    assert.match(await page.locator('#part-card h2').textContent(), /R4/);
    assert.equal(await shown(page, 'checklist'), true);
    await page.locator('#ptab-guide').click();
    assert.match(await page.locator('#part-card h2').textContent(), /R4/);
  });

  test('a line found with Ctrl+K opens the Wiring tab', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+k');
    await page.locator('#palette-input').fill('Line +5');
    await page.keyboard.press('Enter');
    assert.equal(await openTab(page), 'wiring');
    assert.equal(await shown(page, 'wiring'), true);
    await page.locator('#ptab-guide').click();
  });

  test('the guide starts with one button, and shows each part with where it goes', async () => {
    const start = page.locator('#step-start');
    assert.equal(await page.locator('#steps .step-open').count(), 0);
    assert.match(await start.textContent(), /^Start with step 1: Bare-wire buses/);
    await start.click();
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 1 of 10: Bare-wire buses');
    await page.locator('#steps .steps-list li button', { hasText: 'The chip\'s support parts' }).click();
    const rows = page.locator('#steps .step-parts li');
    assert.equal(await rows.count(), 3);
    assert.equal(await rows.first().locator('.part-link').textContent(), 'R4');
    assert.equal(await rows.first().locator('.step-part-value').textContent(), '10k');
    assert.match(await rows.first().locator('.step-part-where').textContent(), /^pin 1 at \d+,\d+ · pin 2 at \d+,\d+$/);
    await rows.first().locator('.step-tick').check();
    assert.equal(await page.locator('#checklist input[data-ref="R4"]').isChecked(), true, 'the same tick as the Parts list');
    assert.equal(await page.locator('#ptab-parts .tab-count').textContent(), '1/37');
  });

  test('Done, next step ticks the rest as one undo step and opens the next', async () => {
    await page.locator('#step-done-next').click();
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 7 of 10: Fan drive and tach');
    for (const ref of ['R4', 'C6', 'C7']) assert.equal(await page.locator(`#checklist input[data-ref="${ref}"]`).isChecked(), true, ref);
    assert.equal(await page.locator('#ptab-guide .tab-count').textContent(), '1/10');
    assert.match(await page.locator('#status').textContent(), /Step 6 done\. 9 to go\./);
    await undo(page);
    assert.equal(await page.locator('#checklist input[data-ref="C6"]').isChecked(), false, 'undo takes the step back');
    assert.equal(await page.locator('#checklist input[data-ref="R4"]').isChecked(), true, 'the tick before it stays');
  });

  test('a step with nothing to tick: Done, next step marks it done; the last step says so', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'Power-up checks' }).click();
    assert.equal(await page.locator('#step-done-next').textContent(), 'Done, that was the last step ✓');
    await page.locator('#step-done-next').click();
    assert.equal(await page.locator('#step-done-next').count(), 0);
    assert.equal(await page.locator('#steps .guide-finished').textContent(), '✓ The last step is done.');
    assert.equal(await page.locator('#step-done').isChecked(), true);
  });

  test('All shows every section, and folding works there', async () => {
    await page.locator('#ptab-all').click();
    for (const id of ['steps', 'wiring', 'checks', 'checklist']) assert.equal(await shown(page, id), true, id);
    await page.locator('#wiring > h2').click();
    assert.equal(await page.locator('#wiring').getAttribute('data-folded'), '');
    await page.locator('#wiring > h2').click();
    await page.locator('#steps .steps-head > h2').click();
    assert.equal(await page.locator('#steps').getAttribute('data-folded'), '', 'the steps fold by their heading too');
    assert.equal(await shown(page, 'steps-adjust'), false);
    await page.locator('#steps .steps-head > h2').click();
    await page.locator('#ptab-guide').click();
    assert.equal(await page.locator('#steps .steps-head > h2').getAttribute('role'), null, 'no folding in a tab');
  });

  test('a compact header: the everyday tools stay, the rest wait in the Menu', async () => {
    for (const id of ['#undo', '#find', '#flip', '#board3d-toggle', '#split', '#panel-toggle', '#settings-button']) assert.equal(await page.locator(id).isVisible(), true, id);
    for (const id of ['#calc-open', '#wake', '#menu-shopping']) assert.equal(await page.locator(id).isVisible(), false, id);
    await page.locator('#menu-toggle').click();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#calc-open').isVisible(), true);
    await page.locator('#menu-shopping').click();
    await page.waitForFunction(() => document.querySelector('#shopping').open);
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false', 'the menu folds away');
    await page.keyboard.press('Escape');
    await page.locator('#menu-toggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#calc-open').isVisible(), false);
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});

describe('the tabs on a phone', () => {
  test('one row under the handle that scrolls sideways, not the page', async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 390, height: 844 }, { tabs: true, context: { hasTouch: true, isMobile: true } });
    try {
      await page.waitForFunction(() => document.querySelectorAll('#panel-tabs [role=tab]').length > 0);
      const tops = await page.locator('#panel-tabs [role=tab]').evaluateAll((tabs) => [...new Set(tabs.filter((t) => t.offsetParent).map((t) => Math.round(t.getBoundingClientRect().top)))]);
      assert.equal(tops.length, 1, 'one row');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.locator('#ptab-parts').tap();
      assert.equal(await page.locator('#checklist').isVisible(), true);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
