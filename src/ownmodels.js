// Bench 0.9 (design §3): your own 3D models, kept in this browser (IndexedDB), never uploaded.
// A look names one as own:<id>, where id is the first 16 hex characters of the file's SHA-256, so the
// same file saved twice is kept once, and a progress file can name it without holding its bytes.

export const OWN_MODEL_LIMIT = 5 * 1024 * 1024;
const DB = 'maker-forge-bench';
const STORE = 'models';

/** Your own model was refused: the message says why, in plain words. */
export class OwnModelError extends Error {}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new OwnModelError("This browser can't keep files, so your own models can't be used here."));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new OwnModelError("This browser wouldn't keep the file (private browsing can stop it)."));
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      tx.onerror = () => reject(new OwnModelError("This browser couldn't keep the file: it may be out of space."));
      tx.onabort = tx.onerror;
    });
  } finally {
    db.close();
  }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Keeps a GLB file you chose. Gives { id, name, bytes }; refuses files over 5 MB or that aren't GLB. */
export async function saveOwnModel(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new OwnModelError('Choose a .glb file.');
  if (file.size > OWN_MODEL_LIMIT) {
    throw new OwnModelError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB: your own models can be up to 5 MB.`);
  }
  const data = await file.arrayBuffer();
  const head = new Uint8Array(data, 0, Math.min(4, data.byteLength));
  if (String.fromCharCode(...head) !== 'glTF') {
    throw new OwnModelError(`${file.name} isn't a GLB (binary glTF) file. Export your model as .glb and try again.`);
  }
  const id = hex(await crypto.subtle.digest('SHA-256', data)).slice(0, 16);
  const name = String(file.name || 'model.glb').slice(0, 80);
  await withStore('readwrite', (store) => store.put({ id, name, bytes: data.byteLength, data, saved: Date.now() }));
  return { id, name, bytes: data.byteLength };
}

/** A model you kept, as bytes, or null. */
export async function ownModelBytes(id) {
  if (!/^[0-9a-f]{16}$/.test(String(id))) return null;
  try {
    const row = await withStore('readonly', (store) => store.get(id));
    return row && row.data instanceof ArrayBuffer ? row.data : null;
  } catch {
    return null;
  }
}

/** Every model you kept: [{ id, name, bytes }], the newest first. */
export async function listOwnModels() {
  try {
    const rows = await withStore('readonly', (store) => store.getAll());
    return (rows || []).sort((a, b) => (b.saved || 0) - (a.saved || 0)).map(({ id, name, bytes }) => ({ id, name, bytes }));
  } catch {
    return [];
  }
}
