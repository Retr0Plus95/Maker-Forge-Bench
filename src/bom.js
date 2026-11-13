// The shopping list (0.4.1): the project's parts grouped by what you buy, with how many and which.
// No page code: unit-tested in Node.

const TYPE_ORDER = (t) => t || 'other';

/** [{ count, value, type, package, refs }], grouped by type, then value. A part's qty counts. */
export function shoppingList(parts) {
  const groups = new Map();
  for (const p of parts) {
    const value = p.value || p.ref;
    const type = TYPE_ORDER(p.type);
    const pkg = p.package || '';
    const key = `${type}\u0000${value}\u0000${pkg}`;
    if (!groups.has(key)) groups.set(key, { count: 0, value, type, package: pkg, refs: [] });
    const g = groups.get(key);
    g.count += Number.isInteger(p.qty) && p.qty > 0 ? p.qty : 1;
    g.refs.push(p.ref);
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) ||
    a.value.localeCompare(b.value, 'en', { numeric: true }) || a.package.localeCompare(b.package));
}

/** "5 × 10k resistor (R4, R7, R8, R9, R13)" per line. */
export function shoppingText(rows) {
  return rows.map((r) => `${r.count} × ${r.value} ${r.type}${r.package ? `, ${r.package}` : ''} (${r.refs.join(', ')})`).join('\n');
}

// A cell a spreadsheet would run as a formula (=, +, -, @) gets an apostrophe in front.
const cell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The list as a CSV file for a spreadsheet. */
export function shoppingCsv(rows) {
  const lines = [['Quantity', 'Value', 'Type', 'Package', 'Parts'], ...rows.map((r) => [r.count, r.value, r.type, r.package, r.refs.join(' ')])];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

const TYPE_LABELS = {
  resistor: 'Resistors', 'capacitor-ceramic': 'Ceramic capacitors', 'capacitor-electrolytic': 'Electrolytic capacitors',
  ic: 'Chips', diode: 'Diodes', led: 'LEDs', transistor: 'Transistors', connector: 'Connectors', crystal: 'Crystals',
  module: 'Modules', potentiometer: 'Potentiometers', switch: 'Switches', fuse: 'Fuses',
};

/** "Resistors" for resistor, and so on. */
export const typeLabel = (type) => TYPE_LABELS[type] || (type ? `${type[0].toUpperCase()}${type.slice(1)}` : 'Other parts');

/** The checklist grouped by type (0.5 improvement 19), groups A to Z, parts in their own order. */
export function groupByType(parts) {
  const groups = new Map();
  for (const p of parts) {
    const label = typeLabel(p.type);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(p);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, list]) => ({ label, parts: list }));
}
