import test from 'node:test';
import assert from 'node:assert/strict';
import { capacitorCode, ohms, picofarads, resistorBands } from '../../src/markings.js';
import { libraryFor, pinName } from '../../src/library.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));
const part = (ref) => project.parts.find((p) => p.ref === ref);

test('resistor values read the way they are written', () => {
  assert.equal(ohms('10k'), 10000);
  assert.equal(ohms('4.7k'), 4700);
  assert.equal(ohms('4k7'), 4700);
  assert.equal(ohms('330R'), 330);
  assert.equal(ohms('10 kΩ'), 10000);
  assert.equal(ohms('1M'), 1e6);
  assert.equal(ohms('2.2'), 2.2);
  assert.equal(ohms('100 nF'), null);
});

test('colour bands from the value', () => {
  assert.deepEqual(resistorBands('10k'), ['brown', 'black', 'orange', 'gold']);
  assert.deepEqual(resistorBands('4.7k'), ['yellow', 'violet', 'red', 'gold']);
  assert.deepEqual(resistorBands('330R'), ['orange', 'orange', 'brown', 'gold']);
  assert.deepEqual(resistorBands('1M'), ['brown', 'black', 'green', 'gold']);
  assert.deepEqual(resistorBands('4.7'), ['yellow', 'violet', 'gold', 'gold']);
  assert.deepEqual(resistorBands('100'), ['brown', 'black', 'brown', 'gold']);
  assert.equal(resistorBands('nope'), null);
});

test('ceramic capacitor codes from the value', () => {
  assert.equal(picofarads('100 nF'), 100000);
  assert.equal(picofarads('4n7'), 4700);
  assert.equal(capacitorCode('100 nF'), '104');
  assert.equal(capacitorCode('10 nF'), '103');
  assert.equal(capacitorCode('4.7 nF'), '472');
  assert.equal(capacitorCode('1 µF'), '105');
  assert.equal(capacitorCode('1uF'), '105');
  assert.equal(capacitorCode('22 pF'), '22');
  assert.equal(capacitorCode('10k'), null);
});

test('the library knows the project parts by value, part name or type', () => {
  assert.equal(libraryFor(part('U2')).id, 'atmega328p');
  assert.equal(libraryFor(part('U1')).id, 'mp1584');
  assert.equal(libraryFor(part('Q1')).id, '2n2222');
  assert.equal(libraryFor(part('D1')).id, 'rectifier');
  assert.equal(libraryFor(part('D2')).id, 'led');
  assert.equal(libraryFor(part('C10')).id, 'electrolytic');
  assert.equal(libraryFor(part('Y1')).id, 'crystal');
  assert.equal(libraryFor(part('RV1')).id, 'potentiometer');
  assert.equal(libraryFor(part('R8')), null);
  assert.equal(libraryFor(null), null);
});

test('pin names, with their sources', () => {
  const chip = libraryFor(part('U2'));
  assert.equal(pinName(chip, '4'), 'PD2 INT0 · D2');
  assert.equal(pinName(chip, '7'), 'VCC');
  assert.equal(pinName(chip, '99'), '');
  assert.equal(pinName(libraryFor(part('U1')), 'OUTp'), 'OUT+');
  assert.match(chip.source, /datasheet/i);
});
