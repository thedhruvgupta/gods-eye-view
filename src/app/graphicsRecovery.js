import { t } from '../i18n/index.js';

function showGraphicsRecovery() {
  const panel = document.createElement('section');
  panel.id = 'graphics-recovery';
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'position:fixed;inset:20% max(16px, calc((100% - 480px) / 2)) auto;z-index:100000;padding:24px;background:#102126;color:#e8f5f5;border:1px solid #58c4c4;border-radius:12px;font:16px/1.5 system-ui;box-shadow:0 12px 60px #0009';
  const message = document.createElement('p');
  message.textContent = t(
    'The browser interrupted 3D graphics. Reload the map to restore rendering.',
  );
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('Reload map');
  button.style.cssText =
    'padding:10px 18px;border:1px solid #58c4c4;border-radius:6px;background:#163d43;color:#fff;font:inherit;cursor:pointer';
  const reload = () => window.location.reload();
  button.addEventListener('click', reload);
  panel.append(message, button);
  document.body.append(panel);
  button.focus();
  return () => {
    button.removeEventListener('click', reload);
    panel.remove();
  };
}

/**
 * Cesium does not rebuild its GPU resources after WebGL context loss. Stop its
 * loop and offer a fresh map, including when loss precedes the browser event.
 * A merely unsized canvas skips rendering until its buffer is usable again.
 */
export function installGraphicsRecovery(
  viewer,
  { showRecovery = showGraphicsRecovery } = {},
) {
  const widget = viewer.cesiumWidget;
  const context = viewer.scene.context;
  const originalRender = widget.render;
  let interrupted = false;
  let removeNotice;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    viewer.useDefaultRenderLoop = false;
    removeNotice = showRecovery();
  };
  function guardedRender(...args) {
    if (interrupted) return;
    if (context._gl?.isContextLost()) {
      interrupt();
      return;
    }
    if (context.drawingBufferWidth <= 0 || context.drawingBufferHeight <= 0)
      return;
    return originalRender.apply(this, args);
  }
  widget.render = guardedRender;
  viewer.canvas.addEventListener('webglcontextlost', interrupt);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    viewer.canvas.removeEventListener('webglcontextlost', interrupt);
    if (widget.render === guardedRender) widget.render = originalRender;
    removeNotice?.();
  };
}
