// Bench 1.0.4 "How to build it" (docs/design/2026-11-20-release-1.0.4-design.md §6.7): the README's steps,
// each with its wires and a picture cut from the drawing, behind Bench's mains safety list. Built with el()
// only: the README's text is always text, never markup.
import { SAFETY, inline, isWeb, pathFrom } from './readme.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// Pictures are kept between redraws, so ticking a step doesn't load them again.
const pictures = new Map();
function picture(key, alt, className, url) {
  let img = pictures.get(key);
  if (!img) {
    img = el('img', { alt, className, loading: 'lazy', decoding: 'async' });
    Promise.resolve(url()).then((src) => { if (src) img.src = src; }, () => { img.replaceWith(el('span', { className: 'readme-missing' }, `${alt}: couldn't be read`)); });
    pictures.set(key, img);
    if (pictures.size > 300) pictures.delete(pictures.keys().next().value);
  }
  return img;
}

const SAFE_LINK = /^https?:\/\//i;

/** A line of the README as nodes: bold, italic, code, links and pictures. */
function runs(text, o) {
  return inline(text).map((r) => {
    if (r.t === 'b') return el('strong', {}, r.text);
    if (r.t === 'i') return el('em', {}, r.text);
    if (r.t === 'code') return el('code', {}, r.text);
    if (r.t === 'link') {
      if (SAFE_LINK.test(r.href)) return el('a', { href: r.href, target: '_blank', rel: 'noopener noreferrer' }, r.text);
      if (isWeb(r.href)) return document.createTextNode(r.text);
      const href = o.fileHref(pathFrom(o.readmePath, r.href));
      return href ? el('a', { href, target: '_blank', rel: 'noopener' }, r.text) : document.createTextNode(r.text);
    }
    if (r.t === 'img') {
      if (isWeb(r.src)) return document.createTextNode(`[picture: ${r.alt || r.src}]`);
      const path = pathFrom(o.readmePath, r.src);
      if (!o.hasFile(path)) return el('span', { className: 'readme-missing' }, `picture ${path} isn't in the folder`);
      return picture(`file:${path}:${o.mtimeOf(path)}`, r.alt || path, 'readme-pic', () => o.imageUrl(path, o.mtimeOf(path)));
    }
    return document.createTextNode(r.text);
  });
}

/** README blocks as nodes. */
function blocks(list, o) {
  return list.map((b) => {
    if (b.t === 'p') return el('p', {}, ...runs(b.text, o));
    if (b.t === 'h') return el('h4', {}, ...runs(b.text, o));
    if (b.t === 'code') return el('pre', {}, el('code', {}, b.text));
    if (b.t === 'hr') return el('hr');
    if (b.t === 'quote') return el('blockquote', {}, ...blocks(b.blocks, o));
    if (b.t === 'list') {
      const node = el(b.ordered ? 'ol' : 'ul', b.ordered && b.start !== 1 ? { start: String(b.start) } : {});
      for (const it of b.items) node.append(el('li', {}, ...blocks(it.blocks, o)));
      return node;
    }
    if (b.t === 'table') {
      const head = el('tr', {}, ...b.head.map((c) => el('th', { scope: 'col' }, ...runs(c, o))));
      const body = el('tbody', {}, ...b.rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, ...runs(c, o))))));
      return el('div', { className: 'readme-table' }, el('table', {}, el('thead', {}, head), body));
    }
    return document.createTextNode('');
  });
}

function needsList(o) {
  const list = el('ul', { id: 'readme-needs-list' });
  for (const need of o.needs) {
    const no = el('button', { type: 'button', className: 'wire-need-dismiss', 'data-focus': `dismiss-${need.id}` }, 'Not needed');
    no.addEventListener('click', () => o.onDismiss(need));
    list.append(el('li', { className: 'wire-need', 'data-need': need.id }, el('p', { className: 'wire-need-text' }, need.text), el('div', { className: 'wire-need-buttons' }, no)));
  }
  const n = o.needs.length;
  return el('div', { id: 'readme-needs', className: 'wire-needs', role: 'region', 'aria-label': "What's wrong or missing" },
    el('h3', {}, `${n} ${n === 1 ? 'thing' : 'things'} to look at`), list);
}

function safetyCard(o, readCards) {
  const list = el('ul', { id: 'readme-safety-list', className: 'checks-list' });
  for (const s of SAFETY) {
    const box = el('input', { type: 'checkbox', 'data-safety': s.id, 'data-focus': `safety-${s.id}` });
    box.checked = o.safetyDone.has(s.id);
    box.addEventListener('change', () => o.onSafety(s, box.checked));
    list.append(el('li', { 'data-safety': s.id }, el('label', { className: 'check' }, box, ' ', s.text)));
  }
  const done = SAFETY.filter((s) => o.safetyDone.has(s.id)).length;
  return el('div', { id: 'readme-safety', className: `readme-safety${done === SAFETY.length ? ' all-done' : ''}`, role: 'region', 'aria-label': 'Mains safety' },
    el('h3', {}, `Before the mains work (${done} of ${SAFETY.length})`),
    el('p', { className: 'readme-safety-warn' }, "Mains can kill. If you're not sure about any of these, have someone who knows mains wiring check it before you plug it in."),
    list,
    ...readCards.flatMap((s) => [el('h4', {}, 'From the README: ', ...runs(s.heading, o)), ...blocks(s.before, o)]));
}

