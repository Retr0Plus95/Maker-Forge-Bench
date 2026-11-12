import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

describe('Ask Claude', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 800 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await page.locator('[role=tab]', { hasText: 'SFE-04' }).click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R6'));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[type=checkbox]').length > 0);
    await nextFrame(page);
    const { x, y } = await page.evaluate(() => {
      const el = [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].find((t) => t.textContent.trim() === 'R6');
      const r = el.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => /R6/.test(document.querySelector('#part-card h2')?.textContent || ''));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the Claude app can read the selection from the page', async () => {
    const ctx = await page.evaluate(() => window.makerForge.context());
    assert.equal(ctx.app, 'bench');
    assert.equal(ctx.project, 'Solder Fume Extractor');
    assert.equal(ctx.part.ref, 'R6');
    assert.match(ctx.part.role, /fail-safe/);
    assert.equal(ctx.onSheets.length, 3);
    assert.ok(Array.isArray(ctx.nearbyText) && ctx.nearbyText.length > 0 && ctx.nearbyText.length <= 8);
    assert.ok(!ctx.nearbyText.includes('R6'));
    assert.equal(await page.evaluate(() => Object.isFrozen(window.makerForge)), true);
  });

  test('Copy for Claude puts the question and the part on the clipboard', async () => {
    await page.locator('#ask-question').fill('Why is R6 there?');
    await page.locator('#ask-copy').click();
    await page.waitForFunction(() => document.querySelector('#ask-done').textContent === 'Copied');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^Question: Why is R6 there\?/);
    assert.match(clip, /fail-safe/);
    assert.match(clip, /On sheets: SFE-01 Main schematic/);
  });

  test('Open claude.ai copies and opens a new chat', async () => {
    await page.evaluate(() => {
      window.__opened = [];
      window.open = (...args) => { window.__opened.push(args); return null; };
    });
    await page.locator('#ask-open').click();
    await page.waitForFunction(() => window.__opened.length === 1);
    const [url, target, features] = await page.evaluate(() => window.__opened[0]);
    assert.equal(url, 'https://claude.ai/new');
    assert.equal(target, '_blank');
    assert.match(features, /noopener/);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
