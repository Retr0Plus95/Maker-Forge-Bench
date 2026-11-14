// Maker Forge Bench: the page. Joins the sources, the cleaner, the sheets and the viewer together.
import { SheetError, prepareSvg } from './sanitize.js';
import { ProjectError, connectionsOf, guessParts, labelDone, parseProject, projectProblemText, refOfLabel, sheetsForProject, sheetsFromFiles } from './project.js';
import { renderCard, renderChecks, renderContinuity, renderHint, renderMyBoard, renderSteps, renderWiring } from './panel.js';
import { continuitySummary, continuityTests, faultText } from './continuity.js';
import { powerChecks, wiringGroups, wiringText } from './wiring.js';
import { pinLayout } from './pinout.js';
import { anchorFor, anchorPins, boardFromPlacement, photoTransform, snap } from './myboard.js';
import { buildOverlay } from './myboard-view.js';
import { checkPlacement, placedLegs, suggestAll, wireText } from './boardcheck.js';
import { acrossPin, edgeName, holeName, labelsMap, solveLabels } from './holenames.js';
import { suggestSpots } from './suggest.js';
import { libraryFor as libraryForPart } from './library.js';
import { findLines, findValues, nextInStep, paletteMatch } from './lookup.js';
import { divider, ledResistor, ohmsLaw, ohmsText } from './calc.js';
import { groupByType, shoppingCsv, shoppingList, shoppingText } from './bom.js';
import { addVersion, buildReport, clock, cleanVersions, day, duration, logAdd, logText, solderedAt, timeSpent } from './buildlog.js';
import { capacitorCode, resistorBands } from './markings.js';
import { libraryFor } from './library.js';
import { stillToWire } from './wiring.js';
import { pinText } from './wiring.js';
import { DEFAULT_QUESTION, contextText } from './ask.js';
import { svgSize } from './zoom.js';
import { createViewer } from './viewer.js';
import { createFindBar } from './findbar.js';
import { createBoard3D } from './board3d.js';
import { indexSheet } from './search.js';
import { ServerError, SourceError, folderFiles, folderSource, githubSource, localSource, parseRepoLink, repoParam } from './sources.js';
import { renderStart } from './start.js';
import { EXAMPLES } from './examples.js';
import { wireMenu, wireSheetHandle } from './phone.js';
import { SYSTEM, aiForStorage, aiName, aiReady, askAi, cleanAi } from './ai.js';
import { wireAiSettings } from './ai-settings.js';
import { connectLive } from './live.js';
import { createHistory } from './history.js';
import { createStore, projectKey } from './store.js';
import { BoardFileError, ProgressError, changedSince, exportBoard, exportProgress, importBoard, importProgress, sheetPrint } from './checklist.js';
import { DEFAULT_SETTINGS, applySettings, cleanSettings, fillSettings, wireSettings } from './settings.js';
import { applyLooks, lookFields, lookSummary } from './looks.js';
import { NO_EDITS, addOwnStep, hasEdits, moveStep, removeOwnStep, setSkipped, stepsWithEdits } from './mysteps.js';
import { PANEL_TABS, cleanTab, panelTabs } from './paneltabs.js';

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
  checklistNotes: [], // "this sheet changed since you ticked" notes
  tickPrints: {}, // each sheet's fingerprint when its ticks were last confirmed (design §7.7)
  progressKey: null, // where the progress on screen is saved (per project and revision)
  openStep: null, // the build step on screen (index), or null
  wired: new Set(), // legs ticked as wired, as "REF:PIN" (0.4 design F1)
  wiringOpenOnly: false, // What to wire shows only the legs not wired yet
  wiringExpanded: new Set(), // the lines opened in What to wire
  shownNet: null, // the line whose parts are ringed on the drawing
  pinsOpen: false, // the part card's pin view is open (0.4 design F2)
  pinSelected: null, // the pin picked in the pin view
  myBoard: { anchor: null, photos: {}, placed: {} }, // your board's photos and placements (0.4 design F3)
  myBoardOpen: false, // the Your board section is open
  mode: null, // tapping on a photo: { kind: 'line', taps } or { kind: 'place', ref, pins, taps }
  photoSides: {}, // the side picked for photos not lined up yet
  brightUnlined: new Set(), // "Brighter" on photos not lined up yet
  myBoardStatus: '', // what the Your board section says
  notes: {}, // your own note on each part (0.4 improvement 10)
  checklistOpenOnly: false, // the checklist shows only parts not soldered yet
  checks: new Set(), // ticked checks before power, and steps marked done by hand (0.4)
  folded: new Set(), // panel sections folded away (0.4.1)
  panelTab: 'guide', // the panel tab you chose: guide, board, wiring, checks, parts or all (0.8 §3)
  startOverAt: 0, // when Start over was first clicked: a second click within 5 s does it
  continuity: {}, // continuity test answers: { id: 'pass' | 'fail' } (0.5 big improvement B6)
  looks: Object.create(null), // what each part looks like as you fitted it: { ref: { holder, colour, swap, ... } } (0.8 §2)
  looksOpen: false, // the card's Looks like is open
  stepEdits: NO_EDITS, // your changes to the build steps: { order, skipped, added } (0.8 §3)
  stepsAdjusting: false, // the steps panel shows the step list to change
  contSkipped: new Set(), // tests skipped for now (not saved)
  dragPreview: null, // a part being dragged on a photo: { ref, from, dc, dr }
  clearAt: 0, // when Clear my board was first clicked
  labelsEditing: false, // the hole names form is open (0.6 design §1)
  labelsWhy: '', // why the typed hole names don't fit
  suggest: null, // a suggested spot on show: { ref, spots, index, sheet } (0.6 design §2)
  log: [], // the build log: [{ t, text }] (0.5 big improvement B10)
  versionDeleteAt: { name: null, t: 0 }, // a version's Delete asks twice
  trail: [], // the parts you opened, for Alt+← and Alt+→
  trailAt: -1,
  checklistQuery: '',
  checklistGroup: false,
  checklistSort: 'list',
  wiringFilter: '',
};
const APP_VERSION = '0.8.0';
// where the files come from: dev.py, a GitHub repo or a picked folder (0.7 design §1)
let source = localSource();
const FLIP_DISABLED = 'Only layout sheets can be flipped.';

// ---- undo, saved data and Easy reading (board-view design §6a and §7) ----
const history = createHistory();
// The build log (0.5 big improvement B10): every change you make, and its undo and redo, with the time.
// Easy reading changes aren't building, so they stay out of it.
const NOT_BUILDING = /^(Theme|High contrast|Clear font|Text size|Reduce motion|Compact)/;
let lastHistory = { undoLabel: null, redoLabel: null };
history.subscribe((h) => { lastHistory = h; });
const historyDo = history.do.bind(history);
const historyUndo = history.undo.bind(history);
const historyRedo = history.redo.bind(history);
history.do = (action) => {
  historyDo(action);
  addLog(action.label);
};
history.undo = () => {
  const label = lastHistory.undoLabel;
  const done = historyUndo();
  if (done) addLog(`Undo ${label}`);
  return done;
};
history.redo = () => {
  const label = lastHistory.redoLabel;
  const done = historyRedo();
  if (done) addLog(`Redo ${label}`);
  return done;
};
function addLog(text) {
  if (!text || NOT_BUILDING.test(text) || typeof state === 'undefined' || !state.progressKey) return;
  state.log = logAdd(state.log, text);
  saveProgress();
}

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

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
let settings = cleanSettings(store.get('settings', DEFAULT_SETTINGS));
applySettings(document.documentElement, settings, darkScheme.matches);

function setSettings(next) {
  settings = next;
  applySettings(document.documentElement, next, darkScheme.matches);
  fillSettings($('#settings'), next);
  if (store.set('settings', next)) flashSaved();
}

