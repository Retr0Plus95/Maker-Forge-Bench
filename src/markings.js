// What's printed on a part (0.5 improvements 9, 10): resistor colour bands and ceramic capacitor
// codes, worked out from the value. No page code: unit-tested in Node.

export const BAND_COLOURS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
export const BAND_HEX = {
  black: '#1b1b1b', brown: '#7a4a1e', red: '#d62828', orange: '#f77f00', yellow: '#f6d33c', green: '#2a9d4b',
  blue: '#2463eb', violet: '#8e44ad', grey: '#8d99ae', white: '#f4f4f4', gold: '#c9a227', silver: '#c0c0c0',
};

/** A resistor's value in ohms: "10k", "4.7k", "4k7", "330R", "10 kΩ", "1M", "2.2", or null. */
export function ohms(value) {
  const v = String(value || '').replace(/\s+/g, '').replace(/ω|Ω|ohms?/gi, '');
  let m = v.match(/^(\d+)([RKM])(\d+)$/i); // 4k7, 2R2
  if (m) return Number(`${m[1]}.${m[3]}`) * { r: 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()];
  m = v.match(/^(\d+(?:\.\d+)?)([RKM]?)$/i);
  if (!m) return null;
  return Number(m[1]) * { '': 1, r: 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()];
}

/** The four bands of a 5 % resistor: two digits, a multiplier, gold. Null when the value isn't a resistance. */
export function resistorBands(value) {
  const r = ohms(value);
  if (!r || r < 0.1 || r >= 1e10) return null;
  let exp = Math.floor(Math.log10(r)) - 1;
  let digits = Math.round(r / 10 ** exp);
  if (digits >= 100) { // rounding up (9.95 → 100)
    digits = Math.round(digits / 10);
    exp += 1;
  }
  const multiplier = exp === -1 ? 'gold' : exp === -2 ? 'silver' : BAND_COLOURS[exp];
  if (!multiplier) return null;
  return [BAND_COLOURS[Math.floor(digits / 10)], BAND_COLOURS[digits % 10], multiplier, 'gold'];
}

/** A capacitance in picofarads: "100 nF", "22 pF", "1 µF", "4n7", or null. */
export function picofarads(value) {
  const v = String(value || '').replace(/\s+/g, '').replace(/μ/g, 'µ').replace(/u/gi, 'µ');
  let m = v.match(/^(\d+)([pnµ])(\d+)F?$/i); // 4n7
  const scale = { p: 1, n: 1e3, 'µ': 1e6 };
  if (m) return Number(`${m[1]}.${m[3]}`) * scale[m[2].toLowerCase()];
  m = v.match(/^(\d+(?:\.\d+)?)([pnµ])F/i);
  return m ? Number(m[1]) * scale[m[2].toLowerCase()] : null;
}

/** What a small ceramic capacitor has printed on it: "104" for 100 nF, "22" for 22 pF. */
export function capacitorCode(value) {
  const pf = picofarads(value);
  if (!pf || pf < 1 || pf >= 1e7) return null;
  if (pf < 100) return String(Math.round(pf * 10) / 10);
  const exp = Math.floor(Math.log10(pf)) - 1;
  return `${Math.round(pf / 10 ** exp)}${exp}`;
}
