// The fault finder (1.0.2, roadmap L1): from what you see ("the fans always run at full speed") to
// the meter checks that find the cause, made from the project's own connections and the parts'
// roles, with nothing written by hand. No page code: unit-tested in Node.
import { isGroundLabel, isPowerLabel, pinText } from './wiring.js';
import { pinLayout } from './pinout.js';
import { resistorBands } from './markings.js';
import { bridgeRisks } from './bridges.js';

const MAX_DEPTH = 4;
const TOL = 0.1; // ±10 %
const leg = (ref, pin) => ({ ref, pin, text: `${ref} ${pinText(pin)}` });
const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const volts = (label) => Number(String(label).replace(/[^\d.]/g, '')) || 0;
const fmt = (v) => String(Math.round(v * 100) / 100);

/** The power rails: Map net → volts, from labels like "+12 V" and "0 V" (a net called GND is 0 V). */
export function railsOf(board) {
  const rails = new Map();
  if (!board || !board.nets) return rails;
  for (const net of Object.keys(board.nets)) {
    const label = (board.netLabels && board.netLabels[net]) || net;
    if (isGroundLabel(label, net)) rails.set(net, 0);
    else if (isPowerLabel(label)) rails.set(net, volts(label));
  }
  return rails;
}

const label = (board, net) => (board.netLabels && board.netLabels[net]) || net;

/** Which net each leg is on: Map "ref:pin" → net. */
function netIndex(board) {
  const index = new Map();
  for (const [net, members] of Object.entries(board.nets || {})) for (const [ref, pin] of members) index.set(`${ref}:${pin}`, net);
  return index;
}

/** The project's part by ref, with the board's footprint type as a fallback kind. */
function kindOf(project, ref) {
  const part = project.parts.find((p) => p.ref === ref);
  const type = part && part.type ? part.type : '';
  if (type) return type;
  const foot = project.board && project.board.parts[ref] ? project.board.parts[ref].type : '';
  return foot === 'dip' ? 'ic' : foot === 'header' ? 'connector' : foot || '';
}
const partOf = (project, ref) => project.parts.find((p) => p.ref === ref) || { ref };
const isConnector = (type) => /connector|header/.test(type);

/** "Fan A: pin 1 is 0 V, pin 2 +12 V" → { 1: '0 V', 2: '+12 V' }: what each pin of a connector goes to. */
export function pinNames(part) {
  const role = part && part.role ? String(part.role) : '';
  const colon = role.indexOf(':');
  const list = colon >= 0 ? role.slice(colon + 1) : role;
  const names = {};
  for (const item of list.split(',')) {
    const m = item.trim().replace(/\.$/, '').match(/^(?:pins?\s+)?(\d+)\s+(?:is\s+)?(.+)$/i);
    if (m) names[m[1]] = m[2].trim();
  }
  return names;
}

/** The part of a role before its colon: "Fan A", "To the LCD's I²C backpack". */
const headOf = (part) => {
  const role = part && part.role ? String(part.role) : '';
  const colon = role.indexOf(':');
  return colon >= 0 ? role.slice(0, colon) : role;
};

/** Where power comes in: { ref, top: { net, pin }, ground: { net, pin } } or null. */
export function wayIn(project) {
  const board = project && project.board;
  if (!board) return null;
  const rails = railsOf(board);
  const highest = [...rails].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  const ground = [...rails].find(([, v]) => v === 0);
  if (!highest || !ground) return null;
  const index = netIndex(board);
  const candidates = [];
  for (const part of project.parts) {
    if (!isConnector(kindOf(project, part.ref)) || !board.parts[part.ref]) continue;
    const pins = Object.keys(board.parts[part.ref].pins);
    const top = pins.find((p) => index.get(`${part.ref}:${p}`) === highest[0]);
    const low = pins.find((p) => index.get(`${part.ref}:${p}`) === ground[0]);
    if (top && low) candidates.push({ ref: part.ref, top: { net: highest[0], pin: top }, ground: { net: ground[0], pin: low }, power: /power|supply|jack|battery/i.test(headOf(part)) });
  }
  const pick = candidates.find((c) => c.power) || candidates[0];
  if (!pick) return null;
  return { ref: pick.ref, top: pick.top, ground: pick.ground };
}

const KINDS = [
  ['power', /\b(power|supply|jack|battery)\b/i],
  ['fan', /\bfans?\b/i],
  ['display', /\b(lcd|oled|display|screen)\b/i],
  ['button', /\b(button|push-?button)\b/i],
  ['light', /\b(led|light|lamp)\b/i],
  ['knob', /\b(knob|pot|potentiometer|wiper)\b/i],
];
const kindIn = (text) => (KINDS.find(([, re]) => re.test(text)) || [null])[0];

/**
 * What can be wrong, from what's on the board: [{ id, title, kind, ref?, pins?, warn? }].
 * Power and heat first, then each chip, then each connector by what its role says it goes to
 * (in parts order), then LEDs, knobs and buttons on the board itself.
 */
