// Few requests at a time to Bench's own website. one.com, which hosts forge.retr0plus.se, refuses a
// visitor's 11th request in progress at once ("429 Too Many Requests", Retry-After: 5). Opening the
// 3D view asks for every part's model together (32 for the fume extractor), so they go through this
// queue: `max` at once, and a refused one is asked again after the wait the host gives.
// No page code: unit-tested in Node (tests/unit/fetchqueue.test.js).

const RETRIES = 2;

/** How long to wait after a 429: the host's Retry-After in seconds, else 2 s, never more than 10 s. */
function waitFor(response) {
  const s = Number(response.headers?.get?.('retry-after'));
  if (!Number.isFinite(s) || s <= 0) return 2000;
  return Math.min(s, 10) * 1000;
}

/**
 * fetchFn wrapped so that at most `max` requests are in progress at once. A 429 is asked again (twice
 * at most) after its wait; any other answer, or a thrown error, is handed back as it came.
 */
export function queuedFetch(fetchFn, { max = 4, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let running = 0;
  const waiting = [];
  const next = () => {
    if (running >= max || !waiting.length) return;
    running += 1;
    const { args, resolve, reject } = waiting.shift();
    (async () => {
      let response = await fetchFn(...args);
      for (let i = 0; i < RETRIES && response && response.status === 429; i++) {
        await sleep(waitFor(response));
        response = await fetchFn(...args);
      }
      return response;
    })().then(resolve, reject).finally(() => {
      running -= 1;
      next();
    });
  };
  return (...args) => new Promise((resolve, reject) => {
    waiting.push({ args, resolve, reject });
    next();
  });
}
