// Bench 1.0.1 "At the bench" (docs/design/2026-11-15-release-1.0.1-design.md): bridge risk, mix-up
// warning, tips and tools, joints and solder, waiting parts, sort your parts, the undo toast, the
// buzz, the iron reminder, welcome back and time left.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function fumeProject() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  return dir;
}

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

async function openStepNamed(page, title) {
  await page.locator('#steps .steps-list li button', { hasText: title }).click();
  await page.waitForFunction((t) => document.querySelector('#steps .step-title')?.textContent.includes(t), title);
}

describe('at the bench: reading the board', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('bridge risks are listed in Checks, in the open step and in 3D', async () => {
    assert.equal(await page.locator('#bridge-risks li').count(), 26);
    assert.equal(await page.locator('#bridges-title').textContent(), 'Watch for bridges underneath (26)');
    const j2 = page.locator('#bridge-risks li button', { hasText: 'J2 pin 1 (0 V) is next to the +12 V bus' });
    await j2.click();
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'J2');
    assert.equal(await page.locator('#bridge-risks li[aria-current="true"]').count(), 1);
    await openStepNamed(page, 'The power strip');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /J2 pin 1 \(0 V\) is next to the \+12 V bus: keep the solder on its own pad\./);
    await openStepNamed(page, 'Bare-wire buses');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /The \+5 V bus \(row 18\) and the 0 V bus \(row 19\) run side by side for 17 holes/);
    await openStepNamed(page, 'The DIP socket');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /R4 pin 2 \(RST\) is next to U2 pin 28 \(SCL\)/);
    assert.equal(await page.locator('#board3d-bridges').isChecked(), false);
    await page.locator('#bridges-3d').click();
    await page.waitForFunction(() => !document.querySelector('#board3d').hidden);
    assert.equal(await page.locator('#board3d-bridges').isChecked(), true);
    assert.deepEqual(problems, []);
  });

  test("a resistor easy to mix up with another value says so on both cards", async () => {
    await openCard(page, 'R6');
    assert.equal(await page.locator('#part-card .part-mixup').textContent(), 'Easy to mix up with R5 (1k): brown-black-orange against brown-black-red. Check the third band.');
    await openCard(page, 'R5');
    assert.equal(await page.locator('#part-card .part-mixup').textContent(), 'Easy to mix up with R4 (10k): brown-black-red against brown-black-orange. Check the third band.');
    await openCard(page, 'R2');
    assert.equal(await page.locator('#part-card .part-mixup').count(), 0);
  });

  test('a soldering tip on each card, and tools and tips in the open step', async () => {
    await openCard(page, 'C1A');
    assert.equal(await page.locator('#part-card .part-tip').textContent(), 'Tip: The stripe marks the minus leg (the shorter one). Backwards it can swell or pop, so check before soldering.');
    await openStepNamed(page, 'Insulated links');
    assert.equal(await page.locator('#steps .step-tools').textContent(), 'Have ready: flush cutters, wire strippers.');
    assert.match(await page.locator('#steps .step-tips').textContent(), /Wiring → Wire to cut/);
    await openStepNamed(page, 'Power-up checks');
    assert.equal(await page.locator('#steps .step-tools').textContent(), 'Have ready: multimeter.');
  });

  test('the shopping list says how many joints and how much solder', async () => {
    await page.locator('#shopping-open').click();
    assert.equal(await page.locator('#shopping-solder').textContent(), 'About 163 solder joints: about 2 m of 0.8 mm solder, with some to spare.');
    await page.locator('#shopping-done').click();
  });
});
