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

describe('parts, checklist and Find extras', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('Find knows line names: "+5 V" opens that line in What to wire and rings its parts', async () => {
    await page.locator('#find').fill('+5 V');
    const line = page.locator('#find-results button.find-line', { hasText: '+5 V' });
    await line.waitFor();
    await line.click();
    assert.equal(await page.locator('#wiring details[data-net="P5V"]').evaluate((d) => d.open), true);
    assert.equal(await page.locator('#wiring details[data-net="P5V"] .wire-show').getAttribute('aria-pressed'), 'true');
    assert.ok(await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-net rect').length > 0));
  });

  test('Find knows values: "100 nF" lists those parts, and each opens its card', async () => {
    await page.locator('#find').fill('100 nF');
    const c5 = page.locator('#find-results button.find-value', { hasText: 'C5' });
    await c5.waitFor();
    assert.ok(await page.locator('#find-results button.find-value').count() >= 4);
    await c5.click();
    assert.equal(await cardRef(page), 'C5');
    await page.locator('#find').fill('');
  });

  test('polarised parts carry a "way round matters" badge, on the card and in the checklist', async () => {
    await openCard(page, 'C10');
    assert.equal(await page.locator('#part-card h2 .badge-polarity').textContent(), 'Way round matters');
    assert.equal(await page.locator('#checklist li[data-ref="C10"] .badge-polarity').count(), 1);
    assert.equal(await page.locator('#checklist li[data-ref="R8"] .badge-polarity').count(), 0);
  });

  test("clicking a part's name in the checklist opens its card", async () => {
    await page.locator('#checklist li[data-ref="R12"] .checklist-name').click();
    assert.equal(await cardRef(page), 'R12');
  });

  test('"Only not soldered" hides the ticked parts', async () => {
    await page.locator('#checklist input[data-ref="R12"]').check();
    await page.locator('#checklist-open-only').check();
    assert.equal(await page.locator('#checklist li[data-ref="R12"]').count(), 0);
    assert.equal(await page.locator('#checklist li[data-ref="R8"]').count(), 1);
    await page.locator('#checklist-open-only').uncheck();
    assert.equal(await page.locator('#checklist li[data-ref="R12"]').count(), 1);
  });

  test('your own note on a part: saved, undoable, kept after a reload', async () => {
    await openCard(page, 'R9');
    await page.locator('#part-own-note').fill('used a 4.7k here');
    await page.locator('#part-own-note').blur();
    await page.waitForFunction(() => document.querySelector('#saved').textContent !== '');
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#part-own-note').inputValue(), '');
    await page.keyboard.press('Control+y');
    assert.equal(await page.locator('#part-own-note').inputValue(), 'used a 4.7k here');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await openCard(page, 'R9');
    assert.equal(await page.locator('#part-own-note').inputValue(), 'used a 4.7k here');
    assert.equal(await page.evaluate(() => window.makerForge.context().ownNote), 'used a 4.7k here', 'Claude sees your note');
  });

  test('a note being typed is not lost when the card redraws', async () => {
    await openCard(page, 'R7');
    await page.locator('#part-own-note').fill('half typed');
    await page.locator('#part-own-note').evaluate(() => document.querySelector('#part-tick').click());
    assert.equal(await page.locator('#part-own-note').inputValue(), 'half typed');
  });

  test('"Next part in this step" moves to the next part not soldered yet', async () => {
    await openCard(page, 'R8');
    await page.locator('#part-next-in-step').click();
    const next = await cardRef(page);
    assert.ok(next && next !== 'R8' && next !== 'R12', `went to ${next} (R12 is soldered)`);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
