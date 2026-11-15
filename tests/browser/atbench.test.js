// Bench 1.0.1 "At the bench" (docs/design/2026-11-15-release-1.0.1-design.md): bridge risk, mix-up
// warning, tips and tools, joints and solder, waiting parts, sort your parts, the undo toast, the
// buzz, the iron reminder, welcome back and time left.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, fromMenu, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');

async function fumeProject() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  return dir;
}

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}

async function openStepNamed(page, title) {
  await page.locator('#steps .steps-list li button', { hasText: title }).click();
  await page.waitForFunction((t) => document.querySelector('#steps .step-title')?.textContent.includes(t), title);
}

describe('at the bench: reading the board', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('bridge risks are listed in Checks, in the open step and in 3D', async () => {
    assert.equal(await page.locator('#bridge-risks li').count(), 26);
    assert.equal(await page.locator('#bridges-title').textContent(), 'Watch for bridges underneath (26)');
    const j2 = page.locator('#bridge-risks li button', { hasText: 'J2 pin 1 (0 V) is next to the +12 V bus' });
    await j2.click();
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'J2');
    assert.equal(await page.locator('#bridge-risks li[aria-current="true"]').count(), 1);
    await openStepNamed(page, 'The power strip');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /J2 pin 1 \(0 V\) is next to the \+12 V bus: keep the solder on its own pad\./);
    await openStepNamed(page, 'Bare-wire buses');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /The \+5 V bus \(row 18\) and the 0 V bus \(row 19\) run side by side for 17 holes/);
    await openStepNamed(page, 'The DIP socket');
    assert.match(await page.locator('#steps .step-bridges').textContent(), /R4 pin 2 \(RST\) is next to U2 pin 28 \(SCL\)/);
    assert.equal(await page.locator('#board3d-bridges').isChecked(), false);
    await page.locator('#bridges-3d').click();
    await page.waitForFunction(() => !document.querySelector('#board3d').hidden);
    assert.equal(await page.locator('#board3d-bridges').isChecked(), true);
    assert.deepEqual(problems, []);
  });

  test("a resistor easy to mix up with another value says so on both cards", async () => {
    await openCard(page, 'R6');
    assert.equal(await page.locator('#part-card .part-mixup').textContent(), 'Easy to mix up with R5 (1k): brown-black-orange against brown-black-red. Check the third band.');
    await openCard(page, 'R5');
    assert.equal(await page.locator('#part-card .part-mixup').textContent(), 'Easy to mix up with R4 (10k): brown-black-red against brown-black-orange. Check the third band.');
    await openCard(page, 'R2');
    assert.equal(await page.locator('#part-card .part-mixup').count(), 0);
  });

  test('a soldering tip on each card, and tools and tips in the open step', async () => {
    await openCard(page, 'C1A');
    assert.equal(await page.locator('#part-card .part-tip').textContent(), 'Tip: The stripe marks the minus leg (the shorter one). Backwards it can swell or pop, so check before soldering.');
    await openStepNamed(page, 'Insulated links');
    assert.equal(await page.locator('#steps .step-tools').textContent(), 'Have ready: flush cutters, wire strippers.');
    assert.match(await page.locator('#steps .step-tips').textContent(), /Wiring → Wire to cut/);
    await openStepNamed(page, 'Power-up checks');
    assert.equal(await page.locator('#steps .step-tools').textContent(), 'Have ready: multimeter.');
  });

  test('the shopping list says how many joints and how much solder', async () => {
    await page.locator('#shopping-open').click();
    assert.equal(await page.locator('#shopping-solder').textContent(), 'About 163 solder joints: about 2 m of 0.8 mm solder, with some to spare.');
    await page.locator('#shopping-done').click();
  });

  test("sort your parts: each step's parts by value, to print", async () => {
    await page.evaluate(() => {
      window.benchPrinted = [];
      window.print = () => window.benchPrinted.push(document.body.classList.contains('print-sort'));
    });
    await fromMenu(page, '#menu-sort');
    assert.equal(await page.locator('#sort-parts section').count(), 6);
    const fans = page.locator('#sort-parts section', { hasText: 'Fan drive and tach' });
    assert.equal(await fans.locator('h3').textContent(), 'Step 7: Fan drive and tach (8 parts)');
    const rows = await fans.locator('li').allTextContents();
    assert.ok(rows.includes('4 × 10k: R8, R9, R7, R6'), rows.join(' | '));
    assert.ok(rows.includes('2 × 4.7k: R12, R13'), rows.join(' | '));
    await page.locator('#sort-print').click();
    assert.deepEqual(await page.evaluate(() => window.benchPrinted), [true]);
    await page.locator('#sort-done').click();
    assert.equal(await page.locator('#sort-parts').isVisible(), false);
  });
});

