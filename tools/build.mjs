#!/usr/bin/env node
// Packs Bench for the website (forge.retr0plus.se/bench/): `npm run build` → dist/bench/.
//
// Why: one.com, which hosts the site, refuses a visitor's 11th request in progress at once (its cache
// answers "429 Too Many Requests"). src/ is about 60 script files that a browser asks for together
// over HTTP/2, so Bench straight from src/ doesn't start there (tests/browser/onecom.test.js shows it).
// Here esbuild joins them into one script, plus a few pieces loaded only when the 3D view opens.
//
// File names carry a hash of their contents (app-1a2b3c4d.js), so the website can keep them for a
// year and a new release is never mixed with an old one. index.html is the only file without one.
// Everything else in src/ (the fonts, the parts library and its models) is copied as it is.
// No page code changes: dev.py keeps serving src/ for work on the PC.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.join(REPO, 'src');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'dist', 'bench'));

/**
 * Bench's own browser rules for its folder. "Header always set" and nothing else: the site's top folder
 * sets Maker Forge's looser rules with "always set", and Apache keeps the two kinds apart, so a plain
 * "Header set" here sends BOTH policies and the browser obeys both. Bench then can't reach GitHub or
 * Claude. Cache-Control is the other way round: the top folder uses a plain "Header set" for it, so this
 * does too, or both values go out. (Checked in Apache 2.4.58, 2026-11-28; tests/unit/build.test.js.)
 */
export function htaccess(csp) {
  if (/["\r\n]/.test(csp)) throw new Error('deploy/csp.txt must be one line without quotes');
  return `# Maker Forge Bench (forge.retr0plus.se/bench/). Written by Bench's tools/build.mjs: change deploy/csp.txt, not this.
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${csp}"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  <FilesMatch "-[A-Za-z0-9]{8}\\.(js|css)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "^index\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`;
}

const hash8 = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 8);

export async function buildBench(out = OUT) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const result = await build({
    entryPoints: [path.join(SRC, 'app.js')],
    bundle: true,
    splitting: true, // the dynamic import()s (three.js and the 3D views) stay separate and load when asked for
    format: 'esm',
    target: ['es2022'],
    minify: true,
    legalComments: 'linked', // three.js's licence line goes to a .LEGAL.txt next to its piece
    entryNames: 'app-[hash]',
    chunkNames: 'js/[name]-[hash]',
    outdir: out,
    metafile: true,
    logLevel: 'warning',
  });
  const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint)[0];
  const appFile = path.relative(out, path.resolve(REPO, entry)).split(path.sep).join('/');

  // style.css with a hash in its name; the fonts it names keep theirs (they never change)
  const css = await readFile(path.join(SRC, 'style.css'));
  const cssFile = `style-${hash8(css)}.css`;
  await writeFile(path.join(out, cssFile), css);

  let html = await readFile(path.join(SRC, 'index.html'), 'utf8');
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`index.html no longer has ${from}: update tools/build.mjs`);
    html = html.replace(from, to);
  };
  swap('<link rel="stylesheet" href="style.css">', `<link rel="stylesheet" href="${cssFile}">`);
  swap('<script type="module" src="app.js"></script>', `<script type="module" src="${appFile}"></script>`);
  // The same rules in the page, for a host that ignores .htaccess headers (the website's rule). A <meta>
  // policy can't say frame-ancestors; the .htaccess below does.
  const csp = (await readFile(path.join(REPO, 'deploy', 'csp.txt'), 'utf8')).trim();
  const metaCsp = csp.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith('frame-ancestors')).join('; ');
  swap('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${metaCsp}">`);
  await writeFile(path.join(out, 'index.html'), html);
  await writeFile(path.join(out, '.htaccess'), htaccess(csp));

  for (const name of await readdir(SRC)) {
    if (name.endsWith('.woff2')) await cp(path.join(SRC, name), path.join(out, name));
  }
  await cp(path.join(SRC, 'library'), path.join(out, 'library'), { recursive: true });
  for (const name of ['LICENSE', 'THREE-LICENSE', 'FONTS-LICENSE.md']) await cp(path.join(REPO, name), path.join(out, name));

  const scripts = Object.keys(result.metafile.outputs).filter((f) => f.endsWith('.js')).length;
  return { out, appFile, cssFile, scripts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, appFile, scripts } = await buildBench();
  console.log(`Bench packed into ${path.relative(process.cwd(), out) || out}: ${appFile} and ${scripts - 1} pieces for the 3D view`);
}
