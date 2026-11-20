// Bench 1.0.3 "Wires from the drawing" (docs/design/2026-11-20-release-1.0.3-design.md): a drawing
// with no project, its labels kept as comments the way matplotlib saves them. Bench reads its wire
// table, checks and notes, lists the wires mains first, says what's missing and asks what it needs.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const text = (page, sel) => page.locator(sel).textContent();
const needIds = (page) => page.locator('#wire-needs-list .wire-need').evaluateAll((els) => els.map((e) => e.dataset.need));

describe('wires from the drawing', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await copyFixture('psu-like'));
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelector('#wires-progress'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the wire table is read into a list to tick, mains first, with its notes beside each wire', async () => {
    assert.equal(await text(page, '#wires h2'), 'Wires');
    assert.match(await text(page, '#wires-progress'), /^0 of 9 wires done, read from /);
    assert.equal(await text(page, '.drawn-wires-mains'), 'Mains: unplug before touching');
    const mains = await page.locator('.drawn-wires-danger .drawn-wire').evaluateAll((els) => els.map((e) => e.dataset.wire));
    assert.deepEqual(mains, ['W1', 'W2', 'W3']);
    const w9 = page.locator('.drawn-wire[data-wire="W9"]');
    assert.match(await w9.locator('label').textContent(), /W9 U1 OUT \+ → J1 \+ red post/);
    assert.match(await w9.locator('.drawn-wire-extra').textContent(), /0\.5 mm² red · up to 0\.7 A/);
    assert.match(await page.locator('.drawn-wire[data-wire="W7"] .drawn-wire-note').textContent(), /^Note 4: Which AC24V screws\?/);
  });

  test("what's wrong or missing in the drawing is listed in plain words, the note's question first to answer", async () => {
    assert.equal(await text(page, '#wire-needs h3'), 'Bench needs 6 things');
    assert.deepEqual(await needIds(page), ['undrawn:wiring:Q9', 'notag:wiring', 'extratag:wiring', 'ask:wiring:4', 'tpcheck:wiring', 'reading:wiring:TP2']);
    assert.equal(await page.locator('.wire-need-claude').count(), 0, 'a drawing Bench can read never sends you to Claude');
  });

  test('an answer is kept with the wires that note is about, and Undo takes it back', async () => {
    const ask = page.locator('.wire-need[data-need="ask:wiring:4"]');
    await ask.locator('.wire-need-input').fill('left and middle screws');
    await ask.locator('button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('.wire-need[data-need="ask:wiring:4"]'));
    assert.equal(await text(page, '#wire-needs h3'), 'Bench needs 5 things');
    for (const w of ['W7', 'W8']) {
      assert.equal(await text(page, `.drawn-wire[data-wire="${w}"] .drawn-wire-answer`), 'Your answer to note 4: left and middle screws');
    }
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('.wire-need[data-need="ask:wiring:4"]'));
    assert.equal(await page.locator('.drawn-wire-answer').count(), 0);
  });

  test('Not needed puts a need away', async () => {
    await page.locator('.wire-need[data-need="notag:wiring"] .wire-need-dismiss').click();
    await page.waitForFunction(() => !document.querySelector('.wire-need[data-need="notag:wiring"]'));
    assert.equal(await text(page, '#wire-needs h3'), 'Bench needs 5 things');
  });

  test('ticking a wire counts it, says so, and is still ticked after a reload', async () => {
    await page.locator('.drawn-wire[data-wire="W9"] input[type=checkbox]').check();
    await page.waitForFunction(() => /^1 of 9/.test(document.querySelector('#wires-progress')?.textContent));
    assert.equal(await text(page, '#toast-text'), 'W9 wired');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#wires-progress'));
    assert.match(await text(page, '#wires-progress'), /^1 of 9/);
    assert.equal(await page.locator('.drawn-wire[data-wire="W9"] input[type=checkbox]').isChecked(), true);
    assert.equal(await page.locator('.wire-need[data-need="notag:wiring"]').count(), 0, 'what you put away stays away');
  });

  test('Only not done hides the wires done', async () => {
    await page.locator('#wires-open-only').check();
    assert.equal(await page.locator('.drawn-wire[data-wire="W9"]').count(), 0);
    assert.equal(await page.locator('.drawn-wire').count(), 8);
    await page.locator('#wires-open-only').uncheck();
    assert.equal(await page.locator('.drawn-wire').count(), 9);
  });

  test('Show rings the wire on the drawing; again hides it', async () => {
    const show = page.locator('.drawn-wire[data-wire="W9"] .drawn-wire-show');
    await show.click();
    await page.waitForFunction(() => document.querySelector('.drawn-wire[data-wire="W9"] .drawn-wire-show')?.getAttribute('aria-pressed') === 'true');
    await nextFrame(page);
    const rings = () => page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-net rect').length);
    assert.ok((await rings()) >= 2, 'its tag and the parts at its ends');
    await page.locator('.drawn-wire[data-wire="W9"] .drawn-wire-show').click();
    await page.waitForFunction(() => document.querySelector('.drawn-wire[data-wire="W9"] .drawn-wire-show')?.getAttribute('aria-pressed') === 'false');
    assert.equal(await rings(), 0);
  });

  test("the drawing's checks are listed in its own order, and ticking one counts", async () => {
    const keys = await page.locator('.drawn-checks li').evaluateAll((els) => els.map((e) => e.dataset.key));
    assert.deepEqual(keys, ['OFF', 'TP1', 'TP2', 'LIMIT']);
    assert.equal(await text(page, '#checks h2'), 'Checks from the drawing');
    await page.locator('.drawn-checks li[data-key="OFF"] input[type=checkbox]').check();
    await page.waitForFunction(() => document.querySelector('.drawn-checks li[data-key="OFF"] input')?.checked);
    assert.equal(await page.locator('.drawn-checks li[data-key="TP1"] .drawn-check-show').count(), 1, 'a test point has Show');
  });

  test('Copy as text and Then the checks are there; nothing went wrong on the page', async () => {
    assert.equal(await page.locator('#wires-copy').count(), 1);
    assert.equal(await page.locator('#wires-checks').count(), 1);
    assert.deepEqual(problems, []);
  });
});

describe('wires from the drawing, in a folder with a project file', () => {
  let server; let browser; let page; let problems; let dir;

  before(async () => {
    dir = await copyFixture('psu-like');
    await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify({
      format: 'forge-project', version: 1, name: 'PSU-like', revision: 'A',
      sheets: [{ id: 'wiring', title: 'Wiring', file: 'wiring.svg', kind: 'schematic' }],
    }));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelector('#wires-progress'));
    await page.waitForFunction(() => document.querySelector('#live')?.textContent.startsWith('Auto-refresh on'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('a drawing changed on disk is read again', async () => {
    assert.equal(await page.locator('.drawn-wire[data-wire="W18"]').count(), 1);
    const file = path.join(dir, 'wiring.svg');
    await writeFile(file, (await readFile(file, 'utf8')).replace('<!-- 18 -->', '<!-- 19 -->'));
    await page.waitForFunction(() => document.querySelector('.drawn-wire[data-wire="W19"]'), null, { timeout: 10000 });
    assert.equal(await page.locator('.drawn-wire[data-wire="W18"]').count(), 0);
    assert.deepEqual(problems, []);
  });
});
