import test from 'node:test';
import assert from 'node:assert/strict';
import { solderNeeded, stepTips, tipFor, toolsFor } from '../../src/benchtips.js';
import { parseProject } from '../../src/project.js';
import { readFixture } from './helpers.js';

const project = parseProject(readFixture('forge-project/fume-extractor.json'));
const part = (type, extra = {}) => ({ ref: 'X1', value: 'x', type, ...extra });

test('a soldering tip for each kind of part, and none for an unknown one', () => {
  assert.match(tipFor(part('led')), /^LEDs don't like heat: about 3 seconds a leg, then let it cool\. The short leg is minus\.$/);
  for (const type of ['resistor', 'capacitor-ceramic', 'capacitor-electrolytic', 'diode', 'transistor', 'ic', 'connector', 'crystal', 'potentiometer', 'switch', 'fuse', 'module']) {
    assert.equal(typeof tipFor(part(type)), 'string', type);
  }
  assert.match(tipFor(part('ic')), /solder the socket, not the chip/);
  assert.equal(tipFor(part('banana')), null);
  assert.equal(tipFor(part(undefined), 'led'), tipFor(part('led')), "the library's kind when the project names none");
  assert.equal(tipFor(null), null);
});

test('tools for a step, from its parts and what it does', () => {
  assert.deepEqual(toolsFor({ what: ['links'], parts: [] }, []), ['flush cutters', 'wire strippers']);
  assert.deepEqual(toolsFor({ what: ['buses'], parts: [] }, []), ['flush cutters', 'pliers']);
  assert.deepEqual(toolsFor({ what: ['bridges'], parts: [] }, []), []);
  assert.deepEqual(toolsFor({ parts: ['R1', 'D2'] }, [part('resistor'), part('led')]), ['flush cutters', 'pliers']);
  assert.ok(toolsFor({ parts: ['J1'] }, [part('connector')]).includes('tape or Blu-Tack to hold it'));
  assert.deepEqual(toolsFor({ title: 'Power-up checks, before the chip', parts: [] }, []), ['multimeter']);
  assert.deepEqual(toolsFor({ title: 'Something of your own', parts: [] }, []), []);
});

test("a step's tips: one per kind of part, and its own for links, buses and bridges", () => {
  assert.equal(stepTips({ parts: ['R1', 'R2', 'D1'] }, [part('resistor'), part('resistor'), part('led')]).length, 2);
  assert.match(stepTips({ what: ['links'], parts: [] }, [])[0], /Wiring → Wire to cut/);
  assert.match(stepTips({ what: ['buses'], parts: [] }, [])[0], /straight/);
  assert.match(stepTips({ what: ['bridges'], parts: [] }, [])[0], /flow together/);
});

test('joints and solder: every hole with solder in it once, about 8 mm of solder each plus a fifth', () => {
  const board = {
    pitch: 2.54,
    parts: { R1: { pins: { 1: [1, 1], 2: [1, 4] } }, R2: { pins: { 1: [3, 1], 2: [3, 4] } } },
    links: [{ path: [[1, 1], [2, 2], [6, 2]] }], // one end in R1's hole, one in a hole of its own
    bridges: [{ holes: [[1, 4], [3, 4]] }], // both holes are legs already
    buses: [{ row: 5, from: 1, to: 7, net: 'A' }], // soldered at 1, 4 and 7
  };
  assert.deepEqual(solderNeeded(board), { joints: 8, metres: 0.5 });
  assert.deepEqual(solderNeeded(project.board), { joints: 163, metres: 2 });
  assert.equal(solderNeeded(null), null);
});
