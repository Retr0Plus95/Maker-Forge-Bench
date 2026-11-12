import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('connections, holes and build step on the part card', () => {
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

  test('each pin says what it connects to', async () => {
    await openCard(page, 'R8');
    const lines = await page.locator('#part-card .part-connections li').allTextContents();
    assert.ok(lines.includes('pin 2 → TACHA_F: J2 3, R12 1'), lines.join(' | '));
    assert.match(lines[0], /^pin 1 → \+5 V: /);
  });

  test('a connected part is one click away', async () => {
    await page.locator('#part-card .part-connections li', { hasText: 'pin 2' }).locator('button', { hasText: 'R12 1' }).click();
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R12');
  });

  test('the holes on sheet 4, standing parts and underside parts', async () => {
    await openCard(page, 'R8');
    assert.equal(await page.locator('#part-card .part-where').textContent(), 'Where (sheet 4): pin 1 at 26,6 · pin 2 at 26,8');
    assert.equal(await page.locator('#part-card .part-standing').textContent(), 'Standing: body over pin 1');
    assert.equal(await page.locator('#part-card .part-step').textContent(), 'Step 7 of 10: Fan drive and tach');
    await openCard(page, 'C5');
    assert.match(await page.locator('#part-card .part-where').textContent(), /Underneath the board/);
  });

  test('a big net is summed up, not listed in full', async () => {
    await openCard(page, 'R6');
    const ground = (await page.locator('#part-card .part-connections li').allTextContents()).find((l) => l.startsWith('pin 2'));
    assert.match(ground, /^pin 2 → 0 V: (\S+ \S+, ){7}\S+ \S+ … and \d+ more$/);
  });

  test('a part wired to the board but not on it says so', async () => {
    await openCard(page, 'RV1');
    assert.equal(await page.locator('#part-card .part-offboard').textContent(), 'Not on the board (wired to it).');
    assert.equal(await page.locator('#part-card .part-where').count(), 0);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
