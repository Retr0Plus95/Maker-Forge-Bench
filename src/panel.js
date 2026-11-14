// The side panel: the selected part's card (design §7.4, board-view design §5), the build steps and
// what to wire (0.4 design F1).
// Everything is built with createElement and textContent: a project file's text is untrusted.
import { isGroundLabel, isPowerLabel, pinText, stillToWire, wireKey } from './wiring.js';
import { BAND_HEX } from './markings.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/**
 * Rebuilds a panel section with build(), then puts the keyboard focus back on the element with the
 * same data-focus key (or a fallback inside the section) if the focus was in it.
 */
function keepFocus(container, build, fallbackSelector = 'button, input') {
  const active = document.activeElement;
  const focusKey = active && container.contains(active) ? active.getAttribute('data-focus') : null;
  const caret = focusKey && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  build();
  if (!focusKey) return;
  const again = [...container.querySelectorAll('[data-focus]')].find((b) => b.getAttribute('data-focus') === focusKey);
  const fallback = container.querySelector(fallbackSelector);
  const target = again && !again.disabled ? again : fallback;
  target?.focus();
  if (caret && target === again && typeof again.setSelectionRange === 'function') again.setSelectionRange(...caret);
}

/** Looks like (0.8 design §2): what this part really is and looks like, as you fitted it. */
function looksBlock(L) {
  const box = el('details', { id: 'part-looks', className: 'part-looks' });
  if (L.open) box.open = true;
  box.addEventListener('toggle', () => L.onToggle(box.open));
  box.append(el('summary', { 'data-focus': 'looks' }, el('span', {}, 'Looks like: '), el('span', { id: 'part-looks-summary' }, L.summary)));
  const rows = el('div', { className: 'look-rows' });
  for (const f of L.fields) {
    const id = `look-${f.field}`;
    const select = el('select', { id, 'data-focus': id });
    f.choices.forEach((c, i) => {
      const option = el('option', { value: String(i) }, c.label);
      if (c.value === f.current) option.selected = true;
      select.append(option);
    });
    select.addEventListener('change', () => L.onChange(f.field, f.choices[Number(select.value)].value));
    rows.append(el('label', { for: id }, f.label), select);
  }
  box.append(rows);
  if (L.note) box.append(el('p', { className: 'hint', id: 'part-looks-note' }, L.note));
  if (L.warning) box.append(el('p', { className: 'part-looks-warning', id: 'part-looks-warning', role: 'note' }, L.warning));
  if (L.changed) {
    const reset = el('button', { id: 'look-reset', type: 'button', 'data-focus': 'look-reset' }, "Back to the drawing's look");
    reset.addEventListener('click', L.onReset);
    box.append(reset);
  }
  return box;
}

export function renderHint(container) {
  container.replaceChildren(el('p', { className: 'hint' },
    "Click a part on a drawing, or find it, to see what it is, why it's there and which way round it goes."));
}

/**
 * @param {HTMLElement} container
 * @param {object} part  a Part from project.js
 * @param {{ sheetsWithPart: object[], datasheetHref: string|null, ticked?: boolean,
 *           onSheet(id: string): void, onTick?(): void, onClose(): void,
 *           ask?: { placeholder: string, onCopy(q: string): Promise<boolean>, onOpen(q: string): Promise<boolean> },
 *           step?: { number, total, title }, where?: { pins: [string, number[]][], body?: string, mount?: string, side: string },
 *           offBoard?: boolean, connections?: { pin, label, others: [string, string][] }[], onPart?(ref: string): void }} o
 */
