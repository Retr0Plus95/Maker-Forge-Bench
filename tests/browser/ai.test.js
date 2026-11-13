import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, copyFixture, openPage, startDevServer } from './harness.js';

// AI help (0.7 design §5). The tests never reach Claude or Ollama: page.route answers for them,
// after the page's own rules (CSP) have let the request out.
const PROJECT = path.join(FIXTURES, 'forge-project', 'fume-extractor.json');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Answers for Claude and Ollama. `next` is what the next request gets; every request is kept. */
async function fakeAi(page) {
  const seen = [];
  const fake = { seen, next: null, hold: null };
  const answer = async (route, kind) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    seen.push({ kind, url: req.url(), headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
    if (fake.hold) await fake.hold;
    if (fake.next && fake.next.offline) {
      await route.abort('internetdisconnected');
      return;
    }
    const { status = 200, json } = fake.next || {};
    await route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(json || {}) });
  };
  await page.route('https://api.anthropic.com/**', (route) => answer(route, 'claude'));
  await page.route('http://localhost:11434/**', (route) => answer(route, 'ollama'));
  return fake;
}
const claudeSays = (text, stop = 'end_turn') => ({ json: { stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] } });

async function openR6(page) {
  await page.locator('#find').fill('R6');
  await page.locator('#find').press('Enter');
  await page.waitForFunction(() => document.querySelector('#part-card h2')?.firstChild?.textContent === 'R6');
}

