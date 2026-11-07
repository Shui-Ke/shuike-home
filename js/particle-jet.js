(() => {
  'use strict';
  // Exact solution of x'' = -w²x - 2wx': inward restoring force plus damping.
  // Coordinates are relative to the title center, so frame rate cannot change the cone.
  function sampleParticle(p, age) {
    const t = Math.max(0, Math.min(1, age / p.life));
    const omega = 5 / p.life;
    const x = (p.x + (p.vx + omega * p.x) * age) * Math.exp(-omega * age);
    const fadeIn = Math.min(1, t / .08);
    const fadeOut = Math.pow(Math.max(0, 1 - Math.max(0, (t - .38) / .62)), 1.5);
    return { x, y: p.travel * t, alpha: fadeIn * fadeOut * p.brightness };
  }
  // Local parser so the jet colour never depends on js/theme.js having been created first.
  function toneToRgb(value) {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(value ?? '').trim());
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].replace(/./g, digit => digit + digit) : match[1];
    const tone = parseInt(digits, 16);
    return { r: (tone >> 16) & 255, g: (tone >> 8) & 255, b: tone & 255 };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { sampleParticle, toneToRgb };
  if (typeof window === 'undefined') return;
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createParticleJet = function (canvas, title, config = {}) {
    const context = canvas.getContext('2d');
    if (!context) return { destroy() {}, pause() {}, resume() {} };
    const settings = { rate: 115, maxParticles: 360, ...config };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let particles = [], frame = 0, last = 0, emission = 0;
    let width = 0, height = 0, sourceX = 0, sourceY = 0, halfWidth = 0, travel = 0;
    let tone = '#fff';
    let destroyed = false, paused = false;
    function clear() { context.clearRect(0, 0, width, height); }
    // The jet colour is a theme token, so a light page gets dark particles instead of invisible white ones.
    // It is read immediately so the very first frame is already themed.
    function readTone() {
      tone = getComputedStyle(document.documentElement).getPropertyValue('--particle-color').trim() || '#fff';
    }
    readTone();
    function shade(alpha) {
      const rgb = toneToRgb(tone);
      return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : `rgba(255,255,255,${alpha})`;
    }
    function measure() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      readTone();
      const rect = title.getBoundingClientRect();
      sourceX = rect.left + rect.width / 2;
      sourceY = Math.max(6, rect.top - rect.height * .2);
      halfWidth = Math.min(rect.width * .78, width * .44);
      travel = Math.max(0, height * .52 - sourceY);
      particles = []; emission = 0; last = 0;
    }
    function allowed() { return !destroyed && !paused && !motion.matches && !document.hidden && !window.ShuikeIntro?.playing && travel > 40; }
    // Repainting the running jet is enough; the emission cone does not depend on the theme.
    function repaint() { if (!destroyed) readTone(); }
    function spawn() {
      const x = (Math.random() * 2 - 1) * halfWidth;
      return { x, vx: x * .2 + (Math.random() - .5) * 14, travel: travel * (.92 + Math.random() * .12),
        age: 0, life: 2 + Math.random() * 1.2, size: .55 + Math.random() * .85, brightness: .4 + Math.random() * .5 };
    }
    function tick(time) {
      frame = 0;
      if (!allowed()) { clear(); last = 0; return; }
      const dt = last ? Math.min((time - last) / 1000, .05) : 0;
      last = time;
      clear();
      emission += dt * settings.rate * (width < 700 ? .65 : 1);
      const births = Math.floor(emission); emission -= births;
      for (let i = 0; i < births && particles.length < settings.maxParticles; i++) particles.push(spawn());
      particles = particles.filter(p => (p.age += dt) < p.life);
      context.lineCap = 'round';
      for (const p of particles) {
        const current = sampleParticle(p, p.age);
        const previous = sampleParticle(p, Math.max(0, p.age - .022));
        context.strokeStyle = shade(current.alpha * .45);
        context.lineWidth = p.size * .7;
        context.beginPath(); context.moveTo(sourceX + previous.x, sourceY + previous.y);
        context.lineTo(sourceX + current.x, sourceY + current.y); context.stroke();
        context.fillStyle = shade(current.alpha);
        context.beginPath(); context.arc(sourceX + current.x, sourceY + current.y, p.size, 0, Math.PI * 2); context.fill();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (allowed()) frame = requestAnimationFrame(tick);
      else { particles = []; emission = 0; clear(); }
    }
    function reset() { measure(); sync(); }
    document.addEventListener('shuike:intro-end', reset, options);
    document.addEventListener('shuike:intro-start', sync, options);
    document.addEventListener('visibilitychange', sync, options);
    document.addEventListener('shuike:theme-change', repaint, options);
    window.addEventListener('resize', reset, options);
    motion.addEventListener('change', sync, options);
    // Re-anchor after a late local font swap without requiring a network loader.
    const observer = new ResizeObserver(reset); observer.observe(title);
    reset();
    return Object.freeze({
      pause() { paused = true; sync(); },
      resume() { if (!destroyed) { paused = false; reset(); } },
      destroy() { destroyed = true; controller.abort(); observer.disconnect(); cancelAnimationFrame(frame); particles = []; clear(); }
    });
  };
})();
