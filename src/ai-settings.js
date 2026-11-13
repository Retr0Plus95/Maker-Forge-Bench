// Easy reading → AI help (0.7 design §5): Off, Claude (your API key) or Ollama on this computer.
// These settings are not part of undo: a key isn't something to step back through.

import { aiName, ollamaAddress } from './ai.js';

/**
 * o: { dialog, get() → ai settings, set(next), test() → Promise<string> (the answer, or throws) }
 * Returns show(), to fill the controls from the settings when the dialog opens.
 */
export function wireAiSettings({ dialog, get, set, test }) {
  const $ = (sel) => dialog.querySelector(sel);
  const key = $('#ai-key');
  const remember = $('#ai-remember');
  const model = $('#ai-model');
  const address = $('#ai-ollama-address');
  const ollamaModel = $('#ai-ollama-model');
  const addressWhy = $('#ai-ollama-why');
  const result = $('#ai-test-result');
  const testButton = $('#ai-test');
  $('#ai-origin').textContent = window.location.origin;

  const show = () => {
    const ai = get();
    for (const radio of dialog.querySelectorAll('input[name=aiProvider]')) radio.checked = radio.value === ai.provider;
    $('#ai-claude').hidden = ai.provider !== 'claude';
    $('#ai-ollama').hidden = ai.provider !== 'ollama';
    $('#ai-test-row').hidden = ai.provider === 'off';
    $('#ai-pull').textContent = `ollama pull ${ai.ollamaModel}`;
    if (document.activeElement !== key) key.value = ai.key;
    remember.checked = ai.remember;
    if (document.activeElement !== model) model.value = ai.model;
    if (document.activeElement !== address) address.value = ai.ollama;
    if (document.activeElement !== ollamaModel) ollamaModel.value = ai.ollamaModel;
  };

  dialog.addEventListener('change', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.name === 'aiProvider') {
      set({ ...get(), provider: e.target.value });
      result.textContent = '';
      show();
    }
  });
  key.addEventListener('input', () => set({ ...get(), key: key.value.trim().slice(0, 300) }));
  remember.addEventListener('change', () => set({ ...get(), remember: remember.checked }));
  model.addEventListener('change', () => {
    const value = model.value.trim();
    if (!value || /^[\w.:-]{1,60}$/.test(value)) set({ ...get(), model: value || 'claude-opus-5-5' });
    show();
  });
  address.addEventListener('change', () => {
    const value = ollamaAddress(address.value);
    addressWhy.textContent = value ? '' : 'Bench can only reach Ollama on this computer: http://localhost:11434 or http://127.0.0.1:11434.';
    addressWhy.hidden = Boolean(value);
    if (value) set({ ...get(), ollama: value });
    show();
  });
  ollamaModel.addEventListener('change', () => {
    const value = ollamaModel.value.trim();
    if (/^[\w.:/-]{1,60}$/.test(value)) set({ ...get(), ollamaModel: value });
    show();
  });
  testButton.addEventListener('click', async () => {
    testButton.disabled = true;
    testButton.textContent = 'Asking…';
    result.classList.remove('ai-bad');
    result.textContent = '';
    try {
      const answer = await test();
      result.textContent = `${aiName(get())} answered: "${answer.slice(0, 120)}"`;
    } catch (error) {
      result.classList.add('ai-bad');
      result.textContent = error.message;
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test it';
    }
  });
  return { show };
}
