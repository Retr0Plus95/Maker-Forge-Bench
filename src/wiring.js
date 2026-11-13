// What to wire (0.4 design F1): every connection in the project's netlist, one group per line, so a
// builder can tick each leg as it's soldered to its line, whatever their own board looks like.
// No page code: unit-tested in Node.

/** A supply line: "+5 V", "+12 V", "+3.3V". */
export const isPowerLabel = (label) => /^\+\s*\d+(\.\d+)?\s*V$/i.test(label);

/** The 0 V line: labelled "0 V" or "GND", or a net called GND. */
export const isGroundLabel = (label, net) => /^(0\s*V|GND|ground)$/i.test(label) || /^GND$/i.test(net || '');

const volts = (label) => Number(label.replace(/[^\d.]/g, '')) || 0;

/** A pin's name the way it's marked on the part: "7" → "pin 7", "p" → "+", "OUTn" → "OUT−". */
export function pinText(pin) {
  if (/^\d+$/.test(pin)) return `pin ${pin}`;
  if (pin === 'p') return '+';
  if (pin === 'n') return '−';
  if (pin === 'K') return 'K (band)';
  return pin.replace(/p$/, '+').replace(/n$/, '−');
}

/** The key a wired tick is saved under: a pin is on one line only. */
export const wireKey = (ref, pin) => `${ref}:${pin}`;

/**
 * The lines that need wiring (two or more members), supplies first (highest first), then 0 V, then
 * the rest A to Z by label: [{ net, label, kind: 'power'|'ground'|'signal', members: [{ key, ref, pin, text }] }].
 */
export function wiringGroups(board) {
  if (!board) return [];
  const groups = [];
  for (const [net, members] of Object.entries(board.nets)) {
    if (members.length < 2) continue;
    const label = board.netLabels[net] || net;
    const kind = isGroundLabel(label, net) ? 'ground' : isPowerLabel(label) ? 'power' : 'signal';
    groups.push({
      net,
      label,
      kind,
      members: members.map(([ref, pin]) => ({ key: wireKey(ref, pin), ref, pin, text: `${ref} ${pinText(pin)}` })),
    });
  }
  const rank = { power: 0, ground: 1, signal: 2 };
  return groups.sort((a, b) => rank[a.kind] - rank[b.kind] ||
    (a.kind === 'power' ? volts(b.label) - volts(a.label) : 0) ||
    a.label.localeCompare(b.label, 'en', { numeric: true }));
}

/** The wiring list as plain text, for copying or printing. */
export function wiringText(groups, wired) {
  const lines = [];
  for (const g of groups) {
    const done = g.members.filter((m) => wired.has(m.key)).length;
    lines.push(`${g.label}: ${done} of ${g.members.length} wired`);
    for (const m of g.members) lines.push(`  [${wired.has(m.key) ? 'x' : ' '}] ${m.text}`);
  }
  return lines.join('\n');
}

/** A part's pins that connect to something but aren't ticked as wired yet, in pin order. */
export function stillToWire(ref, connections, wired) {
  return connections.filter((c) => c.others.length && !wired.has(wireKey(ref, c.pin))).map((c) => c.pin);
}

/**
 * Before power (0.4 improvement 30): from the project's own supply lines, a beep test from each
 * supply to 0 V with the power off, then each supply measured with the chip out of its socket.
 * [{ id, text }], or none when the project has no 0 V line.
 */
export function powerChecks(board) {
  const groups = wiringGroups(board);
  const ground = groups.find((g) => g.kind === 'ground');
  if (!ground) return [];
  const supplies = groups.filter((g) => g.kind === 'power');
  const range = (v) => `${(v * 0.95).toFixed(2).replace(/\.?0+$/, '')} to ${(v * 1.05).toFixed(2).replace(/\.?0+$/, '')} V`;
  return [
    ...supplies.map((g) => ({ id: `short:${g.net}`, text: `Power off, meter on beep: ${g.label} to ${ground.label} must not beep.` })),
    ...supplies.map((g) => ({ id: `measure:${g.net}`, text: `Power on, chip out of its socket: ${g.label} measures ${range(volts(g.label))}.` })),
  ];
}