export function renderCard(container, part, o) {
  // text you're typing (your note before you leave it, a question for Claude) survives a redraw of the same card
  // (your note only while you're in it: an undo must show the note it brings back)
  const drafts = {};
  if (container.dataset.ref === part.ref) {
    const note = container.querySelector('#part-own-note');
    if (note && document.activeElement === note) drafts['part-own-note'] = note.value;
    const question = container.querySelector('#ask-question');
    if (question) drafts['ask-question'] = question.value;
  }
  container.dataset.ref = part.ref;
  const title = el('h2', {}, part.ref);
  if (part.value) title.append(' ', el('span', { className: 'part-value' }, part.value));
  if (part.polarized) title.append(' ', el('span', { className: 'badge-polarity' }, 'Way round matters'));
  const children = [title];

  const meta = [part.type, part.package].filter(Boolean).join(' · ');
  if (meta) children.push(el('p', { className: 'part-meta' }, meta));
  if (part.role) children.push(el('p', { className: 'part-why' }, el('strong', {}, 'Why: '), part.role));
  if (part.polarized) {
    children.push(el('p', { className: 'part-polarity', role: 'note' },
      `Goes in one way: ${part.orientation || 'check the drawing for its marking.'}`));
  }
  if (part.note) children.push(el('p', { className: 'part-note' }, part.note));
  if (part.guessed) {
    children.push(el('p', { className: 'part-guessed' }, 'Guessed from the drawing. Add it to forge-project.json to describe it.'));
  }

  const x = o.extras || {};
  if (x.solderedAt) children.push(el('p', { className: 'part-soldered-at' }, x.solderedAt));
  if (x.bands) children.push(bandsPicture(x.bands));
  if (x.code) children.push(el('p', { className: 'part-code' }, `Printed on it: ${x.code} (${part.value})`));
  if (x.polarity) children.push(polarityPicture(x.polarity));
  if (x.library && x.library.polarity) children.push(el('p', { className: 'part-library-polarity' }, x.library.polarity));
  if (x.library) {
    children.push(el('details', { id: 'part-howto' },
      el('summary', {}, `How to use it: ${x.library.name}`),
      el('p', {}, x.library.howTo),
      el('p', { className: 'hint' }, `From the Bench library. Source: ${x.library.source}.`)));
  }
  if (o.step) children.push(el('p', { className: 'part-step' }, `Step ${o.step.number} of ${o.step.total}: ${o.step.title}`));
  if (o.step && o.step.onNext) {
    const next = el('button', { id: 'part-next-in-step', type: 'button', 'data-focus': 'next-in-step' }, `Next part in this step: ${o.step.next}`);
    next.addEventListener('click', o.step.onNext);
    children.push(next);
  }
  if (o.where) {
    const pins = [...o.where.pins].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
    const at = ([pin, [c, r]]) => `pin ${pin} at ${c},${r}`;
    const holes = pins.length > 6 ? `${pins.length} pins, ${at(pins[0])}` : pins.map(at).join(' · ');
    const under = o.where.side === 'bottom' ? ' · Underneath the board' : '';
    children.push(el('p', { className: 'part-where' }, `Where (sheet 4): ${holes}${under}`));
    if (o.where.body) children.push(el('p', { className: 'part-standing' }, `Standing: body over pin ${o.where.body}`));
    else if (o.where.mount === 'flat') children.push(el('p', { className: 'part-flat' }, 'Lies flat on the board'));
  }
  if (o.looks) children.push(looksBlock(o.looks));
  if (o.offBoard) children.push(el('p', { className: 'part-offboard' }, 'Not on the board (wired to it).'));
  if (o.connections && o.connections.length) {
    const list = el('ul', { className: 'part-connections' });
    for (const c of o.connections) {
      const line = el('li', {});
      if (o.wired && c.others.length) {
        const key = wireKey(part.ref, c.pin);
        const box = el('input', { type: 'checkbox', 'data-wire': key, 'data-focus': `wire-${key}`, 'aria-label': `pin ${c.pin} wired` });
        box.checked = o.wired.has(key);
        box.addEventListener('change', () => o.onWire(key, box.checked));
        line.append(box); // spaced by CSS, so the line's text stays "pin 2 → …"
      }
      line.append(`pin ${c.pin} → ${c.label}`);
      if (!c.others.length) {
        line.append(' (nothing else)');
      } else {
        line.append(': ');
        c.others.slice(0, 8).forEach(([ref, pin], i) => {
          if (i) line.append(', ');
          const button = el('button', { type: 'button', className: 'part-link' }, `${ref} ${pin}`);
          button.addEventListener('click', () => o.onPart(ref));
          line.append(button);
        });
        if (c.others.length > 8) line.append(` … and ${c.others.length - 8} more`);
      }
      list.append(line);
    }
    children.push(el('p', { className: 'part-sheets-label' }, 'Connects to:'), list);
    if (o.pins) {
      const show = el('button', { id: 'part-pins', type: 'button', 'aria-expanded': String(o.pins.open), 'data-focus': 'pins' },
        o.pins.open ? 'Hide pins' : 'Show pins');
      show.addEventListener('click', o.pins.onToggle);
      children.push(show);
      if (o.pins.open) children.push(renderPinView(part.ref, o.connections, o));
    }
    if (o.wired) {
      const left = stillToWire(part.ref, o.connections, o.wired);
      children.push(el('p', { className: 'part-unwired' }, left.length
        ? `Still to wire: ${left.length === 1 ? 'pin' : 'pins'} ${left.join(', ')}`
        : 'All its pins are wired.'));
      if (left.length && x.onWireAll) {
        const all = el('button', { id: 'part-wire-all', type: 'button', 'data-focus': 'wire-all' }, 'Mark all its pins wired');
        all.addEventListener('click', x.onWireAll);
        children.push(all);
      }
    }
  }

  if (o.myBoard && o.myBoard.lineUp) {
    const lineUp = el('button', { id: 'part-line-up', type: 'button', 'data-focus': 'line-up' }, 'Line up a photo');
    lineUp.addEventListener('click', o.myBoard.lineUp);
    children.push(el('p', { className: 'part-myboard' }, 'Your board: this part lines up your photos. Open a photo of your board and tap its pins 1 and 14.'),
      el('div', { className: 'part-actions' }, lineUp));
  } else if (o.myBoard) {
    const m = o.myBoard;
    const line = el('p', { className: 'part-myboard' }, m.anchor ? 'Your board: this part lines up your photos.' : m.placed ? 'Placed on your board.' : "Not on your board's photos yet.");
    const buttons = el('div', { className: 'part-actions' });
    if (m.placed || m.anchor) {
      const show = el('button', { id: 'part-show-photo', type: 'button', 'data-focus': 'show-photo' }, 'Show on photo');
      show.addEventListener('click', m.onShow);
      buttons.append(show);
    }
    if (!m.anchor) {
      const place = el('button', { id: 'part-place', type: 'button', 'data-focus': 'place' }, m.placed ? 'Place again' : 'Place on my board');
      place.addEventListener('click', m.onPlace);
      buttons.append(place);
      if (m.onSuggest) {
        const suggest = el('button', { id: 'part-suggest', type: 'button', 'data-focus': 'suggest', title: 'Bench finds free holes close to what it connects to' }, 'Suggest a spot');
        suggest.addEventListener('click', m.onSuggest);
        buttons.append(suggest);
      }
    }
    if (m.placed && !m.anchor) {
      const off = el('button', { id: 'part-unplace', type: 'button', 'data-focus': 'unplace' }, 'Take off my board');
      off.addEventListener('click', m.onUnplace);
      buttons.append(off);
    }
    children.push(line);
    if (m.where) children.push(el('p', { id: 'part-where', className: 'part-myboard' }, m.where));
    children.push(buttons);
  }

  if (o.ownNote) {
    const note = el('textarea', { id: 'part-own-note', rows: '2', placeholder: 'For example: used a 4.7k here', 'data-focus': 'own-note' });
    note.value = drafts['part-own-note'] ?? o.ownNote.text;
    note.addEventListener('change', () => o.ownNote.onSave(note.value));
    children.push(el('label', { for: 'part-own-note', className: 'part-own-note-label' }, 'Your note'), note);
  }

  const actions = el('div', { className: 'part-actions' });
  if (x.sameValue) {
    const same = el('button', { id: 'part-tick-value', type: 'button', 'data-focus': 'tick-value' }, `Tick all ${x.sameValue.count} × ${x.sameValue.value}`);
    same.addEventListener('click', x.sameValue.onTick);
    actions.append(same);
  }
  if (x.onCopy) {
    const copy = el('button', { id: 'part-copy', type: 'button', 'data-focus': 'copy', title: 'Copy the part and its value' }, 'Copy');
    copy.addEventListener('click', x.onCopy);
    actions.append(copy);
  }
  if (x.onLink) {
    const link = el('button', { id: 'part-link', type: 'button', 'data-focus': 'link', title: 'A link that opens Bench right at this part' }, 'Copy link');
    link.addEventListener('click', x.onLink);
    actions.append(link);
  }
  if (x.searchHref) {
    actions.append(el('a', { id: 'part-search', className: 'button-link', href: x.searchHref, target: '_blank', rel: 'noopener noreferrer',
      title: 'Opens a web search for this part in a new tab' }, 'Search the web'));
  }
  if (x.onPrev || x.onNext) {
    const prev = el('button', { id: 'part-prev', type: 'button', 'data-focus': 'prev', title: 'Previous part (,)' }, '← Previous part');
    prev.addEventListener('click', x.onPrev);
    const next = el('button', { id: 'part-next', type: 'button', 'data-focus': 'next', title: 'Next part (.)' }, 'Next part →');
    next.addEventListener('click', x.onNext);
    children.push(el('div', { className: 'part-nav' }, prev, next));
  }
  if (o.datasheetHref) {
    actions.append(el('a', { id: 'part-datasheet', className: 'button-link', href: o.datasheetHref, target: '_blank', rel: 'noopener noreferrer' }, 'Datasheet'));
  }
  if (o.onTick) {
    const tick = el('button', { id: 'part-tick', type: 'button', 'aria-pressed': String(Boolean(o.ticked)) },
      o.ticked ? 'Soldered ✓' : 'Mark soldered');
    tick.addEventListener('click', o.onTick);
    actions.append(tick);
  }
  let askBox = null;
  if (o.ask) {
    const question = el('textarea', { id: 'ask-question', rows: '2', placeholder: o.ask.placeholder });
    question.value = drafts['ask-question'] ?? '';
    const done = el('span', { id: 'ask-done', 'aria-live': 'polite' });
    const say = (ok) => { done.textContent = ok ? 'Copied' : "Couldn't copy: allow the clipboard, or select the text and copy it."; };
    const copy = el('button', { id: 'ask-copy', type: 'button' }, 'Copy for Claude');
    copy.addEventListener('click', async () => say(await o.ask.onCopy(question.value)));
    const open = el('button', { id: 'ask-open', type: 'button' }, 'Open claude.ai');
    open.addEventListener('click', async () => say(await o.ask.onOpen(question.value)));
    askBox = el('div', { className: 'ask-box' },
      el('label', { for: 'ask-question' }, 'Ask Claude about this part'), question,
      el('div', { className: 'ask-actions' }, copy, open, done));
    const ask = el('button', { id: 'part-ask', type: 'button' }, 'Ask Claude');
    ask.addEventListener('click', () => question.focus());
    actions.append(ask);
  }
  const close = el('button', { id: 'part-close', type: 'button' }, 'Close');
  close.addEventListener('click', o.onClose);
  actions.append(close);
  children.push(actions);
  if (askBox) children.push(askBox);

  if (o.sheetsWithPart.length) {
    const list = el('div', { className: 'part-sheets' });
    for (const sheet of o.sheetsWithPart) {
      const button = el('button', { type: 'button' }, sheet.label);
      button.addEventListener('click', () => o.onSheet(sheet.id));
      list.append(button);
    }
    children.push(el('p', { className: 'part-sheets-label' }, 'On sheets:'), list);
  }
  keepFocus(container, () => container.replaceChildren(...children), '#part-tick');
}


