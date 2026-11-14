// Phones and tablets (0.7 design §4). Under 760 px the CSS folds the header's tools behind a Menu
// button and turns the side panel into a sheet at the bottom with a handle. This wires the two:
// the menu opens and closes (Esc, a tap outside, or after a tool is used), and the handle makes
// the sheet taller or shorter with a tap or a swipe.

const SWIPE = 24; // px: a shorter move is a tap

/** The header menu: o = { top, button }. */
export function wireMenu({ top, button }) {
  const set = (open) => {
    top.toggleAttribute('data-menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Close menu' : 'Menu';
  };
  const isOpen = () => top.hasAttribute('data-menu-open');
  set(false);
  button.addEventListener('click', () => set(!isOpen()));
  // a tool in the menu was used: fold it away again (Undo and Redo stay out of the menu)
  top.addEventListener('click', (e) => {
    const tool = e.target instanceof Element && e.target.closest('.bar > .tool');
    if (tool && isOpen() && tool !== button && tool.id !== 'undo' && tool.id !== 'redo') set(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !(e.target instanceof Node && top.contains(e.target))) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation(); // Esc closes the menu, not the part card behind it
    set(false);
    button.focus();
  }, true);
  return { close: () => set(false), isOpen };
}

/** The bottom sheet's handle: o = { panel, handle, onChange(tall) }. */
export function wireSheetHandle({ panel, handle, onChange = () => {} }) {
  const set = (tall, tell = true) => {
    panel.toggleAttribute('data-tall', tall);
    handle.setAttribute('aria-expanded', String(tall));
    handle.setAttribute('aria-label', tall ? 'Make the panel shorter' : 'Make the panel taller');
    handle.title = tall ? 'Make the panel shorter (or swipe down)' : 'Make the panel taller (or swipe up)';
    if (tell) onChange(tall);
  };
  let start = null;
  let swiped = false;
  handle.addEventListener('pointerdown', (e) => {
    swiped = false;
    start = e.clientY;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not tracked */ }
  });
  handle.addEventListener('pointerup', (e) => {
    if (start === null) return;
    const dy = e.clientY - start;
    start = null;
    if (Math.abs(dy) < SWIPE) return; // a tap: the click that follows toggles
    swiped = true;
    set(dy < 0);
  });
  handle.addEventListener('pointercancel', () => { start = null; });
  handle.addEventListener('click', () => {
    if (swiped) {
      swiped = false;
      return;
    }
    set(!panel.hasAttribute('data-tall'));
  });
  return { restore: (tall) => set(tall, false) };
}
