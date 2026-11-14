import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const pair = (page) => page.locator('#continuity-now .cont-pair').textContent();
const progress = (page) => page.locator('#continuity .progress-text').textContent();

// the step's note, print and Next step by itself are folded under one line (0.8)
async function openMore(page) {
  if (!(await page.locator('#steps .step-more').evaluate((d) => d.open))) await page.locator('#steps .step-more > summary').click();
}

describe('the guided continuity test, and step extras', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.waitForFunction(() => document.querySelector('#continuity-now'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('one probe pair at a time, saying whether it should beep', async () => {
    assert.match(await progress(page), /^0 of \d+ done · 0 faults$/);
    assert.match(await page.locator('#continuity-now .cont-expect').textContent(), /It should beep: both are on \+12 V\./);
    const first = await pair(page);
    await page.locator('#cont-beeped').click();
    assert.match(await progress(page), /^1 of \d+ done · 0 faults$/);
    assert.notEqual(await pair(page), first, 'on to the next pair');
  });

  test('a wrong answer is kept as a fault, with what it means; Test again clears it', async () => {
    await page.locator('#cont-silent').click();
    assert.match(await progress(page), /^2 of \d+ done · 1 fault$/);
    assert.match(await page.locator('#continuity-faults li').first().textContent(), /No connection between .* a joint or a wire is missing/);
    await page.locator('#continuity-faults .cont-retry').click();
    assert.match(await progress(page), /^1 of \d+ done · 0 faults$/);
  });

  test('Skip moves on without answering; undo takes an answer back; answers are kept', async () => {
    const now = await pair(page);
    await page.locator('#cont-skip').click();
    assert.notEqual(await pair(page), now);
    await page.locator('#cont-beeped').click();
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.match(await progress(page), /^1 of \d+ done/);
    await page.keyboard.press('Control+y');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#continuity .progress-text'));
    assert.match(await progress(page), /^2 of \d+ done/);
  });

  test('a short between neighbouring chip pins must not beep', async () => {
    let guard = 0; // skip ahead to the U2 pin 7 / pin 8 pair
    while (!(await pair(page)).startsWith('U2 pin 7 and U2 pin 8') && guard++ < 300) await page.locator('#cont-skip').click();
    assert.match(await page.locator('#continuity-now .cont-expect').textContent(), /must not beep/);
    await page.locator('#cont-beeped').click();
    assert.match(await page.locator('#continuity-faults').textContent(), /Short between U2 pin 7 and U2 pin 8: look for a solder bridge/);
  });

  test('a step says about how many joints it has, keeps your note, and can be printed alone', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    assert.match(await page.locator('#steps .step-joints').textContent(), /^About \d+ solder joints in this step\.$/);
    await openMore(page);
    await page.locator('#step-note').fill('tach wires twisted');
    await page.locator('#step-note').blur();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#step-note'));
    assert.equal(await page.locator('#step-note').inputValue(), 'tach wires twisted');
    await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = document.body.classList.contains('print-step'); }; });
    await page.locator('#step-print').click();
    assert.equal(await page.evaluate(() => window.__printed), true);
  });

  test('"Next step by itself" opens the next step once this one is done', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'The DIP socket' }).click();
    await openMore(page);
    await page.locator('#steps-auto').check();
    await page.locator('#checklist input[data-ref="U2"]').check();
    assert.match(await page.locator('#steps .step-title').textContent(), /^Step 5 of 10/);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
