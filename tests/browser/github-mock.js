// Answers for GitHub in browser tests (0.7): the tests never reach the real GitHub. A folder on
// disk plays the repo: its files are listed by the tree API and served by raw.githubusercontent.com.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.pdf': 'application/pdf' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset' };

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Plays GitHub for `owner/repo` from `dir`. Returns { calls, state }: calls lists every URL asked
 * for; state.mode can be set to 'ok', 'missing' (404) or 'limited' (the hourly limit used up).
 */
export async function fakeGithub(page, dir, owner, repo) {
  const calls = [];
  const state = { mode: 'ok' };
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const want = `https://api.github.com/repos/${owner}/${repo}/git/trees/`;
    if (state.mode === 'limited') {
      await route.fulfill({ status: 403, headers: { ...CORS, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 25 * 60) }, contentType: 'application/json', body: '{"message":"API rate limit exceeded"}' });
      return;
    }
    if (state.mode === 'missing' || !url.startsWith(want)) {
      await route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"message":"Not Found"}' });
      return;
    }
    const tree = [];
    for (const rel of await walk(dir)) {
      const bytes = await readFile(path.join(dir, rel));
      tree.push({ path: rel, type: 'blob', size: bytes.length, sha: createHash('sha1').update(bytes).digest('hex') });
    }
    await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ sha: 'tree', tree, truncated: false }) });
  });
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.href);
    const parts = url.pathname.split('/').slice(1).map(decodeURIComponent); // owner, repo, ref, ...path
    if (parts[0] !== owner || parts[1] !== repo) {
      await route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
      return;
    }
    const rel = parts.slice(3).join('/');
    try {
      const body = await readFile(path.join(dir, rel));
      await route.fulfill({ status: 200, headers: CORS, contentType: TYPES[path.extname(rel).toLowerCase()] || 'text/plain', body });
    } catch {
      await route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
    }
  });
  return { calls, state };
}
