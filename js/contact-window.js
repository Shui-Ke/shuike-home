// Contact folder → floating CONTACT.DOSSIER window.
// The frame is the same <shuike-mac-window> used by the Personal Dossier Contact
// section; the content is the shared <shuike-contact-dossier> card. The green light
// is a real zoom control on the floating window.
(() => {
  'use strict';

  let node = null;
  let closingNode = null;
  let opener = null;
  let onStatus = null;
  let removeTimer = 0;
  let layoutController = null;
  let zoomed = false;

  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 0);
  const announce = message => { try { onStatus?.(message); } catch (_) {} };

  function metrics(isZoomed = zoomed) {
    const heading = document.querySelector('.desktop-heading');
    const dock = document.querySelector('#window-dock');
    const headingBottom = heading ? heading.getBoundingClientRect().bottom : 80;
    const dockTop = dock ? dock.getBoundingClientRect().top : innerHeight - 90;
    const viewportWidth = innerWidth;

    if (isZoomed) {
      const width = Math.min(1120, Math.max(300, viewportWidth - 24));
      const top = Math.max(58, Math.round(headingBottom + 14));
      const bottom = Math.max(top + 260, Math.round(dockTop - 14));
      const bodyHeight = Math.max(260, Math.min(820, bottom - top - 42));
      const x = Math.max(12, Math.round((viewportWidth - width) / 2));
      return { width, bodyHeight, x, y: top };
    }

    const width = Math.min(680, Math.max(228, viewportWidth - 32));
    const top = Math.max(72, Math.round(headingBottom + 24));
    const available = Math.max(180, Math.round(dockTop - 18 - top));
    const preferred = viewportWidth <= 620
      ? 400
      : Math.min(520, Math.max(300, Math.round(viewportWidth * 0.44)));
    const bodyHeight = Math.max(220, Math.min(preferred, available - 42));
    const x = Math.max(16, Math.round((viewportWidth - width) / 2));
    const y = Math.round(top + Math.max(0, (available - bodyHeight - 42) / 2));
    return { width, bodyHeight, x, y };
  }

  function applyLayout(force = false) {
    if (!node) return;
    const layout = metrics(zoomed);
    node.setAttribute('width', `${layout.width}px`);
    node.setAttribute('body-height', `${layout.bodyHeight}px`);
    // Dragged windows keep the position chosen by the user; zoom and the default
    // layout always recenter. Plain resizes move only untouched windows.
    if (force || !node.classList.contains('is-moved')) {
      node.style.setProperty('--mac-left', `${layout.x}px`);
      node.style.setProperty('--mac-top', `${layout.y}px`);
    }
  }

  function focusBar() {
    nextFrame(() => {
      node?.shadowRoot?.querySelector('.bar')?.focus({ preventScroll: true });
    });
  }

  function focusOpener() {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function discardClosing() {
    clearTimeout(removeTimer);
    removeTimer = 0;
    if (closingNode) {
      closingNode.remove();
      closingNode = null;
    }
  }

  function scheduleRemoval(target) {
    if (!target) return;
    discardClosing();
    closingNode = target;
    removeTimer = window.setTimeout(() => {
      target.remove();
      if (closingNode === target) closingNode = null;
      removeTimer = 0;
    }, motion.matches ? 0 : 360);
  }

  function cleanupLayout() {
    layoutController?.abort();
    layoutController = null;
  }

  function handleNativeClose(event) {
    if (!node || event.currentTarget !== node) return;
    const closed = node;
    node = null;
    zoomed = false;
    cleanupLayout();
    closed.dataset.state = 'closed';
    scheduleRemoval(closed);
    focusOpener();
    announce('联系窗口已关闭');
  }

  function handleMinimize(event) {
    if (!node || event.currentTarget !== node) return;
    node.dataset.state = 'minimized';
    announce('联系窗口已最小化，再次打开 Contact 恢复');
  }

  function handleRestore(event) {
    if (!node || event.currentTarget !== node) return;
    node.dataset.state = 'open';
    announce('联系窗口已恢复');
  }

  function toggleZoom() {
    if (!node) return;
    zoomed = !zoomed;
    node.toggleAttribute('zoomed', zoomed);
    node.resetPosition?.({ animate: false });
    applyLayout(true);
    announce(zoomed ? '联系窗口已放大' : '联系窗口已还原大小');
  }

  function animateIn(anchor) {
    if (!node || motion.matches || typeof node.animate !== 'function') return;
    const folder = anchor?.getBoundingClientRect?.();
    const rect = node.getBoundingClientRect();
    if (folder && folder.width && rect.width && rect.height) {
      const dx = folder.left + folder.width / 2 - (rect.left + rect.width / 2);
      const dy = folder.top + folder.height / 2 - (rect.top + rect.height / 2);
      const scale = Math.max(0.18, Math.min(0.9, folder.width / rect.width));
      node.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.32 },
        { transform: 'none', opacity: 1 }
      ], { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      return;
    }
    node.animate([
      { transform: 'scale(.94) translateY(8px)', opacity: 0 },
      { transform: 'none', opacity: 1 }
    ], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }

  function create(anchor) {
    if (!window.ShuikeMacWindow || !customElements.get('shuike-contact-dossier')) return null;
    zoomed = false;
    const layout = metrics(false);
    node = window.ShuikeMacWindow.create({
      title: 'CONTACT.DOSSIER',
      meta: '05 / OPEN',
      width: `${layout.width}px`,
      bodyHeight: `${layout.bodyHeight}px`,
      floating: true,
      x: layout.x,
      y: layout.y,
      label: 'CONTACT.DOSSIER 联系档案，可拖动，可放大',
      className: 'contact-dossier-window',
      reveal: false,
      zoomable: true,
      fixedBody: true,
      content: document.createElement('shuike-contact-dossier'),
      parent: document.body
    });
    node.id = 'contact-window';
    node.dataset.contactWindow = 'true';
    node.dataset.state = 'open';
    node.addEventListener('mac-window:close', handleNativeClose);
    node.addEventListener('mac-window:minimize', handleMinimize);
    node.addEventListener('mac-window:restore', handleRestore);
    node.addEventListener('mac-window:zoom', toggleZoom);
    layoutController = new AbortController();
    window.addEventListener('resize', applyLayout, { signal: layoutController.signal });
    window.addEventListener('orientationchange', applyLayout, { signal: layoutController.signal });
    applyLayout();
    animateIn(anchor);
    focusBar();
    return node;
  }

  function open({ anchor = null, onStatus: status = null } = {}) {
    if (typeof status === 'function') onStatus = status;
    if (anchor) opener = anchor;
    if (node) {
      if (node.hidden || node.classList.contains('is-closing')) {
        const stale = node;
        node = null;
        cleanupLayout();
        stale.remove();
      } else {
        const wasMinimized = node.classList.contains('is-minimized');
        if (wasMinimized) node.restore();
        else node.dataset.state = 'open';
        focusBar();
        if (!wasMinimized) announce('联系窗口已在最前');
        return true;
      }
    }
    discardClosing();
    if (!create(anchor)) {
      announce('联系窗口暂不可用');
      return false;
    }
    announce('联系窗口已打开，可拖动标题栏移动，绿色按钮放大');
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    const target = node;
    if (!target) return;
    node = null;
    zoomed = false;
    cleanupLayout();
    target.dataset.state = 'closed';
    target.close();
    scheduleRemoval(target);
    if (restoreFocus) focusOpener();
    announce('联系窗口已关闭');
  }

  document.addEventListener('shuike:view-change', event => {
    if (event.detail?.view && event.detail.view !== 'desktop') close({ restoreFocus: false });
  });
  window.addEventListener('pagehide', () => close({ restoreFocus: false }));

  window.ShuikeContactWindow = Object.freeze({
    open,
    close,
    toggleZoom: () => toggleZoom(),
    get element() { return node; },
    get isOpen() { return Boolean(node) && !node.hidden && !node.classList.contains('is-minimized'); },
    get zoomed() { return zoomed; }
  });
})();
