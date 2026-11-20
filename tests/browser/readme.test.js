// Bench 1.0.4 "How to build it" (docs/design/2026-11-20-release-1.0.4-design.md): the project's README shown
// as steps to tick, each with its wires and a picture cut from the drawing, behind a mains safety list.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const text = (page, sel) => page.locator(sel).textContent();
const step = (id) => `.readme-step[data-step="readme:${id}"]`;
const rings = (page) => page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-net rect').length);

describe('how to build it, from the README', () => {
  let server; let browser; let page; let problems; let dir;

  before(async () => {
    dir = await copyFixture('psu-like');
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelector('#readme-progress') && document.querySelector(`.readme-step[data-step="readme:wiring:1"] .readme-crop`));
    await page.waitForFunction(() => document.querySelector('#live')?.textContent.startsWith('Auto-refresh on'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("the README's build sections are steps, in its order, each with the drawing's wires it's about", async () => {
    assert.equal(await text(page, '#readme h2'), 'How to build it (README)');
    assert.match(await text(page, '#readme-progress'), /^0 of 9 steps done, read from README\.md$/);
    const titles = await page.locator('#readme .readme-section > h3').allTextContents();
    assert.deepEqual(titles, ['Wiring', 'Assembly order', 'First power-up', 'Troubleshooting']);
    const wires = (id) => page.locator(`${step(id)} .readme-wire`).evaluateAll((els) => els.map((e) => e.dataset.wire));
    assert.deepEqual(await wires('wiring:1'), ['W1', 'W2', 'W3']);
    assert.deepEqual(await wires('wiring:2'), ['W7', 'W8']);
    assert.match(await text(page, `${step('wiring:2')} .readme-wire[data-wire="W7"]`), /W7 TB1 out → U1 AC24V input \(by AC24V\)/);
    assert.match(await text(page, `${step('wiring:4')} .readme-step-body`), /thin black → board OUT − as well, not ground/);
    assert.equal(await page.locator(`${step('wiring:4')} strong`).first().textContent(), 'Meter (the trap):');
  });

  test("a step's picture is the drawing cut to its wires; clicking it rings them on the drawing, again hides them", async () => {
    const img = page.locator(`${step('wiring:1')} img.readme-crop`);
    assert.match(await img.getAttribute('src'), /wiring\.svg\?v=[^#]+#svgView\(viewBox\([\d.]+,[\d.]+,[\d.]+,[\d.]+\)\)$/);
    await page.waitForFunction((sel) => document.querySelector(sel)?.naturalWidth > 0, `${step('wiring:1')} img.readme-crop`);
    const show = page.locator(`${step('wiring:1')} .readme-crop-show`);
    await show.click();
    await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', `${step('wiring:1')} .readme-crop-show`);
    await nextFrame(page);
    assert.ok((await rings(page)) >= 4, 'three wire tags and the parts at their ends');
    await page.locator(`${step('wiring:1')} .readme-crop-show`).click();
    await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'false', `${step('wiring:1')} .readme-crop-show`);
    assert.equal(await rings(page), 0);
  });

  test("mains comes after the safety list, with the README's own safety words as text, never markup", async () => {
    assert.equal(await text(page, '#readme-safety h3'), 'Before the mains work (0 of 7)');
    assert.equal(await page.locator('#readme-safety-list li').count(), 7);
    assert.equal(await text(page, `${step('wiring:1')} .readme-mains`), 'Mains: tick the safety list first.');
    assert.equal(await page.locator(`${step('wiring:3')} .readme-mains`).count(), 0, 'only mains steps');
    const safety = await text(page, '#readme-safety');
    assert.match(safety, /From the README: Safety/);
    assert.match(safety, /<script>alert\(1\)<\/script>/);
    assert.match(safety, /\[picture: A web picture\]/);
    assert.equal(await page.locator('#readme script, #readme img[src^="https:"]').count(), 0);
    for (const box of await page.locator('#readme-safety-list input').all()) await box.check();
    await page.waitForFunction(() => document.querySelector('#readme-safety h3')?.textContent === 'Before the mains work (7 of 7)');
    assert.equal(await page.locator('.readme-mains').count(), 0);
  });

  test("what's wrong or missing is listed, and Not needed puts one away", async () => {
    const ids = () => page.locator('#readme-needs-list .wire-need').evaluateAll((els) => els.map((e) => e.dataset.need));
    assert.deepEqual(await ids(), ['readme:wire:readme:wiring:5:W22', 'readme:pic:images/buck.png', 'readme:left']);
    assert.match(await text(page, '#readme-needs'), /No step mentions W18\. It's in the Wiring tab\./);
    assert.match(await text(page, step('wiring:5')), /picture images\/buck\.png isn't in the folder/);
    await page.locator('.wire-need[data-need="readme:pic:images/buck.png"] .wire-need-dismiss').click();
    await page.waitForFunction(() => !document.querySelector('.wire-need[data-need="readme:pic:images/buck.png"]'));
  });

  test('ticking a step counts it and says so; Undo takes it back; it stays ticked after a reload', async () => {
    await page.locator(`${step('wiring:3')} input[data-step]`).check();
    await page.waitForFunction(() => /^1 of 9/.test(document.querySelector('#readme-progress')?.textContent));
    assert.equal(await text(page, '#toast-text'), 'Step 3 done');
    await page.locator('#undo').click();
    await page.waitForFunction(() => /^0 of 9/.test(document.querySelector('#readme-progress')?.textContent));
    await page.locator(`${step('wiring:3')} input[data-step]`).check();
    await page.waitForFunction(() => /^1 of 9/.test(document.querySelector('#readme-progress')?.textContent));
    await page.reload();
    await page.waitForFunction(() => /^1 of 9/.test(document.querySelector('#readme-progress')?.textContent || ''));
    assert.equal(await page.locator(`${step('wiring:3')} input[data-step]`).isChecked(), true);
    assert.equal(await text(page, '#readme-safety h3'), 'Before the mains work (7 of 7)');
  });

  test("a step's wire ticks the same as the Wires list's", async () => {
    await page.locator(`${step('wiring:3')} input[data-wire="W9"]`).check();
    await page.waitForFunction(() => /^1 of 9 wires/.test(document.querySelector('#wires-progress')?.textContent));
    assert.equal(await page.locator('.drawn-wire[data-wire="W9"] input[type=checkbox]').isChecked(), true);
  });

  test('Only not done hides the steps done', async () => {
    await page.locator('#readme-open-only').check();
    assert.equal(await page.locator(step('wiring:3')).count(), 0);
    await page.locator('#readme-open-only').uncheck();
    assert.equal(await page.locator(step('wiring:3')).count(), 1);
  });

  test('a README changed on disk is read again', async () => {
    const file = path.join(dir, 'README.md');
    const md = await readFile(file, 'utf8');
    await writeFile(file, md.replace('\n> **Can the fan', '6. **Last:** the leg wire (W18).\n\n> **Can the fan'));
    await page.waitForFunction(() => document.querySelector('.readme-step[data-step="readme:wiring:6"]'), null, { timeout: 10000 });
    assert.equal(await page.locator('.wire-need[data-need="readme:left"]').count(), 0, 'every wire is in a step now');
    assert.match(await text(page, '#readme-progress'), /^1 of 10 steps/);
    assert.deepEqual(problems, []);
  });
});
