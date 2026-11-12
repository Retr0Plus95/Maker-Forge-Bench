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
 *           onSheet(id: string): void, onTick?(): void, onAsk?(): void, onClose(): void }} o
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
  if (o.onAsk) {
    const ask = el('button', { id: 'part-ask', type: 'button' }, 'Ask Claude');
    ask.addEventListener('click', o.onAsk);
    actions.append(ask);
  }
  const close = el('button', { id: 'part-close', type: 'button' }, 'Close');
  close.addEventListener('click', o.onClose);
  actions.append(close);
  children.push(actions);

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
