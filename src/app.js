// Maker Forge Bench: the page. Joins the sources, the cleaner, the sheets and the viewer together.
import { SheetError, prepareSvg } from './sanitize.js';
import { sheetsFromFiles } from './project.js';
import { svgSize } from './zoom.js';
import { createViewer } from './viewer.js';
import { createFindBar } from './findbar.js';
import { indexSheet } from './search.js';
import { ServerError, fetchText, listProject, projectUrl } from './sources.js';
import { connectLive } from './live.js';

// The only Trusted Types policy: it hands SVG text to DOMParser, whose result is an inert document
// that prepareSvg cleans before anything reaches the page.
const policy = window.trustedTypes ? window.trustedTypes.createPolicy('bench-svg', { createHTML: (s) => s }) : null;
const parser = {
  parseFromString: (text, type) => new DOMParser().parseFromString(policy ? policy.createHTML(text) : text, type),
};

const $ = (selector) => document.querySelector(selector);
const viewer = createViewer($('#stage'));
const state = {
  root: '', sheets: [], cache: new Map(), loaded: new Map(), views: new Map(), flipped: new Set(), current: null,
};
const FLIP_DISABLED = 'Only layout sheets can be flipped.';

const SERVER_DOWN = "Can't reach dev.py. Is it still running? Start it again with: python dev.py <project folder>";
const fileName = (path) => path.split('/').pop();
const brokenMessage = (name) => `${name} couldn't be read: the file is broken or only half-saved. Save it again.`;
const keptMessage = (id) => `${id} couldn't be read; keeping the previous one.`;
const noDrawingsMessage = (root) => `No drawings found in ${root}. Bench shows SVG, PNG and JPG files: add some to the folder, or check the folder you gave dev.py.`;

function setStatus(text) {
  $('#status').textContent = text;
}

function setStageMessage(text) {
  const box = $('#stage-message');
  box.textContent = text;
  box.hidden = !text;
}

async function prepare(sheet) {
  const name = fileName(sheet.path);
  if (sheet.type === 'svg') {
    const { text, size } = await fetchText(sheet.path);
    const { doc } = prepareSvg(text, parser, name, size);
    const root = document.importNode(doc.documentElement, true);
    const box = svgSize({
      viewBox: root.getAttribute('viewBox'), width: root.getAttribute('width'), height: root.getAttribute('height'),
    });
    if (!box) throw new SheetError('no-size', `${name} doesn't say how big it is (no viewBox, width or height), so it can't be shown.`);
    if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    root.setAttribute('width', String(box.w));
    root.setAttribute('height', String(box.h));
    root.style.display = 'block';
    return { sheet, kind: 'svg', root, labels: indexSheet(sheet.id, root) };
  }
  const img = new Image();
  img.alt = sheet.label;
  img.src = projectUrl(sheet.path, sheet.mtime);
  try {
    await img.decode();
  } catch {
    throw new SheetError('broken', brokenMessage(name));
  }
  return { sheet, kind: 'image', img };
}

function messageFor(error, sheet) {
  if (error instanceof SheetError) return error.message;
  if (error instanceof ServerError) return SERVER_DOWN;
  console.error(error);
  return brokenMessage(fileName(sheet.path));
}

/** The prepared sheet, loaded once and kept. Errors are kept too, as { kind: 'error', message }. */
function load(sheet) {
  if (!state.cache.has(sheet.id)) {
    state.cache.set(sheet.id, prepare(sheet)
      .catch((error) => ({ sheet, kind: 'error', message: messageFor(error, sheet) }))
      .then((entry) => {
        state.loaded.set(sheet.id, entry);
        return entry;
      }));
  }
  return state.cache.get(sheet.id);
}

/** Shows a sheet. True if it's showing when this returns (another tab may have been picked meanwhile). */
async function selectSheet(id) {
  if (state.current && state.current !== id && viewer.sheetRoot()) state.views.set(state.current, viewer.getView());
  state.current = id;
  for (const tab of $('#tabs').children) tab.setAttribute('aria-selected', String(tab.dataset.id === id));
  const sheet = state.sheets.find((s) => s.id === id);
  const entry = await load(sheet);
  if (state.current !== id) return false; // another tab was picked meanwhile
  if (entry.kind === 'error') {
    viewer.clear();
    setStageMessage(entry.message);
    setStatus(entry.message);
    updateFlip();
    return false;
  }
  setStageMessage('');
  setStatus('');
  const saved = state.views.get(id);
  viewer.show(entry, { keepView: Boolean(saved) });
  if (saved) viewer.setView(saved);
  if (state.flipped.has(id) && !viewer.isFlipped()) viewer.setFlipped(true);
  updateFlip();
  return true;
}

function canFlip() {
  const sheet = state.sheets.find((s) => s.id === state.current);
  return Boolean(sheet && sheet.kind === 'layout' && viewer.sheetRoot());
}

function updateFlip() {
  const button = $('#flip');
  const allowed = canFlip();
  const flipped = allowed && viewer.isFlipped();
  button.disabled = !allowed;
  if (allowed) button.removeAttribute('title');
  else button.title = FLIP_DISABLED;
  button.setAttribute('aria-pressed', String(flipped));
  button.textContent = flipped ? 'Back to component side' : 'Flip to solder side';
  $('#flip-banner').hidden = !flipped;
}

function toggleFlip() {
  if (!canFlip()) return;
  viewer.setFlipped(!viewer.isFlipped());
  if (viewer.isFlipped()) state.flipped.add(state.current);
  else state.flipped.delete(state.current);
  updateFlip();
}

