// Your board's marks on a photo (0.4 design F3): an SVG layer the size of the photo, drawn over it,
// so it zooms and pans with it. Built with createElementNS: no markup strings.

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {{ w: number, h: number }} size  the photo's own pixels
 * @param {number} pitch  pixels per hole on this photo
 * @param {{ ref: string, pin: string, at: number[], state: 'wired'|'open'|'none', cls?: string }[]} pins
 * @param {{ ref: string, at: number[], cls?: string }[]} tags  a part's name beside its first pin
 */
export function buildOverlay(size, pitch, pins, tags) {
  const layer = svg('svg', { class: 'bench-myboard', viewBox: `0 0 ${size.w} ${size.h}`, width: size.w, height: size.h });
  layer.style.cssText = `position:absolute;left:0;top:0;width:${size.w}px;height:${size.h}px;pointer-events:none;overflow:visible`;
  layer.append(svg('style', {}, [
    '.bench-myboard circle{fill:rgba(0,0,0,.25);stroke-width:var(--w)}',
    '.bench-myboard .s-wired{stroke:#3ddc84}.bench-myboard .s-open{stroke:#ffb020}.bench-myboard .s-none{stroke:#9aa3ad}',
    '.bench-myboard .myboard-step{stroke:#28c4ff}',
    '.bench-myboard .myboard-selected{stroke:#ff2bd6;stroke-width:var(--wide)}',
    '.bench-myboard .myboard-pending{stroke:#ff2bd6;stroke-dasharray:4 3}',
    '.bench-myboard text{font:700 var(--fs)/1 system-ui,sans-serif;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:var(--ts)}',
  ].join('')));
  layer.style.setProperty('--w', String(Math.max(1.5, pitch * 0.09)));
  layer.style.setProperty('--wide', String(Math.max(2.5, pitch * 0.16)));
  layer.style.setProperty('--fs', `${Math.max(8, pitch * 0.42)}px`);
  layer.style.setProperty('--ts', String(Math.max(2, pitch * 0.1)));
  const r = pitch * 0.36;
  for (const p of pins) {
    layer.append(svg('circle', {
      cx: p.at[0], cy: p.at[1], r, 'data-ref': p.ref, 'data-pin': p.pin, class: [`s-${p.state}`, p.cls].filter(Boolean).join(' '),
    }));
  }
  for (const t of tags) {
    layer.append(svg('text', { x: t.at[0] + r * 1.3, y: t.at[1] - r * 1.1, class: t.cls || '', 'data-ref': t.ref }, t.ref));
  }
  return layer;
}
