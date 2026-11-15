import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGE_WORDS, PORT_WORDS, moduleFacts, moduleText } from '../../src/modules.js';

const index = JSON.parse(readFileSync(new URL('../../src/library/index.json', import.meta.url), 'utf8'));
const byId = (id) => index.parts.find((p) => p.id === id);

test('a module in words', () => {
  assert.deepEqual(moduleFacts(byId('mod-nano')), { size: '45 × 18 mm', holes: 'no mounting holes', ports: 'mini-USB on the left edge', check: false });
  assert.deepEqual(moduleFacts(byId('mod-uno')).holes, '4 mounting holes for M3 screws');
  assert.equal(moduleFacts(byId('mod-uno')).ports, 'USB-B and DC jack on the left edge');
  assert.equal(moduleFacts(byId('mod-esp32devkit')).check, true);
  assert.equal(moduleFacts(byId('mod-hx711')).ports, '');
  assert.equal(moduleFacts(byId('r-axial-din0204-l3.6-d1.6-p5.08-h')), null);
  assert.equal(moduleFacts(null), null);
});

test("several ports: counted, and edge by edge", () => {
  assert.equal(moduleFacts(byId('mod-pi')).ports,
    'two USB-A (×2) and network socket on the right edge; USB-C, micro-HDMI (×2) and audio jack on the front edge');
});

test('the card line', () => {
  assert.equal(moduleText(moduleFacts(byId('mod-nano'))), 'Module: 45 × 18 mm, no mounting holes, mini-USB on the left edge.');
  assert.equal(moduleText(moduleFacts(byId('mod-hx711'))), 'Module: 34 × 20 mm, no mounting holes. Sizes vary between makers: measure yours.');
  assert.equal(moduleText(null), '');
});

test('every port kind in the library has words', () => {
  const kinds = new Set(index.parts.filter((e) => e.module).flatMap((e) => e.module.ports.map((p) => p[2])));
  for (const k of kinds) assert.ok(PORT_WORDS[k], k);
  assert.deepEqual(Object.keys(EDGE_WORDS).sort(), ['x0', 'x1', 'y0', 'y1']);
});
