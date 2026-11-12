// The side panel: the selected part's card (design §7.4, board-view design §5).
// Everything is built with createElement and textContent: a project file's text is untrusted.

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
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
 *           step?: { number, total, title }, where?: { pins: [string, number[]][], body?: string, side: string },
 *           offBoard?: boolean, connections?: { pin, label, others: [string, string][] }[], onPart?(ref: string): void }} o
 */
export function renderCard(container, part, o) {
  const title = el('h2', {}, part.ref);
  if (part.value) title.append(' ', el('span', { className: 'part-value' }, part.value));
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

  if (o.step) children.push(el('p', { className: 'part-step' }, `Step ${o.step.number} of ${o.step.total}: ${o.step.title}`));
  if (o.where) {
    const pins = [...o.where.pins].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
    const at = ([pin, [c, r]]) => `pin ${pin} at ${c},${r}`;
    const holes = pins.length > 6 ? `${pins.length} pins, ${at(pins[0])}` : pins.map(at).join(' · ');
    const under = o.where.side === 'bottom' ? ' · Underneath the board' : '';
    children.push(el('p', { className: 'part-where' }, `Where (sheet 4): ${holes}${under}`));
    if (o.where.body) children.push(el('p', { className: 'part-standing' }, `Standing: body over pin ${o.where.body}`));
  }
  if (o.offBoard) children.push(el('p', { className: 'part-offboard' }, 'Not on the board (wired to it).'));
  if (o.connections && o.connections.length) {
    const list = el('ul', { className: 'part-connections' });
    for (const c of o.connections) {
      const line = el('li', {}, `pin ${c.pin} → ${c.label}`);
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
  }

  const actions = el('div', { className: 'part-actions' });
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
  container.replaceChildren(...children);
}
