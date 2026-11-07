/* Standalone brand animation; no loading stage. */
(() => {
  'use strict';
  const root = document.documentElement;
  const embedded = window.parent !== window;
  let done = false;
  let started = false;

  function postDone() {
    if (done) return;
    done = true;
    root.dataset.startup = 'home';
    if (!embedded) return;
    try { window.parent.postMessage({ type: 'shuike-startup:done' }, '*'); } catch (_) {}
  }

  function start() {
    if (started) return;
    started = true;
    root.dataset.startup = 'brand';
    try { window.ShuikeIntro?.start(); } catch (error) {
      console.warn('Opening animation skipped:', error);
      postDone();
    }
  }

  document.addEventListener('shuike:intro-end', postDone, { once: true });
  if (document.readyState === 'complete') requestAnimationFrame(start);
  else window.addEventListener('load', () => requestAnimationFrame(start), { once: true });
  setTimeout(postDone, 7000);
})();
