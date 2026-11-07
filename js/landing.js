(() => {
  'use strict';
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createLanding = function ({ desktop, dock, backButton, entry = null, stopInteractions, beforeEnter = () => {} }) {
    const root = document.documentElement;
    entry = entry || document.querySelector('#landing-menu');
    const enter = document.querySelector('#enter-files');
    const fadeIn = [entry].filter(Boolean);
    const fadeOut = [desktop, dock].filter(Boolean);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController(), options = { signal: controller.signal };
    const activeAnimations = new Set();
    let state = 'landing', busy = false, ready = false, destroyed = false;
    function animate(element, frames, duration, delay = 0) {
      const animation = element.animate(frames, { duration: motion.matches ? 0 : duration, delay: motion.matches ? 0 : delay, fill: 'both', easing: 'ease-in-out' });
      activeAnimations.add(animation);
      return animation.finished.catch(() => {}).then(() => { activeAnimations.delete(animation); animation.cancel(); });
    }
    function emit() { document.dispatchEvent(new CustomEvent('shuike:view-change', { detail: { view: state } })); }
    async function reveal() {
      if (ready || destroyed || window.ShuikeIntro?.playing) return;
      ready = true;
      root.classList.add('landing-ready');
      // Let the globe's fade begin before the bottom menu appears.
      await Promise.all(fadeIn.map(element => animate(element, [{ opacity: 0 }, { opacity: 1 }], 450, 450)));
      if (!destroyed && state === 'landing') entry.inert = false;
    }
    async function showDesktop() {
      if (destroyed || busy || !ready || state !== 'landing') return;
      busy = true; entry.inert = true; root.dataset.view = 'entering';
      await Promise.all([beforeEnter(), animate(entry, [{ opacity: 1 }, { opacity: 0 }], 220)]);
      if (destroyed) return;
      state = 'desktop'; root.dataset.view = state;
      const windows = [...desktop.querySelectorAll('.glass-panel')].filter(panel => !panel.hidden);
      await Promise.all([
        ...windows.map((panel, index) => animate(panel, [{ opacity: 0 }, { opacity: 1 }], 400, index * 70)),
        animate(dock, [{ opacity: 0 }, { opacity: 1 }], 350, 350)
      ]);
      if (destroyed) return;
      desktop.inert = dock.inert = false; busy = false;
      const top = windows.sort((a,b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
      (top?.querySelector('.window-bar') || backButton).focus({ preventScroll: true });
      emit();
    }
    async function showLanding() {
      if (destroyed || busy || state !== 'desktop') return;
      busy = true; stopInteractions(); desktop.inert = dock.inert = true;
      root.dataset.view = 'leaving';
      await Promise.all(fadeOut.map(element => animate(element, [{ opacity: 1 }, { opacity: 0 }], 220)));
      if (destroyed) return;
      state = 'landing'; root.dataset.view = state;
      // The bottom menu is already at its resting opacity via .landing-ready,
      // so this fade only has to bring it back from the desktop exit.
      await Promise.all(fadeIn.map(element => animate(element, [{ opacity: 0 }, { opacity: 1 }], 300)));
      if (destroyed) return;
      entry.inert = false; busy = false; enter.focus({ preventScroll: true }); emit();
    }
    desktop.inert = dock.inert = true;
    enter.addEventListener('click', showDesktop, options);
    backButton.addEventListener('click', showLanding, options);
    document.addEventListener('shuike:intro-end', reveal, options);
    reveal();
    return Object.freeze({
      showDesktop, showLanding, get view() { return state; },
      destroy() { destroyed = true; controller.abort(); activeAnimations.forEach(a => a.cancel()); activeAnimations.clear(); }
    });
  };
})();