history.subscribe((h) => {
  const undo = $('#undo');
  const redo = $('#redo');
  undo.disabled = !h.canUndo;
  redo.disabled = !h.canRedo;
  undo.title = h.undoLabel ? `Undo ${h.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
  redo.title = h.redoLabel ? `Redo ${h.redoLabel} (Ctrl+Y)` : 'Nothing to redo';
});

const SERVER_DOWN = "Can't reach dev.py. Is it still running? Start it again with: python dev.py <project folder>";
const fileName = (path) => path.split('/').pop();
const brokenMessage = (name) => `${name} couldn't be read: the file is broken or only half-saved. Save it again.`;
const keptMessage = (id) => `${id} couldn't be read; keeping the previous one.`;
const noDrawingsMessage = (root) => `No drawings found in ${root}. Bench shows SVG, PNG and JPG files: add some to the folder, or check the folder you gave dev.py.`;

function setStatus(text) {
  $('#status').textContent = text || state.projectProblem;
}

let retrySheet = null;
function setStageMessage(text, retryId = null) {
  const box = $('#stage-message');
  box.textContent = text;
  box.hidden = !text;
  retrySheet = text ? retryId : null;
  $('#stage-retry').hidden = !retrySheet;
}

async function prepare(sheet) {
  const name = fileName(sheet.path);
  if (sheet.missing) throw new SheetError('missing', `${sheet.label}: ${sheet.path} isn't in the folder. Check the file name in forge-project.json.`);
  if (sheet.type === 'svg') {
    const { text, size } = await source.text(sheet.path);
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
    return { sheet, kind: 'svg', root, pristine: root.cloneNode(true), labels: indexSheet(sheet.id, root), size };
  }
  const img = new Image();
  img.alt = sheet.label;
  img.src = await source.imageUrl(sheet.path, sheet.mtime);
  try {
    await img.decode();
  } catch {
    throw new SheetError('broken', brokenMessage(name));
  }
  return { sheet, kind: 'image', img };
}

function messageFor(error, sheet) {
  if (error instanceof SheetError || error instanceof SourceError) return error.message;
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
  store.set(`sheet:${projectName()}`, id);
  updateSheetNote();
  for (const tab of $('#tabs').children) tab.setAttribute('aria-selected', String(tab.dataset.id === id));
  const sheet = state.sheets.find((s) => s.id === id);
  const entry = await load(sheet);
  if (state.current !== id) return false; // another tab was picked meanwhile
  if (entry.kind === 'error') {
    viewer.clear();
    updateMyBoard();
    setStageMessage(entry.message, sheet.missing ? null : id); // a missing file comes back by itself when it appears
    setStatus(entry.message);
    updateFlip();
    return false;
  }
  setStageMessage('');
  setStatus('');
  const kept = store.get(`views:${projectName()}`, {})[id];
  const saved = state.views.get(id) || (kept && ['scale', 'x', 'y'].every((k) => Number.isFinite(kept[k])) && kept.scale > 0 ? kept : null);
  viewer.show(entry, { keepView: Boolean(saved), turn: store.get(`turn:${projectName()}:${id}`, 0) });
  if (saved) viewer.setView(saved);
  const wantFlip = state.flipped.has(id) && isLayout(id);
  if (wantFlip !== viewer.isFlipped()) viewer.setFlipped(wantFlip);
  updateFlip();
  if (state.selected) {
    const label = firstLabelFor(id, state.selected);
    viewer.ring(label ? label.el : null);
  }
  updateStepRings();
  updateNetRings();
  updateMyBoard();
  return true;
}

function canFlip() {
  const sheet = state.sheets.find((s) => s.id === state.current);
  return Boolean(sheet && sheet.kind === 'layout' && viewer.sheetRoot());
}

function updateFlip() {
  const button = $('#flip');
  const allowed = canFlip();
  const flipped = Boolean(viewer.sheetRoot()) && viewer.isFlipped();
  button.disabled = !allowed;
  button.title = allowed ? 'See the layout from the solder side (F)' : FLIP_DISABLED;
  button.setAttribute('aria-pressed', String(allowed && flipped));
  button.textContent = allowed && flipped ? 'Back to component side' : 'Flip to solder side';
  $('#flip-banner').hidden = !flipped; // a mirrored drawing always says so
}

const isLayout = (id) => state.sheets.some((s) => s.id === id && s.kind === 'layout');

/** Brings the sheet on screen in line with the saved flips (layout sheets only). */
function syncFlip() {
  if (viewer.sheetRoot()) {
    const want = state.flipped.has(state.current) && isLayout(state.current);
    if (want !== viewer.isFlipped()) viewer.setFlipped(want);
  }
  updateFlip();
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
  if (ref) {
    pushTrail(ref);
    state.selected = ref;
  }
  if (!(await selectSheet(label.sheetId)) || !label.el.isConnected) return false;
  viewer.zoomToRect(viewer.labelRect(label.el));
  viewer.ring(label.el);
  if (ref) {
    updatePartDots();
    renderPartCard();
    ringInSplit();
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
  const file = part.datasheetFile ? source.fileHref(part.datasheetFile) : null;
  return file || part.datasheet || null;
}

function updatePartDots() {
  const withPart = new Set(state.selected ? sheetsWithPart(state.selected).map((s) => s.id) : []);
  for (const tab of $('#tabs').children) tab.toggleAttribute('data-has-part', withPart.has(tab.dataset.id));
}

// ---- your parts (0.8 design §2): the board as you built it ----
let builtCache = { from: null, looks: null, value: { board: null, cards: {}, pinMaps: {} } };
/** The project's board with your looks applied: { board, cards, pinMaps } (worked out once per change). */
function builtLooks() {
  const board = state.project ? state.project.board : null;
  if (builtCache.from !== board || builtCache.looks !== state.looks) {
    builtCache = { from: board, looks: state.looks, value: applyLooks(board, state.looks, (ref) => state.partsByRef.get(ref) || null) };
  }
  return builtCache.value;
}
/** The board as you built it: everything that reads the project's board reads this. */
function projectBoard() {
  return builtLooks().board;
}
/** A part as its card shows it: a part fitted in another's place has its own value and type. */
function cardPart(ref) {
  const part = ref ? state.partsByRef.get(ref) : null;
  const card = part ? builtLooks().cards[ref] : null;
  return card ? { ...part, ...card } : part || null;
}

function looksCardOptions(ref) {
  const base = state.project && state.project.board ? state.project.board.parts[ref] : null;
  if (!base) return null;
  const look = state.looks[ref] || {};
  const fields = lookFields(base, look, state.partsByRef.get(ref) || null);
  if (!fields.length) return null;
  const card = builtLooks().cards[ref];
  return {
    fields,
    summary: lookSummary(fields),
    changed: Object.keys(look).length > 0,
    open: state.looksOpen,
    warning: card ? card.warning : null,
    note: card ? card.wiredTo : null,
    onToggle: (open) => { state.looksOpen = open; },
    onChange: (field, value) => {
      const choice = fields.find((f) => f.field === field)?.choices.find((c) => c.value === value);
      setLook(ref, field, value, choice ? choice.label : String(value));
    },
    onReset: () => setLook(ref, null),
  };
}

/** Your placement of a part whose pins are renamed by a swap (or by undoing one): the holes follow the names. */
function placementAfterSwap(ref, fromLooks, toLooks) {
  const placed = state.myBoard.placed[ref];
  const board = state.project ? state.project.board : null; // the drawing's own, before any look
  if (!placed || !board) return state.myBoard;
  const partOf = (r) => state.partsByRef.get(r) || null;
  const was = applyLooks(board, { [ref]: fromLooks[ref] || {} }, partOf).pinMaps[ref] || null;
  const now = applyLooks(board, { [ref]: toLooks[ref] || {} }, partOf).pinMaps[ref] || null;
  if (JSON.stringify(was) === JSON.stringify(now)) return state.myBoard;
  // back to the drawing's names first, then on to the new part's
  const original = {};
  for (const [pin, hole] of Object.entries(placed)) {
    const o = was ? Object.keys(was).find((k) => was[k] === pin) : pin; // one hole, one pin
    if (o && !original[o]) original[o] = hole;
  }
  const next = {};
  for (const [o, hole] of Object.entries(original)) {
    const pin = now ? now[o] : o;
    if (pin && !next[pin]) next[pin] = hole;
  }
  const placedNow = { ...state.myBoard.placed };
  const target = applyLooks(board, toLooks, partOf).board.parts[ref];
  if (target && Object.keys(target.pins).every((p) => next[p])) placedNow[ref] = next;
  else delete placedNow[ref]; // a pin it had is gone: place it again
  return { ...state.myBoard, placed: placedNow };
}

/** Changes how a part looks (field null: back to the drawing's look), as one undo step. */
function setLook(ref, field, value, words = String(value)) {
  const before = { looks: state.looks, myBoard: state.myBoard };
  const looks = Object.assign(Object.create(null), state.looks);
  let mine = { ...(looks[ref] || {}) };
  if (field === null) mine = {};
  else if (field === 'swap') mine = value ? { swap: value } : {}; // another part starts from its own look
  else mine[field] = value;
  if (Object.keys(mine).length) looks[ref] = mine;
  else delete looks[ref];
  const myBoard = placementAfterSwap(ref, state.looks, looks);
  const label = field === null ? `${ref} back to the drawing's look` : `${ref}: ${words}`;
  history.do({ label, apply: () => setProgress({ looks, myBoard }), revert: () => setProgress(before) });
}

function renderPartCard() {
  if (board3d && board3dOn) board3d.select(state.selected);
  drawMyBoardMarks();
  const part = state.selected ? cardPart(state.selected) : null;
  if (!part) {
    renderHint($('#part-card'));
    return;
  }
  const board = projectBoard();
  const onBoard = board ? board.parts[part.ref] : null;
  const stepIndex = stepsOf().findIndex((s) => s.parts.includes(part.ref));
  renderCard($('#part-card'), part, {
    connections: connectionsOf(board, part.ref),
    where: onBoard ? { pins: Object.entries(onBoard.pins), body: onBoard.body, mount: onBoard.mount, side: onBoard.side } : null,
    offBoard: Boolean(board) && !onBoard,
    step: stepIndex >= 0 ? stepCardOptions(part.ref, stepIndex) : null,
    ownNote: { text: state.notes[part.ref] || '', onSave: (text) => setNote(part.ref, text) },
    onPart: (ref) => selectPart(ref),
    wired: board ? state.wired : null,
    onWire: setWired,
    pins: pinOptions(onBoard),
    looks: looksCardOptions(part.ref),
    myBoard: myBoardCardOptions(part.ref, onBoard),
    extras: cardExtras(part, board),
    sheetsWithPart: sheetsWithPart(part.ref),
    datasheetHref: datasheetHref(part),
    ticked: state.ticked.has(part.ref),
    onTick: () => toggleTick(part.ref),
    ask: {
      placeholder: DEFAULT_QUESTION,
      onCopy: copyForClaude,
      onOpen: openClaude,
      here: aiReady(ai) ? {
        name: aiName(ai),
        onAsk: askHere,
        asking: asked.asking,
        waiting: asked.asking && asked.ref === part.ref,
        answer: asked.ref === part.ref ? asked.answer : '',
        failed: asked.ref === part.ref && asked.failed,
      } : null,
      onSetUp: openAiSettings,
    },
    onSheet: (id) => showPartOn(id, part.ref),
    onClose: clearPart,
  });
}

/** The pin view's options for a board part with three or more pins (0.4 design F2), else null. */
function pinOptions(onBoard) {
  const side = store.get('pinSide', 'top') === 'bottom' ? 'bottom' : 'top';
  const layout = onBoard ? pinLayout(onBoard, side) : null;
  if (!layout) return null;
  const lib = libraryFor(cardPart(state.selected));
  return {
    names: lib && lib.pins ? Object.fromEntries(layout.pins.filter((p) => lib.pins[p.pin]).map((p) => [p.pin, lib.pins[p.pin]])) : {},
    layout,
    side,
    open: state.pinsOpen,
    selected: state.pinSelected,
    onToggle: () => { state.pinsOpen = !state.pinsOpen; renderPartCard(); },
    onSide: (value) => { store.set('pinSide', value); renderPartCard(); },
    onPin: (pin) => { state.pinSelected = pin; renderPartCard(); },
  };
}

const POLARITY_PICTURES = { electrolytic: 'electrolytic', rectifier: 'diode', led: 'led' };

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(done);
  } catch {
    setStatus("Couldn't copy: allow the clipboard for this page.");
  }
}

/** Ticks several parts in one undo step. */
function tickParts(refs, label) {
  const before = [...state.ticked];
  const after = [...new Set([...before, ...refs.filter((r) => isKnownRef(r))])];
  if (after.length === before.length) return;
  history.do({ label, apply: () => setProgress({ ticked: after }), revert: () => setProgress({ ticked: before }) });
}

/** Marks several legs wired in one undo step. */
function wireMany(keys, label) {
  const before = [...state.wired];
  const after = [...new Set([...before, ...keys])];
  if (after.length === before.length) return;
  history.do({ label, apply: () => setProgress({ wired: after }), revert: () => setProgress({ wired: before }) });
}

/** The previous or next part in the checklist's order. */
function stepPart(delta) {
  if (!state.parts.length) return;
  const i = state.parts.findIndex((p) => p.ref === state.selected);
  const next = state.parts[((i < 0 ? (delta > 0 ? -1 : 0) : i) + delta + state.parts.length) % state.parts.length];
  selectPart(next.ref);
}

/** The card's helpers (0.5 improvements 9-17 and the library): markings, pictures, buttons. */
function cardExtras(part, board) {
  const lib = libraryFor(part);
  const same = part.value && !part.guessed
    ? state.parts.filter((p) => p.value === part.value && p.type === part.type).map((p) => p.ref) : [];
  const conns = board ? connectionsOf(board, part.ref) : [];
  const left = board ? stillToWire(part.ref, conns, state.wired) : [];
  const when = state.ticked.has(part.ref) ? solderedAt(state.log, part.ref) : null;
  return {
    solderedAt: when ? `Soldered at ${clock(when)}${day(when) !== day(Date.now()) ? ` on ${day(when)}` : ''}` : null,
    bands: /resistor/i.test(part.type || '') ? resistorBands(part.value) : null,
    code: /capacitor-ceramic/i.test(part.type || '') ? capacitorCode(part.value) : null,
    polarity: lib ? POLARITY_PICTURES[lib.id] || null : null,
    library: lib,
    onCopy: () => copyText(`${part.ref}${part.value ? ` ${part.value}` : ''}`, `Copied ${part.ref}.`),
    onLink: () => copyText(`${window.location.origin}${window.location.pathname}?${source.spec ? `${repoQuery(source.spec)}&` : ''}sheet=${encodeURIComponent(state.current)}&part=${encodeURIComponent(part.ref)}`, 'Link to this part copied.'),
    sameValue: same.length >= 2 ? { count: same.length, value: part.value, onTick: () => tickParts(same, `Tick all ${part.value}`) } : null,
    onWireAll: left.length ? () => wireMany(left.map((pin) => `${part.ref}:${pin}`), `Wired all of ${part.ref}`) : null,
    onPrev: () => stepPart(-1),
    onNext: () => stepPart(1),
    searchHref: part.value ? `https://duckduckgo.com/?q=${encodeURIComponent(`${part.value} datasheet`)}` : null,
  };
}

function stepCardOptions(ref, stepIndex) {
  const build = stepsOf();
  const next = nextInStep(build[stepIndex], ref, state.ticked);
  return {
    number: stepIndex + 1, total: build.length, title: build[stepIndex].title,
    next, onNext: next ? () => selectPart(next) : null,
  };
}

/** Your own note on a part: saved with the progress, undoable. */
function setNote(ref, text) {
  const value = text.trim().slice(0, 2000);
  const before = { ...state.notes };
  if ((before[ref] || '') === value) return;
  const after = { ...before };
  if (value) after[ref] = value;
  else delete after[ref];
  history.do({ label: `Note on ${ref}`, apply: () => setProgress({ notes: after }), revert: () => setProgress({ notes: before }) });
}

/** A line found with Find: open it in What to wire and ring its parts. */
function openLine(net) {
  showTab('wiring');
  state.wiringExpanded.add(net);
  state.shownNet = net;
  updateNetRings();
  renderWiringPanel();
  const group = [...document.querySelectorAll('#wiring details')].find((d) => d.dataset.net === net);
  if (group) group.scrollIntoView({ block: 'nearest' });
}

let walkingTrail = false;
function walkTrail(delta) {
  const at = state.trailAt + delta;
  if (at < 0 || at >= state.trail.length) return;
  state.trailAt = at;
  walkingTrail = true;
  selectPart(state.trail[at]);
  walkingTrail = false;
}

/** Remembers a part you opened, for Alt+← and Alt+→. */
function pushTrail(ref) {
  if (walkingTrail || !ref || state.trail[state.trailAt] === ref) return;
  state.trail = [...state.trail.slice(0, state.trailAt + 1), ref].slice(-50);
  state.trailAt = state.trail.length - 1;
}

function selectPart(ref, labelEl) {
  if (ref !== state.selected) state.pinSelected = null;
  pushTrail(ref);
  state.selected = ref;
  const label = labelEl || (firstLabelFor(state.current, ref) || {}).el || null;
  viewer.ring(label);
  updatePartDots();
  renderPartCard();
  ringInSplit();
}

function clearPart() {
  if (!state.selected) return;
  state.selected = null;
  viewer.ring(null);
  updatePartDots();
  renderPartCard();
  ringInSplit();
}

async function showPartOn(sheetId, ref) {
  if (!(await selectSheet(sheetId))) return;
  const label = firstLabelFor(sheetId, ref);
  if (label && label.el.isConnected) {
    viewer.zoomToRect(viewer.labelRect(label.el));
    viewer.ring(label.el);
  }
}

// ---- Ask Claude (design §7.8) ----
const PART_FIELDS = ['ref', 'value', 'type', 'package', 'role', 'polarized', 'orientation', 'note', 'datasheet'];

/** Up to 8 label texts nearest the part's label on the sheet on screen, nearest first. */
function nearbyText(ref) {
  const entry = state.loaded.get(state.current);
  const own = firstLabelFor(state.current, ref);
  if (!entry || entry.kind !== 'svg' || !own || !own.el.isConnected || viewer.sheetRoot() !== entry.root) return [];
  const centre = (el) => {
    const r = viewer.labelRect(el);
    return [r.x + r.w / 2, r.y + r.h / 2];
  };
  const [ox, oy] = centre(own.el);
  const seen = new Set();
  return entry.labels
    .filter((l) => refOfLabel(l.text, isKnownRef) !== ref)
    .map((l) => {
      const [x, y] = centre(l.el);
      return { text: l.text, d: Math.hypot(x - ox, y - oy) };
    })
    .sort((a, b) => a.d - b.d)
    .filter((l) => !seen.has(l.text) && seen.add(l.text))
    .slice(0, 8)
    .map((l) => l.text);
}

/** What's selected, for the Claude app (it reads window.makerForge.context() from the browser pane) and for copying. */
function buildContext() {
  const part = state.selected ? cardPart(state.selected) : null;
  const sheet = state.sheets.find((s) => s.id === state.current);
  const fields = part ? Object.fromEntries(PART_FIELDS.filter((k) => part[k] !== undefined).map((k) => [k, part[k]])) : null;
  return {
    app: 'bench',
    project: state.project ? state.project.name : null,
    revision: state.project ? state.project.revision : null,
    sheet: sheet ? sheet.label : null,
    part: fields,
    onSheets: part ? sheetsWithPart(part.ref).map((s) => s.label) : [],
    nearbyText: part ? nearbyText(part.ref) : [],
    ownNote: part && state.notes[part.ref] ? state.notes[part.ref] : null,
  };
}

window.makerForge = Object.freeze({
  context: () => buildContext(),
  board3d: Object.freeze({
    view: () => (board3d && board3dOn ? board3d.getView() : null),
    screenOf: (ref) => (board3d && board3dOn ? board3d.screenOf(ref) : null),
    info: () => (board3d && board3dOn ? board3d.info() : null),
  }),
});

async function copyForClaude(question) {
  try {
    await navigator.clipboard.writeText(contextText(buildContext(), question));
    return true;
  } catch {
    return false;
  }
}

// ---- AI help: ask Claude with your own key, or Ollama on this computer (0.7 design §5) ----
let ai = cleanAi(store.get('ai', null));
const asked = { ref: null, asking: false, answer: '', failed: false };
let aiSettings = null;

function setAi(next) {
  ai = next;
  store.set('ai', aiForStorage(ai)); // the key only when Remember is ticked
  if (state.selected) renderPartCard();
}

/** The card's Ask here: the same context Copy for Claude copies goes to the AI; the answer shows as plain text. */
async function askHere(question) {
  const ref = state.selected;
  if (!ref || asked.asking) return;
  const prompt = contextText(buildContext(), question);
  Object.assign(asked, { ref, asking: true, answer: '', failed: false });
  renderPartCard();
  try {
    asked.answer = await askAi(ai, SYSTEM, prompt, { origin: window.location.origin });
  } catch (error) {
    asked.answer = error.message;
    asked.failed = true;
  }
  asked.asking = false;
  if (state.selected) renderPartCard();
}

function openAiSettings() {
  $('#settings-button').click();
  $('#ai-title').scrollIntoView({ block: 'start' });
  $('#settings input[name=aiProvider][value=claude]').focus();
}

/** Starts the copy, then opens claude.ai at once: opening after a wait would be blocked as a popup. */
function openClaude(question) {
  const copying = copyForClaude(question);
  window.open('https://claude.ai/new', '_blank', 'noopener');
  return copying;
}

// ---- two sheets side by side (design §7.5) ----
const viewer2 = createViewer($('#stage2-view'), '#sheet-host2');
const SPLIT_MIN_WIDTH = 1000;
const split = { on: false, sheetId: null };

/** The second view draws its own copy of a sheet: one element can't be on screen twice. */
function cloneFor(entry) {
  return entry.pristine.cloneNode(true); // never the main view's root: that one may be flipped or ringed
}

function ringInSplit() {
  if (!split.on) return;
  const root = viewer2.sheetRoot();
  if (!root || !state.selected) {
    viewer2.ring(null);
    return;
  }
  const label = [...root.querySelectorAll('text')].find((t) => refOfLabel(labelText(t), isKnownRef) === state.selected);
  viewer2.ring(label || null);
}

async function showInSplit(sheetId, keepView = false) {
  split.sheetId = sheetId;
  $('#stage2-sheet').value = sheetId;
  const sheet = state.sheets.find((s) => s.id === sheetId);
  if (!sheet) return;
  const entry = await load(sheet);
  if (split.sheetId !== sheetId) return;
  const message = $('#stage2-message');
  if (entry.kind === 'error') {
    viewer2.clear();
    message.textContent = entry.message;
    message.hidden = false;
    return;
  }
  message.hidden = true;
  if (entry.kind === 'svg') {
    viewer2.show({ kind: 'svg', root: cloneFor(entry) }, { keepView });
    applyTickMarks();
  } else {
    const img = entry.img.cloneNode();
    await img.decode().catch(() => {});
    viewer2.show({ kind: 'image', img }, { keepView });
  }
  ringInSplit();
}

function fillSplitChoices() {
  const select = $('#stage2-sheet');
  select.replaceChildren(...state.sheets.filter((s) => !s.missing).map((s) => {
    const option = document.createElement('option');
    option.value = s.id;
    option.textContent = s.label;
    return option;
  }));
  if (split.sheetId) select.value = split.sheetId;
}

/** Shows a layout next to a schematic, and a schematic next to anything else. */
function defaultSplitSheet() {
  const main = state.sheets.find((s) => s.id === state.current);
  const wanted = main && main.kind === 'schematic' ? 'layout' : 'schematic';
  const pick = state.sheets.find((s) => !s.missing && s.kind === wanted && s.id !== state.current) ||
    state.sheets.find((s) => !s.missing && s.id !== state.current);
  return pick ? pick.id : null;
}

function setSplit(on) {
  split.on = on;
  $('#stage2').hidden = !on;
  $('#split').setAttribute('aria-pressed', String(on));
  if (on) {
    fillSplitChoices();
    const sheetId = split.sheetId && state.sheets.some((s) => s.id === split.sheetId) ? split.sheetId : defaultSplitSheet();
    if (sheetId) showInSplit(sheetId);
  }
}

function updateSplitButton() {
  const button = $('#split');
  const wide = window.innerWidth >= SPLIT_MIN_WIDTH;
  button.disabled = !wide;
  if (wide) button.removeAttribute('title');
  else button.title = 'Side by side needs a wider window (1000 px or more).';
  if (!wide && split.on) setSplit(false);
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
  extras: (query) => [
    ...findLines(projectBoard(), query)
      .map((l) => ({ cls: 'find-line', text: `Line ${l.label}: ${l.legs} legs`, onPick: () => openLine(l.net) })),
    ...findValues(state.parts, query).map((p) => ({ cls: 'find-value', text: `${p.ref} ${p.value}`, onPick: () => selectPart(p.ref) })),
  ],
});

// ---- the project file and its parts (design §6) ----

