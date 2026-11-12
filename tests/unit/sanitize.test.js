import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSvg } from '../../src/sanitize.js';
import { FUME_SVGS, nodeParser, readFixture, serialize } from './helpers.js';

const SVG = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (body, extra = '') => `<svg ${SVG} ${extra}>${body}</svg>`;

// [label, svg, text that must survive (or null)]
const NASTY = [
  ['script element', svg('<script>alert(1)</script><rect width="1" height="1"/>'), '<rect'],
  ['onload on the root', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', null],
  ['onclick on a rect', svg('<rect onclick="alert(1)" width="1" height="1"/>'), '<rect'],
  ['javascript link around text', svg('<a href="javascript:alert(1)"><text>R6</text></a>'), '>R6</text>'],
  ['xlink javascript with a tab', svg('<a xlink:href=" JaVa&#x09;ScRiPt:alert(1)"><text>R7</text></a>', XLINK), '>R7</text>'],
  ['foreignObject with HTML', svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>'), null],
  ['use pointing at another file', svg('<use href="other.svg#a"/><use href="https://x.example/a.svg#a"/>'), null],
  ['use pointing inside the file', svg('<defs><g id="a"/></defs><use href="#a"/>'), 'href="#a"'],
  ['image from the web', svg('<image href="https://x.example/p.png" width="1" height="1"/>'), null],
  ['image that is an SVG', svg('<image href="data:image/svg+xml;base64,PHN2Zy8+" width="1" height="1"/>'), null],
  ['embedded PNG image', svg('<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>'), 'data:image/png;base64,'],
  ['style with a remote url', svg('<rect style="fill:url(https://x.example/t)" width="1" height="1"/>'), '<rect'],
  ['fill with a local url', svg('<rect fill="url(#g)" width="1" height="1"/>'), 'url(#g)'],
  ['style element with @import', svg('<style>@import url(https://x.example/a.css);</style>'), null],
  ['style element with a local url', svg('<style>.a{fill:url(#g)}</style>'), 'url(#g)'],
  ['animate setting href', svg('<a><animate attributeName="href" to="javascript:alert(1)"/><text>x</text></a>'), '>x</text>'],
  ['set adding a handler', svg('<rect width="1" height="1"><set attributeName="onmouseover" to="alert(1)"/></rect>'), '<rect'],
  ['CSS escape in a style', svg('<rect style="fill:u\\rl(https://x.example)" width="1" height="1"/>'), '<rect'],
  ['Sodipodi element', svg('<sodipodi:namedview id="n"/>', 'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"'), null],
  ['Inkscape attribute', svg('<g inkscape:label="Layer 1"><rect width="1" height="1"/></g>', 'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'), '<rect'],
];

const DANGER = /<script|foreignobject|\son[a-z]+=|javascript:|href="(?!#|data:image\/(png|jpeg|gif|webp);base64,)|url\(\s*['"]?[^#\s'"]|@import|<animate|<set\b|sodipodi|inkscape:/;

// Design §10: the fume extractor's sheets "must come out looking identical". They carry a hidden
// <metadata> block (a C2PA content-credentials record) that the cleaner drops; nothing else may change.
test('fume extractor sheets come out looking identical, only hidden metadata goes', () => {
  for (const f of FUME_SVGS) {
    const text = readFixture(f);
    const cleaned = serialize(prepareSvg(text, nodeParser(), f).doc);
    const original = nodeParser().parseFromString(text, 'image/svg+xml');
    const root = original.documentElement;
    for (const m of Array.from(root.getElementsByTagName('metadata'))) m.parentNode.removeChild(m);
    for (const a of Array.from(root.attributes)) {
      if (a.name.startsWith('xmlns:') && a.name !== 'xmlns:xlink') root.removeAttributeNode(a);
    }
    assert.equal(cleaned, serialize(original), f);
  }
});

test('KiCad-style sheet keeps styles, classes and invisible text', () => {
  const r = prepareSvg(readFixture('kicad-like/kicad-like.svg'), nodeParser(), 'kicad-like.svg');
  assert.equal(r.removed, 0);
  const out = serialize(r.doc);
  for (const s of ['style="fill:none;', 'class="stroked-text"', 'opacity="0"', '>R302</text>']) assert.ok(out.includes(s), s);
});

test('nasty files come out harmless', () => {
  for (const [label, input, mustKeep] of NASTY) {
    const out = serialize(prepareSvg(input, nodeParser(), 'nasty.svg').doc);
    assert.doesNotMatch(out.toLowerCase(), DANGER, label);
    if (mustKeep) assert.ok(out.includes(mustKeep), `${label} keeps ${mustKeep}`);
  }
});

test('nasty files report what was removed', () => {
  assert.ok(prepareSvg(NASTY[0][1], nodeParser(), 'nasty.svg').removed >= 1);
});

test('refuses entity declarations', () => assert.throws(
  () => prepareSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg"><text>&a;</text></svg>', nodeParser(), 'bomb.svg'),
  { code: 'entities', message: /^bomb\.svg uses XML entity declarations/ }));

test('refuses too-big files without parsing them', () => {
  let parsed = false;
  assert.throws(() => prepareSvg('<svg/>', { parseFromString() { parsed = true; } }, 'big.svg', 26214401),
    { code: 'too-big', message: "big.svg is bigger than 25 MB, so it wasn't opened. Export it again with fewer details, or split it into sheets." });
  assert.equal(parsed, false);
});

test('refuses half-saved files', () => assert.throws(
  () => prepareSvg(readFixture(FUME_SVGS[3]).slice(0, 5000), nodeParser(), 'SFE-04_Perfboard_Layout.svg'),
  { code: 'broken', message: "SFE-04_Perfboard_Layout.svg couldn't be read: the file is broken or only half-saved. Save it again." }));

test('refuses non-SVG files', () => assert.throws(
  () => prepareSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>', nodeParser(), 'page.svg'),
  { code: 'not-svg', message: "page.svg isn't an SVG drawing." }));

test('refuses more than 200,000 elements', () => assert.throws(
  () => prepareSvg('<svg xmlns="http://www.w3.org/2000/svg">' + '<g/>'.repeat(200001) + '</svg>', nodeParser(), 'many.svg'),
  { code: 'too-many-elements', message: "many.svg has more than 200,000 shapes, so it wasn't opened. Export it with fewer details, or split it into sheets." }));

test('allows a plain DOCTYPE', () => assert.doesNotThrow(() => prepareSvg(
  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>',
  nodeParser(), 'old.svg')));
