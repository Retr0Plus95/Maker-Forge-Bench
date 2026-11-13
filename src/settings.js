// Easy reading settings: the same switches as Maker Forge, kept on <html>.

export const DEFAULT_SETTINGS = Object.freeze({ theme: 'dark', contrast: false, clearFont: false, textSize: 100, reduceMotion: false });
const SIZES = [100, 125, 150, 175];

/** Settings read back from storage: anything unknown falls back to the default. */
export function cleanSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: ['light', 'system'].includes(s.theme) ? s.theme : 'dark',
    contrast: s.contrast === true,
    clearFont: s.clearFont === true,
    textSize: SIZES.includes(s.textSize) ? s.textSize : 100,
    reduceMotion: s.reduceMotion === true,
  };
}

/** The theme to show: 'system' follows the computer's light or dark setting. */
export const themeFor = (s, prefersDark) => (s.theme === 'system' ? (prefersDark ? 'dark' : 'light') : s.theme);

export function applySettings(root, s, prefersDark = true) {
  root.dataset.theme = themeFor(s, prefersDark);
  const flag = (name, on, value) => {
    if (on) root.setAttribute(name, value);
    else root.removeAttribute(name);
  };
  flag('data-contrast', s.contrast, 'high');
  flag('data-font', s.clearFont, 'clear');
  flag('data-motion', s.reduceMotion, 'reduce');
  root.style.fontSize = `${s.textSize}%`;
}

const onOff = (v) => (v ? 'on' : 'off');
const LABELS = {
  theme: (s) => `Theme: ${s.theme}`,
  contrast: (s) => `High contrast: ${onOff(s.contrast)}`,
  clearFont: (s) => `Clear font: ${onOff(s.clearFont)}`,
  textSize: (s) => `Text size: ${s.textSize}%`,
  reduceMotion: (s) => `Reduce motion: ${onOff(s.reduceMotion)}`,
};

/** Shows the settings in the dialog's controls. */
export function fillSettings(dialog, s) {
  for (const input of dialog.querySelectorAll('input')) {
    if (input.type === 'checkbox') input.checked = Boolean(s[input.name]);
    else input.checked = String(s[input.name]) === input.value;
  }
}

/**
 * Wires the dialog once. getCurrent() gives the settings now; onChange(next, label) is called for
 * every change a person makes, so the app can record it for undo.
 */
export function wireSettings(dialog, openButton, doneButton, getCurrent, onChange) {
  openButton.addEventListener('click', () => {
    fillSettings(dialog, getCurrent());
    dialog.showModal();
  });
  doneButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !(input.name in LABELS)) return;
    const value = input.type === 'checkbox' ? input.checked : input.name === 'textSize' ? Number(input.value) : input.value;
    const next = cleanSettings({ ...getCurrent(), [input.name]: value });
    onChange(next, LABELS[input.name](next));
  });
}
