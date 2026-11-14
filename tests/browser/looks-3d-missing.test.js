// Bench 0.9 final review: a part's chosen 3D model that isn't here (your own model kept in another
// browser, a project file that's gone, a library model that was renamed) says so in plain words,
// and the part is drawn by Bench meanwhile.
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
const summary = (page) => page.locator('#part-looks-summary').textContent();

describe("looks like: a chosen 3D model that isn't here", () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { realParts: true }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    // a progress file from another computer: R6 uses a model kept there, C4 a project file that's gone,
    // R5 a library model this library doesn't have
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#progress-save').click()]);
    const file = JSON.parse(await readFile(await download.path(), 'utf8'));
    file.looks = { R6: { model: 'own:0123456789abcdef' }, C4: { model: 'project:models/gone.glb' }, R5: { model: 'r-renamed-long-ago' } };
    await page.locator('#progress-open').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.waitForFunction(() => Object.values(localStorage).some((v) => v.includes('own:0123456789abcdef')));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('your own model from another browser: the card says it isn\'t in this browser, not its code', async () => {
    await openCard(page, 'R6');
    const words = await summary(page);
    assert.doesNotMatch(words, /own:|0123456789abcdef/, words);
    assert.match(words, /your own model, not in this browser/i);
    if (!(await page.locator('#part-looks').evaluate((d) => d.open))) await page.locator('#part-looks summary').click();
    assert.match(await page.locator('#look-models-status').textContent(), /isn't in this browser.*Use my own model/i);
    assert.equal(await page.locator('#look-models [aria-pressed="true"]').count(), 1, 'the missing choice shows as chosen');
  });

  test("a project file that's gone, and a library model that isn't in the library, say so too", async () => {
    await openCard(page, 'C4');
    assert.match(await summary(page), /gone\.glb, not found/);
    await openCard(page, 'R5');
    const words = await summary(page);
    assert.doesNotMatch(words, /r-renamed-long-ago/, words);
    assert.match(words, /a model this library doesn't have/i);
  });

  test("the 3D view draws Bench's own part for them meanwhile", async () => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await page.waitForFunction(() => {
      const i = window.makerForge.board3d.info();
      return i && i.loading.total > 0 && i.loading.done === i.loading.total;
    }, null, { timeout: 30000 });
    const i = await page.evaluate(() => window.makerForge.board3d.info());
    assert.ok(!/^own:/.test(i.models.R6 || ''), `R6: ${i.models.R6}`);
    assert.ok(!/^project:/.test(i.models.C4 || ''), `C4: ${i.models.C4}`);
    assert.equal(i.whySimple.R6, "the model didn't load");
    await page.locator('#board3d-toggle').click();
  });

  test('no page errors', () => {
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
  });
});