/** Reads forge-project.json. On a problem, says why (whenever the status line is free) and gives null. */
async function readProjectFile() {
  try {
    const { text } = await source.text('forge-project.json');
    const project = parseProject(text);
    state.projectProblem = '';
    return project;
  } catch (error) {
    if (!(error instanceof ProjectError) && !(error instanceof ServerError) && !(error instanceof SourceError)) console.warn(error);
    state.projectProblem = error instanceof SourceError ? error.message : projectProblemText(error, error instanceof ServerError, SERVER_DOWN);
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
  renderStepsPanel();
  renderWiringPanel();
  renderChecksPanel();
  renderContinuityPanel();
}

// ---- the 3D board (board-view design §5), over the dimmed schematic ----
let board3d = null;
let board3dOn = false;

function updateBoard3DButton() {
  $('#board3d-toggle').hidden = !(state.project && state.project.board);
}

function syncStep3D() {
  if (!board3d || !board3dOn) return;
  const steps = stepsOf();
  const open = state.openStep !== null && steps[state.openStep] ? state.openStep : null;
  const now = open !== null ? steps[open].parts : [];
  const later = open !== null ? steps.slice(open + 1).flatMap((s) => s.parts) : [];
  board3d.setStep(now, later, { hideLater: open !== null && ($('#board3d-upto').checked || Boolean(stepPlayer)) });
}

/** What the 3D view prints and names: each part's value. */
const partDetails = () => Object.fromEntries(state.parts.map((p) => [p.ref, { value: cardPart(p.ref).value || '' }]));

function download(href, name) {
  const link = el('a', { href, download: name });
  document.body.append(link);
  link.click();
  link.remove();
}
const fileSafe = (s) => s.replace(/[\\/:*?"<>|]/g, '_');

/** Play the steps: the 3D board builds up one step at a time (0.5 big improvement B9). */
let stepPlayer = null;
function playSteps() {
  if (stepPlayer) {
    clearInterval(stepPlayer);
    stepPlayer = null;
    $('#board3d-play').setAttribute('aria-pressed', 'false');
    $('#board3d-play').textContent = 'Play the steps';
    syncStep3D();
    return;
  }
  const steps = stepsOf();
  if (!steps.length) return;
  let i = 0;
  $('#board3d-play').setAttribute('aria-pressed', 'true');
  $('#board3d-play').textContent = 'Stop';
  stepPlayer = setInterval(() => {
    i++;
    if (i >= steps.length) {
      playSteps();
      return;
    }
    openStep(i);
  }, 1400);
  openStep(0);
}

let board3dSource = 'sheet4'; // which board the 3D view shows: 'sheet4' or 'mine' (0.5 big improvement B4)

/** Your own placement as a board, when a photo is lined up. */
function myBoardFor3D() {
  const board = projectBoard();
  if (!board || !Object.keys(state.myBoard.photos).length) return null;
  const wires = store.get('showWires', false) === true
    ? suggestAll(board, state.myBoard.placed, anchorRef(), state.myBoard.routes || {}).flatMap((g) => g.wires.map((w) => w.path)) : [];
  const mine = boardFromPlacement(board, state.myBoard.placed, anchorRef(), wires);
  const map = holeMap();
  if (mine && map) {
    const [dc, dr] = mine.shift;
    mine.edgeLabels = [];
    for (let c = 2; c < mine.cols; c++) {
      const text = edgeName(map, 0, c - dc);
      if (text) mine.edgeLabels.push({ at: [c, 0.5], text });
    }
    for (let r = 2; r < mine.rows; r++) {
      const text = edgeName(map, 1, r - dr);
      if (text) mine.edgeLabels.push({ at: [0.5, r], text });
    }
  }
  return mine;
}

/** The board the 3D view draws now. */
function board3dData() {
  const mine = board3dSource === 'mine' ? myBoardFor3D() : null;
  return mine || projectBoard();
}

function updateBoard3DSource() {
  const mine = myBoardFor3D();
  if (!mine && board3dSource === 'mine') board3dSource = 'sheet4';
  $('#board3d-mine').hidden = !mine;
  $('#board3d-sheet4').setAttribute('aria-pressed', String(board3dSource === 'sheet4'));
  $('#board3d-mine').setAttribute('aria-pressed', String(board3dSource === 'mine'));
  const note = $('#board3d-mine-note');
  note.hidden = board3dSource !== 'mine' || !mine;
  if (mine) {
    const total = Object.keys(state.project.board.parts).length;
    note.textContent = `${mine.placedCount + 1} of ${total} parts placed`;
  }
}

function setBoard3DSource(source) {
  board3dSource = source;
  updateBoard3DSource();
  resetBoard3D();
}

let board3dBuilding = null; // the build in progress, so two quick toggles build one view
let board3dBoard = '';       // the board the view was built from, to rebuild only when it changes

async function setBoard3D(on) {
  board3dOn = on && Boolean(state.project && state.project.board);
  $('#board3d').hidden = !board3dOn;
  $('#board3d-toggle').setAttribute('aria-pressed', String(board3dOn));
  $('#sheet-host').style.opacity = board3dOn ? '0.35' : '';
  $('#zoom-level').hidden = board3dOn; // the sheet's zoom; the 3D view has its own cube there
  if (!board3dOn) return;
  const schematic = state.sheets.find((s) => s.kind === 'schematic' && !s.missing);
  const shown = state.sheets.find((s) => s.id === state.current);
  if (schematic && (!shown || shown.kind !== 'schematic')) await selectSheet(schematic.id);
  const message = $('#board3d-message');
  if (!board3d) {
    if (!board3dBuilding) {
      message.hidden = true;
      const board = board3dData();
      const cameraKey = `camera:${projectName()}:${board3dSource}`;
      board3dBuilding = createBoard3D($('#board3d-view'), board, {
        onPick: (ref) => selectPart(ref),
        camera: store.get(cameraKey, null),
        onCamera: (camera) => store.set(cameraKey, camera),
        details: partDetails(),
      }).then((view) => {
        if (view) {
          view.showWiring($('#board3d-wiring').checked);
          view.showLabels($('#board3d-labels').checked);
          view.setXray($('#board3d-xray').checked);
          view.setExplode(Number($('#board3d-explode').value));
          const cut = Number($('#board3d-clip').value);
          view.setClip(cut >= 1 ? null : cut);
        }
        board3d = view;
        board3dBoard = JSON.stringify(board);
        board3dBuilding = null;
        return view;
      });
    }
    if (!(await board3dBuilding)) {
      message.textContent = "This browser can't draw 3D here. Sheet 4 shows the same layout flat.";
      message.hidden = false;
      return;
    }
  }
  if (!board3dOn || !board3d) return;
  board3d.select(state.selected);
  syncStep3D();
}

/** The project file changed: build the 3D view again if its board did (the camera stays otherwise). */
async function resetBoard3D() {
  updateBoard3DButton();
  if (board3dBuilding) await board3dBuilding;
  updateBoard3DSource();
  const board = board3dData();
  if (board3d && board && JSON.stringify(board) === board3dBoard) return;
  if (board3d) board3d.dispose();
  board3d = null;
  board3dBoard = '';
  if (board3dOn) setBoard3D(true);
}

// ---- your board, from your photos (0.4 design F3) ----
const boardOf = () => projectBoard();
const isPhotoSheet = (id) => state.sheets.some((s) => s.id === id && (s.type === 'png' || s.type === 'jpg'));
const hasPhotos = () => state.sheets.some((s) => !s.missing && (s.type === 'png' || s.type === 'jpg'));
const sheetLabel = (id) => (state.sheets.find((s) => s.id === id) || { label: id }).label;

function anchorRef() {
  const board = boardOf();
  if (!board) return null;
  return state.myBoard.anchor && board.parts[state.myBoard.anchor] ? state.myBoard.anchor : anchorFor(board);
}

/** The photo's transform, if it's lined up and the anchor still has those pins. */
function transformFor(id) {
  const photo = state.myBoard.photos[id];
  const board = boardOf();
  const anchor = anchorRef();
  if (!photo || !board || !anchor) return null;
  const pins = board.parts[anchor].pins;
  if (!pins[photo.a.pin] || !pins[photo.b.pin]) return null;
  return photoTransform(pins[photo.a.pin], pins[photo.b.pin], [photo.a.x, photo.a.y], [photo.b.x, photo.b.y], photo.side);
}

/** Your board's hole names, solved from what you typed (0.6 design §1), or null. */
function holeMap() {
  const board = boardOf();
  const anchor = anchorRef();
  return board && anchor ? labelsMap(state.myBoard.labels, board.parts[anchor]) : null;
}

/** A hole's printed name on your board, or null. */
function nameOfHole(hole) {
  return holeName(holeMap(), hole);
}

const photoSide = (id) => (state.myBoard.photos[id] ? state.myBoard.photos[id].side : state.photoSides[id] || 'top');
const photoBright = (id) => (state.myBoard.photos[id] ? state.myBoard.photos[id].bright : state.brightUnlined.has(id));

/** An undoable change to your board: the before and after are whole copies. */
function changeMyBoard(label, change) {
  const before = state.myBoard;
  const after = structuredClone(before);
  change(after);
  history.do({ label, apply: () => setProgress({ myBoard: after }), revert: () => setProgress({ myBoard: before }) });
}

function pinState(ref, pin) {
  const board = boardOf();
  const conn = board ? connectionsOf(board, ref).find((c) => c.pin === pin) : null;
  if (!conn || !conn.others.length) return 'none';
  return state.wired.has(`${ref}:${pin}`) ? 'wired' : 'open';
}

/** The marks on the photo on screen: the anchor's pins, placed parts, and the taps of a part being placed. */
/** Your placements, with a part being dragged shown where it would land. */
function placedNow() {
  const placed = state.myBoard.placed;
  const d = state.dragPreview;
  if (!d || !placed[d.ref] || (!d.dc && !d.dr)) return placed;
  return { ...placed, [d.ref]: Object.fromEntries(Object.entries(placed[d.ref]).map(([pin, [c, r]]) => [pin, [c + d.dc, r + d.dr]])) };
}

const MARK_SCALE = { small: 0.7, medium: 1, large: 1.45 };

function drawMyBoardMarks() {
  const img = viewer.image();
  const t = img ? transformFor(state.current) : null;
  if (!t) {
    viewer.setOverlay(null);
    return;
  }
  const board = boardOf();
  const anchor = anchorRef();
  const placed = placedNow();
  const step = state.openStep !== null ? stepsOf()[state.openStep] : null;
  const inStep = new Set(step ? step.parts : []);
  const cls = (ref) => [ref === state.selected ? 'myboard-selected' : inStep.has(ref) ? 'myboard-step' : '', state.ticked.has(ref) ? 'myboard-soldered' : ''].filter(Boolean).join(' ');
  const pins = [];
  const tags = [];
  const texts = [];
  const marks = store.get('marksHidden', false) !== true;
  const scale = MARK_SCALE[store.get('markSize', 'medium')] || 1;
  if (marks) {
    for (const [pin, hole] of Object.entries(board.parts[anchor].pins)) pins.push({ ref: anchor, pin, at: t.toPixel(hole), state: pinState(anchor, pin), cls: cls(anchor) });
    tags.push({ ref: anchor, at: t.toPixel(board.parts[anchor].pins[anchorPins(board.parts[anchor]).a]), cls: cls(anchor) });
    for (const [ref, holes] of Object.entries(placed)) {
      if (ref === anchor || (state.mode && state.mode.kind === 'place' && state.mode.ref === ref)) continue;
      const entries = Object.entries(holes);
      for (const [pin, hole] of entries) pins.push({ ref, pin, at: t.toPixel(hole), state: pinState(ref, pin), cls: cls(ref) });
      if (entries.length) tags.push({ ref, at: t.toPixel(entries[0][1]), cls: cls(ref) });
    }
    if (state.mode && state.mode.kind === 'place') {
      for (const [pin, hole] of Object.entries(state.mode.taps)) pins.push({ ref: state.mode.ref, pin, at: t.toPixel(hole), state: 'none', cls: 'myboard-pending' });
    }
    const sg = suggestionOnShow();
    if (sg) {
      const entries = Object.entries(sg.spot.pins);
      for (const [pin, hole] of entries) pins.push({ ref: sg.ref, pin, at: t.toPixel(hole), state: 'none', cls: 'myboard-suggest' });
      tags.push({ ref: sg.ref, at: t.toPixel(entries[0][1]), cls: 'myboard-suggest' });
    }
    // line labels beside the chip's pins, out from the chip's middle
    if (store.get('lineLabels', false) === true) {
      const chip = Object.values(board.parts[anchor].pins).map((h) => t.toPixel(h));
      const mid = [chip.reduce((s, p) => s + p[0], 0) / chip.length, chip.reduce((s, p) => s + p[1], 0) / chip.length];
      for (const c of connectionsOf(board, anchor)) {
        const at = t.toPixel(board.parts[anchor].pins[c.pin]);
        const len = Math.hypot(at[0] - mid[0], at[1] - mid[1]) || 1;
        texts.push({ at: [at[0] + ((at[0] - mid[0]) / len) * t.pitch * 1.4, at[1] + ((at[1] - mid[1]) / len) * t.pitch * 1.4], text: c.label, cls: 'line-label' });
      }
    }
    // the selected part's pin names
    const sel = state.selected;
    const selHoles = sel === anchor ? board.parts[anchor].pins : sel ? placed[sel] : null;
    if (selHoles) {
      const lib = libraryForPart(cardPart(sel));
      for (const [pin, hole] of Object.entries(selHoles)) {
        const at = t.toPixel(hole);
        const name = lib && lib.pins && lib.pins[pin] ? lib.pins[pin].split(' ')[0] : pinText(pin);
        texts.push({ at: [at[0], at[1] - t.pitch * 0.62], text: name, cls: 'pin-name' });
      }
    }
  }
  const wires = store.get('showWires', false) === true
    ? suggestAll(board, placed, anchor, state.myBoard.routes || {}).flatMap((g) => g.wires.map((w) => ({ net: g.net, kind: g.kind, points: w.path.map((h) => t.toPixel(h)) })))
    : [];
  viewer.setOverlay(buildOverlay(viewer.imageSize(), t.pitch, pins, tags, { wires, texts, scale }));
}

/** Dragging a selected, placed part on a lined-up photo moves it on whole holes (0.5 big improvement B1). */
function onPhotoDrag(phase, x, y) {
  const t = transformFor(state.current);
  if (!t) return false;
  const [c, r] = snap(t.toBoard([x, y]));
  if (phase === 'down') {
    const ref = state.selected;
    const holes = ref && ref !== anchorRef() ? state.myBoard.placed[ref] : null;
    if (state.mode || !holes) return false;
    const [fc, fr] = t.toBoard([x, y]);
    const near = Object.values(holes).some(([hc, hr]) => Math.hypot(hc - fc, hr - fr) <= 0.7);
    if (!near) return false;
    state.dragPreview = { ref, from: [c, r], dc: 0, dr: 0 };
    return true;
  }
  const d = state.dragPreview;
  if (!d) return false;
  if (phase === 'move') {
    const dc = c - d.from[0];
    const dr = r - d.from[1];
    if (dc !== d.dc || dr !== d.dr) {
      state.dragPreview = { ...d, dc, dr };
      drawMyBoardMarks();
    }
    return true;
  }
  state.dragPreview = null;
  if (phase === 'up' && (c !== d.from[0] || r !== d.from[1])) {
    const dc = c - d.from[0];
    const dr = r - d.from[1];
    changeMyBoard(`Move ${d.ref}`, (b) => {
      b.placed[d.ref] = Object.fromEntries(Object.entries(b.placed[d.ref]).map(([pin, [pc, pr]]) => [pin, [pc + dc, pr + dr]]));
    });
  } else {
    drawMyBoardMarks();
  }
  return true;
}

/** The order to place parts in: the build steps', then any others. */
function placingOrder() {
  const board = boardOf();
  const fromSteps = stepsOf().flatMap((s) => s.parts);
  return [...new Set([...fromSteps, ...Object.keys(board.parts)])].filter((ref) => board.parts[ref] && ref !== anchorRef());
}

function myBoardMore() {
  const board = boardOf();
  const anchor = anchorRef();
  const step = state.openStep !== null ? stepsOf()[state.openStep] : null;
  const unplacedInStep = step ? step.parts.filter((ref) => board.parts[ref] && ref !== anchor && !state.myBoard.placed[ref]) : [];
  const routes = store.get('showWires', false) === true ? suggestAll(board, state.myBoard.placed, anchor, state.myBoard.routes || {})
    .map((g) => ({ net: g.net, label: g.label, shape: g.shape, texts: g.wires.map((w) => wireText(w, nameOfHole)) })) : [];
  return {
    marks: store.get('marksHidden', false) !== true,
    size: store.get('markSize', 'medium'),
    lineLabels: store.get('lineLabels', false) === true,
    wires: store.get('showWires', false) === true,
    routes,
    findings: checkPlacement(board, state.myBoard.placed, anchor, nameOfHole),
    labels: holeLabelsOptions(),
    suggest: suggestOptions(),
    onSuggest: () => {
      const sel = state.selected;
      const ref = sel && board.parts[sel] && sel !== anchor && !state.myBoard.placed[sel] ? sel : placingOrder().find((r) => !state.myBoard.placed[r]);
      if (ref) suggestSpot(ref);
      else say('Every part is placed.');
    },
    stepTodo: step && unplacedInStep.length ? `Step ${state.openStep + 1}, not placed yet: ${unplacedInStep.join(', ')}` : '',
    clearArmed: Date.now() - state.clearAt < 5000,
    onMarks: (on) => { store.set('marksHidden', !on); updateMyBoard(); },
    onSize: (size) => { store.set('markSize', size); updateMyBoard(); },
    onLineLabels: (on) => { store.set('lineLabels', on); updateMyBoard(); },
    onWires: (on) => { store.set('showWires', on); updateMyBoard(); resetBoard3D(); },
    onRoute: (net, shape, label) => changeMyBoard(`Wires for ${label}: ${shape}`, (b) => { b.routes = { ...(b.routes || {}), [net]: shape }; }),
    onShow: (ref) => selectPart(ref),
    onNext: () => {
      const ref = placingOrder().find((r) => !state.myBoard.placed[r]);
      if (ref) {
        selectPart(ref);
        placeOnBoard(ref);
      } else {
        say('Every part is placed.');
      }
    },
    onClear: () => {
      if (Date.now() - state.clearAt >= 5000) {
        state.clearAt = Date.now();
        renderMyBoardPanel();
        setTimeout(renderMyBoardPanel, 5100);
        return;
      }
      state.clearAt = 0;
      changeMyBoard('Clear my board', (b) => { b.placed = {}; });
      say('Your board is cleared. Ctrl+Z brings the parts back.');
    },
  };
}

/** The suggested spot on show on this photo, if any. */
function suggestionOnShow() {
  const sg = state.suggest;
  if (!sg || sg.sheet !== state.current || !transformFor(state.current)) return null;
  return { ref: sg.ref, spot: sg.spots[sg.index], index: sg.index, count: sg.spots.length };
}

/** Suggest a spot for a part (0.6 design §2): the best three, shown one at a time as dashed marks. */
async function suggestSpot(ref) {
  const id = linedPhoto();
  if (!id) {
    const photo = state.sheets.find((s) => !s.missing && (s.type === 'png' || s.type === 'jpg'));
    if (photo && photo.id !== state.current) await selectSheet(photo.id);
    state.myBoardOpen = true;
    say('Line up this photo first: press "Line it up" and tap the two pins it asks for.');
    return;
  }
  if (id !== state.current) await selectSheet(id);
  state.myBoardOpen = true;
  if (state.mode) stopTapping('');
  const r = suggestSpots(boardOf(), state.myBoard.placed, anchorRef(), ref, { name: nameOfHole });
  state.suggest = r.spots.length ? { ref, spots: r.spots, index: 0, sheet: state.current } : null;
  state.myBoardStatus = r.spots.length ? '' : r.why;
  state.myBoardStatusSheet = state.current;
  drawMyBoardMarks();
  renderMyBoardPanel();
  const use = $('#suggest-use');
  if (use) use.focus();
}

function stopSuggest(text = '') {
  state.suggest = null;
  state.myBoardStatus = text;
  drawMyBoardMarks();
  renderMyBoardPanel();
}

function suggestOptions() {
  const sg = suggestionOnShow();
  if (!sg) return null;
  const legs = Object.entries(sg.spot.pins).map(([pin, hole]) => {
    const n = nameOfHole(hole);
    return n ? `${pinText(pin)} in ${n}` : '';
  }).filter(Boolean);
  return {
    title: `Suggested spot for ${sg.ref} (${sg.index + 1} of ${sg.count})`,
    reason: sg.spot.reason,
    legs: legs.length ? `Its legs: ${legs.join(', ')}` : '',
    more: sg.count > 1,
    onUse: () => {
      const { ref } = sg;
      const { pins, reason } = sg.spot;
      const again = Boolean(state.myBoard.placed[ref]);
      changeMyBoard(`${again ? 'Move' : 'Place'} ${ref}`, (b) => { b.placed[ref] = structuredClone(pins); });
      say(`${ref} ${again ? 'moved' : 'placed'}${reason ? `: ${reason}` : ''}. Undo (Ctrl+Z) takes it back.`);
    },
    onAnother: () => {
      state.suggest = { ...state.suggest, index: (state.suggest.index + 1) % state.suggest.spots.length };
      drawMyBoardMarks();
      renderMyBoardPanel();
    },
    onStop: () => stopSuggest('Stopped.'),
  };
}

/** The hole names form in Your board: what's printed by three of the anchor's pins. */
function holeLabelsOptions() {
  const board = boardOf();
  const anchor = anchorRef();
  const part = board.parts[anchor];
  const { a, b } = anchorPins(part);
  const c = acrossPin(part, a, b);
  if (!c) return { unavailable: `Hole names need ${anchor} to have two rows of pins.` };
  const saved = state.myBoard.labels;
  const map = holeMap();
  const same = saved && saved.a.pin === a && saved.b.pin === b && saved.c.pin === c;
  return {
    anchor,
    pins: [a, b, c].map((pin) => `${anchor} ${pinText(pin)}`),
    values: same ? [saved.a.text, saved.b.text, saved.c.text] : ['', '', ''],
    skip: saved ? saved.skip : '',
    on: Boolean(map),
    editing: state.labelsEditing,
    why: state.labelsWhy,
    summary: map ? `Hole names like your board's: ${anchor} ${pinText(a)} is at ${holeName(map, part.pins[a])}.` : '',
    onEdit: () => {
      state.labelsEditing = true;
      state.labelsWhy = '';
      renderMyBoardPanel();
      const first = $('#hn-a');
      if (first) first.focus();
    },
    onCancel: () => {
      state.labelsEditing = false;
      state.labelsWhy = '';
      renderMyBoardPanel();
    },
    onUse: (texts, skip) => {
      const r = solveLabels(part.pins[a], part.pins[b], part.pins[c], texts[0], texts[1], texts[2], skip);
      if (!r.ok) {
        state.labelsWhy = r.why;
        renderMyBoardPanel();
        return;
      }
      state.labelsEditing = false;
      state.labelsWhy = '';
      const tidy = (t) => t.trim().toUpperCase().replace(/\s+/g, '');
      changeMyBoard('Hole names', (bd) => {
        bd.labels = { a: { pin: a, text: tidy(texts[0]) }, b: { pin: b, text: tidy(texts[1]) }, c: { pin: c, text: tidy(texts[2]) }, skip: skip.toUpperCase().replace(/[^A-Z]/g, '') };
      });
      say(`Hole names on: ${anchor} ${pinText(a)} is at ${tidy(texts[0])}. Cards, checks and wires now say where on your board.`);
    },
    onOff: () => {
      changeMyBoard('Hole names off', (bd) => { delete bd.labels; });
      say('Hole names off. Ctrl+Z brings them back.');
    },
  };
}

/** Hovering a lined-up photo with hole names: the hole's name and what's in it. */
function holeTipText(point) {
  const t = transformFor(state.current);
  const map = holeMap();
  if (!t || !map) return '';
  const f = t.toBoard(point);
  const hole = snap(f);
  if (Math.hypot(f[0] - hole[0], f[1] - hole[1]) > 0.42) return '';
  const name = holeName(map, hole);
  if (!name) return '';
  const legs = placedLegs(boardOf(), placedNow(), anchorRef()).filter((l) => l.hole[0] === hole[0] && l.hole[1] === hole[1]);
  return [name, ...legs.map((l) => `${l.ref} ${pinText(l.pin)}`)].join(' · ');
}

function myBoardIdleStatus() {
  if (!boardOf()) return 'This project has no board data, so there is nothing to line up.';
  const anchor = anchorRef();
  if (!transformFor(state.current)) {
    const { a, b } = anchorPins(boardOf().parts[anchor]);
    return `Not lined up yet. Press "Line it up", then tap ${anchor} ${pinText(a)} and ${anchor} ${pinText(b)} on the photo.`;
  }
  return `Lined up: ${anchor}'s pins are marked (green wired, orange not yet). Tap a marked part to open its card.`;
}

function renderMyBoardPanel() {
  const section = $('#myboard');
  const photo = isPhotoSheet(state.current) && boardOf();
  section.hidden = !(state.myBoardOpen && photo);
  $('#myboard-toggle').hidden = !photo;
  $('#myboard-toggle').setAttribute('aria-pressed', String(state.myBoardOpen && Boolean(photo)));
  if (section.hidden) return;
  const board = boardOf();
  renderMyBoard(section, {
    photoLabel: sheetLabel(state.current),
    side: photoSide(state.current),
    lined: Boolean(transformFor(state.current)),
    status: state.mode ? state.myBoardStatus : state.myBoardStatus || myBoardIdleStatus(),
    busy: Boolean(state.mode),
    bright: photoBright(state.current),
    placedCount: Object.keys(state.myBoard.placed).filter((r) => board.parts[r]).length + (transformFor(state.current) ? 1 : 0),
    partCount: Object.keys(board.parts).length,
    onSide: setPhotoSide,
    onSaveFile: saveBoardFile,
    onOpenFile: openBoardFile,
    onLine: startLining,
    onStop: stopTapping,
    onBright: setBright,
    more: transformFor(state.current) ? myBoardMore() : null,
  });
}

/** Save my board as a file (0.6 design §3): line-ups, placements, wire shapes, hole names. */
function saveBoardFile() {
  if (!Object.keys(state.myBoard.photos).length) {
    say('Nothing to save yet: line up a photo first.');
    return;
  }
  const text = exportBoard({ project: projectName(), revision: state.project ? state.project.revision : null, myBoard: state.myBoard });
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  download(url, `${fileSafe(projectName())}-my-board.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Saved your board as a file. The photos stay in your my-board folder.');
}

async function openBoardFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try {
    data = importBoard(await file.text());
  } catch (error) {
    say(error instanceof BoardFileError ? error.message : new BoardFileError().message);
    return;
  }
  if (data.project && data.project !== projectName()) {
    say(`That board file is for ${data.project}, not ${projectName()}.`);
    return;
  }
  const before = state.myBoard;
  const after = data.myBoard;
  history.do({ label: 'Open a board file', apply: () => setProgress({ myBoard: after }), revert: () => setProgress({ myBoard: before }) });
  const missing = Object.keys(after.photos).filter((id) => !state.sheets.some((s) => s.id === id && !s.missing));
  const placed = Object.keys(after.placed).length;
  say(`Opened: ${placed} ${placed === 1 ? 'part' : 'parts'} placed.${missing.length ? ` Not in this folder: ${missing.join(', ')}.` : ''} Ctrl+Z goes back.`);
}

/** Everything that shows your board: the marks, the section, the photo's brightness. */
function turnPhoto() {
  if (!viewer.image()) return;
  const next = (viewer.getTurn() + 90) % 360;
  viewer.setTurn(next);
  store.set(`turn:${projectName()}:${state.current}`, next);
  updateRotateButton();
}

function updateRotateButton() {
  const button = $('#rotate');
  button.hidden = !viewer.image();
  button.setAttribute('data-turn', String(viewer.image() ? viewer.getTurn() : 0));
}

function updateMyBoard() {
  updateRotateButton();
  if (board3dSource === 'mine' || !$('#board3d-mine').hidden !== Boolean(myBoardFor3D())) resetBoard3D();
  if (state.myBoardStatusSheet !== state.current) state.myBoardStatus = ''; // a message belongs to its photo
  const img = viewer.image();
  if (img) img.style.filter = photoBright(state.current) ? 'brightness(1.6) contrast(1.15)' : '';
  if (state.mode && state.mode.sheet !== state.current) stopTapping('');
  drawMyBoardMarks();
  renderMyBoardPanel();
}

function say(text) {
  state.myBoardStatus = text;
  state.myBoardStatusSheet = state.current;
  renderMyBoardPanel();
}

function setPhotoSide(side) {
  const id = state.current;
  if (state.myBoard.photos[id]) {
    if (state.myBoard.photos[id].side === side) return;
    changeMyBoard(`${sheetLabel(id)}: ${side === 'bottom' ? 'underneath' : 'top'}`, (b) => { b.photos[id].side = side; });
  } else {
    state.photoSides[id] = side;
    updateMyBoard();
  }
}

function setBright(on) {
  const id = state.current;
  if (state.myBoard.photos[id]) {
    changeMyBoard(`${sheetLabel(id)}: ${on ? 'brighter' : 'normal'}`, (b) => { b.photos[id].bright = on; });
  } else {
    if (on) state.brightUnlined.add(id);
    else state.brightUnlined.delete(id);
    updateMyBoard();
  }
}

function startLining() {
  const anchor = anchorRef();
  if (!anchor) return;
  state.suggest = null;
  state.mode = { kind: 'line', sheet: state.current, taps: [] };
  const { a } = anchorPins(boardOf().parts[anchor]);
  say(`Tap ${anchor} ${pinText(a)} on the photo (the pin by the notch). Esc stops.`);
}

function stopTapping(text = 'Stopped.') {
  state.mode = null;
  state.myBoardStatus = text;
  drawMyBoardMarks();
  renderMyBoardPanel();
}

/** A tap on a photo: the next step of lining up or placing, or else opening the part tapped. */
function onPhotoTap(x, y) {
  const mode = state.mode;
  const anchor = anchorRef();
  if (mode && mode.kind === 'line' && anchor) {
    mode.taps.push([x, y]);
    const { a, b } = anchorPins(boardOf().parts[anchor]);
    if (mode.taps.length === 1) {
      say(`Now tap ${anchor} ${pinText(b)}: the last pin on the same side.`);
      return;
    }
    const [pa, pb] = mode.taps;
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 4) {
      mode.taps.pop();
      say(`That's the same spot. Tap ${anchor} ${pinText(b)}.`);
      return;
    }
    const id = state.current;
    const side = photoSide(id);
    const bright = photoBright(id);
    state.mode = null;
    state.myBoardStatus = '';
    changeMyBoard(`Line up ${sheetLabel(id)}`, (board) => {
      board.anchor = anchor;
      board.photos[id] = { side, a: { pin: a, x: pa[0], y: pa[1] }, b: { pin: b, x: pb[0], y: pb[1] }, bright };
    });
    say(`Lined up: ${anchor}'s pins are marked. Check they sit on the right holes; if not, line it up again.`);
    return;
  }
  const t = transformFor(state.current);
  if (!t) return;
  if (mode && mode.kind === 'place') {
    const pin = mode.pins[Object.keys(mode.taps).length];
    mode.taps[pin] = snap(t.toBoard([x, y]));
    const next = mode.pins[Object.keys(mode.taps).length];
    if (next) {
      say(`Placing ${mode.ref}: tap the ${pinText(next)} hole (${Object.keys(mode.taps).length + 1} of ${mode.pins.length}). Esc stops.`);
      drawMyBoardMarks();
      return;
    }
    const { ref, taps } = mode;
    state.mode = null;
    state.myBoardStatus = '';
    changeMyBoard(`Place ${ref}`, (b) => { b.placed[ref] = taps; });
    say(`${ref} placed. Undo (Ctrl+Z) takes it off again.`);
    return;
  }
  // no tapping going on: open the card of the marked part nearest the tap
  const [c, r] = t.toBoard([x, y]);
  let best = null;
  const consider = (ref, hole) => {
    const d = Math.hypot(hole[0] - c, hole[1] - r);
    if (d <= 0.6 && (!best || d < best.d)) best = { ref, d };
  };
  for (const [ref, placed] of Object.entries(state.myBoard.placed)) for (const hole of Object.values(placed)) consider(ref, hole);
  if (anchor) for (const hole of Object.values(boardOf().parts[anchor].pins)) consider(anchor, hole);
  if (best) selectPart(best.ref);
}

/** The first lined-up photo: the one on screen if it is, else the first in the tabs. */
function linedPhoto() {
  if (transformFor(state.current)) return state.current;
  const found = state.sheets.find((s) => !s.missing && transformFor(s.id));
  return found ? found.id : null;
}

async function placeOnBoard(ref) {
  const id = linedPhoto();
  if (!id) {
    const photo = state.sheets.find((s) => !s.missing && (s.type === 'png' || s.type === 'jpg'));
    if (photo && photo.id !== state.current) await selectSheet(photo.id);
    state.myBoardOpen = true;
    say('Line up this photo first: press "Line it up" and tap the two pins it asks for.');
    return;
  }
  if (id !== state.current) await selectSheet(id);
  state.myBoardOpen = true;
  const names = Object.keys(boardOf().parts[ref].pins);
  const pins = names.every((n) => /^\d+$/.test(n)) ? [...names].sort((a, b) => Number(a) - Number(b)) : names;
  state.suggest = null;
  state.mode = { kind: 'place', sheet: state.current, ref, pins, taps: {} };
  say(`Placing ${ref}: tap the ${pinText(pins[0])} hole (1 of ${pins.length}). Esc stops.`);
  drawMyBoardMarks();
}

async function showOnPhoto(ref) {
  const id = linedPhoto();
  if (!id) return;
  if (id !== state.current) await selectSheet(id);
  selectPart(ref);
}

/** The chip's card, before any photo is lined up: go to the first photo and start the two taps. */
async function lineUpFromCard() {
  const photo = state.sheets.find((s) => !s.missing && (s.type === 'png' || s.type === 'jpg'));
  if (!photo) return;
  if (photo.id !== state.current) await selectSheet(photo.id);
  state.myBoardOpen = true;
  startLining();
}

function myBoardCardOptions(ref, onBoard) {
  if (!onBoard || !hasPhotos()) return null;
  if (ref === anchorRef() && !linedPhoto()) return { lineUp: lineUpFromCard };
  const map = holeMap();
  const holes = ref === anchorRef() ? boardOf().parts[ref].pins : state.myBoard.placed[ref];
  let where = '';
  if (map && holes) {
    let entries = Object.entries(holes);
    if (entries.length > 4) {
      const { a, b } = anchorPins({ pins: holes });
      entries = [[a, holes[a]], [b, holes[b]]];
    }
    where = `On your board: ${entries.map(([pin, h]) => `${pinText(pin)} at ${holeName(map, h) || 'off the labels'}`).join(', ')}`;
  }
  return {
    where,
    anchor: ref === anchorRef(),
    placed: Boolean(state.myBoard.placed[ref]) && Boolean(linedPhoto()),
    onPlace: () => placeOnBoard(ref),
    onSuggest: () => suggestSpot(ref),
    onShow: () => showOnPhoto(ref),
    onUnplace: () => changeMyBoard(`Take ${ref} off your board`, (b) => { delete b.placed[ref]; }),
  };
}

// ---- basics (0.4.1): folding, the panel, full screen, keep screen on, shopping list, start over ----
const FOLDABLE = ['myboard', 'steps', 'wiring', 'checks', 'checklist'];

/** Each foldable section's heading folds it; the sections are redrawn often, so this runs after every redraw. */
function decorateFolds() {
  const folding = $('#panel').dataset.tab === 'all'; // in a tab, a section is never folded away
  for (const id of FOLDABLE) {
    const section = document.getElementById(id);
    const folded = folding && state.folded.has(id);
    section.toggleAttribute('data-folded', folded);
    const heading = section.querySelector(':scope > h2, :scope > .steps-head > h2');
    if (!heading) continue;
    if (!folding) {
      for (const a of ['role', 'tabindex', 'aria-expanded', 'title']) heading.removeAttribute(a);
      continue;
    }
    if (heading.getAttribute('role') !== 'button') {
      heading.setAttribute('role', 'button');
      heading.tabIndex = 0;
    }
    heading.setAttribute('aria-expanded', String(!folded));
    heading.title = folded ? 'Show this section' : 'Fold this section away';
  }
}

function toggleFold(id) {
  if (state.folded.has(id)) state.folded.delete(id);
  else state.folded.add(id);
  store.set('folded', [...state.folded]);
  decorateFolds();
}

function foldTarget(e) {
  const heading = e.target instanceof Element ? e.target.closest('h2[role="button"]') : null;
  const section = heading ? heading.closest('#panel > section') : null;
  return section && FOLDABLE.includes(section.id) ? section.id : null;
}

// ---- the panel in tabs (0.8 design §3): Guide · Board · Wiring · Checks · Parts, and All ----
function panelCounts() {
  const steps = stepsOf();
  const legs = currentGroups().flatMap((g) => g.members);
  const checks = groupsFor(projectBoard()).checks;
  return {
    guide: { done: steps.filter((s) => stepDone(s)).length, total: steps.length },
    wiring: { done: legs.filter((m) => state.wired.has(m.key)).length, total: legs.length },
    checks: { done: checks.filter((c) => state.checks.has(c.id)).length, total: checks.length },
    parts: { done: state.parts.filter((p) => state.ticked.has(p.ref)).length, total: state.parts.length },
  };
}

/** Tabs with nothing in them now (Board without a photo open, Guide without build steps). */
function emptyTabs() {
  const empty = (id) => {
    const s = document.getElementById(id);
    return !s || s.hidden || !s.firstElementChild;
  };
  return PANEL_TABS.filter((t) => t.sections.length && t.sections.every(empty)).map((t) => t.id);
}

let tabsQueued = false;
/** The sections redraw often: the tab row follows once, after they're done. */
function queueTabs() {
  if (tabsQueued) return;
  tabsQueued = true;
  queueMicrotask(renderPanelTabs);
}

function renderPanelTabs() {
  tabsQueued = false;
  const { tabs, open } = panelTabs(state.panelTab, panelCounts(), emptyTabs());
  const panel = $('#panel');
  const changed = panel.dataset.tab !== open;
  panel.dataset.tab = open;
  const nav = $('#panel-tabs');
  const same = nav.children.length === tabs.length && tabs.every((t, i) => nav.children[i].dataset.tab === t.id);
  if (!same) {
    nav.replaceChildren(...tabs.map((t) => el('button', {
      type: 'button', role: 'tab', id: `ptab-${t.id}`, 'data-tab': t.id,
      'aria-controls': t.id === 'all' ? 'panel' : PANEL_TABS.find((x) => x.id === t.id).sections.join(' '),
    })));
  }
  tabs.forEach((t, i) => {
    const b = nav.children[i];
    b.setAttribute('aria-selected', String(t.id === open));
    b.tabIndex = t.id === open ? 0 : -1;
    b.setAttribute('aria-label', t.aria);
    b.title = t.title;
    b.classList.toggle('tab-done', t.done);
    const label = b.firstChild && b.firstChild.nodeType === 3 ? b.firstChild.textContent : null;
    const count = b.querySelector('.tab-count');
    if (label !== t.label || (count ? count.textContent : '') !== t.count) {
      b.replaceChildren(t.label, ...(t.count ? [el('span', { className: 'tab-count', 'aria-hidden': 'true' }, t.count)] : []));
    }
  });
  if (changed) decorateFolds();
}

/** You picked a tab. */
function chooseTab(id, focus = false) {
  state.panelTab = cleanTab(id);
  store.set('panelTab', state.panelTab);
  renderPanelTabs();
  const panel = $('#panel');
  if (panel.scrollTop > 0) panel.scrollTop = 0;
  if (focus) $(`#ptab-${panel.dataset.tab}`)?.focus();
}

/** Something you did belongs in a tab (a line found, a step picked): show it, unless you chose All. */
function showTab(id) {
  if (state.panelTab === 'all' || $('#panel').dataset.tab === id) return;
  state.panelTab = id;
  store.set('panelTab', id);
  renderPanelTabs();
}

function wirePanelTabs() {
  const nav = $('#panel-tabs');
  nav.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[role="tab"]') : null;
    if (b) chooseTab(b.dataset.tab);
  });
  nav.addEventListener('keydown', (e) => {
    const all = [...nav.querySelectorAll('[role="tab"]')];
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // the arrows move between tabs here, not the sheet
    chooseTab(all[(to + all.length) % all.length].dataset.tab, true);
  });
}

