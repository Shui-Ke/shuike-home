/* =========================================================
   SHUIKE EARTH — self-contained earth scene component
   ---------------------------------------------------------
   Drop one script tag on a page and mount the scene:

     <script src="UI/earth/earth.js" defer></script>
     <script>
       ShuikeEarth.mount({
         globe: { centerY: .52, maxRadius: 118 },
         archive: { href: 'profile/index.html' }
       });
     </script>

   earth.js injects the canvas, the world-map controls and (unless
   `terminal: false`) the ORBITAL TERMINAL / PERSONAL ARCHIVE block,
   then loads its own stylesheet and the four scene modules relative
   to this file. The page needs no earth markup of its own.

   Options
     terminal   boolean        render terminal + archive (default true)
     archive    object         { href, title, meta, ariaLabel }
     labels     object         UI strings (see LABELS)
     view       () => boolean  optional scene-active predicate; defaults
                              to the historic html[data-view="landing"]
                              gate when data-view exists, else active
     globe      object         forwarded to createDotGlobe (centerY,
                              maxRadius, speed, spacing, onZoom, ...)

   Inline embed (container option)
     wheel zoom, wheel-out → solar system, wheel-in → back to earth, and
     solar drag rotation stay inside the canvas; the page keeps scrolling
     everywhere else. The canvas is translucent, so the host's backdrop
     ghosts through. Use globe.tone for the dot colour and globe.zoomCap
     to allow zooming past the full-frame fit.

   Returns a promise: { globe, terminal, canvas, scene, host, inline, unmount }.
   ========================================================= */
