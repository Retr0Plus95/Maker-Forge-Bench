// The pin view (0.4 design F2): where each pin of a chip or header sits in a simple drawing, seen
// from the top or from underneath. No page code: unit-tested in Node.

const numeric = (names) => names.every((n) => /^\d+$/.test(n));

/**
 * The drawing's layout for a board part: { kind: 'dip'|'row', rows, cols, pins: [{ pin, col, row, labelSide }] },
 * or null for parts with fewer than three pins.
 * - dip: two columns, the notch at the top; numbered counter-clockwise seen from the top (pin 1 top
 *   left, down to N/2, up the right side to N). Underneath, the columns swap.
 * - row: one column, pins in order (headers, transistors, modules).
 */
export function pinLayout(part, side = 'top') {
  if (!part) return null;
  const names = Object.keys(part.pins);
  if (names.length < 3) return null;
  const under = side === 'bottom';
  if (part.type === 'dip' && numeric(names) && names.length % 2 === 0) {
    const n = names.length;
    const half = n / 2;
    const pins = names.map(Number).sort((a, b) => a - b).map((k) => {
      const left = k <= half; // seen from the top
      const col = left !== under ? 0 : 1;
      return { pin: String(k), col, row: left ? k - 1 : n - k, labelSide: col === 0 ? 'left' : 'right' };
    });
    return { kind: 'dip', rows: half, cols: 2, pins };
  }
  const ordered = numeric(names) ? [...names].sort((a, b) => Number(a) - Number(b)) : names;
  return { kind: 'row', rows: ordered.length, cols: 1, pins: ordered.map((pin, row) => ({ pin, col: 0, row, labelSide: 'right' })) };
}
