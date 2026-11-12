// What's in a project. Release 0.1: the sheets, worked out from a folder's files (design §6,
// "With no project file"). The forge-project.json reader comes in 0.2. No page code.

const TYPES = { svg: 'svg', png: 'png', jpg: 'jpg', jpeg: 'jpg' };
const RANK = { svg: 0, png: 1, jpg: 2 };
const LAYOUT = /layout|perfboard|stripboard|pcb/i;

/**
 * @param {{ path: string, size: number, mtime: number }[]} files
 * @returns {{ id: string, label: string, path: string, type: 'svg'|'png'|'jpg',
 *             kind: 'schematic'|'layout'|'photo', size: number, mtime: number }[]}
 */
export function sheetsFromFiles(files) {
  const best = new Map();
  for (const file of files) {
    const name = file.path.split('/').pop();
    const dot = name.lastIndexOf('.');
    if (dot <= 0) continue;
    const type = TYPES[name.slice(dot + 1).toLowerCase()];
    if (!type) continue;
    const id = name.slice(0, dot);
    const key = id.toLowerCase();
    const current = best.get(key);
    const better = !current || RANK[type] < RANK[current.type] ||
      (RANK[type] === RANK[current.type] && file.path.length < current.path.length);
    if (better) best.set(key, { id, type, path: file.path, size: file.size, mtime: file.mtime });
  }
  return [...best.values()]
    .map(({ id, type, path, size, mtime }) => ({
      id,
      label: id.replace(/_/g, ' '),
      path,
      type,
      kind: type === 'jpg' ? 'photo' : LAYOUT.test(path) ? 'layout' : 'schematic',
      size,
      mtime,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true, sensitivity: 'base' }));
}
