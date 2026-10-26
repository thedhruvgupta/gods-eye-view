import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installGraphicsRecovery } from './graphicsRecovery.js';

function fixture() {
  const canvas = new EventTarget();
  const gl = {
    lost: false,
    isContextLost() {
      return this.lost;
    },
  };
  const context = {
    _gl: gl,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };
  const calls = [];
  const widget = {
    render(...args) {
      calls.push({ receiver: this, args });
      return 42;
    },
  };
  const original = widget.render;
  const viewer = {
    canvas,
    cesiumWidget: widget,
    scene: { context },
    useDefaultRenderLoop: true,
  };
  let notices = 0;
  let removals = 0;
  const dispose = installGraphicsRecovery(viewer, {
    showRecovery() {
      notices++;
      return () => {
        removals++;
      };
    },
  });
  return {
    canvas,
    gl,
    context,
    calls,
    widget,
    original,
    viewer,
    dispose,
    get notices() {
      return notices;
    },
    get removals() {
      return removals;
    },
  };
}

test('healthy graphics retain the render receiver, arguments and return value', () => {
  const f = fixture();
  assert.equal(f.widget.render('frame'), 42);
  assert.deepEqual(f.calls, [{ receiver: f.widget, args: ['frame'] }]);
  assert.equal(f.notices, 0);
  f.dispose();
});

test('context loss before its asynchronous event cannot reach Cesium with a zero buffer', () => {
  const f = fixture();
  f.gl.lost = true;
  f.context.drawingBufferWidth = 0;
  f.context.drawingBufferHeight = 0;
  f.widget.render();
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  f.widget.render();
  assert.equal(f.calls.length, 0);
  assert.equal(f.viewer.useDefaultRenderLoop, false);
  assert.equal(f.notices, 1);
  f.dispose();
});

test('the context-loss event pauses rendering and restored buffers require a fresh map', () => {
  const f = fixture();
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  f.widget.render();
  assert.equal(f.calls.length, 0);
  assert.equal(f.viewer.useDefaultRenderLoop, false);
  assert.equal(f.notices, 1);
  f.dispose();
});

test('zero-size buffers without context loss skip a frame and resume when sized', () => {
  for (const dimension of ['drawingBufferWidth', 'drawingBufferHeight']) {
    const f = fixture();
    f.context[dimension] = 0;
    f.widget.render();
    assert.equal(f.calls.length, 0);
    assert.equal(f.notices, 0);
    assert.equal(f.viewer.useDefaultRenderLoop, true);
    f.context[dimension] = 100;
    f.widget.render();
    assert.equal(f.calls.length, 1);
    f.dispose();
  }
});

test('disposal restores rendering, removes the notice and detaches the listener exactly once', () => {
  const f = fixture();
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  f.dispose();
  f.dispose();
  assert.equal(f.widget.render, f.original);
  assert.equal(f.removals, 1);
  f.canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(f.notices, 1);

  const healthy = fixture();
  healthy.dispose();
  healthy.canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(healthy.notices, 0);
  assert.equal(healthy.viewer.useDefaultRenderLoop, true);
});
