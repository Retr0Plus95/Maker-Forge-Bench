import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const ringIn = (page, host) => page.evaluate((h) => Boolean(document.querySelector(h)?.shadowRoot?.querySelector('.bench-highlight rect')), host);

describe('two sheets side by side', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('side by side opens the layout next to the schematic', async () => {
    await page.locator('#split').click();
    await page.waitForFunction(() => document.querySelector('#sheet-host2')?.shadowRoot?.querySelector('svg'));
    assert.equal(await page.locator('#stage2').isVisible(), true);
    assert.equal(await page.locator('#stage2-sheet').inputValue(), 'SFE-04');
    assert.equal(await page.locator('#split').getAttribute('aria-pressed'), 'true');
    const { a, b } = await page.evaluate(() => ({
      a: document.querySelector('#stage').getBoundingClientRect().toJSON(),
      b: document.querySelector('#stage2').getBoundingClientRect().toJSON(),
    }));
    assert.ok(b.left >= a.right - 1, 'the second sheet is beside the first');
  });

  test('a found part is ringed in both sheets', async () => {
    await page.locator('#find').fill('R6');
    await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
    await page.locator('#find').press('Enter');
    await page.waitForFunction(() => document.querySelector('#sheet-host2').shadowRoot.querySelector('.bench-highlight rect'));
    assert.equal(await ringIn(page, '#sheet-host'), true);
    assert.equal(await ringIn(page, '#sheet-host2'), true);
  });

  test('the second sheet can be changed, and keeps the ring', async () => {
    await page.locator('#stage2-sheet').selectOption('SFE-02');
    await page.waitForFunction(() => [...document.querySelector('#sheet-host2').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.includes('R6')));
    await page.waitForFunction(() => document.querySelector('#sheet-host2').shadowRoot.querySelector('.bench-highlight rect'));
  });

  test('on a narrow window side by side is off and explains why', async () => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForFunction(() => document.querySelector('#split').disabled);
    assert.equal(await page.locator('#split').getAttribute('title'), 'Side by side needs a wider window (1000 px or more).');
    assert.equal(await page.locator('#stage2').isVisible(), false);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
