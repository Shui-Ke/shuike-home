/*
 * SHUIKE universal page transition.
 *
 * A normal in-site navigation fades the current document under a full-screen
 * theme veil (black at night, warm paper by day), holds the veil while the next
 * document paints, then slowly fades the veil away to reveal the destination.
 * It is deliberately page-agnostic: include the stylesheet and this script
 * early in <head>, and ordinary same-origin HTML links are handled automatically.
 *
 * Opt-outs:
 *   <a data-page-transition="off">  leave this link to its own transition
 *   <html data-page-transition-entry="off">
 *       the page owns its opening (home brand, Plans intro, personal curtain);
 *       the handoff is consumed, but no universal cover is shown on arrival.
 *   modified / middle clicks, target=_blank, downloads, external links,
 *   same-document hash links and prefers-reduced-motion keep native navigation.
 *
 * Programmatic navigation:
 *   if (!window.ShuikePageTransition.navigate(url)) location.assign(url);
 *   (navigate() returns false whenever the browser should navigate natively.)
 *   For history-based exits, pass an action that runs once the veil is closed:
 *   ShuikePageTransition.navigate(backTarget, { action: () => history.back() });
 *
 * Custom events (document):
 *   shuike:page-transition:leave     {target}     veil starts closing
 *   shuike:page-transition:enter     {target}     destination veil starts opening
 *   shuike:page-transition:complete  {target}     destination is interactive
 *   shuike:page-transition:cancel    {target}     departure was cancelled
 */
