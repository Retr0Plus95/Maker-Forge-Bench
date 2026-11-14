// Where the files come from (0.7 design §1): dev.py on this computer, a public GitHub repo, or a
// folder picked in the browser. Every source has the same shape:
//   { kind, label, live, list() → { root, files }, text(path) → { text, size },
//     imageUrl(path, print) → address for an <img>, fileHref(path) → address to open a file at }
// files: [{ path, size, mtime }]; mtime is a fingerprint (a time, or a git hash) that changes with the file.

export class ServerError extends Error {}

/** A problem with a GitHub repo or a picked folder. The message is in plain words, for the page. */
export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

const PROJECT_FILE = 'forge-project.json';
const PROJECT_EXT = /\.(svg|png|jpe?g|pdf|glb|wrl)$/i; // 3D models (0.9) are never shown as sheets
const MAX_FILES = 5000;

/** A drawing, photo, datasheet or the project file, outside hidden folders and node_modules (as dev.py). */
export function isProjectFile(path) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  if (!name || parts.some((p) => p === '' || p === '.' || p === '..')) return false;
  if (parts.slice(0, -1).some((p) => p.startsWith('.') || p === 'node_modules')) return false;
  return name === PROJECT_FILE || PROJECT_EXT.test(name);
}

const byName = (a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : a.path.toLowerCase() > b.path.toLowerCase() ? 1 : 0);

// ---- this computer, with dev.py ----

export function projectUrl(path, mtime) {
  return '/project/' + path.split('/').map(encodeURIComponent).join('/') + '?v=' + encodeURIComponent(String(mtime));
}

async function get(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ServerError("Can't reach dev.py");
  }
  if (!response.ok) throw new ServerError(`dev.py answered ${response.status}`);
  return response;
}

/** @returns {Promise<{ root: string, files: { path: string, size: number, mtime: number }[] }>} */
export async function listProject() {
  return (await get('/api/files')).json();
}

/** @returns {Promise<{ text: string, size: number }>} */
export async function fetchText(path) {
  const bytes = await (await get(projectUrl(path, Date.now()))).arrayBuffer();
  return { text: new TextDecoder('utf-8').decode(bytes), size: bytes.byteLength };
}

export function localSource() {
  return {
    kind: 'local',
    label: 'Auto-refresh on',
    live: true,
    list: listProject,
    text: fetchText,
    imageUrl: async (path, mtime) => projectUrl(path, mtime),
    fileHref: (path) => projectUrl(path, 0),
    /** A file's bytes; a KiCad .wrl comes back as GLB, converted by dev.py. */
    async bytes(path) {
      const url = /\.wrl$/i.test(path) ? '/api/glb/' + path.split('/').map(encodeURIComponent).join('/') : projectUrl(path, Date.now());
      return (await get(url)).arrayBuffer();
    },
    wrl: true,
  };
}

