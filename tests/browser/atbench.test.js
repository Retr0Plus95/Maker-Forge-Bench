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
});
