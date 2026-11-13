import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceError, folderFiles, githubProblem, githubSource, isProjectFile, parseRepoLink, repoParam, treeToFiles } from '../../src/sources.js';

const FUME = { owner: 'Retr0Plus95', repo: 'Solder-Fume-Extractor', ref: 'HEAD', path: '' };

test('GitHub links in every way people paste them', () => {
  assert.deepEqual(parseRepoLink('Retr0Plus95/Solder-Fume-Extractor'), FUME);
  assert.deepEqual(parseRepoLink('https://github.com/Retr0Plus95/Solder-Fume-Extractor'), FUME);
  assert.deepEqual(parseRepoLink('github.com/Retr0Plus95/Solder-Fume-Extractor.git/'), FUME);
  assert.deepEqual(parseRepoLink('  https://www.github.com/Retr0Plus95/Solder-Fume-Extractor?tab=readme#top '), FUME);
  assert.deepEqual(parseRepoLink('Retr0Plus95/Solder-Fume-Extractor@dev'), { ...FUME, ref: 'dev' });
  assert.deepEqual(parseRepoLink('https://github.com/me/lamps/tree/main/projects/rgb-lamp'), { owner: 'me', repo: 'lamps', ref: 'main', path: 'projects/rgb-lamp' });
  assert.deepEqual(parseRepoLink('https://github.com/me/lamps/blob/main/projects/rgb-lamp/forge-project.json'), { owner: 'me', repo: 'lamps', ref: 'main', path: 'projects/rgb-lamp' });
  assert.deepEqual(parseRepoLink('me/lamps/tree/main'), { owner: 'me', repo: 'lamps', ref: 'main', path: '' });
});

test('anything else is not a repo link', () => {
  for (const bad of ['', 'hello', 'https://gitlab.com/me/lamps', 'me/lamps/issues/3', '../etc/passwd', 'me/..', 'me/lamps/tree/main/../x', 'a b/c', 'me/lamps@a..b', 'x'.repeat(600)]) {
    assert.equal(parseRepoLink(bad), null, bad);
  }
});

test('the link text for a repo goes round', () => {
  assert.equal(repoParam(FUME), 'Retr0Plus95/Solder-Fume-Extractor');
  const deep = { owner: 'me', repo: 'lamps', ref: 'main', path: 'projects/rgb-lamp' };
  assert.equal(repoParam(deep), 'me/lamps/tree/main/projects/rgb-lamp');
  assert.deepEqual(parseRepoLink(repoParam(deep)), deep);
});

test('project files are the drawings, photos, datasheets and project file, as dev.py lists them', () => {
  for (const ok of ['forge-project.json', 'docs/SFE-01.svg', 'my-board/top.JPG', 'images/a.jpeg', 'datasheets/x.pdf', 'b.png']) assert.ok(isProjectFile(ok), ok);
  for (const no of ['README.md', '.github/x.svg', 'node_modules/a/b.svg', 'sub/forge-project.json.bak', 'a/../b.svg', 'x.stl']) assert.ok(!isProjectFile(no), no);
});

test("GitHub's tree becomes the file list, inside the chosen folder, with the git hash as fingerprint", () => {
  const tree = { truncated: false, tree: [
    { path: 'README.md', type: 'blob', size: 10, sha: 'a1' },
    { path: 'docs', type: 'tree', sha: 'b2' },
    { path: 'docs/SFE-01.svg', type: 'blob', size: 2000, sha: 'c3' },
    { path: 'forge-project.json', type: 'blob', size: 900, sha: 'd4' },
    { path: 'Images/b.png', type: 'blob', size: 5, sha: 'e5' },
    { path: 'projects/lamp/forge-project.json', type: 'blob', size: 7, sha: 'f6' },
  ] };
  assert.deepEqual(treeToFiles(tree), [
    { path: 'docs/SFE-01.svg', size: 2000, mtime: 'c3' },
    { path: 'forge-project.json', size: 900, mtime: 'd4' },
    { path: 'Images/b.png', size: 5, mtime: 'e5' },
    { path: 'projects/lamp/forge-project.json', size: 7, mtime: 'f6' },
  ]);
  assert.deepEqual(treeToFiles(tree, 'projects/lamp'), [{ path: 'forge-project.json', size: 7, mtime: 'f6' }]);
  assert.deepEqual(treeToFiles(null), []);
});

test('a folder picked in the browser: paths inside it, project files only', () => {
  const f = (rel, size = 3, lastModified = 5) => ({ webkitRelativePath: rel, name: rel.split('/').pop(), size, lastModified });
  const picked = folderFiles([f('Fume/forge-project.json'), f('Fume/docs/SFE-01.svg', 9, 7), f('Fume/notes.txt'), f('Fume/.git/x.svg')]);
  assert.equal(picked.root, 'Fume');
  assert.deepEqual(picked.files, [{ path: 'docs/SFE-01.svg', size: 9, mtime: 7 }, { path: 'forge-project.json', size: 3, mtime: 5 }]);
  assert.ok(picked.byPath.has('docs/SFE-01.svg'));
  assert.deepEqual(folderFiles([]).files, []);
});

test("GitHub's problems in plain words", () => {
  assert.match(githubProblem(404, FUME), /no public repo Retr0Plus95\/Solder-Fume-Extractor\. Check the link: private repos/);
  assert.match(githubProblem(404, { ...FUME, ref: 'dev' }), /with a branch dev/);
  const headers = new Map([['x-ratelimit-remaining', '0'], ['x-ratelimit-reset', String((1_000_000 + 600) )]]);
  assert.match(githubProblem(403, FUME, headers, 1_000_000 * 1000), /60 repos an hour .* in about 10 minutes/);
  assert.match(githubProblem(500, FUME), /error \(500\)/);
});

test('the GitHub source: one listing call, raw files, and its problems', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.github.com/repos/me/lamps/git/trees/main?recursive=1')) {
      return { ok: true, json: async () => ({ tree: [{ path: 'projects/lamp/a b.svg', type: 'blob', size: 4, sha: 'abc' }] }) };
    }
    if (url === 'https://raw.githubusercontent.com/me/lamps/main/projects/lamp/a%20b.svg') {
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('<svg/>').buffer };
    }
    return { ok: false, status: 404, headers: { get: () => null } };
  };
  const src = githubSource({ owner: 'me', repo: 'lamps', ref: 'main', path: 'projects/lamp' }, fake);
  assert.equal(src.live, false);
  assert.deepEqual(await src.list(), { root: 'lamp', files: [{ path: 'a b.svg', size: 4, mtime: 'abc' }], truncated: false });
  assert.deepEqual(await src.text('a b.svg'), { text: '<svg/>', size: 6 });
  assert.equal(src.fileHref('d/x.pdf'), 'https://github.com/me/lamps/blob/main/projects/lamp/d/x.pdf');
  await assert.rejects(src.text('missing.svg'), (e) => e instanceof SourceError && /couldn't be read from GitHub \(404\)/.test(e.message));
  const gone = githubSource({ owner: 'me', repo: 'nope', ref: 'HEAD', path: '' }, fake);
  await assert.rejects(gone.list(), (e) => e instanceof SourceError && /no public repo me\/nope/.test(e.message));
  const offline = githubSource(FUME, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.list(), /Can't reach GitHub/);
  assert.equal(calls.filter((u) => u.startsWith('https://api.github.com')).length, 2, 'one API call per listing');
});
