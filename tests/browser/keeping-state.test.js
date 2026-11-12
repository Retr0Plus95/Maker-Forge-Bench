// Review fixes for 0.2: saved progress, flips, change notes, tick colouring and missing sheets must
// stay right while the project file and drawings change under an open page.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const tab = (page, text) => page.locator('[role=tab]', { hasText: text });
const progress = (page) => page.locator('#checklist .progress-text').textContent();
const progressIs = (page, text, timeout = 6000) =>
  page.waitForFunction((t) => document.querySelector('#checklist .progress-text')?.textContent === t, text, { timeout });
const ready = async (page) => {
  await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
};
const tick = (page, ref) => page.locator(`#checklist input[data-ref="${ref}"]`).click();
const flippedNow = (page) => page.evaluate(() => Boolean(document.querySelector('#sheet-host').shadowRoot.querySelector('svg > g.bench-flip')));
const labelState = (page, host, text) => page.evaluate(([h, t]) => {
  const el = [...document.querySelector(h).shadowRoot.querySelectorAll('text')].find((e) => e.textContent.replace(/\s+/g, ' ').trim() === t);
  return el ? el.hasAttribute('data-bench-done') : null;
}, [host, text]);

async function withProject(edit, run) {
  const dir = await copyFixture('fume-extractor');
  const text = await readFile(PROJECT, 'utf8');
  const write = (fn = (p) => p) => writeFile(path.join(dir, 'forge-project.json'), JSON.stringify(fn(JSON.parse(text))));
  await write(edit);
  const server = await startDevServer(dir);
  const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
  try {
    await ready(page);
    await run({ dir, page, problems, write });
  } finally {
    await browser.close();
    await server.stop();
  }
}

describe('saved progress follows the project file', () => {
  test('a broken then fixed project file never overwrites the saved progress', () => withProject(undefined, async ({ dir, page, write }) => {
    await tick(page, 'Q1');
    await tick(page, 'R4');
    await progressIs(page, '2 of 37 soldered');
    await writeFile(path.join(dir, 'forge-project.json'), '{');
    await page.waitForFunction(() => /couldn't be read/.test(document.querySelector('#status').textContent), null, { timeout: 6000 });
    await page.reload();
    await ready(page);
    assert.match(await progress(page), /^0 of /);
    await tick(page, 'R6'); // ticked while the project file is broken
    await write();
    await progressIs(page, '2 of 37 soldered');
    assert.equal(await page.locator('#checklist input[data-ref="Q1"]').isChecked(), true);
    await page.reload();
    await ready(page);
    await progressIs(page, '2 of 37 soldered');
  }));

  test('each revision keeps its own progress', () => withProject(undefined, async ({ page, write }) => {
    await tick(page, 'Q1');
    await progressIs(page, '1 of 37 soldered');
    await write((p) => ({ ...p, revision: 'Rev E' }));
    await progressIs(page, '0 of 37 soldered');
    await write();
    await progressIs(page, '1 of 37 soldered');
  }));
});

describe('the second sheet and flips', () => {
  test('side by side shows the sheet unflipped, with current ticks', () => withProject(undefined, async ({ page }) => {
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    await page.locator('#flip').click();
    await tab(page, 'SFE-01').click();
    await page.locator('#split').click();
    await page.waitForFunction(() => document.querySelector('#sheet-host2')?.shadowRoot?.querySelector('svg'));
    assert.equal(await page.locator('#stage2-sheet').inputValue(), 'SFE-04');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#sheet-host2').shadowRoot.querySelector('.bench-flip'))), false);
    await tick(page, 'R6');
    assert.equal(await labelState(page, '#sheet-host2', 'R6'), true);
    await page.locator('#stage2-sheet').selectOption('SFE-01');
    await page.waitForFunction(() => [...document.querySelector('#sheet-host2').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
    assert.equal(await labelState(page, '#sheet-host2', 'R6'), true);
  }));

  test('a flip is only ever applied to a layout sheet', () => withProject(undefined, async ({ page, write }) => {
    const file = Buffer.from(JSON.stringify({ format: 'bench-progress', version: 1, project: 'Solder Fume Extractor', revision: 'Rev D', ticked: [], sheetPrints: {}, flipped: ['SFE-01'] }));
    await page.locator('#progress-open').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: file });
    await page.waitForTimeout(300);
    assert.equal(await flippedNow(page), false, 'the schematic is not mirrored');
    assert.equal(await page.locator('#flip-banner').isVisible(), false);
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    await page.locator('#flip').click();
    assert.equal(await flippedNow(page), true);
    await write((p) => ({ ...p, sheets: p.sheets.map((s) => (s.id === 'SFE-04' ? { ...s, kind: 'detail' } : s)) }));
    await page.waitForFunction(() => document.querySelector('#flip').disabled, null, { timeout: 6000 });
    assert.equal(await flippedNow(page), false, 'no longer a layout, so no longer mirrored');
    assert.equal(await page.locator('#flip-banner').isVisible(), false);
  }));
});

describe('change notes', () => {
  test('a drawing that changes while open gets a note, which stays until marked checked', () => withProject(undefined, async ({ dir, page }) => {
    await tick(page, 'R6');
    const sfe04 = path.join(dir, 'docs', 'layout', 'SFE-04_Perfboard_Layout.svg');
    await writeFile(sfe04, (await readFile(sfe04, 'utf8')).replace('REV D', 'REV D3'));
    const note = 'Sheet SFE-04 Perfboard layout changed since you ticked 1 part: check them.';
    await page.waitForFunction((n) => document.querySelector('#checklist-notes p')?.textContent === n, note, { timeout: 6000 });
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => !document.querySelector('#flip').disabled);
    await page.locator('#flip').click();
    await page.locator('#flip').click();
    await page.reload();
    await ready(page);
    await page.waitForFunction((n) => document.querySelector('#checklist-notes p')?.textContent === n, note, { timeout: 6000 });
    await page.locator('#checklist-notes button').click();
    assert.equal(await page.locator('#checklist-notes p').count(), 0);
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#checklist-notes p').count(), 0);
  }));
});

