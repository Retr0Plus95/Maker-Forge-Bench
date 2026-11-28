// Bench as the website serves it (forge.retr0plus.se/bench/, the packed copy from tools/build.mjs),
// through a stand-in for one.com that refuses a visitor's 11th request in progress at once, over
// HTTP/2 like the real host. Straight from src/ the page asked for ~60 scripts together and 42 were
// refused, so it never started; opening the 3D view then asked for 32 models together.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBench } from '../../tools/build.mjs';
import { fakeGithub } from './github-mock.js';
import { copyFixture, FIXTURES, openPage, REPO } from './harness.js';
import { startOneCom } from './onecom.js';

let site;
let browser;
let page;
let problems;

before(async () => {
  const { out } = await buildBench(path.join(await mkdtemp(path.join(os.tmpdir(), 'bench-dist-')), 'bench'));
  const csp = (await readFile(path.join(REPO, 'deploy', 'csp.txt'), 'utf8')).trim();
  site = await startOneCom(out, { csp });
  const repoDir = await copyFixture('fume-extractor');
  await writeFile(path.join(repoDir, 'forge-project.json'), await readFile(path.join(FIXTURES, 'forge-project', 'fume-extractor.json')));
  ({ browser, page, problems } = await openPage(`${site.url}?repo=Retr0Plus95/Solder-Fume-Extractor`, { width: 1400, height: 950 }, {
    realParts: true,
    context: { ignoreHTTPSErrors: true },
    before: (p) => fakeGithub(p, repoDir, 'Retr0Plus95', 'Solder-Fume-Extractor'),
  }));
});

after(async () => {
  await browser?.close();
  await site?.stop();
});

test('the packed Bench starts with a few requests at once, none refused', async () => {
  await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0, null, { timeout: 30000 });
  const stats = await site.stats();
  assert.deepEqual(stats.refused, []);
  assert.ok(stats.peak <= 4, `at most 4 at once (was ${stats.peak})`);
  const scripts = stats.files.filter((f) => f.endsWith('.js'));
  assert.equal(scripts.length, 1, `one script to start: ${scripts.join(', ')}`);
});

test('the 3D view loads every real part, a few models at a time', async () => {
  await page.locator('#board3d-toggle').click();
  await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
  await page.waitForFunction(() => window.makerForge.board3d.info().realParts > 20 && document.querySelector('#board3d-loading').hidden, null, { timeout: 40000 });
  const stats = await site.stats();
  assert.deepEqual(stats.refused, [], 'nothing refused');
  assert.ok(stats.peak <= 6, `at most 6 at once (was ${stats.peak})`);
  const models = stats.files.filter((f) => f.endsWith('.glb'));
  assert.ok(models.length >= 15, `the library's models (18 files for 30 parts) came from the site (${models.length})`);
  assert.deepEqual(problems, []);
});