/**
 * The build steps (board-view design §5): the list, and the open step with its why, its parts,
 * Back / Next and "Tick all in this step".
 */
/** Adjust steps (0.8 design §3): every step with up, down and skip; add your own; back to the project's. */
function adjustSteps(a, drafts) {
  const list = el('ol', { className: 'steps-adjust' });
  a.all.forEach((step, i) => {
    const item = el('li', { 'data-step': step.id, className: step.skipped ? 'skipped' : '' },
      el('span', { className: 'adjust-title' }, step.title, step.own ? el('span', { className: 'hint' }, ' (yours)') : ''));
    const button = (cls, label, aria, run, disabled = false) => {
      const b = el('button', { type: 'button', className: cls, 'aria-label': aria, 'data-focus': `${cls}-${step.id}` }, label);
      b.disabled = disabled;
      b.addEventListener('click', run);
      return b;
    };
    const tools = el('span', { className: 'adjust-tools' },
      button('step-up', '↑', `Move ${step.title} up`, () => a.onMove(step.id, -1), i === 0),
      button('step-down', '↓', `Move ${step.title} down`, () => a.onMove(step.id, 1), i === a.all.length - 1));
    if (step.own) tools.append(button('step-remove', 'Take out', `Take out ${step.title}`, () => a.onRemove(step.id)));
    else tools.append(button('step-skip', step.skipped ? 'Bring back' : 'Skip', `${step.skipped ? 'Bring back' : 'Skip'} ${step.title}`, () => a.onSkip(step.id, !step.skipped)));
    item.append(tools);
    list.append(item);
  });
  const title = el('input', { id: 'own-step-title', type: 'text', maxlength: '120', placeholder: 'Title, like "Test the 5 V rail"', 'data-focus': 'own-step-title' });
  const body = el('textarea', { id: 'own-step-text', rows: '2', maxlength: '1000', placeholder: 'What to do (optional)', 'data-focus': 'own-step-text' });
  title.value = drafts.title || '';
  body.value = drafts.text || '';
  const add = el('button', { id: 'own-step-add', type: 'button', 'data-focus': 'own-step-add' }, 'Add this step');
  add.addEventListener('click', () => {
    if (!a.onAdd(title.value, body.value)) title.focus();
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') add.click(); });
  const form = el('div', { className: 'own-step' },
    el('label', { for: 'own-step-title' }, a.after ? `Add your own step after "${a.after}"` : 'Add your own step at the end'),
    title, body, add);
  const parts = [el('p', { className: 'hint' }, 'Move steps into the order you build in, skip what you don\'t need, or add your own.'), list, form];
  if (a.changed) {
    const reset = el('button', { id: 'steps-reset', type: 'button', 'data-focus': 'steps-reset' }, "Back to the project's steps");
    reset.addEventListener('click', a.onReset);
    parts.push(reset);
  }
  return parts;
}

export function renderSteps(container, steps, o) {
  // a step note being typed survives a redraw (only while you're in it, so undo shows what it brings back)
  const typing = container.querySelector('#step-note');
  const stepDraft = typing && document.activeElement === typing ? typing.value : null;
  // so does a step of your own being written (it's only kept once added)
  const ownDrafts = { title: container.querySelector('#own-step-title')?.value, text: container.querySelector('#own-step-text')?.value };
  const a = o.adjust;
  if (!steps.length && !(a && a.all.length)) {
    container.replaceChildren();
    return;
  }
  const adjustButton = a ? el('button', { id: 'steps-adjust', type: 'button', 'aria-pressed': String(a.on), 'data-focus': 'steps-adjust' }, a.on ? 'Done adjusting' : 'Adjust steps') : null;
  if (adjustButton) adjustButton.addEventListener('click', a.onToggle);
  if (a && a.on) {
    keepFocus(container, () => container.replaceChildren(el('div', { className: 'steps-head' }, el('h2', {}, 'Build steps'), adjustButton), ...adjustSteps(a, ownDrafts)), '#steps-adjust');
    return;
  }
  const list = el('ol', { className: 'steps-list' });
  let doneCount = 0;
  steps.forEach((step, i) => {
    const open = el('button', { type: 'button', 'aria-current': String(i === o.current), 'data-focus': `step-${i}` }, step.title);
    open.addEventListener('click', () => o.onOpen(i));
    const item = el('li', {}, open);
    if (o.isDone(step, i)) {
      doneCount++;
      item.append(' ', el('span', { className: 'step-check', 'aria-label': 'done' }, '✓'));
    }
    const found = step.parts.filter((r) => !step.missing.includes(r)).length;
    if (found) item.append(el('span', { className: 'step-count' }, ` ${o.doneIn(step)} of ${found} soldered`));
    list.append(item);
  });
  const skippedCount = a ? a.all.filter((s) => s.skipped).length : 0;
  const head = el('div', { className: 'steps-head' }, el('h2', {}, 'Build steps'));
  if (adjustButton) head.append(adjustButton);
  const children = [head, el('p', { className: 'steps-done progress-text' }, `${doneCount} of ${steps.length} steps done${skippedCount ? ` · ${skippedCount} skipped` : ''}`), list];
  const step = o.current !== null ? steps[o.current] : null;
  if (step) {
    const box = el('div', { className: 'step-open' },
      el('p', { className: 'step-title' }, `Step ${o.current + 1} of ${steps.length}: ${step.title}`));
    if (step.why) box.append(el('p', { className: 'step-why' }, step.why));
    const what = o.whatText(step);
    if (what) box.append(el('p', { className: 'step-what' }, what));
    const found = step.parts.filter((r) => !step.missing.includes(r));
    if (found.length) {
      const parts = el('div', { className: 'step-parts' });
      for (const ref of found) {
        const b = el('button', { type: 'button', className: 'part-link', 'data-focus': `part-${ref}` }, ref);
        b.addEventListener('click', () => o.onPart(ref));
        parts.append(b);
      }
      box.append(parts);
    }
    if (step.missing.length) box.append(el('p', { className: 'step-missing' }, `Not in this project: ${step.missing.join(', ')}`));
    const back = el('button', { type: 'button', id: 'step-back', 'data-focus': 'back' }, '← Back');
    back.disabled = o.current === 0;
    back.addEventListener('click', () => o.onOpen(o.current - 1));
    const next = el('button', { type: 'button', id: 'step-next', 'data-focus': 'next' }, 'Next →');
    next.disabled = o.current === steps.length - 1;
    next.addEventListener('click', () => o.onOpen(o.current + 1));
    const nav = el('div', { className: 'step-nav' }, back, next);
    if (!found.length) {
      const doneBox = el('input', { type: 'checkbox', id: 'step-done', 'data-focus': 'step-done' });
      doneBox.checked = o.isDone(step, o.current);
      doneBox.addEventListener('change', () => o.onMarkDone(o.current, doneBox.checked));
      nav.append(el('label', { className: 'check' }, doneBox, ' Done'));
    }
    if (o.on3D) {
      const show = el('button', { type: 'button', id: 'step-3d', 'data-focus': 'step-3d' }, 'Show in 3D');
      show.addEventListener('click', o.on3D);
      nav.append(show);
    }
    if (found.length) {
      const all = el('button', { type: 'button', id: 'step-tick-all', 'data-focus': 'tick-all' }, 'Tick all in this step');
      all.addEventListener('click', () => o.onTickAll(o.current));
      nav.append(all);
    }
    box.append(nav);
    if (o.extras) {
      const x = o.extras;
      if (x.joints) box.append(el('p', { className: 'step-joints hint' }, `About ${x.joints} solder joints in this step.`));
      const note = el('textarea', { id: 'step-note', rows: '2', placeholder: 'Your note on this step', 'data-focus': 'step-note' });
      note.value = stepDraft ?? (x.note || '');
      note.addEventListener('change', () => x.onNote(note.value));
      const print = el('button', { type: 'button', id: 'step-print', 'data-focus': 'step-print' }, 'Print this step');
      print.addEventListener('click', x.onPrint);
      const auto = el('input', { type: 'checkbox', id: 'steps-auto', 'data-focus': 'steps-auto' });
      auto.checked = x.auto;
      auto.addEventListener('change', () => x.onAuto(auto.checked));
      box.append(el('label', { for: 'step-note', className: 'part-own-note-label' }, 'Your note'), note,
        el('div', { className: 'step-extras' }, print, el('label', { className: 'check' }, auto, ' Next step by itself when this one is done')));
    }
    box.append(el('p', { className: 'hint' }, 'Space: next step · Shift+Space: back'));
    children.push(box);
  }
  // the panel is rebuilt on every change: the keyboard focus goes back where it was
  keepFocus(container, () => container.replaceChildren(...children),
    '#step-next:not(:disabled), #step-back:not(:disabled), .steps-list button[aria-current="true"], button');
}

/**
 * Your board (0.4 design F3): which side the photo shows, lining it up, and what's happening now.
 * o: { photoLabel, side, lined, status, busy, bright, placedCount, partCount, onSide(side), onLine(), onStop(), onBright(on) }
 */
export function renderMyBoard(container, o) {
  const sideButton = (id, value, text) => {
    const b = el('button', { id, type: 'button', 'aria-pressed': String(o.side === value), 'data-focus': id }, text);
    b.addEventListener('click', () => o.onSide(value));
    return b;
  };
  const line = el('button', { id: 'myboard-line', type: 'button', 'data-focus': 'line' }, o.lined ? 'Line up again' : 'Line it up');
  line.addEventListener('click', o.onLine);
  const actions = el('div', { className: 'myboard-actions' }, line);
  if (o.busy) {
    const stop = el('button', { id: 'myboard-stop', type: 'button', 'data-focus': 'stop' }, 'Stop');
    stop.addEventListener('click', o.onStop);
    actions.append(stop);
  }
  const bright = el('input', { type: 'checkbox', id: 'myboard-bright', 'data-focus': 'bright' });
  bright.checked = o.bright;
  bright.addEventListener('change', () => o.onBright(bright.checked));
  actions.append(el('label', { className: 'check' }, bright, ' Brighter'));
  const status = el('p', { id: 'myboard-status', className: o.busy ? 'busy' : '', 'aria-live': 'polite' }, o.status);
  const children = [
    el('h2', {}, 'Your board'),
    el('p', { className: 'hint' }, `This photo: ${o.photoLabel}`),
    el('div', { className: 'myboard-sides', role: 'group', 'aria-label': 'This photo shows' }, el('span', {}, 'It shows:'),
      sideButton('myboard-top', 'top', 'Top'), sideButton('myboard-under', 'bottom', 'Underneath')),
    actions,
    status,
    el('p', { className: 'hint' }, `${o.placedCount} of ${o.partCount} board parts placed. Place a part from its card, or drag a selected part to move it.`),
  ];
  if (o.lined) {
    const x = o.more;
    const check = (id, label, on, fn) => {
      const box = el('input', { type: 'checkbox', id, 'data-focus': id });
      box.checked = on;
      box.addEventListener('change', () => fn(box.checked));
      return el('label', { className: 'check' }, box, ` ${label}`);
    };
    const size = el('select', { id: 'myboard-size', 'data-focus': 'size', 'aria-label': 'Mark size' });
    for (const [value, text] of [['small', 'Small marks'], ['medium', 'Medium marks'], ['large', 'Large marks']]) {
      const opt = el('option', { value }, text);
      opt.selected = value === x.size;
      size.append(opt);
    }
    size.addEventListener('change', () => x.onSize(size.value));
    const next = el('button', { id: 'myboard-next', type: 'button', 'data-focus': 'next' }, 'Next part to place');
    next.addEventListener('click', x.onNext);
    const suggest = el('button', { id: 'myboard-suggest-next', type: 'button', 'data-focus': 'suggest-next', title: 'For the open part if it is not placed, else the next one' }, 'Suggest a spot');
    suggest.addEventListener('click', x.onSuggest);
    const clear = el('button', { id: 'myboard-clear', type: 'button', 'data-focus': 'clear' }, x.clearArmed ? 'Click again to clear' : 'Clear my board');
    clear.addEventListener('click', x.onClear);
    children.push(
      el('div', { className: 'myboard-actions' }, check('myboard-marks', 'Marks', x.marks, x.onMarks), size,
        check('myboard-linelabels', 'Line labels', x.lineLabels, x.onLineLabels), check('myboard-wires', 'Suggested wires', x.wires, x.onWires)),
      el('div', { className: 'myboard-actions' }, next, suggest, clear));
    if (x.suggest) {
      const s = x.suggest;
      const use = el('button', { id: 'suggest-use', type: 'button', className: 'primary', 'data-focus': 'suggest-use' }, 'Use this spot');
      use.addEventListener('click', s.onUse);
      const row = el('div', { className: 'myboard-actions' }, use);
      if (s.more) {
        const another = el('button', { id: 'suggest-another', type: 'button', 'data-focus': 'suggest-another' }, 'Another spot');
        another.addEventListener('click', s.onAnother);
        row.append(another);
      }
      const stop = el('button', { id: 'suggest-stop', type: 'button', 'data-focus': 'suggest-stop' }, 'Stop');
      stop.addEventListener('click', s.onStop);
      row.append(stop);
      const box = el('div', { id: 'myboard-suggest', className: 'suggest-box' },
        el('p', {}, el('strong', {}, s.title), s.reason ? `: ${s.reason}.` : '.'));
      if (s.legs) box.append(el('p', { className: 'hint' }, s.legs));
      box.append(row, el('p', { className: 'hint' }, 'Shown dashed on the photo. Esc stops.'));
      children.push(box);
    }
    if (x.stepTodo) children.push(el('p', { id: 'myboard-step-todo', className: 'hint' }, x.stepTodo));
    if (x.wires && x.routes.length) {
      const list = el('ul', { id: 'myboard-routes' });
      for (const g of x.routes) {
        const shape = el('select', { 'aria-label': `Wire shape for ${g.label}`, 'data-focus': `route-${g.net}` });
        for (const [value, text] of [['cols', 'along, then down'], ['rows', 'down, then along'], ['straight', 'straight']]) {
          const opt = el('option', { value }, text);
          opt.selected = value === g.shape;
          shape.append(opt);
        }
        shape.addEventListener('change', () => x.onRoute(g.net, shape.value, g.label));
        list.append(el('li', { 'data-net': g.net }, el('strong', {}, g.label), ' ', shape,
          el('ul', {}, ...g.texts.map((t) => el('li', {}, t)))));
      }
      children.push(el('h3', {}, 'Suggested wires underneath'), list);
    }
    const findings = el('ul', { id: 'myboard-check' });
    for (const f of x.findings) {
      const show = el('button', { type: 'button', className: 'part-link' }, `Show ${f.refs[0]}`);
      show.addEventListener('click', () => x.onShow(f.refs[0]));
      findings.append(el('li', { 'data-kind': f.kind, className: `finding-${f.level}` }, f.text, ' ', show));
    }
    children.push(el('h3', {}, 'Check my board'), x.findings.length ? findings : el('p', { id: 'myboard-check' }, 'No problems found.'));
    if (x.labels) children.push(...holeNamesBlock(container, x.labels));
  }
  if (o.onSaveFile) {
    const save = el('button', { id: 'myboard-save', type: 'button', 'data-focus': 'myboard-save', title: 'Line-ups, placements, wire shapes and hole names. The photos stay in your folder.' }, 'Save my board as file');
    save.addEventListener('click', o.onSaveFile);
    const input = el('input', { id: 'myboard-open', type: 'file', accept: '.json,application/json', className: 'visually-hidden' });
    input.addEventListener('change', () => o.onOpenFile(input));
    children.push(el('div', { className: 'myboard-actions myboard-file' }, save, el('label', { className: 'button-like' }, 'Open a board file', input)));
  }
  keepFocus(container, () => container.replaceChildren(...children), '#myboard-line');
}

/**
 * Hole names like your board's (0.6 design §1): a form for what's printed by three of the anchor's
 * pins. What's typed survives the panel being redrawn while the form is open.
 */
function holeNamesBlock(container, h) {
  const heading = el('h3', {}, 'Hole names');
  if (h.unavailable) return [heading, el('p', { className: 'hint' }, h.unavailable)];
  if (!h.editing) {
    const edit = el('button', { id: 'hn-edit', type: 'button', 'data-focus': 'hn-edit' }, h.on ? 'Change hole names' : 'Name the holes like my board');
    edit.addEventListener('click', h.onEdit);
    const row = el('div', { className: 'myboard-actions' }, edit);
    if (h.on) {
      const off = el('button', { id: 'hn-off', type: 'button', 'data-focus': 'hn-off' }, 'Turn hole names off');
      off.addEventListener('click', h.onOff);
      row.append(off);
    }
    return [heading, el('p', { id: 'hn-summary', className: 'hint' }, h.on ? h.summary
      : 'Boards print a letter and a number by each hole, like L21. Type three and Bench names every hole.'), row];
  }
  const typed = (id, fallback) => {
    const old = container.querySelector(`#${id}`);
    return old ? old.value : fallback;
  };
  const field = (id, label, value, placeholder) => {
    const input = el('input', { id, type: 'text', maxlength: '8', autocomplete: 'off', spellcheck: 'false', placeholder, 'data-focus': id });
    input.value = typed(id, value);
    return el('label', { className: 'hn-field', for: id }, el('span', {}, label), input);
  };
  const form = el('form', { id: 'hn-form', className: 'hn-form' },
    el('p', { className: 'hint' }, `Look at your board and type what's printed by these three holes. ${h.pins[0]} is the pin by the notch.`),
    field('hn-a', h.pins[0], h.values[0], 'L21'),
    field('hn-b', h.pins[1], h.values[1], 'L8'),
    field('hn-c', h.pins[2], h.values[2], 'O21'),
    field('hn-skip', 'Letters it skips (if any)', h.skip, 'like I'));
  const use = el('button', { id: 'hn-use', type: 'submit', className: 'primary', 'data-focus': 'hn-use' }, 'Use these names');
  const cancel = el('button', { id: 'hn-cancel', type: 'button', 'data-focus': 'hn-cancel' }, 'Cancel');
  cancel.addEventListener('click', h.onCancel);
  form.append(el('div', { className: 'myboard-actions' }, use, cancel));
  if (h.why) form.append(el('p', { id: 'hn-why', className: 'finding-problem', role: 'alert' }, h.why));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (id) => form.querySelector(`#${id}`).value;
    h.onUse([value('hn-a'), value('hn-b'), value('hn-c')], value('hn-skip'));
  });
  return [heading, form];
}