export function symptomsFor(project) {
  const board = project && project.board;
  if (!board || !board.nets || !board.parts) return [];
  const rails = railsOf(board);
  const index = netIndex(board);
  const out = [];
  if (rails.size >= 2) {
    out.push({ id: 'power', kind: 'power', title: 'Nothing happens when I switch it on' });
    out.push({ id: 'hot', kind: 'hot', title: 'Something gets hot, smokes or smells', warn: 'Switch off and unplug it now. Let it cool before you touch anything.' });
  }
  const onBoard = project.parts.filter((p) => board.parts[p.ref]);
  for (const part of onBoard) {
    if (kindOf(project, part.ref) === 'ic' && Object.keys(board.parts[part.ref].pins).length >= 8) {
      out.push({ id: `chip:${part.ref}`, kind: 'chip', ref: part.ref, title: `${part.ref}${part.value ? ` (${part.value})` : ''} doesn't seem to run` });
    }
  }
  const signalPins = (ref) => Object.keys(board.parts[ref].pins).filter((p) => index.has(`${ref}:${p}`) && !rails.has(index.get(`${ref}:${p}`)));
  for (const part of onBoard) {
    const type = kindOf(project, part.ref);
    const ref = part.ref;
    if (isConnector(type)) {
      const head = headOf(part);
      const kind = kindIn(head) || kindIn(part.value || '');
      const pins = Object.keys(board.parts[ref].pins);
      if (kind === 'power') continue;
      if (kind === 'fan') {
        const name = /\bfans?\b/i.test(head) && head.length <= 24 && !/^to\b/i.test(head) ? ucfirst(head.trim()) : 'The fan';
        out.push({ id: `fan-still:${ref}`, kind: 'fan-still', ref, pins, title: `${name} (${ref}) doesn't spin` });
        out.push({ id: `fan-full:${ref}`, kind: 'fan-full', ref, pins, title: `${name} (${ref}) always runs at full speed` });
      } else if (kind === 'display') {
        const text = `${head} ${part.value || ''}`;
        const noun = /lcd/i.test(text) ? 'LCD' : /oled/i.test(text) ? 'OLED' : 'display';
        out.push({ id: `display:${ref}`, kind: 'display', ref, pins, title: `The ${noun} (${ref}) stays blank` });
      } else if (kind === 'button') {
        out.push({ id: `button:${ref}`, kind: 'button', ref, pins, title: `The button (${ref}) does nothing` });
      } else if (kind === 'light' && signalPins(ref).length) {
        out.push({ id: `light:${ref}`, kind: 'light', ref, pins, title: `The light on ${ref} doesn't light` });
      } else if (kind === 'knob') {
        out.push({ id: `knob:${ref}`, kind: 'knob', ref, pins, title: `The knob (${ref}) does nothing` });
      } else {
        const names = pinNames(part);
        for (const pin of signalPins(ref)) {
          const name = names[pin] || '';
          const pinKind = kindIn(name);
          if (pinKind === 'light') out.push({ id: `light:${ref}:${pin}`, kind: 'light', ref, pins: [pin], title: `${ucfirst(name)} (${ref} pin ${pin}) doesn't light` });
          else if (pinKind === 'knob') out.push({ id: `knob:${ref}:${pin}`, kind: 'knob', ref, pins: [pin], title: `The knob (${ref} pin ${pin}) does nothing` });
          else if (pinKind === 'button') out.push({ id: `button:${ref}:${pin}`, kind: 'button', ref, pins: [pin], title: `The button (${ref} pin ${pin}) does nothing` });
        }
      }
    }
  }
  for (const part of onBoard) {
    const type = kindOf(project, part.ref);
    const what = part.value ? ` (${part.value})` : '';
    const pins = Object.keys(board.parts[part.ref].pins);
    if (type === 'led') out.push({ id: `light:${part.ref}`, kind: 'light', ref: part.ref, pins, own: true, title: `${part.ref}${what} doesn't light` });
    else if (type === 'potentiometer') out.push({ id: `knob:${part.ref}`, kind: 'knob', ref: part.ref, pins, own: true, title: `Turning ${part.ref}${what} does nothing` });
    else if (type === 'switch') out.push({ id: `button:${part.ref}`, kind: 'button', ref: part.ref, pins, own: true, title: `Pressing ${part.ref}${what} does nothing` });
  }
  return out;
}

/**
 * What's connected to a thing's pins, walking through resistors, transistors, diodes and the like
 * (up to 4 parts deep), stopping at chips, connectors and the rails. Capacitors are noted, not
 * walked through. { parts: [ref], nets: [net], chipPins: [{ ref, pin }] }, in walking order.
 */
