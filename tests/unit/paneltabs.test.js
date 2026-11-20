import test from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_TABS, cleanTab, panelTabs, sectionsShown, tabOf } from '../../src/paneltabs.js';

const SECTIONS = ['myboard', 'readme', 'steps', 'wiring', 'checks', 'continuity', 'checklist'];

test('five tabs and All, the guide first', () => {
  assert.deepEqual(PANEL_TABS.map((t) => t.label), ['Guide', 'Board', 'Wiring', 'Checks', 'Parts', 'All']);
  assert.equal(panelTabs(undefined).open, 'guide');
});

test('Wires from the drawing (1.0.3), What to wire, then Wire to cut (1.0), all in the Wiring tab', () => {
  assert.deepEqual(PANEL_TABS.find((t) => t.id === 'wiring').sections, ['wires', 'wiring', 'wirecut']);
  assert.equal(tabOf('wires'), 'wiring');
  assert.equal(tabOf('wirecut'), 'wiring');
});

test('a saved tab is checked; anything odd is the guide', () => {
  assert.equal(cleanTab('wiring'), 'wiring');
  assert.equal(cleanTab('all'), 'all');
  for (const odd of [null, 7, 'nope', '__proto__', {}]) assert.equal(cleanTab(odd), 'guide');
});

test('each tab says its count, in words for a screen reader too', () => {
  const { tabs } = panelTabs('guide', { guide: { done: 3, total: 10 }, parts: { done: 41, total: 41 }, wiring: { done: 0, total: 0 } });
  const guide = tabs.find((t) => t.id === 'guide');
  assert.deepEqual([guide.count, guide.aria, guide.done], ['3/10', 'Guide, 3 of 10 done', false]);
  assert.equal(tabs.find((t) => t.id === 'parts').done, true, 'all soldered');
  assert.equal(tabs.find((t) => t.id === 'wiring').count, '', 'nothing to wire: no count');
  assert.equal(tabs.find((t) => t.id === 'all').count, '');
});

test('a tab with nothing in it is left out; if it was open, the first one left shows', () => {
  const r = panelTabs('board', {}, ['board']);
  assert.ok(!r.tabs.some((t) => t.id === 'board'));
  assert.equal(r.open, 'guide');
  assert.equal(panelTabs('board', {}, ['board', 'guide']).open, 'wiring', 'no build steps: the next tab');
  assert.equal(panelTabs('board', {}, []).open, 'board');
});

test('which sections each tab shows; All shows every one', () => {
  assert.deepEqual(sectionsShown('guide', SECTIONS), ['readme', 'steps'], 'the README guide first (1.0.4)');
  assert.deepEqual(sectionsShown('checks', SECTIONS), ['checks', 'continuity']);
  assert.deepEqual(sectionsShown('all', SECTIONS), SECTIONS);
  assert.equal(tabOf('continuity'), 'checks');
  assert.equal(tabOf('checklist'), 'parts');
  assert.equal(tabOf('part-card'), 'all');
});
