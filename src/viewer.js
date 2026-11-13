// One sheet on screen: zoom, pan, flip and the ring around a found label.
// The drawing lives in a shadow root holding nothing but the drawing, so its own <style> rules and
// ids can't reach the page. The zoom is a transform on the host element, outside the shadow tree,
// so the drawing's CSS can't touch it, and it also contains anything the drawing positions as fixed.
import { SCALE_LIMITS, fitView, panBy, scaleLimits, wheelFactor, zoomAt, zoomToRect } from './zoom.js';

export function createViewer(stage, hostSelector = '#sheet-host') {
  const host = stage.querySelector(hostSelector);
  const shadow = host.attachShadow({ mode: 'open' });
  // Bench's own rules inside the shadow root (the drawing's own <style> can't reach out, nor ours in):
  // ticked parts' labels turn green.
  const ownStyle = document.createElement('style');
  ownStyle.textContent = 'text[data-bench-done]{fill:#3ddc84 !important}';

  let view = { scale: 1, x: 0, y: 0 };
  let content = null;
  let size = null;
  let drag = null;
  // True while the sheet shows as fitted and you haven't zoomed or moved it since. A fitted sheet is
  // fitted again when the stage changes size, including when it first gets one: a page opened in a
  // hidden pane has a 0×0 stage when its first sheet is shown.
  let fitted = false;

  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  const apply = (next) => {
    view = { ...next };
    host.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };
  /** Zoom limits for the sheet on screen: they follow its fitted scale (see scaleLimits). */
  const limits = () => {
    const box = stageSize();
    return size && box.w > 0 && box.h > 0 ? scaleLimits(fitView(size, box).scale) : SCALE_LIMITS;
  };
  /** A view you chose (zoom, pan, a found part): the stage changing size leaves it alone. */
  const setView = (next) => {
    fitted = false;
    apply(next);
  };
  const stagePoint = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function fit() {
    fitted = true;
    const box = stageSize();
    if (size && box.w > 0 && box.h > 0) apply(fitView(size, box));
  }

  new ResizeObserver(() => {
    if (fitted) fit();
  }).observe(stage);

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
    shadow.replaceChildren(ownStyle, next.kind === 'svg' ? next.root : next.img);
    content = next;
    if (opts.keepView) apply(view);
    else fit();
  }

  function clear() {
    shadow.replaceChildren(ownStyle);
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
      for (const child of Array.from(root.childNodes)) if (child !== ringLayer && child !== stepLayer && child !== netLayer) group.append(child);
      root.insertBefore(group, root.firstChild); // the rings stay on top, unmirrored
      // Read every label's box first, then write: reading after a write makes the browser lay the
      // whole drawing out again, once per label (a minute on a big layout).
      const texts = Array.from(group.getElementsByTagNameNS(SVG_NS, 'text'));
      const centres = texts.map((text) => {
        const b = text.getBBox();
        return b.x + b.width / 2;
      });
      const originals = new Map();
      texts.forEach((text, i) => {
        const before = text.getAttribute('transform');
        originals.set(text, before);
        text.setAttribute('transform', `${before ? before + ' ' : ''}translate(${2 * centres[i]} 0) scale(-1 1)`);
      });
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
    if (stepTargets.length) stepRings(stepTargets);
    if (netTargets.length) netRings(netTargets);
  }

  let ringTarget = null;

  // ---- the build step's parts: dashed rings in their own layer, beside the Find ring ----
  let stepLayer = null;
  let stepTargets = [];
  function stepRings(elements) {
    if (stepLayer) stepLayer.remove();
    stepLayer = null;
    stepTargets = [];
    if (!content || content.kind !== 'svg') return;
    stepTargets = elements.filter((el) => el && content.root.contains(el));
    if (!stepTargets.length) return;
    stepLayer = document.createElementNS(SVG_NS, 'g');
    stepLayer.setAttribute('class', 'bench-step');
    for (const el of stepTargets) {
      const box = rootBox(el);
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [k, v] of Object.entries({
        x: box.x - 3, y: box.y - 3, width: box.w + 6, height: box.h + 6, fill: 'none', stroke: '#28c4ff',
        'stroke-width': 3, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke',
      })) rect.setAttribute(k, String(v));
      stepLayer.append(rect);
    }
    content.root.append(stepLayer);
  }

  // ---- a whole line's parts (What to wire's Show): orange dashed rings in a third layer ----
  let netLayer = null;
  let netTargets = [];
  function netRings(elements) {
    if (netLayer) netLayer.remove();
    netLayer = null;
    netTargets = [];
    if (!content || content.kind !== 'svg') return;
    netTargets = elements.filter((el) => el && content.root.contains(el));
    if (!netTargets.length) return;
    netLayer = document.createElementNS(SVG_NS, 'g');
    netLayer.setAttribute('class', 'bench-net');
    for (const el of netTargets) {
      const box = rootBox(el);
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [k, v] of Object.entries({
        x: box.x - 5, y: box.y - 5, width: box.w + 10, height: box.h + 10, fill: 'none', stroke: '#ff9f1a',
        'stroke-width': 3, 'stroke-dasharray': '2 3', 'vector-effect': 'non-scaling-stroke',
      })) rect.setAttribute(k, String(v));
      netLayer.append(rect);
    }
    content.root.append(netLayer);
  }

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
    setView(zoomAt(view, wheelFactor(e.deltaY, e.deltaMode), px, py, limits()));
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

  // A click (pointer down and up close together) on a label: tells onLabelClick listeners which
  // <text> it was. composedPath()[0] reaches inside the shadow root; it's read at pointer-down
  // because the drag's pointer capture makes pointer-up land on the stage.
  const labelListeners = [];
  let downAt = null;
  stage.addEventListener('pointerdown', (e) => {
    downAt = e.button === 0 ? { x: e.clientX, y: e.clientY, target: e.composedPath()[0] } : null;
  }, true);
  stage.addEventListener('pointerup', (e) => {
    const start = downAt;
    downAt = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 4 || !(start.target instanceof Element)) return;
    const label = start.target.closest('text');
    if (label) for (const fn of labelListeners) fn(label);
  });

  stage.addEventListener('dblclick', (e) => {
    if (!size) return;
    const [px, py] = stagePoint(e);
    setView(zoomAt(view, 2, px, py, limits()));
  });

  return {
    show,
    clear,
    fit,
    zoomBy(factor) {
      const s = stageSize();
      setView(zoomAt(view, factor, s.w / 2, s.h / 2, limits()));
    },
    panBy(dx, dy) {
      setView(panBy(view, dx, dy));
    },
    zoomToRect(rect) {
      setView(zoomToRect(rect, stageSize(), limits()));
    },
    labelRect,
    ring,
    onLabelClick: (fn) => labelListeners.push(fn),
    stepRings,
    netRings,
    setFlipped,
    isFlipped,
    getView: () => ({ ...view }),
    setView,
    sheetRoot: () => (content && content.kind === 'svg' ? content.root : null),
    stageSize,
  };
}
