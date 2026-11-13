// AI help (0.7 design §5), the same way Shape does it: optional and off until set up in Easy
// reading. Claude with the person's own API key, called straight from this page, or a model on
// their own computer through Ollama. What is sent: the question and the part's context, the same
// text "Copy for Claude" copies; never drawings, photos or files. The key stays in this browser: in
// memory, or in its storage when Remember is ticked. It never goes in a progress file, a board
// file or a link. The requests and the answers are read here, without the page, so they are tested.

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-opus-5-5';
export const OLLAMA_URL = 'http://localhost:11434';
export const OLLAMA_MODEL = 'llama3.2';
const TIMEOUT_MS = 180000;
// models that take "fallbacks": a declined answer is tried again on another model in the same call
const FALLBACK_MODELS = /^claude-(fable-5-2|fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;

export const SYSTEM = [
  'You help a hobbyist who is building an electronics project at the bench, with the drawings open in an app called Maker Forge Bench.',
  'Answer the question about the part described below in plain words, for someone who solders but is not an engineer.',
  'Be short: a few sentences, or a short list when there are steps. No headings, no tables, no markdown.',
  'Use the project details given; where they do not say, use general electronics knowledge and say that you are.',
  'If something could damage the part or the board, or hurt someone, say so first.',
].join(' ');

export class AiError extends Error {}

/** AI settings read back from storage: anything odd falls back to the default. */
export function cleanAi(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const remember = a.remember === true && typeof a.key === 'string' && a.key.length < 300;
  return {
    provider: ['claude', 'ollama'].includes(a.provider) ? a.provider : 'off',
    model: typeof a.model === 'string' && /^[\w.:-]{1,60}$/.test(a.model) ? a.model : CLAUDE_MODEL,
    remember,
    key: remember ? a.key.trim() : '',
    ollama: ollamaAddress(a.ollama) || OLLAMA_URL,
    ollamaModel: typeof a.ollamaModel === 'string' && /^[\w.:/-]{1,60}$/.test(a.ollamaModel) ? a.ollamaModel : OLLAMA_MODEL,
  };
}

/** Ollama on this computer: the page's rules (CSP) let it reach only port 11434 here. '' for anything else. */
export function ollamaAddress(text) {
  const m = typeof text === 'string' && /^\s*(http:\/\/)?(localhost|127\.0\.0\.1):11434\/?\s*$/.exec(text);
  return m ? `http://${m[2]}:11434` : '';
}

/** What goes in the browser's storage: the key only when Remember is ticked. */
export const aiForStorage = (ai) => ({ ...ai, key: ai.remember ? ai.key : '' });

/** Set up enough to ask? (Claude needs a key; Ollama needs nothing more.) */
export const aiReady = (ai) => (ai.provider === 'claude' ? Boolean(ai.key) : ai.provider === 'ollama');

/** Who answers, for buttons and messages. */
export const aiName = (ai) => (ai.provider === 'claude' ? 'Claude' : ai.provider === 'ollama' ? `${ai.ollamaModel} (Ollama)` : '');

/** The Claude request (raw HTTP, as Shape: the page has no build step to bundle the SDK). */
export function claudeRequest(ai, system, prompt) {
  const fallback = FALLBACK_MODELS.test(ai.model);
  const headers = {
    'content-type': 'application/json',
    'x-api-key': ai.key,
    'anthropic-version': '2026-10-21',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (fallback) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const body = {
    model: ai.model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium' },
  };
  if (fallback) body.fallbacks = 'default';
  return { url: CLAUDE_URL, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

/** Claude's answer as plain text, or an AiError saying in plain words what went wrong. */
export function readClaude(status, json) {
  const j = json && typeof json === 'object' ? json : {};
  const said = j.error && typeof j.error.message === 'string' ? `: ${j.error.message.slice(0, 160)}` : '';
  if (status === 401) throw new AiError('Claude did not accept the API key: check it in Easy reading, under AI help.');
  if (status === 403) throw new AiError(`This API key isn't allowed to ask Claude${said}.`);
  if (status === 429) throw new AiError("Claude is busy or your account's limit is reached: try again in a minute.");
  if (status === 529 || status >= 500) throw new AiError('Claude is overloaded or having trouble right now: try again in a minute.');
  if (status < 200 || status >= 300) throw new AiError(`Claude answered with an error (${status}${said}).`);
  if (j.stop_reason === 'refusal') throw new AiError('Claude would not answer that. Try asking it another way.');
  const text = (Array.isArray(j.content) ? j.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new AiError("Claude's answer was empty. Try again.");
  return j.stop_reason === 'max_tokens' ? `${text}\n\n(The answer was cut short.)` : text;
}

export function ollamaRequest(ai, system, prompt) {
  return {
    url: `${ai.ollama.replace(/\/+$/, '')}/api/chat`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: ai.ollamaModel, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    },
  };
}

export function readOllama(status, json, ai) {
  const j = json && typeof json === 'object' ? json : {};
  if (status < 200 || status >= 300) {
    throw new AiError(`Ollama answered with an error (${status}${j.error ? `: ${String(j.error).slice(0, 160)}` : ''}). Is the model "${ai.ollamaModel}" pulled?`);
  }
  const text = j.message && typeof j.message.content === 'string' ? j.message.content.trim() : '';
  if (!text) throw new AiError("The local model's answer was empty. Try again, or a bigger model.");
  return text;
}

/** Why a request never got an answer: no connection, Ollama not running or not allowing this page, or too slow. */
export function unreachable(ai, error, origin) {
  if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new AiError(`${aiName(ai)} took too long to answer. Try again${ai.provider === 'ollama' ? ', or a smaller model' : ''}.`);
  }
  if (ai.provider === 'ollama') {
    return new AiError(`Ollama could not be reached at ${ai.ollama}. Is it running? It must allow this page: set OLLAMA_ORIGINS to ${origin} and restart Ollama.`);
  }
  return new AiError("Claude could not be reached. Check the internet connection.");
}

/** One question, one plain-text answer. */
export async function askAi(ai, system, prompt, { fetchFn = fetch, origin = '' } = {}) {
  if (ai.provider === 'claude' && !ai.key) throw new AiError('Add your Claude API key in Easy reading, under AI help, first.');
  if (!aiReady(ai)) throw new AiError('Set up AI help in Easy reading first.');
  const { url, init } = ai.provider === 'claude' ? claudeRequest(ai, system, prompt) : ollamaRequest(ai, system, prompt);
  let response;
  try {
    response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw unreachable(ai, error, origin);
  }
  const json = await response.json().catch(() => ({}));
  return ai.provider === 'claude' ? readClaude(response.status, json) : readOllama(response.status, json, ai);
}
