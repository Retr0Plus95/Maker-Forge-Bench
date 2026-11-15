// Bench 1.0.2 "Fault finder" (docs/design/2026-11-15-release-1.0.2-design.md): pick what's wrong,
// one meter check at a time, what the checks found, and Claude when they run out.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const PROGRESS = 'bench.progress:Solder Fume Extractor:Rev D';

async function fumeProject() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  return dir;
}

const text = (page, sel) => page.locator(sel).textContent();
const nowText = (page) => text(page, '#fault-now .fault-text');

async function openSymptom(page, title) {
  if (await page.locator('#fault-close').count()) await page.locator('#fault-close').click();
  await page.locator('#fault-symptoms button', { hasText: title }).click();
  await page.waitForFunction((t) => document.querySelector('#fault-title')?.textContent === t, title);
}

/** Skips checks until one of this kind shows. */
async function skipTo(page, kind) {
  for (let k = 0; k < 40 && (await page.locator('#fault-now').getAttribute('data-kind')) !== kind; k++) {
    const before = await page.locator('#fault-now').getAttribute('data-check');
    await page.locator('#fault-skip').click();
    await page.waitForFunction((b) => document.querySelector('#fault-now')?.getAttribute('data-check') !== b, before);
  }
  assert.equal(await page.locator('#fault-now').getAttribute('data-kind'), kind);
}

async function answer(page, button, nextText) {
  await page.locator(button).click();
  if (nextText) await page.waitForFunction((t) => document.querySelector('#fault-now .fault-text')?.textContent.startsWith(t), nextText);
}