describe('AI help: ask from the part card with your own Claude key, or Ollama', () => {
  let server; let browser; let page; let problems; let fake;

  before(async () => {
    const dir = await copyFixture('fume-extractor');
    await writeFile(path.join(dir, 'forge-project.json'), await readFile(PROJECT));
    server = await startDevServer(dir);
    ({ browser, page, problems } = await openPage(server.url, { width: 1280, height: 900 }, {
      before: async (p) => { fake = await fakeAi(p); },
    }));
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
  });

  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  test('off by default: the card offers to set it up, which opens AI help in Easy reading', async () => {
    await openR6(page);
    assert.equal(await page.locator('#ask-here').count(), 0);
    await page.locator('#ask-set-up').click();
    await page.waitForFunction(() => document.querySelector('#settings').open);
    assert.equal(await page.locator('#settings input[name=aiProvider][value=off]').isChecked(), true);
    assert.equal(await page.locator('#ai-claude').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.value), 'claude');
  });

  test('Claude: the key, Test it, and the request it sends', async () => {
    await page.locator('#settings input[name=aiProvider][value=claude]').check();
    assert.equal(await page.locator('#ai-claude').isVisible(), true);
    assert.equal(await page.locator('#ai-model').inputValue(), 'claude-opus-5-5');
    await page.locator('#ai-key').fill('sk-ant-test-123');
    fake.next = claudeSays('Hello, and mind the hot iron!');
    await page.locator('#ai-test').click();
    await page.waitForFunction(() => /^Claude answered: "Hello, and mind the hot iron!"$/.test(document.querySelector('#ai-test-result').textContent));
    const sent = fake.seen.at(-1);
    assert.equal(sent.headers['x-api-key'], 'sk-ant-test-123');
    assert.equal(sent.headers['anthropic-version'], '2026-10-21');
    assert.equal(sent.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(sent.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.equal(sent.body.model, 'claude-opus-5-5');
    assert.equal(sent.body.fallbacks, 'default');
    assert.equal(sent.body.temperature, undefined);
  });

  test('the key is kept in storage only when Remember is ticked', async () => {
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('bench.ai')));
    assert.equal((await stored()).key, '');
    assert.equal((await stored()).provider, 'claude');
    await page.locator('#ai-remember').check();
    assert.equal((await stored()).key, 'sk-ant-test-123');
    await page.locator('#ai-remember').uncheck();
    assert.equal((await stored()).key, '');
    assert.equal(await page.locator('#settings').evaluate((d) => d.textContent.includes('never put in a progress file, a board file or a link')), true);
    await page.locator('#settings-done').click();
  });

  test('Ask here sends the card\'s context and shows the answer as plain text', async () => {
    assert.equal(await page.locator('#ask-here').textContent(), 'Ask here');
    let release;
    fake.hold = new Promise((r) => { release = r; });
    fake.next = claudeSays('R6 keeps <b>Q1</b> off.\nSolder it flat.');
    await page.locator('#ask-question').fill('Why is R6 here?');
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => document.querySelector('#ask-answer')?.textContent === 'Asking Claude…');
    assert.equal(await page.locator('#ask-here').isDisabled(), true);
    release();
    fake.hold = null;
    await page.waitForFunction(() => document.querySelector('#ask-answer')?.textContent.includes('Solder it flat.'));
    assert.equal(await page.locator('#ask-answer').textContent(), 'Claude: R6 keeps <b>Q1</b> off.\nSolder it flat.');
    assert.equal(await page.locator('#ask-answer b').count(), 0, 'never read as page code');
    assert.equal(await page.locator('#ask-question').inputValue(), 'Why is R6 here?', 'the question stays');
    const prompt = fake.seen.at(-1).body.messages[0].content;
    assert.match(prompt, /^Question: Why is R6 here\?\nProject: Solder Fume Extractor \(Rev D\)\nPart: R6, 10k/);
    assert.match(fake.seen.at(-1).body.system, /hobbyist/);
  });

  test('a wrong key, a refusal and no connection are said in plain words', async () => {
    fake.next = { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => /did not accept the API key/.test(document.querySelector('#ask-answer')?.textContent || ''));
    assert.match(await page.locator('#ask-answer').getAttribute('class'), /ai-bad/);
    fake.next = claudeSays('', 'refusal');
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => /would not answer that/.test(document.querySelector('#ask-answer')?.textContent || ''));
    fake.next = { offline: true };
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => /Claude could not be reached\. Check the internet connection\./.test(document.querySelector('#ask-answer')?.textContent || ''));
  });

  test('Ollama on this computer: its address, Test it and Ask here', async () => {
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name=aiProvider][value=ollama]').check();
    assert.equal(await page.locator('#ai-claude').isVisible(), false);
    assert.equal(await page.locator('#ai-origin').textContent(), new URL(server.url).origin);
    await page.locator('#ai-ollama-address').fill('http://192.168.1.20:11434');
    await page.locator('#ai-ollama-address').press('Tab');
    assert.match(await page.locator('#ai-ollama-why').textContent(), /only reach Ollama on this computer/);
    assert.equal(await page.locator('#ai-ollama-address').inputValue(), 'http://localhost:11434', 'kept the one that works');
    await page.locator('#ai-ollama-model').fill('qwen2.5:7b');
    await page.locator('#ai-ollama-model').press('Tab');
    assert.equal(await page.locator('#ai-pull').textContent(), 'ollama pull qwen2.5:7b');
    fake.next = { json: { message: { role: 'assistant', content: 'Hi there.' } } };
    await page.locator('#ai-test').click();
    await page.waitForFunction(() => /answered: "Hi there\."/.test(document.querySelector('#ai-test-result').textContent));
    assert.equal(await page.locator('#ai-test-result').textContent(), 'qwen2.5:7b (Ollama) answered: "Hi there."');
    assert.equal(fake.seen.at(-1).url, 'http://localhost:11434/api/chat');
    assert.equal(fake.seen.at(-1).body.model, 'qwen2.5:7b');
    await page.locator('#settings-done').click();
    fake.next = { json: { message: { content: 'A 10k resistor.' } } };
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => document.querySelector('#ask-answer')?.textContent === 'qwen2.5:7b (Ollama): A 10k resistor.');
    fake.next = { status: 404, json: { error: 'model "qwen2.5:7b" not found, try pulling it first' } };
    await page.locator('#ask-here').click();
    await page.waitForFunction(() => /Is the model "qwen2.5:7b" pulled\?/.test(document.querySelector('#ask-answer')?.textContent || ''));
  });

  test('after a reload a key that wasn\'t remembered is gone, so the card offers to set it up again', async () => {
    await page.locator('#settings-button').click();
    await page.locator('#settings input[name=aiProvider][value=claude]').check();
    await page.locator('#ai-key').fill('sk-ant-forget-me');
    await page.locator('#settings-done').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sheet-host')?.shadowRoot?.querySelector('svg'));
    await openR6(page);
    assert.equal(await page.locator('#ask-here').count(), 0);
    assert.equal(await page.locator('#ask-set-up').count(), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('bench.ai').includes('forget-me')), false);
  });

  test('no page errors, and the page rules let only these through', () => {
    const expected = /^console: Failed to load resource: (the server responded with a status of (401 \(Unauthorized\)|404 \(Not Found\))|net::ERR_INTERNET_DISCONNECTED)$/;
    assert.deepEqual(problems.filter((p) => !expected.test(p)), []);
  });
});
