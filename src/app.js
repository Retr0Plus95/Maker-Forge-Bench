// Maker Forge Bench: the page. Joins the sources, the cleaner, the sheets and the viewer together.
import { SheetError, prepareSvg } from './sanitize.js';
import { ProjectError, guessParts, parseProject, refOfLabel, sheetsForProject, sheetsFromFiles } from './project.js';
import { renderCard, renderHint } from './panel.js';
import { svgSize } from './zoom.js';
import { createViewer } from './viewer.js';
import { createFindBar } from './findbar.js';
import { indexSheet } from './search.js';
import { ServerError, fetchText, listProject, projectUrl } from './sources.js';
import { connectLive } from './live.js';
import { createHistory } from './history.js';
import { createStore, projectKey } from './store.js';
import { ProgressError, changedSince, exportProgress, importProgress, sheetPrint } from './checklist.js';
import { DEFAULT_SETTINGS, applySettings, cleanSettings, fillSettings, wireSettings } from './settings.js';

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
  stale: new Set(), // sheets showing an older version because the newest save couldn't be read
  generations: new Map(), // per sheet: which refresh is the newest
  project: null, // forge-project.json, read and checked (design §6)
  projectProblem: '', // why the project file couldn't be used, shown whenever the status line is free
  parts: [], // the project's parts, or parts guessed from the drawings' labels
  partsByRef: new Map(),
  selected: null, // the ref of the part whose card is open
  ticked: new Set(), // refs marked soldered (design §7.7)
  checklistNotes: [], // "this sheet changed since you ticked" notes, from the last load
};
const FLIP_DISABLED = 'Only layout sheets can be flipped.';

// ---- undo, saved data and Easy reading (board-view design §6a and §7) ----
const history = createHistory();

/** localStorage, or a stand-in that forgets on reload if the browser won't give us one. */
function browserStorage() {
  try {
    window.localStorage.getItem('bench.probe');
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      get length() { return mem.size; },
      key: (i) => [...mem.keys()][i] ?? null,
    };
  }
}
const store = createStore(browserStorage());

let savedTimer = null;
function flashSaved() {
  const mark = $('#saved');
  mark.textContent = 'Saved';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { mark.textContent = ''; }, 2000);
}

let settings = cleanSettings(store.get('settings', DEFAULT_SETTINGS));
applySettings(document.documentElement, settings);

function setSettings(next) {
  settings = next;
  applySettings(document.documentElement, next);
  fillSettings($('#settings'), next);
  if (store.set('settings', next)) flashSaved();
}

history.subscribe((h) => {
  const undo = $('#undo');
  const redo = $('#redo');
  undo.disabled = !h.canUndo;
  redo.disabled = !h.canRedo;
  undo.title = h.undoLabel ? `Undo ${h.undoLabel}` : 'Nothing to undo';
  redo.title = h.redoLabel ? `Redo ${h.redoLabel}` : 'Nothing to redo';
});

const SERVER_DOWN = "Can't reach dev.py. Is it still running? Start it again with: python dev.py <project folder>";
const fileName = (path) => path.split('/').pop();
const brokenMessage = (name) => `${name} couldn't be read: the file is broken or only half-saved. Save it again.`;
const keptMessage = (id) => `${id} couldn't be read; keeping the previous one.`;
const noDrawingsMessage = (root) => `No drawings found in ${root}. Bench shows SVG, PNG and JPG files: add some to the folder, or check the folder you gave dev.py.`;

function setStatus(text) {
  $('#status').textContent = text || state.projectProblem;
}

function setStageMessage(text) {
  const box = $('#stage-message');
  box.textContent = text;
  box.hidden = !text;
}

