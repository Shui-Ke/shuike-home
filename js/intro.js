(() => {
  'use strict';
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [];
  let finished = false, started = false;
  let fallback;
  let home;
  const events = new AbortController();
  function finish(completed = false) {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    animations.forEach(animation => animation.cancel());
    root.classList.remove('intro-pending', 'intro-active');
    home = home || document.querySelector('.home');
    if (home) home.inert = false;
    events.abort();
    document.dispatchEvent(new CustomEvent('shuike:intro-end', { detail: { completed } }));
  }
  window.ShuikeIntro = Object.freeze({ start, skip: () => finish(), get playing() { return !finished; } });
  root.classList.add('intro-pending');
  function play(element, frames, duration, delay = 0, easing = 'ease-in-out') {
    const animation = element.animate(frames, { duration, delay, easing, fill: 'both' });
    animations.push(animation);
    return animation;
  }
  function start() {
    if (finished || started) return;
    started = true;
    if (motion.matches) { finish(true); return; }
    fallback = setTimeout(() => finish(), 6000);
    home = document.querySelector('.home');
    home.inert = true;
    try {
      const title = document.querySelector('.home-title');
      const box = title.getBoundingClientRect();
      const centerOffset = innerHeight / 2 - (box.top + box.height / 2);
      const centered = `translateY(${centerOffset}px)`;
      play(document.querySelector('.intro-grid'), [
        { opacity: 0 },
        { opacity: .8, offset: .2 },
        { opacity: .65, offset: .8 },
        { opacity: 0 }
      ], 750, 0, 'linear');
      play(document.querySelector('.intro-grid-veil'), [
        { transform: 'translateX(-75vw)' }, { transform: 'translateX(75vw)' }
      ], 750, 0, 'linear');
      play(document.querySelector('.intro-signature'), [
        { opacity: 0, borderRadius: '10px', transform: 'translate(-50%,-50%) scale(.97)' },
        { opacity: 1, borderRadius: '10px', transform: 'translate(-50%,-50%) scale(1)', offset: .15 },
        { opacity: 1, borderRadius: '0px', transform: 'translate(-50%,-50%) scale(1.1)', offset: .5 },
        { opacity: 1, borderRadius: '0px', transform: 'translate(-50%,-50%) scale(1.1)', offset: .77 },
        { opacity: 0, borderRadius: '0px', transform: 'translate(-50%,-50%) scale(1.1)' }
      ], 1400, 550, 'linear');
      play(document.querySelector('.signature-border'), [
        { inset: '0px', opacity: 0, transform: 'rotate(10deg)' },
        { inset: '15px', opacity: 1, transform: 'rotate(0deg)' }
      ], 500, 700);
      play(document.querySelector('.signature-wordmark'), [
        { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }
      ], 800, 700);
      play(document.querySelector('.signature-trail'), [
        { opacity: 0, transform: 'translateX(-100%)' },
        { opacity: .6, transform: 'translateX(-35%)', offset: .4 },
        { opacity: 0, transform: 'translateX(100%)' }
      ], 800, 700);
      // Position is quadratic in each half: speed rises linearly then falls linearly.
      // Animate the title only; the fixed header remains the stable desktop boundary.
      const last = play(title, [
        { opacity: 0, transform: centered, offset: 0 },
        { opacity: 0, transform: centered, offset: 1750 / 3300 },
        { opacity: 1, transform: centered, offset: 2000 / 3300 },
        // Stay centered until the gold sweep finishes, then begin the ascent.
        { opacity: 1, transform: centered, offset: 2650 / 3300, easing: 'cubic-bezier(.333333,0,.666667,.333333)' },
        { opacity: 1, transform: `translateY(${centerOffset / 2}px)`, offset: 2975 / 3300, easing: 'cubic-bezier(.333333,.666667,.666667,1)' },
        { opacity: 1, transform: 'translateY(0)', offset: 1 }
      ], 3300, 0, 'linear');
      play(document.querySelector('.title-fill'), [
        { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }
      ], 650, 2000, 'cubic-bezier(.2,.65,.3,1)');
      play(document.querySelector('.title-scan'), [
        { left: '0%', opacity: 1 },
        { left: '100%', opacity: 1, offset: .94 },
        { left: '100%', opacity: 0 }
      ], 650, 2000, 'cubic-bezier(.2,.65,.3,1)');
      root.classList.replace('intro-pending', 'intro-active');
      document.dispatchEvent(new CustomEvent('shuike:intro-start'));
      last.finished.then(() => finish(true), () => finish());
    } catch (error) {
      finish();
      console.warn('Opening animation skipped:', error);
    }
  }
  // Resizing mid-flight changes the visual center; finish cleanly at the final layout.
  window.addEventListener('resize', () => { if (started) finish(); }, { signal: events.signal });
  window.addEventListener('keydown', event => { if (started && event.key === 'Escape') finish(); }, { signal: events.signal });
  motion.addEventListener('change', event => { if (started && event.matches) finish(); }, { signal: events.signal });
})();