function setPanelHidden(hidden) {
  $('#workspace').toggleAttribute('data-panel-hidden', hidden);
  $('#panel-toggle').setAttribute('aria-pressed', String(hidden));
  $('#panel-toggle').textContent = hidden ? 'Show panel' : 'Hide panel';
  store.set('panelHidden', hidden);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => setStatus("This browser won't go full screen here."));
}

let wakeLock = null;
let wakeWanted = false;
async function setWake(on) {
  wakeWanted = on;
  store.set('keepScreenOn', on);
  if (on && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      wakeWanted = false;
      setStatus("This browser can't keep the screen on here.");
    }
  } else if (!on && wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    await lock.release();
  }
  $('#wake').setAttribute('aria-pressed', String(wakeWanted));
}

function openShopping() {
  const rows = shoppingList(state.parts);
  const body = $('#shopping tbody');
  body.replaceChildren(...rows.map((r) => el('tr', {},
    el('td', {}, String(r.count)),
    el('td', {}, `${r.value} ${r.type}${r.package ? `, ${r.package}` : ''}`),
    el('td', {}, r.refs.join(', ')))));
  $('#shopping').showModal();
}

async function copyShopping() {
  try {
    await navigator.clipboard.writeText(shoppingText(shoppingList(state.parts)));
    setStatus('Shopping list copied.');
  } catch {
    setStatus("Couldn't copy: allow the clipboard for this page.");
  }
}

