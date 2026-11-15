import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checksFor, cleanFaults, faultQuestion, faultSummary, judge, pathOf, pinNames, railsOf, symptomsFor, wayIn,
} from '../../src/faults.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));
const ids = (list) => list.map((c) => c.id);
const byId = (list, id) => list.find((c) => c.id === id);

test('the rails, the way in and the pin names from a connector role', () => {
  assert.deepEqual([...railsOf(project.board)], [['P12V', 12], ['GND', 0], ['P5V', 5]]);
  assert.deepEqual(wayIn(project), { ref: 'J0', top: { net: 'P12V', pin: '1' }, ground: { net: 'GND', pin: '2' } });
  const part = (ref) => project.parts.find((p) => p.ref === ref);
  assert.deepEqual(pinNames(part('J5')), { 1: '+5 V', 2: 'knob wiper', 3: '0 V', 4: 'LED A', 5: 'LED B', 6: '0 V' });
  assert.deepEqual(pinNames(part('J2')), { 1: '0 V', 2: '+12 V', 3: 'the speed (tach) signal', 4: 'PWM' });
  assert.deepEqual(pinNames(part('R4')), {});
});

test('the symptoms come from the board: power, the chip, and what each connector goes to', () => {
  const symptoms = symptomsFor(project);
  assert.deepEqual(ids(symptoms), [
    'power', 'hot', 'chip:U2',
    'fan-still:J2', 'fan-full:J2', 'fan-still:J3', 'fan-full:J3',
    'knob:J5:2', 'light:J5:4', 'light:J5:5', 'display:J4', 'button:J6',
  ], 'in the order of the parts list');
  const title = (id) => byId(symptoms, id).title;
  assert.equal(title('power'), 'Nothing happens when I switch it on');
  assert.equal(title('chip:U2'), "U2 (ATmega328P-PU) doesn't seem to run");
  assert.equal(title('fan-full:J2'), 'Fan A (J2) always runs at full speed');
  assert.equal(title('fan-still:J3'), "Fan B (J3) doesn't spin");
  assert.equal(title('display:J4'), 'The LCD (J4) stays blank');
  assert.equal(title('knob:J5:2'), 'The knob (J5 pin 2) does nothing');
  assert.equal(title('light:J5:5'), "LED B (J5 pin 5) doesn't light");
  assert.equal(title('button:J6'), 'The button (J6) does nothing');
  assert.match(byId(symptoms, 'hot').warn, /^Switch off and unplug it now/);
  assert.deepEqual(symptomsFor({ parts: [], board: null }), []);
});

test('an LED, knob or button on the board itself is a symptom of its own', () => {
  const own = {
    parts: [{ ref: 'D9', type: 'led', value: 'red LED' }, { ref: 'R1', type: 'resistor', value: '1k' }],
    board: {
      parts: { D9: { type: 'led', pins: { A: [1, 1], K: [1, 2] } }, R1: { type: 'resistor', pins: { 1: [2, 1], 2: [2, 4] } } },
      nets: { V: [['R1', '1']], M: [['R1', '2'], ['D9', 'A']], GND: [['D9', 'K']] },
      netLabels: { V: '+5 V', GND: '0 V' },
    },
  };
  const s = symptomsFor(own);
  assert.ok(ids(s).includes('light:D9'));
  assert.equal(byId(s, 'light:D9').title, "D9 (red LED) doesn't light");
});

test('the path from a fan header: through the resistors and the transistor, stopping at the chip and the rails', () => {
  const path = pathOf(project, 'J2', ['3', '4']);
  assert.deepEqual(path.parts, ['R8', 'R12', 'Q1', 'R7', 'R5', 'R6']);
  assert.deepEqual(path.nets, ['TACHA_F', 'PWMBUS', 'TACHA', 'Q1B', 'PWMCTL']);
  assert.deepEqual(path.chipPins, [{ ref: 'U2', pin: '4' }, { ref: 'U2', pin: '15' }]);
});

