import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const tabs = (page) => page.locator('#tabs [role=tab]').allTextContents();
const statusIs = (page, text, timeout = 5000) => page.waitForFunction((t) => document.querySelector('#status').textContent === t, text, { timeout });

describe('a project with forge-project.json', () => {
  let dir; let server; let browser; let page; let problems; let projectText;

  before(async () => {
    dir = await copyFixture('fume-extractor');
    projectText = await readFile(PROJECT, 'utf8');
    await writeFile(path.join(dir, 'forge-project.json'), projectText);
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the tabs use the project\'s sheet titles, in its order', async () => {
    assert.deepEqual(await tabs(page), ['SFE-01 Main schematic', 'SFE-02 Reference', 'SFE-03 USB port',
      'SFE-04 Perfboard layout', 'SFE-D1 Pot detail', 'SFE-parts Printed parts']);
  });

  test('the header shows the project name and revision', async () => {
    const header = await page.locator('#project-name').textContent();
    assert.match(header, /Solder Fume Extractor/);
    assert.match(header, /Rev D/);
    assert.match(await page.title(), /Solder Fume Extractor \(Rev D\)/);
  });

  test('a sheet whose file is missing explains what to check', async () => {
    await page.locator('[role=tab]', { hasText: 'SFE-parts' }).click();
    await page.waitForFunction(() => !document.querySelector('#stage-message').hidden);
    assert.equal(await page.locator('#stage-message').textContent(),
      "SFE-parts Printed parts: images/SFE-parts.jpg isn't in the folder. Check the file name in forge-project.json.");
  });

  test('Find part uses the project\'s sheet names', async () => {
    await page.locator('#find').fill('R6');
    await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
    assert.deepEqual(await page.locator('#find-results button').allTextContents(),
      ['SFE-01 Main schematic: 1', 'SFE-02 Reference: 2', 'SFE-04 Perfboard layout: 1']);
    await page.locator('#find').fill('');
  });

  test('a broken project file is reported, and the project stays as it was', async () => {
    await writeFile(path.join(dir, 'forge-project.json'), '{');
    await page.waitForFunction(() => /^forge-project\.json couldn't be read/.test(document.querySelector('#status').textContent), null, { timeout: 5000 });
    assert.equal((await tabs(page)).length, 6);
  });

  test('a fixed project file is read again, and the tabs follow it', async () => {
    await writeFile(path.join(dir, 'forge-project.json'), projectText.replace('"title": "Reference"', '"title": "Reference sheet"'));
    await page.locator('[role=tab]', { hasText: 'SFE-02 Reference sheet' }).waitFor({ timeout: 5000 });
    assert.equal(/couldn't be read/.test(await page.locator('#status').textContent()), false);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('a project file that is broken from the start', () => {
  test('says so and falls back to the drawings\' file names', async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), '{');
    const server = await startDevServer(dir);
    const { browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 });
    try {
      await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
      assert.match(await page.locator('#status').textContent(), /^forge-project\.json couldn't be read/);
      assert.equal((await tabs(page))[0], 'SFE-01 Schematic');
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