export function pathOf(project, ref, pins) {
  const board = project.board;
  const rails = railsOf(board);
  const index = netIndex(board);
  const parts = [];
  const nets = [];
  const chipPins = [];
  const seenParts = new Set([ref]);
  const seenNets = new Set();
  let queue = [];
  for (const pin of pins) {
    const net = index.get(`${ref}:${pin}`);
    if (net && !rails.has(net) && !seenNets.has(net)) {
      seenNets.add(net);
      queue.push(net);
    }
  }
  for (let depth = 0; queue.length; depth++) {
    const next = [];
    for (const net of queue) {
      nets.push(net);
      for (const [other, pin] of board.nets[net]) {
        if (other === ref) continue;
        const type = kindOf(project, other);
        if (type === 'ic') {
          if (!chipPins.some((c) => c.ref === other && c.pin === pin)) chipPins.push({ ref: other, pin });
          continue;
        }
        if (isConnector(type) || seenParts.has(other)) continue;
        seenParts.add(other);
        parts.push(other);
        if (/^capacitor/.test(type) || depth + 1 >= MAX_DEPTH || !board.parts[other]) continue;
        for (const p of Object.keys(board.parts[other].pins)) {
          const n = index.get(`${other}:${p}`);
          if (n && !rails.has(n) && !seenNets.has(n)) {
            seenNets.add(n);
            next.push(n);
          }
        }
      }
    }
    queue = next;
  }
  return { parts, nets, chipPins };
}

// ---- the checks ----

/** Where a probe goes for a rail: the way in's pin, else the pin of the part that makes it, else a connector pin, else the first leg. */
function railPoint(project, net, not) {
  const board = project.board;
  const way = wayIn(project);
  if (way && way.ref !== not) {
    if (way.top.net === net) return leg(way.ref, way.top.pin);
    if (way.ground.net === net) return leg(way.ref, way.ground.pin);
  }
  const maker = makerOf(project, net);
  if (maker && maker.ref !== not) return leg(maker.ref, maker.pin);
  const members = board.nets[net].filter(([r]) => r !== not);
  const conn = members.find(([r]) => isConnector(kindOf(project, r)));
  const first = conn || members[0];
  return first ? leg(first[0], first[1]) : null;
}

/** The part that makes a rail: one with a leg on it and a leg on a higher rail (a regulator or a module). */
function makerOf(project, net) {
  const board = project.board;
  const rails = railsOf(board);
  const v = rails.get(net);
  if (!v) return null;
  const index = netIndex(board);
  for (const [ref, pin] of board.nets[net]) {
    const type = kindOf(project, ref);
    if (/^capacitor/.test(type) || isConnector(type) || type === 'ic' || !board.parts[ref]) continue;
    const higher = Object.keys(board.parts[ref].pins).some((p) => (rails.get(index.get(`${ref}:${p}`)) || 0) > v);
    if (higher) return { ref, pin };
  }
  return null;
}

function lookPart(project, ref) {
  const part = partOf(project, ref);
  const what = part.value ? ` (${part.value})` : '';
  const bands = part.type === 'resistor' ? resistorBands(part.value) : null;
  const expect = part.polarized && part.orientation
    ? `Which way round: ${part.orientation}`
    : bands ? `In place and soldered. Bands: ${bands.join(', ')}.` : 'In place, both legs soldered, the value as on the parts list.';
  return {
    id: `look:${ref}`, kind: 'look', power: 'off', refs: [ref],
    text: `Is ${ref}${what} fitted, in its own holes?`,
    expect,
    why: part.role || '',
    fix: part.polarized ? `Fit ${ref}${what}, or turn it round: ${part.orientation || 'see its card'}.` : `Fit ${ref}${what}, or reseat and resolder it.`,
  };
}

function beepPair(board, a, b, net) {
  return {
    id: `beep:${a.ref}:${a.pin}|${b.ref}:${b.pin}`, kind: 'beep', power: 'off', refs: [a.ref, b.ref], a, b,
    text: `Probes on ${a.text} and ${b.text}.`,
    expect: `It should beep: both are on ${label(board, net)}.`,
    fix: `No connection between ${a.text} and ${b.text}: a joint is open, a wire is missing or a part isn't fitted. Reflow both joints and check what runs between them.`,
  };
}

function shortCheck(project, n1, n2) {
  const board = project.board;
  const a = railPoint(project, n1);
  const b = railPoint(project, n2);
  if (!a || !b) return null;
  return {
    id: `short:${n1}|${n2}`, kind: 'nobeep', power: 'off', refs: [a.ref, b.ref], a, b,
    text: `Probes on ${a.text} (${label(board, n1)}) and ${b.text} (${label(board, n2)}).`,
    expect: 'It must not beep. A short chirp as the capacitors charge is fine; a steady beep is a short.',
    fix: `${label(board, n1)} is shorted to ${label(board, n2)}: look for a solder bridge, a stray wire or a part fitted backwards between them. Don't switch on until it's gone.`,
  };
}

