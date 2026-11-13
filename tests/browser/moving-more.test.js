import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const cardRef = (page) => page.evaluate(() => document.querySelector('#part-card h2')?.firstChild?.textContent || null);
const tabNow = (page) => page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]')?.dataset.id);
const ready = (page) => page.waitForFunction(() => document.querySelectorAll('#checklist input[data-ref]').length > 0 && document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));

async function openCard(page, ref) {
  await page.locator('#find').fill(ref);
  await page.waitForFunction(() => document.querySelectorAll('#find-results button').length > 0);
  await page.locator('#find').press('Enter');
  await page.waitForFunction((r) => document.querySelector('#part-card h2')?.firstChild?.textContent === r, ref);
}
const stageKey = async (page, key) => {
  await page.locator('#stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(key);
};

describe('moving around, lists, and the app extras', () => {
  let server; let browser; let page; let problems; let dir;

  before(async () => {
    dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(`${server.url}?sheet=SFE-04&part=R8`, { width: 1400, height: 950 }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await ready(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('a link opens a sheet and a part, and the card copies a link to itself', async () => {
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R8');
    assert.equal(await tabNow(page), 'SFE-04');
    await page.locator('#part-link').click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /\?sheet=SFE-04&part=R8$/);
  });

  test('Alt+← and Alt+→ go back and forward through the parts you opened', async () => {
    await openCard(page, 'R9');
    await stageKey(page, 'Alt+ArrowLeft');
    assert.equal(await cardRef(page), 'R8');
    await page.keyboard.press('Alt+ArrowRight');
    assert.equal(await cardRef(page), 'R9');
  });

  test('[ and ] pick the previous and next sheet; w fits the width', async () => {
    const start = await tabNow(page);
    await stageKey(page, ']');
    assert.notEqual(await tabNow(page), start);
    await page.keyboard.press('[');
    assert.equal(await tabNow(page), start);
    await page.keyboard.press('w');
    const [host, stage] = await page.evaluate(() => [document.querySelector('#sheet-host').getBoundingClientRect().width, document.querySelector('#stage').clientWidth]);
    assert.ok(Math.abs(host - stage) < 3, `${host} vs ${stage}`);
  });

  test('zoom and position are kept per sheet across visits', async () => {
    await stageKey(page, '+');
    const zoom = await page.locator('#zoom-level').textContent();
    await page.waitForTimeout(700);
    await page.reload();
    await ready(page);
    await page.waitForFunction((z) => document.querySelector('#zoom-level').textContent === z, zoom);
  });

  test("tabs say each sheet's soldered count; hovering a label names the part", async () => {
    await page.locator('[role=tab][data-id="SFE-04"]').click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent.trim() === 'R8'));
    await page.locator('#checklist input[data-ref="R8"]').check();
    assert.match(await page.locator('[role=tab][data-id="SFE-04"]').getAttribute('data-count'), /^1\/\d+$/);
    const box = await page.evaluate(() => {
      const t = [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].find((n) => n.textContent.trim() === 'R8');
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.waitForFunction(() => !document.querySelector('#label-tip').hidden);
    assert.match(await page.locator('#label-tip').textContent(), /^R8 · 10k/);
    await page.mouse.move(5, 500);
  });

  test('Find remembers recent searches; Ctrl+S saves the progress file', async () => {
    await page.locator('#find').fill('C10');
    await page.locator('#find').press('Enter');
    assert.ok(await page.locator('#find-recent option[value="C10"]').count() === 1);
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
    assert.match(download.suggestedFilename(), /-progress\.json$/);
  });

  test('checklist: search, group by type, sort by step, and step numbers', async () => {
    await page.locator('#checklist-search').fill('R1');
    const refs = await page.locator('#checklist li[data-ref]').evaluateAll((ls) => ls.map((l) => l.dataset.ref));
    assert.ok(refs.length > 0 && refs.every((r) => r.includes('R1')), refs.join());
    await page.locator('#checklist-search').fill('');
    await page.locator('#checklist-group').check();
    assert.match(await page.locator('#checklist h3', { hasText: 'Resistors' }).textContent(), /^Resistors \(1\/\d+\)$/);
    await page.locator('#checklist-group').uncheck();
    await page.locator('#checklist-sort').selectOption('step');
    assert.equal(await page.locator('#checklist li[data-ref]').first().getAttribute('data-ref'), 'U2');
    assert.equal(await page.locator('#checklist li[data-ref="R8"] .step-no').textContent(), 'S7');
    await page.locator('#checklist-sort').selectOption('list');
  });

  test('What to wire: filter, mark a whole line wired, totals by kind, and the next line not finished', async () => {
    assert.match(await page.locator('#wiring-kinds').textContent(), /^Supplies \d+\/\d+ · 0 V \d+\/\d+ · Signals \d+\/\d+$/);
    await page.locator('#wiring-filter').fill('TACH');
    const nets = await page.locator('#wiring details').evaluateAll((ds) => ds.map((d) => d.dataset.net));
    assert.ok(nets.length >= 2 && nets.every((n) => n.includes('TACH')), nets.join());
    await page.locator('#wiring-filter').fill('');
    await page.locator('#wiring details[data-net="P5V"] summary').click();
    await page.locator('#wiring details[data-net="P5V"] .wire-all').click();
    assert.match(await page.locator('#wiring details[data-net="P5V"] summary').textContent(), /^\+5 V (\d+) of \1 wired$/);
    await page.locator('#wiring-close-all').click();
    await page.locator('#wiring-next').click();
    assert.equal(await page.locator('#wiring details[open]').count(), 1);
    assert.notEqual(await page.locator('#wiring details[open]').getAttribute('data-net'), 'P5V');
  });

  test('compact mode, and a side panel you can widen by dragging', async () => {
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name=compact]').check();
    await page.locator('#settings-done').click();
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-compact')), true);
    const before = await page.locator('#panel').evaluate((n) => n.getBoundingClientRect().width);
    const handle = await page.locator('#panel-resize').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
    await page.mouse.down();
    await page.mouse.move(handle.x - 100, handle.y + 50, { steps: 5 });
    await page.mouse.up();
    const after = await page.locator('#panel').evaluate((n) => n.getBoundingClientRect().width);
    assert.ok(after > before + 60, `${before} → ${after}`);
  });

  test('calculators: an LED resistor, Ohm\'s law, a divider', async () => {
    await page.locator('#calc-open').click();
    await page.locator('#calc-led-supply').fill('5');
    await page.locator('#calc-led-vf').fill('2');
    await page.locator('#calc-led-ma').fill('10');
    assert.match(await page.locator('#calc-led-out').textContent(), /300 Ω: use 330 Ω, about 9\.1 mA/);
    await page.locator('#calc-ohm-v').fill('5');
    await page.locator('#calc-ohm-r').fill('1000');
    assert.match(await page.locator('#calc-ohm-out').textContent(), /5 mA/);
    await page.locator('#calc-div-vin').fill('12');
    await page.locator('#calc-div-r1').fill('10000');
    await page.locator('#calc-div-r2').fill('4700');
    assert.match(await page.locator('#calc-div-out').textContent(), /3\.84 V/);
    await page.locator('#calc-done').click();
  });

  test('the command palette (Ctrl+K): parts, actions, sheets', async () => {
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#palette').isVisible(), true);
    await page.locator('#palette-input').fill('c10');
    assert.match(await page.locator('#palette-list li').first().textContent(), /^C10 10 µF/);
    await page.keyboard.press('Enter');
    assert.equal(await cardRef(page), 'C10');
    assert.equal(await page.locator('#palette').isVisible(), false);
    await page.keyboard.press('Control+k');
    await page.locator('#palette-input').fill('shopping');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#shopping').isVisible(), true);
    await page.locator('#shopping-done').click();
  });

  test('pinch to zoom on a touch screen', async () => {
    const before = await page.locator('#zoom-level').textContent();
    await page.evaluate(() => {
      const stage = document.querySelector('#stage');
      const r = stage.getBoundingClientRect();
      const ev = (type, id, x) => stage.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: r.left + x, clientY: r.top + 300, bubbles: true }));
      ev('pointerdown', 1, 300);
      ev('pointerdown', 2, 400);
      ev('pointermove', 2, 500);
      ev('pointermove', 1, 200);
      ev('pointerup', 2, 500);
      ev('pointerup', 1, 200);
    });
    assert.notEqual(await page.locator('#zoom-level').textContent(), before);
  });

  test("what's new shows once after an update, then stays away", async () => {
    await page.evaluate(() => localStorage.setItem('bench.seenVersion', JSON.stringify('0.4.1')));
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#whats-new').isVisible(), true);
    await page.locator('#whats-new-close').click();
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#whats-new').isVisible(), false);
  });

  test('no errors', () => assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []));
});

describe('a sheet that fails to load', () => {
  test('offers Try again, and the tab flashes when the file changes', async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    const file = path.join(dir, 'docs', 'schematics', 'SFE-03_USB_Port.svg');
    const good = await readFile(file);
    await writeFile(file, '<svg broken');
    const server = await startDevServer(dir);
    const { browser, page } = await openPage(server.url, { width: 1280, height: 900 });
    try {
      await ready(page);
      await page.locator('[role=tab][data-id="SFE-03"]').click();
      await page.locator('#stage-retry').waitFor({ timeout: 15000 });
      await page.locator('#stage-retry').click(); // still broken: it reads it again and says so again
      await page.locator('#stage-retry').waitFor({ timeout: 15000 });
      await writeFile(file, good);
      await page.waitForFunction(() => document.querySelector('[role=tab][data-id="SFE-03"]').classList.contains('flash'), null, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('svg') && document.querySelector('[role=tab][aria-selected=true]').dataset.id === 'SFE-03', null, { timeout: 15000 });
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
