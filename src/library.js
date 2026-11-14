// The Bench parts library (0.5 big improvement B5): common parts' pin names, which way round they
// go and a short how-to, each with where it comes from. Matched to a project's parts by value, part
// name or type. Data only, no page code.

const ATMEGA328P_PINS = {
  1: 'PC6 RESET', 2: 'PD0 RXD · D0', 3: 'PD1 TXD · D1', 4: 'PD2 INT0 · D2', 5: 'PD3 INT1 · D3', 6: 'PD4 · D4',
  7: 'VCC', 8: 'GND', 9: 'PB6 XTAL1', 10: 'PB7 XTAL2', 11: 'PD5 · D5', 12: 'PD6 · D6', 13: 'PD7 · D7', 14: 'PB0 · D8',
  15: 'PB1 OC1A · D9', 16: 'PB2 OC1B · D10', 17: 'PB3 MOSI · D11', 18: 'PB4 MISO · D12', 19: 'PB5 SCK · D13', 20: 'AVCC',
  21: 'AREF', 22: 'GND', 23: 'PC0 ADC0 · A0', 24: 'PC1 ADC1 · A1', 25: 'PC2 ADC2 · A2', 26: 'PC3 ADC3 · A3',
  27: 'PC4 SDA · A4', 28: 'PC5 SCL · A5',
};