/** Before power (0.4 improvement 30): meter checks to tick. o: { checks: [{ id, text }], done: Set, onCheck(id, on) } */
export function renderChecks(container, o) {
  if (!o.checks.length) {
    container.replaceChildren();
    return;
  }
  const list = el('ul', { className: 'checks-list' });
  for (const c of o.checks) {
    const box = el('input', { type: 'checkbox', 'data-check': c.id, 'data-focus': `check-${c.id}` });
    box.checked = o.done.has(c.id);
    box.addEventListener('change', () => o.onCheck(c.id, box.checked));
    list.append(el('li', {}, el('label', {}, box, ` ${c.text}`)));
  }
  keepFocus(container, () => container.replaceChildren(
    el('h2', {}, 'Before power'),
    el('p', { className: 'hint' }, 'Do these with a multimeter before the chip goes in its socket.'),
    list,
  ));
}

/**
 * The guided continuity test (0.5 big improvement B6).
 * o: { summary, results, onAnswer(test, beeped), onSkip(), onShow(ref), onRetry(id), onReset(), faultText(test) }
 */
export function renderContinuity(container, o) {
  const { summary } = o;
  if (!summary.total) {
    container.replaceChildren();
    return;
  }
  const bar = el('progress', { max: String(summary.total) });
  bar.value = summary.done;
  const children = [
    el('h2', {}, 'Continuity test'),
    el('p', { className: 'progress-text' }, `${summary.done} of ${summary.total} done · ${summary.faults.length} ${summary.faults.length === 1 ? 'fault' : 'faults'}`),
    bar,
    el('p', { className: 'hint' }, 'Power off, meter on beep. Put one probe on each leg it names, then say what the meter did.'),
  ];
  const t = summary.next;
  if (t) {
    const beeped = el('button', { id: 'cont-beeped', type: 'button', className: 'primary', 'data-focus': 'beeped' }, 'Beeped');
    beeped.addEventListener('click', () => o.onAnswer(t, true));
    const silent = el('button', { id: 'cont-silent', type: 'button', 'data-focus': 'silent' }, 'No beep');
    silent.addEventListener('click', () => o.onAnswer(t, false));
    const skip = el('button', { id: 'cont-skip', type: 'button', 'data-focus': 'skip' }, 'Skip');
    skip.addEventListener('click', o.onSkip);
    const show = el('button', { id: 'cont-show', type: 'button', 'data-focus': 'show' }, `Show ${t.a.ref}`);
    show.addEventListener('click', () => o.onShow(t.a.ref));
    children.push(el('div', { id: 'continuity-now', 'data-kind': t.kind },
      el('p', { className: 'cont-pair' }, el('strong', {}, t.a.text), ' and ', el('strong', {}, t.b.text)),
      el('p', { className: 'cont-expect' }, t.kind === 'beep' ? `It should beep: both are on ${t.line}.` : 'It must not beep: neighbouring pins on different lines.'),
      el('div', { className: 'cont-actions' }, beeped, silent, skip, show)));
  } else {
    children.push(el('p', { id: 'continuity-done' }, summary.faults.length ? 'Every pair tested. Fix the faults below, then test them again.' : 'Every pair tested, no faults.'));
  }
  if (summary.faults.length) {
    const list = el('ul', { id: 'continuity-faults' });
    for (const f of summary.faults) {
      const show = el('button', { type: 'button', className: 'part-link' }, `Show ${f.a.ref}`);
      show.addEventListener('click', () => o.onShow(f.a.ref));
      const again = el('button', { type: 'button', className: 'cont-retry' }, 'Test again');
      again.addEventListener('click', () => o.onRetry(f.id));
      list.append(el('li', {}, o.faultText(f), ' ', show, ' ', again));
    }
    children.push(el('h3', {}, 'Faults'), list);
  }
  const reset = el('button', { id: 'cont-reset', type: 'button' }, 'Start the test again');
  reset.addEventListener('click', o.onReset);
  children.push(reset);
  keepFocus(container, () => container.replaceChildren(...children), '#cont-beeped, #cont-reset');
}