function want(v) {
  return { volts: v, tol: Math.round(v * TOL * 100) / 100 };
}
const wantText = (w) => `About ${fmt(w.volts)} V (${fmt(w.volts - w.tol)} to ${fmt(w.volts + w.tol)} V).`;

function voltsCheck(id, a, ground, w, fix, why = '') {
  return {
    id, kind: 'volts', power: 'on', refs: [a.ref], a, b: ground, ...(w ? { want: w } : {}),
    text: `Black probe on ${ground.text} (0 V), red probe on ${a.text}.`,
    expect: w ? wantText(w) : 'Type what it shows: Bench keeps it for Claude in case the checks run out.',
    why,
    fix,
  };
}

/** A line held up by resistors to a rail with nothing else on it but chip pins: about that rail. */
function pullUpOf(project, net) {
  const board = project.board;
  const rails = railsOf(board);
  const index = netIndex(board);
  let rail = null;
  for (const [ref, pin] of board.nets[net]) {
    const type = kindOf(project, ref);
    if (type === 'ic') continue;
    if (type !== 'resistor' || !board.parts[ref]) return null;
    const other = Object.keys(board.parts[ref].pins).find((p) => p !== pin);
    const v = rails.get(index.get(`${ref}:${other}`));
    if (!v) return null;
    rail = { net: index.get(`${ref}:${other}`), volts: v, by: ref };
  }
  return rail;
}

/** The checks along a thing's path: { off: [looks, beeps], on: [volts] }. */
function pathChecks(project, ref, pins, ground) {
  const board = project.board;
  const path = pathOf(project, ref, pins);
  const off = path.parts.map((r) => lookPart(project, r));
  for (const net of path.nets) {
    const members = board.nets[net];
    for (let k = 1; k < members.length; k++) {
      off.push(beepPair(board, leg(...members[k - 1]), leg(...members[k]), net));
    }
  }
  const on = path.nets.map((net) => {
    const members = board.nets[net];
    const own = members.find(([r]) => r === ref);
    const chip = members.find(([r]) => kindOf(project, r) === 'ic');
    const [r, p] = own || chip || members[0];
    const up = pullUpOf(project, net);
    const w = up ? want(up.volts) : null;
    const fix = up
      ? `${label(board, net)} should be held at about ${fmt(up.volts)} V by ${up.by}: check ${up.by} is fitted and soldered, and that nothing else pulls the line down.`
      : `Keep the reading: compare it with what the line should do, or ask Claude with your readings.`;
    return voltsCheck(`volts:${net}`, leg(r, p), ground, w, fix);
  });
  return { off, on, path };
}

/** The thing's own power: its rail pins, as { top: leg, ground: leg, volts } or null. */
function ownRails(project, ref) {
  const board = project.board;
  const rails = railsOf(board);
  const index = netIndex(board);
  const pins = board.parts[ref] ? Object.keys(board.parts[ref].pins) : [];
  const on = (pin) => rails.get(index.get(`${ref}:${pin}`));
  const ground = pins.find((p) => on(p) === 0);
  const top = pins.filter((p) => on(p) > 0).sort((a, b) => on(b) - on(a))[0];
  if (ground === undefined || top === undefined) return null;
  return { top: leg(ref, top), ground: leg(ref, ground), topNet: index.get(`${ref}:${top}`), groundNet: index.get(`${ref}:${ground}`), volts: on(top) };
}

function railBeeps(project, ref, own) {
  const board = project.board;
  const out = [];
  for (const [mine, net] of [[own.top, own.topNet], [own.ground, own.groundNet]]) {
    const there = railPoint(project, net, ref);
    if (there) out.push(beepPair(board, mine, there, net));
  }
  return out;
}

function railVolts(project, ref, own) {
  const board = project.board;
  return voltsCheck(`railvolts:${ref}`, own.top, own.ground, want(own.volts),
    `${label(board, own.topNet)} isn't reaching ${ref}: check the wires or buses from the rails to ${own.top.text} and ${own.ground.text}.`);
}

function powerOffChecks(project) {
  const board = project.board;
  const rails = [...railsOf(board)].sort((a, b) => b[1] - a[1]);
  const shorts = [];
  for (let i = 0; i < rails.length; i++) {
    for (let j = i + 1; j < rails.length; j++) {
      const c = shortCheck(project, rails[i][0], rails[j][0]);
      if (c) shorts.push(c);
    }
  }
  const index = netIndex(board);
  const railNets = new Set(rails.map(([n]) => n));
  const polarized = project.parts
    .filter((p) => p.polarized && board.parts[p.ref] && !/^(ic|transistor|connector|header)$/.test(p.type || ''))
    .filter((p) => Object.keys(board.parts[p.ref].pins).some((pin) => railNets.has(index.get(`${p.ref}:${pin}`))))
    .map((p) => {
      const c = lookPart(project, p.ref);
      const danger = /electrolytic/.test(p.type || '') ? ' A backwards electrolytic capacitor can get hot and burst.' : /diode/.test(p.type || '') ? ' A backwards diode can short the supply or block it.' : '';
      return { ...c, text: `Is ${p.ref}${p.value ? ` (${p.value})` : ''} the right way round?`, fix: `Take ${p.ref} out and fit it the other way: ${p.orientation || 'see its card'}.${danger}` };
    });
  return { shorts, polarized };
}

