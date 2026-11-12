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
    getView: () => ({ ...view }),
    setView,
    sheetRoot: () => (content && content.kind === 'svg' ? content.root : null),
    stageSize,
  };
}
