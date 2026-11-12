import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALE_LIMITS, fitView, panBy, svgSize, wheelFactor, zoomAt, zoomToRect } from '../../src/zoom.js';

test('svgSize reads the viewBox first', () => {
  assert.deepEqual(svgSize({ viewBox: '0 0 1560 1536', width: '1560', height: '1536' }), { x: 0, y: 0, w: 1560, h: 1536 });
  assert.deepEqual(svgSize({ viewBox: '10,20,30,40', width: null, height: null }), { x: 10, y: 20, w: 30, h: 40 });
  assert.deepEqual(svgSize({ viewBox: '0 0 297.0022 210.0072', width: '297.0022mm', height: '210.0072mm' }),
    { x: 0, y: 0, w: 297.0022, h: 210.0072 });
});

test('svgSize falls back to width and height in any unit', () => {
  const k = svgSize({ viewBox: null, width: '297mm', height: '210mm' });
  assert.ok(Math.abs(k.w - 1122.52) < 0.01 && Math.abs(k.h - 793.70) < 0.01);
  assert.deepEqual(svgSize({ viewBox: null, width: '2in', height: '72pt' }), { x: 0, y: 0, w: 192, h: 96 });
  assert.deepEqual(svgSize({ viewBox: null, width: '640', height: '480px' }), { x: 0, y: 0, w: 640, h: 480 });
});

test('svgSize gives null when there is no usable size', () => {
  assert.equal(svgSize({ viewBox: null, width: '100%', height: '100%' }), null);
  assert.equal(svgSize({ viewBox: '0 0 0 10', width: null, height: null }), null);
  assert.equal(svgSize({ viewBox: null, width: null, height: null }), null);
});

test('fitView shows the whole sheet, centred', () => {
  assert.deepEqual(fitView({ w: 1560, h: 1536 }, { w: 1000, h: 800 }), { scale: 0.5, x: 110, y: 16 });
});

test('zoomAt keeps the point under the pointer and clamps', () => {
  assert.deepEqual(zoomAt({ scale: 1, x: 0, y: 0 }, 2, 100, 50), { scale: 2, x: -100, y: -50 });
  assert.equal(zoomAt({ scale: 30, x: 0, y: 0 }, 10, 0, 0).scale, SCALE_LIMITS.max);
  assert.equal(zoomAt({ scale: 0.03, x: 0, y: 0 }, 0.1, 0, 0).scale, SCALE_LIMITS.min);
});

test('panBy moves the view', () => {
  assert.deepEqual(panBy({ scale: 2, x: 5, y: 5 }, 10, -5), { scale: 2, x: 15, y: 0 });
});

test('zoomToRect centres a label at a readable size', () => {
  assert.deepEqual(zoomToRect({ x: 100, y: 200, w: 20, h: 10 }, { w: 960, h: 720 }), { scale: 3, x: 150, y: -255 });
});

test('wheelFactor zooms in on wheel up, out on wheel down', () => {
  assert.equal(wheelFactor(0, 0), 1);
  assert.ok(wheelFactor(100, 0) < 1 && wheelFactor(-100, 0) > 1);
  assert.equal(wheelFactor(3, 1), wheelFactor(48, 0));
  assert.equal(wheelFactor(1, 2), wheelFactor(400, 0));
});