describe('the fault finder', () => {
  let server; let browser; let page; let problems;

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }));
    await page.waitForFunction(() => document.querySelectorAll('#fault-symptoms button').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("the Checks tab lists what can be wrong, found from the board", async () => {
    assert.equal(await text(page, '#faults h2'), 'Find a fault');
    const titles = await page.locator('#fault-symptoms button').allTextContents();
    assert.deepEqual(titles, [
      'Nothing happens when I switch it on', 'Something gets hot, smokes or smells', "U2 (ATmega328P-PU) doesn't seem to run",
      "Fan A (J2) doesn't spin", 'Fan A (J2) always runs at full speed', "Fan B (J3) doesn't spin", 'Fan B (J3) always runs at full speed',
      'The knob (J5 pin 2) does nothing', "LED A (J5 pin 4) doesn't light", "LED B (J5 pin 5) doesn't light",
      'The LCD (J4) stays blank', 'The button (J6) does nothing',
    ]);
    const order = await page.evaluate(() => [...document.querySelectorAll('#panel > section')].map((s) => s.id));
    assert.ok(order.indexOf('checks') < order.indexOf('faults') && order.indexOf('faults') < order.indexOf('continuity'), 'between the power-up checks and the continuity test');
  });

  test('one check at a time; a wrong answer says what to fix, and Fixed it checks again', async () => {
    await openSymptom(page, 'Fan A (J2) always runs at full speed');
    assert.match(await text(page, '#fault-count'), /^0 of \d+ checked · 0 problems$/);
    assert.equal(await nowText(page), 'Is the fan a 4-wire (PWM) fan, with a wire in J2 pin 4?');
    assert.equal(await text(page, '#fault-now .fault-setup'), 'Power off');
    assert.equal(await page.locator('#fault-back').isDisabled(), true);
    await answer(page, '#fault-yes', 'Is R8 (10k) fitted');
    assert.match(await text(page, '#fault-now .fault-expect'), /Bands: brown, black, orange, gold\./);
    await answer(page, '#fault-yes', 'Is R12 (4.7k) fitted');
    assert.equal(await text(page, '#fault-no'), 'Found a problem');
    await page.locator('#fault-no').click();
    await page.waitForFunction(() => document.querySelector('#fault-fix'));
    assert.match(await text(page, '#fault-fix'), /^Fit R12 \(4\.7k\), or reseat and resolder it\.$/);
    assert.equal(await text(page, '#fault-now .fault-said'), 'You said: found a problem.');
    assert.match(await text(page, '#fault-count'), /^3 of \d+ checked · 1 problem$/);
    assert.equal(await page.locator('#fault-problems li').count(), 1);
    await answer(page, '#fault-next', 'Is Q1 (2N2222A) fitted');
    assert.match(await text(page, '#fault-now .fault-expect'), /^Which way round: Flat face toward row 16/);
    assert.match(await text(page, '#fault-now .fault-why'), /^Why: Switches both fans' PWM line low/);
    await page.locator('#fault-back').click();
    await page.waitForFunction(() => document.querySelector('#fault-fix'));
    await answer(page, '#fault-retry');
    await page.waitForFunction(() => !document.querySelector('#fault-fix') && document.querySelector('#fault-now .fault-text')?.textContent.startsWith('Is R12'));
    await answer(page, '#fault-yes', 'Is Q1 (2N2222A) fitted');
    assert.equal(await page.locator('#fault-problems li').count(), 0);
    assert.deepEqual(problems, []);
  });

  test('a beep check, Show where, and the probes in 3D', async () => {
    await skipTo(page, 'beep');
    assert.equal(await text(page, '#fault-now .fault-setup'), 'Power off · meter on beep');
    assert.equal(await nowText(page), 'Probes on J2 pin 3 and R8 pin 2.');
    assert.equal(await text(page, '#fault-now .fault-expect'), 'It should beep: both are on TACHA_F.');
    await page.locator('#board3d-toggle').click();
    await page.waitForFunction(() => window.makerForge.board3d.info()?.marks === 2);
    const ids = await page.evaluate(() => window.makerForge.board3d.info().markSpots.map((m) => m.id));
    assert.deepEqual(ids, ['probe:+', 'probe:−']);
    await page.locator('#fault-show').click();
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'J2');
    await page.waitForFunction(() => document.querySelector('#part-card .pin-selected')?.getAttribute('data-pin') === '3');
    await answer(page, '#fault-no');
    await page.waitForFunction(() => document.querySelector('#fault-fix'));
    assert.match(await text(page, '#fault-fix'), /^No connection between J2 pin 3 and R8 pin 2/);
    await page.locator('#fault-close').click();
    await page.waitForFunction(() => window.makerForge.board3d.info()?.marks === 0);
    await page.locator('#board3d-toggle').click();
    assert.deepEqual(problems, []);
  });

  test('volts: type what the meter shows; judged where the board says what it should be', async () => {
    await openSymptom(page, "U2 (ATmega328P-PU) doesn't seem to run");
    await skipTo(page, 'volts');
    assert.equal(await text(page, '#fault-now .fault-switch'), 'Now switch on.');
    assert.equal(await text(page, '#fault-now .fault-setup'), 'Power on · meter on DC volts');
    assert.equal(await nowText(page), 'Black probe on J0 pin 2 (0 V), red probe on U2 pin 7.');
    assert.equal(await text(page, '#fault-now .fault-expect'), 'About 5 V (4.5 to 5.5 V).');
    await page.locator('#fault-reading').fill('five');
    await page.locator('#fault-save').click();
    assert.equal(await text(page, '#fault-reading-help'), 'Type the number the meter shows, like 4.98.');
    await page.locator('#fault-reading').fill('4,2');
    await page.locator('#fault-reading').press('Enter');
    await page.waitForFunction(() => document.querySelector('#fault-fix'));
    assert.match(await text(page, '#fault-fix'), /^\+5 V isn't reaching U2 pin 7/);
    assert.equal(await text(page, '#fault-readings li'), 'U2 pin 7: 4.2 V ✗');
    await page.locator('#fault-retry').click();
    await page.waitForFunction(() => document.querySelector('#fault-reading') && !document.querySelector('#fault-fix'));
    await page.locator('#fault-reading').fill('4.98');
    await page.locator('#fault-save').click();
    await page.waitForFunction(() => document.querySelector('#fault-now .fault-text')?.textContent === 'Black probe on J0 pin 2 (0 V), red probe on U2 pin 20.');
    assert.equal(await text(page, '#fault-readings li'), 'U2 pin 7: 4.98 V ✓');
    assert.deepEqual(problems, []);
  });

  test('answers are kept and undoable, show in the list and the build log, and Start this one again clears them', async () => {
    const log = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).log.map((e) => e.text), PROGRESS);
    assert.ok(log.includes('U2 pin 7: 4.98 V'), log.join(' | '));
    assert.ok(log.includes('J2 pin 3 to R8 pin 2: no beep'));
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).faults, PROGRESS);
    assert.deepEqual(saved['chip:U2']['volts:U2:7'], { reading: 4.98 });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('#fault-now .fault-text')?.textContent.endsWith('U2 pin 7.'));
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#fault-symptoms button').length > 0);
    const progress = await page.locator('#fault-symptoms li', { hasText: 'Fan A (J2) always runs at full speed' }).locator('.fault-progress').textContent();
    assert.match(progress, /^\d+ of \d+ checked · 1 problem$/);
    await openSymptom(page, 'Fan A (J2) always runs at full speed');
    assert.equal(await page.locator('#fault-problems li').count(), 1);
    await page.locator('#fault-reset').click();
    await page.waitForFunction(() => /^0 of \d+ checked/.test(document.querySelector('#fault-count')?.textContent));
    assert.equal(await nowText(page), 'Is the fan a 4-wire (PWM) fan, with a wire in J2 pin 4?');
    assert.deepEqual(problems, []);
  });

  test("the palette's Find a fault goes to the list", async () => {
    await page.keyboard.press('Control+k');
    await page.locator('#palette-input').fill('find a fault');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#fault-symptoms button').length === 12 && !document.querySelector('#fault-title'));
    assert.deepEqual(problems, []);
  });
});

