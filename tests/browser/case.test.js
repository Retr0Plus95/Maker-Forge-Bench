// Bench 1.0.5 "The case" (docs/design/2026-11-27-release-1.0.5-design.md): the project's STL and 3MF parts in the Case
// tab, each with its size, plastic, fit on your printer and what the README says, a Printed tick, a look in 3D, and
// "What you have" at the top of the Guide tab. tests/fixtures/case-like is written like the four-channel bench supply's
// case folder (case/README.md's Files table, stl/), with things wrong on purpose.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { copyFixture, openPage, startDevServer } from './harness.js';

const text = (page, sel) => page.locator(sel).first().textContent();
const part = (p) => `.case-part[data-part="case/${p}"]`;
const allRead = (page) => page.waitForFunction(() => {
  const rows = [...document.querySelectorAll('#case-list .case-part')];
  return rows.length === 7 && rows.every((r) => r.querySelector('.case-part-facts, .case-part-error'));
});
const caseTab = (page) => page.locator('#ptab-case').getAttribute('aria-label');

/** A zip of { name: text }, deflated: a 3MF made in the test. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** A front panel 80 × 50 × 3 mm with a raised label 40 × 10 × 1 mm on it, the label painted in the second filament. */
function twoColourPanel() {
  const box = (w, d, h, [x, y, z]) => {
    const p = (i, j, k) => [x + i * w, y + j * d, z + k * h];
    const quads = [[p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)], [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
      [p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)], [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)], [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)]];
    const out = [];
    for (const [a, b, c, e] of quads) out.push(...a, ...b, ...c, ...a, ...c, ...e);
    return out;
  };
  const tris = [...box(80, 50, 3, [0, 0, 0]), ...box(40, 10, 1, [20, 20, 3])];
  const v = [];
  const t = [];
  for (let i = 0; i < tris.length / 3; i++) v.push(`<vertex x="${tris[i * 3]}" y="${tris[i * 3 + 1]}" z="${tris[i * 3 + 2]}"/>`);
  for (let i = 0; i < tris.length / 9; i++) t.push(`<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"${i >= 12 ? ' paint_color="8"' : ''}/>`);
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zip({ '3D/3dmodel.model': model, 'Metadata/project_settings.config': JSON.stringify({ filament_colour: ['#FFFFFF', '#E02020'] }) });
}

