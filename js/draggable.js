(() => {
  'use strict';
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createDraggable = function (panel, { margin = 16, handle = panel, getBounds = null } = {}) {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let drag = null;
    let moved = false;
    const emit = (name, detail) => panel.dispatchEvent(new CustomEvent(`shuike:panel-${name}`, { bubbles: true, detail: { id: panel.id, ...detail } }));
    const position = () => { const r = panel.getBoundingClientRect(); return { x: r.left, y: r.top }; };
    function setPosition(x, y) {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const r = panel.getBoundingClientRect();
      const insetX = Math.min(margin, Math.max(0, (width - r.width) / 2));
      const insetY = Math.min(margin, Math.max(0, (height - r.height) / 2));
      const bounds = getBounds ? getBounds() : { left: insetX, top: insetY, right: width - insetX, bottom: height - insetY };
      x = Math.max(bounds.left, Math.min(x, bounds.right - r.width));
      y = Math.max(bounds.top, Math.min(y, bounds.bottom - r.height));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      moved = true;
      emit('move', { x, y });
      return { x, y };
    }
    function stop() {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      panel.classList.remove('is-dragging');
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
      emit('dragend', position());
    }
    function reset() {
      stop();
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
      moved = false;
      emit('reset', position());
    }
    handle.addEventListener('pointerdown', event => {
      if (panel.dataset?.expanded === 'true') return;
      // Controls retain their normal click behavior; only the title bar is draggable.
      if (event.target.closest?.('button, a, input, textarea, select, [data-no-drag]')) return;
      if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (event.pointerType !== 'mouse' && !event.isPrimary) return;
      event.preventDefault();
      const r = panel.getBoundingClientRect();
      drag = { id: event.pointerId, offsetX: event.clientX - r.left, offsetY: event.clientY - r.top, mouse: event.pointerType === 'mouse' };
      handle.setPointerCapture(event.pointerId);
      panel.classList.add('is-dragging');
      emit('dragstart', position());
    }, options);
    window.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.mouse && !(event.buttons & 1)) { stop(); return; }
      setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    }, options);
    // End on left release even while another mouse button remains held.
    window.addEventListener('mouseup', event => { if (event.button === 0) stop(); }, options);
    window.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.id) stop(); }, options);
    window.addEventListener('pointercancel', stop, options);
    handle.addEventListener('lostpointercapture', stop, options);
    window.addEventListener('blur', stop, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
    handle.addEventListener('keydown', event => {
      if (panel.dataset?.expanded === 'true') return;
      if (event.target !== handle || event.altKey || event.defaultPrevented) return;
      if (event.key === 'Home') { event.preventDefault(); reset(); return; }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      stop();
      const p = position();
      const step = event.shiftKey ? 32 : 8;
      setPosition(p.x + delta[0] * step, p.y + delta[1] * step);
    }, options);
    window.addEventListener('resize', () => { stop(); if (moved && !panel.hidden && panel.dataset?.expanded !== 'true') { const p = position(); setPosition(p.x, p.y); } }, options);
    return Object.freeze({ reset, stop, setPosition, getPosition: position, destroy() { stop(); controller.abort(); } });
  };
})();
