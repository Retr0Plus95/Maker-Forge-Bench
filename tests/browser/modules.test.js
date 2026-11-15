// Bench 1.0: Shape's boards and modules in the Maker Forge Library (design §3). A module part is
// matched by its value, drawn in 3D at its real size, described on its card and offered in Looks like.
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

describe("modules from Shape's list", () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    const project = JSON.parse(await readFile(PROJECT, 'utf8'));
    project.parts.find((p) => p.ref === 'U1').value = 'Arduino Nano Every'; // the buck module's place, a Nano in it
    await writeFile(path.join(dir, 'forge-project.json'), JSON.stringify(project));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { realParts: true }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the card says what the module is', async () => {
    await openCard(page, 'U1');
    await page.waitForFunction(() => document.querySelector('#part-module'), null, { timeout: 20000 });
    assert.equal(await page.locator('#part-module').textContent(), 'Module: 45 × 18 mm, no mounting holes, mini-USB on the left edge.');
  });

  test("Looks like lists modules by Shape's groups", async () => {
    if (!(await page.locator('#part-looks').evaluate((d) => d.open))) await page.locator('#part-looks summary').click();
    const groups = await page.locator('#look-models .look-models-group').allTextContents();
    assert.ok(groups.includes('Arduino') && groups.includes('ESP32 and ESP8266'), groups.join(' | '));
    assert.equal(await page.locator('#look-models [data-model="mod-nano"]').count(), 1);
  });

  test('the 3D view draws the Nano', async () => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.waitForFunction(() => window.makerForge.board3d.info()?.models.U1 === 'mod-nano', null, { timeout: 30000 });
  });

  test('no page errors', () => {
    assert.deepEqual(problems, []);
  });
});
