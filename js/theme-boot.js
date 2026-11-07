// Loaded synchronously before the stylesheets so a remembered theme is already on
// <html> at first paint. Without it the dark default would flash before js/theme.js ran.
(() => {
  'use strict';
  const root = document.documentElement;
  const key = 'shuike:theme';
  const themes = ['dark', 'light'];
  let stored = null;
  try { stored = localStorage.getItem(key); } catch (error) { /* storage may be blocked on file:// */ }
  const theme = themes.includes(stored) ? stored : 'dark';
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#e9e9ec' : '#000000';
})();
