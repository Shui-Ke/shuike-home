/* 00 — EARTH AFTER THE LOG
   The hex boot stream plays once and hides itself, then this script mounts
   the inline earth inside the same frame. Deferring the mount keeps the
   canvas (and its translucent black) from covering the log while it types. */
(() => {
  'use strict';

  const host = document.querySelector('.void__slab');
  const hex = document.querySelector('.void__hex');
  if (!host || !window.ShuikeEarth) return;

  let mounted = false;

  function reveal() {
    if (mounted) return;
    mounted = true;
    window.ShuikeEarth.mount({
      container: host,
      map: false,
      terminal: false,
      globe: {
        centerY: .5,
        maxRadius: 200,
        widthRatio: .22,
        heightRatio: .3,
        speed: .07,
        spacing: 5,
        tone: '#e8bd68',
        zoomCap: 2.4,
        selectable: true
      }
    }).catch(error => {
      console.warn('Earth void could not be mounted:', error);
    });
  }

  document.addEventListener('shuike:hex-complete', reveal, { once: true });

  // Safety net for a broken hex run: never leave the frame empty forever.
  // While the stream is still typing, wait for its own event instead.
  window.setTimeout(() => {
    if (mounted) return;
    if (!hex || hex.dataset.state !== 'typing') reveal();
  }, 15000);
})();
