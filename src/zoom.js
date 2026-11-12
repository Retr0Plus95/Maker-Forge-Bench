// Zoom maths for the viewer. No page code.
// A View { scale, x, y } puts the point (sx, sy), in the SVG element's own pixels, at
// (sx * scale + x, sy * scale + y) inside the stage.

export const SCALE_LIMITS = { min: 0.02, max: 40 };

/**
 * Zoom limits for a sheet whose fitted scale is fitScale. The sheet is drawn in its own units, so a
 * 50 × 30 mm drawing fits at about 22: the limits widen to keep 64× of zoom past the fit, and 8× out.
 */
export function scaleLimits(fitScale) {
  return { min: Math.min(SCALE_LIMITS.min, fitScale / 8), max: Math.max(SCALE_LIMITS.max, fitScale * 64) };
}

const UNIT_PX = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72 };
const LENGTH = /^\s*([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)\s*(px|mm|cm|in|pt)?\s*$/i;

const clamp = (s, limits) => Math.min(limits.max, Math.max(limits.min, s));

function lengthPx(value) {
  const m = value == null ? null : LENGTH.exec(value);
  if (!m) return null;
  const px = Number(m[1]) * UNIT_PX[(m[2] || 'px').toLowerCase()];
  return px > 0 ? px : null;
}

/** The drawing's size from its viewBox, or else its width and height. Null if neither works. */
export function svgSize({ viewBox, width, height }) {
  if (viewBox) {
    const n = viewBox.trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) {
      return { x: n[0], y: n[1], w: n[2], h: n[3] };
    }
  }
  const w = lengthPx(width);
  const h = lengthPx(height);
  return w && h ? { x: 0, y: 0, w, h } : null;
}

/** The whole sheet visible and centred, at whatever scale that takes. */
export function fitView(sheet, box, margin = 16) {
  const scale = Math.max(1e-9, Math.min((box.w - 2 * margin) / sheet.w, (box.h - 2 * margin) / sheet.h));
  return { scale, x: (box.w - sheet.w * scale) / 2, y: (box.h - sheet.h * scale) / 2 };
}

export function zoomAt(view, factor, px, py, limits = SCALE_LIMITS) {
  const scale = clamp(view.scale * factor, limits);
  const sx = (px - view.x) / view.scale;
  const sy = (py - view.y) / view.scale;
  return { scale, x: px - sx * scale, y: py - sy * scale };
}

export function panBy(view, dx, dy) {
  return { scale: view.scale, x: view.x + dx, y: view.y + dy };
}

/** Centres a label, scaled so about twelve label-widths fit across the stage. */
export function zoomToRect(rect, box, limits = SCALE_LIMITS) {
  const scale = clamp(Math.min(box.w, box.h) / (Math.max(rect.w, rect.h, 1e-9) * 12), limits);
  return { scale, x: box.w / 2 - (rect.x + rect.w / 2) * scale, y: box.h / 2 - (rect.y + rect.h / 2) * scale };
}

/** How much one wheel event zooms: deltaMode 0 = pixels, 1 = lines, 2 = pages. */
export function wheelFactor(deltaY, deltaMode) {
  const d = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-d * 0.0015);
}
