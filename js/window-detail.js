(() => {
  'use strict';
  window.ShuikeModules.createWindowDetail = function ({ records, button, activate, announce }) {
    const root = document.documentElement, events = new AbortController();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const originalMarkup = button.innerHTML, originalLabel = button.getAttribute('aria-label');
    let current = null, saved = null, animation = null;
    function animate(panel, from) {
      animation?.cancel();
      if (motion.matches) return;
      const to = panel.getBoundingClientRect();
      animation = panel.animate([
        { transformOrigin: '0 0', transform: `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})` },
        { transformOrigin: '0 0', transform: 'none' }
      ], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    function back({ restoreFocus = true, animateReturn = true } = {}) {
      if (!current) return;
      animation?.cancel();
      const record = current, from = record.panel.getBoundingClientRect();
      current = null;
      delete root.dataset.expandedWindow;
      delete record.panel.dataset.expanded;
      record.maximize.setAttribute('aria-label', `放大${record.config.title}`); record.maximize.setAttribute('aria-pressed', 'false'); record.maximize.querySelector('span').textContent = '⤢';
      record.handle.setAttribute('aria-label', saved.handleLabel);
      records.forEach(r => { r.panel.inert = saved.inert.get(r); });
      record.resize.setRect(saved.rect);
      button.innerHTML = originalMarkup; button.setAttribute('aria-label', originalLabel);
      activate(record);
      if (animateReturn) animate(record.panel, from);
      if (restoreFocus) record.maximize.focus({ preventScroll: true });
      announce('已返回窗口，恢复原来的位置和大小');
      saved = null;
    }
    function expand(record) {
      if (current === record || record.state !== 'open' || root.dataset.view !== 'desktop') return;
      back({ restoreFocus: false, animateReturn: false });
      animation?.cancel();
      const from = record.panel.getBoundingClientRect();
      saved = { rect: record.resize.getRect(), inert: new Map(), handleLabel: record.handle.getAttribute('aria-label') };
      records.forEach(r => { r.drag.stop(); r.resize.stop(); saved.inert.set(r, r.panel.inert); r.panel.inert = r !== record; });
      current = record; activate(record);
      root.dataset.expandedWindow = record.config.id; record.panel.dataset.expanded = 'true';
      record.maximize.setAttribute('aria-label', `还原${record.config.title}`); record.maximize.setAttribute('aria-pressed', 'true'); record.maximize.querySelector('span').textContent = '⤡';
      record.handle.setAttribute('aria-label', `${record.config.title}，全屏`);
      button.setAttribute('aria-label', '返回上一步');
      button.innerHTML = '<span class="dock-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m13 7-8 8 8 8M5 15h14a8 8 0 0 1 8 8v2"/></svg></span><span class="dock-tooltip" aria-hidden="true">返回上一步</span>';
      animate(record.panel, from);
      record.maximize.focus({ preventScroll: true });
      announce('已放大窗口；再次点击黄色按钮或使用底栏返回上一步');
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && current) { event.preventDefault(); back(); }
    }, { signal: events.signal });
    return Object.freeze({ expand, back, get current() { return current; }, destroy() { back({restoreFocus:false,animateReturn:false}); animation?.cancel(); events.abort(); } });
  };
})();
