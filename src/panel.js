// The side panel: the selected part's card (design §7.4, board-view design §5), the build steps and
// what to wire (0.4 design F1).
// Everything is built with createElement and textContent: a project file's text is untrusted.
import { isGroundLabel, isPowerLabel, pinText, stillToWire, wireKey } from './wiring.js';

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
  build();
  if (!focusKey) return;
  const again = [...container.querySelectorAll('[data-focus]')].find((b) => b.getAttribute('data-focus') === focusKey);
  const fallback = container.querySelector(fallbackSelector);
  (again && !again.disabled ? again : fallback)?.focus();
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
    else if (o.where.mount === 'flat') children.push(el('p', { className: 'part-flat' }, 'Lies flat on the board'));
  }
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
    }
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
  keepFocus(container, () => container.replaceChildren(...children), '#part-tick');
}


/**
 * The build steps (board-view design §5): the list, and the open step with its why, its parts,
 * Back / Next and "Tick all in this step".
 */
export function renderSteps(container, steps, o) {
  if (!steps.length) {
    container.replaceChildren();
    return;
  }
  const list = el('ol', { className: 'steps-list' });
  steps.forEach((step, i) => {
    const open = el('button', { type: 'button', 'aria-current': String(i === o.current), 'data-focus': `step-${i}` }, step.title);
    open.addEventListener('click', () => o.onOpen(i));
    const item = el('li', {}, open);
    const found = step.parts.filter((r) => !step.missing.includes(r)).length;
    if (found) item.append(el('span', { className: 'step-count' }, ` ${o.doneIn(step)} of ${found} soldered`));
    list.append(item);
  });
  const children = [el('h2', {}, 'Build steps'), list];
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
    if (found.length) {
      const all = el('button', { type: 'button', id: 'step-tick-all', 'data-focus': 'tick-all' }, 'Tick all in this step');
      all.addEventListener('click', () => o.onTickAll(o.current));
      nav.append(all);
    }
    box.append(nav, el('p', { className: 'hint' }, 'Space: next step · Shift+Space: back'));
    children.push(box);
  }
  // the panel is rebuilt on every change: the keyboard focus goes back where it was
  keepFocus(container, () => container.replaceChildren(...children),
    '#step-next:not(:disabled), #step-back:not(:disabled), .steps-list button[aria-current="true"], button');
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
  const { layout, side, selected, onSide, onPin } = o.pins;
  const byPin = new Map(connections.map((c) => [c.pin, c]));
  const ROW = 22;
  const top = 26;
  const dip = layout.kind === 'dip';
  const bodyX = dip ? 120 : 70;
  const bodyW = dip ? 70 : 26;
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
  }
  return box;
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
  const bar = el('progress', { max: String(Math.max(total, 1)) });
  bar.value = done;
  const children = [
    el('h2', {}, 'What to wire'),
    el('p', { className: 'progress-text' }, `${done} of ${total} legs wired`),
    bar,
    el('div', { className: 'wiring-actions' }, el('label', { className: 'check' }, only, ' Only not wired'), copy),
  ];
  for (const g of groups) {
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
    const list = el('ul', { className: 'wire-members' });
    for (const m of g.members) {
      if (o.openOnly && o.wired.has(m.key)) continue;
      const box = el('input', { type: 'checkbox', 'data-wire': m.key, 'data-focus': `wire-${m.key}` });
      box.checked = o.wired.has(m.key);
      box.addEventListener('change', () => o.onWire(m.key, box.checked));
      list.append(el('li', {}, el('label', {}, box, ` ${m.text}`)));
    }
    details.append(show, list);
    children.push(details);
  }
  keepFocus(container, () => container.replaceChildren(...children), '#wiring-copy');
}
