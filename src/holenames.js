// Hole names like your board's (0.6 design §1): a perfboard prints letters along one edge and numbers
// along the other. From what's printed by three of the anchor's pins, every hole gets its name.
// No page code: unit-tested in Node.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The letters this board uses, in order (some boards skip I, O or W). */
export function boardLetters(skip = '') {
  const s = new Set(String(skip).toUpperCase().replace(/[^A-Z]/g, ''));
  return [...ALPHABET].filter((ch) => !s.has(ch)).join('');
}

/** "L21", "l 21", "21L", "AA08" → { letters: 'L', num: 21, padded }, or null. */
export function parseLabel(text) {
  const t = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([A-Z]{1,2})(\d{1,3})$/) || t.match(/^(\d{1,3})([A-Z]{1,2})$/);
  if (!m) return null;
  const [letters, digits] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const num = Number(digits);
  return num >= 0 ? { letters, num, padded: digits.length > 1 && digits[0] === '0' } : null;
}

/** A = 1 … Z = 26 (with the board's letters), AA = 27 …; null if a letter isn't on the board. */
export function letterIndex(letters, alpha) {
  let n = 0;
  for (const ch of letters) {
    const k = alpha.indexOf(ch);
    if (k < 0) return null;
    n = n * alpha.length + k + 1;
  }
  return n;
}

/** The letters for an index (bijective: 27 → AA with 26 letters). */
export function lettersFor(index, alpha) {
  let n = index;
  let s = '';
  while (n > 0) {
    const k = (n - 1) % alpha.length;
    s = alpha[k] + s;
    n = Math.floor((n - 1) / alpha.length);
  }
  return s;
}

/**
 * Works out the board's naming from three pins in the anchor's frame and what's printed by them:
 * a (pin 1), b (the far pin of the same row) and c (the pin across from a).
 * Gives { ok: true, map } or { ok: false, why } in plain words.
 */
export function solveLabels(fa, fb, fc, la, lb, lc, skip = '') {
  const alpha = boardLetters(skip);
  const A = parseLabel(la);
  const B = parseLabel(lb);
  const C = parseLabel(lc);
  if (!A || !B || !C) return { ok: false, why: 'Write each hole as a letter and a number, like L21.' };
  const ia = letterIndex(A.letters, alpha);
  const ib = letterIndex(B.letters, alpha);
  const ic = letterIndex(C.letters, alpha);
  if (!ia || !ib || !ic) return { ok: false, why: 'One of those letters is in the "letters this board skips" box.' };
  const axisAB = fa[0] !== fb[0] ? 0 : 1; // the frame axis pin 1 → pin 14 runs along
  const axisAC = 1 - axisAB;
  const dAB = fb[axisAB] - fa[axisAB];
  const dAC = fc[axisAC] - fa[axisAC];
  const along = Math.abs(dAB);
  const across = Math.abs(dAC);
  if (!dAB || !dAC || fa[axisAC] !== fb[axisAC] || fa[axisAB] !== fc[axisAB]) {
    return { ok: false, why: "Those three pins don't make a corner of the chip." };
  }
  const padded = A.padded || B.padded || C.padded;
  // case 1: the letters change from pin 1 to pin 14, the numbers from pin 1 to the pin across
  if (ia !== ib && A.num === B.num) {
    if (Math.abs(ib - ia) !== along) return { ok: false, why: `Pin 1 and the far pin should be ${along} columns apart; those are ${Math.abs(ib - ia)}.` };
    if (C.letters !== A.letters) return { ok: false, why: 'The pin across from pin 1 should have the same letter as pin 1.' };
    if (Math.abs(C.num - A.num) !== across) return { ok: false, why: `Pin 1 and the pin across should be ${across} rows apart; those are ${Math.abs(C.num - A.num)}.` };
    return { ok: true, map: { origin: fa, letterAxis: axisAB, letterSign: (ib - ia) / dAB, letterAt: ia, numberAxis: axisAC, numberSign: (C.num - A.num) / dAC, numberAt: A.num, alpha, padded } };
  }
  // case 2: the numbers change from pin 1 to pin 14, the letters from pin 1 to the pin across
  if (A.num !== B.num && ia === ib) {
    if (Math.abs(B.num - A.num) !== along) return { ok: false, why: `Pin 1 and the far pin should be ${along} rows apart; those are ${Math.abs(B.num - A.num)}.` };
    if (C.num !== A.num) return { ok: false, why: 'The pin across from pin 1 should have the same number as pin 1.' };
    if (Math.abs(ic - ia) !== across) return { ok: false, why: `Pin 1 and the pin across should be ${across} columns apart; those are ${Math.abs(ic - ia)}.` };
    return { ok: true, map: { origin: fa, numberAxis: axisAB, numberSign: (B.num - A.num) / dAB, numberAt: A.num, letterAxis: axisAC, letterSign: (ic - ia) / dAC, letterAt: ia, alpha, padded } };
  }
  return { ok: false, why: 'From pin 1 to the far pin only the letter or only the number should change.' };
}

/** A hole's printed name, like "L15", or null when it's off the board's labels. */
export function holeName(map, hole) {
  if (!map) return null;
  const letter = map.letterAt + map.letterSign * (hole[map.letterAxis] - map.origin[map.letterAxis]);
  const number = map.numberAt + map.numberSign * (hole[map.numberAxis] - map.origin[map.numberAxis]);
  if (letter < 1 || number < 0) return null;
  return `${lettersFor(letter, map.alpha)}${map.padded && number < 10 ? `0${number}` : number}`;
}

/** The pin across from pin a (a → b runs along one row): same place along that row, farthest away. */
export function acrossPin(part, a, b) {
  const pa = part.pins[a];
  const pb = part.pins[b];
  if (!pa || !pb) return null;
  const along = pa[0] !== pb[0] ? 0 : 1;
  let best = null;
  for (const [name, h] of Object.entries(part.pins)) {
    if (name === a || h[along] !== pa[along]) continue;
    const d = Math.abs(h[1 - along] - pa[1 - along]);
    if (d > 0 && (!best || d > best.d)) best = { name, d };
  }
  return best ? best.name : null;
}

/** What's printed along one edge for a row or column of holes: its letter(s) or its number. */
export function edgeName(map, axis, coord) {
  if (!map) return null;
  if (axis === map.letterAxis) {
    const n = map.letterAt + map.letterSign * (coord - map.origin[axis]);
    return n >= 1 ? lettersFor(n, map.alpha) : null;
  }
  const n = map.numberAt + map.numberSign * (coord - map.origin[axis]);
  return n >= 0 ? (map.padded && n < 10 ? `0${n}` : String(n)) : null;
}

/** Saved hole names ({ a, b, c: { pin, text }, skip }) against the anchor part: the solved map, or null. */
export function labelsMap(labels, part) {
  if (!labels || !part) return null;
  const { a, b, c } = labels;
  if (!a || !b || !c || !part.pins[a.pin] || !part.pins[b.pin] || !part.pins[c.pin]) return null;
  const r = solveLabels(part.pins[a.pin], part.pins[b.pin], part.pins[c.pin], a.text, b.text, c.text, labels.skip || '');
  return r.ok ? r.map : null;
}
