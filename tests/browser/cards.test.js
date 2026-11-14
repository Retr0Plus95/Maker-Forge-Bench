import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const tab = (page, text) => page.locator('[role=tab]', { hasText: text });
const card = (page) => page.locator('#part-card').textContent();
const shownSvg = (page) => page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));

/** Clicks the label whose text is exactly `text` on the sheet on screen. */
async function clickLabel(page, text) {
  await nextFrame(page);
  const { x, y } = await page.evaluate((t) => {
    const el = [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].find((e) => e.textContent.trim() === t);
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }, text);
  await page.mouse.click(x, y);
}

async function findAndJump(page, query) {
  await page.locator('#find').fill(query);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
}

async function projectFolder(edit = (p) => p) {
  const dir = await copyFixture('fume-extractor');
  const project = edit(JSON.parse(await readFile(PROJECT, 'utf8')));
  await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify(project));
  return dir;
}

describe('part cards on the fume extractor', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await projectFolder());
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await shownSvg(page);
    await page.waitForFunction(() => document.querySelector('#live').textContent !== '');
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('clicking a part on the drawing shows what it is and why', async () => {
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
    await clickLabel(page, 'R6');
    await page.waitForFunction(() => document.querySelector('#part-card h2'));
    const text = await card(page);
    assert.match(text, /R6/);
    assert.match(text, /10k/);
    assert.match(text, /fail-safe/);
  });

  test('tabs with the part get a dot, and the card lists those sheets', async () => {
    const dotted = await page.locator('[role=tab][data-has-part]').allTextContents();
    assert.deepEqual(dotted, ['SFE-01 Main schematic', 'SFE-02 Reference', 'SFE-04 Perfboard layout']);
    assert.deepEqual(await page.locator('#part-card .part-sheets button').allTextContents(), dotted);
  });

  test('a sheet in the card opens that sheet with the part ringed', async () => {
    await page.locator('#part-card .part-sheets button', { hasText: 'SFE-02' }).click();
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]').textContent.startsWith('SFE-02'));
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('.bench-highlight rect'));
  });

  test('finding a part opens its card, with its polarity warning', async () => {
    await findAndJump(page, 'q1');
    await page.waitForFunction(() => /Q1/.test(document.querySelector('#part-card h2')?.textContent || ''));
    assert.match(await page.locator('#part-card .part-polarity').textContent(), /Flat face toward row 16/);
  });

  test("the datasheet button opens the manufacturer's page in a new tab", async () => {
    await findAndJump(page, 'U2');
    await page.waitForFunction(() => /U2/.test(document.querySelector('#part-card h2')?.textContent || ''));
    const link = page.locator('#part-datasheet');
    assert.equal(await link.getAttribute('href'), 'https://www.microchip.com/en-us/product/ATmega328P');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.match(await link.getAttribute('rel'), /noopener/);
  });

  test('Esc closes the card', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#part-card h2').count(), 0);
    assert.equal(await page.locator('[role=tab][data-has-part]').count(), 0);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('datasheet files and guessed parts', () => {
  test('a datasheet kept in the project folder opens from there', async () => {
    const dir = await projectFolder((p) => {
      p.parts.find((x) => x.ref === 'R4').datasheetFile = 'docs/ds/x.pdf';
      return p;
    });
    await mkdir(path.join(dir, 'docs', 'ds'), { recursive: true });
    await writeFile(path.join(dir, 'docs', 'ds', 'x.pdf'), '%PDF-1.4\n%%EOF\n');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await shownSvg(page);
      await findAndJump(page, 'R4');
      await page.waitForFunction(() => /R4/.test(document.querySelector('#part-card h2')?.textContent || ''));
      assert.match(await page.locator('#part-datasheet').getAttribute('href'), /^\/project\/docs\/ds\/x\.pdf/);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('without a project file, a clicked part is marked as guessed', async () => {
    const server = await startDevServer(await copyFixture('fume-extractor'));
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await shownSvg(page);
      await tab(page, 'SFE-04').click();
      await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
      await page.waitForFunction(() => document.querySelector('#live').textContent !== '');
      await page.waitForTimeout(500); // the other sheets are read in the background, then parts are guessed
      await clickLabel(page, 'R6');
      await page.waitForFunction(() => document.querySelector('#part-card .part-guessed'));
      assert.match(await page.locator('#part-card .part-guessed').textContent(), /Guessed from the drawing/);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