function stepRow(section, step, o) {
  const done = o.stepsDone.has(step.id);
  const box = el('input', { type: 'checkbox', 'data-step': step.id, 'data-focus': `step-${step.id}`, 'aria-label': `${section.title} step ${step.n} done` });
  box.checked = done;
  box.addEventListener('change', () => o.onStep(section, step, box.checked));
  const [first, ...rest] = step.blocks;
  const lead = first && first.t === 'p' ? el('p', { className: 'readme-step-lead' }, ...runs(first.text, o)) : null;
  const body = el('div', { className: 'readme-step-body' });
  if (lead) body.append(lead);
  body.append(...blocks(lead ? rest : step.blocks, o));
  if (o.mainsStep(step.id) && !o.safetyAllDone) body.append(el('p', { className: 'readme-mains' }, 'Mains: tick the safety list first.'));
  const crop = o.crops.get(step.id);
  if (crop) {
    const shown = Boolean(o.shown && o.shown.id === step.id);
    const show = el('button', { type: 'button', className: 'readme-crop-show', 'data-focus': `crop-${step.id}`, 'aria-pressed': String(shown),
      title: shown ? 'Hide the rings on the drawing' : 'Open the drawing with these wires ringed' },
    picture(`crop:${crop.path}:${crop.mtime}:${crop.view}`, `The drawing around step ${step.n}'s wires`, 'readme-crop', () => o.imageUrl(crop.path, crop.mtime).then((u) => `${u}#svgView(viewBox(${crop.view}))`)),
    el('span', {}, shown ? 'Shown on the drawing' : 'Show on the drawing'));
    show.addEventListener('click', () => o.onShow(step));
    body.append(show);
  }
  const wires = o.wiresOf.get(step.id) || [];
  if (wires.length) {
    const list = el('ul', { className: 'readme-wires' });
    for (const { sheetId, wire, by } of wires) {
      const key = `${sheetId}#${wire.id}`;
      const w = el('input', { type: 'checkbox', 'data-wire': wire.id, 'data-focus': `rwire-${step.id}-${key}` });
      w.checked = o.wiresDone.has(key);
      w.addEventListener('change', () => o.onWire(sheetId, wire, w.checked));
      const label = el('label', { className: 'check' }, w, ' ', el('strong', {}, wire.id), ` ${wire.from} → ${wire.to}`);
      if (by) label.append(el('span', { className: 'readme-wire-by' }, ` (by ${by})`));
      list.append(el('li', { className: `readme-wire${wire.mains ? ' mains' : ''}`, 'data-wire': wire.id }, label));
    }
    body.append(list);
  }
  return el('li', { className: `readme-step${done ? ' done' : ''}`, 'data-step': step.id },
    el('label', { className: 'readme-step-tick' }, box, el('span', { className: 'readme-step-n' }, String(step.n))), body);
}

/**
 * Draws the guide into container. o: { sections, wiresOf, crops, needs, showSafety, safetyDone, stepsDone,
 * wiresDone, openOnly, shown, readmePath, mainsStep(id), hasFile(path), mtimeOf(path), imageUrl(path, mtime),
 * fileHref(path), onStep, onSafety, onWire, onShow, onDismiss, onOpenOnly }.
 */
export function renderGuide(container, o) {
  if (!o.sections.length && !o.showSafety) {
    container.replaceChildren();
    return;
  }
  o.safetyAllDone = SAFETY.every((s) => o.safetyDone.has(s.id));
  const steps = o.sections.flatMap((s) => s.steps);
  const done = steps.filter((s) => o.stepsDone.has(s.id)).length;
  const children = [el('h2', {}, o.sections.length ? 'How to build it (README)' : 'Mains safety')];
  if (steps.length) {
    const bar = el('progress', { max: String(steps.length) });
    bar.value = done;
    children.push(el('p', { id: 'readme-progress', className: 'progress-text' }, `${done} of ${steps.length} steps done, read from ${o.readmePath}`), bar);
  }
  if (o.needs.length) children.push(needsList(o));
  const safetyRead = o.sections.filter((s) => s.role === 'safety');
  if (o.showSafety) children.push(safetyCard(o, safetyRead));
  if (steps.length) {
    const only = el('input', { type: 'checkbox', id: 'readme-open-only', 'data-focus': 'readme-open-only' });
    only.checked = o.openOnly;
    only.addEventListener('change', () => o.onOpenOnly(only.checked));
    children.push(el('div', { className: 'wiring-actions' }, el('label', { className: 'check' }, only, ' Only not done')));
  }
  for (const s of o.sections) {
    if (s.role === 'safety' && o.showSafety) continue; // shown under the safety list
    const card = el('div', { className: `readme-section readme-${s.role}`, 'data-section': s.slug });
    card.append(el('h3', { title: inline(s.heading).map((r) => r.text || r.alt || '').join('') }, s.title));
    card.append(...blocks(s.before, o));
    if (s.steps.length) {
      const list = el('ol', { className: 'readme-steps' });
      for (const st of s.steps) if (!o.openOnly || !o.stepsDone.has(st.id)) list.append(stepRow(s, st, o));
      card.append(list);
    }
    card.append(...blocks(s.after, o));
    children.push(card);
  }
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.getAttribute('data-focus') : null;
  container.replaceChildren(...children);
  if (key) [...container.querySelectorAll('[data-focus]')].find((n) => n.getAttribute('data-focus') === key)?.focus();
}
