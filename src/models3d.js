// Bench 0.9 (design §2): the Maker Forge Library's models, loaded once each and handed out as copies.

/** Only the library's own model files are asked for: a name like models/led-d5.0.glb. */
const SAFE_FILE = /^models\/[a-z0-9][a-z0-9._-]*\.glb$/;

/**
 * createModels(THREE, { GLTFLoader, fetchBytes }): fetchBytes(file) gives the file's bytes (an
 * ArrayBuffer) or null. Returns:
 * - get(file): a fresh copy of the model (its own materials, so it can be painted), or null when
 *   the file is missing or isn't a model; each file is fetched and read once
 * - progress(): { asked, done, failed }
 */
export function createModels(THREE, { GLTFLoader, fetchBytes }) {
  const cache = new Map();
  const loader = new GLTFLoader();
  let asked = 0;
  let done = 0;
  let failed = 0;
  const read = (bytes) => new Promise((resolve, reject) => loader.parse(bytes, '', resolve, reject));
  function load(file) {
    if (!cache.has(file)) {
      cache.set(file, (async () => {
        if (!SAFE_FILE.test(String(file))) return null;
        try {
          const bytes = await fetchBytes(file);
          if (!bytes || bytes.byteLength < 20) return null;
          const head = new DataView(bytes);
          if (head.getUint32(0, true) !== 0x46546c67) return null; // 'glTF': anything else isn't a model
          const gltf = await read(bytes);
          return gltf && gltf.scene ? gltf.scene : null;
        } catch {
          return null;
        }
      })());
    }
    return cache.get(file);
  }
  return {
    async get(file) {
      asked += 1;
      const scene = await load(file);
      if (!scene) {
        failed += 1;
        return null;
      }
      done += 1;
      const copy = scene.clone(true);
      copy.traverse((obj) => {
        if (obj.isMesh) obj.material = obj.material.clone();
      });
      return copy;
    },
    progress: () => ({ asked, done, failed }),
  };
}
