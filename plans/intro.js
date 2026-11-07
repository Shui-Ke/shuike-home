/*
 * Plans — solar particle entry.
 *
 * A small, dependency-free 2D canvas sequence:
 *   only a particle sun → ignition → six particle links grow to the actual
 *   direction stars of the page → the page itself can reveal.
 *
 * The visible link length is the only loading bar. The page supplies anchors
 * from its 3D camera; this file never renders the page or talks to the network.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const LINK_START = 0.18;
  const LINK_END = 1.05;
  const MERGE_DELAY = 0;
  const MERGE_DURATION = 0.45;
  const HOLD = MERGE_DELAY + MERGE_DURATION + 0.05;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function easeInOutCubic(value) {
    const x = clamp(value, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function hash(seed) {
    let value = seed >>> 0;
    return function random() {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function rgba(hex, alpha) {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex || '').trim());
    if (!match) return `rgba(255,255,255,${alpha})`;
    const digits = match[1].length === 3
      ? match[1].replace(/./g, digit => digit + digit)
      : match[1];
    const value = parseInt(digits, 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function particleSphere(count, seed) {
    const random = hash(seed);
    return Array.from({ length: count }, () => {
      const y = random() * 2 - 1;
      const phi = random() * TAU;
      const radius = Math.sqrt(1 - y * y);
      const shell = 0.92 + random() * 0.12;
      return {
        x: radius * Math.cos(phi) * shell,
        y: y * shell,
        z: radius * Math.sin(phi) * shell
      };
    });
  }

  function projectPoint(point, angle, radius, camera = 3.5) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = point.x * cos + point.z * sin;
    const z = -point.x * sin + point.z * cos;
    const scale = camera / (camera - z);
    const depth = (z + 1) / 2;
    return {
      x: x * radius * scale,
      y: point.y * radius * scale,
      size: (0.5 + 0.38 * depth) * scale,
      alpha: 0.08 + 0.82 * depth * depth
    };
  }

  function makeDotSprite() {
    const sprite = document.createElement('canvas');
    sprite.width = 48;
    sprite.height = 48;
    const brush = sprite.getContext('2d');
    const glow = brush.createRadialGradient(24, 24, 0, 24, 24, 24);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.12, 'rgba(255,255,255,.94)');
    glow.addColorStop(0.3, 'rgba(255,255,255,.35)');
    glow.addColorStop(0.62, 'rgba(255,255,255,.08)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    brush.fillStyle = glow;
    brush.fillRect(0, 0, 48, 48);
    return sprite;
  }

  function makeBackgroundStars(count) {
    const random = hash(0x91e10da5);
    return Array.from({ length: count }, () => ({
      x: random(),
      y: random(),
      size: 0.3 + Math.pow(random(), 2.1) * 1.2,
      alpha: 0.06 + random() * 0.48,
      phase: random() * TAU,
      speed: 0.12 + random() * 0.32
    }));
  }

  function create(canvas, options = {}) {
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const getAnchors = typeof options.getAnchors === 'function' ? options.getAnchors : null;
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
    const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;

    const sunSphere = particleSphere(2500, 0x51a7c3e9);
    const stars = makeBackgroundStars(230);
    const embers = (() => {
      const random = hash(0x7f4a7c15);
      return Array.from({ length: 78 }, () => ({
        angle: random() * TAU,
        distance: 1.06 + random() * 0.64,
        size: 0.4 + random() * 0.95,
        alpha: 0.2 + random() * 0.48,
        phase: random() * TAU,
        speed: 0.18 + random() * 0.38
      }));
    })();

    const dot = makeDotSprite();
    let width = 1;
    let height = 1;
    let dpr = 1;
    let sunRadius = 58;
    let frame = 0;
    let started = 0;
    let finished = false;
    let completionSent = false;
    let lastStatus = '';
    let lastPercent = -1;

    function resize() {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      sunRadius = clamp(Math.min(width, height) * 0.082, 38, 72);
    }

    function fallbackAnchors() {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.28;
      return {
        sun: {
          x: cx,
          y: cy,
          coreRadius: Math.max(7, sunRadius * 0.15),
          glowRadius: Math.max(30, sunRadius * 1.35)
        },
        targets: Array.from({ length: 6 }, (_, index) => {
          const angle = -Math.PI / 2 + index * TAU / 6;
          return {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius * 0.82,
            color: '#d9d9d9',
            coreRadius: 2.4,
            glowRadius: 24,
            ringRadius: 8
          };
        })
      };
    }

    function readAnchors() {
      let raw = null;
      try {
        raw = getAnchors ? getAnchors() : null;
      } catch (error) {
        raw = null;
      }
      if (!raw || !raw.sun || !Array.isArray(raw.targets)) return fallbackAnchors();
      const targets = raw.targets
        .filter(target => target && Number.isFinite(target.x) && Number.isFinite(target.y))
        .map(target => ({
          x: target.x,
          y: target.y,
          color: target.color || '#d9d9d9',
          coreRadius: Number.isFinite(target.coreRadius) ? target.coreRadius : 2.4,
          glowRadius: Number.isFinite(target.glowRadius) ? target.glowRadius : 24,
          ringRadius: Number.isFinite(target.ringRadius) ? target.ringRadius : 8
        }));
      if (!targets.length) return fallbackAnchors();
      return {
        sun: {
          x: raw.sun.x,
          y: raw.sun.y,
          coreRadius: Number.isFinite(raw.sun.coreRadius) ? raw.sun.coreRadius : Math.max(7, sunRadius * 0.15),
          glowRadius: Number.isFinite(raw.sun.glowRadius) ? raw.sun.glowRadius : Math.max(30, sunRadius * 1.35)
        },
        targets
      };
    }

    function drawDot(x, y, size, alpha) {
      if (alpha <= 0.002) return;
      context.globalAlpha = clamp(alpha, 0, 1);
      const radius = size * 3.2;
      context.drawImage(dot, x - radius, y - radius, radius * 2, radius * 2);
    }

    function drawBackground(time) {
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#000000';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      for (const star of stars) {
        const twinkle = 0.72 + 0.28 * Math.sin(time * star.speed + star.phase);
        drawDot(star.x * width, star.y * height, star.size, star.alpha * twinkle);
      }
    }

    function drawOrbits(sun, ignite, time, collapse) {
      context.save();
      context.translate(sun.x, sun.y);
      context.rotate(-0.43);
      context.globalCompositeOperation = 'lighter';
      for (let orbit = 0; orbit < 3; orbit += 1) {
        const radius = sunRadius * (1.75 + orbit * 0.82);
        const count = 94;
        const direction = orbit % 2 === 0 ? 1 : -1;
        const base = time * 0.022 * direction + orbit * 0.8;
        for (let index = 0; index < count; index += 1) {
          const angle = base + index / count * TAU;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * 0.37;
          const alpha = (0.025 + 0.055 * ignite) * (0.45 + 0.55 * Math.sin(index * 1.7 + time * 0.35 + orbit)) * (1 - 0.88 * collapse);
          context.globalAlpha = Math.max(0.01, alpha);
          context.fillStyle = '#ffffff';
          context.fillRect(x, y, 0.8, 0.8);
        }
      }
      context.restore();
    }

    function makeCurve(sun, target, index, anchorRadius) {
      const dx = target.x - sun.x;
      const dy = target.y - sun.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const startRadius = Math.max(2, anchorRadius * (0.64 + index * 0.012));
      const start = {
        x: sun.x + ux * startRadius,
        y: sun.y + uy * startRadius
      };
      const normalX = -uy;
      const normalY = ux;
      const bend = (index % 2 === 0 ? 1 : -1) * distance * (0.075 + (index % 3) * 0.018);
      return {
        start,
        end: target,
        control: {
          x: (start.x + target.x) / 2 + normalX * bend,
          y: (start.y + target.y) / 2 + normalY * bend
        },
        distance,
        normalX,
        normalY,
        color: target.color
      };
    }

    function pointAt(curve, t) {
      const inverse = 1 - t;
      return {
        x: inverse * inverse * curve.start.x + 2 * inverse * t * curve.control.x + t * t * curve.end.x,
        y: inverse * inverse * curve.start.y + 2 * inverse * t * curve.control.y + t * t * curve.end.y
      };
    }

    function drawLinks(sun, link, time, anchorRadius) {
      if (link <= 0.001) return;
      const anchors = readAnchors();
      const targets = anchors.targets.slice(0, 6);
      context.globalCompositeOperation = 'lighter';

      targets.forEach((target, index) => {
        const curve = makeCurve(sun, target, index, anchorRadius);
        const tone = target.color || '#d9d9d9';
        const targetGlow = target.glowRadius || 24;
        const targetRing = target.ringRadius || 8;
        const targetCore = target.coreRadius || 2.2;

        // The faint line is the carrier; the particles are the link itself.
        context.beginPath();
        const segments = 30;
        for (let step = 0; step <= segments; step += 1) {
          const point = pointAt(curve, link * step / segments);
          if (step === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = rgba(tone, 0.14 + link * 0.12);
        context.lineWidth = 0.8;
        context.stroke();

        const count = Math.max(9, Math.round(36 * link));
        for (let particle = 0; particle < count; particle += 1) {
          const ratio = (particle + 1) / count;
          const t = link * ratio;
          const point = pointAt(curve, t);
          const wave = Math.sin(particle * 2.7 + index * 5.1 + time * 1.8) * 1.5;
          const x = point.x + curve.normalX * wave;
          const y = point.y + curve.normalY * wave;
          const alpha = (0.15 + 0.68 * Math.pow(ratio, 0.75)) * Math.min(1, link * 4);
          drawDot(x, y, 0.45 + ratio * 0.75, alpha);
        }

        // A small comet head sits exactly at the visible end of the link.
        const head = pointAt(curve, link);
        drawDot(head.x, head.y, 2.45, 0.9);
        for (let tail = 1; tail <= 5; tail += 1) {
          const previous = pointAt(curve, Math.max(0, link - tail * 0.011));
          drawDot(previous.x, previous.y, 0.8 - tail * 0.08, 0.28 - tail * 0.035);
        }

        const arrival = smoothstep((link - 0.82) / 0.18);
        if (arrival > 0) {
          const glow = context.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(1, targetGlow));
          glow.addColorStop(0, rgba(tone, 0.6 * arrival));
          glow.addColorStop(0.3, rgba(tone, 0.18 * arrival));
          glow.addColorStop(1, rgba(tone, 0));
          context.fillStyle = glow;
          context.fillRect(target.x - targetGlow, target.y - targetGlow, targetGlow * 2, targetGlow * 2);

          context.strokeStyle = rgba(tone, 0.4 * arrival);
          context.lineWidth = 0.8;
          context.beginPath();
          context.arc(target.x, target.y, targetRing * (0.55 + 0.45 * arrival), 0, TAU);
          context.stroke();

          context.fillStyle = rgba(tone, 0.95 * arrival);
          context.beginPath();
          context.arc(target.x, target.y, targetCore, 0, TAU);
          context.fill();

          if (link >= 0.999) {
            const pulse = clamp((time - (LINK_END + 0.01)) / 0.45, 0, 1);
            if (pulse > 0 && pulse < 1) {
              context.strokeStyle = rgba(tone, 0.4 * (1 - pulse));
              context.lineWidth = 0.8;
              context.beginPath();
              context.arc(target.x, target.y, targetRing + pulse * Math.max(18, targetGlow * 0.7), 0, TAU);
              context.stroke();
            }
          }
        }
      });
    }

    function drawSun(sun, ignite, time, radius, collapse) {
      const flash = Math.exp(-Math.pow((time - 1.06) / 0.19, 2));
      const finalHalo = sun.glowRadius || sunRadius * 1.35;
      const haloFade = 1 - 0.52 * collapse;

      context.globalCompositeOperation = 'lighter';
      const fullHalo = radius * (2.3 + ignite * 1.45 + flash * 0.6);
      const haloRadius = fullHalo + (Math.max(radius * 1.5, finalHalo) - fullHalo) * collapse;
      const halo = context.createRadialGradient(sun.x, sun.y, radius * 0.1, sun.x, sun.y, Math.max(1, haloRadius));
      halo.addColorStop(0, `rgba(255,255,255,${(0.25 * ignite + flash * 0.16) * haloFade})`);
      halo.addColorStop(0.2, `rgba(255,255,255,${0.11 * ignite * haloFade})`);
      halo.addColorStop(0.52, `rgba(255,255,255,${0.03 * ignite * haloFade})`);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(sun.x, sun.y, haloRadius, 0, TAU);
      context.fill();

      const angle = -0.45 + time * 0.16;
      const sphereFade = Math.max(0, 1 - 1.04 * collapse);
      for (let index = 0; index < sunSphere.length; index += 1) {
        const point = projectPoint(sunSphere[index], angle, radius);
        const alpha = (0.18 + 0.82 * ignite) * (0.28 + point.alpha * 0.72) * sphereFade;
        drawDot(
          sun.x + point.x,
          sun.y + point.y,
          point.size * (0.9 + ignite * 0.2),
          alpha
        );
      }

      context.globalCompositeOperation = 'lighter';
      const coreRadius = Math.max(radius * 0.42, 7 + 5 * collapse);
      const core = context.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, coreRadius);
      core.addColorStop(0, `rgba(255,255,255,${0.96 * ignite + flash * 0.2})`);
      core.addColorStop(0.28, `rgba(255,255,255,${0.42 * ignite})`);
      core.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = core;
      context.beginPath();
      context.arc(sun.x, sun.y, coreRadius, 0, TAU);
      context.fill();

      for (const ember of embers) {
        const drift = 0.12 + (time * 0.018 + ember.phase) % 0.12;
        const distance = radius * (ember.distance + drift);
        const angleOffset = ember.angle + Math.sin(time * ember.speed + ember.phase) * 0.04;
        const alpha = ember.alpha * ignite * (0.5 + 0.5 * Math.sin(time * ember.speed * 2 + ember.phase)) * (1 - collapse);
        drawDot(
          sun.x + Math.cos(angleOffset) * distance,
          sun.y + Math.sin(angleOffset) * distance * 0.92,
          ember.size,
          alpha
        );
      }

      if (flash > 0.02) {
        context.strokeStyle = `rgba(255,255,255,${flash * 0.18})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(sun.x, sun.y, radius * (1.35 + (1 - flash) * 0.8), 0, TAU);
        context.stroke();
      }
    }

    function emitStatus(progress, stage) {
      const percent = Math.round(progress * 100);
      if (stage === lastStatus && percent === lastPercent) return;
      lastStatus = stage;
      lastPercent = percent;
      if (onStatus) {
        try {
          onStatus({ stage, progress, percent });
        } catch (error) {
          /* the show must go on */
        }
      }
    }

    function notifyComplete() {
      if (completionSent) return;
      completionSent = true;
      if (onComplete) {
        try {
          onComplete();
        } catch (error) {
          /* the page also has a safety timeout */
        }
      }
    }

    function tick(now) {
      if (finished) return;
      const time = Math.max(0, (now - started) / 1000);
      const ignite = smoothstep((time - 0.34) / 0.74);
      const rawLink = clamp((time - LINK_START) / (LINK_END - LINK_START), 0, 1);
      const link = easeInOutCubic(rawLink);
      const mergeStart = LINK_END + MERGE_DELAY;
      const merge = smoothstep((time - mergeStart) / MERGE_DURATION);
      let stage = time >= LINK_START
        ? 'connect'
        : time >= 0.5
          ? 'ignite'
          : 'planets';
      if (rawLink >= 0.999) stage = time >= mergeStart ? 'align' : 'connected';

      const anchors = readAnchors();
      const sun = anchors.sun;
      const targets = anchors.targets.slice(0, 6);

      // Make the constellation visibly longer than the page behind it, then
      // pull the whole thing back to the page's exact footprint. The fit
      // keeps the scaled endpoints on screen for narrow viewports.
      let extentX = 1;
      let extentY = 1;
      for (const target of targets) {
        const glow = target.glowRadius || 24;
        extentX = Math.max(extentX, Math.abs(target.x - sun.x) + glow);
        extentY = Math.max(extentY, Math.abs(target.y - sun.y) + glow);
      }
      const inset = width < 700 ? 18 : 44;
      const safeX = Math.max(90, Math.min(sun.x, width - sun.x) - inset);
      const safeY = Math.max(90, Math.min(sun.y, height - sun.y) - inset);
      const desiredScale = width < 700 ? 1.08 : 1.12;
      const fitScale = Math.min(safeX / extentX, safeY / extentY);
      const baseScale = Math.max(1, Math.min(desiredScale, fitScale));
      const scale = baseScale + (1 - baseScale) * merge;

      const pulse = 1 + Math.sin(time * 2.1) * 0.018;
      const fullRadius = sunRadius * (0.84 + ignite * 0.16) * pulse;
      const finalRadius = clamp(sun.coreRadius || sunRadius * 0.15, 5, 30);
      const radius = fullRadius + (finalRadius - fullRadius) * merge;

      emitStatus(link, stage);
      drawBackground(time);
      context.save();
      context.translate(sun.x, sun.y);
      context.scale(scale, scale);
      context.translate(-sun.x, -sun.y);
      drawOrbits(sun, ignite, time, merge);
      drawSun(sun, ignite, time, radius, merge);
      drawLinks(sun, link, time, radius);
      context.restore();
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';

      if (time >= LINK_END + HOLD) {
        finished = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        notifyComplete();
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (frame || finished) return;
      resize();
      window.addEventListener('resize', resize, { passive: true });
      started = performance.now();
      frame = requestAnimationFrame(tick);
    }

    function skip() {
      if (finished) return;
      finished = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      emitStatus(1, 'connected');
      notifyComplete();
    }

    function destroy() {
      finished = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener('resize', resize);
    }

    return Object.freeze({ start, skip, destroy });
  }

  window.ShuikePlansIntro = Object.freeze({ create });
})();
