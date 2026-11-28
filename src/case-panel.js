// Bench 1.0.5 "The case" (docs/design/2026-11-27-release-1.0.5-design.md §6): the Case tab's parts to print, and the
// "What you have" card at the top of the Guide tab. Built with el() only: file names and README words are always text.
import { MATERIALS, PRINTERS, gramsText, metresText, sizeText } from './caseparts.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** Puts the focus back on the control it was on before a redraw (by data-focus). */
function keepFocus(container, build) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.getAttribute('data-focus') : null;
  build();
  if (key) [...container.querySelectorAll('[data-focus]')].find((n) => n.getAttribute('data-focus') === key)?.focus();
}

const nameOf = (path) => path.split('/').pop();
const folderOf = (path) => path.split('/').slice(0, -1).join('/');

function printerRow(o) {
  const pick = el('select', { id: 'case-printer', 'data-focus': 'case-printer', 'aria-label': 'Your printer' });
  for (const p of PRINTERS) pick.append(el('option', { value: p.id }, p.label));
  pick.value = o.printer.id;
  pick.addEventListener('change', () => o.onPrinter({ id: pick.value, bed: o.printer.bed }));
  const row = el('div', { className: 'case-settings' }, el('label', {}, 'Printer ', pick));
  if (o.printer.id === 'own') {
    const own = el('span', { className: 'case-own', role: 'group', 'aria-label': 'Your bed, in mm' });
    ['Width', 'Depth', 'Height'].forEach((word, i) => {
      const box = el('input', { type: 'number', min: '20', max: '2000', step: '1', 'data-focus': `case-bed-${i}`, 'aria-label': `Bed ${word.toLowerCase()}, mm`, className: 'case-bed' });
      box.value = String(o.printer.bed[i]);
      box.addEventListener('change', () => {
        const bed = [...o.printer.bed];
        bed[i] = Number(box.value);
        o.onPrinter({ id: 'own', bed });
      });
      own.append(el('label', {}, `${word} `, box));
    });
    row.append(own);
  }
  const plastic = el('select', { id: 'case-material', 'data-focus': 'case-material', 'aria-label': 'Plastic, where the README doesn\'t say' });
  for (const m of Object.keys(MATERIALS)) plastic.append(el('option', { value: m }, m));
  plastic.value = o.material;
  plastic.addEventListener('change', () => o.onMaterial(plastic.value));
  row.append(el('label', { title: 'For the weight, where the README doesn\'t name the plastic' }, 'Plastic ', plastic));
  return row;
}