describe("at the bench: parts you don't have yet", () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const stepTitles = () => page.locator('#steps .steps-list li button').allTextContents();

  test('a part you don\'t have yet waits at the end, and comes back when it\'s ticked', async () => {
    await openCard(page, 'R6');
    await page.locator('#part-waiting').click();
    assert.equal(await page.locator('#part-card .part-waiting').textContent(), 'Waiting for this part: the guide brings it back in the last step.');
    assert.equal(await page.locator('#part-waiting').textContent(), "It's here now");
    let titles = await stepTitles();
    assert.equal(titles.length, 11);
    assert.equal(titles.at(-1), 'Waiting for parts');
    assert.equal(await page.locator('#checklist li[data-ref="R6"] .waiting-mark').textContent(), 'waiting');
    await openStepNamed(page, 'Fan drive and tach');
    assert.equal(await page.locator('#steps .step-parts input[data-step-ref="R6"]').count(), 0);
    await page.locator('#undo').click();
    assert.equal((await stepTitles()).length, 10, 'undone');
    await page.locator('#redo').click();
    await openStepNamed(page, 'Waiting for parts');
    assert.match(await page.locator('#steps .step-parts li').first().textContent(), /from step: Fan drive and tach/);
    await page.locator('#steps .step-parts input[data-step-ref="R6"]').click(); // (its box goes with the Waiting step, so not .check())
    titles = await stepTitles();
    assert.equal(titles.length, 10, 'ticking it takes it off the list');
    assert.ok(!titles.includes('Waiting for parts'));
    assert.equal(await page.locator('#checklist input[data-ref="R6"]').isChecked(), true);
  });

  test('a step whose parts all wait leaves the list, and the open step stays open', async () => {
    await openStepNamed(page, 'The panel side');
    for (const ref of ['R4', 'C6', 'C7']) {
      await openCard(page, ref);
      await page.locator('#part-waiting').click();
    }
    const titles = await stepTitles();
    assert.ok(!titles.some((t) => t.startsWith("The chip's support parts")), titles.join(' | '));
    assert.match(await page.locator('#steps .step-title').textContent(), /: The panel side$/);
  });

  test("the shopping list can show only what's missing, and it's kept", async () => {
    await page.locator('#shopping-open').click();
    assert.equal(await page.locator('#shopping-missing-label').textContent(), "Only what's missing (3 parts)");
    await page.locator('#shopping-missing').check();
    const rows = await page.locator('#shopping tbody tr').allTextContents();
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => /R4/.test(r)) && rows.some((r) => /C6, C7/.test(r)), rows.join(' | '));
    await page.locator('#shopping-done').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await openCard(page, 'R4');
    assert.equal(await page.locator('#part-waiting').textContent(), "It's here now");
    assert.deepEqual(problems, []);
  });
});

describe('at the bench: ticking', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, {
      before: (pg) => pg.addInitScript(() => {
        window.benchBuzz = [];
        Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: (p) => { window.benchBuzz.push(p); return true; } });
      }),
    }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const ticked = (ref) => page.locator(`#checklist input[data-ref="${ref}"]`).isChecked();

  test('after a tick, "R6 soldered · Undo" undoes it', async () => {
    await openCard(page, 'R6');
    await page.locator('#part-tick').click();
    assert.equal(await page.locator('#toast').isVisible(), true);
    assert.equal(await page.locator('#toast-text').textContent(), 'R6 soldered');
    await page.locator('#toast-undo').click();
    assert.equal(await ticked('R6'), false);
    assert.equal(await page.locator('#toast').isVisible(), false);
  });

  test('the toast goes when another change comes after the tick, and Undo never undoes that one', async () => {
    await page.locator('#part-tick').click();
    assert.equal(await page.locator('#toast-text').textContent(), 'R6 soldered');
    const undo = page.locator('#toast-undo');
    await openCard(page, 'C4');
    await page.locator('#part-waiting').click();
    assert.equal(await page.locator('#toast').isVisible(), false);
    await undo.evaluate((b) => b.click()); // even if it could still be pressed
    assert.equal(await page.locator('#part-waiting').textContent(), "It's here now", 'the waiting mark stays');
    assert.equal(await ticked('R6'), true);
  });

  test('untick, tick all of a value and a step say so too; the toast goes by itself after about 6 seconds', async () => {
    await page.locator('#checklist input[data-ref="R6"]').click();
    assert.equal(await page.locator('#toast-text').textContent(), 'R6 not soldered');
    await openCard(page, 'R8');
    await page.locator('#part-tick-value').click();
    assert.equal(await page.locator('#toast-text').textContent(), 'Ticked all 10k');
    const shown = Date.now();
    await page.waitForFunction(() => document.querySelector('#toast').hidden, null, { timeout: 9000 });
    const gone = Date.now() - shown;
    assert.ok(gone > 5000 && gone < 8000, `went after ${gone} ms`);
  });

  test('a tick buzzes once on a phone that can; untick and Buzz off don\'t', async () => {
    await page.evaluate(() => { window.benchBuzz.length = 0; });
    await openCard(page, 'R2');
    await page.locator('#part-tick').click();
    assert.deepEqual(await page.evaluate(() => window.benchBuzz), [30]);
    await page.locator('#part-tick').click();
    assert.deepEqual(await page.evaluate(() => window.benchBuzz), [30]);
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name="buzz"]').uncheck();
    await page.locator('#settings-done').click();
    await page.locator('#part-tick').click();
    assert.deepEqual(await page.evaluate(() => window.benchBuzz), [30]);
    assert.deepEqual(problems, []);
  });
});

