/* Keep the figure and eye anchored while the rest of the interface fades. */
(() => {
  'use strict';
  const eye = document.querySelector('[data-focus-toggle]');
  if (!eye) return;
  const panels = [...document.querySelectorAll('[data-focus-hide]')];
  eye.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('is-focus-mode');
    eye.classList.toggle('is-shown', !hidden);
    eye.setAttribute('aria-pressed', String(hidden));
    eye.setAttribute('aria-label', hidden ? '显示全部界面' : '隐藏其他界面，保留 OC 与互动菜单');
    // Inert blocks pointer and keyboard interaction without collapsing layout.
    panels.forEach(panel => { panel.inert = hidden; });
    eye.focus({ preventScroll: true });
  });
})();

/* Sync button: sends the side rail off to the right, then slides the topic board
   in from the same edge; a second press reverses the sequence. */
(() => {
  'use strict';
  const sync = document.querySelector('[data-sync]');
  const rail = document.querySelector('.side-rail-wrap');
  const board = document.querySelector('[data-topic-board]');
  const shell = document.querySelector('.terminal-shell');
  const thumbs = [...document.querySelectorAll('[data-topic-pick]')];
  const icon = sync ? sync.querySelector('.sync-button__icon') : null;
  const SWAP_MS = 520;
  let open = false;
  let timer = 0;

  const spin = () => {
    if (!icon) return;
    icon.classList.remove('is-rotating');
    void icon.offsetWidth;
    icon.classList.add('is-rotating');
    window.setTimeout(() => icon.classList.remove('is-rotating'), 720);
  };

  const showBoard = next => {
    if (!sync || !rail || !board) return;
    open = next;
    sync.setAttribute('aria-expanded', String(open));
    sync.setAttribute('aria-label', open ? '返回板块' : '打开主题');
    spin();
    window.clearTimeout(timer);
    if (open) {
      rail.classList.add('is-away');
      rail.setAttribute('aria-hidden', 'true');
      rail.inert = true;
      timer = window.setTimeout(() => {
        board.hidden = false;
        window.setTimeout(() => {
          board.classList.add('is-open');
          const active = board.querySelector('.topic-thumb.is-active');
          if (active) active.focus({ preventScroll: true });
        }, 20);
      }, SWAP_MS);
      return;
    }
    board.classList.remove('is-open');
    timer = window.setTimeout(() => {
      board.hidden = true;
      rail.classList.remove('is-away');
      rail.removeAttribute('aria-hidden');
      rail.inert = false;
      sync.focus({ preventScroll: true });
    }, SWAP_MS);
  };

  if (sync) sync.addEventListener('click', () => showBoard(!open));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      showBoard(false);
    }
  });

  const pick = name => {
    if (!shell) return;
    if (name === 'default') shell.removeAttribute('data-topic');
    else shell.setAttribute('data-topic', name);
    thumbs.forEach(thumb => {
      const on = thumb.dataset.topicPick === name;
      thumb.classList.toggle('is-active', on);
      thumb.setAttribute('aria-pressed', String(on));
    });
  };
  thumbs.forEach(thumb => thumb.addEventListener('click', () => pick(thumb.dataset.topicPick)));
})();
