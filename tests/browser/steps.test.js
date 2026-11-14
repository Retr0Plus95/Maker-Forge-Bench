import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function withProject(edit, run) {
  const dir = await copyFixture('fume-extractor');
  const project = JSON.parse(await readFile(PROJECT, 'utf8'));
  await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify(edit(project)));
  const server = await startDevServer(dir);
  const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
  try {
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
    await run(page, problems, dir);
  } finally {
    await browser.close();
    await server.stop();
  }
}

const stepRings = (page) => page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelectorAll('.bench-step rect').length);

describe('build steps', () => {
  test('one step at a time, with why, parts ringed, and tick all', () => withProject((p) => p, async (page, problems) => {
    assert.equal(await page.locator('#steps .steps-list li').count(), 10);
    await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R8'));
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 7 of 10: Fan drive and tach');
    assert.match(await page.locator('#steps .step-why').textContent(), /pull-up/);
    assert.equal(await page.locator('#steps .step-parts button').count(), 8);
    assert.equal(await stepRings(page), 8);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 8 of 10: The panel side');
    await page.locator('#step-tick-all').click();
    for (const ref of ['R2', 'R3', 'C4', 'J5', 'J4', 'J6']) {
      assert.equal(await page.locator(`#checklist input[data-ref="${ref}"]`).isChecked(), true, ref);
    }
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#checklist input[data-ref="R2"]').isChecked(), false);
    await page.keyboard.press('Shift+Space');
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 7 of 10: Fan drive and tach');
    assert.deepEqual(problems, []);
  }));

  test('the bus, link and bridge steps say what to do in words', () => withProject((p) => p, async (page) => {
    await page.locator('#steps .steps-list li button', { hasText: 'Bare-wire buses' }).click();
    assert.match(await page.locator('#steps .step-what').textContent(), /row 2 \(\+12 V\)/);
    await page.locator('#steps .steps-list li button', { hasText: 'solder bridges' }).click();
    assert.match(await page.locator('#steps .step-what').textContent(), /26,8–26,9/);
  }));

  test('a step naming a part the project does not have says so', () => withProject(
    (p) => ({ ...p, build: [...p.build.slice(0, 9), { ...p.build[9], parts: ['ZZ9'] }] }),
    async (page) => {
      await page.locator('#steps .steps-list li button', { hasText: 'Power-up checks' }).click();
      assert.equal(await page.locator('#steps .step-missing').textContent(), 'Not in this project: ZZ9');
    },
  ));

  test("a step's count leaves out parts the project does not have", () => withProject(
    (p) => ({ ...p, build: [...p.build.slice(0, 9), { ...p.build[9], parts: ['R2', 'ZZ9'] }] }),
    async (page) => {
      assert.equal(await page.locator('#steps .steps-list li').nth(9).locator('.step-count').textContent(), ' 0 of 1 soldered');
    },
  ));

  test('Space works the focused button or tab, not the step', () => withProject((p) => p, async (page, problems) => {
    await page.locator('#steps .steps-list li button', { hasText: 'The panel side' }).click();
    await page.locator('#step-tick-all').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#checklist input[data-ref="R2"]').isChecked(), true, 'Tick all ran');
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 8 of 10: The panel side');
    const tab = page.locator('[role=tab]', { hasText: 'SFE-04' });
    await tab.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.startsWith('SFE-04'));
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 8 of 10: The panel side');
    assert.deepEqual(problems, []);
  }));

  test('Next, Back and the step list keep the keyboard focus', () => withProject((p) => p, async (page) => {
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Fan drive and tach');
    await page.locator('#step-next').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 8 of 10: The panel side');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'step-next');
    await page.locator('#step-back').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'step-back');
  }));

  test('Tick all on a step that is already done adds nothing to undo', () => withProject((p) => p, async (page) => {
    await page.locator('#steps .steps-list li button', { hasText: 'The panel side' }).click();
    await page.locator('#step-tick-all').click();
    await page.locator('#step-tick-all').click();
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#checklist input[data-ref="R2"]').isChecked(), false);
  }));

  test('the open step follows its id when the steps change, and closes when it is gone', () => withProject((p) => p, async (page, problems, dir) => {
    const project = JSON.parse(await readFile(PROJECT, 'utf8'));
    await page.locator('#steps .steps-list li button', { hasText: 'Fan drive and tach' }).click();
    await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify({ ...project, build: [...project.build].reverse() }));
    await page.waitForFunction(() => document.querySelector('#steps .steps-list li button')?.textContent.startsWith('Power-up checks'));
    assert.equal(await page.locator('#steps .step-title').textContent(), 'Step 4 of 10: Fan drive and tach');
    await page.locator('#steps .steps-list li button', { hasText: 'Power-up checks' }).click();
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify({ ...project, build: project.build.slice(0, 5) }));
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length === 5);
    await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
    await page.locator('[role=tab]', { hasText: 'SFE-01' }).click();
    assert.equal(await page.locator('#steps .step-open').count(), 0);
    assert.deepEqual(problems, []);
  }));
});
