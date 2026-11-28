// A stand-in for one.com, where Bench is published (forge.retr0plus.se/bench/): plain static files,
// and, like one.com's cache, a visitor's 11th request in progress at once is refused with
// "429 Too Many Requests" (measured on the real host on 2026-09-29, the website's CLAUDE.md).
// Every answer is held back a little, so requests the page sends together really are in progress
// together. It counts the most at once and every refusal, for the check in onecom.test.js.
// It runs in a process of its own (startOneCom forks this file): served from the test's own process,
// next to Playwright, the last two of 32 models never reached the page, though real Apache and dev.py
// delivered them every time.
// It speaks HTTP/2 over https, as one.com does: over plain HTTP/1.1 a browser opens at most 6
// connections to a host, which hides the problem (everything past 6 just waits its turn).

/** A throwaway self-signed certificate for 127.0.0.1 (the browser is told to accept it). */
function certificate() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'onecom-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
  return { key: readFileSync(path.join(dir, 'key.pem')), cert: readFileSync(path.join(dir, 'cert.pem')) };
}
import { execFileSync, fork } from 'node:child_process';
import { createSecureServer } from 'node:http2';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

/** Serves `root` under `base` (default /bench/). limit: how many at once one.com allows; delay: ms per answer. */
async function serve(root, { base = '/bench/', limit = 10, delay = 120, csp = '' } = {}) {
  const stats = { peak: 0, refused: [], files: [] };
  let now = 0;
  const server = createSecureServer({ ...certificate(), allowHTTP1: false });
  server.on('stream', async (stream, head) => {
    stream.on('error', () => {}); // the browser may cancel a request; nothing to do
    const send = (status, headers, body) => {
      if (stream.destroyed) return;
      stream.respond({ ':status': status, 'content-length': body.length, ...headers });
      stream.end(body);
    };
    if (now >= limit) {
      stats.refused.push(head[':path']);
      send(429, { 'retry-after': '5', 'content-type': 'text/plain' }, Buffer.from('Too Many Requests'));
      return;
    }
    now += 1;
    stats.peak = Math.max(stats.peak, now);
    try {
      await new Promise((r) => setTimeout(r, delay));
      const url = new URL(head[':path'], 'https://x');
      if (!url.pathname.startsWith(base)) throw new Error('outside');
      let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('outside');
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      stats.files.push(rel);
      const info = await stat(file);
      const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff',
        // what Apache sends with every file (one.com is Apache)
        'last-modified': info.mtime.toUTCString(), etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"` };
      if (csp && rel.endsWith('.html')) headers['content-security-policy'] = csp;
      send(200, headers, body);
    } catch {
      send(404, { 'content-type': 'text/plain' }, Buffer.from('Not found'));
    } finally {
      now -= 1;
    }
  });
  const sessions = new Set();
  server.on('session', (s) => { sessions.add(s); s.on('close', () => sessions.delete(s)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `https://127.0.0.1:${server.address().port}${base}`;
  return { url, stats, stop: () => new Promise((r) => { for (const s of sessions) s.destroy(); server.close(r); }) };
}

/**
 * Starts the stand-in in its own process, serving `root` under base (default /bench/). Options: limit (how
 * many at once one.com allows, 10), delay (ms per answer, 120), csp (sent with HTML). Returns { url,
 * stats(): { peak, refused, files }, stop() }.
 */
export async function startOneCom(root, options = {}) {
  const child = fork(fileURLToPath(import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const ask = (msg) => new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.send(msg);
  });
  const { url } = await ask({ start: { root, options } });
  return {
    url,
    stats: () => ask({ stats: true }),
    stop: async () => { if (child.connected) await ask({ stop: true }); },
  };
}

if (process.send && process.argv[1] === fileURLToPath(import.meta.url)) {
  let site = null;
  process.on('message', async (msg) => {
    if (msg.start) {
      site = await serve(msg.start.root, msg.start.options);
      process.send({ url: site.url });
    } else if (msg.stats) {
      process.send(site.stats);
    } else if (msg.stop) {
      await site.stop();
      process.send({ stopped: true });
      process.disconnect();
    }
  });
}
