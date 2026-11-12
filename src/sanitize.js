// The SVG cleaner (design §8). Every drawing passes through prepareSvg before it reaches the page.
// No page code: it works on any DOM Level 2 document, so it runs in browsers and in Node tests.

export const LIMITS = { maxBytes: 26214400, maxElements: 200000 };

export class SheetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SheetError';
    this.code = code;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const KEEP = new Set(('svg g defs symbol use title desc text tspan textPath path rect circle ellipse line ' +
  'polyline polygon image clipPath mask pattern marker linearGradient radialGradient stop style').split(' '));
const UNWRAP = new Set(['a', 'switch']);
const ATTRS = new Set(('id class style transform x y x1 y1 x2 y2 cx cy r rx ry fx fy width height d points ' +
  'pathLength viewBox preserveAspectRatio fill fill-opacity fill-rule stroke stroke-width stroke-opacity ' +
  'stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity font-family ' +
  'font-size font-weight font-style font-variant text-anchor dominant-baseline alignment-baseline ' +
  'baseline-shift letter-spacing word-spacing text-decoration textLength lengthAdjust dx dy rotate ' +
  'startOffset clip-path clip-rule mask marker-start marker-mid marker-end offset stop-color stop-opacity ' +
  'gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform ' +
  'markerWidth markerHeight markerUnits refX refY orient clipPathUnits maskUnits maskContentUnits ' +
  'visibility display color vector-effect shape-rendering text-rendering image-rendering version ' +
  'baseProfile href').split(' '));
const IMAGE_DATA = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/gif;base64,', 'data:image/webp;base64,'];

const MESSAGES = {
  'too-big': (n) => `${n} is bigger than 25 MB, so it wasn't opened. Export it again with fewer details, or split it into sheets.`,
  entities: (n) => `${n} uses XML entity declarations, which can freeze the page, so it wasn't opened. Export it again from your drawing program.`,
  broken: (n) => `${n} couldn't be read: the file is broken or only half-saved. Save it again.`,
  'not-svg': (n) => `${n} isn't an SVG drawing.`,
  'too-many-elements': (n) => `${n} has more than 200,000 shapes, so it wasn't opened. Export it with fewer details, or split it into sheets.`,
};

const fail = (code, name) => new SheetError(code, MESSAGES[code](name));

/** Every url( must point inside the file: url(#id), with optional spaces and quotes. */
function urlsAreLocal(value) {
  const v = value.toLowerCase();
  let i = v.indexOf('url(');
  while (i !== -1) {
    let j = i + 4;
    while (j < v.length && (v[j] === ' ' || v[j] === '\t' || v[j] === '\n' || v[j] === '"' || v[j] === "'")) j++;
    if (v[j] !== '#') return false;
    i = v.indexOf('url(', j);
  }
  return true;
}

/**
 * Things a style may never contain: CSS escapes (they could spell anything), imports, image-set()
 * (it loads pictures without url()), and :host (it would let the drawing restyle the element it
 * lives in and cover the app). CSS comments are removed before looking.
 */
function styleIsSafe(text) {
  if (text.includes('\\')) return false;
  const css = text.toLowerCase().replace(/\/\*[\s\S]*?\*\//g, '');
  return !css.includes('@import') && !css.includes('image-set(') && !css.includes(':host') && urlsAreLocal(css);
}

function hrefIsSafe(element, value) {
  const v = value.trim();
  if (element.localName === 'image') return IMAGE_DATA.some((p) => v.toLowerCase().startsWith(p));
  return v.startsWith('#');
}

function attributeIsSafe(element, attr) {
  const ns = attr.namespaceURI || null;
  const local = attr.localName || attr.name;
  if (ns === XMLNS_NS || attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
    return attr.name === 'xmlns' || attr.name === 'xmlns:xlink';
  }
  if (ns === XLINK_NS) return local === 'href' && hrefIsSafe(element, attr.value);
  if (ns === XML_NS) return local === 'space';
  if (ns !== null || !ATTRS.has(local)) return false;
  if (local === 'href') return hrefIsSafe(element, attr.value);
  if (local === 'style') return styleIsSafe(attr.value);
  return urlsAreLocal(attr.value) && !attr.value.toLowerCase().includes('image-set(');
}

function hasHref(element) {
  return element.hasAttribute('href') || element.hasAttributeNS(XLINK_NS, 'href');
}

function clean(doc, name) {
  const state = { removed: 0, elements: 0 };

  const cleanAttributes = (el) => {
    for (const attr of Array.from(el.attributes)) {
      if (!attributeIsSafe(el, attr)) {
        el.removeAttributeNode(attr);
        state.removed++;
      }
    }
  };

  const keep = (el) => {
    state.elements++;
    if (state.elements > LIMITS.maxElements) throw fail('too-many-elements', name);
    cleanAttributes(el);
  };

  const walk = (parent) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== 1) continue; // text, CDATA and comments stay
      const local = child.localName;
      const isSvg = child.namespaceURI === SVG_NS;
      if (isSvg && KEEP.has(local)) {
        if (local === 'style') {
          // The browser reads a stylesheet from the style's own text only, so child elements or
          // comments could split "@import" or "url(" past the check. Keep just the text.
          for (const node of Array.from(child.childNodes)) {
            if (node.nodeType !== 3 && node.nodeType !== 4) {
              child.removeChild(node);
              state.removed++;
            }
          }
          if (!styleIsSafe(child.textContent || '')) {
            parent.removeChild(child);
            state.removed++;
            continue;
          }
        }
        keep(child);
        if ((local === 'use' || local === 'image') && !hasHref(child)) {
          parent.removeChild(child);
          state.removed++;
          continue;
        }
        walk(child);
      } else if (isSvg && UNWRAP.has(local)) {
        walk(child);
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
        state.removed++;
      } else {
        parent.removeChild(child);
        state.removed++;
      }
    }
  };

  const root = doc.documentElement;
  keep(root);
  walk(root);
  return state;
}

/** Cleans a parsed SVG document in place. */
export function sanitizeSvgDocument(doc) {
  return clean(doc, 'This drawing');
}

/** Checks, parses and cleans one SVG file's text. Throws SheetError with a plain-words message. */
export function prepareSvg(text, parser, name, byteSize = text.length) {
  if (byteSize > LIMITS.maxBytes) throw fail('too-big', name);
  if (/<!ENTITY/i.test(text) || /<!DOCTYPE[^>]*\[/i.test(text)) throw fail('entities', name);
  let doc;
  try {
    doc = parser.parseFromString(text, 'image/svg+xml');
  } catch {
    throw fail('broken', name);
  }
  if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) throw fail('broken', name);
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) throw fail('not-svg', name);
  const { removed, elements } = clean(doc, name);
  return { doc, removed, elements };
}