// ---- a public GitHub repo ----

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;
const SEGMENT = /^[^\s/\\?#:*"<>|]{1,200}$/;

/**
 * A GitHub repo from what was pasted or linked: "owner/name", "owner/name@branch",
 * "github.com/owner/name", ".../tree/branch/sub/folder" or ".../blob/branch/folder/file".
 * Gives { owner, repo, ref, path } (ref 'HEAD' for the default branch, path '' for the top), or null.
 */
export function parseRepoLink(text) {
  let t = String(text || '').trim();
  if (!t || t.length > 500) return null;
  t = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[?#].*$/, '');
  if (/^github\.com\//i.test(t)) t = t.slice('github.com/'.length);
  else if (/^[^/@]*\.[a-z]{2,}\//i.test(t)) return null; // another website
  t = t.replace(/\/+$/, '');
  const parts = t.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  let repo = parts[1];
  let ref = 'HEAD';
  const at = repo.indexOf('@');
  if (at > 0) {
    ref = repo.slice(at + 1);
    repo = repo.slice(0, at);
  }
  repo = repo.replace(/\.git$/i, '');
  let rest = parts.slice(2);
  if (rest.length) {
    if ((rest[0] === 'tree' || rest[0] === 'blob') && rest.length >= 2 && ref === 'HEAD') {
      const kind = rest[0];
      ref = rest[1];
      rest = rest.slice(2);
      if (kind === 'blob' && rest.length && /\.[A-Za-z0-9]{1,8}$/.test(rest[rest.length - 1])) rest = rest.slice(0, -1); // a file: its folder
    } else {
      return null;
    }
  }
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  if (!REF.test(ref) || ref.split('/').some((p) => p === '' || p === '.' || p === '..') || ref.includes('..')) return null;
  if (!rest.every((p) => SEGMENT.test(p) && p !== '.' && p !== '..')) return null;
  return { owner, repo, ref, path: rest.join('/') };
}

/** The shortest link text for a repo spec: "owner/name", or "owner/name/tree/branch/folder". */
export function repoParam(spec) {
  if (spec.ref === 'HEAD' && !spec.path) return `${spec.owner}/${spec.repo}`;
  return `${spec.owner}/${spec.repo}/tree/${spec.ref}${spec.path ? `/${spec.path}` : ''}`;
}

/** GitHub's tree listing as Bench's files, relative to the folder `base` ('' for the top). */
export function treeToFiles(tree, base = '') {
  const prefix = base ? `${base}/` : '';
  const files = [];
  for (const item of (tree && Array.isArray(tree.tree) ? tree.tree : [])) {
    if (!item || item.type !== 'blob' || typeof item.path !== 'string' || !item.path.startsWith(prefix)) continue;
    const path = item.path.slice(prefix.length);
    if (!isProjectFile(path)) continue;
    files.push({ path, size: Number.isFinite(item.size) ? item.size : 0, mtime: String(item.sha || '') });
    if (files.length >= MAX_FILES) break;
  }
  return files.sort(byName);
}

const enc = (path) => path.split('/').map(encodeURIComponent).join('/');

/** A plain-words message for a failed GitHub listing. */
export function githubProblem(status, spec, headers = { get: () => null }, now = Date.now()) {
  const name = `${spec.owner}/${spec.repo}`;
  if (status === 404) {
    return `GitHub has no public repo ${name}${spec.ref !== 'HEAD' ? ` with a branch ${spec.ref}` : ''}. Check the link: private repos can't be opened.`;
  }
  if ((status === 403 || status === 429) && headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
    const minutes = Number.isFinite(reset) && reset > now ? Math.max(1, Math.ceil((reset - now) / 60000)) : null;
    return `GitHub lets a browser open 60 repos an hour without signing in, and they're used up. Try again${minutes ? ` in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : ' later'}.`;
  }
  return `GitHub answered with an error (${status}). Try again in a minute.`;
}

/** A public GitHub repo: one API call to list, files from raw.githubusercontent.com. */
export function githubSource(spec, fetchFn = (...args) => fetch(...args)) {
  const top = spec.path ? `${spec.path}/` : '';
  const raw = (path, print) => `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${enc(spec.ref)}/${enc(top + path)}${print ? `?v=${encodeURIComponent(String(print).slice(0, 12))}` : ''}`;
  const images = new Map();
  async function getRaw(path, print) {
    let response;
    try {
      response = await fetchFn(raw(path, print));
    } catch {
      throw new SourceError("Can't reach GitHub. Check the connection and try again.");
    }
    if (!response.ok) throw new SourceError(`${path} couldn't be read from GitHub (${response.status}).`);
    return response;
  }
  return {
    kind: 'github',
    label: 'From GitHub',
    live: false,
    spec,
    async list() {
      let response;
      try {
        response = await fetchFn(`https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${enc(spec.ref)}?recursive=1`,
          { headers: { Accept: 'application/vnd.github+json' } });
      } catch {
        throw new SourceError("Can't reach GitHub. Check the connection and try again.");
      }
      if (!response.ok) throw new SourceError(githubProblem(response.status, spec, response.headers));
      const tree = await response.json();
      const root = spec.path ? spec.path.split('/').pop() : spec.repo;
      return { root, files: treeToFiles(tree, spec.path), truncated: Boolean(tree.truncated) };
    },
    async text(path) {
      const bytes = await (await getRaw(path)).arrayBuffer();
      return { text: new TextDecoder('utf-8').decode(bytes), size: bytes.byteLength };
    },
    async imageUrl(path, print) {
      const key = `${path}|${print}`;
      if (!images.has(key)) {
        const blob = await (await getRaw(path, print)).blob();
        images.set(key, URL.createObjectURL(blob));
      }
      return images.get(key);
    },
    fileHref: (path) => `https://github.com/${spec.owner}/${spec.repo}/blob/${enc(spec.ref)}/${enc(top + path)}`,
    /** A file's bytes (a .wrl needs dev.py to become a model: null). */
    async bytes(path) {
      if (/\.wrl$/i.test(path)) return null;
      return (await getRaw(path)).arrayBuffer();
    },
    wrl: false,
  };
}

// ---- a folder picked in the browser ----

/**
 * The files of a folder picked with <input type=file webkitdirectory>: each File's
 * webkitRelativePath starts with the folder's own name. Gives { root, files, byPath }.
 */
export function folderFiles(fileList) {
  const all = [...(fileList || [])];
  const root = all.length ? String(all[0].webkitRelativePath || all[0].name).split('/')[0] : '';
  const files = [];
  const byPath = new Map();
  for (const file of all) {
    const rel = String(file.webkitRelativePath || file.name);
    const path = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
    if (!isProjectFile(path)) continue;
    files.push({ path, size: file.size, mtime: file.lastModified });
    byPath.set(path, file);
    if (files.length >= MAX_FILES) break;
  }
  return { root, files: files.sort(byName), byPath };
}

/** A folder picked in the browser: nothing is uploaded, the browser reads the files. */
export function folderSource(picked) {
  const urls = new Map();
  const fileOf = (path) => {
    const file = picked.byPath.get(path);
    if (!file) throw new SourceError(`${path} isn't in the folder you opened.`);
    return file;
  };
  const urlOf = (path) => {
    if (!urls.has(path)) urls.set(path, URL.createObjectURL(fileOf(path)));
    return urls.get(path);
  };
  return {
    kind: 'folder',
    label: 'From a folder',
    live: false,
    async list() {
      return { root: picked.root, files: picked.files };
    },
    async text(path) {
      const file = fileOf(path);
      let text;
      try {
        text = await file.text();
      } catch {
        throw new SourceError(`${path} couldn't be read. If it changed, open the folder again.`);
      }
      return { text, size: file.size };
    },
    imageUrl: async (path) => urlOf(path),
    fileHref: (path) => (picked.byPath.has(path) ? urlOf(path) : null),
    /** A file's bytes (a .wrl needs dev.py to become a model: null). */
    async bytes(path) {
      if (/\.wrl$/i.test(path)) return null;
      return fileOf(path).arrayBuffer();
    },
    wrl: false,
  };
}
