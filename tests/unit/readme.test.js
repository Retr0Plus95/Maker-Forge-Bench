// Bench 1.0.4 "How to build it" (docs/design/2026-11-20-release-1.0.4-design.md): the project's README
// read into steps, the drawing's wires of each step, a crop of the drawing, what's missing, mains safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSvg } from '../../src/sanitize.js';
import { readDrawing, sheetTexts } from '../../src/drawing.js';
import {
  MAX_BLOCKS, SAFETY, cropFor, guideNeeds, inline, mentionsMains, parseMarkdown, pathFrom, pickReadme, readGuide, stepWires,
} from '../../src/readme.js';
import { nodeParser, readFixture } from './helpers.js';

const texts = sheetTexts(prepareSvg(readFixture('psu-like/wiring.svg'), nodeParser(), 'w.svg').doc.documentElement);
const reads = [readDrawing('wiring', texts)];
const guide = readGuide(readFixture('psu-like/README.md'));
const section = (role) => guide.sections.find((s) => s.role === role);
const ids = (list) => list.map((x) => x.wire.id);

test('Markdown: headings, paragraphs joined, a rule and a fenced block', () => {
  const blocks = parseMarkdown('# Title #\n\nOne line\nand the next.\n\n---\n\n```\na <b>\n```\n## Two');
  assert.deepEqual(blocks, [
    { t: 'h', level: 1, text: 'Title' },
    { t: 'p', text: 'One line and the next.' },
    { t: 'hr' },
    { t: 'code', text: 'a <b>' },
    { t: 'h', level: 2, text: 'Two' },
  ]);
});

test('Markdown: a numbered list keeps its start, a nested list and a paragraph inside an item', () => {
  const [list] = parseMarkdown('3. **First:** one\n   still one\n4. Second\n   - inner a\n   - inner b\n\n   after inner\n5. Third');
  assert.equal(list.t, 'list');
  assert.equal(list.ordered, true);
  assert.equal(list.start, 3);
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items[0].blocks, [{ t: 'p', text: '**First:** one still one' }]);
  assert.deepEqual(list.items[1].blocks[0], { t: 'p', text: 'Second' });
  assert.equal(list.items[1].blocks[1].t, 'list');
  assert.equal(list.items[1].blocks[1].ordered, false);
  assert.deepEqual(list.items[1].blocks[1].items.map((i) => i.blocks[0].text), ['inner a', 'inner b']);
  assert.deepEqual(list.items[1].blocks[2], { t: 'p', text: 'after inner' });
});

test('Markdown: a table without its alignment row, and a quote read as blocks', () => {
  const [table, quote] = parseMarkdown('| A | B \\| c |\n|:--|--:|\n| 1 | 2 |\n\n> **Note** here\n> more');
  assert.deepEqual(table, { t: 'table', head: ['A', 'B | c'], rows: [['1', '2']] });
  assert.deepEqual(quote, { t: 'quote', blocks: [{ t: 'p', text: '**Note** here more' }] });
});

test('inside a line: bold, italic, code, links and pictures; HTML stays text', () => {
  assert.deepEqual(inline('a **OUT −** b *not* `R7` [the PDF](docs/x.pdf) ![Back](images/b.png) <script>x</script>'), [
    { t: 'text', text: 'a ' }, { t: 'b', text: 'OUT −' }, { t: 'text', text: ' b ' }, { t: 'i', text: 'not' },
    { t: 'text', text: ' ' }, { t: 'code', text: 'R7' }, { t: 'text', text: ' ' }, { t: 'link', text: 'the PDF', href: 'docs/x.pdf' },
    { t: 'text', text: ' ' }, { t: 'img', alt: 'Back', src: 'images/b.png' }, { t: 'text', text: ' <script>x</script>' },
  ]);
  assert.deepEqual(inline('snake_case_name and __bold__'), [{ t: 'text', text: 'snake_case_name and ' }, { t: 'b', text: 'bold' }]);
});

test('a huge README stops at the block limit', () => {
  const blocks = parseMarkdown('para\n\n'.repeat(MAX_BLOCKS + 50));
  assert.equal(blocks.length, MAX_BLOCKS);
});

