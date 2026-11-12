// Where the files come from. Release 0.1: the dev server (dev.py) only.

export class ServerError extends Error {}

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