export const LIBRARY = [
  {
    id: 'atmega328p', name: 'ATmega328P (DIP-28)', match: { value: /atmega\s*328/i },
    pins: ATMEGA328P_PINS,
    polarity: 'The notch, or a dot, marks the pin 1 end.',
    howTo: 'Put it in a socket and solder the socket, never the chip. Pins 7 (VCC) and 20 (AVCC) go to +5 V, 8 and 22 to 0 V, with a 100 nF capacitor across each pair right at the chip. A 16 MHz crystal goes across pins 9 and 10, with 22 pF from each to 0 V. Pin 1 (RESET) needs a 10k pull-up to +5 V.',
    source: 'Microchip ATmega328P datasheet, DIP-28 pin configuration; Arduino Uno pin mapping',
  },
  {
    id: 'mp1584', name: 'MP1584 buck module', match: { value: /mp1584/i },
    pins: { INp: 'IN+', INn: 'IN−', OUTp: 'OUT+', OUTn: 'OUT−' },
    polarity: 'IN+ and OUT+ are marked on the board. Supply backwards and it dies.',
    howTo: 'Set it before connecting anything: power IN with 12 V, turn the little screw until OUT+ reads 5.00 V on a meter, then connect the rest. IN− and OUT− are the same 0 V.',
    source: 'MP1584EN module listings (MPS MP1584 datasheet for the chip)',
  },
  {
    id: 'l7805', name: 'L7805 5 V regulator (TO-220)', match: { value: /\b(l|lm|ua|mc)?78(m)?05/i },
    pins: { IN: 'input (7–35 V)', GND: '0 V (the tab too)', OUT: '+5 V out' },
    polarity: 'The metal tab is GND (0 V). In backwards, the 5 V side sees the full input voltage.',
    howTo: 'Print facing you, legs down: IN, GND, OUT. A 330 nF capacitor from IN to GND and 100 nF from OUT to GND, close to its legs. It turns the extra voltage into heat, (IN − 5 V) × current: from 12 V, 0.1 A makes 0.7 W (warm). Above about 1 W, bolt it to a heatsink through the tab\'s hole.',
    source: 'ST L78 series datasheet (L7805CV, TO-220)',
  },
  {
    id: '2n2222', name: '2N2222A / PN2222A (TO-92)', match: { value: /\b(2n|pn)2222/i },
    pins: { E: 'emitter', B: 'base', C: 'collector' },
    polarity: 'Flat face towards you, legs down: E, B, C from left to right (check your maker\'s datasheet: a few swap them).',
    howTo: 'An NPN switch: the load goes between + and the collector, the emitter to 0 V, and the base through a resistor (about 1k) from the chip pin.',
    source: 'ON Semiconductor PN2222A datasheet, TO-92 pinout',
  },
  {
    id: 'bc547', name: 'BC547 (TO-92)', match: { value: /bc54[6-9]/i },
    pins: { C: 'collector', B: 'base', E: 'emitter' },
    polarity: 'Flat face towards you, legs down: C, B, E from left to right, the other way round from a 2N2222.',
    howTo: 'An NPN switch for small loads (up to 100 mA): emitter to 0 V, base through a resistor.',
    source: 'BC547 datasheet (Fairchild/ON), TO-92 pinout',
  },
  {
    id: 'rectifier', name: 'Rectifier diode (1N400x, 1N540x)', match: { value: /1n(400[1-7]|540[0-8])/i },
    pins: { K: 'cathode (band)', A: 'anode' },
    polarity: 'The band is the cathode (K).',
    howTo: 'Current flows from the anode to the band. Big ones like the 1N5402 need 1.3–1.5 mm holes.',
    source: 'Vishay 1N4001–1N4007 and 1N5400–1N5408 datasheets',
  },
  {
    id: 'led', name: 'LED', match: { type: /^led$/i, value: /\bled\b/i },
    pins: { A: 'anode (+)', K: 'cathode (−)', 1: 'anode (+)', 2: 'cathode (−)' },
    polarity: 'The long leg is the anode (+). The flat edge on the rim, and the bigger piece inside, are the cathode (−).',
    howTo: 'Always with a resistor in series: (supply − 2 V) ÷ current. 330 Ω from 5 V gives about 9 mA.',
    source: 'Common 5 mm LED datasheets (Kingbright L-7104 family)',
  },
  {
    id: 'electrolytic', name: 'Electrolytic capacitor', match: { type: /electrolytic/i },
    pins: { p: '+ (long leg)', n: '− (stripe)' },
    polarity: 'The stripe down the side marks the − leg. The long leg is +.',
    howTo: 'Use a voltage rating well above the line it sits on (16 V or more on 5 V, 25 V or more on 12 V). In backwards, it can pop.',
    source: 'Nichicon / Panasonic aluminium electrolytic general notes',
  },
  {
    id: 'crystal', name: 'Crystal (HC-49)', match: { type: /crystal/i, value: /\bmhz\b/i },
    pins: { 1: 'leg 1', 2: 'leg 2' },
    polarity: 'Either way round.',
    howTo: 'Keep it right next to the chip\'s XTAL pins, with a 22 pF capacitor from each leg to 0 V.',
    source: 'ATmega328P datasheet, crystal oscillator section',
  },
  {
    id: 'potentiometer', name: 'Potentiometer', match: { type: /potentiometer/i },
    pins: { 1: 'end', 2: 'wiper', 3: 'end' },
    polarity: 'The middle leg is the wiper. Swap the outer legs to turn the direction round.',
    howTo: 'Outer legs to +5 V and 0 V, the wiper to an analogue pin: it reads 0 to 1023 as you turn it.',
    source: 'Common 3-leg potentiometer wiring',
  },
  {
    id: 'fan4', name: '4-pin PC fan header', match: { value: /4-pin fan/i },
    pins: { 1: '0 V', 2: '+12 V', 3: 'tach (speed out)', 4: 'PWM (speed in)' },
    polarity: 'The plastic key lets the fan plug in only one way.',
    howTo: 'Pin 3 pulses twice a turn and needs a pull-up; pin 4 takes a 25 kHz PWM signal.',
    source: 'Intel 4-wire PWM controlled fan specification, rev. 1.3',
  },
];

/** The library entry for a part (by value or part name first, then by type), or null. */
export function libraryFor(part) {
  if (!part) return null;
  const text = `${part.value || ''} ${part.part || ''}`;
  const byValue = LIBRARY.find((e) => e.match.value && e.match.value.test(text) && !e.match.type);
  if (byValue) return byValue;
  return LIBRARY.find((e) => (e.match.type && e.match.type.test(part.type || '')) || (e.match.value && e.match.value.test(text))) || null;
}

/** A pin's name from the library ("PD2 INT0 · D2"), or ''. */
export function pinName(entry, pin) {
  return entry && entry.pins && entry.pins[pin] ? entry.pins[pin] : '';
}
