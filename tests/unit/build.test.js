// The packed copy for the website (tools/build.mjs): one script to start, Bench's own browser rules in
// its folder written the one way Apache replaces the site's (see htaccess() for why), and in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBench, htaccess } from '../../tools/build.mjs';

const REPO = new URL('../../', import.meta.url);
const csp = (await readFile(new URL('deploy/csp.txt', REPO), 'utf8')).trim();
const out = path.join(await mkdtemp(path.join(os.tmpdir(), 'bench-build-')), 'bench');
const built = await buildBench(out);

test('index.html starts one hashed script and one hashed stylesheet, both there', async () => {
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(built.appFile, /^app-[A-Z0-9]{8}\.js$/);
  assert.match(built.cssFile, /^style-[0-9a-f]{8}\.css$/);
  assert.ok(html.includes(`src="${built.appFile}"`) && html.includes(`href="${built.cssFile}"`));
  assert.ok(!/src="app\.js"|href="style\.css"/.test(html), 'no src/ names left');
  const files = await readdir(out);
  for (const f of [built.appFile, built.cssFile, 'library', '.htaccess', 'LICENSE', 'THREE-LICENSE']) assert.ok(files.includes(f), f);
  assert.equal(files.filter((f) => f.endsWith('.js')).length, 1, 'the rest of the scripts are in js/, loaded when the 3D view opens');
});

test("the page carries Bench's rules too, without frame-ancestors (a <meta> policy can't say it)", async () => {
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
  assert.ok(meta, 'a <meta> policy');
  assert.ok(meta.includes("script-src 'self'") && meta.includes('trusted-types bench-svg'));
  assert.ok(!meta.includes('frame-ancestors'));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'before any script');
});

test('.htaccess: the policy with "Header always set" (replaces the site\'s), Cache-Control with plain "Header set"', async () => {
  const text = await readFile(path.join(out, '.htaccess'), 'utf8');
  assert.equal(text, htaccess(csp));
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('Header'));
  for (const l of lines.filter((x) => /Content-Security-Policy|X-Content-Type|Referrer|Cross-Origin/.test(x))) assert.match(l, /^Header always set /, l);
  for (const l of lines.filter((x) => /Cache-Control/.test(x))) assert.match(l, /^Header set /, l);
  assert.ok(text.includes(`"${csp}"`));
});

test('a policy that would break the .htaccess line is refused', () => {
  assert.throws(() => htaccess('default-src "self"'), /one line without quotes/);
  assert.throws(() => htaccess("default-src 'none'\nHeader unset X"), /one line/);
});
