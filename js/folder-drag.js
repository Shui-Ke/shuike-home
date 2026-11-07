// 文件夹交互：双击打开、拖动摆放，可拖出当前窗口投放到别的窗口。
// 投放失败（松手时不在任何窗口上）会回到拖动前的位置。坐标始终相对文件夹
// 当前所属的 .glass-panel；跨窗口投放后，控制器会改用目标窗口作为边界。
// 详见 README「文件夹交互」。
(() => {
  'use strict';
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createFolderDrag = function (folder, {
    panel,
    threshold = 4,
    onOpen = null,
    hintDuration = 2600,
    getDropTarget = null,
    onMove = null,
    onReturn = null,
    returnDuration = 240
  } = {}) {
    if (!folder || !panel) throw new TypeError('createFolderDrag 需要 folder 与 panel');
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const canDetach = typeof document !== 'undefined' && Boolean(document.body);
    const initialPanel = panel;
    let currentPanel = panel;
    let drag = null, placed = false, observer = null, state = { left: 0, top: 0 }, hintTimer = 0;
    let lastTap = 0, lastTapX = 0, lastTapY = 0;
    let returning = false, returnAnimation = null, pendingReturn = null, highlighted = null;

    const panelRect = () => currentPanel.getBoundingClientRect();
    const hint = () => currentPanel.querySelector?.('.folder-hint');
    const bodyOf = target => target.querySelector?.('.window-body') || target;

    function constrain(target, left, top) {
      const p = target.getBoundingClientRect();
      const inset = target.querySelector?.('.window-bar')?.getBoundingClientRect()?.height || 0;
      const width = folder.offsetWidth || 0, height = folder.offsetHeight || 0;
      return {
        left: Math.max(0, Math.min(left, Math.max(0, p.width - width))),
        top: Math.max(inset, Math.min(top, Math.max(inset, p.height - height)))
      };
    }
    function place(left, top) {
      const next = constrain(currentPanel, left, top);
      folder.style.position = 'absolute';
      folder.style.left = `${next.left}px`;
      folder.style.top = `${next.top}px`;
      folder.dataset.placed = 'true';
      placed = true; state = next;
      return { x: next.left, y: next.top };
    }
    function getPosition() {
      // 窗口最小化/关闭时 rect 全为 0；placed 文件夹改用最后一次落位坐标，避免保存时把位置写成 0,0。
      if (placed && currentPanel.hidden) return { x: state.left, y: state.top };
      const p = panelRect(), r = folder.getBoundingClientRect();
      return { x: Math.round(r.left - p.left), y: Math.round(r.top - p.top) };
    }
    function observe() {
      observer?.disconnect();
      observer?.observe(currentPanel);
    }
    function reset() {
      placed = false; state = { left: 0, top: 0 };
      folder.dataset.placed = 'false';
      folder.style.removeProperty('position');
      folder.style.removeProperty('left');
      folder.style.removeProperty('top');
      folder.style.removeProperty('width');
      folder.style.removeProperty('height');
      folder.style.removeProperty('z-index');
      delete folder.dataset.detached;
    }
    function open() {
      if (typeof onOpen === 'function') { onOpen(); return; }
      const href = folder.getAttribute('href');
      if (!href) return;
      if (window.ShuikePageTransition?.navigate(href)) return;
      location.assign(href);
    }
    // 提示只在“单击了但没打开”时短暂出现，避免常驻造成的视觉疲劳。
    function showHint() {
      const h = hint();
      if (!h) return;
      h.dataset.visible = 'true';
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { delete h.dataset.visible; }, hintDuration);
    }
    function hideHint() {
      clearTimeout(hintTimer);
      const h = hint();
      if (h) delete h.dataset.visible;
    }
    function tap(event) {
      const now = Date.now();
      if (now - lastTap <= 340 && Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) <= 24) {
        lastTap = 0; hideHint(); open(); return;
      }
      lastTap = now; lastTapX = event.clientX; lastTapY = event.clientY;
      showHint();
    }
    function restoreFlow() {
      folder.style.position = 'absolute';
      folder.style.removeProperty('width');
      folder.style.removeProperty('height');
      folder.style.removeProperty('z-index');
      delete folder.dataset.detached;
      if (typeof document !== 'undefined') document.body.style.removeProperty('cursor');
    }
    function attach(target, left, top) {
      const parent = bodyOf(target);
      if (folder.parentNode !== parent) parent.append(folder);
      currentPanel = target;
      observe();
      restoreFlow();
      placed = true;
      return place(left, top);
    }
    function stopMotion() {
      if (returnAnimation) { returnAnimation.cancel?.(); returnAnimation = null; }
      pendingReturn = null; returning = false; drag = null;
      delete folder.dataset.dragging;
      folder.classList.remove('is-folder-dragging');
      clearHighlight(); hideHint();
      if (typeof document !== 'undefined') document.body.style.removeProperty('cursor');
    }
    // 把文件夹放回最初所属的窗口，并用普通文档流归位；用于 Return 重置和读取失败时的回退。
    function home() {
      stopMotion();
      const parent = bodyOf(initialPanel);
      if (folder.parentNode !== parent) parent.append(folder);
      currentPanel = initialPanel;
      observe();
      reset();
    }
    // 页面加载恢复持久化布局时使用；不触发 onMove，避免把恢复过程当成新的用户改动。
    function moveTo(target, left, top) {
      if (!target) return null;
      stopMotion();
      return attach(target, Number.isFinite(left) ? left : 0, Number.isFinite(top) ? top : 0);
    }
    function detach(info) {
      if (info.detached || !canDetach) return;
      const rect = folder.getBoundingClientRect();
      const pos = getPosition();
      info.origin = { panel: currentPanel, left: pos.x, top: pos.y };
      info.detached = true;
      hideHint();
      folder.style.position = 'fixed';
      folder.style.left = `${rect.left}px`;
      folder.style.top = `${rect.top}px`;
      folder.style.width = `${rect.width}px`;
      folder.style.zIndex = '9999';
      folder.dataset.detached = 'true';
      document.body.style.cursor = 'grabbing';
      document.body.append(folder);
    }
    function clearHighlight() {
      if (!highlighted) return;
      highlighted.removeAttribute?.('data-folder-drop');
      highlighted = null;
    }
    function markHighlight(target) {
      if (target === highlighted) return;
      clearHighlight();
      if (!target) return;
      target.setAttribute?.('data-folder-drop', 'true');
      highlighted = target;
    }
    function targetAt(x, y) {
      if (typeof getDropTarget === 'function') return getDropTarget(x, y, folder) || null;
      if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
      for (const element of document.elementsFromPoint(x, y)) {
        if (element === folder || folder.contains?.(element)) continue;
        const candidate = element.closest?.('.glass-panel');
        if (candidate && !candidate.hidden && candidate.dataset?.state === 'open') return candidate;
      }
      return null;
    }
    // 同一窗口里已有文件夹时，落点向右下错开一点，避免两个文件夹和标签完全叠住。
    function freeSpot(target, left, top) {
      const panel = target.getBoundingClientRect();
      const width = folder.offsetWidth || 0, height = folder.offsetHeight || 0;
      const others = [...(target.querySelectorAll?.('.window-body > .profile-folder') || [])]
        .filter(other => other !== folder && !other.hidden)
        .map(other => {
          const r = other.getBoundingClientRect();
          return { left: r.left - panel.left, top: r.top - panel.top, width: r.width, height: r.height };
        });
      let x = left, y = top;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const hit = others.some(r => x < r.left + r.width + 6 && x + width + 6 > r.left && y < r.top + r.height + 6 && y + height + 6 > r.top);
        if (!hit) break;
        x += 18; y += 18;
      }
      return { x, y };
    }
    function emitDrop(info, to, pos, returned) {
      const from = info.origin?.panel || currentPanel;
      folder.dispatchEvent(new CustomEvent('shuike:folder-drop', {
        bubbles: true,
        detail: {
          id: to.id,
          from: from.id,
          to: to.id,
          x: pos.x,
          y: pos.y,
          moved: from !== to,
          returned
        }
      }));
    }
    function dropInto(info, target, clientX, clientY) {
      const rect = target.getBoundingClientRect();
      const left = clientX - rect.left - info.offsetX;
      const top = clientY - rect.top - info.offsetY;
      const from = currentPanel;
      hideHint();
      clearHighlight();
      const spot = freeSpot(target, left, top);
      const pos = attach(target, spot.x, spot.y);
      emitDrop(info, target, pos, false);
      onMove?.({ from, to: target, x: pos.x, y: pos.y, moved: from !== target });
    }
    function finalizeReturn(info) {
      const origin = info.origin;
      returning = false;
      returnAnimation = null;
      pendingReturn = null;
      if (!origin) return;
      const pos = attach(origin.panel, origin.left, origin.top);
      emitDrop(info, origin.panel, pos, true);
      onReturn?.({ panel: origin.panel, x: pos.x, y: pos.y });
    }
    function returnToOrigin(info) {
      const origin = info.origin;
      if (!origin || !info.detached) { finalizeReturn(info); return; }
      hideHint();
      clearHighlight();
      const targetRect = origin.panel.getBoundingClientRect();
      const viewportLeft = targetRect.left + origin.left;
      const viewportTop = targetRect.top + origin.top;
      const currentLeft = parseFloat(folder.style.left) || 0;
      const currentTop = parseFloat(folder.style.top) || 0;
      const canAnimate = typeof folder.animate === 'function' && !reduced.matches && returnDuration > 0;
      if (!canAnimate) { finalizeReturn(info); return; }
      returning = true;
      pendingReturn = info;
      let animation;
      try {
        animation = folder.animate(
          [{ left: `${currentLeft}px`, top: `${currentTop}px` }, { left: `${viewportLeft}px`, top: `${viewportTop}px` }],
          { duration: returnDuration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }
        );
      } catch (_) {
        finalizeReturn(info);
        return;
      }
      returnAnimation = animation;
      animation.finished.then(() => {
        if (returnAnimation !== animation) return;
        returnAnimation = null;
        animation.cancel?.();
        finalizeReturn(info);
      }).catch(() => {
        if (returnAnimation !== animation) return;
        returnAnimation = null;
        finalizeReturn(info);
      });
    }
    function endDrag(event, cancelled = false) {
      if (!drag) return;
      const info = drag;
      drag = null;
      delete folder.dataset.dragging;
      folder.classList.remove('is-folder-dragging');
      clearHighlight();
      if (!info.active) {
        if (!cancelled && !info.mouse && event?.pointerId === info.id) tap(event);
        return;
      }
      // 旧测试环境没有 document，保持“窗口内拖动后留在原地”的旧行为。
      if (!info.detached) {
        emitDrop(info, currentPanel, getPosition(), false);
        return;
      }
      if (cancelled) { returnToOrigin(info); return; }
      const x = info.lastX, y = info.lastY;
      const target = targetAt(x, y);
      if (target) dropInto(info, target, x, y);
      else returnToOrigin(info);
    }

    folder.addEventListener('pointerdown', event => {
      if (returning || drag) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.pointerType !== 'mouse' && !event.isPrimary) return;
      const r = folder.getBoundingClientRect();
      drag = {
        id: event.pointerId, mouse: event.pointerType === 'mouse',
        startX: event.clientX, startY: event.clientY,
        offsetX: event.clientX - r.left, offsetY: event.clientY - r.top,
        origin: null, active: false, detached: false,
        lastX: event.clientX, lastY: event.clientY
      };
    }, options);
    window.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.lastX = event.clientX; drag.lastY = event.clientY;
      // 左键在拖动途中被松开（例如在窗口外释放）时也要结束，避免卡住。
      if (drag.mouse && !(event.buttons & 1)) { endDrag(); return; }
      if (!drag.active) {
        if (Math.abs(event.clientX - drag.startX) < threshold && Math.abs(event.clientY - drag.startY) < threshold) return;
        drag.active = true;
        hideHint();
        folder.dataset.dragging = 'true';
        folder.classList.add('is-folder-dragging');
        detach(drag);
      }
      event.preventDefault();
      if (drag.detached) {
        folder.style.left = `${event.clientX - drag.offsetX}px`;
        folder.style.top = `${event.clientY - drag.offsetY}px`;
        markHighlight(targetAt(event.clientX, event.clientY));
      } else {
        const p = panelRect();
        place(event.clientX - p.left - drag.offsetX, event.clientY - p.top - drag.offsetY);
      }
      const pos = getPosition();
      folder.dispatchEvent(new CustomEvent('shuike:folder-move', { bubbles: true, detail: { id: currentPanel.id, x: pos.x, y: pos.y } }));
    }, options);
    window.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.id) endDrag(event); }, options);
    window.addEventListener('pointercancel', event => { if (drag && event.pointerId === drag.id) endDrag(event, true); }, options);
    window.addEventListener('blur', () => endDrag(null, true), options);
    // 单击不再打开：只有双击（触屏双击）进入页面。键盘 Enter 触发 detail 为 0 的 click，保留原生跳转。
    folder.addEventListener('click', event => {
      if (event.detail === 0) return;
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (modified && folder.getAttribute('href')) return;
      event.preventDefault();
      showHint();
    }, options);
    // 点到别处立即收起提示，不必等计时结束。
    window.addEventListener('pointerdown', event => {
      if (folder.contains?.(event.target)) return;
      hideHint();
    }, options);
    folder.addEventListener('dblclick', event => { event.preventDefault(); hideHint(); open(); }, options);
    folder.addEventListener('keydown', event => {
      if (returning || drag || event.defaultPrevented || event.altKey) return;
      if (event.key === 'Home') {
        event.preventDefault();
        reset();
        const pos = getPosition();
        onMove?.({ from: currentPanel, to: currentPanel, x: pos.x, y: pos.y, moved: false });
        return;
      }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const pos = getPosition(), step = event.shiftKey ? 32 : 8;
      const next = place(pos.x + delta[0] * step, pos.y + delta[1] * step);
      onMove?.({ from: currentPanel, to: currentPanel, x: next.x, y: next.y, moved: false });
    }, options);
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => { if (placed && !drag?.detached && !returning) place(state.left, state.top); });
      observer.observe(currentPanel);
    } else {
      window.addEventListener('resize', () => { if (placed && !drag?.detached && !returning) place(state.left, state.top); }, options);
    }
    return Object.freeze({
      open, reset, home, moveTo, getPosition, showHint, hideHint,
      setPosition: (x, y) => place(x, y),
      get placed() { return placed; },
      get panel() { return currentPanel; },
      destroy() {
        if (returnAnimation) { returnAnimation.cancel?.(); returnAnimation = null; }
        if (pendingReturn?.origin) attach(pendingReturn.origin.panel, pendingReturn.origin.left, pendingReturn.origin.top);
        pendingReturn = null;
        const info = drag;
        drag = null;
        if (info?.detached && info.origin) {
          const origin = info.origin;
          attach(origin.panel, origin.left, origin.top);
        }
        returning = false;
        delete folder.dataset.dragging;
        folder.classList.remove('is-folder-dragging');
        clearHighlight(); hideHint(); observer?.disconnect(); controller.abort(); reset();
      }
    });
  };
})();
