// Bench 1.0 Task 6: Send to Shape, from the Menu and the 3D view. Shape's Your parts is
// localStorage 'makerforge.parts' on forge.retr0plus.se, so the page is served there by routing.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, fromMenu, nextFrame, openPage, routeHost, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const SHAPE = 'https://forge.retr0plus.se';
const vp = { width: 1400, height: 950 };
const ready = (page) => page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0, null, { timeout: 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('makerforge.parts') || 'null'));
const note = (page) => page.locator('#shape-send-note').textContent();

async function project() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  return startDevServer(dir);
}

async function openDialog(page) {
  await fromMenu(page, '#menu-shape');
  await page.waitForFunction(() => document.querySelector('#shape-send')?.open);
}

async function closeDialog(page) {
  await page.locator('#shape-send-done').click();
  await page.waitForFunction(() => !document.querySelector('#shape-send').open);
}

describe('Send to Shape, on this computer', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await project();
    ({ browser, page, problems } = await openPage(server.url, vp));
    await ready(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('on this computer, the dialog says where it works and sends nothing', async () => {
    await openDialog(page);
    assert.match(await note(page), /works on forge\.retr0plus\.se/);
    assert.equal(await page.locator('#shape-send-go').isDisabled(), true);
    assert.ok(Number(await page.locator('#shape-send-go').evaluate((x) => getComputedStyle(x).opacity)) < 1, "a Send that can't send looks it");
    assert.equal(await page.evaluate(() => localStorage.getItem('makerforge.parts')), null);
    await closeDialog(page);
  });

  test('no page errors', () => assert.deepEqual(problems, []));
});

describe('Send to Shape, at forge.retr0plus.se', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await project();
    ({ browser, page, problems } = await openPage(`${SHAPE}/bench/`, vp, { before: (p) => routeHost(p, SHAPE, server.url, '/bench') }));
    await ready(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("at forge.retr0plus.se it puts the board in Shape's Your parts", async () => {
    await openDialog(page);
    assert.equal(await page.locator('#shape-name').inputValue(), 'Solder Fume Extractor');
    assert.equal(await page.locator('#shape-w').inputValue(), '81.3');
    assert.equal(await page.locator('#shape-d').inputValue(), '53.3');
    assert.ok(Number(await page.locator('#shape-tall').inputValue()) >= 5, 'a height from Bench\'s own drawing: the 3D view was never opened (Review Focus 5)');
    assert.equal(await page.locator('#shape-send-go').isDisabled(), false);
    await page.locator('#shape-holes').selectOption('corners');
    await page.locator('#shape-send-go').click();
    const list = await stored(page);
    assert.equal(list.length, 1);
    const b = list[0];
    assert.match(b.id, /^bn[a-z0-9]{6}$/);
    assert.deepEqual([b.w, b.d, b.holes.length, b.screw, b.ports, b.panel], [81.3, 53.3, 4, 'M3', [], []]);
    assert.match(await note(page), /^Sent: Solder Fume Extracto is in Shape's Your parts\./, 'the label as Shape keeps it: 20 characters at most');
    const wires = await page.locator('#shape-wires').textContent();
    assert.ok(/\bJ0\b/.test(wires) && /\bJ2\b/.test(wires), wires);
    assert.equal(await page.locator('#shape-open').isVisible(), true);
    assert.equal(await page.locator('#shape-open').getAttribute('href'), 'https://forge.retr0plus.se/');
    await closeDialog(page);
  });

  test("sending again replaces the board, it doesn't add a copy", async () => {
    await openDialog(page);
    await page.locator('#shape-send-go').click();
    await page.locator('#shape-send-go').click();
    assert.equal((await stored(page)).length, 1);
    assert.match(await note(page), /^Updated:/);
    await closeDialog(page);
  });

  test('renaming it for Shape still replaces the same board', async () => {
    await openDialog(page);
    await page.locator('#shape-name').fill('Fume box');
    await page.locator('#shape-send-go').click();
    const list = await stored(page);
    assert.deepEqual(list.map((b) => b.label), ['Fume box']);
    assert.match(await note(page), /^Updated: Fume box is in Shape's Your parts\./);
    await closeDialog(page);
  });

  test('holes typed in: pairs off the board are left out, and the note says how many', async () => {
    await openDialog(page);
    await page.locator('#shape-holes').selectOption('typed');
    await page.locator('#shape-holes-typed').fill('3,3; 78,3; 500,2; oops');
    await page.locator('#shape-send-go').click();
    assert.deepEqual((await stored(page))[0].holes, [[3, 3], [78, 3]]);
    assert.match(await note(page), /2 holes? left out/);
    await closeDialog(page);
  });

  test("holes too far in from the corners aren't sent; a size past Shape's 300 mm is said", async () => {
    const was = JSON.stringify(await stored(page));
    await openDialog(page);
    await page.locator('#shape-holes').selectOption('corners');
    await page.locator('#shape-inset').fill('30');
    await page.locator('#shape-send-go').click();
    assert.equal(await note(page), "Not sent. Holes 30 mm in from each corner don't fit a 81.3 × 53.3 mm board: use less than 26.65 mm.");
    assert.equal(JSON.stringify(await stored(page)), was, 'nothing written');
    assert.equal(await page.locator('#shape-open').isVisible(), false);
    await page.locator('#shape-inset').fill('3');
    await page.locator('#shape-w').fill('400');
    await page.locator('#shape-send-go').click();
    assert.match(await note(page), /Shape takes boards 5 to 300 mm, so the width is sent as 300 mm \(not 400\)\./);
    assert.equal((await stored(page))[0].w, 300);
    await closeDialog(page);
  });

  test('a full Your parts says so and adds nothing', async () => {
    await page.evaluate(() => localStorage.setItem('makerforge.parts', JSON.stringify(Array.from({ length: 40 }, (_, k) => (
      { id: `zz${String(k).padStart(4, '0')}`, label: `Other ${k}`, w: 50, d: 40, holes: [], screw: 'M3', tall: 10, ports: [], panel: [] })))));
    await openDialog(page);
    await page.locator('#shape-send-go').click();
    assert.match(await note(page), /full \(40 boards\)/);
    assert.equal((await stored(page)).length, 40);
    assert.equal(await page.locator('#shape-open').isVisible(), false);
    await closeDialog(page);
  });

  test("the 3D view's button opens the same dialog, with the 3D view's height", async () => {
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    await nextFrame(page);
    await page.locator('#board3d-shape').click();
    await page.waitForFunction(() => document.querySelector('#shape-send')?.open);
    const top = await page.evaluate(() => window.makerForge.board3d.heights().top.h);
    assert.equal(Number(await page.locator('#shape-tall').inputValue()), Math.ceil(top));
    await closeDialog(page);
  });

  test('no page errors', () => assert.deepEqual(problems, []));
});