test('the guide: the build sections in the README order, steps where there is a numbered list', () => {
  assert.deepEqual(guide.sections.map((s) => [s.role, s.kind, s.slug]), [
    ['wiring', 'steps', 'wiring'], ['assembly', 'steps', 'assembly'], ['power', 'steps', 'power'],
    ['safety', 'read', 'safety'], ['trouble', 'read', 'trouble'],
  ]);
  const wiring = section('wiring');
  assert.match(wiring.heading, /^Wiring \(see `wiring\.svg`/);
  assert.equal(wiring.title, 'Wiring');
  assert.deepEqual(wiring.steps.map((s) => s.id), ['readme:wiring:1', 'readme:wiring:2', 'readme:wiring:3', 'readme:wiring:4', 'readme:wiring:5']);
  assert.equal(wiring.after[0].t, 'quote', 'the note after the steps stays with them');
  assert.deepEqual(wiring.steps[0].named, ['W1', 'W2', 'W3']);
  assert.deepEqual(wiring.steps[3].terms, ['Meter (the trap)', 'thin black', 'OUT −']);
  assert.equal(section('trouble').before[0].t, 'table');
});

test("a step's wires: those it names, else (wiring only) those its bold words match on whole words", () => {
  const w = section('wiring').steps;
  assert.deepEqual(ids(stepWires(w[0], 'wiring', reads)), ['W1', 'W2', 'W3']);
  const ac = stepWires(w[1], 'wiring', reads);
  assert.deepEqual(ids(ac), ['W7', 'W8']);
  assert.equal(ac[0].by, 'AC24V');
  assert.deepEqual(ids(stepWires(w[2], 'wiring', reads)), ['W9'], 'named: no matching on top');
  assert.deepEqual(ids(stepWires(w[3], 'wiring', reads)), ['W13'], 'thin black and OUT −, never OUT +');
  assert.deepEqual(ids(stepWires(w[4], 'wiring', reads)), ['W17'], 'W22 is not on the drawing');
  assert.deepEqual(ids(stepWires(section('assembly').steps[1], 'assembly', reads)), [], 'no matching outside wiring');
  const [head] = readGuide('## Wiring\n\n1. Board header **U** → V pot.\n').sections;
  const pots = { sheetId: 's', hasTable: true, wires: [{ id: 'W19', from: 'U1 header U', to: 'RV1' }, { id: 'W20', from: 'U1 header U1', to: 'RV2' }] };
  assert.deepEqual(stepWires(head.steps[0], 'wiring', [pots]).map((x) => x.wire.id), ['W19'], 'a short bold word takes the word before it');
});

test("what's wrong or missing: a wire not on the drawing, a picture not in the folder, wires no step mentions", () => {
  const needs = guideNeeds(guide, reads, (path) => path === 'images/front.png');
  assert.deepEqual(needs.map((n) => n.id), ['readme:wire:readme:wiring:5:W22', 'readme:pic:images/buck.png', 'readme:left']);
  assert.equal(needs[0].text, "Step 5 of Wiring names W22, which isn't on the drawing.");
  assert.equal(needs[1].text, "The README shows images/buck.png, which isn't in the folder.");
  assert.equal(needs[2].text, "No step mentions W18. It's in the Wiring tab.");
  assert.deepEqual(guideNeeds(guide, [], () => true), [], 'without a drawing there is nothing to compare');
});

test('a crop of the drawing around the wires of a step: inside the sheet and wider than high', () => {
  const box = { x: 0, y: 0, w: 600, h: 400 };
  const crop = cropFor(reads[0], texts, ['W7', 'W8'], box);
  assert.ok(crop.w > crop.h);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 600.01 && crop.y + crop.h <= 400.01, JSON.stringify(crop));
  const tag = reads[0].tags.get('W7')[0];
  assert.ok(tag.x >= crop.x && tag.x <= crop.x + crop.w && tag.y >= crop.y && tag.y <= crop.y + crop.h);
  assert.equal(cropFor(reads[0], texts, ['W99'], box), null);
});

test('mains is spotted in words, and the safety list is fixed', () => {
  assert.equal(mentionsMains('This box has 230 V inside it.'), true);
  assert.equal(mentionsMains('mains cable'), true);
  assert.equal(mentionsMains('a 12 V fan, 5 V logic'), false);
  assert.deepEqual(SAFETY.map((s) => s.id), ['unplugged', 'fuse', 'covered', 'apart', 'clamp', 'earth', 'beep']);
  assert.equal(SAFETY[0].text, 'Unplugged: the plug is out of the wall, not just switched off.');
});

test('a picture address that is badly written is kept as written, never an error', () => {
  assert.equal(pathFrom('docs/README.md', '../images/a%ZZ.png'), 'images/a%ZZ.png');
  assert.equal(pathFrom('README.md', './images/my%20photo.png'), 'images/my photo.png');
  const odd = readGuide('## Wiring\n\n1. **Fan:** ![x](a%ZZ.png) W9\n');
  assert.deepEqual(guideNeeds(odd, reads, () => false).map((n) => n.id), ['readme:pic:a%ZZ.png', 'readme:left']);
});

test('the README picked: the one at the top first, else the shallowest', () => {
  assert.equal(pickReadme([{ path: 'docs/README.md' }, { path: 'readme.MD' }, { path: 'a.svg' }]), 'readme.MD');
  assert.equal(pickReadme([{ path: 'a/b/README.md' }, { path: 'z/README.md' }]), 'z/README.md');
  assert.equal(pickReadme([{ path: 'a.svg' }]), null);
});