async function prepare(sheet) {
  const name = fileName(sheet.path);
  if (sheet.missing) throw new SheetError('missing', `${sheet.label}: ${sheet.path} isn't in the folder. Check the file name in forge-project.json.`);
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
    return { sheet, kind: 'svg', root, labels: indexSheet(sheet.id, root), size };
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
  updateSheetNote();
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
  if (state.flipped.has(id) !== viewer.isFlipped()) viewer.setFlipped(state.flipped.has(id));
  updateFlip();
  if (state.selected) {
    const label = firstLabelFor(id, state.selected);
    viewer.ring(label ? label.el : null);
  }
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

/** Flips or unflips a sheet. The sheet needn't be on screen (an undo after switching tabs). */
function setSheetFlipped(id, on) {
  if (on) state.flipped.add(id);
  else state.flipped.delete(id);
  if (state.current === id && viewer.sheetRoot()) viewer.setFlipped(on);
  updateFlip();
  saveProgress();
}

function toggleFlip() {
  if (!canFlip()) return;
  const id = state.current;
  const on = !viewer.isFlipped();
  const sheet = state.sheets.find((s) => s.id === id);
  history.do({ label: `Flip ${sheet.label}`, apply: () => setSheetFlipped(id, on), revert: () => setSheetFlipped(id, !on) });
}

/** Find part: show the label's sheet, zoom to the label and ring it. A query that is a part's ref opens its card. */
async function goTo(label, query) {
  const ref = query ? findRef(query) : null;
  if (ref) state.selected = ref;
  if (!(await selectSheet(label.sheetId)) || !label.el.isConnected) return false;
  viewer.zoomToRect(viewer.labelRect(label.el));
  viewer.ring(label.el);
  if (ref) {
    updatePartDots();
    renderPartCard();
  }
  return true;
}

// ---- parts: selecting one and its card (design §7.4, §7.5) ----
const isKnownRef = (ref) => state.partsByRef.has(ref);
const labelText = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

/** A typed ref: exact, or else the one part whose ref matches ignoring case. */
function findRef(query) {
  const q = query.trim();
  if (state.partsByRef.has(q)) return q;
  const same = state.parts.filter((p) => p.ref.toLowerCase() === q.toLowerCase());
  return same.length === 1 ? same[0].ref : null;
}

function firstLabelFor(sheetId, ref) {
  const entry = state.loaded.get(sheetId);
  return entry && entry.kind === 'svg' ? entry.labels.find((l) => refOfLabel(l.text, isKnownRef) === ref) || null : null;
}

function sheetsWithPart(ref) {
  return state.sheets.filter((s) => firstLabelFor(s.id, ref));
}

function datasheetHref(part) {
  if (part.datasheetFile) return projectUrl(part.datasheetFile, 0);
  return part.datasheet || null;
}

function updatePartDots() {
  const withPart = new Set(state.selected ? sheetsWithPart(state.selected).map((s) => s.id) : []);
  for (const tab of $('#tabs').children) tab.toggleAttribute('data-has-part', withPart.has(tab.dataset.id));
}

function renderPartCard() {
  const part = state.selected ? state.partsByRef.get(state.selected) : null;
  if (!part) {
    renderHint($('#part-card'));
    return;
  }
  renderCard($('#part-card'), part, {
    sheetsWithPart: sheetsWithPart(part.ref),
    datasheetHref: datasheetHref(part),
    ticked: state.ticked.has(part.ref),
    onTick: () => toggleTick(part.ref),
    onSheet: (id) => showPartOn(id, part.ref),
    onClose: clearPart,
  });
}

function selectPart(ref, labelEl) {
  state.selected = ref;
  const label = labelEl || (firstLabelFor(state.current, ref) || {}).el || null;
  viewer.ring(label);
  updatePartDots();
  renderPartCard();
}

function clearPart() {
  if (!state.selected) return;
  state.selected = null;
  viewer.ring(null);
  updatePartDots();
  renderPartCard();
}

async function showPartOn(sheetId, ref) {
  if (!(await selectSheet(sheetId))) return;
  const label = firstLabelFor(sheetId, ref);
  if (label && label.el.isConnected) {
    viewer.zoomToRect(viewer.labelRect(label.el));
    viewer.ring(label.el);
  }
}

viewer.onLabelClick((el) => {
  const ref = refOfLabel(labelText(el), isKnownRef);
  if (ref) selectPart(ref, el);
});

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

// ---- the project file and its parts (design §6) ----

/** Reads forge-project.json. On a problem, says why (whenever the status line is free) and gives null. */
async function readProjectFile() {
  try {
    const { text } = await fetchText('forge-project.json');
    const project = parseProject(text);
    state.projectProblem = '';
    return project;
  } catch (error) {
    state.projectProblem = error instanceof ProjectError ? error.message : SERVER_DOWN;
    return null;
  }
}

function showProjectName() {
  const p = state.project;
  const name = p ? `${p.name}${p.revision ? ` (${p.revision})` : ''}` : state.root;
  $('#project-name').textContent = name;
  document.title = `${name} – Maker Forge Bench`;
}

function sheetsFor(files) {
  return state.project ? sheetsForProject(state.project, files) : sheetsFromFiles(files);
}

/** The project's parts, or parts guessed from every read sheet's labels. */
function updateParts() {
  if (state.project) {
    state.parts = state.project.parts;
  } else {
    state.parts = guessParts(state.sheets.flatMap((s) => {
      const entry = state.loaded.get(s.id);
      return entry && entry.kind === 'svg' ? entry.labels : [];
    }));
  }
  state.partsByRef = new Map(state.parts.map((p) => [p.ref, p]));
  if (state.selected && !state.partsByRef.has(state.selected)) state.selected = null;
  updatePartDots();
  renderPartCard();
  applyTickMarks();
  renderChecklist();
}

// ---- the build checklist (design §7.7): ticks, saved progress, progress files ----
const projectName = () => (state.project ? state.project.name : state.root);

function currentPrints() {
  return Object.fromEntries(state.sheets.filter((s) => !s.missing).map((s) => [s.id, sheetPrint(s)]));
}

/** Progress saved in this browser for this project and revision, checked like a progress file. */
function loadProgress() {
  let data = null;
  const saved = store.get(projectKey(state.project, state.root), null);
  if (saved) {
    try {
      data = importProgress(JSON.stringify({ format: 'bench-progress', version: 1, ...saved }));
    } catch {
      data = null;
    }
  }
  state.ticked = new Set(data ? data.ticked : []);
  state.flipped = new Set(data ? data.flipped : []);
  state.checklistNotes = data ? changedSince(data.sheetPrints, state.sheets.filter((s) => !s.missing), state.ticked.size) : [];
}

function saveProgress() {
  const saved = store.set(projectKey(state.project, state.root), { ticked: [...state.ticked], sheetPrints: currentPrints(), flipped: [...state.flipped] });
  if (saved) flashSaved();
}

/** Ticked parts' labels turn green on every sheet that has been read. */
function applyTickMarks() {
  for (const entry of state.loaded.values()) {
    if (entry.kind !== 'svg') continue;
    for (const label of entry.labels) {
      label.el.toggleAttribute('data-bench-done', state.ticked.has(refOfLabel(label.text, isKnownRef)));
    }
  }
}

function setProgress({ ticked, flipped }) {
  state.ticked = new Set(ticked);
  if (flipped) {
    state.flipped = new Set(flipped);
    if (viewer.sheetRoot() && state.flipped.has(state.current) !== viewer.isFlipped()) viewer.setFlipped(state.flipped.has(state.current));
    updateFlip();
  }
  applyTickMarks();
  saveProgress();
  renderChecklist();
  renderPartCard();
}

function toggleTick(ref) {
  const on = !state.ticked.has(ref);
  const before = [...state.ticked];
  const after = on ? [...before, ref] : before.filter((r) => r !== ref);
  history.do({ label: `${on ? 'Tick' : 'Untick'} ${ref}`, apply: () => setProgress({ ticked: after }), revert: () => setProgress({ ticked: before }) });
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function renderChecklist() {
  const total = state.parts.length;
  const done = state.parts.filter((p) => state.ticked.has(p.ref)).length;
  const bar = el('progress', { max: String(Math.max(total, 1)) });
  bar.value = done;
  const notes = el('div', { id: 'checklist-notes' }, ...state.checklistNotes.map((n) => el('p', {}, n)));
  const items = el('ul', { className: 'checklist-items' }, ...state.parts.map((part) => {
    const box = el('input', { type: 'checkbox', 'data-ref': part.ref });
    box.checked = state.ticked.has(part.ref);
    return el('li', {}, el('label', {}, box, ` ${part.ref}${part.value ? ` ${part.value}` : ''}`));
  }));
  const open = el('label', { className: 'button-like' }, 'Open progress file',
    el('input', { id: 'progress-open', type: 'file', accept: '.json,application/json', className: 'visually-hidden' }));
  $('#checklist').replaceChildren(
    el('h2', {}, 'Build checklist'),
    el('p', { className: 'progress-text' }, `${done} of ${total} soldered`),
    bar,
    notes,
    el('div', { className: 'checklist-actions' }, el('button', { id: 'progress-save', type: 'button' }, 'Save progress as file'), open),
    items,
  );
}

function saveProgressFile() {
  const text = exportProgress({
    project: projectName(), revision: state.project ? state.project.revision : null,
    ticked: [...state.ticked], sheetPrints: currentPrints(), flipped: [...state.flipped],
  });
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: `${projectName().replace(/[\\/:*?"<>|]/g, '_')}-progress.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openProgressFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try {
    data = importProgress(await file.text());
  } catch (error) {
    setStatus(error instanceof ProgressError ? error.message : new ProgressError().message);
    return;
  }
  if (data.project && data.project !== projectName()) {
    setStatus(`That progress file is for ${data.project}, not ${projectName()}.`);
    return;
  }
  const before = { ticked: [...state.ticked], flipped: [...state.flipped] };
  const after = { ticked: data.ticked, flipped: data.flipped };
  history.do({ label: 'Open progress file', apply: () => setProgress(after), revert: () => setProgress(before) });
}

/** forge-project.json changed: read it again. A broken version keeps the previous project. */
async function reloadProject() {
  const next = await readProjectFile();
  if (next) state.project = next;
  showProjectName();
  setStatus('');
  await relist();
  updateParts();
  find.refresh(true);
}

/** forge-project.json was deleted: go back to guessing from the drawings. */
async function forgetProject() {
  state.project = null;
  state.projectProblem = '';
  showProjectName();
  setStatus('');
  await relist();
  updateParts();
  find.refresh(true);
}

// ---- auto-refresh (design §7.9) ----

/** The warning under the status line: shown for the sheet on screen while it's an older version. */
function updateSheetNote() {
  const note = $('#sheet-note');
  note.textContent = state.stale.has(state.current) ? keptMessage(state.current) : '';
  note.hidden = !note.textContent;
}

/**
 * A sheet's file changed: read it again. If it can't be read (half-saved), keep the previous one
 * and say so until the next good save. mtime, when known, makes a picture's address new, so the
 * browser fetches it again instead of reusing its copy.
 */
async function refreshSheet(sheet, mtime) {
  if (mtime !== undefined) sheet.mtime = mtime;
  const generation = (state.generations.get(sheet.id) || 0) + 1;
  state.generations.set(sheet.id, generation);
  let entry = null;
  try {
    entry = await prepare(sheet);
  } catch (error) {
    if (!(error instanceof SheetError) && !(error instanceof ServerError)) console.error(error);
  }
  if (state.generations.get(sheet.id) !== generation) return; // a newer read of this sheet started
  // The tabs may have been rebuilt meanwhile (new sheet objects): find this drawing again.
  const current = state.sheets.find((s) => s.id === sheet.id && s.path === sheet.path);
  if (!current) return; // the drawing went away
  current.mtime = sheet.mtime;
  if (!entry) {
    state.stale.add(current.id);
    updateSheetNote();
    return;
  }
  state.stale.delete(current.id);
  updateSheetNote();
  const before = state.loaded.get(current.id);
  if (before && before.kind === 'error' && $('#status').textContent === before.message) setStatus('');
  entry.sheet = current;
  if (entry.size !== undefined) current.size = entry.size;
  state.cache.set(current.id, Promise.resolve(entry));
  state.loaded.set(current.id, entry);
  if (!state.project) updateParts(); // guessed parts follow the drawings
  applyTickMarks();
  if (state.current === current.id) {
    setStageMessage('');
    viewer.show(entry, { keepView: Boolean(before && before.kind !== 'error') });
    if (state.flipped.has(current.id)) viewer.setFlipped(true);
    updateFlip();
  }
  find.refresh(true);
}

/** dev.py is back after a pause: catch up on every drawing that changed meanwhile. */
async function catchUp() {
  let project;
  try {
    project = await listProject();
  } catch {
    return;
  }
  const byPath = new Map(project.files.map((f) => [f.path, f]));
  for (const sheet of state.sheets) {
    const file = byPath.get(sheet.path);
    if (file && file.mtime !== sheet.mtime) onFileChange(sheet.path, file.mtime);
  }
  relist();
}

/** Drawings were added or removed: list the folder again and rebuild the tabs. */
async function relist() {
  let project;
  try {
    project = await listProject();
  } catch {
    return;
  }
  const sheets = sheetsFor(project.files);
  const same = sheets.length === state.sheets.length && sheets.every((s, i) => s.id === state.sheets[i].id &&
    s.path === state.sheets[i].path && s.label === state.sheets[i].label && s.missing === state.sheets[i].missing);
  if (same) return;
  for (const id of [...state.cache.keys()]) {
    const now = sheets.find((s) => s.id === id);
    const was = state.sheets.find((s) => s.id === id);
    if (!now || !was || now.path !== was.path) {
      for (const store of [state.cache, state.loaded, state.views]) store.delete(id);
      state.flipped.delete(id);
      state.stale.delete(id);
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
  updateParts();
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

function onFileChange(path, mtime) {
  if (path === 'forge-project.json') {
    whenQuiet(path, reloadProject);
    return;
  }
  whenQuiet(path, () => {
    const sheet = state.sheets.find((s) => s.path === path);
    if (sheet) refreshSheet(sheet, mtime);
    else relist();
  });
}

let livePaused = false;
function onLiveStatus(live) {
  const badge = $('#live');
  badge.textContent = live === 'live' ? 'Auto-refresh on' : 'Auto-refresh paused';
  badge.classList.toggle('paused', live !== 'live');
  if (live !== 'live') {
    livePaused = true;
  } else if (livePaused) {
    livePaused = false;
    catchUp();
  }
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
  updatePartDots();
}

function onKey(e) {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      history.redo();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
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
    Escape: () => clearPart(),
  };
  const action = actions[e.key];
  if (!action) return;
  e.preventDefault();
  action();
}

async function start() {
  document.addEventListener('keydown', onKey);
  $('#flip').addEventListener('click', toggleFlip);
  $('#undo').addEventListener('click', () => history.undo());
  $('#redo').addEventListener('click', () => history.redo());
  $('#checklist').addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.dataset.ref) toggleTick(t.dataset.ref);
    else if (t instanceof HTMLInputElement && t.id === 'progress-open') openProgressFile(t);
  });
  $('#checklist').addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.id === 'progress-save') saveProgressFile();
  });
  wireSettings($('#settings'), $('#settings-button'), $('#settings-done'), () => settings, (next, label) => {
    const before = settings;
    history.do({ label, apply: () => setSettings(next), revert: () => setSettings(before) });
  });
  let project;
  try {
    project = await listProject();
  } catch {
    setStatus(SERVER_DOWN);
    return;
  }
  state.root = project.root;
  if (project.files.some((f) => f.path === 'forge-project.json')) state.project = await readProjectFile();
  showProjectName();
  setStatus('');
  state.sheets = sheetsFor(project.files);
  loadProgress();
  renderTabs();
  connectLive({ onChange: onFileChange, onRemove: (path) => whenQuiet(path, path === 'forge-project.json' ? forgetProject : relist), onStatus: onLiveStatus });
  if (state.sheets.length === 0) {
    setStatus(noDrawingsMessage(project.root));
    return;
  }
  await selectSheet(state.sheets[0].id);
  // Read the other sheets in the background, so Find part can search all of them.
  await Promise.all(state.sheets.map(load));
  updateParts();
  find.refresh();
}

start();
