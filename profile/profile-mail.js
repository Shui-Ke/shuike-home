/* Envelope shortcut on profile/index: open the shared PERSONAL CARD dossier in
   the same floating Mac window used by the Files Contact folder. */
(() => {
  'use strict';

  const trigger = document.querySelector('[data-mail-toggle]');
  if (!trigger) return;
  const status = document.querySelector('[data-mail-status]');

  const announce = message => {
    if (status) status.textContent = message;
  };

  const sync = open => {
    trigger.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? '关闭个人名片' : '打开个人名片');
  };

  sync(false);

  const isContactWindow = event => {
    const target = event.target;
    return target instanceof HTMLElement && target.dataset.contactWindow === 'true';
  };

  trigger.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const api = window.ShuikeContactWindow;
    if (!api) return;
    event.preventDefault();
    if (api.isOpen) {
      api.close();
      return;
    }
    if (!api.open({ anchor: trigger, onStatus: announce })) {
      announce('个人名片暂时不可用');
      if (!window.ShuikePageTransition?.navigate(trigger.href)) location.assign(trigger.href);
      return;
    }
    sync(true);
  });

  document.addEventListener('mac-window:close', event => {
    if (isContactWindow(event)) sync(false);
  });
  document.addEventListener('mac-window:minimize', event => {
    if (isContactWindow(event)) sync(false);
  });
  document.addEventListener('mac-window:restore', event => {
    if (isContactWindow(event)) sync(true);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !window.ShuikeContactWindow?.isOpen) return;
    const node = window.ShuikeContactWindow.element;
    const active = document.activeElement;
    const inside = node && (active === node || node.contains(active) || Boolean(node.shadowRoot?.activeElement));
    if (!inside) return;
    event.preventDefault();
    window.ShuikeContactWindow.close();
  });
})();
