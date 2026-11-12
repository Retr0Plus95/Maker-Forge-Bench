// One sheet on screen: zoom, pan and (later) flip and highlight.
// The drawing lives in a shadow root, so a drawing's own <style> rules and ids can't leak into the
// page, and the page's styles can't change the drawing.
import { fitView, panBy, wheelFactor, zoomAt, zoomToRect } from './zoom.js';

export function createViewer(stage) {
  const host = stage.querySelector('#sheet-host');
  const shadow = host.attachShadow({ mode: 'open' });
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
  shadow.append(wrap);

  let view = { scale: 1, x: 0, y: 0 };
  let content = null;
  let size = null;
  let drag = null;

  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  const setView = (next) => {
    view = { ...next };
    wrap.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };
  const stagePoint = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function fit() {
    if (size) setView(fitView(size, stageSize()));
  }

  /** content: { kind: 'svg', root } or { kind: 'image', img } (the img already decoded). */
  function show(next, opts = {}) {
    if (next.kind === 'svg') {
      size = { w: Number(next.root.getAttribute('width')), h: Number(next.root.getAttribute('height')) };
    } else {
      size = { w: next.img.naturalWidth, h: next.img.naturalHeight };
      next.img.width = size.w;
      next.img.height = size.h;
      next.img.style.display = 'block';
    }
    wrap.replaceChildren(next.kind === 'svg' ? next.root : next.img);
    content = next;
    if (opts.keepView) setView(view);
    else fit();
  }

  function clear() {
    wrap.replaceChildren();
    content = null;
    size = null;
  }

  // ---- labels: their box, and the ring around a found one ----
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let ringLayer = null;

  /** el's box in the root's own coordinates (the viewBox's), wherever it sits in groups and transforms. */
  function rootBox(el) {
    const root = content.root;
    const m = root.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const b = el.getBBox();
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** el's box in the SVG element's own pixels, the units zoomToRect works in. */
  function labelRect(el) {
    const box = rootBox(el);
    const vb = content.root.viewBox.baseVal;
    return { x: box.x - vb.x, y: box.y - vb.y, w: box.w, h: box.h };
  }

  // ---- flip to the solder side (design §7.6) ----
  // Mirrors everything in a group, then turns each text back around its own centre so it still
  // reads normally. Kept per drawing, so a sheet stays flipped when you come back to it.
  const flips = new WeakMap(); // root → { group, originals: Map<text, transform | null> }

  function isFlipped() {
    return Boolean(content && content.kind === 'svg' && flips.has(content.root));
  }

  function setFlipped(on) {
    if (!content || content.kind !== 'svg' || on === isFlipped()) return;
    const root = content.root;
    if (on) {
      const vb = root.viewBox.baseVal;
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'bench-flip');
      group.setAttribute('transform', `translate(${2 * vb.x + vb.width} 0) scale(-1 1)`);
      for (const child of Array.from(root.childNodes)) if (child !== ringLayer) group.append(child);
      root.insertBefore(group, ringLayer && ringLayer.parentNode === root ? ringLayer : null);
      const originals = new Map();
      for (const text of Array.from(group.getElementsByTagNameNS(SVG_NS, 'text'))) {
        const before = text.getAttribute('transform');
        const b = text.getBBox();
        originals.set(text, before);
        text.setAttribute('transform', `${before ? before + ' ' : ''}translate(${2 * (b.x + b.width / 2)} 0) scale(-1 1)`);
      }
      flips.set(root, { group, originals });
    } else {
      const { group, originals } = flips.get(root);
      for (const [text, before] of originals) {
        if (before === null) text.removeAttribute('transform');
        else text.setAttribute('transform', before);
      }
      while (group.firstChild) root.insertBefore(group.firstChild, group);
      group.remove();
      flips.delete(root);
    }
    if (ringTarget) ring(ringTarget);
  }

  let ringTarget = null;

  function ring(el) {
    if (ringLayer) ringLayer.remove();
    ringLayer = null;
    ringTarget = null;
    if (!el || !content || content.kind !== 'svg' || !content.root.contains(el)) return;
    ringTarget = el;
    const box = rootBox(el);
    const pad = 4;
    ringLayer = document.createElementNS(SVG_NS, 'g');
    ringLayer.setAttribute('class', 'bench-highlight');
    const rect = document.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of Object.entries({
      x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad,
      fill: 'none', stroke: '#ff2bd6', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke',
    })) rect.setAttribute(k, String(v));
    ringLayer.append(rect);
    content.root.append(ringLayer);
  }

  stage.addEventListener('wheel', (e) => {
    if (!size) return;
    e.preventDefault();
    const [px, py] = stagePoint(e);
    setView(zoomAt(view, wheelFactor(e.deltaY, e.deltaMode), px, py));
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !size) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    setView(panBy(view, e.clientX - drag.x, e.clientY - drag.y));
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('dblclick', (e) => {
    if (!size) return;
    const [px, py] = stagePoint(e);
    setView(zoomAt(view, 2, px, py));
  });

  return {
    show,
    clear,
    fit,
    zoomBy(factor) {
      const s = stageSize();
      setView(zoomAt(view, factor, s.w / 2, s.h / 2));
    },
    panBy(dx, dy) {
      setView(panBy(view, dx, dy));
    },
    zoomToRect(rect) {
      setView(zoomToRect(rect, stageSize()));
    },
    labelRect,
    ring,
    setFlipped,
    isFlipped,
    getView: () => ({ ...view }),
    setView,
    sheetRoot: () => (content && content.kind === 'svg' ? content.root : null),
    stageSize,
  };
}