describe('tick colouring', () => {
  test('a label naming several parts turns green only when all of them are ticked', () => withProject(undefined, async ({ page }) => {
    await tick(page, 'U2');
    await tab(page, 'SFE-04').click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.replace(/\s+/g, ' ').trim() === 'U2 ATmega328P'));
    assert.equal(await labelState(page, '#sheet-host', 'U2 ATmega328P'), true);
    const mixed = await page.evaluate(() => {
      const root = document.querySelector('#sheet-host').shadowRoot;
      return [...root.querySelectorAll('text')].filter((t) => /U2\b/.test(t.textContent) && /\b(R5|Q1|R2|D2)\b/.test(t.textContent))
        .map((t) => t.hasAttribute('data-bench-done'));
    });
    await tab(page, 'SFE-01').click();
    const sentence = await page.evaluate(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')]
      .filter((t) => /^U2 pin 15/.test(t.textContent.trim())).map((t) => t.hasAttribute('data-bench-done')));
    assert.ok(sentence.length > 0, 'the sentence label exists');
    assert.deepEqual([...new Set([...mixed, ...sentence])], [false]);
  }));
});

describe('a sheet whose file appears later', () => {
  test('shows as soon as the file is written', () => withProject(
    (p) => ({ ...p, sheets: [...p.sheets, { id: 'NEW', title: 'New sheet', file: 'docs/new.svg', kind: 'detail' }] }),
    async ({ dir, page, problems }) => {
      await tab(page, 'NEW').click();
      await page.waitForFunction(() => !document.querySelector('#stage-message').hidden);
      await writeFile(path.join(dir, 'docs', 'new.svg'), await readFile(path.join(dir, 'docs', 'layout', 'SFE-D1_Pot_Detail.svg')));
      await page.waitForFunction(() => document.querySelector('#stage-message').hidden &&
        document.querySelector('#sheet-host').shadowRoot.querySelector('svg'), null, { timeout: 6000 });
      assert.equal(await page.locator('#sheet-note').isVisible(), false);
      assert.deepEqual(problems, []);
    },
  ));
});
