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

const pinBox = (page, pin) => page.evaluate((p) => {
  const g = document.querySelector(`#pin-view [data-pin="${p}"]`);
  const body = document.querySelector('#pin-view .pin-body').getBoundingClientRect();
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, mid: body.left + body.width / 2, label: g.querySelector('.pin-label')?.textContent };
}, pin);

describe('the chip pin view', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('two-legged parts have no pin view', async () => {
    await openCard(page, 'R8');
    assert.equal(await page.locator('#part-pins').count(), 0);
  });

  test("the chip's 28 pins, each with its line, pin 1 top left seen from the top", async () => {
    await openCard(page, 'U2');
    await page.locator('#part-pins').click();
    assert.equal(await page.locator('#pin-view [data-pin]').count(), 28);
    const one = await pinBox(page, '1');
    assert.ok(one.x < one.mid, 'pin 1 on the left');
    assert.equal((await pinBox(page, '7')).label, '+5 V');
    assert.equal((await pinBox(page, '8')).label, '0 V');
    assert.equal((await pinBox(page, '28')).label, 'SCL');
    assert.match(await page.locator('#pin-view .pin-caption').textContent(), /top/i);
  });

  test('underneath, pin 1 moves to the right, and the choice is remembered', async () => {
    await page.locator('#pins-under').click();
    const one = await pinBox(page, '1');
    assert.ok(one.x > one.mid, 'pin 1 on the right');
    assert.match(await page.locator('#pin-view .pin-caption').textContent(), /underneath/i);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await openCard(page, 'U2');
    await page.locator('#part-pins').click();
    assert.ok((await pinBox(page, '1')).x > (await pinBox(page, '1')).mid, 'still underneath after a reload');
    await page.locator('#pins-top').click();
  });

  test('clicking a pin says what it connects to, with its wired tick', async () => {
    await page.locator('#pin-view [data-pin="7"]').click();
    assert.match(await page.locator('#pin-info').textContent(), /^pin 7 → \+5 V: /);
    await page.locator('#pin-info input[data-wire="U2:7"]').check();
    assert.equal(await page.locator('#part-card .part-connections input[data-wire="U2:7"]').isChecked(), true);
    assert.equal(await page.locator('#pin-view [data-pin="7"]').getAttribute('data-wired'), 'true');
    await page.locator('#pin-view [data-pin="20"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#pin-info').textContent(), /^pin 20 → \+5 V/);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
