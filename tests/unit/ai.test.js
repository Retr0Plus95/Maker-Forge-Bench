import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiError, CLAUDE_MODEL, aiForStorage, aiName, aiReady, askAi, claudeRequest, cleanAi, ollamaAddress, ollamaRequest, readClaude, readOllama, unreachable,
} from '../../src/ai.js';

const claude = { ...cleanAi({ provider: 'claude' }), key: 'sk-ant-test' };
const ollama = cleanAi({ provider: 'ollama' });

test('settings read back: off by default, odd values fall back, the key only when remembered', () => {
  assert.deepEqual(cleanAi(null), { provider: 'off', model: CLAUDE_MODEL, remember: false, key: '', ollama: 'http://localhost:11434', ollamaModel: 'llama3.2' });
  assert.equal(cleanAi({ provider: 'gpt' }).provider, 'off');
  assert.equal(cleanAi({ model: 'bad model!' }).model, CLAUDE_MODEL);
  assert.equal(cleanAi({ key: 'sk-ant-x' }).key, '', 'not remembered: not read back');
  assert.equal(cleanAi({ remember: true, key: ' sk-ant-x ' }).key, 'sk-ant-x');
  assert.equal(cleanAi({ ollama: 'http://192.168.1.9:11434' }).ollama, 'http://localhost:11434', 'only this computer');
  assert.equal(cleanAi({ ollamaModel: 'qwen2.5:7b' }).ollamaModel, 'qwen2.5:7b');
});

test('Ollama addresses: this computer on port 11434, the only ones the page may reach', () => {
  assert.equal(ollamaAddress('localhost:11434'), 'http://localhost:11434');
  assert.equal(ollamaAddress(' http://127.0.0.1:11434/ '), 'http://127.0.0.1:11434');
  assert.equal(ollamaAddress('http://localhost:8080'), '');
  assert.equal(ollamaAddress('https://example.com:11434'), '');
});

test('the key is stored only when Remember is ticked', () => {
  assert.equal(aiForStorage({ ...claude, remember: false }).key, '');
  assert.equal(aiForStorage({ ...claude, remember: true }).key, 'sk-ant-test');
});

test('ready and named', () => {
  assert.equal(aiReady(cleanAi({})), false);
  assert.equal(aiReady({ ...claude, key: '' }), false);
  assert.equal(aiReady(claude), true);
  assert.equal(aiReady(ollama), true);
  assert.equal(aiName(claude), 'Claude');
  assert.equal(aiName(ollama), 'llama3.2 (Ollama)');
});

test('the Claude request: the key, the current API version, browser access, fallbacks on, no sampling settings', () => {
  const { url, init } = claudeRequest(claude, 'SYS', 'Q');
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  const body = JSON.parse(init.body);
  assert.deepEqual(body, { model: 'claude-opus-5-5', max_tokens: 16000, system: 'SYS', messages: [{ role: 'user', content: 'Q' }], output_config: { effort: 'medium' }, fallbacks: 'default' });
  const older = claudeRequest({ ...claude, model: 'claude-haiku-5-5' }, 'S', 'Q');
  assert.equal(older.init.headers['anthropic-beta'], undefined, 'no fallbacks where the model has none');
  assert.equal(JSON.parse(older.init.body).fallbacks, undefined);
});

test("Claude's answers: the text blocks only; refusals, cut-offs and errors in plain words", () => {
  const ok = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Bend the legs ' }, { type: 'text', text: 'at 2.54 mm.' }] };
  assert.equal(readClaude(200, ok), 'Bend the legs at 2.54 mm.');
  assert.match(readClaude(200, { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Part' }] }), /^Part\n\n\(The answer was cut short\.\)$/);
  assert.throws(() => readClaude(200, { stop_reason: 'refusal', content: [] }), /would not answer that/);
  assert.throws(() => readClaude(200, { stop_reason: 'end_turn', content: [] }), /empty/);
  assert.throws(() => readClaude(401, {}), /did not accept the API key/);
  assert.throws(() => readClaude(429, {}), /limit is reached/);
  assert.throws(() => readClaude(529, {}), /overloaded/);
  assert.throws(() => readClaude(400, { error: { message: 'Your credit balance is too low' } }), /error \(400: Your credit balance is too low\)/);
  assert.throws(() => readClaude(401, {}), AiError);
});

test('the Ollama request and answers', () => {
  const { url, init } = ollamaRequest({ ...ollama, ollama: 'http://127.0.0.1:11434/' }, 'SYS', 'Q');
  assert.equal(url, 'http://127.0.0.1:11434/api/chat');
  assert.deepEqual(JSON.parse(init.body), { model: 'llama3.2', stream: false, messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'Q' }] });
  assert.equal(readOllama(200, { message: { content: ' Hi. ' } }, ollama), 'Hi.');
  assert.throws(() => readOllama(404, { error: 'model "llama3.2" not found' }, ollama), /Is the model "llama3.2" pulled\?/);
});

test('no answer at all: said for Claude, Ollama and a timeout', () => {
  assert.match(unreachable(claude, new TypeError('Failed to fetch'), 'http://x').message, /Claude could not be reached/);
  assert.match(unreachable(ollama, new TypeError('Failed to fetch'), 'http://127.0.0.1:8000').message, /set OLLAMA_ORIGINS to http:\/\/127\.0\.0\.1:8000/);
  const late = new Error('late');
  late.name = 'TimeoutError';
  assert.match(unreachable(ollama, late, '').message, /took too long to answer\. Try again, or a smaller model\./);
});

test('askAi sends one request and reads the answer; not set up says so without asking', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return { status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Yes.' }] }) };
  };
  assert.equal(await askAi(claude, 'S', 'Q', { fetchFn }), 'Yes.');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].init.signal, 'a request that never answers gives up');
  await assert.rejects(askAi({ ...claude, key: '' }, 'S', 'Q', { fetchFn }), /Add your Claude API key/);
  await assert.rejects(askAi(cleanAi({}), 'S', 'Q', { fetchFn }), /Set up AI help/);
  assert.equal(calls.length, 1);
  await assert.rejects(askAi(claude, 'S', 'Q', { fetchFn: async () => { throw new TypeError('Failed to fetch'); } }), /could not be reached/);
});