describe('the case: parts to print', () => {
  let server; let browser; let page; let problems; let dir;

  before(async () => {
    dir = await copyFixture('case-like');
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1400, height: 950 }, { tabs: true }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
    await page.waitForFunction(() => document.querySelector('#ptab-case'));
    await page.locator('#ptab-case').click();
    await allRead(page);
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test("every STL and 3MF is a part, in the README's order, with its size, plastic and the README's words", async () => {
    assert.equal(await caseTab(page), 'Case, 0 of 7 done');
    assert.equal(await text(page, '#case h2'), 'Case parts to print');
    const order = await page.locator('#case-list .case-part').evaluateAll((els) => els.map((e) => e.dataset.part));
    assert.deepEqual(order, ['case/stl/box.stl', 'case/stl/lid.stl', 'case/knob.3mf', 'case/stl/long-rail.stl', 'case/stl/tall-post.stl',
      'case/stl/broken.stl', 'case/stl/open-shell.stl'], 'the Files table first, then the rest by name');
    assert.match(await text(page, `${part('stl/box.stl')} .case-part-facts`), /^60 × 40 × 30 mm · about \d+ g of PETG · [\d.]+ m$/);
    assert.match(await text(page, `${part('stl/lid.stl')} .case-part-facts`), /^60 × 40 × 3 mm · /, 'a text STL');
    assert.match(await text(page, `${part('knob.3mf')} .case-part-facts`), /^20 × 20 × 18 mm · /, "a 3MF: the knob and its shaft, placed by the file's own transforms");
    assert.equal(await text(page, `${part('stl/box.stl')} .case-part-what`), 'The box: holds the board on four posts');
    assert.equal(await text(page, `${part('stl/lid.stl')} .case-part-print`), 'Print: PETG, as it lies, no supports');
    assert.equal(await text(page, `${part('stl/tall-post.stl')} .case-part-print`), 'Print: PLA, on its side, supports on', '"same" is the row above');
    assert.match(await text(page, `${part('stl/long-rail.stl')} .case-part-facts`), / of PLA · /, "the README's plastic for the weight");
    assert.match(await text(page, `${part('stl/open-shell.stl')} .case-part-facts`), / of PLA · /, 'and the one you picked where it says nothing');
    assert.match(await text(page, '#case-total'), /^7 parts \(11 to print, counting copies\), about \d+ g of plastic \([\d.]+ m of 1\.75 mm filament\), not counting broken\.stl that couldn't be read\.$/);
    assert.deepEqual(problems, []);
  });

  test("what's wrong: too big for your printer, a file that isn't a model, gaps in a surface", async () => {
    assert.match(await text(page, `${part('stl/long-rail.stl')} .case-part-warnings .warn`), /Too big for your printer \(256 × 256 × 256 mm\) by 44 mm, whichever way it lies\./);
    assert.equal(await text(page, '#case-too-big'), 'long-rail.stl is too big for your printer as it lies.');
    assert.equal(await page.locator(`${part('stl/long-rail.stl')}.warn`).count(), 1);
    assert.equal(await text(page, `${part('stl/broken.stl')} .case-part-error`), "broken.stl isn't a readable STL.");
    assert.ok(await page.locator(`${part('stl/broken.stl')} .case-thumb`).isDisabled(), 'nothing to look at');
    assert.match(await text(page, `${part('stl/open-shell.stl')} .case-part-warnings .info`), /4 open edges\. Slicers usually mend small gaps/);
    assert.equal(await text(page, `${part('stl/box.stl')} .case-part-fit`), 'Fits your printer.');
  });

  test('another printer changes what fits, and your own size too; the choice is kept', async () => {
    await page.selectOption('#case-printer', 'prusa-mk4');
    await page.waitForFunction(() => /Laid on another side/.test(document.querySelector('.case-part[data-part="case/stl/tall-post.stl"]')?.textContent));
    assert.match(await text(page, `${part('stl/tall-post.stl')} .case-part-warnings .warn`), /Too big for your printer \(250 × 210 × 220 mm\) as it lies\. Laid on another side \(30 × 240 × 30 mm\) it fits\./);
    assert.equal(await text(page, '#case-too-big'), '2 parts are too big for your printer as they lie.');
    await page.selectOption('#case-printer', 'own');
    await page.waitForFunction(() => document.querySelectorAll('.case-bed').length === 3);
    await page.locator('.case-bed').first().fill('320');
    await page.locator('.case-bed').first().dispatchEvent('change');
    await page.waitForFunction(() => !document.querySelector('.case-part[data-part="case/stl/long-rail.stl"]').classList.contains('warn'));
    assert.match(await text(page, `${part('stl/long-rail.stl')} .case-part-fit`), /^Fits your printer/);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('bench.printer'))), { id: 'own', bed: [320, 210, 220] }, 'your own size starts from the printer you had');
    await page.selectOption('#case-printer', 'bambu-256');
    await page.waitForFunction(() => document.querySelector('.case-part[data-part="case/stl/long-rail.stl"]').classList.contains('warn'));
  });

  test('Printed is one undo step, counts in the tab and in What you have, and is kept after a reload; Start over clears it', async () => {
    await page.locator(`${part('stl/box.stl')} input[data-printed]`).check();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 7 done');
    assert.equal(await text(page, '#case-progress'), '1 of 7 printed');
    assert.match(await page.locator('#undo').getAttribute('title'), /Printed: box\.stl/);
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 0 of 7 done');
    await page.locator('#redo').click();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 7 done');
    // Ctrl+Z right after a tick, with the focus still on the tick box (it did nothing before 1.0.5)
    await page.locator(`${part('stl/lid.stl')} input[data-printed]`).check();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 2 of 7 done');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.printed), 'case/stl/lid.stl');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 7 done');
    await page.keyboard.press('Control+y');
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 2 of 7 done');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 7 done');
    await page.locator('#case-open-only').check();
    assert.equal(await page.locator('#case-list .case-part').count(), 6, 'Only not printed');
    await page.locator('#case-open-only').uncheck();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#ptab-case')?.getAttribute('aria-label') === 'Case, 1 of 7 done');
    await page.locator('#ptab-case').click();
    await allRead(page);
    assert.ok(await page.locator(`${part('stl/box.stl')} input[data-printed]`).isChecked());
    await page.locator('#ptab-guide').click();
    await page.waitForFunction(() => /1 of 7 printed/.test(document.querySelector('#have [data-have="case"]')?.textContent));
  });

  test('What you have: each piece with how far it has got and what is left; a row opens its tab', async () => {
    await page.locator('#ptab-guide').click();
    const rows = await page.locator('#have-list li').evaluateAll((els) => els.map((e) => e.dataset.have));
    assert.deepEqual(rows, ['parts', 'readme', 'case']);
    assert.match(await text(page, '#have [data-have="parts"]'), /Parts\s*0 of 4 soldered/);
    assert.match(await text(page, '#have [data-have="readme"]'), /README steps\s*0 of 3 done/);
    assert.match(await text(page, '#have [data-have="case"]'), /Case\s*1 of 7 printed, about \d+ g of plastic in all/);
    assert.equal(await text(page, '#have-left'), 'Left to do: 4 parts to solder · 3 README steps · 6 case parts to print.');
    assert.equal(await text(page, '#have .hint'), 'Also in the project: 1 drawing.');
    await page.locator('#have button[data-have="case"]').click();
    await page.waitForFunction(() => document.querySelector('#panel').dataset.tab === 'case');
    assert.ok(await page.locator('#case').isVisible());
    assert.ok(!(await page.locator('#have').isVisible()), 'the Case tab shows only the case');
  });

  test('Start over clears the printed ticks too, and Undo brings them back', async () => {
    await page.locator('#ptab-parts').click();
    await page.locator('#start-over').click();
    await page.locator('#start-over').click();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 0 of 7 done');
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 7 done');
  });

  test('the small pictures, and Look in 3D: the part on your bed, from three sides and close up', async () => {
    await page.locator('#ptab-case').click();
    await page.waitForFunction(() => document.querySelectorAll('#case-list .case-thumb img').length === 6, null, { timeout: 30000 });
    assert.match(await page.locator(`${part('stl/box.stl')} .case-thumb img`).getAttribute('src'), /^data:image\/png;base64,/);
    await page.locator(`${part('knob.3mf')} .case-look`).click();
    await page.waitForFunction(() => document.querySelector('#case-view').open && document.querySelector('#case-view-host canvas'));
    assert.equal(await text(page, '#case-view-title'), 'knob.3mf');
    assert.match(await text(page, '#case-view-facts'), /^20 × 20 × 18 mm · about [\d.]+ g of PETG · fits your printer \(256 × 256 × 256 mm\)$/);
    for (const v of ['#case-view-top', '#case-view-front', '#case-view-part', '#case-view-iso']) await page.locator(v).click();
    const lit = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.querySelector('#case-view-host canvas');
      const probe = document.createElement('canvas');
      probe.width = 64; probe.height = 48;
      const g = probe.getContext('2d');
      g.drawImage(c, 0, 0, 64, 48);
      const px = g.getImageData(0, 0, 64, 48).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      resolve(n);
    }))));
    assert.ok(lit > 50, `the view draws something (${lit} pixels)`);
    await page.locator('#case-view-done').click();
    await page.waitForFunction(() => !document.querySelector('#case-view').open);
    await page.locator(`${part('stl/long-rail.stl')} .case-thumb`).click();
    await page.waitForFunction(() => document.querySelector('#case-view').open);
    assert.match(await text(page, '#case-view-facts'), /too big for your printer as it lies/);
    await page.keyboard.press('Escape');
  });

  test('Copy as text gives the list for paper', async () => {
    await page.locator('#case-copy').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^Case parts to print: bench test ö-\S+\n\n\[x\] case\/stl\/box\.stl {2}60 × 40 × 30 mm, about \d+ g of PETG\n {6}The box: holds the board on four posts\n {6}Print: PETG, upright, no supports\n/);
    assert.match(clip, /\[ \] case\/stl\/broken\.stl {2}\(isn't a readable STL\)/);
    assert.match(clip, / {6}! Too big for your printer/);
  });

  test("the README's Qty column: how many to print, and the plastic for all of them", async () => {
    await page.locator('#ptab-case').click();
    assert.equal(await text(page, `${part('stl/tall-post.stl')} .case-part-count`), ' × 4');
    assert.equal(await page.locator(`${part('stl/box.stl')} .case-part-count`).count(), 0, 'one of a part has no count');
    assert.match(await text(page, `${part('stl/tall-post.stl')} .case-part-facts`), /^30 × 30 × 240 mm · about \d+ g of PLA each \(\d+ g for 4\) · /);
    const clip = await (async () => { await page.locator('#case-copy').click(); return page.evaluate(() => navigator.clipboard.readText()); })();
    assert.match(clip, /\[ \] case\/stl\/tall-post\.stl × 4 {2}30 × 30 × 240 mm, about \d+ g of PLA each/);
  });

  test("a file the README lists that isn't there, a part it doesn't list, and BOM.csv for the rest", async () => {
    assert.match(await text(page, '.case-missing-box'), /^A part file is missing/);
    assert.equal(await text(page, '#case-missing li'), "stl/foot.stl is listed in case/README.md, but isn't in the project.");
    const shell = await page.locator(`${part('stl/open-shell.stl')} .case-part-warnings li`).allTextContents();
    assert.ok(shell.includes("It isn't in the README's parts table."), shell.join(' | '));
    assert.equal(await page.locator(`${part('stl/box.stl')} .case-part-warnings li`).count(), 0, 'a part the table lists, sitting flat on the bed, has nothing to look at');
    assert.equal(await text(page, `${part('stl/broken.stl')} .case-part-what`), 'A spare that was saved wrongly', "BOM.csv's notes where the README says nothing");
    assert.equal(await text(page, `${part('stl/broken.stl')} .case-part-print`), 'Print: ASA');
  });

  test('Fitted: ticks Printed too, is one undo step, counts in What you have and the list for paper, and is kept after a reload', async () => {
    await page.locator('#ptab-case').click();
    await page.locator(`${part('stl/lid.stl')} input[data-fitted]`).check();
    await page.waitForFunction(() => document.querySelector('#case-progress')?.textContent === '2 of 7 printed, 1 fitted');
    assert.ok(await page.locator(`${part('stl/lid.stl')} input[data-printed]`).isChecked(), 'fitted means printed');
    assert.match(await page.locator('#undo').getAttribute('title'), /Fitted: lid\.stl/);
    assert.equal(await page.locator(`${part('stl/lid.stl')}.fitted`).count(), 1);
    await page.locator('#case-copy').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\[x\] case\/stl\/lid\.stl \(fitted\)/);
    await page.locator('#ptab-guide').click();
    await page.waitForFunction(() => /2 of 7 printed, 1 fitted/.test(document.querySelector('#have [data-have="case"]')?.textContent));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#ptab-case')?.getAttribute('aria-label') === 'Case, 2 of 7 done');
    await page.locator('#ptab-case').click();
    await allRead(page);
    assert.ok(await page.locator(`${part('stl/lid.stl')} input[data-fitted]`).isChecked());
    // not printed is not fitted either
    await page.locator(`${part('stl/lid.stl')} input[data-printed]`).uncheck();
    await page.waitForFunction(() => document.querySelector('#case-progress')?.textContent === '1 of 7 printed');
    assert.ok(!(await page.locator(`${part('stl/lid.stl')} input[data-fitted]`).isChecked()));
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('#case-progress')?.textContent === '2 of 7 printed, 1 fitted');
    await page.locator(`${part('stl/lid.stl')} input[data-printed]`).uncheck();
    await page.waitForFunction(() => document.querySelector('#case-progress')?.textContent === '1 of 7 printed');
    assert.deepEqual(problems, []);
  });

  test('a part changed on disk is read again by itself, and a new one is added', async () => {
    const lid = path.join(dir, 'case', 'stl', 'lid.stl');
    const was = await readFile(lid, 'utf8');
    await writeFile(lid, was.replace(/vertex (\S+) (\S+) 3\b/g, 'vertex $1 $2 5'));
    await page.waitForFunction(() => /^60 × 40 × 5 mm/.test(document.querySelector('.case-part[data-part="case/stl/lid.stl"] .case-part-facts')?.textContent || ''), null, { timeout: 15000 });
    await writeFile(path.join(dir, 'case', 'spare.stl'), was);
    await page.waitForFunction(() => document.querySelector('#ptab-case').getAttribute('aria-label') === 'Case, 1 of 8 done', null, { timeout: 15000 });
    assert.deepEqual(problems, []);
  });
  test('Look in 3D: Next and Previous go round the parts that can be shown', async () => {
    await page.locator('#ptab-case').click();
    await page.locator(`${part('stl/box.stl')} .case-look`).click();
    await page.waitForFunction(() => document.querySelector('#case-view').open && document.querySelector('#case-view-title').textContent === 'box.stl');
    await page.locator('#case-view-next').click();
    await page.waitForFunction(() => document.querySelector('#case-view-title').textContent === 'lid.stl');
    await page.locator('#case-view-prev').click();
    await page.waitForFunction(() => document.querySelector('#case-view-title').textContent === 'box.stl');
    await page.locator('#case-view-prev').click();
    await page.waitForFunction(() => document.querySelector('#case-view-title').textContent !== 'box.stl');
    assert.notEqual(await text(page, '#case-view-title'), 'broken.stl', "a part that couldn't be read is skipped");
    await page.locator('#case-view-next').click();
    await page.waitForFunction(() => document.querySelector('#case-view-title').textContent === 'box.stl', null, { timeout: 5000 });
    await page.locator('#case-view-done').click();
  });

  test('a 3MF in two colours is drawn in its colours, in the picture and in 3D', async () => {
    await writeFile(path.join(dir, 'case', 'panel.3mf'), twoColourPanel());
    await page.waitForFunction(() => document.querySelector('.case-part[data-part="case/panel.3mf"] .case-thumb img'), null, { timeout: 30000 });
    await page.locator(`${part('panel.3mf')} .case-look`).click();
    await page.waitForFunction(() => document.querySelector('#case-view').open && document.querySelector('#case-view-title').textContent === 'panel.3mf');
    await page.locator('#case-view-part').click();
    const counts = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.querySelector('#case-view-host canvas');
      const probe = document.createElement('canvas');
      probe.width = 160; probe.height = 120;
      const g = probe.getContext('2d');
      g.drawImage(c, 0, 0, 160, 120);
      const px = g.getImageData(0, 0, 160, 120).data;
      let red = 0; let other = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        if (px[i] > 120 && px[i + 1] < 80 && px[i + 2] < 80) red++; else other++;
      }
      resolve({ red, other });
    }))));
    assert.ok(counts.red > 20, `the label is red (${counts.red} red pixels)`);
    assert.ok(counts.other > counts.red, `and the panel is not (${counts.other} other pixels)`);
    await page.locator('#case-view-done').click();
    assert.deepEqual(problems, []);
  });
});