describe('the fault finder and Claude', () => {
  let server; let browser; let page; let problems; const seen = [];

  before(async () => {
    server = await startDevServer(await fumeProject());
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, {
      before: async (p) => {
        await p.addInitScript(() => localStorage.setItem('bench.ai', JSON.stringify({ provider: 'claude', key: 'sk-ant-test-1', remember: true })));
        await p.route('https://api.anthropic.com/**', async (route) => {
          const req = route.request();
          if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
          seen.push(JSON.parse(req.postData() || '{}'));
          return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'R12 is missing: <b>fit it</b>.' }] }) });
        });
      },
      context: { permissions: ['clipboard-read', 'clipboard-write'] },
    }));
    await page.waitForFunction(() => document.querySelectorAll('#fault-symptoms button').length > 0);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('Ask Claude sends the symptom, the answers and the parts, and shows the answer as plain text', async () => {
    await openSymptom(page, 'Fan A (J2) always runs at full speed');
    await answer(page, '#fault-yes', 'Is R8');
    await answer(page, '#fault-yes', 'Is R12');
    await page.locator('#fault-no').click();
    await page.waitForFunction(() => document.querySelector('#fault-fix'));
    assert.equal(await text(page, '#fault-ask'), 'Ask Claude');
    await page.locator('#fault-ask').click();
    await page.waitForFunction(() => document.querySelector('#fault-answer')?.textContent === 'R12 is missing: <b>fit it</b>.');
    assert.equal(await page.locator('#fault-answer b').count(), 0, 'never read as page code');
    const prompt = seen.at(-1).messages[0].content;
    assert.match(prompt, /^Question: My project has a fault: "Fan A \(J2\) always runs at full speed"\./);
    assert.match(prompt, /- Is R12 \(4\.7k\) fitted, in its own holes\?: found a problem \(not what it should be\)/);
    assert.match(prompt, /- R6 \(10k\): Holds Q1 off/);
    assert.match(seen.at(-1).system, /find a fault/);
    assert.deepEqual(problems, []);
  });

  test('Copy for Claude copies the same text and opens claude.ai', async () => {
    await page.evaluate(() => {
      window.__opened = [];
      window.open = (...args) => { window.__opened.push(args); return null; };
    });
    await page.locator('#fault-copy').click();
    await page.waitForFunction(() => window.__opened.length === 1 && /Copied/.test(document.querySelector('#status')?.textContent || ''));
    const [url, target, features] = await page.evaluate(() => window.__opened[0]);
    assert.deepEqual([url, target], ['https://claude.ai/new', '_blank']);
    assert.match(features, /noopener/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /^Question: My project has a fault: "Fan A \(J2\) always runs at full speed"/);
  });
});
