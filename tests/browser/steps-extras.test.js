import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const done = (page) => page.locator('#steps .steps-done').textContent();
const stepButton = (page, text) => page.locator('#steps .steps-list li button', { hasText: text });
const checkMark = (page, text) => page.locator('#steps .steps-list li').filter({ has: page.locator('button', { hasText: text }) }).locator('.step-check');

describe('step progress, Show in 3D, and the checks before power', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#steps .steps-list li').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the steps say how many are done, and a finished step gets a tick', async () => {
    assert.equal(await done(page), '0 of 10 steps done');
    await stepButton(page, 'The DIP socket').click();
    await page.locator('#step-tick-all').click();
    assert.equal(await checkMark(page, 'The DIP socket').count(), 1);
    assert.equal(await done(page), '1 of 10 steps done');
  });

  test('a step with no parts to tick is marked done by hand, and undo takes it back', async () => {
    await stepButton(page, 'Bare-wire buses').click();
    await page.locator('#step-done').check();
    assert.equal(await checkMark(page, 'Bare-wire buses').count(), 1);
    assert.equal(await done(page), '2 of 10 steps done');
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal(await done(page), '1 of 10 steps done');
    await page.keyboard.press('Control+y');
    assert.equal(await done(page), '2 of 10 steps done');
  });

  test('"Show in 3D" opens the 3D board with the step lit', async () => {
    await stepButton(page, 'Fan drive and tach').click();
    await page.locator('#step-3d').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() === 'top', null, { timeout: 15000 });
    assert.equal(await page.locator('#board3d-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#board3d-toggle').click();
  });

  test('before power: the meter checks come from the project, and ticks are kept', async () => {
    const items = await page.locator('#checks li').allTextContents();
    assert.equal(items.length, 4);
    assert.match(items[0], /\+12 V to 0 V must not beep/);
    assert.match(items[3], /\+5 V measures 4\.75 to 5\.25 V/);
    await page.locator('#checks input[data-check="short:P5V"]').check();
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checks li').length > 0);
    assert.equal(await page.locator('#checks input[data-check="short:P5V"]').isChecked(), true);
    assert.equal(await done(page), '2 of 10 steps done', 'hand-marked steps are kept too');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