/** Find part: show the label's sheet, zoom to the label and ring it. */
async function goTo(label) {
  if (!(await selectSheet(label.sheetId)) || !label.el.isConnected) return false;
  viewer.zoomToRect(viewer.labelRect(label.el));
  viewer.ring(label.el);
  return true;
}

const find = createFindBar({
  input: $('#find'),
  results: $('#find-results'),
  entries: () => state.sheets.map((sheet) => state.loaded.get(sheet.id) || { sheet, kind: 'loading' }),
  goTo,
  clearRing: () => viewer.ring(null),
  ringIfShown: (label) => {
    if (label.sheetId === state.current) viewer.ring(label.el);
  },
  setStatus,
});

// ---- auto-refresh (design §7.9) ----

/** A sheet's file changed: read it again. If it can't be read (half-saved), keep the previous one. */
async function refreshSheet(sheet) {
  let entry;
  try {
    entry = await prepare(sheet);
  } catch (error) {
    if (!(error instanceof SheetError) && !(error instanceof ServerError)) console.error(error);
    setStatus(keptMessage(sheet.id));
    return;
  }
  if (!state.sheets.includes(sheet)) return; // the tabs were rebuilt meanwhile
  if ($('#status').textContent === keptMessage(sheet.id)) setStatus('');
  const before = state.loaded.get(sheet.id);
  state.cache.set(sheet.id, Promise.resolve(entry));
  state.loaded.set(sheet.id, entry);
  if (state.current === sheet.id) {
    setStageMessage('');
    viewer.show(entry, { keepView: Boolean(before && before.kind !== 'error') });
    if (state.flipped.has(sheet.id)) viewer.setFlipped(true);
    updateFlip();
  }
  find.refresh(true);
}

/** Drawings were added or removed: list the folder again and rebuild the tabs. */
async function relist() {
  let project;
  try {
    project = await listProject();
  } catch {
    return;
  }
  const sheets = sheetsFromFiles(project.files);
  const same = sheets.length === state.sheets.length &&
    sheets.every((s, i) => s.id === state.sheets[i].id && s.path === state.sheets[i].path);
  if (same) return;
  for (const id of [...state.cache.keys()]) {
    const now = sheets.find((s) => s.id === id);
    const was = state.sheets.find((s) => s.id === id);
    if (!now || !was || now.path !== was.path) {
      for (const store of [state.cache, state.loaded, state.views]) store.delete(id);
      state.flipped.delete(id);
    }
  }
  if (state.current && viewer.sheetRoot()) state.views.set(state.current, viewer.getView());
  state.sheets = sheets;
  renderTabs();
  if (sheets.length === 0) {
    state.current = null;
    viewer.clear();
    updateFlip();
    setStatus(noDrawingsMessage(state.root));
    return;
  }
  const keep = sheets.some((s) => s.id === state.current) ? state.current : sheets[0].id;
  state.current = null; // the view is saved already
  await selectSheet(keep);
  await Promise.all(sheets.map(load));
  find.refresh(true);
}

// render.py and drawing programs write a file in several steps: act once it has been quiet for 300 ms.
const quietTimers = new Map();
function whenQuiet(path, action) {
  clearTimeout(quietTimers.get(path));
  quietTimers.set(path, setTimeout(() => {
    quietTimers.delete(path);
    action();
  }, 300));
}

function onFileChange(path) {
  if (path.split('/').pop() === 'forge-project.json') return; // read from release 0.2
  whenQuiet(path, () => {
    const sheet = state.sheets.find((s) => s.path === path);
    if (sheet) refreshSheet(sheet);
    else relist();
  });
}

function onLiveStatus(live) {
  const badge = $('#live');
  badge.textContent = live === 'live' ? 'Auto-refresh on' : 'Auto-refresh paused';
  badge.classList.toggle('paused', live !== 'live');
}

function renderTabs() {
  $('#tabs').replaceChildren(...state.sheets.map((sheet) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.dataset.id = sheet.id;
    tab.textContent = sheet.label;
    tab.addEventListener('click', () => selectSheet(sheet.id));
    return tab;
  }));
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
  const { w, h } = viewer.stageSize();
  const actions = {
    0: () => viewer.fit(),
    '+': () => viewer.zoomBy(1.25),
    '=': () => viewer.zoomBy(1.25),
    '-': () => viewer.zoomBy(1 / 1.25),
    ArrowLeft: () => viewer.panBy(w * 0.1, 0),
    ArrowRight: () => viewer.panBy(-w * 0.1, 0),
    ArrowUp: () => viewer.panBy(0, h * 0.1),
    ArrowDown: () => viewer.panBy(0, -h * 0.1),
    '/': () => find.focus(),
    n: () => find.next(),
    N: () => find.prev(),
    f: () => toggleFlip(),
  };
  const action = actions[e.key];
  if (!action) return;
  e.preventDefault();
  action();
}

async function start() {
  document.addEventListener('keydown', onKey);
  $('#flip').addEventListener('click', toggleFlip);
  let project;
  try {
    project = await listProject();
  } catch {
    setStatus(SERVER_DOWN);
    return;
  }
  state.root = project.root;
  $('#project-name').textContent = project.root;
  document.title = `${project.root} – Maker Forge Bench`;
  state.sheets = sheetsFromFiles(project.files);
  renderTabs();
  connectLive({ onChange: onFileChange, onRemove: (path) => whenQuiet(path, relist), onStatus: onLiveStatus });
  if (state.sheets.length === 0) {
    setStatus(noDrawingsMessage(project.root));
    return;
  }
  await selectSheet(state.sheets[0].id);
  // Read the other sheets in the background, so Find part can search all of them.
  await Promise.all(state.sheets.map(load));
  find.refresh();
}

start();