function partRow(part, o) {
  const name = nameOf(part.path);
  const box = el('input', { type: 'checkbox', 'data-printed': part.path, 'data-focus': `printed-${part.path}`, 'aria-label': `${name} printed` });
  box.checked = part.printed;
  box.addEventListener('change', () => o.onPrinted(part, box.checked));
  const fit = el('input', { type: 'checkbox', 'data-fitted': part.path, 'data-focus': `fitted-${part.path}`, 'aria-label': `${name} fitted` });
  fit.checked = Boolean(part.fitted);
  fit.addEventListener('change', () => o.onFitted(part, fit.checked));
  const thumb = el('button', { type: 'button', className: 'case-thumb', 'data-focus': `look-${part.path}`, title: `Look at ${name} in 3D`, 'aria-label': `Look at ${name} in 3D` });
  if (part.thumb) thumb.append(el('img', { src: part.thumb, alt: '' }));
  else thumb.append(el('span', { className: 'case-thumb-empty', 'aria-hidden': 'true' }, part.facts ? '3D' : '…'));
  if (part.facts) thumb.addEventListener('click', () => o.onShow(part));
  else thumb.disabled = true;
  const body = el('div', { className: 'case-part-body' });
  const title = el('p', { className: 'case-part-name' }, el('strong', {}, name));
  if (part.count > 1) title.append(el('span', { className: 'case-part-count', title: `Print ${part.count}` }, ` × ${part.count}`));
  const folder = folderOf(part.path);
  if (folder) title.append(el('span', { className: 'case-part-folder' }, ` in ${folder}`));
  body.append(title);
  if (part.error) {
    body.append(el('p', { className: 'case-part-error' }, `${name} ${part.error}.`));
  } else if (!part.facts) {
    body.append(el('p', { className: 'hint' }, 'Reading…'));
  } else {
    const material = part.material;
    const each = part.count > 1 ? ` each (${gramsText(part.allPlastic.grams).replace(/^about /, '')} for ${part.count})` : '';
    body.append(el('p', { className: 'case-part-facts' }, `${sizeText(part.facts.size)} · ${gramsText(part.plastic.grams)} of ${material}${each} · ${metresText(part.plastic.metres)}`));
  }
  if (part.notes && part.notes.what) body.append(el('p', { className: 'case-part-what' }, part.notes.what));
  if (part.notes && part.notes.print) body.append(el('p', { className: 'case-part-print' }, el('span', { className: 'case-part-label' }, 'Print: '), part.notes.print));
  if (part.facts && part.fit && part.fit.fits) {
    body.append(el('p', { className: 'case-part-fit ok' }, part.fit.turned ? 'Fits your printer, turned 90° on the bed.' : 'Fits your printer.'));
  }
  if (part.warnings && part.warnings.length) {
    const list = el('ul', { className: 'case-part-warnings' });
    for (const w of part.warnings) list.append(el('li', { className: w.level }, w.text));
    body.append(list);
  }
  const actions = el('div', { className: 'case-part-actions' });
  if (part.facts) {
    const look = el('button', { type: 'button', 'data-focus': `look3d-${part.path}`, className: 'case-look' }, 'Look in 3D');
    look.addEventListener('click', () => o.onShow(part));
    actions.append(look);
  }
  const href = o.fileHref(part.path);
  if (href) actions.append(el('a', { href, target: '_blank', rel: 'noopener' }, 'Open the file'));
  body.append(actions);
  return el('li', { className: `case-part${part.printed ? ' done' : ''}${part.fitted ? ' fitted' : ''}${part.warnings && part.warnings.some((w) => w.level === 'warn') ? ' warn' : ''}`, 'data-part': part.path },
    el('div', { className: 'case-part-side' }, thumb, el('label', { className: 'case-part-tick' }, box, el('span', {}, 'Printed')),
      el('label', { className: 'case-part-tick' }, fit, el('span', {}, 'Fitted'))), body);
}

/**
 * Draws the Case tab into container. o: { parts: [{ path, printed, fitted, count, facts, error, plastic (one), allPlastic (all
 * copies), material, fit, warnings, notes, thumb }], printer: { id, bed }, material, openOnly, missing: [{ name, readme }],
 * fileHref(path), onPrinted(part, on), onFitted(part, on), onShow(part),
 * onPrinter(printer), onMaterial(name), onOpenOnly(on), onCopy() }.
 */
export function renderCase(container, o) {
  if (!o.parts.length) {
    container.replaceChildren();
    return;
  }
  keepFocus(container, () => {
    const done = o.parts.filter((p) => p.printed).length;
    const fitted = o.parts.filter((p) => p.fitted).length;
    const read = o.parts.filter((p) => p.facts);
    const grams = read.reduce((s, p) => s + p.allPlastic.grams, 0);
    const metres = read.reduce((s, p) => s + p.allPlastic.metres, 0);
    const copies = o.parts.reduce((s, p) => s + (p.count || 1), 0);
    const kinds = [...new Set(read.map((p) => p.material))];
    const bar = el('progress', { max: String(o.parts.length) });
    bar.value = done;
    const children = [
      el('h2', {}, 'Case parts to print'),
      el('p', { id: 'case-progress', className: 'progress-text' }, `${done} of ${o.parts.length} printed${fitted ? `, ${fitted} fitted` : ''}`), bar,
    ];
    if (read.length) {
      const what = kinds.length === 1 ? kinds[0] : 'plastic';
      const reading = o.parts.some((p) => !p.facts && !p.error);
      const failed = o.parts.filter((p) => p.error).map((p) => nameOf(p.path));
      const but = reading ? ' for the ones read so far' : failed.length ? `, not counting ${failed.length === 1 ? failed[0] : `${failed.length} parts`} that couldn't be read` : '';
      children.push(el('p', { id: 'case-total', className: 'case-total' },
        `${o.parts.length} ${o.parts.length === 1 ? 'part' : 'parts'}${copies > o.parts.length ? ` (${copies} to print, counting copies)` : ''}, ${gramsText(grams)} of ${what} (${metresText(metres)} of 1.75 mm filament)${but}.`),
      el('p', { className: 'hint' }, 'Counted with solid walls and 15 % infill: your slicer gives the exact figure.'));
    }
    children.push(printerRow(o));
    const big = o.parts.filter((p) => p.fit && !p.fit.fits);
    if (big.length) {
      children.push(el('p', { id: 'case-too-big', className: 'case-too-big', role: 'note' },
        big.length === 1 ? `${nameOf(big[0].path)} is too big for your printer as it lies.` : `${big.length} parts are too big for your printer as they lie.`));
    }
    if (o.missing && o.missing.length) {
      const list = el('ul', { id: 'case-missing', className: 'case-missing' });
      for (const m of o.missing) list.append(el('li', {}, el('code', {}, m.name), ` is listed in ${m.readme}, but isn't in the project.`));
      children.push(el('div', { className: 'case-missing-box', role: 'note' }, el('p', {}, el('strong', {}, o.missing.length === 1 ? 'A part file is missing' : `${o.missing.length} part files are missing`)), list));
    }
    const only = el('input', { type: 'checkbox', id: 'case-open-only', 'data-focus': 'case-open-only' });
    only.checked = o.openOnly;
    only.addEventListener('change', () => o.onOpenOnly(only.checked));
    const copy = el('button', { type: 'button', id: 'case-copy', 'data-focus': 'case-copy' }, 'Copy as text');
    copy.addEventListener('click', () => o.onCopy());
    children.push(el('div', { className: 'wiring-actions' }, el('label', { className: 'check' }, only, ' Only not printed'), copy));
    const list = el('ul', { id: 'case-list', className: 'case-list' });
    for (const part of o.parts) if (!o.openOnly || !part.printed) list.append(partRow(part, o));
    children.push(list);
    container.replaceChildren(...children);
  });
}