function saveShoppingCsv() {
  const url = URL.createObjectURL(new Blob([shoppingCsv(shoppingList(state.parts))], { type: 'text/csv' }));
  const link = el('a', { href: url, download: `${projectName().replace(/[\\/:*?"<>|]/g, '_')}-shopping-list.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- history: the build log, named versions, the build report (0.5 B10, improvement 47) ----
function renderLog() {
  const filter = $('#log-filter').value.trim().toLowerCase();
  const entries = [...state.log].reverse().filter((e) => !filter || e.text.toLowerCase().includes(filter)).slice(0, 400);
  $('#log-list').replaceChildren(...entries.map((e) => el('li', {}, el('time', {}, clock(e.t)), ' ', e.text)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  $('#log-time').textContent = `Time spent today: ${duration(timeSpent(state.log, today.getTime()))} · in all: ${duration(timeSpent(state.log))}`;
}

function openLog() {
  renderLog();
  $('#log').showModal();
}

const versionsKey = () => `versions:${projectName()}`;
const snapshot = () => JSON.parse(exportProgress({
  project: projectName(), revision: state.project ? state.project.revision : null,
  ticked: [...state.ticked], sheetPrints: state.tickPrints, flipped: [...state.flipped], wired: [...state.wired],
  myBoard: state.myBoard, notes: state.notes, checks: [...state.checks], continuity: state.continuity,
  looks: state.looks, steps: state.stepEdits,
}));

function renderVersions() {
  const versions = cleanVersions(store.get(versionsKey(), []));
  $('#versions-list').replaceChildren(...versions.map((v) => {
    const restore = el('button', { type: 'button', className: 'version-restore' }, 'Restore');
    restore.addEventListener('click', () => restoreVersion(v));
    const armed = state.versionDeleteAt.name === v.name && Date.now() - state.versionDeleteAt.t < 5000;
    const del = el('button', { type: 'button', className: 'version-delete' }, armed ? 'Click again to delete' : 'Delete');
    del.addEventListener('click', () => {
      if (!(state.versionDeleteAt.name === v.name && Date.now() - state.versionDeleteAt.t < 5000)) {
        state.versionDeleteAt = { name: v.name, t: Date.now() };
        renderVersions();
        return;
      }
      state.versionDeleteAt = { name: null, t: 0 };
      store.set(versionsKey(), cleanVersions(store.get(versionsKey(), [])).filter((x) => x.name !== v.name));
      renderVersions();
    });
    return el('li', {}, el('strong', {}, v.name), el('span', { className: 'version-when' }, ` ${day(v.at)} ${clock(v.at)}`), restore, del);
  }));
}

function openVersions() {
  renderVersions();
  $('#versions').showModal();
}

function saveVersion() {
  const name = $('#version-name').value.trim() || `Version ${cleanVersions(store.get(versionsKey(), [])).length + 1}`;
  store.set(versionsKey(), addVersion(cleanVersions(store.get(versionsKey(), [])), name, snapshot()));
  $('#version-name').value = '';
  addLog(`Saved version "${name}"`);
  renderVersions();
}

function restoreVersion(v) {
  let data;
  try {
    data = importProgress(JSON.stringify({ ...v.data, format: 'bench-progress', version: 1 }));
  } catch {
    setStatus(`Version "${v.name}" couldn't be read.`);
    return;
  }
  const before = { ticked: [...state.ticked], flipped: [...state.flipped], prints: { ...state.tickPrints }, wired: [...state.wired], myBoard: state.myBoard, notes: state.notes, checks: [...state.checks], continuity: state.continuity, looks: state.looks, steps: state.stepEdits };
  const after = { ticked: data.ticked, flipped: data.flipped, prints: data.sheetPrints, wired: data.wired, myBoard: data.myBoard, notes: data.notes, checks: data.checks, continuity: data.continuity, looks: data.looks, steps: data.steps };
  history.do({ label: `Restore version "${v.name}"`, apply: () => setProgress(after), revert: () => setProgress(before) });
  setStatus(`Restored "${v.name}". Ctrl+Z goes back.`);
}

function saveReport() {
  const board = projectBoard();
  const groups = currentGroups();
  const steps = stepsOf();
  const checks = powerChecks(board);
  const tests = currentTests();
  const summary = continuitySummary(tests, state.continuity);
  const text = buildReport({
    project: projectName(), revision: state.project ? state.project.revision : null, now: Date.now(),
    soldered: state.parts.filter((p) => state.ticked.has(p.ref)).length, parts: state.parts.length,
    wired: groups.reduce((n, g) => n + g.members.filter((m) => state.wired.has(m.key)).length, 0), legs: groups.reduce((n, g) => n + g.members.length, 0),
    stepsDone: steps.filter(stepDone).length, steps: steps.length,
    checksDone: checks.filter((c) => state.checks.has(c.id)).length, checks: checks.length,
    continuityDone: summary.done, continuity: summary.total, faults: summary.faults.map(faultText),
    placed: Object.keys(state.myBoard.placed).length + (Object.keys(state.myBoard.photos).length ? 1 : 0), boardParts: board ? Object.keys(board.parts).length : 0,
    time: timeSpent(state.log), unsoldered: state.parts.filter((p) => !state.ticked.has(p.ref)).map((p) => p.ref), notes: state.notes,
  });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  download(url, `${fileSafe(projectName())}-build-report.md`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Start over: the first click asks, a second within 5 s clears the ticks. Undo brings them back. */
function startOver() {
  if (Date.now() - state.startOverAt >= 5000) {
    state.startOverAt = Date.now();
    renderChecklist();
    setTimeout(renderChecklist, 5100);
    return;
  }
  state.startOverAt = 0;
  const before = { ticked: [...state.ticked], wired: [...state.wired], checks: [...state.checks], continuity: state.continuity };
  history.do({ label: 'Start over', apply: () => setProgress({ ticked: [], wired: [], checks: [], continuity: {} }), revert: () => setProgress(before) });
  setStatus('Started over. Ctrl+Z brings everything back.');
}

// ---- moving around and the app (0.5 improvements 1-8, 44-52) ----
function stepSheet(delta) {
  const i = state.sheets.findIndex((s) => s.id === state.current);
  const next = state.sheets[(i + delta + state.sheets.length) % state.sheets.length];
  if (next) selectSheet(next.id);
}

/** Everything the palette can find, each with what it does. */
function paletteItems() {
  const items = [];
  for (const p of state.parts) items.push({ label: `${p.ref}${p.value ? ` ${p.value}` : ''}`, hint: 'part', run: () => selectPart(p.ref) });
  for (const g of currentGroups()) items.push({ label: `Line ${g.label}`, hint: 'line', run: () => openLine(g.net) });
  for (const s of state.sheets) items.push({ label: s.label, hint: 'sheet', run: () => selectSheet(s.id) });
  stepsOf().forEach((s, i) => items.push({ label: `Step ${i + 1}: ${s.title}`, hint: 'step', run: () => { showTab('guide'); openStep(i); } }));
  const act = (label, run) => items.push({ label, hint: 'action', run });
  if (state.project && state.project.board) act('3D board', () => setBoard3D(!board3dOn));
  act('Shopping list', openShopping);
  act('Build log', openLog);
  act('Versions', openVersions);
  act('Build report', saveReport);
  act('Calculators', openCalc);
  act('Keyboard shortcuts', () => $('#help').showModal());
  act('Easy reading', () => $('#settings-button').click());
  act('Save progress as file', saveProgressFile);
  act('Full screen', toggleFullscreen);
  act('Hide or show the side panel', () => setPanelHidden(!$('#workspace').hasAttribute('data-panel-hidden')));
  act('Side by side', () => $('#split').click());
  act('Flip to solder side', () => toggleFlip());
  act('Fit the sheet', () => viewer.fit());
  return items;
}

let paletteAll = [];
let paletteShown = [];
let paletteAt = 0;
function renderPalette() {
  paletteShown = paletteMatch(paletteAll, $('#palette-input').value);
  paletteAt = Math.min(paletteAt, Math.max(0, paletteShown.length - 1));
  $('#palette-list').replaceChildren(...paletteShown.map((item, i) => {
    const li = el('li', { role: 'option', 'aria-selected': String(i === paletteAt) }, el('span', {}, item.label), el('span', { className: 'hint' }, item.hint));
    li.addEventListener('click', () => runPalette(i));
    return li;
  }));
}
function openPalette() {
  paletteAll = paletteItems();
  paletteAt = 0;
  $('#palette-input').value = '';
  renderPalette();
  if (!$('#palette').open) $('#palette').showModal();
  $('#palette-input').focus();
}
function runPalette(i) {
  const item = paletteShown[i];
  $('#palette').close();
  if (item) item.run();
}

function openCalc() {
  $('#calc').showModal();
  updateCalc();
}
function updateCalc() {
  const num = (id) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : undefined;
  };
  const led = ledResistor(num('#calc-led-supply'), num('#calc-led-vf'), num('#calc-led-ma'));
  $('#calc-led-out').textContent = led ? `${Math.round(led.r)} Ω: use ${ohmsText(led.e12)} Ω, about ${led.mA.toFixed(1)} mA (${(led.w * 1000).toFixed(0)} mW in the resistor)` : 'Supply must be above the LED voltage.';
  const ma = num('#calc-ohm-ma');
  const o = ohmsLaw({ v: num('#calc-ohm-v'), i: ma === undefined ? undefined : ma / 1000, r: num('#calc-ohm-r') });
  $('#calc-ohm-out').textContent = o ? `${+o.v.toFixed(3)} V · ${+(o.i * 1000).toFixed(3)} mA · ${ohmsText(o.r)} Ω · ${+(o.w * 1000).toFixed(1)} mW` : 'Fill in any two.';
  const d = divider(num('#calc-div-vin'), num('#calc-div-r1'), num('#calc-div-r2'));
  $('#calc-div-out').textContent = d ? `Out: ${d.vout.toFixed(2)} V, ${d.mA.toFixed(3)} mA through the pair` : 'Fill in all three.';
}

function renderRecentFinds() {
  const recent = store.get('recentFinds', []);
  $('#find-recent').replaceChildren(...(Array.isArray(recent) ? recent : []).filter((q) => typeof q === 'string').map((q) => el('option', { value: q })));
}
function rememberFind(query) {
  const q = query.trim().slice(0, 60);
  if (!q) return;
  const recent = (store.get('recentFinds', []) || []).filter((x) => typeof x === 'string' && x !== q);
  store.set('recentFinds', [q, ...recent].slice(0, 8));
  renderRecentFinds();
}

/** Hovering a part's label on a drawing names it (0.5 improvement 7). */
let labelTipFrame = 0;
function onStageHover(e) {
  // the event's path is only there while it's being handled: read it now, draw on the next frame
  const target = e.composedPath()[0];
  const { clientX, clientY } = e;
  const point = viewer.photoPointAt(e);
  if (labelTipFrame) cancelAnimationFrame(labelTipFrame);
  labelTipFrame = requestAnimationFrame(() => {
    labelTipFrame = 0;
    const tip = $('#label-tip');
    const holeText = point ? holeTipText(point) : '';
    if (holeText) {
      const r = $('#stage').getBoundingClientRect();
      tip.textContent = holeText;
      tip.style.left = `${clientX - r.left + 14}px`;
      tip.style.top = `${clientY - r.top + 12}px`;
      tip.hidden = false;
      return;
    }
    const text = target instanceof Element ? target.closest('text') : null;
    const ref = text ? refOfLabel(labelText(text), isKnownRef) : null;
    const part = ref ? cardPart(ref) : null;
    if (!part) {
      tip.hidden = true;
      return;
    }
    const r = $('#stage').getBoundingClientRect();
    tip.textContent = [part.ref, part.value].filter(Boolean).join(' · ') + (part.role ? ` · ${part.role.split(/[.:]/)[0]}` : '');
    tip.style.left = `${clientX - r.left + 14}px`;
    tip.style.top = `${clientY - r.top + 12}px`;
    tip.hidden = false;
  });
}

function wirePanelResize() {
  const handle = $('#panel-resize');
  const set = (w) => {
    const width = Math.round(Math.min(760, Math.max(260, w)));
    $('#panel').style.width = `${width}px`;
    return width;
  };
  const savedWidth = store.get('panelWidth', null);
  if (Number.isFinite(savedWidth)) set(savedWidth);
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.classList.add('active');
    try { handle.setPointerCapture(e.pointerId); } catch { /* not tracked */ }
    const right = $('#workspace').getBoundingClientRect().right;
    const move = (ev) => set(right - ev.clientX);
    const up = (ev) => {
      store.set('panelWidth', set(right - ev.clientX));
      handle.classList.remove('active');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function showWhatsNew() {
  const seen = store.get('seenVersion', null);
  if (seen === null) {
    store.set('seenVersion', APP_VERSION); // a first visit: nothing to call new
    return;
  }
  if (seen !== APP_VERSION) $('#whats-new').hidden = false;
}

// ---- what to wire (0.4 design F1) ----
function setWired(key, on) {
  const before = [...state.wired];
  if (on === state.wired.has(key)) return;
  const after = on ? [...before, key] : before.filter((k) => k !== key);
  const [ref, pin] = key.split(/:(.*)/s);
  history.do({ label: `${on ? 'Wired' : 'Unwired'} ${ref} ${pin}`, apply: () => setProgress({ wired: after }), revert: () => setProgress({ wired: before }) });
}

// the board is the same object until something changes it, so its lines are worked out once
let groupsMemo = { board: undefined, groups: [], checks: [] };
function groupsFor(board) {
  if (groupsMemo.board !== board) groupsMemo = { board, groups: wiringGroups(board), checks: powerChecks(board) };
  return groupsMemo;
}
const currentGroups = () => groupsFor(projectBoard()).groups;

function updateNetRings() {
  const group = state.shownNet ? currentGroups().find((g) => g.net === state.shownNet) : null;
  const refs = group ? [...new Set(group.members.map((m) => m.ref))] : [];
  viewer.netRings(refs.map((ref) => (firstLabelFor(state.current, ref) || {}).el).filter(Boolean));
  if (board3d && board3dOn) board3d.setNet(refs);
}

function showNet(net) {
  state.shownNet = state.shownNet === net ? null : net;
  updateNetRings();
  renderWiringPanel();
}

async function copyWiring() {
  try {
    await navigator.clipboard.writeText(wiringText(currentGroups(), state.wired));
    setStatus('Wiring list copied.');
  } catch {
    setStatus("Couldn't copy: allow the clipboard for this page.");
  }
}

function renderWiringPanel() {
  renderWiring($('#wiring'), currentGroups(), {
    wired: state.wired,
    openOnly: state.wiringOpenOnly,
    expanded: state.wiringExpanded,
    shown: state.shownNet,
    onWire: setWired,
    onShow: showNet,
    onCopy: copyWiring,
    onOpenOnly: (on) => { state.wiringOpenOnly = on; renderWiringPanel(); },
    onExpand: (net, open) => { if (open) state.wiringExpanded.add(net); else state.wiringExpanded.delete(net); },
    filter: state.wiringFilter,
    onFilter: (text) => { state.wiringFilter = text; renderWiringPanel(); },
    onWireAll: (g) => wireMany(g.members.map((m) => m.key), `Wired all of ${g.label}`),
    onNextLine: () => {
      const g = currentGroups().find((x) => x.members.some((m) => !state.wired.has(m.key)));
      if (!g) {
        setStatus('Every line is wired.');
        return;
      }
      state.wiringExpanded = new Set([g.net]);
      renderWiringPanel();
      [...document.querySelectorAll('#wiring details')].find((d) => d.dataset.net === g.net)?.scrollIntoView({ block: 'nearest' });
    },
    onExpandAll: (open) => {
      state.wiringExpanded = new Set(open ? currentGroups().map((g) => g.net) : []);
      renderWiringPanel();
    },
  });
}

// ---- build steps (board-view design §5), one at a time ----
let stepsCache = { build: null, edits: null, all: [], shown: [] };
/** Every build step in your order, skipped ones too, and your own (0.8 §3). */
function allSteps() {
  const build = state.project ? state.project.build : [];
  if (stepsCache.build !== build || stepsCache.edits !== state.stepEdits) {
    const all = stepsWithEdits(build, state.stepEdits);
    stepsCache = { build, edits: state.stepEdits, all, shown: all.filter((s) => !s.skipped) };
  }
  return stepsCache.all;
}
/** The build steps you follow: in your order, without the ones you skipped. */
function stepsOf() {
  allSteps();
  return stepsCache.shown;
}

/** Changes your steps as one undo step. */
function setSteps(edits, label) {
  if (!edits || edits === state.stepEdits) return;
  const before = state.stepEdits;
  history.do({ label, apply: () => setProgress({ steps: edits }), revert: () => setProgress({ steps: before }) });
}

function stepsAdjustOptions() {
  const build = state.project ? state.project.build : [];
  const open = state.openStep !== null ? stepsOf()[state.openStep] : null;
  return {
    on: state.stepsAdjusting,
    all: allSteps(),
    changed: hasEdits(state.stepEdits),
    after: open ? open.title : null,
    onToggle: () => { state.stepsAdjusting = !state.stepsAdjusting; renderStepsPanel(); },
    onMove: (id, delta) => setSteps(moveStep(build, state.stepEdits, id, delta), `Move a step ${delta < 0 ? 'up' : 'down'}`),
    onSkip: (id, on) => setSteps(setSkipped(state.stepEdits, id, on), on ? 'Skip a step' : 'Bring a step back'),
    onAdd: (title, text) => {
      const added = addOwnStep(build, state.stepEdits, { title, text }, open ? open.id : null);
      if (added) setSteps(added.edits, `Add the step ${added.edits.added.at(-1).title}`);
      return Boolean(added);
    },
    onRemove: (id) => setSteps(removeOwnStep(state.stepEdits, id), 'Take out your step'),
    onReset: () => setSteps(NO_EDITS, "Back to the project's steps"),
  };
}
const stepKey = () => `${state.progressKey}:step`;

function stepWhatText(step) {
  const board = projectBoard();
  if (!board) return '';
  const lines = [];
  if (step.what.includes('buses') && board.buses.length) {
    lines.push(`Buses: ${board.buses.map((b) => `row ${b.row} (${b.label})`).join(', ')}.`);
  }
  if (step.what.includes('links') && board.links.length) lines.push(`${board.links.length} insulated links: see the wire list on sheet 4.`);
  if (step.what.includes('bridges') && board.bridges.length) {
    lines.push(`Bridges at ${board.bridges.map((b) => `${b.holes[0].join(',')}–${b.holes[1].join(',')}`).join(' and ')}.`);
  }
  return lines.join(' ');
}

function updateStepRings() {
  const step = state.openStep !== null ? stepsOf()[state.openStep] || null : null;
  const els = step ? step.parts.map((ref) => (firstLabelFor(state.current, ref) || {}).el).filter(Boolean) : [];
  viewer.stepRings(els);
  syncStep3D();
  drawMyBoardMarks();
  renderMyBoardPanel(); // its "not placed yet" follows the open step
}

/** A step is done when all its parts are soldered, or, with nothing to tick, when you marked it done. */
function stepDone(step) {
  const found = step.parts.filter((r) => !step.missing.includes(r));
  return found.length ? found.every((r) => state.ticked.has(r)) : state.checks.has(`step:${step.id}`);
}

function setCheck(id, on, label) {
  if (on === state.checks.has(id)) return;
  const before = [...state.checks];
  const after = on ? [...before, id] : before.filter((c) => c !== id);
  history.do({ label, apply: () => setProgress({ checks: after }), revert: () => setProgress({ checks: before }) });
}

// ---- the guided continuity test (0.5 big improvement B6) ----
function currentTests() {
  const tests = continuityTests(projectBoard());
  const map = holeMap();
  if (!map || !tests.length) return tests;
  // with hole names on, each leg that's on your board says where (0.6)
  const holes = new Map(placedLegs(boardOf(), state.myBoard.placed, anchorRef()).map((l) => [l.key, l.hole]));
  const named = (leg) => {
    const hole = holes.get(`${leg.ref}:${leg.pin}`);
    const name = hole ? holeName(map, hole) : null;
    return name ? { ...leg, text: `${leg.text} (${name})` } : leg;
  };
  return tests.map((t) => ({ ...t, a: named(t.a), b: named(t.b) }));
}

function setContinuity(next, label) {
  const before = state.continuity;
  history.do({ label, apply: () => setProgress({ continuity: next }), revert: () => setProgress({ continuity: before }) });
}

function renderContinuityPanel() {
  const tests = currentTests();
  const summary = continuitySummary(tests.filter((t) => state.continuity[t.id] || !state.contSkipped.has(t.id)), state.continuity);
  const full = continuitySummary(tests, state.continuity);
  renderContinuity($('#continuity'), {
    summary: { ...full, next: summary.next },
    faultText,
    onAnswer: (test, beeped) => {
      const pass = test.kind === 'beep' ? beeped : !beeped;
      setContinuity({ ...state.continuity, [test.id]: pass ? 'pass' : 'fail' }, `${test.a.text} to ${test.b.text}: ${beeped ? 'beeped' : 'no beep'}`);
    },
    onSkip: () => {
      if (summary.next) state.contSkipped.add(summary.next.id);
      renderContinuityPanel();
    },
    onShow: (ref) => selectPart(ref),
    onRetry: (id) => {
      const next = { ...state.continuity };
      delete next[id];
      setContinuity(next, 'Test again');
    },
    onReset: () => {
      state.contSkipped.clear();
      setContinuity({}, 'Start the continuity test again');
    },
  });
}

// ---- step extras (0.5 improvements 27-30) ----
function autoStepWasDone() {
  const step = state.openStep !== null ? stepsOf()[state.openStep] : null;
  return step ? stepDone(step) : true;
}

/** "Next step by itself": when the open step has just become done, open the next one. */
function autoNextStep(wasDone) {
  if (wasDone || !store.get('stepsAuto', false)) return;
  const steps = stepsOf();
  const step = state.openStep !== null ? steps[state.openStep] : null;
  if (step && stepDone(step) && state.openStep < steps.length - 1) {
    openStep(state.openStep + 1);
    setStatus(`Step ${state.openStep} done: on to step ${state.openStep + 1}.`);
  }
}

function stepExtras(step) {
  const board = projectBoard();
  const joints = board ? step.parts.reduce((n, ref) => n + (board.parts[ref] ? Object.keys(board.parts[ref].pins).length : 0), 0) : 0;
  return {
    joints,
    note: state.notes[`step.${step.id}`] || '',
    onNote: (text) => setNote(`step.${step.id}`, text),
    onPrint: () => {
      document.body.classList.add('print-step');
      window.print();
      setTimeout(() => document.body.classList.remove('print-step'), 500);
    },
    auto: store.get('stepsAuto', false) === true,
    onAuto: (on) => { store.set('stepsAuto', on); },
  };
}

function renderChecksPanel() {
  renderChecks($('#checks'), {
    checks: powerChecks(projectBoard()),
    done: state.checks,
    onCheck: (id, on) => setCheck(id, on, `${on ? 'Tick' : 'Untick'} check before power`),
  });
}

function renderStepsPanel() {
  renderSteps($('#steps'), stepsOf(), {
    current: state.openStep,
    isDone: stepDone,
    extras: state.openStep !== null && stepsOf()[state.openStep] ? stepExtras(stepsOf()[state.openStep]) : null,
    onMarkDone: (i, on) => setCheck(`step:${stepsOf()[i].id}`, on, `Step ${i + 1} ${on ? 'done' : 'not done'}`),
    on3D: state.project && state.project.board ? () => setBoard3D(true) : null,
    doneIn: (step) => step.parts.filter((r) => state.ticked.has(r)).length,
    whatText: stepWhatText,
    onOpen: openStep,
    onPart: (ref) => selectPart(ref),
    onTickAll: tickStep,
    onTick: toggleTick,
    onDoneNext: doneNextStep,
    partInfo: guidePart,
    adjust: stepsAdjustOptions(),
  });
}

/** A part in the guide: its value, whether it's soldered, and where it goes (your hole names when they're on). */
function guidePart(ref) {
  const part = state.partsByRef.get(ref);
  return { value: part && part.value ? part.value : '', where: guideWhere(ref), ticked: state.ticked.has(ref) };
}

function guideWhere(ref) {
  const board = projectBoard();
  const drawn = board && board.parts[ref];
  const map = holeMap();
  const mine = map && boardOf() && boardOf().parts[ref] ? (ref === anchorRef() ? boardOf().parts[ref].pins : state.myBoard.placed[ref]) : null;
  const holes = mine || (drawn ? drawn.pins : null);
  if (!holes) return '';
  const name = (h) => (mine ? holeName(map, h) || 'off the labels' : `${h[0]},${h[1]}`);
  const pins = Object.entries(holes).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  const text = pins.length > 3 ? `${pins.length} pins, ${pinText(pins[0][0])} at ${name(pins[0][1])}` : pins.map(([pin, h]) => `${pinText(pin)} at ${name(h)}`).join(' · ');
  return `${mine ? 'Your board: ' : ''}${text}${drawn && drawn.side === 'bottom' ? ' · underneath' : ''}`;
}

/** Done, next step: the step's parts ticked (or the step marked done) as one undo step, then the next one opens. */
function doneNextStep(i) {
  const steps = stepsOf();
  const step = steps[i];
  if (!step) return;
  const found = step.parts.filter((r) => !step.missing.includes(r) && isKnownRef(r));
  if (found.length) {
    const before = [...state.ticked];
    const after = [...new Set([...before, ...found])];
    if (after.length !== before.length) history.do({ label: `Step ${i + 1} done`, apply: () => setProgress({ ticked: after }), revert: () => setProgress({ ticked: before }) });
  } else {
    setCheck(`step:${step.id}`, true, `Step ${i + 1} done`);
  }
  if (state.openStep === i && i < steps.length - 1) openStep(i + 1); // (Next step by itself may have moved on already)
  const left = stepsOf().filter((s) => !stepDone(s)).length;
  setStatus(left ? `Step ${i + 1} done. ${left} to go.` : 'Every step is done. Time for the checks before power.');
}

/** Opening a step is a view, not a change: it's remembered, but not in the undo history. */
function openStep(i) {
  const steps = stepsOf();
  if (i < 0 || i >= steps.length) return;
  state.openStep = i;
  store.set(stepKey(), steps[i].id);
  renderStepsPanel();
  updateStepRings();
}

function tickStep(i) {
  const step = stepsOf()[i];
  const before = [...state.ticked];
  const after = [...new Set([...before, ...step.parts.filter((r) => isKnownRef(r))])];
  if (after.length === before.length) return; // all done already: nothing to undo
  history.do({ label: `Tick step ${i + 1}`, apply: () => setProgress({ ticked: after }), revert: () => setProgress({ ticked: before }) });
}

/** The saved open step: by its id (or, from release 0.3's first files, its number), if it's still there. */
function loadOpenStep() {
  const saved = store.get(stepKey(), null);
  const steps = stepsOf();
  const byId = typeof saved === 'string' ? steps.findIndex((s) => s.id === saved) : -1;
  state.openStep = byId >= 0 ? byId : Number.isInteger(saved) && saved >= 0 && saved < steps.length ? saved : null;
}

/** The project file changed: the open step follows its id, or closes if it's gone. */
function refreshOpenStep() {
  loadOpenStep();
  renderStepsPanel();
  updateStepRings();
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
  state.progressKey = projectKey(state.project, state.root);
  state.ticked = new Set(data ? data.ticked : []);
  state.flipped = new Set((data ? data.flipped : []).filter(isLayout));
  state.tickPrints = data ? { ...data.sheetPrints } : currentPrints();
  state.wired = new Set(data ? data.wired : []);
  state.myBoard = data ? data.myBoard : { anchor: null, photos: {}, placed: {} };
  state.notes = data ? data.notes : {};
  state.checks = new Set(data ? data.checks : []);
  state.continuity = data ? data.continuity : {};
  state.log = data ? data.log : [];
  state.looks = data ? data.looks : Object.create(null);
  state.stepEdits = data ? data.steps : NO_EDITS;
  refreshNotes();
}

function refreshNotes() {
  state.checklistNotes = changedSince(state.tickPrints, state.sheets.filter((s) => !s.missing), state.ticked.size);
}

/**
 * Saves the progress on screen under its own key. Nothing is saved while forge-project.json can't be
 * read: the key would be the folder's, and the project's real progress must never be overwritten.
 */
function saveProgress() {
  if (state.projectProblem) return;
  const saved = store.set(state.progressKey || projectKey(state.project, state.root),
    { ticked: [...state.ticked], sheetPrints: state.tickPrints, flipped: [...state.flipped], wired: [...state.wired], myBoard: state.myBoard, notes: state.notes, checks: [...state.checks], continuity: state.continuity, log: state.log, looks: state.looks, steps: state.stepEdits });
  if (saved) flashSaved();
}

/** The project or revision changed: show (and from now on save) that project's own progress. */
function checkProgressKey() {
  if (projectKey(state.project, state.root) === state.progressKey) return;
  loadProgress();
  loadOpenStep();
  renderStepsPanel();
  history.clear(); // undo steps belong to the progress they were made on
  syncFlip();
  applyTickMarks();
  renderChecklist();
  renderWiringPanel();
  renderChecksPanel();
  renderContinuityPanel();
  renderPartCard();
  updateMyBoard();
}

/** "Mark them checked": the changed sheets have been looked at, so their notes go. */
function acknowledgeNotes() {
  const before = { ...state.tickPrints };
  const after = currentPrints();
  const set = (prints) => {
    state.tickPrints = { ...prints };
    refreshNotes();
    saveProgress();
    renderChecklist();
  };
  history.do({ label: 'Mark changed sheets checked', apply: () => set(after), revert: () => set(before) });
}

/** Ticked parts' labels turn green on every sheet that has been read. */
function applyTickMarks() {
  const done = (text) => labelDone(text, isKnownRef, (r) => state.ticked.has(r));
  for (const entry of state.loaded.values()) {
    if (entry.kind !== 'svg') continue;
    for (const label of entry.labels) {
      label.el.toggleAttribute('data-bench-done', done(label.text));
    }
  }
  const second = split.on ? viewer2.sheetRoot() : null;
  if (second) {
    for (const t of second.querySelectorAll('text')) {
      t.toggleAttribute('data-bench-done', done(labelText(t)));
    }
  }
}

function setProgress({ ticked, flipped, prints, wired, myBoard, notes, checks, continuity, looks, steps }) {
  const stepWasDone = autoStepWasDone();
  if (steps) {
    const openId = state.openStep !== null && stepsOf()[state.openStep] ? stepsOf()[state.openStep].id : null;
    state.stepEdits = steps;
    const at = openId ? stepsOf().findIndex((s) => s.id === openId) : -1;
    state.openStep = at >= 0 ? at : null; // the open step follows its id, or closes when skipped
  }
  if (ticked) {
    const wasEmpty = state.ticked.size === 0;
    state.ticked = new Set(ticked);
    if (prints) {
      state.tickPrints = { ...prints };
    } else if (wasEmpty && state.ticked.size) {
      state.tickPrints = currentPrints(); // the first tick starts from the drawings as they are now
    } else {
      for (const [id, print] of Object.entries(currentPrints())) if (!(id in state.tickPrints)) state.tickPrints[id] = print;
    }
  }
  if (wired) state.wired = new Set(wired);
  if (myBoard) {
    state.myBoard = myBoard;
    state.suggest = null; // worked out for the board as it was
  }
  if (notes) state.notes = notes;
  if (checks) state.checks = new Set(checks);
  if (continuity) state.continuity = continuity;
  if (looks) {
    state.looks = looks;
    state.suggest = null;
  }
  if (flipped) {
    state.flipped = new Set(flipped.filter(isLayout));
    syncFlip();
  }
  refreshNotes();
  applyTickMarks();
  saveProgress();
  renderChecklist();
  renderStepsPanel();
  renderWiringPanel();
  renderChecksPanel();
  renderContinuityPanel();
  renderPartCard();
  updateMyBoard();
  updateTabCounts();
  if (looks) resetBoard3D();
  if (steps) updateStepRings();
  autoNextStep(stepWasDone);
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
  const notes = el('div', { id: 'checklist-notes' }, ...state.checklistNotes.map((n) => el('p', {}, n)),
    ...(state.checklistNotes.length ? [el('button', { id: 'notes-checked', type: 'button' }, 'Mark them checked')] : []));
  const stepOf = new Map();
  stepsOf().forEach((s, i) => s.parts.forEach((ref) => { if (!stepOf.has(ref)) stepOf.set(ref, i); }));
  const q = state.checklistQuery.trim().toLowerCase();
  let shown = state.parts.filter((p) => (!state.checklistOpenOnly || !state.ticked.has(p.ref)) &&
    (!q || `${p.ref} ${p.value || ''} ${p.type || ''}`.toLowerCase().includes(q)));
  if (state.checklistSort === 'name') shown = [...shown].sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  if (state.checklistSort === 'step') shown = [...shown].sort((a, b) => (stepOf.get(a.ref) ?? 999) - (stepOf.get(b.ref) ?? 999));
  const row = (part) => {
    const box = el('input', { type: 'checkbox', 'data-ref': part.ref, 'aria-label': `${part.ref} soldered` });
    box.checked = state.ticked.has(part.ref);
    const name = el('button', { type: 'button', className: 'checklist-name', 'data-open': part.ref }, `${part.ref}${part.value ? ` ${part.value}` : ''}`);
    const li = el('li', { 'data-ref': part.ref }, box, name);
    if (stepOf.has(part.ref)) li.append(el('span', { className: 'step-no', title: `Build step ${stepOf.get(part.ref) + 1}` }, `S${stepOf.get(part.ref) + 1}`));
    if (part.polarized) li.append(el('span', { className: 'badge-polarity' }, 'Way round matters'));
    return li;
  };
  const items = el('div', { className: 'checklist-list' });
  if (state.checklistGroup) {
    for (const g of groupByType(shown)) {
      const all = state.parts.filter((p) => groupByType([p])[0].label === g.label);
      items.append(el('h3', {}, `${g.label} (${all.filter((p) => state.ticked.has(p.ref)).length}/${all.length})`),
        el('ul', { className: 'checklist-items' }, ...g.parts.map(row)));
    }
  } else {
    items.append(el('ul', { className: 'checklist-items' }, ...shown.map(row)));
  }
  const search = el('input', { type: 'search', id: 'checklist-search', placeholder: 'Search parts', 'aria-label': 'Search the checklist' });
  search.value = state.checklistQuery;
  const group = el('input', { type: 'checkbox', id: 'checklist-group' });
  group.checked = state.checklistGroup;
  const sort = el('select', { id: 'checklist-sort', 'aria-label': 'Order' });
  for (const [value, text] of [['list', 'Project order'], ['name', 'By name'], ['step', 'By build step']]) {
    const opt = el('option', { value }, text);
    opt.selected = value === state.checklistSort;
    sort.append(opt);
  }
  const tools = el('div', { id: 'checklist-tools' }, search, el('label', { className: 'check' }, group, ' By type'), sort);
  const openOnly = el('input', { type: 'checkbox', id: 'checklist-open-only' });
  openOnly.checked = state.checklistOpenOnly;
  const open = el('label', { className: 'button-like' }, 'Open progress file',
    el('input', { id: 'progress-open', type: 'file', accept: '.json,application/json', className: 'visually-hidden' }));
  $('#checklist').replaceChildren(
    el('h2', {}, 'Build checklist'),
    el('p', { className: 'progress-text' }, `${done} of ${total} soldered`),
    bar,
    notes,
    el('div', { className: 'checklist-actions' }, el('button', { id: 'progress-save', type: 'button' }, 'Save progress as file'), open,
      el('button', { id: 'shopping-open', type: 'button' }, 'Shopping list'),
      el('button', { id: 'log-open', type: 'button' }, 'Build log'),
      el('button', { id: 'versions-open', type: 'button' }, 'Versions'),
      el('button', { id: 'report-save', type: 'button', title: 'A summary of where the build stands, as a Markdown file' }, 'Build report'),
      el('button', { id: 'start-over', type: 'button', title: 'Clear the soldered, wired and done ticks (undo brings them back)' },
        Date.now() - state.startOverAt < 5000 ? 'Click again to start over' : 'Start over')),
    el('label', { className: 'check' }, openOnly, ' Only not soldered'),
    tools,
    items,
  );
}

function saveProgressFile() {
  const text = exportProgress({
    project: projectName(), revision: state.project ? state.project.revision : null,
    ticked: [...state.ticked], sheetPrints: state.tickPrints, flipped: [...state.flipped], wired: [...state.wired], myBoard: state.myBoard, notes: state.notes, checks: [...state.checks], continuity: state.continuity, log: state.log, looks: state.looks, steps: state.stepEdits,
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
  const before = { ticked: [...state.ticked], flipped: [...state.flipped], prints: { ...state.tickPrints }, wired: [...state.wired], myBoard: state.myBoard, notes: state.notes, checks: [...state.checks], continuity: state.continuity, looks: state.looks, steps: state.stepEdits };
  const after = { ticked: data.ticked, flipped: data.flipped, prints: data.sheetPrints, wired: data.wired, myBoard: data.myBoard, notes: data.notes, checks: data.checks, continuity: data.continuity, looks: data.looks, steps: data.steps };
  history.do({ label: 'Open progress file', apply: () => setProgress(after), revert: () => setProgress(before) });
}

/** forge-project.json changed: read it again. A broken version keeps the previous project. */
/** The live badge's "updated HH:MM": when the project file or a sheet last refreshed. */
function markUpdated() {
  const now = new Date();
  state.updatedAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  showLive();
}

async function reloadProject() {
  markUpdated();
  const next = await readProjectFile();
  if (next) state.project = next;
  showProjectName();
  setStatus('');
  await relist();
  updateParts();
  checkProgressKey();
  refreshOpenStep();
  resetBoard3D();
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
  checkProgressKey();
  refreshOpenStep();
  resetBoard3D();
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
  markUpdated();
  const tab = [...$('#tabs').children].find((t) => t.dataset.id === sheet.id);
  if (tab) {
    tab.classList.remove('flash');
    void tab.offsetWidth; // restart the flash
    tab.classList.add('flash');
    setTimeout(() => tab.classList.remove('flash'), 2600);
  }
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
  if (split.on && split.sheetId === current.id) showInSplit(current.id, true);
  refreshNotes();
  renderChecklist();
  if (state.current === current.id) {
    setStageMessage('');
    viewer.show(entry, { keepView: Boolean(before && before.kind !== 'error') });
    if (state.flipped.has(current.id) && isLayout(current.id)) viewer.setFlipped(true);
    updateFlip();
    updateStepRings();
  }
  find.refresh(true);
}

/** dev.py is back after a pause: catch up on every drawing that changed meanwhile. */
async function catchUp() {
  let project;
  try {
    project = await source.list();
  } catch {
    return;
  }
  const byPath = new Map(project.files.map((f) => [f.path, f]));
  for (const sheet of state.sheets) {
    const file = byPath.get(sheet.path);
    if (file && file.mtime !== sheet.mtime) onFileChange(sheet.path, file.mtime);
  }
  relist(project);
}

/** Drawings were added or removed: list the folder again and rebuild the tabs. */
async function relist(listing = null) {
  let project = listing;
  try {
    if (!project) project = await source.list();
  } catch {
    return;
  }
  const sheets = sheetsFor(project.files);
  const same = sheets.length === state.sheets.length && sheets.every((s, i) => s.id === state.sheets[i].id &&
    s.path === state.sheets[i].path && s.label === state.sheets[i].label && s.missing === state.sheets[i].missing &&
    s.kind === state.sheets[i].kind && s.side === state.sheets[i].side);
  if (same) return;
  for (const id of [...state.cache.keys()]) {
    const now = sheets.find((s) => s.id === id);
    const was = state.sheets.find((s) => s.id === id);
    if (!now || !was || now.path !== was.path || now.missing !== was.missing) {
      for (const store of [state.cache, state.loaded, state.views]) store.delete(id);
      state.flipped.delete(id);
      state.stale.delete(id);
    }
  }
  if (state.current && viewer.sheetRoot()) state.views.set(state.current, viewer.getView());
  state.sheets = sheets;
  state.flipped = new Set([...state.flipped].filter(isLayout));
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
    if (sheet && !sheet.missing) refreshSheet(sheet, mtime);
    else relist(); // a new drawing, or a listed sheet whose file has just appeared
  });
}

let livePaused = false;
let liveNow = 'live';
function showLive() {
  const badge = $('#live');
  if (!source.live) {
    // From GitHub or a picked folder: no auto-refresh, the badge refreshes when clicked (0.7)
    const when = state.updatedAt ? ` · read ${state.updatedAt}` : '';
    const button = el('button', { id: 'source-refresh', type: 'button', className: 'source-badge',
      title: source.kind === 'github' ? 'Read the repo again and reload what changed' : 'Open the folder again to see changes' },
    `${source.label}${source.spec ? `: ${source.spec.owner}/${source.spec.repo}` : ''}${when} ↻`);
    button.addEventListener('click', () => (source.kind === 'github' ? refreshSource() : $('#source-folder').click()));
    badge.replaceChildren(button);
    return;
  }
  badge.textContent = `${liveNow === 'live' ? 'Auto-refresh on' : 'Auto-refresh paused'}${state.updatedAt ? ` · updated ${state.updatedAt}` : ''}`;
}
function onLiveStatus(live) {
  const badge = $('#live');
  liveNow = live;
  showLive();
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
  updateTabCounts();
  if (split.on) fillSplitChoices();
}

/** Each tab says how many of the parts on its sheet are soldered (0.5 improvement 6). */
function updateTabCounts() {
  // which sheets each part is on, worked out once per update (not once per tab)
  const onSheets = new Map(state.parts.map((p) => [p.ref, new Set(sheetsWithPart(p.ref).map((s) => s.id))]));
  for (const tab of $('#tabs').children) {
    const on = state.parts.filter((p) => onSheets.get(p.ref).has(tab.dataset.id));
    if (on.length) tab.setAttribute('data-count', `${on.filter((p) => state.ticked.has(p.ref)).length}/${on.length}`);
    else tab.removeAttribute('data-count');
  }
}

function onKey(e) {
  if (document.querySelector('dialog[open]:is(#help, #shopping, #log, #versions, #palette, #calc)')) return; // these dialogs handle their own keys (Esc closes them)
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    openPalette();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProgressFile();
    return;
  }
  if (e.altKey && !e.ctrlKey && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    walkTrail(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
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
  const control = t instanceof Element && t.closest('button, a[href], summary, [role=tab], [role=button], [tabindex]:not(#stage)');
  if (e.key === ' ' && state.openStep !== null && !control) {
    e.preventDefault();
    showTab('guide');
    openStep(state.openStep + (e.shiftKey ? -1 : 1));
    return;
  }
  const { w, h } = viewer.stageSize();
  const actions = {
    0: () => viewer.fit(),
    '+': () => viewer.zoomBy(1.25),
    '=': () => viewer.zoomBy(1.25),
    '-': () => viewer.zoomBy(1 / 1.25),
    ArrowLeft: () => (board3d && board3dOn ? board3d.orbit(0.15, 0) : viewer.panBy(w * 0.1, 0)),
    ArrowRight: () => (board3d && board3dOn ? board3d.orbit(-0.15, 0) : viewer.panBy(-w * 0.1, 0)),
    ArrowUp: () => (board3d && board3dOn ? board3d.orbit(0, -0.1) : viewer.panBy(0, h * 0.1)),
    ArrowDown: () => (board3d && board3dOn ? board3d.orbit(0, 0.1) : viewer.panBy(0, -h * 0.1)),
    '/': () => find.focus(),
    n: () => find.next(),
    N: () => find.prev(),
    f: () => toggleFlip(),
    Escape: () => (state.mode ? stopTapping() : state.suggest ? stopSuggest('Stopped.') : clearPart()),
    b: () => setBoard3D(!board3dOn),
    '[': () => stepSheet(-1),
    ']': () => stepSheet(1),
    w: () => viewer.fitWidth(),
    s: () => state.selected && state.partsByRef.has(state.selected) && toggleTick(state.selected),
    ',': () => stepPart(-1),
    '.': () => stepPart(1),
    p: () => setPanelHidden(!$('#workspace').hasAttribute('data-panel-hidden')),
    r: () => turnPhoto(),
    '?': () => $('#help').showModal(),
    t: () => board3d && board3dOn && board3d.view('top'),
    u: () => board3d && board3dOn && board3d.view('bottom'),
  };
  if (/^[1-9]$/.test(e.key) && state.sheets[Number(e.key) - 1]) {
    e.preventDefault();
    selectSheet(state.sheets[Number(e.key) - 1].id);
    return;
  }
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
  $('#split').addEventListener('click', () => setSplit(!split.on));
  $('#board3d-toggle').addEventListener('click', () => setBoard3D(!board3dOn));
  $('#myboard-toggle').addEventListener('click', () => {
    state.myBoardOpen = !state.myBoardOpen;
    if (!state.myBoardOpen && state.mode) stopTapping('');
    renderMyBoardPanel();
    if (state.myBoardOpen) showTab('board');
  });
  viewer.onPointClick(onPhotoTap);
  viewer.setDragHandler(onPhotoDrag);
  let viewSave = 0;
  viewer.onView((v) => {
    $('#zoom-level').textContent = `${Math.round(v.scale * 100)} %`;
    clearTimeout(viewSave);
    const id = state.current;
    viewSave = setTimeout(() => {
      if (!id || id !== state.current) return;
      const all = store.get(`views:${projectName()}`, {}) || {};
      all[id] = { scale: v.scale, x: v.x, y: v.y };
      store.set(`views:${projectName()}`, all);
    }, 400);
  });
  $('#zoom-level').addEventListener('click', () => viewer.fit());
  $('#help-done').addEventListener('click', () => $('#help').close());
  state.folded = new Set((store.get('folded', []) || []).filter((id) => FOLDABLE.includes(id)));
  state.panelTab = cleanTab(store.get('panelTab', 'guide'));
  wirePanelTabs();
  new MutationObserver((records) => {
    if (records.every((r) => $('#panel-tabs').contains(r.target))) return; // the tab row itself
    decorateFolds();
    queueTabs();
  }).observe($('#panel'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  renderPanelTabs();
  decorateFolds();
  $('#panel').addEventListener('click', (e) => {
    const id = foldTarget(e);
    if (id) toggleFold(id);
  });
  $('#panel').addEventListener('keydown', (e) => {
    const id = (e.key === 'Enter' || e.key === ' ') && foldTarget(e);
    if (id) {
      e.preventDefault();
      toggleFold(id);
    }
  });
  setPanelHidden(store.get('panelHidden', false) === true);
  // phones: the header's tools fold into a menu, the panel is a sheet from the bottom (0.7 design §4)
  wireMenu({ top: $('#top'), button: $('#menu-toggle') });
  wireSheetHandle({ panel: $('#panel'), handle: $('#panel-handle'), onChange: (tall) => store.set('panelTall', tall) })
    .restore(store.get('panelTall', false) === true);
  $('#panel-toggle').addEventListener('click', () => setPanelHidden(!$('#workspace').hasAttribute('data-panel-hidden')));
  $('#rotate').addEventListener('click', turnPhoto);
  // the Menu's own entries (0.8): what the Parts tab's buttons do, from any tab
  $('#menu-save').addEventListener('click', saveProgressFile);
  $('#menu-shopping').addEventListener('click', openShopping);
  $('#menu-log').addEventListener('click', openLog);
  $('#menu-versions').addEventListener('click', openVersions);
  $('#menu-help').addEventListener('click', () => $('#help').showModal());
  $('#fullscreen').hidden = !document.fullscreenEnabled;
  $('#fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const on = Boolean(document.fullscreenElement);
    $('#fullscreen').setAttribute('aria-pressed', String(on));
    $('#fullscreen').textContent = on ? 'Leave full screen' : 'Full screen';
  });
  $('#wake').hidden = !('wakeLock' in navigator);
  $('#wake').addEventListener('click', () => setWake(!wakeWanted));
  document.addEventListener('visibilitychange', () => {
    if (wakeWanted && !wakeLock && document.visibilityState === 'visible') setWake(true); // the browser lets go when hidden
  });
  if ('wakeLock' in navigator && store.get('keepScreenOn', false) === true) setWake(true);
  darkScheme.addEventListener('change', () => applySettings(document.documentElement, settings, darkScheme.matches));
  $('#shopping-copy').addEventListener('click', copyShopping);
  $('#log-filter').addEventListener('input', renderLog);
  $('#palette-input').addEventListener('input', () => { paletteAt = 0; renderPalette(); });
  $('#palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      paletteAt = Math.max(0, Math.min(paletteShown.length - 1, paletteAt + (e.key === 'ArrowDown' ? 1 : -1)));
      renderPalette();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPalette(paletteAt);
    }
  });
  $('#calc-open').addEventListener('click', openCalc);
  $('#stage-retry').addEventListener('click', () => {
    const id = retrySheet;
    if (!id) return;
    state.cache.delete(id);
    state.loaded.delete(id);
    selectSheet(id);
  });
  $('#calc').addEventListener('input', updateCalc);
  $('#calc-done').addEventListener('click', () => $('#calc').close());
  renderRecentFinds();
  $('#find').addEventListener('keydown', (e) => { if (e.key === 'Enter') rememberFind($('#find').value); });
  $('#stage').addEventListener('pointermove', onStageHover);
  $('#stage').addEventListener('pointerleave', () => { $('#label-tip').hidden = true; });
  wirePanelResize();
  showWhatsNew();
  $('#whats-new-close').addEventListener('click', () => {
    store.set('seenVersion', APP_VERSION);
    $('#whats-new').hidden = true;
  });
  $('#checklist').addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.id !== 'checklist-search') return;
    state.checklistQuery = e.target.value;
    const caret = [e.target.selectionStart, e.target.selectionEnd];
    renderChecklist();
    const again = $('#checklist-search');
    again.focus();
    again.setSelectionRange(...caret);
  });
  $('#log-copy').addEventListener('click', () => copyText(logText(state.log), 'Build log copied.'));
  $('#log-done').addEventListener('click', () => $('#log').close());
  $('#version-save').addEventListener('click', saveVersion);
  $('#version-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveVersion(); });
  $('#versions-done').addEventListener('click', () => $('#versions').close());
  $('#shopping-csv').addEventListener('click', saveShoppingCsv);
  $('#shopping-done').addEventListener('click', () => $('#shopping').close());
  $('#board3d-top').addEventListener('click', () => board3d && board3d.view('top'));
  $('#board3d-under').addEventListener('click', () => board3d && board3d.view('bottom'));
  $('#board3d-reset').addEventListener('click', () => board3d && board3d.resetView());
  for (const [id, name] of [['#board3d-front', 'front'], ['#board3d-side', 'side'], ['#board3d-iso', 'iso']]) {
    $(id).addEventListener('click', () => board3d && board3d.view(name));
  }
  $('#board3d-fit').addEventListener('click', () => board3d && board3d.fit());
  $('#board3d-sheet4').addEventListener('click', () => setBoard3DSource('sheet4'));
  $('#board3d-mine').addEventListener('click', () => setBoard3DSource('mine'));
  $('#board3d-labels').addEventListener('change', (e) => board3d && board3d.showLabels(e.target.checked));
  $('#board3d-xray').addEventListener('change', (e) => board3d && board3d.setXray(e.target.checked));
  $('#board3d-upto').addEventListener('change', syncStep3D);
  $('#board3d-explode').addEventListener('input', (e) => board3d && board3d.setExplode(Number(e.target.value)));
  $('#board3d-clip').addEventListener('input', (e) => board3d && board3d.setClip(Number(e.target.value) >= 1 ? null : Number(e.target.value)));
  $('#board3d-measure-toggle').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (board3d) board3d.setMeasure(on);
  });
  $('#board3d-play').addEventListener('click', playSteps);
  $('#board3d-png').addEventListener('click', () => board3d && download(board3d.picture(), `${fileSafe(projectName())}-3d.png`));
  $('#board3d-stl').addEventListener('click', () => {
    if (!board3d) return;
    const url = URL.createObjectURL(new Blob([board3d.stl()], { type: 'model/stl' }));
    download(url, `${fileSafe(projectName())}-board.stl`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#board3d-wiring').addEventListener('change', (e) => board3d && board3d.showWiring(e.target.checked));
  // the 3D view handles its own pointer and wheel: don't let the sheet underneath pan or zoom
  for (const type of ['pointerdown', 'wheel', 'dblclick']) $('#board3d').addEventListener(type, (e) => e.stopPropagation());
  $('#stage2-sheet').addEventListener('change', (e) => showInSplit(e.target.value));
  window.addEventListener('resize', updateSplitButton);
  updateSplitButton();
  $('#checklist').addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.dataset.ref) toggleTick(t.dataset.ref);
    else if (t instanceof HTMLInputElement && t.id === 'checklist-open-only') {
      state.checklistOpenOnly = t.checked;
      renderChecklist();
    } else if (t instanceof HTMLInputElement && t.id === 'checklist-group') {
      state.checklistGroup = t.checked;
      renderChecklist();
    } else if (t instanceof HTMLSelectElement && t.id === 'checklist-sort') {
      state.checklistSort = t.value;
      renderChecklist();
    }
    else if (t instanceof HTMLInputElement && t.id === 'progress-open') openProgressFile(t);
  });
  $('#checklist').addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.id === 'progress-save') saveProgressFile();
    if (e.target instanceof HTMLElement && e.target.id === 'notes-checked') acknowledgeNotes();
    if (e.target instanceof HTMLElement && e.target.dataset.open) selectPart(e.target.dataset.open);
    if (e.target instanceof HTMLElement && e.target.id === 'shopping-open') openShopping();
    if (e.target instanceof HTMLElement && e.target.id === 'log-open') openLog();
    if (e.target instanceof HTMLElement && e.target.id === 'versions-open') openVersions();
    if (e.target instanceof HTMLElement && e.target.id === 'report-save') saveReport();
    if (e.target instanceof HTMLElement && e.target.id === 'start-over') startOver();
  });
  wireSettings($('#settings'), $('#settings-button'), $('#settings-done'), () => settings, (next, label) => {
    const before = settings;
    history.do({ label, apply: () => setSettings(next), revert: () => setSettings(before) });
  });
  aiSettings = wireAiSettings({
    dialog: $('#settings'),
    get: () => ai,
    set: setAi,
    test: () => askAi(ai, 'Answer in one short, friendly sentence.', 'Say hello to someone soldering at their bench.', { origin: window.location.origin }),
  });
  $('#settings-button').addEventListener('click', () => aiSettings.show());
  $('#source-folder').addEventListener('change', (e) => {
    const picked = folderFiles(e.target.files);
    e.target.value = '';
    if (picked.files.length) refreshSource(folderSource(picked));
  });
  // a repo link wins, even under dev.py (0.7 design §2)
  const repoText = new URLSearchParams(window.location.search).get('repo');
  if (repoText !== null) {
    const spec = parseRepoLink(repoText);
    if (!spec) {
      showStart(`That link isn't a GitHub repo: ${repoText.slice(0, 120)}`);
      return;
    }
    await openProject(githubSource(spec));
    return;
  }
  let listing;
  try {
    listing = await localSource().list();
  } catch {
    showStart(''); // no dev.py: the website, or dev.py without a folder
    return;
  }
  await openProject(localSource(), listing);
}

