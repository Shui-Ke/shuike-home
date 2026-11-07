/* Profile → Personal page transition.
   Clicking [data-profile-link] covers the terminal with a canvas-coloured
   curtain, assembles the champagne-gold SK mark from small rectangles and
   fades every playing <audio> element (music + the OC voice bank) to zero.
   Every load of the dossier starts on the same cover and is pulled down with
   it, no matter whether the entry came from the profile card, the home
   window, a demo index, the photo page or a direct URL. */
(() => {
  'use strict';

  const SOURCE_KEY = 'shuike:personal-source';
  const RISE_MS = 1100;
  const LOGO_START = 1200;
  const LOGO_BEAT = 300;
  const BAR_MS = 360;
  const HOLD_MS = 520;
  const REDUCED_HOLD_MS = 520;
  const FULL_HOLD_MS = 340;
  const FADE_MS = 2500;
  const REVEAL_MS = 900;
  const REVEAL_DELAY = 260;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // The GM monogram in the same bar-and-hairline language as the original
  // mark: the G is an open top-right bowl with a lower-right stem and crossbar;
  // the M is three stems joined by a top rail, its centre stem stopping short.
  // Every piece grows from the hairline. Delays read left to right.
  const MARK = [
    { x: 25, y: 16, w: 18, h: 100, axis: 'y', delay: 30 },
    { x: 53, y: 64, w: 18, h: 52, axis: 'y', delay: 85 },
    { x: 81, y: 16, w: 18, h: 100, axis: 'y', delay: 140 },
    { x: 109, y: 16, w: 18, h: 58, axis: 'y', delay: 195 },
    { x: 137, y: 16, w: 18, h: 100, axis: 'y', delay: 250 },
    { x: 25, y: 16, w: 28, h: 8, axis: 'x', delay: 440 },
    { x: 55, y: 64, w: 16, h: 8, axis: 'x', delay: 490 },
    { x: 25, y: 108, w: 46, h: 8, axis: 'x', delay: 540 },
    { x: 81, y: 16, w: 74, h: 8, axis: 'x', delay: 600 }
  ];
  const BASE = { x: 25, y: 116, w: 130, h: 2 };

  let running = false;
  let logoSeq = 0;
  let fadeSnapshot = null;

  const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svgNode = (name, attributes = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function buildLogo(container) {
    const gid = `pt-gold-${++logoSeq}`;
    const svg = svgNode('svg', {
      viewBox: '0 0 180 132',
      class: 'pt-logo',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    const defs = svgNode('defs');
    const gradient = svgNode('linearGradient', {
      id: gid,
      gradientUnits: 'userSpaceOnUse',
      x1: '0',
      y1: '0',
      x2: '180',
      y2: '132'
    });
    [
      ['pt-gold-stop--hi', '0'],
      ['pt-gold-stop--mid', '.56'],
      ['pt-gold-stop--lo', '1']
    ].forEach(([className, offset]) => {
      gradient.append(svgNode('stop', { class: className, offset }));
    });
    defs.append(gradient);
    svg.append(defs);

    const group = svgNode('g', { fill: `url(#${gid})` });
    group.append(svgNode('rect', {
      x: BASE.x,
      y: BASE.y,
      width: BASE.w,
      height: BASE.h,
      rx: '1',
      class: 'pt-logo-base'
    }));

    let maxDelay = 0;
    MARK.forEach((bar) => {
      maxDelay = Math.max(maxDelay, bar.delay);
      const rect = svgNode('rect', {
        x: bar.x,
        y: bar.y,
        width: bar.w,
        height: bar.h,
        rx: '1',
        class: `pt-bar pt-bar--${bar.axis}`
      });
      rect.style.setProperty('--pt-delay', `${bar.delay}ms`);
      rect.style.setProperty('--pt-origin', bar.axis === 'y' ? 'center bottom' : 'left center');
      group.append(rect);
    });

    svg.append(group);
    container.append(svg);
    return maxDelay + BAR_MS;
  }

  function makeMask() {
    const layer = document.createElement('div');
    layer.className = 'pt-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="pt-mask"><div class="pt-logo-wrap" data-pt-logo></div></div>';
    document.body.append(layer);
    const mask = layer.firstElementChild;
    const total = buildLogo(mask.querySelector('[data-pt-logo]'));
    return { layer, mask, total };
  }

  function fadeAudio(duration) {
    const audios = Array.from(document.querySelectorAll('audio'))
      .filter((audio) => !audio.paused && !audio.ended && audio.volume > .001);
    if (!audios.length) return;
    const levels = audios.map((audio) => audio.volume);
    fadeSnapshot = { audios, levels };
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = t * t * (3 - 2 * t);
      audios.forEach((audio, index) => {
        try { audio.volume = Math.max(0, levels[index] * (1 - eased)); } catch (_) {}
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function restoreAudio() {
    if (!fadeSnapshot) return;
    fadeSnapshot.audios.forEach((audio, index) => {
      try { audio.volume = fadeSnapshot.levels[index]; } catch (_) {}
    });
    fadeSnapshot = null;
  }

  function rise(mask, duration) {
    return new Promise((resolve) => {
      const started = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - started) / duration);
        // Constant acceleration to the middle, then constant deceleration.
        const progress = t < .5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
        mask.style.transform = `translate3d(0,${((1 - progress) * 100).toFixed(3)}%,0)`;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  function commit(target) {
    try { sessionStorage.setItem(SOURCE_KEY, location.href); } catch (_) {}
    location.href = target;
  }

  // ---------------------------------------------------------------------------
  // Source-aware back control
  // ---------------------------------------------------------------------------

  function internalUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
      const bothFiles = url.protocol === 'file:' && location.protocol === 'file:';
      if (!bothFiles && url.origin !== location.origin) return null;
      // A reload, the directory form of this document, or an in-page hash is
      // not a previous page, so it must not become the back target.
      const normalize = (path) => path.replace(/\/index\.html$/, '/');
      const normalized = normalize(url.pathname);
      if (normalized === normalize(location.pathname)) return null;
      // profile/personal/ is the old address of the home page: not a source.
      if (/\/profile\/personal\/$/.test(normalized)) return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function takeStoredSource() {
    try {
      const value = sessionStorage.getItem(SOURCE_KEY);
      if (value) sessionStorage.removeItem(SOURCE_KEY);
      return internalUrl(value);
    } catch (_) {
      return null;
    }
  }

  function historySource() {
    try {
      const state = history.state;
      return state && typeof state === 'object' ? internalUrl(state.shuikeBack) : null;
    } catch (_) {
      return null;
    }
  }

  function rememberSource(source) {
    if (!source) return;
    try {
      const current = history.state && typeof history.state === 'object' ? history.state : {};
      history.replaceState({ ...current, shuikeBack: source }, '', location.href);
    } catch (_) {}
  }

  function backKind(url) {
    if (!url) return 'fallback';
    let path = '';
    try { path = new URL(url).pathname.replace(/\\/g, '/').toLowerCase(); } catch (_) { return 'previous'; }
    if (/\/profile\/(?:index\.html)?$/.test(path)) return 'profile';
    if (/\/demos\//.test(path)) return 'demo';
    if (/\/photo\/(?:index\.html)?$/.test(path)) return 'photo';
    if (/\/xp-blog\//.test(path)) return 'blog';
    if (/\/home-classic\.html$/.test(path)) return 'home';
    if (path === '/' || path.endsWith('/') || /\/index\.html$/.test(path)) return 'home';
    return 'previous';
  }

  const BACK_LABELS = {
    profile: ['返回个人终端', 'Back to profile terminal'],
    home: ['返回首页', 'Back to home'],
    demo: ['返回演示页', 'Back to demo'],
    photo: ['返回相册', 'Back to photo'],
    blog: ['返回博客', 'Back to blog'],
    previous: ['返回上一页', 'Back to previous page'],
    // The dossier is now the site home, so its only static fallback is the
    // profile terminal (the previous branch of the same journey).
    fallback: ['个人终端', 'Profile terminal']
  };

  function setupBack() {
    const link = document.querySelector('[data-personal-back]');
    if (!link) return;
    const fallback = new URL(link.dataset.backFallback || 'profile/index.html', location.href).href;
    const stored = takeStoredSource();
    const source = stored || historySource() || internalUrl(document.referrer);
    const hasHistory = history.length > 1;
    if (stored && backKind(stored) === 'profile') {
      document.documentElement.classList.add('pt-from-profile');
    }
    if (source) rememberSource(source);
    const target = source || fallback;
    const labels = source
      ? (BACK_LABELS[backKind(source)] || BACK_LABELS.previous)
      : (hasHistory ? BACK_LABELS.previous : BACK_LABELS.fallback);
    const lang = document.documentElement.dataset.lang === 'en' ? 'en' : 'zh';

    link.href = target;
    link.dataset.backLabelZh = labels[0];
    link.dataset.backLabelEn = labels[1];
    link.setAttribute('aria-label', lang === 'en' ? labels[1] : labels[0]);

    // In-page anchors add history entries too. If one was used, history.back()
    // would only return to the previous scroll position, so navigate to the
    // detected source page directly instead.
    let hashNavigated = false;
    window.addEventListener('hashchange', () => { hashNavigated = true; });

    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // Returning through history keeps the source page's own state. When the
      // referrer is suppressed (common on file://), history.length still
      // proves that an internal source exists. A fresh tab falls back to the
      // resolved source URL instead.
      const goBack = () => {
        if (hasHistory && !hashNavigated) history.back();
        else location.href = target;
      };
      // The element-level back handler runs first and consumes the click, so
      // the generic page-transition listener stands down. Hand the resolved
      // destination to the shared veil and run the history-aware exit only
      // after the document is fully black.
      if (!window.ShuikePageTransition?.navigate(target, { action: goBack })) goBack();
    });
  }

  function openPersonal(link) {
    if (running) return;
    const target = link.href;
    if (!target) return;
    running = true;
    // No upward curtain on the source any more: cover it with a black stage
    // immediately, then let the destination's closed cover play the GM intro.
    try {
      const layer = document.createElement('div');
      layer.className = 'pt-layer';
      layer.setAttribute('aria-hidden', 'true');
      const veil = document.createElement('div');
      veil.className = 'pt-mask';
      veil.style.transform = 'translate3d(0,0,0)';
      layer.append(veil);
      document.body.append(layer);
      document.body.setAttribute('aria-busy', 'true');
      document.documentElement.classList.add('pt-running');
    } catch (_) {}
    commit(target);
  }

  function coverRise(cover) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        // Keep the curtain closed even once the CSS animation is detached.
        cover.style.transform = 'translate3d(0,0,0)';
        resolve();
      };

      if (!cover.getAnimations) {
        window.setTimeout(finish, RISE_MS + 100);
        return;
      }

      const rise = cover.getAnimations().find((animation) => animation.animationName === 'pt-cover-rise');
      if (!rise) {
        finish();
        return;
      }
      if (rise.playState === 'finished') {
        finish();
        return;
      }
      rise.finished.then(finish, finish);
      window.setTimeout(finish, RISE_MS + 300);
    });
  }

  function pageReady(limit = 800) {
    const loaded = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise((resolve) => {
          window.addEventListener('load', resolve, { once: true });
          window.setTimeout(resolve, limit);
        });
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.race([
      Promise.all([loaded, fonts]),
      new Promise((resolve) => window.setTimeout(resolve, limit))
    ]);
  }

  function beginReveal() {
    const root = document.documentElement;
    const cover = document.querySelector('[data-pt-cover]');
    if (!cover) return;
    const reduce = prefersReduced();
    const fullIntro = !root.classList.contains('pt-continuation');

    const logoHost = cover.querySelector('[data-pt-logo]');
    root.classList.add('pt-running');
    document.body.setAttribute('aria-busy', 'true');
    document.body.inert = true;

    const shield = document.querySelector('[data-pt-shield]');

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      cover.remove();
      if (shield) shield.remove();
      root.classList.remove('pt-running', 'pt-page-enter', 'pt-revealing', 'pt-from-profile');
      document.body.removeAttribute('aria-busy');
      document.body.inert = false;
    };

    const reveal = () => {
      // Pin the curtain closed before dropping the CSS rise animation; its
      // base transform would otherwise be the open position again.
      cover.style.transform = 'translate3d(0,0,0)';
      // Drop the offstage state before the page entrance takes over. Both
      // changes happen before paint, so there is no content flash.
      root.classList.remove('pt-full-intro');
      if (shield) shield.remove();
      if (reduce || !cover.animate) {
        cover.style.transform = 'translate3d(0,100%,0)';
        window.setTimeout(cleanup, 40);
        return;
      }
      // The page is fully painted under the cover; pull it down together with
      // the cover. Both transitions start on the same frame.
      root.classList.add('pt-page-enter');
      void root.offsetWidth;
      root.classList.add('pt-revealing');
      const animation = cover.animate(
        [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,100%,0)' }],
        { duration: REVEAL_MS, easing: 'cubic-bezier(.6,0,.35,1)', fill: 'forwards' }
      );
      if (animation.finished) animation.finished.then(cleanup, cleanup);
      window.setTimeout(cleanup, REVEAL_MS + 180);
    };

    if (reduce || !cover.animate) {
      window.setTimeout(reveal, 80);
      return;
    }

    if (fullIntro) {
      // The cover is already closed and black. Build the GM mark, let the
      // black stage sit for a beat, play the assembly, hold the finished mark,
      // then pull the curtain down over the painted page.
      let logoTotal = 0;
      if (logoHost) {
        const staticLogo = logoHost.querySelector('.pt-logo--static');
        cover.classList.add('is-intro');
        try {
          logoTotal = buildLogo(logoHost);
          if (staticLogo) staticLogo.remove();
        } catch (_) {
          cover.classList.remove('is-intro');
        }
      }

      const logoReady = new Promise((resolve) => {
        window.setTimeout(() => {
          cover.classList.add('is-assembling');
          window.setTimeout(() => {
            cover.classList.add('is-complete');
            resolve();
          }, logoTotal + 80);
        }, LOGO_BEAT);
      });

      Promise.all([pageReady(), logoReady]).then(
        () => window.setTimeout(reveal, FULL_HOLD_MS),
        () => window.setTimeout(reveal, FULL_HOLD_MS)
      );
      return;
    }

    // Coming from the profile card: the rise and logo already played there.
    // Wait for the dossier's first paint (bounded), then pull the cover down.
    pageReady().then(
      () => window.setTimeout(reveal, REVEAL_DELAY),
      () => window.setTimeout(reveal, REVEAL_DELAY)
    );
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const link = node.closest('[data-profile-link]');
    if (!link || (link.target && link.target !== '_self')) return;
    event.preventDefault();
    openPersonal(link);
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    running = false;
    restoreAudio();
    const layer = document.querySelector('.pt-layer');
    if (layer) layer.remove();
    const cover = document.querySelector('[data-pt-cover]');
    if (cover) cover.remove();
    const shield = document.querySelector('[data-pt-shield]');
    if (shield) shield.remove();
    document.documentElement.classList.remove('pt-running', 'pt-page-enter', 'pt-revealing', 'pt-from-profile');
    document.body.removeAttribute('aria-busy');
    document.body.inert = false;
  });

  setupBack();
  beginReveal();
})();
