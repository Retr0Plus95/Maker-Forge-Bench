import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, solidPng, startDevServer } from './harness.js';
import { fakeGithub } from './github-mock.js';

const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const OWNER = 'Retr0Plus95';
const REPO = 'Solder-Fume-Extractor';
const tabs = (page) => page.locator('#tabs [role=tab]').allTextContents();

async function makeRepo() {
  const dir = await copyFixture('fume-extractor');
  await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
  await mkdir(path.join(dir, 'my-board'));
  await writeFile(path.join(dir, 'my-board', 'board-top.png'), solidPng(300, 200));
  await writeFile(path.join(dir, 'README.md'), '# not a drawing');
  return dir;
}

describe('opening projects from GitHub, a folder, or the start screen (no dev.py folder)', () => {
  let server; let browser; let page; let problems; let github; let repoDir;

  before(async () => {
    repoDir = await makeRepo();
    server = await startDevServer(null); // the app alone, like the website
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 850 }, {
      before: async (p) => { github = await fakeGithub(p, repoDir, OWNER, REPO); },
    }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('without a folder or a link, the start screen offers GitHub, a folder and the examples', async () => {
    await page.waitForFunction(() => !document.querySelector('#start').hidden);
    assert.equal(await page.locator('#start-title').textContent(), 'Open a project');
    assert.equal(await page.locator('#workspace').isVisible(), false);
    assert.equal(await page.locator('#start-examples a[data-example="fume"]').getAttribute('href'), `?repo=${OWNER}/${REPO}`);
    await page.locator('#start-repo').fill('https://gitlab.com/me/lamps');
    await page.locator('#start-repo').press('Enter');
    assert.match(await page.locator('#start-why').textContent(), /isn't a GitHub repo link/);
  });

  test('a pasted GitHub link opens the repo: one listing call, its sheets, and the From GitHub badge', async () => {
    github.calls.length = 0;
    await page.locator('#start-repo').fill(`https://github.com/${OWNER}/${REPO}`);
    await page.locator('#start-repo-open').click();
    await page.waitForURL(`**/?repo=${OWNER}/${REPO}`);
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot?.querySelector('svg'));
    const names = await tabs(page);
    assert.ok(names.some((t) => t.startsWith('SFE-04')) && names.includes('board-top'), names.join(' | '));
    assert.match(await page.locator('#project-name').textContent(), /Solder Fume Extractor \(Rev D\)/);
    assert.match(await page.locator('#live').textContent(), /^From GitHub: Retr0Plus95\/Solder-Fume-Extractor · read \d\d:\d\d ↻$/);
    assert.equal(github.calls.filter((u) => u.startsWith('https://api.github.com')).length, 1);
    assert.equal(await page.locator('#start').isVisible(), false);
  });

  test('a photo from GitHub shows from an in-memory copy', async () => {
    await page.getByRole('tab', { name: 'board-top', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img'));
    assert.match(await page.evaluate(() => document.querySelector('#sheet-host').shadowRoot.querySelector('img').src), /^blob:/);
  });

  test('a link to a part opens there, keeps the repo, and Copy link includes it', async () => {
    await page.goto(`${server.url}?repo=${OWNER}/${REPO}&sheet=SFE-04&part=R6`);
    await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R6');
    assert.equal(await page.locator('#tabs [role=tab][aria-selected=true]').textContent(), 'SFE-04 Perfboard layout');
    await page.waitForFunction(() => !window.location.search.includes('part='));
    assert.equal(new URL(page.url()).search, `?repo=${OWNER}/${REPO}`);
    await page.locator('#part-link').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${server.url}?repo=${OWNER}/${REPO}&sheet=SFE-04&part=R6`);
  });

  test('the badge reads the repo again and reloads only what changed', async () => {
    const file = path.join(repoDir, 'docs', 'layout', 'SFE-D1_Pot_Detail.svg');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace('</svg>', '<text x="1" y="1">CHANGED-ON-GITHUB</text></svg>'));
    github.calls.length = 0;
    await page.locator('#source-refresh').click();
    await page.getByRole('tab', { name: /^SFE-D1/ }).click();
    await page.waitForFunction(() => [...document.querySelector('#sheet-host').shadowRoot.querySelectorAll('text')].some((t) => t.textContent === 'CHANGED-ON-GITHUB'));
    assert.equal(github.calls.filter((u) => u.startsWith('https://api.github.com')).length, 1, 'one listing call');
    const raws = github.calls.filter((u) => u.startsWith('https://raw.githubusercontent.com'));
    assert.ok(raws.some((u) => u.includes('SFE-D1')) && !raws.some((u) => u.includes('SFE-01')), raws.join('\n'));
  });

  test("GitHub's problems are said in plain words on the start screen", async () => {
    github.state.mode = 'missing';
    await page.goto(`${server.url}?repo=${OWNER}/${REPO}`);
    await page.waitForFunction(() => !document.querySelector('#start').hidden);
    assert.match(await page.locator('#start-why').textContent(), /no public repo Retr0Plus95\/Solder-Fume-Extractor\. Check the link: private repos can't be opened\./);
    github.state.mode = 'limited';
    await page.goto(`${server.url}?repo=${OWNER}/${REPO}`);
    await page.waitForFunction(() => /60 repos an hour/.test(document.querySelector('#start-why').textContent));
    assert.match(await page.locator('#start-why').textContent(), /in about 25 minutes/);
    github.state.mode = 'ok';
    await page.goto(`${server.url}?repo=not a link`);
    await page.waitForFunction(() => /isn't a GitHub repo: not a link/.test(document.querySelector('#start-why').textContent));
  });

  test('Open a folder reads a folder on this computer, nothing uploaded', async () => {
    await page.goto(server.url);
    await page.waitForFunction(() => !document.querySelector('#start').hidden);
    github.calls.length = 0;
    await page.locator('#start-folder').setInputFiles(repoDir);
    await page.waitForFunction(() => document.querySelector('#sheet-host').shadowRoot?.querySelector('svg'));
    assert.ok((await tabs(page)).some((t) => t.startsWith('SFE-01')));
    assert.match(await page.locator('#live').textContent(), /^From a folder · read/);
    assert.deepEqual(github.calls, []);
  });

  test('no page errors (and nothing broke the page rules)', () => {
    // the browser logs the answers these tests asked for: dev.py without a folder, GitHub's 404 and limit
    const expected = /^console: Failed to load resource: the server responded with a status of (404 \(No project folder: open one in the page\.\)|404 \(Not Found\)|403 \(Forbidden\))$/;
    assert.deepEqual(problems.filter((p) => !expected.test(p)), []);
  });
});

describe('a repo link wins under dev.py', () => {
  test('dev.py with a folder, opened with ?repo=, shows the repo', async () => {
    const repoDir = await makeRepo();
    const server = await startDevServer(await copyFixture('kicad-like'));
    const { browser, page, problems } = await openPage(`${server.url}?repo=${OWNER}/${REPO}`, { width: 1280, height: 850 }, {
      before: (p) => fakeGithub(p, repoDir, OWNER, REPO),
    });
    try {
      await page.waitForFunction(() => document.querySelectorAll('#tabs [role=tab]').length > 0);
      assert.ok((await tabs(page)).some((t) => t.startsWith('SFE-04')));
      assert.match(await page.locator('#live').textContent(), /^From GitHub/);
      assert.deepEqual(problems, []);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
