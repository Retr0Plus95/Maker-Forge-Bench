// Calculators (0.5 improvement 50): Ohm's law, an LED's resistor and a voltage divider, with the
// nearest standard (E12) value. No page code: unit-tested in Node.

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** The nearest E12 resistor value to r ohms (ratio-wise). */
export function nearestE12(r) {
  if (!(r > 0)) return null;
  const decade = 10 ** Math.floor(Math.log10(r));
  let best = null;
  for (const scale of [decade / 10, decade, decade * 10]) {
    for (const v of E12) {
      const candidate = Math.round(v * scale * 1000) / 1000;
      if (!best || Math.abs(Math.log(candidate / r)) < Math.abs(Math.log(best / r))) best = candidate;
    }
  }
  return best;
}

/** "4.7k", "330", "1M" */
export function ohmsText(r) {
  if (r >= 1e6) return `${+(r / 1e6).toFixed(2)}M`;
  if (r >= 1e3) return `${+(r / 1e3).toFixed(2)}k`;
  return `${+r.toFixed(2)}`;
}

/** Ohm's law: give two of volts, amps, ohms; get all three and the power. Null if fewer than two. */
export function ohmsLaw({ v, i, r }) {
  const has = (x) => Number.isFinite(x) && x > 0;
  if (has(v) && has(i)) r = v / i;
  else if (has(v) && has(r)) i = v / r;
  else if (has(i) && has(r)) v = i * r;
  else return null;
  return { v, i, r, w: v * i };
}

/** The resistor for an LED: (supply − forward voltage) ÷ current. Null if the supply is too low. */
export function ledResistor(supply, forward, mA) {
  const i = mA / 1000;
  if (!(supply > forward) || !(i > 0)) return null;
  const r = (supply - forward) / i;
  const e12 = nearestE12(r);
  const actual = (supply - forward) / e12;
  return { r, e12, mA: actual * 1000, w: actual * actual * e12 };
}

/** A voltage divider: Vout = Vin × R2 ÷ (R1 + R2), and the current through it. */
export function divider(vin, r1, r2) {
  if (!(vin > 0) || !(r1 > 0) || !(r2 > 0)) return null;
  return { vout: (vin * r2) / (r1 + r2), mA: (vin / (r1 + r2)) * 1000 };
}