// ---- the start screen (0.7 design §3) ----
function repoQuery(spec) {
  return `repo=${encodeURIComponent(repoParam(spec)).replace(/%2F/g, '/').replace(/%40/g, '@')}`;
}

function showStart(message) {
  document.body.toggleAttribute('data-start', true);
  $('#project-name').textContent = '';
  document.title = 'Open a project – Maker Forge Bench';
  setStatus('');
  renderStart($('#start'), {
    message,
    examples: EXAMPLES.map((x) => ({ ...x, href: `?${repoQuery(parseRepoLink(x.repo))}` })),
    onRepo: (text) => {
      const spec = parseRepoLink(text);
      if (!spec) return "That isn't a GitHub repo link. It looks like github.com/owner/name.";
      window.location.search = `?${repoQuery(spec)}`;
      return '';
    },
    onFolder: (files) => {
      const picked = folderFiles(files);
      if (!picked.files.length) return `${picked.root || 'That folder'} has no drawings (SVG, PNG or JPG) and no forge-project.json.`;
      openProject(folderSource(picked));
      return '';
    },
  });
  $('#start').hidden = false;
}

function hideStart() {
  document.body.toggleAttribute('data-start', false);
  $('#start').hidden = true;
  $('#start').replaceChildren();
}

/** Open a project from a source: its file list (given, or read now), its project file and its sheets. */
async function openProject(src, listing = null) {
  let project = listing;
  try {
    if (!project) project = await src.list();
  } catch (error) {
    showStart(error instanceof SourceError ? error.message : SERVER_DOWN);
    return;
  }
  if (!src.live && !project.files.length) {
    showStart(src.kind === 'github'
      ? `${src.spec.owner}/${src.spec.repo} has no drawings (SVG, PNG or JPG) and no forge-project.json${src.spec.path ? ` in ${src.spec.path}` : ''}.`
      : 'That folder has no drawings (SVG, PNG or JPG) and no forge-project.json.');
    return;
  }
  hideStart();
  source = src;
  state.root = project.root;
  if (project.files.some((f) => f.path === 'forge-project.json')) state.project = await readProjectFile();
  showProjectName();
  updateBoard3DButton();
  setStatus(project.truncated ? 'GitHub sent only part of this big repo\'s file list: some drawings may be missing. A link to its folder opens less.' : '');
  state.sheets = sheetsFor(project.files);
  loadProgress();
  loadOpenStep();
  renderTabs();
  if (source.live) {
    connectLive({ onChange: onFileChange, onRemove: (path) => whenQuiet(path, path === 'forge-project.json' ? forgetProject : relist), onStatus: onLiveStatus });
  } else {
    markUpdated();
  }
  if (state.sheets.length === 0) {
    setStatus(noDrawingsMessage(project.root));
    return;
  }
  const remembered = store.get(`sheet:${projectName()}`, null);
  await selectSheet((state.sheets.find((s) => s.id === remembered && !s.missing) || state.sheets[0]).id);
  // Read the other sheets in the background, so Find part can search all of them.
  await Promise.all(state.sheets.map(load));
  updateParts();
  updateTabCounts();
  find.refresh();
  openFromLink();
}

