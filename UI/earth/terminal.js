// A light archive annotation beside the globe; the command window opens on demand.
(() => {
  'use strict';
  const root = document.querySelector('[data-earth-terminal]');
  if (!root) return;
  const doc = document.documentElement;
  const pod = root.querySelector('[data-terminal-pod]');
  const bar = root.querySelector('.earth-terminal-bar');
  const closeButton = root.querySelector('[data-terminal-close]');
  const launcher = document.querySelector('[data-terminal-launcher]');
  const archive = document.querySelector('[data-earth-archive]');
  const typeEl = root.querySelector('[data-terminal-type]');
  const openLink = root.querySelector('[data-terminal-open]');
  const log = root.querySelector('[data-terminal-log]');
  const form = root.querySelector('[data-terminal-form]');
  const input = root.querySelector('[data-terminal-input]');
  const live = root.querySelector('[data-terminal-live]');
  const stateEl = root.querySelector('[data-terminal-state]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const phrase = 'Personal Archive';
  const history = [];
  let historyIndex = 0;
  let view = doc.dataset.view || 'landing';
  // A page without the brand intro is ready immediately; the historic home
  // keeps waiting for its startup frame to finish.
  let introDone = !window.ShuikeIntro?.playing;
  let revealed = false;
  let grown = false;
  let ready = false;
  let minimized = true;
  let showTimer = 0;
  let drag = null;
  let resize = null;

  // Standalone embeds may not expose ShuikeHome; treat the scene as visible
  // then so the archive/terminal annotation still works on its own.
  const earthAnchor = () => window.ShuikeHome?.globe?.earthAnchor || null;
  const canShow = () => {
    if (!revealed || !introDone || view !== 'landing') return false;
    const anchor = earthAnchor();
    return anchor ? Boolean(anchor.visible) : true;
  };
  const setState = text => { if (stateEl) stateEl.textContent = text; };
  const terminalBounds = () => ({ left: 12, top: 12, right: innerWidth - 12, bottom: innerHeight - 12 });

  if (bar && window.ShuikeModules?.createDraggable) {
    drag = window.ShuikeModules.createDraggable(root, { handle: bar, getBounds: terminalBounds });
  }
  if (bar && window.ShuikeModules?.createResizable) {
    resize = window.ShuikeModules.createResizable(root, { handle: bar, getBounds: terminalBounds });
  }

  function sync() {
    const show = canShow();
    const panel = show && !minimized;
    root.classList.toggle('is-available', panel);
    root.setAttribute('aria-hidden', String(!panel));
    root.inert = !panel;
    if (!panel && root.contains(document.activeElement)) document.activeElement.blur?.();
    if (launcher) {
      launcher.setAttribute('aria-expanded', String(panel));
    }
    if (archive) {
      if (!show && archive.contains(document.activeElement)) document.activeElement.blur?.();
      archive.hidden = !show;
      const anchor = earthAnchor();
      if (anchor) archive.style.setProperty('--archive-radius', `${anchor.radius.toFixed(2)}px`);
    }
    if (panel && ready) setState('READY');
    if (panel && !grown) grow();
  }
  function revealSoon() {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => { revealed = true; sync(); }, reduced.matches ? 0 : 520);
  }
  function grow() {
    if (grown) return;
    grown = true;
    root.classList.add('is-grown');
    setState('LINKING');
    finish();
  }
  function finish() {
    if (ready) return;
    ready = true;
    typeEl.textContent = phrase;
    if (openLink) {
      openLink.tabIndex = 0;
      openLink.setAttribute('aria-disabled', 'false');
    }
    form.hidden = false;
    root.classList.add('is-ready');
    setState('READY');
    appendResponse('终端已连接。输入 help 查看命令。');
  }
  function appendResponse(text) {
    const line = document.createElement('p');
    line.className = 'earth-terminal-response';
    line.textContent = text;
    log.append(line);
    log.scrollTop = log.scrollHeight;
    if (live) live.textContent = text;
  }
  function appendEcho(text) {
    const line = document.createElement('p');
    line.className = 'earth-terminal-echo earth-terminal-echo--user';
    const prompt = document.createElement('span');
    prompt.className = 'earth-terminal-prompt';
    prompt.setAttribute('aria-hidden', 'true');
    prompt.textContent = '>';
    const body = document.createElement('span');
    body.textContent = text;
    line.append(prompt, body);
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }
  function run(raw) {
    const command = raw.trim();
    if (!command) return;
    if (history.at(-1) !== command) history.push(command);
    historyIndex = history.length;
    appendEcho(command);
    const key = command.toLowerCase();
    if (key === 'help') {
      appendResponse('可用命令\nhelp    命令列表\nabout   节点信息\nfiles   打开文件桌面\ntheme   切换昼夜\nclear   清空输出');
    } else if (key === 'about') {
      appendResponse('SHUIKE · 个人空间\nORBITAL TERMINAL / NODE 01\nLOCAL SESSION / EARTH');
    } else if (key === 'files') {
      appendResponse('正在打开文件桌面…');
      setState('OPENING');
      setTimeout(() => {
        try { window.ShuikeHome?.navigation?.showDesktop?.(); } catch (_) {}
      }, 260);
    } else if (key === 'theme') {
      window.ShuikeHome?.theme?.toggle?.();
      appendResponse('已切换昼夜模式。');
    } else if (key === 'clear') {
      log.replaceChildren();
      appendResponse('终端已清空。');
    } else if (key === 'open terminal') {
      appendResponse('终端已处于打开状态。');
    } else if (key === 'open') {
      appendResponse('终端已经打开；输入 files 进入文件桌面。');
    } else {
      appendResponse(`未知命令：${command}\n输入 help 查看可用命令。`);
    }
    if (key !== 'files') setState('READY');
  }

  function launcherTarget() {
    if (!launcher) return { x: innerWidth - 46, y: 46, size: 44 };
    const wasHidden = launcher.hidden;
    launcher.hidden = false;
    launcher.style.visibility = 'hidden';
    const rect = launcher.getBoundingClientRect();
    launcher.style.visibility = '';
    launcher.hidden = wasHidden;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width };
  }
  function minimize() {
    if (minimized || !canShow()) return;
    drag?.stop();
    resize?.stop();
    const rect = root.getBoundingClientRect();
    const target = launcherTarget();
    const scale = Math.min(.2, target.size / Math.max(1, rect.width, rect.height));
    const dx = target.x - (rect.left + rect.width / 2);
    const dy = target.y - (rect.top + rect.height / 2);
    let settled = false;
    const finishMinimize = () => {
      if (settled) return;
      settled = true;
      minimized = true;
      root.classList.add('is-minimized');
      root.style.removeProperty('visibility');
      root.style.removeProperty('opacity');
      root.style.removeProperty('pointer-events');
      sync();
      if (launcher && !launcher.hidden) launcher.focus({ preventScroll: true });
    };
    if (reduced.matches || typeof root.animate !== 'function') { finishMinimize(); return; }
    const animation = root.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
    ], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    animation.finished.then(() => { animation.cancel(); finishMinimize(); }).catch(finishMinimize);
  }
  function restore() {
    if (!minimized || !canShow()) return;
    minimized = false;
    root.classList.remove('is-minimized');
    resize?.setRect(resize.getRect());
    const rect = root.getBoundingClientRect();
    const target = launcherTarget();
    const scale = Math.min(.2, target.size / Math.max(1, rect.width, rect.height));
    const dx = target.x - (rect.left + rect.width / 2);
    const dy = target.y - (rect.top + rect.height / 2);
    root.style.visibility = 'visible';
    root.style.opacity = '0';
    root.style.pointerEvents = 'none';
    sync();
    const finishRestore = () => {
      root.style.removeProperty('visibility');
      root.style.removeProperty('opacity');
      root.style.removeProperty('pointer-events');
      if (view === 'landing' && closeButton) closeButton.focus({ preventScroll: true });
    };
    if (reduced.matches || typeof root.animate !== 'function') { finishRestore(); return; }
    const animation = root.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 }
    ], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    animation.finished.then(() => { animation.cancel(); finishRestore(); }).catch(finishRestore);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    run(value);
  }, options);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { input.blur(); return; }
    if (event.key === 'ArrowUp') {
      if (!history.length) return;
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || '';
      return;
    }
    if (event.key === 'ArrowDown') {
      if (!history.length) return;
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || '';
    }
  }, options);
  input.addEventListener('focus', () => root.classList.add('is-focused'), options);
  input.addEventListener('blur', () => root.classList.remove('is-focused'), options);
  pod.addEventListener('click', event => {
    if (!ready || event.target.closest('input, button, form, a')) return;
    input.focus({ preventScroll: true });
  }, options);
  form.addEventListener('pointerdown', event => event.stopPropagation(), options);
  closeButton?.addEventListener('click', minimize, options);
  launcher?.addEventListener('click', restore, options);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); minimize(); }
  }, options);
  document.addEventListener('shuike:earth-anchor', sync, options);

  document.addEventListener('shuike:intro-end', () => { introDone = true; revealSoon(); }, options);
  document.addEventListener('shuike:view-change', event => {
    view = event.detail.view;
    if (view !== 'landing') { drag?.stop(); resize?.stop(); }
    sync();
  }, options);
  reduced.addEventListener('change', () => { if (reduced.matches && grown && !ready) finish(); }, options);

  if (introDone) revealSoon(); else sync();
  window.ShuikeEarthTerminal = Object.freeze({
    get grown() { return grown; },
    get ready() { return ready; },
    get visible() { return root.classList.contains('is-available'); },
    get minimized() { return minimized; },
    get phrase() { return phrase; },
    minimize,
    restore,
    focus() { if (ready && !minimized) input.focus({ preventScroll: true }); },
    destroy() {
      clearTimeout(showTimer);
      controller.abort();
      drag?.destroy(); resize?.destroy();
      drag = null; resize = null;
      root.classList.remove('is-available', 'is-grown', 'is-ready', 'is-focused', 'is-minimized');
      root.setAttribute('aria-hidden', 'true'); root.inert = true;
      root.style.removeProperty('visibility');
      root.style.removeProperty('opacity');
      root.style.removeProperty('pointer-events');
      if (archive) archive.hidden = true;
    }
  });
})();
