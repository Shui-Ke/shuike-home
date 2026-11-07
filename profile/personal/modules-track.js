/* PRACTICE — flat horizontal five-card loop
   The row drifts left. One visually identical copy of the five cards follows
   it, so the cards leaving the left edge are replaced from the right without a
   jump. Hovering a card pauses the drift. */
(() => {
  'use strict';

  const stage = document.querySelector('.modules');
  const track = stage?.querySelector('.modules__track');
  if (!stage || !track) return;

  const originals = [...track.querySelectorAll(':scope > .module')];
  if (!originals.length) return;

  // Clone before dossier.js initialises the glyph canvases and card buttons.
  originals.forEach(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.dataset.clone = '';
    track.append(clone);
  });

  const cards = [...track.querySelectorAll('.module')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const SPEED = 22; // px / s
  let offset = 0;
  let loopWidth = 1;
  let frame = 0;
  let last = 0;
  let active = false;
  let hovered = 0;

  const apply = () => {
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  };

  const measure = () => {
    const first = track.querySelector('.module');
    const firstClone = track.querySelector('.module[data-clone]');
    if (first && firstClone) {
      loopWidth = Math.max(1, firstClone.offsetLeft - first.offsetLeft);
    } else {
      loopWidth = Math.max(1, track.scrollWidth / 2);
    }
    if (offset >= loopWidth) offset %= loopWidth;
    apply();
  };

  const tick = time => {
    frame = 0;
    const dt = last ? Math.min((time - last) / 1000, .05) : 0;
    last = time;
    offset += dt * SPEED;
    if (offset >= loopWidth) offset -= loopWidth;
    apply();
    frame = requestAnimationFrame(tick);
  };

  const start = () => {
    if (frame || !active || hovered || reduced.matches) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  const setActive = value => {
    active = value;
    if (!value) {
      hovered = 0;
      stop();
    } else {
      start();
    }
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => setActive(entry.isIntersecting));
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    observer.observe(stage);
  } else {
    setActive(true);
  }

  cards.forEach(card => {
    card.addEventListener('pointerenter', () => {
      hovered++;
      stop();
    });
    card.addEventListener('pointerleave', () => {
      hovered = Math.max(0, hovered - 1);
      if (!hovered) start();
    });
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      stop();
      apply();
    } else {
      start();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('resize', measure);

  window.addEventListener('load', () => {
    measure();
    // The second set is a visual repeat only; keep it out of the tab / AT order.
    track.querySelectorAll('.module[data-clone]').forEach(card => {
      card.removeAttribute('tabindex');
      card.removeAttribute('role');
    });
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(measure);
  }

  measure();
  apply();
})();