(() => {
  'use strict';
  if (window.ShuikeEarth) return;

  const script = document.currentScript;
  const BASE = new URL('.', script?.src || location.href);
  const VERSION = '20261105-earth-planets';
  const MODULES = ['world-map.js', 'earth-texture.js', 'globe.js', 'terminal.js'];
  const scripts = new Map();

  const LABELS = {
    map: '展开地球世界地图',
    worldMap: '世界地图',
    retry: '重试定位',
    back: 'Return',
    terminal: 'SHUIKE 轨道终端',
    terminalBar: '轨道终端标题栏，拖动或方向键移动，Alt 加方向键缩放',
    close: '收起轨道终端',
    open: 'Personal Archive — 打开个人资料页',
    archive: '个人空间入口',
    archiveLink: '进入个人档案',
    launcher: '展开轨道终端',
    launcherName: '终端'
  };

  const DEFAULT_ARCHIVE = {
    href: 'profile/index.html',
    title: 'PERSONAL ARCHIVE',
    meta: '个人档案 / SHUIKE'
  };

  const escape = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function loadScript(name) {
    if (scripts.has(name)) return scripts.get(name);
    const promise = new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = new URL(name, BASE).href + '?v=' + VERSION;
      element.async = false;
      element.dataset.shuikeEarth = name;
      element.onload = () => resolve();
      element.onerror = () => reject(new Error('SHUIKE EARTH: could not load ' + name));
      document.head.append(element);
    });
    scripts.set(name, promise);
    return promise;
  }

  let stylePromise = null;
  function loadStyles() {
    if (stylePromise) return stylePromise;
    if (document.querySelector('link[data-shuike-earth-style]')) {
      stylePromise = Promise.resolve();
      return stylePromise;
    }
    stylePromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('earth.css', BASE).href + '?v=' + VERSION;
      link.dataset.shuikeEarthStyle = '';
      link.onload = link.onerror = () => resolve();
      document.head.append(link);
    });
    return stylePromise;
  }

  function sceneMarkup(options = {}) {
    const labels = { ...LABELS, ...(options.labels || {}) };
    const archive = { ...DEFAULT_ARCHIVE, ...(options.archive || {}) };
    const href = escape(archive.href);
    const inlineClass = options.container ? ' dot-globe--inline' : '';
    const map = options.map === false ? '' : `
    <button id="globe-open-map" class="globe-map-trigger" type="button" aria-label="${escape(labels.map)}" aria-controls="world-map-controls" hidden></button>
    <section class="map-controls" id="world-map-controls" aria-label="${escape(labels.worldMap)}" hidden>
      <div class="map-caption"><strong>WORLD MAP</strong><p class="map-status" id="map-status" role="status" aria-live="polite"></p></div>
      <div class="map-actions"><button id="map-retry" type="button" hidden>${escape(labels.retry)}</button><button id="map-back" type="button">${escape(labels.back)}</button></div>
    </section>`;
    const terminal = options.terminal === false ? '' : `
    <section class="earth-terminal" id="earth-terminal" data-earth-terminal aria-label="${escape(labels.terminal)}" aria-hidden="true" inert>
      <div class="earth-terminal-pod" data-terminal-pod>
        <header class="earth-terminal-bar" tabindex="0" aria-label="${escape(labels.terminalBar)}">
          <button class="earth-terminal-close" data-terminal-close type="button" aria-label="${escape(labels.close)}"><span aria-hidden="true">×</span></button>
          <span class="earth-terminal-status"><i aria-hidden="true"></i>ORBITAL TERMINAL</span>
          <span class="earth-terminal-code">NODE / 01</span>
        </header>
        <div class="earth-terminal-screen">
          <div class="earth-terminal-log" data-terminal-log>
            <p class="earth-terminal-echo"><span class="earth-terminal-prompt" aria-hidden="true">&gt;</span><a class="earth-terminal-open" data-terminal-open href="${href}" aria-label="${escape(labels.open)}" aria-disabled="true" tabindex="-1"><span class="earth-terminal-arrow" aria-hidden="true">→</span><span data-terminal-type></span></a><span class="earth-terminal-caret" aria-hidden="true"></span></p>
          </div>
          <form class="earth-terminal-form" data-terminal-form hidden>
            <span class="earth-terminal-prompt" aria-hidden="true">&gt;</span>
            <label class="sr-only" for="earth-terminal-command">终端命令</label>
            <input id="earth-terminal-command" data-terminal-input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入命令，help 查看帮助">
            <button type="submit" aria-label="执行命令">↵</button>
          </form>
          <p class="sr-only" data-terminal-live role="status" aria-live="polite"></p>
        </div>
        <footer class="earth-terminal-foot"><span>SHUIKE OS</span><span data-terminal-state>STANDBY</span></footer>
      </div>
    </section>
    <aside class="earth-archive" data-earth-archive aria-label="${escape(labels.archive)}" hidden>
      <span class="earth-archive-leader" aria-hidden="true"></span>
      <a class="earth-archive-link" href="${href}" aria-label="${escape(labels.archiveLink)}">
        <span class="earth-archive-title">${escape(archive.title)}</span><span class="earth-archive-arrow" aria-hidden="true">↗</span>
      </a>
      <div class="earth-archive-meta"><span>${escape(archive.meta)}</span><button class="earth-terminal-launcher" data-terminal-launcher type="button" aria-label="${escape(labels.launcher)}" aria-controls="earth-terminal" aria-expanded="false"><span aria-hidden="true">&gt;_</span> ${escape(labels.launcherName)}</button></div>
    </aside>`;
    return `
    <canvas class="dot-globe${inlineClass}" aria-hidden="true"></canvas>${map}${terminal}`;
  }

  function resolveHost(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }

  function ensureScene(options = {}) {
    const inline = options.container != null;
    let host = inline ? resolveHost(options.container) : document.body;
    if (!host) {
      console.warn('SHUIKE EARTH: container not found, mounting full-page instead.');
      return ensureScene({ ...options, container: null });
    }
    const existing = host.querySelector('.dot-globe');
    if (existing) {
      const wrapper = existing.closest('[data-shuike-earth-scene]');
      return { scene: wrapper || host, host, inline };
    }
    const scene = document.createElement('div');
    scene.dataset.shuikeEarthScene = '';
    scene.className = inline ? 'earth-scene earth-scene--inline' : 'earth-scene';
    scene.innerHTML = sceneMarkup(options);
    if (inline) host.classList.add('earth-host');
    host.append(scene);
    return { scene, host, inline };
  }

  let current = null;
  let mounting = null;

  async function mount(options = {}) {
    if (mounting) return mounting;
    mounting = (async () => {
      // Defer/body-end use is expected, but a head script still gets a body.
      if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
      }
      await loadStyles();
      const { scene, host, inline } = ensureScene(options);
      await loadScript('world-map.js');
      await loadScript('earth-texture.js');
      await loadScript('globe.js');
      if (options.terminal !== false) await loadScript('terminal.js');
      if (!window.ShuikeModules?.createDotGlobe) {
        throw new Error('SHUIKE EARTH: the globe module is unavailable.');
      }
      const canvas = scene.querySelector('.dot-globe');
      const elements = {
        mapTrigger: scene.querySelector('#globe-open-map'),
        mapControls: scene.querySelector('#world-map-controls'),
        mapStatus: scene.querySelector('#map-status'),
        mapBack: scene.querySelector('#map-back'),
        mapRetry: scene.querySelector('#map-retry')
      };
      const globe = window.ShuikeModules.createDotGlobe(canvas, {
        ...(options.globe || {}),
        texture: window.ShuikeEarthTexture || '',
        elements,
        view: options.view,
        interactive: options.interactive !== false,
        keyboard: options.keyboard !== undefined ? options.keyboard : !inline,
        // Inline embeds are interactive only inside their own frame: wheel,
        // pointer drag and zoom never leak to the rest of the page.
        wheelScope: inline ? canvas : null,
        pointerScope: inline ? canvas : null,
        observe: options.observe === true
      });
      const terminal = window.ShuikeEarthTerminal;
      const instance = {
        globe,
        terminal,
        canvas,
        scene,
        host,
        inline,
        unmount() {
          try { globe.destroy(); } catch (_) {}
          try { terminal?.destroy(); } catch (_) {}
          // A page that shipped its own markup only borrows the component:
          // never remove <body> when it was the fallback scene root.
          if (scene !== document.body) scene.remove();
          if (inline) host?.classList.remove('earth-host');
          if (current === instance) current = null;
          mounting = null;
        }
      };
      current = instance;
      return instance;
    })().catch(error => {
      mounting = null;
      console.warn(error);
      throw error;
    });
    return mounting;
  }

  window.ShuikeEarth = Object.freeze({
    mount,
    get current() { return current; },
    base: BASE.href,
    modules: Object.freeze(MODULES.slice())
  });
})();