test('"Fan A always runs at full speed": the fan type, then each part, each joint, then the readings', () => {
  const checks = checksFor('fan-full:J2', project);
  assert.equal(checks[0].id, 'fanpins:J2');
  assert.deepEqual(ids(checks.filter((c) => c.id.startsWith('look:'))), ['look:R8', 'look:R12', 'look:Q1', 'look:R7', 'look:R5', 'look:R6']);
  const q1 = byId(checks, 'look:Q1');
  assert.match(q1.expect, /Flat face toward row 16/);
  assert.match(byId(checks, 'look:R6').why, /fans run at 100 %/);
  const beep = byId(checks, 'beep:R12:2|U2:4');
  assert.equal(beep.kind, 'beep');
  assert.equal(beep.a.text, 'R12 pin 2');
  assert.equal(beep.b.text, 'U2 pin 4');
  const volts = byId(checks, 'volts:PWMBUS');
  assert.equal(volts.power, 'on');
  assert.equal(volts.want, undefined);
  assert.equal(volts.a.text, 'J2 pin 4');
  const firstOn = checks.findIndex((c) => c.power === 'on');
  assert.ok(firstOn > 0 && checks.slice(firstOn).every((c) => c.power === 'on'), 'power-off checks first');
  assert.equal(new Set(ids(checks)).size, checks.length, 'no check twice');
});

test('"U2 doesn\'t seem to run": its way round, shorts at its power pins, 0 V, the rails, reset and the crystal', () => {
  const checks = checksFor('chip:U2', project);
  assert.match(byId(checks, 'look:U2').expect, /Notch LEFT/);
  assert.ok(byId(checks, 'nobeep:U2:7|U2:8'), 'pins 7 (+5 V) and 8 (0 V) sit side by side');
  assert.equal(byId(checks, 'nobeep:U2:7|U2:8').kind, 'nobeep');
  assert.ok(byId(checks, 'beep:U2:8|J0:2'));
  assert.ok(byId(checks, 'beep:U2:22|J0:2'));
  assert.match(byId(checks, 'look:Y1').text, /C6 and C7/);
  assert.deepEqual(byId(checks, 'volts:U2:7').want, { volts: 5, tol: 0.5 });
  assert.deepEqual(byId(checks, 'volts:U2:20').want, { volts: 5, tol: 0.5 });
  assert.deepEqual(byId(checks, 'volts:RST').want, { volts: 5, tol: 0.5 });
  assert.equal(byId(checks, 'volts:RST').a.text, 'U2 pin 1');
  assert.equal(byId(checks, 'volts:RST').b.text, 'J0 pin 2');
});

test('"Nothing happens": the fuse and switch, no shorts, the way round of each polarized part, then the volts', () => {
  const checks = checksFor('power', project);
  assert.deepEqual(ids(checks).slice(0, 5), ['beep:F1', 'look:SW1', 'short:P12V|P5V', 'short:P12V|GND', 'short:P5V|GND']);
  assert.equal(byId(checks, 'short:P5V|GND').kind, 'nobeep');
  assert.equal(byId(checks, 'short:P5V|GND').a.text, 'U1 OUT+');
  for (const ref of ['D1', 'C1A', 'C1B', 'C2', 'C10']) assert.ok(byId(checks, `look:${ref}`), ref);
  assert.deepEqual(byId(checks, 'volts:P12V').want, { volts: 12, tol: 1.2 });
  assert.equal(byId(checks, 'volts:P12V').a.text, 'J0 pin 1');
  assert.match(byId(checks, 'volts:P5V').fix, /U1 \(MP1584EN buck module\)/);
});

test('"Something gets hot": power off only, with the shorts, the polarized parts, the module and the rails side by side', () => {
  const checks = checksFor('hot', project);
  assert.ok(checks.every((c) => c.power === 'off'));
  assert.ok(byId(checks, 'short:P5V|GND'));
  assert.ok(byId(checks, 'look:C1A'));
  assert.ok(byId(checks, 'module:U1'));
  assert.equal(checks.filter((c) => c.id.startsWith('buses:')).length, 2);
});

