// Bench 0.9 Task 5: board colours, your progress and polarity in 3D, the camera follows the guide and Find.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, nextFrame, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const info = (page) => page.evaluate(() => window.makerForge.board3d.info());
const boxOf = (page, refs) => page.evaluate((r) => window.makerForge.board3d.boxOf(r), refs);

async function openProject(viewport = { width: 1400, height: 950 }) {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  const server = await startDevServer(dir);
  const opened = await openPage(server.url, viewport);
  await opened.page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  return { server, ...opened };
}

async function show3D(page) {
  if ((await page.locator('#board3d-toggle').getAttribute('aria-pressed')) !== 'true') await page.locator('#board3d-toggle').click();
  await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
  await nextFrame(page);
}

/** The point lies in the box, give or take a little. */
function inside(point, box, slack = 0.5) {
  return point.every((v, k) => v >= box.min[k] - slack && v <= box.max[k] + slack);
}

describe('the 3D board, more of it', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await openProject());
    await show3D(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('a board colour from the toolbar, kept per project', async () => {
    assert.equal((await info(page)).boardColour, 'green', "0.8's green board to start with");
    const options = await page.locator('#board3d-colour option').evaluateAll((os) => os.map((o) => o.value));
    assert.deepEqual(options, ['green', 'black', 'blue', 'red', 'white', 'purple', 'perfboard', 'stripboard']);
    await page.locator('#board3d-colour').selectOption('black');
    assert.equal((await info(page)).boardColour, 'black');
    await page.locator('#board3d-colour').selectOption('stripboard');
    const strip = await info(page);
    assert.equal(strip.boardColour, 'stripboard');
    assert.ok(strip.strips > 0, 'copper strips under a stripboard');
    await page.locator('#board3d-colour').selectOption('black');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await show3D(page);
    assert.equal((await info(page)).boardColour, 'black', 'kept after a reload');
    assert.equal(await page.locator('#board3d-colour').inputValue(), 'black');
    assert.equal((await info(page)).strips, 0);
  });

  test('ticking a part solders its legs; unticking takes the joints away', async () => {
    const before = (await info(page)).joints;
    assert.equal(before.soldered, 0, 'nothing ticked yet: bare legs');
    assert.ok(before.bare > 80, `${before.bare} bare legs`);
    await page.locator('#checklist input[data-ref="R6"]').check();
    await page.waitForFunction(() => window.makerForge.board3d.info().joints.soldered === 2);
    const ticked = (await info(page)).joints;
    assert.equal(ticked.bare, before.bare - 2);
    await page.locator('#checklist input[data-ref="R6"]').uncheck();
    await page.waitForFunction(() => window.makerForge.board3d.info().joints.soldered === 0);
    assert.equal((await info(page)).joints.bare, before.bare);
  });

  test('Which way round marks the + legs, the cathode and pin 1, and is kept', async () => {
    assert.equal((await info(page)).polarityMarks, 0);
    await page.locator('#board3d-polarity').check();
    const marks = (await info(page)).polarityMarks;
    assert.ok(marks >= 4, `${marks} marks`); // C1A, C1B, C2, C10, D1 and U2
    assert.deepEqual((await info(page)).polarity.sort(), ['C10', 'C1A', 'C1B', 'C2', 'D1', 'U2']);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await show3D(page);
    assert.equal(await page.locator('#board3d-polarity').isChecked(), true);
    assert.ok((await info(page)).polarityMarks >= 4, 'kept after a reload');
    await page.locator('#board3d-polarity').uncheck();
    assert.equal((await info(page)).polarityMarks, 0);
  });

  test('opening a guide step turns the camera to its parts', async () => {
    await page.locator('#steps .steps-list li button', { hasText: 'The two solder bridges' }).click();
    assert.equal(await page.evaluate(() => window.makerForge.board3d.view()), 'bottom', 'a step under the board turns it over');
    await page.locator('#steps .steps-list li button', { hasText: "The chip's support parts" }).click();
    const refs = await page.locator('#steps .step-parts button').evaluateAll((bs) => bs.map((b) => b.textContent.trim()));
    assert.ok(refs.length > 0);
    const box = await boxOf(page, refs);
    const target = (await info(page)).target;
    assert.ok(inside(target, box), `${target} in ${JSON.stringify(box)}`);
  });

  test('Find flies to the part it found', async () => {
    await page.locator('#find').fill('R6');
    await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
    await page.locator('#find').press('Enter');
    await page.waitForFunction(() => window.makerForge.board3d.info().selected === 'R6');
    const box = await boxOf(page, ['R6']);
    const target = (await info(page)).target;
    assert.ok(inside(target, box), `${target} in ${JSON.stringify(box)}`);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('the 3D board on a phone', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await openProject({ width: 375, height: 812 }));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('no shadows on a small screen', async () => {
    await page.evaluate(() => document.querySelector('#board3d-toggle').click());
    await page.waitForFunction(() => window.makerForge.board3d.view() !== null, null, { timeout: 20000 });
    assert.equal((await info(page)).shadows, false);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});

describe('the 3D board with Less motion on', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    ({ server, browser, page, problems } = await openProject());
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('Less motion turns the shadows off', async () => {
    await show3D(page);
    assert.equal((await info(page)).shadows, true, 'shadows on a big screen');
    await page.evaluate(() => { document.documentElement.dataset.motion = 'reduce'; });
    await page.waitForFunction(() => window.makerForge.board3d.info().shadows === false);
  });

  test('no errors', () => assert.deepEqual(problems, []));
});