/** The parts as plain text, for paper: one line each, with a tick box. */
export function caseText(parts, projectName) {
  const lines = [`Case parts to print: ${projectName}`, ''];
  for (const p of parts) {
    let line = `[${p.printed ? 'x' : ' '}] ${p.path}${p.count > 1 ? ` × ${p.count}` : ''}${p.fitted ? ' (fitted)' : ''}`;
    if (p.facts) line += `  ${sizeText(p.facts.size)}, ${gramsText(p.plastic.grams)} of ${p.material}${p.count > 1 ? ' each' : ''}`;
    if (p.error) line += `  (${p.error})`;
    lines.push(line);
    if (p.notes && p.notes.what) lines.push(`      ${p.notes.what}`);
    if (p.notes && p.notes.print) lines.push(`      Print: ${p.notes.print}`);
    for (const w of p.warnings || []) if (w.level === 'warn') lines.push(`      ! ${w.text}`);
  }
  return lines.join('\n');
}

/**
 * The "What you have" card: each piece of the build with how far it's got, and what's left.
 * o: { rows: [{ id, label, done, total, words, tab }], also: string | null, onOpen(row) }.
 */
export function renderHave(container, o) {
  if (!o.rows.length) {
    container.replaceChildren();
    return;
  }
  keepFocus(container, () => {
    const list = el('ul', { id: 'have-list', className: 'have-list' });
    for (const row of o.rows) {
      const finished = row.total > 0 && row.done >= row.total;
      const go = el('button', { type: 'button', className: 'have-go', 'data-have': row.id, 'data-focus': `have-${row.id}`, title: `Open ${row.tabLabel}` },
        el('span', { className: 'have-mark', 'aria-hidden': 'true' }, finished ? '✓' : ''),
        el('span', { className: 'have-label' }, row.label),
        el('span', { className: 'have-words' }, row.words));
      go.addEventListener('click', () => o.onOpen(row));
      const meter = el('progress', { max: String(Math.max(1, row.total)), 'aria-hidden': 'true' });
      meter.value = row.done;
      list.append(el('li', { className: `have-row${finished ? ' done' : ''}`, 'data-have': row.id }, go, meter));
    }
    const left = o.rows.filter((r) => r.left);
    const children = [el('h2', {}, 'What you have'), list];
    if (left.length) children.push(el('p', { id: 'have-left', className: 'have-left' }, `Left to do: ${left.map((r) => r.left).join(' · ')}.`));
    else children.push(el('p', { id: 'have-left', className: 'have-left all-done' }, 'Everything here is done.'));
    if (o.also) children.push(el('p', { className: 'hint' }, o.also));
    container.replaceChildren(...children);
  });
}
