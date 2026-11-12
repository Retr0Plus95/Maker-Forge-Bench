// Shared setup for the browser checks: start dev.py, copy fixtures, open the page in a real browser.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURES = path.join(REPO, 'tests', 'fixtures');

/** An 8×8 orange PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP438OAFWEXHbQSANXCYsHiPhRjAAAAAElFTkSuQmCC', 'base64');

export async function startDevServer(folder) {
  const proc = spawn('python', ['dev.py', folder, '--port', '0'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const done = new Promise((resolve) => proc.once('exit', () => { exited = true; resolve(); }));
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

async function launchBrowser() {
  if (process.env.BENCH_BROWSER) return chromium.launch({ executablePath: process.env.BENCH_BROWSER });
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch { /* try the next one */ }
  }
  throw new Error('No Chrome or Edge found. Set BENCH_BROWSER to the path of a Chromium-based browser.');
}

export async function openPage(url, viewport) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
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