(() => {
  'use strict';
  if (window.ShuikePageTransition) return;

  const KEY = 'shuike:page-transition:v1';
  const PARAM = '_shuike_transition';
  const TTL = 15000;
  const OUT_MS = 780;
  const HOLD_MS = 120;
  const IN_MS = 1200;
  const MIN_COVER_MS = 260;
  const READY_LIMIT_MS = 1400;
  const OUT_EASE = 'cubic-bezier(.55,.06,.25,1)';
  const IN_EASE = 'cubic-bezier(.45,0,.25,1)';
  const Z_INDEX = '2147483000';
  const ROOT = document.documentElement;
  const ENTRY_OFF = ROOT.getAttribute('data-page-transition-entry') === 'off';

  let leaving = false;
  let leaveAbort = null;
  let entryRun = null;
  let storageAvailable = true;

  const reducedMotion = () => {
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  };

  const wait = (ms) => new Promise((resolve) => {
    if (ms <= 0) { resolve(); return; }
    window.setTimeout(resolve, ms);
  });

  const nextPaint = () => new Promise((resolve) => {
    if (document.hidden) {
      window.setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const emit = (phase, detail = {}) => {
    try {
      document.dispatchEvent(new CustomEvent(`shuike:page-transition:${phase}`, { detail }));
    } catch (_) {}
  };

  const pathKey = (pathname) => pathname.replace(/\/index\.html?$/i, '/');

  function pageMatches(candidate) {
    try {
      const target = new URL(candidate, location.href);
      const current = new URL(location.href);
      if (target.protocol !== current.protocol || target.host !== current.host) return false;
      return pathKey(target.pathname) === pathKey(current.pathname)
        && target.search === current.search;
    } catch (_) {
      return false;
    }
  }

  function isHtmlDestination(url) {
    const last = url.pathname.split('/').pop() || '';
    if (!last) return true;
    const dot = last.lastIndexOf('.');
    if (dot < 0) return true;
    const extension = last.slice(dot + 1).toLowerCase();
    return extension === 'html' || extension === 'htm';
  }

  function resolveNavigation(raw) {
    if (!raw) return null;
    let url;
    try {
      url = new URL(raw, location.href);
    } catch (_) {
      return null;
    }
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
    if (url.protocol === 'file:') {
      if (location.protocol !== 'file:') return null;
    } else if (url.origin !== location.origin) {
      return null;
    }
    if (!isHtmlDestination(url)) return null;
    return url;
  }

  function isSameDocument(url) {
    try {
      const current = new URL(location.href);
      if (url.protocol !== current.protocol || url.host !== current.host) return false;
      return pathKey(url.pathname) === pathKey(current.pathname)
        && url.search === current.search;
    } catch (_) {
      return false;
    }
  }

  function mountOverlay(phase, opacity) {
    const existing = document.querySelector('.spt-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'spt-overlay';
    overlay.dataset.phase = phase;
    overlay.setAttribute('aria-hidden', 'true');
    // Inline the critical layer so it is already the active theme's veil colour
    // during the first paint of an arriving document, even before the
    // stylesheet has been evaluated.
    overlay.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX};`
      + 'width:100%;height:100%;background:var(--spt-veil,#000);pointer-events:auto;'
      + 'user-select:none;touch-action:none;will-change:opacity;'
      + `opacity:${opacity};contain:strict;`;
    // The cover is intentionally outside <body>: this script may run in <head>,
    // before the parser has created the destination body.
    ROOT.append(overlay);
    return overlay;
  }

  function fadeOverlay(overlay, to, duration, easing) {
    const from = Number.parseFloat(getComputedStyle(overlay).opacity);
    const start = Number.isFinite(from) ? from : (to === 0 ? 1 : 0);
    const finish = () => {
      overlay.style.opacity = String(to);
    };
    if (duration <= 0 || typeof overlay.animate !== 'function') {
      finish();
      return wait(duration);
    }
    let animation;
    try {
      animation = overlay.animate(
        [{ opacity: start }, { opacity: to }],
        { duration, easing, fill: 'forwards' }
      );
    } catch (_) {
      finish();
      return wait(duration);
    }
    // The timeout keeps a backgrounded/throttled tab from stalling a handoff.
    return Promise.race([
      animation.finished.catch(() => {}),
      wait(duration + 120)
    ]).then(() => {
      finish();
      try { animation.cancel(); } catch (_) {}
    });
  }

  function readHandoff() {
    let viaUrl = null;
    try {
      const url = new URL(location.href);
      if (url.searchParams.has(PARAM)) {
        const raw = url.searchParams.get(PARAM) || '';
        url.searchParams.delete(PARAM);
        try {
          history.replaceState(history.state, '', url.href);
        } catch (_) {}
        const at = Number.parseInt(raw, 36);
        if (Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at < TTL) {
          viaUrl = { at };
        }
      }
    } catch (_) {}

    let viaStorage = null;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        sessionStorage.removeItem(KEY);
        const saved = JSON.parse(raw);
        if (saved && Number.isFinite(saved.at)
          && Date.now() - saved.at >= 0
          && Date.now() - saved.at < TTL
          && (!saved.to || pageMatches(saved.to))) {
          viaStorage = saved;
        }
      }
    } catch (_) {}

    return viaUrl || viaStorage;
  }

  function writeHandoff(target) {
    if (storageAvailable) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), to: target }));
        return target;
      } catch (_) {
        storageAvailable = false;
      }
    }
    // A query marker is the fallback for file:// / privacy modes where
    // sessionStorage may not survive the document swap. The destination
    // consumes and strips it before any other script runs.
    try {
      const url = new URL(target);
      url.searchParams.set(PARAM, Date.now().toString(36));
      return url.href;
    } catch (_) {
      return target;
    }
  }

  function clearDocumentState() {
    ROOT.classList.remove('spt-leaving', 'spt-entering');
  }

  function removeOverlay() {
    const overlay = document.querySelector('.spt-overlay');
    if (overlay) overlay.remove();
  }

  function finishEntry() {
    if (!entryRun) return;
    const run = entryRun;
    entryRun = null;
    run.cancelled = true;
    window.clearTimeout(run.failsafe);
    removeOverlay();
    clearDocumentState();
    if (document.body && run.inertSet) document.body.inert = run.bodyWasInert;
    emit('complete', { target: run.target });
  }

  function beginEntry() {
    if (reducedMotion()) return;
    const body = document.body;
    const overlay = mountOverlay('in', 1);
    ROOT.classList.add('spt-entering');

    const started = performance.now();
    const run = {
      cancelled: false,
      bodyWasInert: false,
      inertSet: false,
      target: location.href,
      failsafe: 0
    };
    entryRun = run;

    const holdBody = () => {
      if (entryRun !== run || run.cancelled || !document.body) return;
      run.bodyWasInert = document.body.inert;
      run.inertSet = true;
      document.body.inert = true;
    };
    if (body) holdBody();
    else document.addEventListener('DOMContentLoaded', holdBody, { once: true });

    const ready = new Promise((resolve) => {
      if (document.readyState === 'complete') { resolve(); return; }
      window.addEventListener('load', resolve, { once: true });
    });
    const fonts = document.fonts && document.fonts.ready
      ? document.fonts.ready.catch(() => {})
      : Promise.resolve();
    Promise.race([
      Promise.all([ready, fonts]),
      wait(READY_LIMIT_MS)
    ]).then(async () => {
      if (run.cancelled) return;
      const elapsed = performance.now() - started;
      await wait(Math.max(0, MIN_COVER_MS - elapsed));
      await nextPaint();
      if (run.cancelled) return;
      emit('enter', { target: run.target });
      await fadeOverlay(overlay, 0, IN_MS, IN_EASE);
      if (run.cancelled) return;
      finishEntry();
    }).catch(() => finishEntry());

    // The page must never stay covered if an unexpected load/reveal path dies.
    run.failsafe = window.setTimeout(() => finishEntry(), READY_LIMIT_MS + IN_MS + 5000);
  }

  function resetAfterPageSwap() {
    if (leaveAbort) {
      const abort = leaveAbort;
      leaveAbort = null;
      abort(true);
    }
    if (entryRun) {
      const run = entryRun;
      entryRun = null;
      run.cancelled = true;
      window.clearTimeout(run.failsafe);
      if (document.body && run.inertSet) document.body.inert = run.bodyWasInert;
    }
    leaving = false;
    removeOverlay();
    clearDocumentState();
  }

  function beginLeave(targetUrl, options = {}) {
    if (leaving) return true;
    if (reducedMotion()) return false;

    const target = targetUrl.href;
    if (isSameDocument(targetUrl)) return false;
    if (entryRun) finishEntry();

    leaving = true;
    ROOT.classList.add('spt-leaving');
    const overlay = mountOverlay('out', 0);
    const body = document.body;
    const bodyWasInert = body ? body.inert : false;
    if (body) body.inert = true;
    let finished = false;
    let failsafe = 0;

    const abort = (silent = false) => {
      if (finished) return;
      finished = true;
      leaving = false;
      leaveAbort = null;
      window.clearTimeout(failsafe);
      removeOverlay();
      clearDocumentState();
      if (document.body) document.body.inert = bodyWasInert;
      if (!silent) emit('cancel', { target });
    };

    leaveAbort = abort;
    failsafe = window.setTimeout(() => abort(), OUT_MS + HOLD_MS + 3000);

    emit('leave', { target });
    fadeOverlay(overlay, 1, OUT_MS, OUT_EASE)
      .then(() => wait(HOLD_MS))
      .then(() => {
        if (finished) return;
        const destination = writeHandoff(target);
        try {
          if (typeof options.action === 'function') options.action();
          else if (options.replace) location.replace(destination);
          else location.assign(destination);
        } catch (_) {
          abort();
        }
      })
      .catch(() => abort());

    // pagehide cleans the closed veil from a bfcache snapshot; pageshow
    // replays the destination reveal when the history entry is restored.
    return true;
  }

  function navigate(raw, options = {}) {
    if (typeof raw !== 'string' && !(raw instanceof URL)) return false;
    const target = resolveNavigation(raw.toString());
    if (!target) return false;
    if (leaving) return true;
    return beginLeave(target, options);
  }

  function onClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey) return;

    let node = event.target;
    if (!(node instanceof Element)) {
      if (event.target instanceof Node) node = event.target.parentElement;
    }
    const link = node instanceof Element ? node.closest('a[href]') : null;
    if (!link) return;

    if (leaving) {
      event.preventDefault();
      return;
    }
    if (link.hasAttribute('download')) return;
    if (link.dataset.pageTransition === 'off'
      || link.closest('[data-page-transition="off"]')) return;
    if (link.getAttribute('aria-disabled') === 'true') return;
    const linkTarget = (link.getAttribute('target') || '').trim().toLowerCase();
    if (linkTarget && linkTarget !== '_self') return;

    const target = resolveNavigation(link.href);
    if (!target) return;
    if (isSameDocument(target)) return;

    if (navigate(target.href)) event.preventDefault();
  }

  document.addEventListener('click', onClick);

  window.addEventListener('pagehide', () => {
    resetAfterPageSwap();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    resetAfterPageSwap();
    // A history back restores this document without running the head script
    // again. Consume the same handoff here so a page with its own first-load
    // intro still gets a theme-matched reveal without replaying that intro.
    const handoff = readHandoff();
    if (!handoff) return;
    beginEntry();
    // Some pages also clean up body.inert in their own pageshow handler. Put
    // the entry lock back after the whole pageshow dispatch has finished.
    const enforceEntryLock = () => {
      if (entryRun?.inertSet && document.body) document.body.inert = true;
    };
    queueMicrotask(enforceEntryLock);
    window.setTimeout(enforceEntryLock, 0);
  });

  const handoff = readHandoff();
  if (handoff && !ENTRY_OFF) {
    beginEntry();
  }

  window.ShuikePageTransition = Object.freeze({
    navigate,
    isActive: () => leaving || Boolean(entryRun),
    durations: Object.freeze({ leave: OUT_MS, hold: HOLD_MS, enter: IN_MS })
  });
})();