// ---- the pin view (0.4 design F2) ----
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
const shorten = (s, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A chip or header drawn pin by pin, seen from the top or underneath; clicking a pin shows its line. */
function renderPinView(ref, connections, o) {
  const { layout, side, selected, onSide, onPin, names = {} } = o.pins;
  const hasNames = Object.keys(names).length > 0;
  const byPin = new Map(connections.map((c) => [c.pin, c]));
  const ROW = 22;
  const top = 26;
  const dip = layout.kind === 'dip';
  const bodyX = dip ? 120 : 70;
  const bodyW = dip ? (hasNames ? 104 : 70) : 26;
  const height = top + layout.rows * ROW + 8;
  const drawing = svg('svg', { viewBox: `0 0 310 ${height}`, width: '100%', role: 'group', 'aria-label': `${ref} pins` });
  drawing.append(svg('rect', { class: 'pin-body', x: bodyX, y: top - 10, width: bodyW, height: layout.rows * ROW + 4, rx: 4 }));
  if (dip) drawing.append(svg('path', { class: 'pin-notch', d: `M ${bodyX + bodyW / 2 - 9} ${top - 10} a 9 9 0 0 0 18 0` }));
  for (const p of layout.pins) {
    const conn = byPin.get(p.pin);
    const label = conn ? conn.label : '';
    const kind = !conn ? 'none' : isGroundLabel(label, conn.net) ? 'ground' : isPowerLabel(label) ? 'power' : 'signal';
    const key = wireKey(ref, p.pin);
    const wired = Boolean(conn && o.wired && o.wired.has(key));
    const x = p.col === 0 ? bodyX : bodyX + bodyW;
    const y = top + p.row * ROW;
    const g = svg('g', {
      class: `pin pin-${kind}${selected === p.pin ? ' pin-selected' : ''}`, 'data-pin': p.pin, 'data-wired': String(wired),
      tabindex: '0', role: 'button', 'data-focus': `pin-${p.pin}`,
      'aria-label': `pin ${p.pin}${label ? `, ${label}` : ', not connected'}${conn && o.wired ? (wired ? ', wired' : ', not wired') : ''}`,
    });
    const outward = p.labelSide === 'left' ? -1 : 1;
    // the whole row on its side is clickable, not just the thin leg and the text
    const hitX = outward < 0 ? 0 : x - bodyW / 2;
    g.append(svg('rect', { class: 'pin-hit', x: hitX, y: y - ROW / 2, width: outward < 0 ? x + bodyW / 2 : 310 - hitX, height: ROW }));
    g.append(svg('line', { class: 'pin-leg', x1: x, y1: y, x2: x + outward * 14, y2: y }));
    if (conn && o.wired) g.append(svg('circle', { class: 'pin-dot', cx: x + outward * 14, cy: y, r: 4, 'data-filled': String(wired) }));
    g.append(svg('text', { class: 'pin-number', x: x - outward * 4, y: y + 4, 'text-anchor': outward < 0 ? 'start' : 'end' }, p.pin));
    if (names[p.pin]) {
      g.append(svg('text', { class: 'pin-name', x: x - outward * 20, y: y + 4, 'text-anchor': outward < 0 ? 'start' : 'end' }, names[p.pin].split(' ')[0]));
    }
    if (label) g.append(svg('text', { class: 'pin-label', x: x + outward * 22, y: y + 4, 'text-anchor': outward < 0 ? 'end' : 'start' }, shorten(label)));
    const pick = () => onPin(p.pin);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    drawing.append(g);
  }
  const sideButton = (id, value, text) => {
    const b = el('button', { id, type: 'button', 'aria-pressed': String(side === value), 'data-focus': id }, text);
    b.addEventListener('click', () => onSide(value));
    return b;
  };
  const caption = side === 'bottom'
    ? 'Seen from underneath: the two rows swap sides. Count from the notch end.'
    : 'Seen from the top, notch at the top: pin 1 is top left.';
  const box = el('div', { id: 'pin-view' },
    el('div', { className: 'pin-sides' }, sideButton('pins-top', 'top', 'Top'), sideButton('pins-under', 'bottom', 'Underneath')),
    el('p', { className: 'pin-caption hint' }, dip ? caption : (side === 'bottom' ? 'Seen from underneath.' : 'Seen from the top.')),
    drawing);
  const conn = selected ? byPin.get(selected) : null;
  if (selected) {
    const info = el('p', { id: 'pin-info' });
    if (conn) {
      info.append(`pin ${selected} → ${conn.label}: ${conn.others.length ? conn.others.map(([r, pin]) => `${r} ${pinText(pin)}`).join(', ') : 'nothing else'}`);
      if (o.wired && conn.others.length) {
        const key = wireKey(ref, selected);
        const tick = el('input', { type: 'checkbox', 'data-wire': key, 'data-focus': `pininfo-${key}` });
        tick.checked = o.wired.has(key);
        tick.addEventListener('change', () => o.onWire(key, tick.checked));
        info.append(' ', el('label', {}, tick, ' wired'));
      }
    } else {
      info.append(`pin ${selected}: not connected to anything.`);
    }
    box.append(info);
    if (names[selected]) box.append(el('p', { id: 'pin-name', className: 'hint' }, `Pin ${selected} is ${names[selected]} (from the Bench library).`));
  }
  return box;
}

/** The colour bands of a resistor, drawn. */
function bandsPicture(bands) {
  const pic = svg('svg', { viewBox: '0 0 160 30', width: '160', height: '30', role: 'img', 'aria-label': `Colour bands: ${bands.join(' ')}` });
  pic.append(svg('line', { x1: 0, y1: 15, x2: 160, y2: 15, stroke: '#b9bec4', 'stroke-width': 3 }));
  pic.append(svg('rect', { x: 40, y: 5, width: 80, height: 20, rx: 9, fill: '#d9c39a', stroke: '#8b7a5a' }));
  [52, 64, 76, 104].forEach((bx, i) => pic.append(svg('rect', { class: 'band', x: bx, y: 5, width: 7, height: 20, fill: BAND_HEX[bands[i]] })));
  return el('div', { id: 'part-bands' }, pic, el('span', { className: 'bands-text' }, bands.join(' ')));
}

/** Which way round, drawn: an electrolytic's stripe, a diode's band, an LED's long leg and flat side. */
function polarityPicture(kind) {
  const pic = svg('svg', { viewBox: '0 0 200 60', width: '200', height: '60', role: 'img' });
  const text = (x, y, t, anchor = 'middle') => pic.append(svg('text', { x, y, 'text-anchor': anchor, class: 'pol-text' }, t));
  if (kind === 'electrolytic') {
    pic.setAttribute('aria-label', 'Electrolytic: the stripe side is minus, the long leg is plus');
    pic.append(svg('rect', { x: 60, y: 4, width: 80, height: 34, rx: 6, fill: '#1d3557' }));
    pic.append(svg('rect', { x: 118, y: 4, width: 16, height: 34, fill: '#cfd6dd' }));
    text(126, 26, '−');
    pic.append(svg('line', { x1: 80, y1: 38, x2: 80, y2: 58, stroke: '#b9bec4', 'stroke-width': 3 }));
    pic.append(svg('line', { x1: 120, y1: 38, x2: 120, y2: 50, stroke: '#b9bec4', 'stroke-width': 3 }));
    text(70, 56, '+ long', 'end');
    text(130, 50, '− short', 'start');
  } else if (kind === 'diode') {
    pic.setAttribute('aria-label', 'Diode: the band is the cathode, K');
    pic.append(svg('line', { x1: 0, y1: 26, x2: 200, y2: 26, stroke: '#b9bec4', 'stroke-width': 3 }));
    pic.append(svg('rect', { x: 60, y: 12, width: 80, height: 28, rx: 4, fill: '#232323' }));
    pic.append(svg('rect', { x: 118, y: 12, width: 12, height: 28, fill: '#cfd6dd' }));
    text(40, 54, 'A (anode)');
    text(165, 54, 'K (band)');
  } else {
    pic.setAttribute('aria-label', 'LED: the long leg is plus, the flat side is minus');
    pic.append(svg('path', { d: 'M80 34 V18 a20 20 0 0 1 40 0 V34 Z', fill: '#3ddc84', opacity: 0.85 }));
    pic.append(svg('rect', { x: 76, y: 34, width: 48, height: 5, fill: '#2a9d4b' }));
    pic.append(svg('line', { x1: 124, y1: 34, x2: 124, y2: 39, stroke: '#111', 'stroke-width': 2 }));
    pic.append(svg('line', { x1: 90, y1: 39, x2: 90, y2: 60, stroke: '#b9bec4', 'stroke-width': 3 }));
    pic.append(svg('line', { x1: 110, y1: 39, x2: 110, y2: 52, stroke: '#b9bec4', 'stroke-width': 3 }));
    text(84, 58, '+ long', 'end');
    text(116, 52, '− flat side', 'start');
  }
  return el('div', { id: 'part-polarity-picture', 'data-kind': kind }, pic);
}

/**
 * What to wire (0.4 design F1): one group per line, each leg a tick box.
 * o: { wired: Set, openOnly: boolean, expanded: Set, shown: string|null, onWire(key, on), onShow(net),
 *      onCopy(), onOpenOnly(on), onExpand(net, open) }
 */
export function renderWiring(container, groups, o) {
  if (!groups.length) {
    container.replaceChildren();
    return;
  }
  const total = groups.reduce((n, g) => n + g.members.length, 0);
  const done = groups.reduce((n, g) => n + g.members.filter((m) => o.wired.has(m.key)).length, 0);
  const only = el('input', { type: 'checkbox', id: 'wiring-open-only', 'data-focus': 'open-only' });
  only.checked = o.openOnly;
  only.addEventListener('change', () => o.onOpenOnly(only.checked));
  const copy = el('button', { type: 'button', id: 'wiring-copy', 'data-focus': 'copy' }, 'Copy as text');
  copy.addEventListener('click', o.onCopy);
  const openAll = el('button', { type: 'button', id: 'wiring-open-all', 'data-focus': 'open-all' }, 'Open all');
  openAll.addEventListener('click', () => o.onExpandAll(true));
  const closeAll = el('button', { type: 'button', id: 'wiring-close-all', 'data-focus': 'close-all' }, 'Close all');
  closeAll.addEventListener('click', () => o.onExpandAll(false));
  const bar = el('progress', { max: String(Math.max(total, 1)) });
  bar.value = done;
  const kinds = ['power', 'ground', 'signal'].map((k) => {
    const legs = groups.filter((g) => g.kind === k).flatMap((g) => g.members);
    return `${{ power: 'Supplies', ground: '0 V', signal: 'Signals' }[k]} ${legs.filter((m) => o.wired.has(m.key)).length}/${legs.length}`;
  }).join(' · ');
  const filter = el('input', { type: 'search', id: 'wiring-filter', placeholder: 'Filter lines, e.g. TACH', 'aria-label': 'Filter lines', 'data-focus': 'filter' });
  filter.value = o.filter || '';
  filter.addEventListener('input', () => o.onFilter(filter.value));
  const nextLine = el('button', { type: 'button', id: 'wiring-next', 'data-focus': 'next-line' }, 'Next line not finished');
  nextLine.addEventListener('click', o.onNextLine);
  const children = [
    el('h2', {}, 'What to wire'),
    el('p', { className: 'progress-text' }, `${done} of ${total} legs wired`),
    bar,
    el('p', { id: 'wiring-kinds', className: 'hint' }, kinds),
    el('div', { className: 'wiring-actions' }, el('label', { className: 'check' }, only, ' Only not wired'), copy, openAll, closeAll, nextLine),
    filter,
  ];
  const q = (o.filter || '').trim().toLowerCase();
  for (const g of groups) {
    if (q && !g.label.toLowerCase().includes(q) && !g.net.toLowerCase().includes(q)) continue;
    const doneHere = g.members.filter((m) => o.wired.has(m.key)).length;
    const details = el('details', { className: `wire-group wire-${g.kind}`, 'data-net': g.net });
    details.open = o.expanded.has(g.net);
    details.addEventListener('toggle', () => o.onExpand(g.net, details.open));
    details.append(el('summary', { 'data-focus': `net-${g.net}` },
      el('span', { className: 'wire-label' }, g.label), ' ',
      el('span', { className: 'wire-count' }, `${doneHere} of ${g.members.length} wired`)));
    const show = el('button', { type: 'button', className: 'wire-show', 'data-focus': `show-${g.net}`, 'aria-pressed': String(o.shown === g.net) },
      o.shown === g.net ? 'Hide' : 'Show');
    show.addEventListener('click', () => o.onShow(g.net));
    const all = el('button', { type: 'button', className: 'wire-all', 'data-focus': `all-${g.net}` }, 'Mark all wired');
    all.addEventListener('click', () => o.onWireAll(g));
    const list = el('ul', { className: 'wire-members' });
    for (const m of g.members) {
      if (o.openOnly && o.wired.has(m.key)) continue;
      const box = el('input', { type: 'checkbox', 'data-wire': m.key, 'data-focus': `wire-${m.key}` });
      box.checked = o.wired.has(m.key);
      box.addEventListener('change', () => o.onWire(m.key, box.checked));
      list.append(el('li', {}, el('label', {}, box, ` ${m.text}`)));
    }
    details.append(show, ' ', all, list);
    children.push(details);
  }
  keepFocus(container, () => container.replaceChildren(...children), '#wiring-copy');
}
