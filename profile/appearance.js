/* Mirrors the appearance state written by js/settings.js in index.html. */
(() => {
  'use strict';
  const root = document.documentElement;
  const materials = new Set(['glass', 'metal', 'plastic']);
  const defaults = { opacity: 92, depth: 50, shine: 8, frost: 40 };

  function read() {
    let material = 'glass';
    const values = { ...defaults };
    try {
      const stored = JSON.parse(localStorage.getItem('shuike:appearance'));
      if (stored && materials.has(stored.material)) material = stored.material;
      for (const key of Object.keys(defaults)) {
        const value = stored?.values?.[key];
        if (typeof value === 'number' && Number.isFinite(value)) values[key] = Math.max(0, Math.min(100, value));
      }
    } catch (_) { /* Storage is optional for local files. */ }
    return { material, values };
  }

  function apply(state) {
    root.dataset.material = state.material;
    root.style.setProperty('--surface-alpha', String((100 - state.values.opacity) / 100));
    root.style.setProperty('--surface-depth', `${state.values.depth * .8}px`);
    root.style.setProperty('--surface-offset', `${state.values.depth * .24}px`);
    root.style.setProperty('--surface-shadow-alpha', String(state.values.depth * .005));
    root.style.setProperty('--surface-shine', String(state.values.shine / 100));
    root.style.setProperty('--surface-blur', `${state.values.frost * .4}px`);
  }

  function refresh() { apply(read()); }
  refresh();
  addEventListener('storage', event => { if (!event.key || event.key === 'shuike:appearance') refresh(); });
  addEventListener('pageshow', refresh);
  document.addEventListener('shuike:appearance-change', refresh);
  window.ShuikeProfileAppearance = Object.freeze({ refresh, read });
})();
