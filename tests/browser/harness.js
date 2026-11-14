// Shared setup for the browser checks: start dev.py, copy fixtures, open the page in a real browser.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURES = path.join(REPO, 'tests', 'fixtures');

/** Running dev.py servers by URL, so a timed-out wait can say whether its server is still alive. */
const servers = new Map();

/** An 8×8 orange PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP438OAFWEXHbQSANXCYsHiPhRjAAAAAElFTkSuQmCC', 'base64');

/** A 16×16 blue PNG. */
export const PNG_16 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPQqPhPEmIY1TCqYfhqAADJNp8Qq0FQ5gAAAABJRU5ErkJggg==', 'base64');

/** Starts dev.py on a folder; port 0 picks a free port. */
/** dev.py serving `folder`, or the app alone (like the website) when folder is null. */
export async function startDevServer(folder, port = 0) {
  const proc = spawn('python', ['dev.py', ...(folder === null ? [] : [folder]), '--port', String(port)], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`dev.py didn't start: ${out}`)), 10000);
    const look = (d) => {
      out += d;
      const m = /http:\/\/127\.0\.0\.1:\d+\//.exec(out);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    proc.stdout.on('data', look);
    proc.stderr.on('data', (d) => { out += d; });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`dev.py exited (${code}): ${out}`)); });
  });
  // A killed process has a signalCode and no exitCode, so track the exit ourselves: stop() may be
  // called twice (a test stops the server, then the after hook does).
  let exited = false;
  let exitInfo = null;
  let output = '';
  proc.stdout.on('data', (d) => { output = (output + d).slice(-2000); });
  proc.stderr.on('data', (d) => { output = (output + d).slice(-2000); });
  const done = new Promise((resolve) => proc.once('exit', (code, signal) => { exited = true; exitInfo = { code, signal }; resolve(); }));
  servers.set(url, { alive: () => !exited, exitInfo: () => exitInfo, output: () => output });
  return {
    url,
    stop: () => {
      if (!exited) proc.kill();
      return done;
    },
  };
}

/** Copies tests/fixtures/<name> (or nothing, for null) into a new temp folder with a space and ö in its name. */
export async function copyFixture(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bench test ö-'));
  if (name) await cp(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

export async function writePng(dir, rel) {
  await writeFile(path.join(dir, rel), TINY_PNG);
}

async function launchBrowser(args = []) {
  if (process.env.BENCH_BROWSER) return chromium.launch({ executablePath: process.env.BENCH_BROWSER, args });
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, args });
    } catch { /* try the next one */ }
  }
  throw new Error('No Chrome or Edge found. Set BENCH_BROWSER to the path of a Chromium-based browser.');
}

/**
 * options: { args, reducedMotion, realParts: true for the library's parts in 3D (else Simple), context: extra newPage options (hasTouch, isMobile…),
 *            before(page): runs before the page loads, e.g. to answer for GitHub with page.route,
 *            tabs: true to open the side panel in its tabs; without it the panel starts on All,
 *            every section in one list, as before 0.8, so a test can reach any section }
 */
export async function openPage(url, viewport, options = {}) {
  const browser = await launchBrowser(options.args);
  const page = await browser.newPage({ viewport, reducedMotion: options.reducedMotion ?? 'reduce', ...(options.context || {}) }); // camera moves are instant, so tests see where they end
  if (!options.tabs) {
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem('bench.panelTab') === null) localStorage.setItem('bench.panelTab', '"all"');
      } catch { /* no storage: the app forgets anyway */ }
    });
  }
  // the 3D view draws 0.8's parts unless a test asks for the library's (0.9), so older checks see what they always saw
  if (!options.realParts) {
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem('bench.parts3d') === null) localStorage.setItem('bench.parts3d', '"simple"');
      } catch { /* no storage */ }
    });
  }
  if (options.before) await options.before(page);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  // When a wait times out, say what the page was doing: unfinished and failed requests, the last
  // console lines and the page's own state. (Hunting an intermittent stall at first load.)
  const pending = new Map();
  const failed = [];
  const lines = [];
  page.on('request', (r) => pending.set(r, `${r.method()} ${r.url()} @${Date.now()}`));
  page.on('requestfinished', (r) => pending.delete(r));
  page.on('requestfailed', (r) => { pending.delete(r); failed.push(`${r.url()}: ${r.failure()?.errorText}`); });
  page.on('console', (m) => { lines.push(`${m.type()}: ${m.text()}`); if (lines.length > 15) lines.shift(); });
  const wait = page.waitForFunction.bind(page);
  page.waitForFunction = async (...args) => {
    try {
      return await wait(...args);
    } catch (error) {
      const pageState = await page.evaluate(() => ({
        ready: document.readyState,
        tabs: document.querySelectorAll('#tabs [role=tab]').length,
        status: document.querySelector('#status')?.textContent,
        sheet: Boolean(document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg, img')),
      })).catch((e) => `unavailable: ${e.message}`);
      const server = servers.get(url);
      const serverState = server ? { alive: server.alive(), exit: server.exitInfo(), output: server.output().slice(-800) } : 'unknown';
      const note = `\n  diagnostics @${Date.now()}: pending=${JSON.stringify([...pending.values()])} failed=${JSON.stringify(failed)}` +
        ` console=${JSON.stringify(lines)} page=${JSON.stringify(pageState)} server=${JSON.stringify(serverState)}`;
      error.message += note;
      error.stack = `${error.stack}${note}`; // the test report prints the stack
      throw error;
    }
  };
  await page.goto(url);
  return { browser, page, problems };
}

/** Waits for the browser to paint once, so view changes have been applied. */
export function nextFrame(page) {
  return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** The shown drawing's (or picture's) box on screen, and the stage's. */
export function boxes(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#sheet-host');
    const shown = host && host.shadowRoot && host.shadowRoot.querySelector('svg, img');
    const plain = (r) => r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    return {
      sheet: plain(shown && shown.getBoundingClientRect()),
      sheetWidthAttr: shown && shown.localName === 'svg' ? Number(shown.getAttribute('width')) : null,
      stage: plain(document.querySelector('#stage').getBoundingClientRect()),
    };
  });
}

/** A plain board-green PNG of the given size, for photo tests (a real photo isn't needed to tap on). */
export function solidPng(width, height, [r, g, b] = [36, 96, 60]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A header tool that waits in the Menu (0.8): opens the menu first if the tool is folded away, then clicks it. */
export async function fromMenu(page, selector) {
  if (!(await page.locator(selector).isVisible())) await page.locator('#menu-toggle').click();
  await page.locator(selector).click();
}
