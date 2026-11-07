(() => {
  'use strict';
  // Theme tokens live in css/theme.css, which is linked before this script, so the
  // canvas effects can read every colour from the stylesheet instead of duplicating it.
  function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
  function toneToRgb(value) {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(value ?? '').trim());
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].replace(/./g, digit => digit + digit) : match[1];
    const tone = parseInt(digits, 16);
    return { r: (tone >> 16) & 255, g: (tone >> 8) & 255, b: tone & 255 };
  }
  function rgbaTone(value, alpha, fallback = '#fff') {
    const tone = toneToRgb(value) || toneToRgb(fallback);
    return `rgba(${tone.r},${tone.g},${tone.b},${clamp(alpha, 0, 1)})`;
  }
  const theme = {
    key: 'shuike:theme',
    themes: ['dark', 'light'],
    default: 'dark',
    bootProperty: 'shuikeTheme',
    colorTokens: ['--grid-ink', '--particle-color', '--globe-glow'],
    resolveTheme(stored, systemLight) {
      if (theme.themes.includes(stored)) return stored;
      if (stored === undefined || stored === null) return systemLight ? 'light' : theme.default;
      return theme.default;
    },
    toneToRgb,
    rgbaTone,
    clamp
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = theme;
  if (typeof window === 'undefined') return;
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.spec = theme;
  // The canvas effects read colours through this getter. It resolves to the live
  // instance once js/home.js created one, and stays undefined before that, so they
  // fall back to the token in css/theme.css instead of failing at startup.
  let instance = null;
  Object.defineProperty(window.ShuikeModules, 'theme', { get() { return instance; }, configurable: true });
  window.ShuikeModules.createTheme = function (toggle = null, { root = document.documentElement } = {}) {
    const controller = new AbortController(), options = { signal: controller.signal };
    const themes = theme.themes, names = { dark: '夜间', light: '白天' };
    const system = matchMedia('(prefers-color-scheme: light)');
    const meta = document.querySelector('meta[name="theme-color"]');
    let current = theme.themes.includes(root.dataset.theme) ? root.dataset.theme : theme.default;
    let switching;
    function readStored() {
      try { return localStorage.getItem(theme.key); } catch (error) { return null; }
    }
    function remember(value) {
      try { localStorage.setItem(theme.key, value); } catch (error) { /* storage may be blocked on file:// */ }
    }
    function tone(name, fallback) {
      const value = getComputedStyle(root).getPropertyValue(name).trim();
      return theme.toneToRgb(value) ? value : fallback;
    }
    function colorScheme() { return current === 'light' ? 'light' : 'dark'; }
    function apply(value) {
      const changed = value !== current;
      current = value;
      root.dataset.theme = value;
      // color-scheme keeps native widgets, scrollbars and the canvas backdrop in step.
      root.style.colorScheme = colorScheme();
      if (meta) meta.content = value === 'light' ? '#e9e9ec' : '#000000';
      if (toggle) {
        const input = toggle.querySelector('.toggle-checkbox');
        if (input) {
          input.checked = value === 'dark';
          // The state lives in the label only: a title attribute would raise a native
          // tooltip, which does not belong in this interface.
          input.setAttribute('aria-label', `当前${names[value]}模式，点击切换到${names[value === 'dark' ? 'light' : 'dark']}模式`);
        }
        toggle.dataset.theme = value;
      }
      if (changed) document.dispatchEvent(new CustomEvent('shuike:theme-change', { detail: { theme: value, colorScheme: colorScheme() } }));
    }
    // No switch element is required. With `toggle` omitted (the current state: the switch UI was
    // removed for a redesign) the theme still boots, persists, follows the system preference and
    // stays reachable through toggle() and shuike:theme-change. A new control sets data-theme, calls
    // toggle(), or carries the `theme-toggle` class so this module keeps its checkbox and label in sync.
    function setTheme(next) {
      if (!themes.includes(next)) return;
      remember(next);
      // Keep the paint transition short and root-only so backdrop-filter stays cheap.
      root.classList.add('theme-switching');
      clearTimeout(switching);
      switching = setTimeout(() => root.classList.remove('theme-switching'), 320);
      apply(next);
    }
    function toggleTheme() { setTheme(current === 'dark' ? 'light' : 'dark'); }
    if (toggle) toggle.addEventListener('click', toggleTheme, options);
    // A stored choice always wins; the system preference only applies before the first choice.
    system.addEventListener('change', event => {
      if (readStored() !== null) return;
      apply(theme.resolveTheme(null, event.matches));
    }, options);
    // A theme set by js/theme-boot.js or by an integrator writing data-theme directly
    // is picked up here instead of being overwritten.
    const observer = new MutationObserver(() => {
      const value = root.dataset.theme;
      if (themes.includes(value) && value !== current) apply(value);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    apply(current);
    return (instance = Object.freeze({
      toggle: toggleTheme,
      set: setTheme,
      get theme() { return current; },
      get colorScheme() { return colorScheme(); },
      colors: () => ({
        gridInk: tone('--grid-ink', '#ced2d8'),
        particle: tone('--particle-color', '#fff'),
        globeGlow: tone('--globe-glow', '#fff')
      }),
      destroy() {
        clearTimeout(switching); controller.abort(); observer.disconnect();
        root.classList.remove('theme-switching');
        instance = null;
      }
    }));
  };
})();