const offBoard = (project, re) => project.parts.filter((p) => re.test(p.type || '') && !(project.board.parts[p.ref]));

/** The checks for one symptom, power-off ones first: [{ id, kind, power, text, expect, why, fix, a?, b?, want?, refs }]. */
export function checksFor(symptomId, project) {
  const board = project && project.board;
  if (!board) return [];
  const symptom = symptomsFor(project).find((s) => s.id === symptomId);
  if (!symptom) return [];
  const way = wayIn(project);
  const ground = way ? leg(way.ref, way.ground.pin) : null;
  const rails = railsOf(board);
  let off = [];
  let on = [];
  const ref = symptom.ref;
  const part = ref ? partOf(project, ref) : null;
  const signal = ref ? (symptom.pins || []).filter((p) => !rails.has(netIndex(board).get(`${ref}:${p}`))) : [];

  if (symptom.kind === 'power' || symptom.kind === 'hot') {
    const { shorts, polarized } = powerOffChecks(project);
    if (symptom.kind === 'power') {
      for (const f of offBoard(project, /^fuse$/)) {
        off.push({
          id: `beep:${f.ref}`, kind: 'beep', power: 'off', refs: [f.ref],
          text: `Probes on the two ends of ${f.ref}${f.value ? ` (${f.value})` : ''}.`,
          expect: "It should beep: a fuse that doesn't beep has blown.",
          why: f.role || '',
          fix: `${f.ref} has blown. Find out why first (the short checks below, or the supply connected backwards), then fit a new one of the same rating.`,
        });
      }
      for (const s of offBoard(project, /^switch$/)) {
        off.push({
          id: `look:${s.ref}`, kind: 'look', power: 'off', refs: [s.ref],
          text: `Is ${s.ref}${s.value ? ` (${s.value})` : ''} switched on, with its wires on?`,
          expect: 'Switched on, every wire pushed or soldered on.',
          why: s.role || '',
          fix: `Check ${s.ref}'s wires: when it's on, it joins the supply to the board.`,
        });
      }
      off.push(...shorts, ...polarized);
      if (way && ground) {
        const top = leg(way.ref, way.top.pin);
        on.push(voltsCheck(`volts:${way.top.net}`, top, ground, want(rails.get(way.top.net)),
          `No ${label(board, way.top.net)} at the way in: check the supply, the fuse, the switch and the wires to ${way.ref}.`));
        for (const [net, v] of [...rails].sort((a, b) => b[1] - a[1])) {
          if (!v || net === way.top.net) continue;
          const point = railPoint(project, net);
          const maker = makerOf(project, net);
          const mp = maker ? partOf(project, maker.ref) : null;
          on.push(voltsCheck(`volts:${net}`, point, ground, want(v),
            mp ? `${label(board, net)} is missing or wrong: check ${mp.ref}${mp.value ? ` (${mp.value})` : ''}, which makes it, and its wiring.` : `${label(board, net)} is missing or wrong: check its wiring back to the way in.`,
            mp && mp.role ? `${mp.ref}: ${mp.role}` : ''));
        }
      }
    } else {
      off.push(...shorts, ...polarized);
      for (const m of project.parts.filter((p) => p.type === 'module' && board.parts[p.ref])) {
        off.push({
          id: `module:${m.ref}`, kind: 'look', power: 'off', refs: [m.ref],
          text: `Is ${m.ref}${m.value ? ` (${m.value})` : ''} wired IN to the supply and OUT to the board, as its own silkscreen says?`,
          expect: m.note || m.orientation || 'IN+ and IN− from the supply, OUT+ and OUT− to the board.',
          why: m.role || '',
          fix: `Rewire ${m.ref}: wired backwards or swapped, a module burns out itself or the parts after it.`,
        });
      }
      for (const r of bridgeRisks(board).filter((x) => x.kind === 'buses')) {
        off.push({
          id: `buses:${r.id}`, kind: 'look', power: 'off', refs: [],
          text: `Look along the two rails for solder between them. ${r.text}`,
          expect: 'A clear gap all the way along.',
          fix: 'Clear the bridge with solder wick or a clean iron tip.',
        });
      }
      on = [];
    }
  } else if (symptom.kind === 'chip') {
    const index = netIndex(board);
    off.push({
      ...lookPart(project, ref),
      text: `Is ${ref}${part.value ? ` (${part.value})` : ''} pressed fully into its place, the right way round, with no leg folded under?`,
      expect: part.orientation ? `Which way round: ${part.orientation}` : 'Pin 1 where the drawing shows it.',
      fix: `Take ${ref} out, straighten any bent leg and put it back the right way round${part.orientation ? `: ${part.orientation}` : ''}.`,
    });
    const layout = pinLayout(board.parts[ref], 'top');
    if (layout) {
      const byPlace = new Map(layout.pins.map((p) => [`${p.col}:${p.row}`, p.pin]));
      for (const p of layout.pins) {
        const next = byPlace.get(`${p.col}:${p.row + 1}`);
        if (!next) continue;
        const n1 = index.get(`${ref}:${p.pin}`);
        const n2 = index.get(`${ref}:${next}`);
        if (!n1 || !n2 || n1 === n2 || (!rails.has(n1) && !rails.has(n2))) continue;
        const a = leg(ref, p.pin);
        const b = leg(ref, next);
        off.push({
          id: `nobeep:${ref}:${p.pin}|${ref}:${next}`, kind: 'nobeep', power: 'off', refs: [ref], a, b,
          text: `Probes on ${a.text} and ${b.text}.`,
          expect: `It must not beep: neighbouring pins on different lines (${label(board, n1)} and ${label(board, n2)}).`,
          fix: `Short between ${a.text} and ${b.text}: look for a solder bridge between these neighbouring pins and clear it with solder wick.`,
        });
      }
    }
    const pins = Object.keys(board.parts[ref].pins);
    if (ground) {
      for (const pin of pins.filter((p) => rails.get(index.get(`${ref}:${p}`)) === 0)) {
        off.push(beepPair(board, leg(ref, pin), ground, index.get(`${ref}:${pin}`)));
      }
    }
    const crystalNets = pins.map((p) => index.get(`${ref}:${p}`)).filter((n) => n && board.nets[n].some(([r]) => kindOf(project, r) === 'crystal'));
    const crystals = [...new Set(crystalNets.flatMap((n) => board.nets[n].filter(([r]) => kindOf(project, r) === 'crystal').map(([r]) => r)))];
    for (const x of crystals) {
      const xp = partOf(project, x);
      const caps = [...new Set(crystalNets.flatMap((n) => board.nets[n].filter(([r]) => /^capacitor/.test(kindOf(project, r))).map(([r]) => r)))];
      const capValue = caps.length ? partOf(project, caps[0]).value : '';
      off.push({
        id: `look:${x}`, kind: 'look', power: 'off', refs: [x, ...caps],
        text: `Are ${x}${xp.value ? ` (${xp.value})` : ''}${caps.length ? ` and its capacitors ${caps.join(' and ')}${capValue ? ` (${capValue})` : ''}` : ''} fitted and soldered, with short legs?`,
        expect: 'All in place, close to the chip.',
        why: xp.role || '',
        fix: `Fit or resolder ${[x, ...caps].join(', ')}: without a working clock the chip does nothing.`,
      });
    }
    if (ground) {
      for (const pin of pins) {
        const net = index.get(`${ref}:${pin}`);
        const v = rails.get(net);
        if (v > 0) {
          on.push(voltsCheck(`volts:${ref}:${pin}`, leg(ref, pin), ground, want(v),
            `${label(board, net)} isn't reaching ${ref} ${pinText(pin)}: check the wire or bus from the ${label(board, net)} rail to it.`));
        }
      }
      for (const pin of pins) {
        const net = index.get(`${ref}:${pin}`);
        if (!net || rails.has(net)) continue;
        const up = pullUpOf(project, net);
        if (!up) continue;
        const byPart = partOf(project, up.by);
        on.push(voltsCheck(`volts:${net}`, leg(ref, pin), ground, want(up.volts),
          `${label(board, net)} should be held at about ${fmt(up.volts)} V by ${up.by}: check ${up.by} is fitted and soldered, and that nothing else pulls the line down.`,
          byPart.role ? `${up.by}: ${byPart.role}` : ''));
      }
    }
    on.push({
      id: `program:${ref}`, kind: 'look', power: 'on', refs: [ref],
      text: `Has ${ref} been programmed with the project's code?`,
      expect: 'Yes: a new chip does nothing until it has its program.',
      fix: `Program ${ref} with the project's code (and its bootloader, if it needs one), then try again.`,
    });
  } else {
    const own = ownRails(project, ref);
    const names = pinNames(part);
    const p = pathChecks(project, ref, signal, ground || (own ? own.ground : null));
    if (symptom.kind === 'fan-still') {
      if (own) off.push(...railBeeps(project, ref, own));
      off.push({
        id: `plug:${ref}`, kind: 'look', power: 'off', refs: [ref],
        text: `Is the fan's plug in ${ref} the right way round, and pushed fully on?`,
        expect: part.role || part.orientation || 'The plug the same way round as the header.',
        fix: "Turn the plug round and push it fully on: plugged in the wrong way, a fan doesn't spin.",
      });
      off.push(...p.off);
      if (own) on.push(railVolts(project, ref, own));
      on.push(...p.on);
    } else if (symptom.kind === 'fan-full') {
      const pwm = Object.entries(names).find(([, n]) => /pwm/i.test(n));
      if (pwm) {
        off.push({
          id: `fanpins:${ref}`, kind: 'look', power: 'off', refs: [ref],
          text: `Is the fan a 4-wire (PWM) fan, with a wire in ${ref} ${pinText(pwm[0])}?`,
          expect: 'Four wires. A 3-wire fan has no speed-control wire and always runs at full speed.',
          fix: 'Fit a 4-wire PWM fan: a 3-wire fan can only run at full speed on this board.',
        });
      }
      off.push(...p.off);
      on.push(...p.on);
    } else if (symptom.kind === 'display') {
      off.push({
        id: `order:${ref}`, kind: 'look', power: 'off', refs: [ref],
        text: `Are the wires to the display in the same order as the labels on its module?`,
        expect: part.role || 'Each wire to the pin with the same name.',
        fix: "Swap the wires to match the module's labels: 0 V and the supply swapped can damage it.",
      });
      if (own) off.push(...railBeeps(project, ref, own));
      off.push(...p.off);
      if (own) on.push(railVolts(project, ref, own));
      on.push({
        id: `contrast:${ref}`, kind: 'watch', power: 'on', refs: [ref],
        text: 'Turn the small contrast screw on the back of the display module slowly, all the way one way and then the other. Do letters or a row of blocks show at some point?',
        expect: 'Yes: set it where the letters are clearest. A display with the contrast at one end looks blank.',
        fix: 'Nothing shows at all: check the wiring checks above, then ask Claude with your readings.',
      });
      on.push(...p.on);
    } else if (symptom.kind === 'light') {
      const pin = symptom.own ? null : signal[0];
      const name = pin ? names[pin] || 'the LED' : ref;
      off.push({
        id: `ledway:${symptom.id.slice(6)}`, kind: 'look', power: 'off', refs: [ref],
        text: `Is ${name} the right way round?`,
        expect: symptom.own && part.orientation ? part.orientation : pin ? `The long leg (+) goes to the wire from ${ref} ${pinText(pin)}, the short leg (flat side) to 0 V.` : 'The long leg (+) toward the supply, the short leg (flat side) toward 0 V.',
        fix: 'Turn it round: an LED only lights one way.',
      });
      off.push(...p.off);
      on.push(...p.on);
    } else if (symptom.kind === 'knob') {
      const pin = signal[0];
      const top = own ? own.top : null;
      const low = own ? own.ground : ground;
      const caps = p.path.parts.filter((r) => /^capacitor/.test(kindOf(project, r)));
      if (top && pin) {
        off.push({
          id: `knobwires:${ref}:${pin}`, kind: 'look', power: 'off', refs: [ref],
          text: `Are the knob's outer legs wired to ${top.text} and ${low.text}, and its middle leg to ${ref} ${pinText(pin)}?`,
          expect: part.role || 'Middle leg to the signal pin, outer legs to the supply and 0 V.',
          fix: `Rewire it: the middle leg (wiper) to ${ref} ${pinText(pin)}, the outer legs to ${top.text} and ${low.text}. If it turns the wrong way, swap the outer two.`,
        });
      }
      off.push(...p.off);
      if (low && pin) {
        const capText = caps.length ? `, and that ${caps.join(' and ')} goes from this line to 0 V, not in series with it` : '';
        on.push({
          id: `sweep:${ref}:${pin}`, kind: 'watch', power: 'on', refs: [ref], a: leg(ref, pin), b: low,
          text: `Black probe on ${low.text} (0 V), red probe on ${ref} ${pinText(pin)}. Turn the knob fully one way, then the other. Does the reading go smoothly from about 0 V up to about ${fmt(own ? own.volts : 5)} V?`,
          expect: 'Yes, smoothly from one end to the other.',
          fix: `The knob's line doesn't follow the knob: check the knob's three wires${capText}.`,
        });
      }
      on.push(...p.on);
    } else if (symptom.kind === 'button') {
      const pins = board.parts[ref] ? Object.keys(board.parts[ref].pins) : [];
      if (pins.length >= 2) {
        const a = leg(ref, signal[0] || pins[0]);
        const b = leg(ref, (own && own.ground.pin) || pins.find((x) => x !== a.pin));
        off.push({
          id: `press:${ref}`, kind: 'watch', power: 'off', refs: [ref], a, b,
          text: `Probes on ${a.text} and ${b.text}. Press and hold the button, then let go. Does it beep only while you hold it down?`,
          expect: 'Yes: a beep while pressed, silence when let go.',
          fix: "The button isn't switching: check its two wires and that it's the right kind (a push-to-make button).",
        });
      }
      off.push(...p.off);
      on.push(...p.on);
    }
  }
  const all = [];
  const seen = new Set();
  for (const c of [...off, ...on]) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    all.push(c);
  }
  return all;
}

