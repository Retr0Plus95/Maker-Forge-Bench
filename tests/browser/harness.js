// Shared setup for the browser checks: start dev.py, copy fixtures, open the page in a real browser.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
export async function startDevServer(folder, port = 0) {
  const proc = spawn('python', ['dev.py', folder, '--port', String(port)], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
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

export async function openPage(url, viewport, options = {}) {
  const browser = await launchBrowser(options.args);
  const page = await browser.newPage({ viewport });
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
        tabs: document.querySelectorAll('[role=tab]').length,
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
