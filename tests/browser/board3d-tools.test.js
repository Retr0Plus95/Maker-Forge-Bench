// Bench 0.9 Task 6: saved views, the height check, findings in 3D, GLB and OBJ export, turntable video.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, solidPng, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());
const heights = (page) => page.evaluate(() => window.makerForge.board3d.heights());
const near = (a, b, d = 0.01) => a.every((v, k) => Math.abs(v - b[k]) <= d);

async function openProject({ photo = false } = {}) {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  if (photo) {
    await mkdir(path.join(dir, 'my-board'));
    await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(800, 700));
  }
  const server = await startDevServer(dir);
  const opened = await openPage(server.url, { width: 1400, height: 950 });
  await opened.page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  return { server, ...opened };
}

async function show3D(page) {
  if ((await page.locator('#board3d-toggle').getAttribute('aria-pressed')) !== 'true') await page.locator('#board3d-toggle').click();
  await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
  await nextFrame(page);
}

describe('the 3D board: views, heights and files', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await openProject());
    await show3D(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('a saved view comes back when chosen, and is kept after a reload', async () => {
    await page.locator('#board3d-front').click();
    const at = await page.evaluate(() => window.makerForge.board3d.screenOf('U2'));
    await page.mouse.dblclick(at.x, at.y); // closer in
    const saved = await info(page);
    await page.locator('#board3d-view-name').fill('Front close');
    await page.locator('#board3d-view-save').click();
    await page.locator('#board3d-iso').click();
    assert.ok(!near((await info(page)).camera, saved.camera, 1), 'moved away');
    await page.locator('#board3d-views').selectOption({ label: 'Front close' });
    const back = await info(page);
    assert.ok(near(back.camera, saved.camera), `camera ${back.camera} vs ${saved.camera}`);
    assert.ok(near(back.target, saved.target), `target ${back.target} vs ${saved.target}`);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await show3D(page);
    await page.locator('#board3d-iso').click();
    await page.locator('#board3d-views').selectOption({ label: 'Front close' });
    assert.ok(near((await info(page)).camera, saved.camera), 'kept after a reload');
  });

  test('up to nine saved views; the same name saves over it', async () => {
    for (let k = 1; k <= 9; k++) {
      await page.locator('#board3d-view-name').fill(`View ${k}`);
      await page.locator('#board3d-view-save').click();
    }
    const names = await page.locator('#board3d-views option').evaluateAll((os) => os.filter((o) => o.value).map((o) => o.textContent));
    assert.equal(names.length, 9);
    assert.ok(!names.includes('Front close'), 'the oldest makes way');
    await page.locator('#board3d-view-name').fill('View 9');
    await page.locator('#board3d-view-save').click();
    assert.equal(await page.locator('#board3d-views option[value]:not([value=""])').count(), 9);
  });

  test('the height check: the tallest part on each side, and what pokes through a lid', async () => {
    const h = await heights(page);
    const types = await page.evaluate(async () => {
      const project = await (await fetch('/project/forge-project.json')).json();
      return Object.fromEntries(Object.entries(project.board.parts).map(([ref, p]) => [ref, p.type]));
    });
    const top = Object.entries(h.parts).filter(([, x]) => x.side === 'top');
    assert.equal(h.top.h, Math.max(...top.map(([, x]) => x.h)), 'the tallest on top');
    assert.equal(h.top.ref, 'D1', 'the standing 1N5408 with its loop');
    const box = await page.evaluate(() => window.makerForge.board3d.boxOf(['D1']));
    assert.ok(Math.abs(box.max[1] - h.top.h) < 0.11, `${box.max[1]} vs ${h.top.h}`);
    assert.ok(h.top.h > 8, `${h.top.h} mm`);
    assert.equal(types[h.bottom.ref], 'underside');
    assert.ok(h.bottom.h > 0);
    const tall = Object.entries(h.parts).filter(([, x]) => x.side === 'top' && x.h > 8).map(([ref]) => ref).sort();
    assert.ok(tall.length > 0);
    await page.locator('#board3d-lid').fill('8');
    const i = await info(page);
    assert.equal(i.lid, 8);
    assert.deepEqual([...i.poking].sort(), tall);
    const note = await page.locator('#board3d-lid-note').textContent();
    for (const ref of tall) assert.match(note, new RegExp(`\\b${ref}\\b`));
    assert.match(await page.locator('#board3d-heights').textContent(), new RegExp(`${h.top.ref} ${h.top.h.toFixed(1)} mm`));
    await page.locator('#board3d-lid').fill('');
    assert.equal((await info(page)).lid, null);
    assert.deepEqual((await info(page)).poking, []);
  });

  test('GLB and OBJ files of the board', async () => {
    const [glb] = await Promise.all([page.waitForEvent('download'), page.locator('#board3d-glb').click()]);
    assert.match(glb.suggestedFilename(), /-board\.glb$/);
    const g = await readFile(await glb.path());
    assert.equal(g.subarray(0, 4).toString('latin1'), 'glTF');
    assert.ok(g.length > 10000, `${g.length} bytes`);
    const [obj] = await Promise.all([page.waitForEvent('download'), page.locator('#board3d-obj').click()]);
    assert.match(obj.suggestedFilename(), /-board\.obj$/);
    const text = await readFile(await obj.path(), 'utf8');
    assert.match(text, /^(# |o )/);
    assert.match(text, /^o U2$/m, 'one object per part');
    assert.match(text, /^v -?\d/m);
    assert.match(text, /^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/m);
  });

  test('a turntable video', async () => {
    assert.equal(await page.locator('#board3d-video').isVisible(), true, 'this browser can record WebM');
    const [video] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#board3d-video').click()]);
    assert.match(video.suggestedFilename(), /-board\.webm$/);
    const bytes = await readFile(await video.path());
    assert.ok(bytes.length > 10 * 1024, `${bytes.length} bytes`);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

// lined up with U2 pin 1 at (100,100) and pin 14 at (100,360): hole (c, r) is at x = 100 − 20(r − 13), y = 100 + 20(c − 11)
const px = (c, r) => [100 - 20 * (r - 13), 100 + 20 * (c - 11)];
async function tapAt(page, x, y) {
  const pt = await page.evaluate(([X, Y]) => {
    const img = document.querySelector('#sheet-host').shadowRoot.querySelector('img');
    const r = img.getBoundingClientRect();
    return { x: r.left + (X * r.width) / img.naturalWidth, y: r.top + (Y * r.height) / img.naturalHeight };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}
async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

describe('Check my board in 3D', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await openProject({ photo: true }));
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    await page.locator('#myboard-toggle').click();
    await page.locator('#myboard-line').click();
    await tapAt(page, 100, 100);
    await tapAt(page, 100, 360);
    await openCard(page, 'R8');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8));
    await tapAt(page, ...px(30, 10));
    await openCard(page, 'C10');
    await page.locator('#part-place').click();
    await tapAt(page, ...px(30, 8)); // the + leg in R8 pin 1's hole
    await tapAt(page, ...px(30, 6));
    await page.waitForFunction(() => document.querySelector('#myboard-check li[data-kind="clash"]'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('the clash shows as a mark on your board in 3D; clicking it opens the finding', async () => {
    await show3D(page);
    assert.equal((await info(page)).marks, 0, 'sheet 4 has no findings');
    await page.locator('#board3d-mine').click();
    await page.waitForFunction(() => window.makerForge.board3d.info()?.marks > 0, null, { timeout: 20000 });
    await page.locator('#ptab-guide').click(); // another tab, and another part, first
    await openCard(page, 'J0');
    await nextFrame(page);
    const spot = (await info(page)).markSpots.find((m) => m.id.startsWith('clash'));
    assert.ok(spot, 'a mark for the clash');
    await page.mouse.click(spot.x, spot.y);
    await page.waitForFunction(() => document.querySelector('#myboard-check li[data-kind="clash"][data-open]'));
    assert.equal(await page.evaluate(() => document.querySelector('#part-card h2').firstChild.textContent), 'R8');
    assert.equal(await page.locator('#myboard').isVisible(), true, 'the finding is on screen');
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