/** 'ok', 'wrong', 'noted' (a reading with nothing to judge it by) or null (not answered). */
export function judge(check, answer) {
  if (!answer) return null;
  if (check.kind === 'volts') {
    if (!Number.isFinite(answer.reading)) return null;
    if (!check.want) return 'noted';
    return Math.abs(answer.reading - check.want.volts) <= check.want.tol + 1e-9 ? 'ok' : 'wrong';
  }
  if (answer.said !== 'yes' && answer.said !== 'no') return null;
  const yesIsGood = check.kind !== 'nobeep';
  return (answer.said === 'yes') === yesIsGood ? 'ok' : 'wrong';
}

/** Where the checks stand: { done, total, problems: [check], readings: [{ check, reading }], next: index | null }. */
export function faultSummary(checks, answers) {
  const a = answers || {};
  const verdicts = checks.map((c) => judge(c, a[c.id]));
  const next = verdicts.findIndex((v) => v === null);
  return {
    done: verdicts.filter((v) => v !== null).length,
    total: checks.length,
    problems: checks.filter((c, k) => verdicts[k] === 'wrong'),
    readings: checks.filter((c) => c.kind === 'volts' && a[c.id] && Number.isFinite(a[c.id].reading)).map((c) => ({ check: c, reading: a[c.id].reading })),
    next: next >= 0 ? next : null,
  };
}

