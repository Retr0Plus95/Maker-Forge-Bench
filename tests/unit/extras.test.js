import test from 'node:test';
import assert from 'node:assert/strict';
import { divider, ledResistor, nearestE12, ohmsLaw, ohmsText } from '../../src/calc.js';
import { paletteMatch } from '../../src/lookup.js';
import { groupByType, typeLabel } from '../../src/bom.js';

test('nearest standard resistor values', () => {
  assert.equal(nearestE12(330), 330);
  assert.equal(nearestE12(300), 330);
  assert.equal(nearestE12(4600), 4700);
  assert.equal(nearestE12(9.8), 10);
  assert.equal(nearestE12(0), null);
  assert.equal(ohmsText(4700), '4.7k');
  assert.equal(ohmsText(330), '330');
  assert.equal(ohmsText(1e6), '1M');
});

test("Ohm's law from any two", () => {
  assert.deepEqual(ohmsLaw({ v: 5, r: 1000 }), { v: 5, i: 0.005, r: 1000, w: 0.025 });
  assert.equal(ohmsLaw({ v: 12, i: 0.5 }).r, 24);
  assert.equal(ohmsLaw({ i: 0.01, r: 470 }).v, 4.7);
  assert.equal(ohmsLaw({ v: 5 }), null);
});

test("an LED's resistor: 5 V, a 2 V green LED at 10 mA is 300 Ω, so 330 Ω (9 mA)", () => {
  const led = ledResistor(5, 2, 10);
  assert.equal(led.r, 300);
  assert.equal(led.e12, 330);
  assert.ok(Math.abs(led.mA - 9.09) < 0.01);
  assert.equal(ledResistor(2, 2, 10), null);
});

test('a voltage divider', () => {
  const d = divider(12, 10000, 4700);
  assert.ok(Math.abs(d.vout - 3.837) < 0.001);
  assert.ok(Math.abs(d.mA - 0.816) < 0.001);
  assert.equal(divider(12, 0, 4700), null);
});

test('the palette finds things by every word, best matches first', () => {
  const items = [
    { label: 'R8 10k', hint: 'part' }, { label: 'R18 1k', hint: 'part' }, { label: '3D board', hint: 'action' },
    { label: 'Line +5 V', hint: 'line' }, { label: 'SFE-04 Perfboard layout', hint: 'sheet' }, { label: 'Shopping list', hint: 'action' },
  ];
  assert.deepEqual(paletteMatch(items, 'r8').map((i) => i.label), ['R8 10k']);
  assert.deepEqual(paletteMatch(items, 'board').map((i) => i.label), ['3D board', 'SFE-04 Perfboard layout']);
  assert.deepEqual(paletteMatch(items, 'shop list').map((i) => i.label), ['Shopping list']);
  assert.equal(paletteMatch(items, '').length, items.length);
  assert.deepEqual(paletteMatch(items, 'zzz'), []);
});

test('the checklist grouped by type, with names people use', () => {
  assert.equal(typeLabel('resistor'), 'Resistors');
  assert.equal(typeLabel('capacitor-ceramic'), 'Ceramic capacitors');
  assert.equal(typeLabel(undefined), 'Other parts');
  const groups = groupByType([{ ref: 'R1', type: 'resistor' }, { ref: 'C1', type: 'capacitor-ceramic' }, { ref: 'R2', type: 'resistor' }]);
  assert.deepEqual(groups.map((g) => [g.label, g.parts.map((p) => p.ref)]), [['Ceramic capacitors', ['C1']], ['Resistors', ['R1', 'R2']]]);
});