test('the display, the knob, an LED and the button each get their own checks', () => {
  const lcd = checksFor('display:J4', project);
  assert.ok(byId(lcd, 'order:J4'));
  assert.ok(byId(lcd, 'beep:U2:27|J4:3'));
  const rail = byId(lcd, 'railvolts:J4');
  assert.deepEqual([rail.a.text, rail.b.text, rail.want.volts], ['J4 pin 2', 'J4 pin 1', 5]);
  assert.equal(byId(lcd, 'contrast:J4').kind, 'watch');

  const knob = checksFor('knob:J5:2', project);
  assert.equal(byId(knob, 'sweep:J5:2').kind, 'watch');
  assert.match(byId(knob, 'sweep:J5:2').fix, /C4.*not in series/);
  assert.ok(byId(knob, 'look:C4'));

  const led = checksFor('light:J5:4', project);
  assert.ok(byId(led, 'ledway:J5:4'));
  assert.ok(byId(led, 'look:R2'));

  const button = checksFor('button:J6', project);
  assert.equal(byId(button, 'press:J6').kind, 'watch');
  assert.equal(byId(button, 'press:J6').power, 'off');
  assert.deepEqual(checksFor('nonsense', project), []);
});

test('judging an answer', () => {
  const volts = { kind: 'volts', want: { volts: 5, tol: 0.5 } };
  assert.equal(judge(volts, { reading: 4.98 }), 'ok');
  assert.equal(judge(volts, { reading: 4.2 }), 'wrong');
  assert.equal(judge({ kind: 'volts' }, { reading: 3.1 }), 'noted');
  assert.equal(judge({ kind: 'nobeep' }, { said: 'no' }), 'ok');
  assert.equal(judge({ kind: 'nobeep' }, { said: 'yes' }), 'wrong');
  assert.equal(judge({ kind: 'beep' }, { said: 'no' }), 'wrong');
  assert.equal(judge({ kind: 'look' }, { said: 'yes' }), 'ok');
  assert.equal(judge({ kind: 'look' }, undefined), null);
});

test('where the checks stand, and the question for Claude', () => {
  const checks = checksFor('fan-full:J2', project);
  const answers = { 'fanpins:J2': { said: 'yes' }, 'look:R8': { said: 'yes' }, 'look:R12': { said: 'no' }, 'volts:PWMBUS': { reading: 4.9 } };
  const s = faultSummary(checks, answers);
  assert.equal(s.done, 4);
  assert.equal(s.total, checks.length);
  assert.deepEqual(ids(s.problems), ['look:R12']);
  assert.deepEqual(s.readings.map((r) => [r.check.id, r.reading]), [['volts:PWMBUS', 4.9]]);
  assert.equal(s.next, 3);
  const symptom = symptomsFor(project).find((x) => x.id === 'fan-full:J2');
  const q = faultQuestion({ project, symptom, checks, answers });
  assert.match(q, /^Question: .*"Fan A \(J2\) always runs at full speed"/);
  assert.match(q, /Project: Solder Fume Extractor \(Rev D\)/);
  assert.match(q, /Is R12 \(4\.7k\) fitted.*: found a problem/);
  assert.match(q, /J2 pin 4.*: 4\.9 V/);
  assert.match(q, /R6 \(10k\): Holds Q1 off/);
  assert.doesNotMatch(q, /look:R7/, 'checks not done yet stay out');
});

test('answers read back from storage or a file: anything odd is dropped', () => {
  assert.deepEqual(cleanFaults(null), {});
  assert.deepEqual(cleanFaults({
    'fan-full:J2': { 'look:R12': { said: 'no' }, 'volts:PWMBUS': { reading: 4.9 }, bad: { said: 'maybe' }, worse: { reading: 'x' } },
    junk: 'x',
    empty: {},
  }), { 'fan-full:J2': { 'look:R12': { said: 'no' }, 'volts:PWMBUS': { reading: 4.9 } } });
});
