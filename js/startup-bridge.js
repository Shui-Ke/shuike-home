/*
 * Host overlay for the standalone SHUIKE brand animation.
 * Mount: keep the .startup-frame block in index.html, this file, startup-frame.css,
 *        and the small window.ShuikeIntro stub. Remove all four to uninstall.
 */
(() => {
  'use strict';
  const KEY = window.ShuikeBrand?.key || 'shuike-brand-played';
  const SKIP_ENABLED = window.ShuikeBrand?.skipEnabled === true;
  let played = false;
  if (SKIP_ENABLED) {
    try { played = localStorage.getItem(KEY) === '1'; } catch {}
  }
  const wrap = document.querySelector('[data-startup-frame]');
  const frame = wrap?.querySelector('iframe');
  const revealHome = () => {
    if (window.ShuikeIntro) window.ShuikeIntro.playing = false;
    document.documentElement.dataset.startup = 'home';
    document.dispatchEvent(new CustomEvent('shuike:intro-end', { detail: { completed: false } }));
  };
  if (SKIP_ENABLED && played) {
    wrap?.remove();
    revealHome();
    return;
  }
  if (!wrap || !frame) { revealHome(); return; }

  const root = document.documentElement;
  const home = document.querySelector('.home');
  if (home) home.inert = true;
  root.dataset.startup = 'waiting';
  let finished = false;
  let pendingFinish = false;

  function finish(force = false) {
    if (finished) return;
    if (!force && document.readyState !== 'complete') { pendingFinish = true; return; }
    finished = true;
    if (home) home.inert = false;
    if (window.ShuikeIntro) window.ShuikeIntro.playing = false;
    root.dataset.startup = 'home';
    wrap.classList.add('is-done');
    document.dispatchEvent(new CustomEvent('shuike:intro-end', { detail: { completed: true } }));
    setTimeout(() => wrap.remove(), 450);
  }

  window.addEventListener('load', () => { if (pendingFinish) finish(); }, { once: true });
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === 'shuike-startup:done') {
      // Only a naturally completed animation counts as "played"; Esc/reduced motion do not.
      if (SKIP_ENABLED) {
        try { localStorage.setItem(KEY, '1'); } catch {}
      }
      finish();
    }
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !finished) finish();
  });
  frame.addEventListener('load', () => {
    wrap.classList.add('is-ready');
  });
  if (frame.contentDocument?.readyState === 'complete') wrap.classList.add('is-ready');
  setTimeout(() => finish(true), 7000);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish(true);
})();