describe('at the bench: the iron reminder', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { before: (pg) => pg.clock.install() }));
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const iron = () => page.locator('#iron').isVisible();
  const tick = (ref) => page.locator(`#checklist input[data-ref="${ref}"]`).click();

  test('off until you turn it on', async () => {
    await tick('R6');
    await page.clock.fastForward('21:00');
    assert.equal(await iron(), false);
  });

  test('on: after 20 minutes without a tick it asks; Still working asks again later, It\'s off waits for a tick', async () => {
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name="ironReminder"]').check();
    await page.locator('#settings-done').click();
    await tick('R2');
    await page.clock.fastForward('19:00');
    assert.equal(await iron(), false);
    await page.clock.fastForward('02:00');
    assert.equal(await iron(), true);
    assert.equal(await page.locator('#iron-text').textContent(), 'Nothing ticked for 20 minutes. Is the iron still on?');
    await page.locator('#iron-yes').click();
    assert.equal(await iron(), false);
    await page.clock.fastForward('19:00');
    assert.equal(await iron(), false);
    await page.clock.fastForward('02:00');
    assert.equal(await iron(), true, 'asks again 20 minutes after Still working');
    await page.locator('#iron-off').click();
    await page.clock.fastForward('45:00');
    assert.equal(await iron(), false, "quiet after It's off");
    await tick('R3');
    await page.clock.fastForward('21:00');
    assert.equal(await iron(), true, 'a new tick starts it again');
    await page.locator('#iron-off').click();
  });

  test('no tick in this visit, no reminder', async () => {
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    await page.clock.fastForward('30:00');
    assert.equal(await iron(), false);
    assert.deepEqual(problems, []);
  });
});

describe('at the bench: welcome back and time left', () => {
  const DONE = ['U2', 'J0', 'D1', 'C1A', 'C1B', 'U1', 'C2', 'C3', 'C10', 'J2', 'J3', 'R4', 'C6', 'C7', 'R8', 'R12', 'R9', 'R13', 'R7', 'R5', 'Q1', 'R6'];

  async function openWith(seed) {
    const server = await startDevServer(await fumeProject());
    const opened = await openPage(server.url, { width: 1400, height: 950 }, {
      before: (pg) => pg.addInitScript(([refs, on]) => {
        if (!on || localStorage.getItem('bench.seeded')) return;
        localStorage.setItem('bench.seeded', '1');
        const end = Date.now() - 2 * 60 * 60 * 1000; // two hours ago
        const log = refs.map((ref, i) => ({ t: end - (refs.length - 1 - i) * 5 * 60 * 1000, text: `Tick ${ref}` })); // one every 5 minutes
        localStorage.setItem('bench.progress:Solder Fume Extractor:Rev D', JSON.stringify({
          ticked: refs, sheetPrints: {}, flipped: [], checks: ['step:buses', 'step:links', 'step:bridges'], log,
        }));
      }, [DONE, seed]),
    });
    await opened.page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
    return { server, ...opened };
  }

  test('back after two hours: where you were and what comes next; Carry on goes there', async () => {
    const { server, browser, page, problems } = await openWith(true);
    try {
      const text = await page.locator('#welcome-back p').textContent();
      assert.match(text, /^Welcome back\. Last time \((today|yesterday) at \d\d:\d\d\): R6 soldered\. Next: step 8 of 10, R2 \(330R\), pin 1 at 5,15 · pin 2 at 5,17\.$/);
      assert.equal(await page.locator('#steps .time-left').textContent(), 'About 1 h 10 min left for the 15 parts still to solder, at your pace so far.');
      await page.locator('#welcome-carry-on').click();
      assert.match(await page.locator('#steps .step-title').textContent(), /^Step 8 of 10: The panel side$/);
      await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R2');
      assert.equal(await page.locator('#welcome-back').count(), 0);
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0);
      assert.equal(await page.locator('#welcome-back').count(), 1, 'every time the project is opened after an hour away');
      await page.locator('#welcome-close').click();
      assert.equal(await page.locator('#welcome-back').count(), 0);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('the welcome goes as soon as you change something, so it never shows old news', async () => {
    const { server, browser, page } = await openWith(true);
    try {
      assert.equal(await page.locator('#welcome-back').count(), 1);
      await page.locator('#checklist input[data-ref="R2"]').click();
      assert.equal(await page.locator('#welcome-back').count(), 0);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test('a fresh project: no welcome and no time left', async () => {
    const { server, browser, page } = await openWith(false);
    try {
      assert.equal(await page.locator('#welcome-back').count(), 0);
      assert.equal(await page.locator('#steps .time-left').count(), 0);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