/** A link with ?sheet=…&part=… opens there (0.5 improvement 1); a repo in it stays (0.7). */
async function openFromLink() {
  const q = new URLSearchParams(window.location.search);
  const sheet = q.get('sheet');
  const part = q.get('part');
  if (sheet && state.sheets.some((s) => s.id === sheet)) await selectSheet(sheet);
  if (part && state.partsByRef.has(part)) selectPart(part);
  if (sheet || part) { // once: a reload stays where you are
    window.history.replaceState(null, '', `${window.location.pathname}${source.spec ? `?${repoQuery(source.spec)}` : ''}`);
  }
}

/** From GitHub or a picked folder: read the file list again and reload what changed (0.7 design §1). */
async function refreshSource(next = source) {
  let listing;
  try {
    listing = await next.list();
  } catch (error) {
    setStatus(error instanceof SourceError ? error.message : String(error && error.message));
    return;
  }
  source = next;
  const byPath = new Map(listing.files.map((f) => [f.path, f]));
  const changed = state.sheets.filter((s) => !s.missing && byPath.has(s.path) && byPath.get(s.path).mtime !== s.mtime)
    .map((s) => ({ path: s.path, mtime: byPath.get(s.path).mtime }));
  state.root = listing.root;
  const fresh = byPath.has('forge-project.json') ? await readProjectFile() : null;
  if (fresh || !byPath.has('forge-project.json')) state.project = fresh; // a broken project file keeps the last good one
  showProjectName();
  setStatus(state.projectProblem || '');
  await relist(listing);
  for (const c of changed) {
    const sheet = state.sheets.find((s) => s.path === c.path);
    if (sheet) await refreshSheet(sheet, c.mtime);
  }
  markUpdated();
  updateParts();
  checkProgressKey();
  refreshOpenStep();
  resetBoard3D();
  find.refresh(true);
}

start();
