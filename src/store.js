// Saved data in the browser (localStorage), always under the "bench." prefix, so Bench never
// touches what other Maker Forge apps at the same address keep. No page code: storage is passed in.

export function createStore(storage, prefix = 'bench.') {
  return {
    get(key, fallback) {
      try {
        const raw = storage.getItem(prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /** False if the browser refuses (storage full or switched off). */
    set(key, value) {
      try {
        storage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(prefix + key);
      } catch { /* nothing to remove */ }
    },
    keys() {
      const found = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) found.push(key.slice(prefix.length));
      }
      return found;
    },
  };
}

/** Where a project's progress is saved: per project and revision, or per folder without a project file. */
export function projectKey(project, root) {
  return `progress:${project ? project.name : root}:${project && project.revision ? project.revision : ''}`;
}