/** What an answer was, in words: "found a problem", "no beep", "4.9 V". */
export function answerText(check, answer) {
  if (!answer) return '';
  if (check.kind === 'volts') return `${fmt(answer.reading)} V`;
  const yes = answer.said === 'yes';
  if (check.kind === 'beep' || check.kind === 'nobeep') return yes ? 'beeped' : 'no beep';
  if (check.kind === 'look') return yes ? 'looks right' : 'found a problem';
  return yes ? 'yes' : 'no';
}

export const FAULT_SYSTEM = [
  'You help a hobbyist find a fault in an electronics project they built, with the drawings open in an app called Maker Forge Bench.',
  'Below are what is wrong, the checks they did with a multimeter and what they found, and the parts involved with their jobs.',
  'Say the most likely cause first, then what to check or measure next, in plain words for someone who solders but is not an engineer.',
  'Be short: a few sentences or a short list. No headings, no tables, no markdown.',
  'Use the project details given; where they do not say, use general electronics knowledge and say that you are.',
  'If something could damage the parts or hurt someone, say so first.',
].join(' ');

/** The question for Claude: the symptom, the checks done with their answers, and the parts on the path with their roles. */
export function faultQuestion({ project, symptom, checks, answers }) {
  const a = answers || {};
  const lines = [`Question: My project has a fault: "${symptom.title}". I did these checks with a meter. What is the most likely cause, and what should I check next?`];
  if (project && project.name) lines.push(`Project: ${project.name}${project.revision ? ` (${project.revision})` : ''}`);
  const done = checks.filter((c) => judge(c, a[c.id]) !== null);
  if (done.length) {
    lines.push('Checks:');
    for (const c of done) {
      const verdict = judge(c, a[c.id]);
      const what = c.kind === 'volts' ? c.text.replace(/^Black probe on .*?, red probe on /, 'Volts on ').replace(/\.$/, '') : c.text.replace(/\.$/, '');
      lines.push(`- ${what}: ${answerText(c, a[c.id])}${verdict === 'wrong' ? ' (not what it should be)' : ''}`);
    }
  } else {
    lines.push('Checks: none done yet.');
  }
  const refs = [...new Set(checks.flatMap((c) => c.refs || []))];
  const parts = refs.map((r) => partOf(project, r)).filter((p) => p.role);
  if (parts.length) {
    lines.push('Parts involved:');
    for (const p of parts) lines.push(`- ${p.ref}${p.value ? ` (${p.value})` : ''}: ${p.role}`);
  }
  return lines.join('\n');
}

/** Answers read back from storage or a file: { [symptomId]: { [checkId]: { said } | { reading } } }; anything odd is dropped. */
export function cleanFaults(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [sid, answers] of Object.entries(raw).slice(0, 100)) {
    if (sid.length > 80 || !answers || typeof answers !== 'object' || Array.isArray(answers)) continue;
    const kept = {};
    for (const [cid, ans] of Object.entries(answers).slice(0, 400)) {
      if (cid.length > 120 || !ans || typeof ans !== 'object') continue;
      if (ans.said === 'yes' || ans.said === 'no') kept[cid] = { said: ans.said };
      else if (typeof ans.reading === 'number' && Number.isFinite(ans.reading) && Math.abs(ans.reading) < 100000) kept[cid] = { reading: ans.reading };
    }
    if (Object.keys(kept).length) out[sid] = kept;
  }
  return out;
}
