// Maker Forge Bench: the page. Joins the sources, the cleaner, the sheets and the viewer together.
import { SheetError, prepareSvg } from './sanitize.js';
import { sheetsFromFiles } from './project.js';
import { svgSize } from './zoom.js';
import { createViewer } from './viewer.js';
import { createFindBar } from './findbar.js';
import { indexSheet } from './search.js';
import { ServerError, fetchText, listProject, projectUrl } from './sources.js';

// The only Trusted Types policy: it hands SVG text to DOMParser, whose result is an inert document
// that prepareSvg cleans before anything reaches the page.
const policy = window.trustedTypes ? window.trustedTypes.createPolicy('bench-svg', { createHTML: (s) => s }) : null;
const parser = {
  parseFromString: (text, type) => new DOMParser().parseFromString(policy ? policy.createHTML(text) : text, type),
};

const $ = (selector) => document.querySelector(selector);
const viewer = createViewer($('#stage'));
const state = { root: '', sheets: [], cache: new Map(), loaded: new Map(), views: new Map(), current: null };
const FLIP_DISABLED = 'Only layout sheets can be flipped.';

const SERVER_DOWN = "Can't reach dev.py. Is it still running? Start it again with: python dev.py <project folder>";
const fileName = (path) => path.split('/').pop();
const brokenMessage = (name) => `${name} couldn't be read: the file is broken or only half-saved. Save it again.`;

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
  setStatus,
});

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
  if (state.sheets.length === 0) {
    setStatus(`No drawings found in ${project.root}. Bench shows SVG, PNG and JPG files: add some to the folder, or check the folder you gave dev.py.`);
    return;
  }
  await selectSheet(state.sheets[0].id);
  // Read the other sheets in the background, so Find part can search all of them.
  await Promise.all(state.sheets.map(load));
  find.refresh();
}

start();
