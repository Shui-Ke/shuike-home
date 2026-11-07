/* A short solar departure; Plans carries the same image into its live map. */
(() => {
  'use strict';
  const link = document.getElementById('enter-plans');
  if (!link) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let running = false, navigated = false, frame = 0, timer = 0;
  const key = 'shuike-plans-handoff';
  function navigate(capture = true) {
    if (!running || navigated) return;
    navigated = true;
    cancelAnimationFrame(frame); clearTimeout(timer);
    try {
      sessionStorage.removeItem(key);
      const canvas = document.querySelector('.dot-globe');
      const sun = window.ShuikeHome?.globe?.sun;
      if (capture && canvas && sun) {
        sessionStorage.setItem(key, JSON.stringify({
          image: canvas.toDataURL('image/png'), sun,
          width: innerWidth, height: innerHeight, created: Date.now()
        }));
      }
    } catch (_) { /* Storage-blocked browsing still uses the ordinary entry. */ }
    location.assign(new URL('plans/index.html?from=home', location.href).href);
  }
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (running) { event.preventDefault(); return; }
    const home = window.ShuikeHome;
    const globe = home?.globe;
    if (motion.matches || !globe?.pointCount || !globe.setPlans) return;
    event.preventDefault(); running = true;
    document.documentElement.dataset.plansEntry = 'running';
    document.getElementById('landing-menu').inert = true;
    link.setAttribute('aria-disabled', 'true');
    document.activeElement?.blur?.();
    home.settings?.close?.({restoreFocus:false});
    home.theme?.set('dark');
    globe.closeMap?.({restoreFocus:false});
    globe.setSolar(true);
    // Orbit departure and planet dissolution overlap instead of waiting in line.
    timer = setTimeout(() => { if (!navigated) globe.setPlans(true); }, 260);
    const started = performance.now();
    const tick = now => {
      if (navigated) return;
      if ((globe.scene === 'solar' && globe.plans > .995) || now - started > 2400) { navigate(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && running && !navigated) { event.preventDefault(); navigate(false); }
  });
  motion.addEventListener('change', () => { if (motion.matches && running) navigate(false); });
  window.addEventListener('pagehide', () => {cancelAnimationFrame(frame);clearTimeout(timer);});
  window.addEventListener('pageshow', event => {if(event.persisted && running) location.reload();});
})();
