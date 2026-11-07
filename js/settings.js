(() => {
  'use strict';
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createSettings = function ({ theme, resetWindows }) {
    const root = document.documentElement;
    const dialog = document.querySelector('#settings-dialog');
    const trigger = document.querySelector('#enter-settings');
    const navigation = document.querySelector('#landing-menu');
    const homeButton = navigation.querySelector('.menu-item');
    const dropdown = dialog.querySelector('.header-dropdown');
    const list = dialog.querySelector('.dropdown-menu');
    const checkbox = dialog.querySelector('.theme-switch__checkbox');
    const controller = new AbortController(), options = { signal: controller.signal };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const names = { glass: 'Glass', metal: 'Metal', plastic: 'Plastic' };
    const defaults = { opacity: 92, depth: 50, shine: 8, frost: 40 };
    const fields = [['opacity','透明度'],['depth','阴影'],['shine','光泽'],['frost','模糊']];
    const sliders = new Map();
    let material = 'glass', values = { ...defaults }, closing = null, destroyed = false, restoreOnClose = true;
    function selectSettings(selected) {
      for (const button of [homeButton, trigger]) {
        const active = button === (selected ? trigger : homeButton);
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      trigger.setAttribute('aria-expanded', String(selected));
    }
    function position() {
      if (!dialog.open) return;
      const anchor = trigger.getBoundingClientRect();
      const menuBox = navigation.getBoundingClientRect();
      const width = dialog.getBoundingClientRect().width;
      const fitsRight = anchor.right + 16 + width <= innerWidth - 16;
      dialog.style.maxHeight = `${Math.max(80, (fitsRight ? innerHeight : menuBox.top) - 32)}px`;
      const height = dialog.getBoundingClientRect().height;
      const left = fitsRight ? anchor.right + 16 : Math.max(16, Math.min(anchor.right - width, innerWidth - width - 16));
      const top = fitsRight ? Math.max(16, Math.min(menuBox.bottom - height, innerHeight - height - 16)) : Math.max(16, menuBox.top - height - 16);
      dialog.style.left = `${left}px`; dialog.style.top = `${top}px`;
    }
    try {
      const stored = JSON.parse(localStorage.getItem('shuike:appearance'));
      if (stored && Object.hasOwn(names, stored.material)) material = stored.material;
      for (const key of Object.keys(defaults)) if (typeof stored?.values?.[key] === 'number' && Number.isFinite(stored.values[key])) values[key] = Math.max(0, Math.min(100, stored.values[key]));
    } catch (_) { /* Storage is optional for local files. */ }
    function menu(open) { list.hidden = !open; dropdown.setAttribute('aria-expanded', String(open)); }
    function syncTheme() { checkbox.checked = theme.theme === 'dark'; }
    function apply(persist = true) {
      root.dataset.material = material;
      root.style.setProperty('--surface-alpha', String((100 - values.opacity) / 100));
      root.style.setProperty('--surface-depth', `${values.depth * .8}px`);
      root.style.setProperty('--surface-offset', `${values.depth * .24}px`);
      root.style.setProperty('--surface-shadow-alpha', String(values.depth * .005));
      root.style.setProperty('--surface-shine', String(values.shine / 100));
      root.style.setProperty('--surface-blur', `${values.frost * .4}px`);
      dropdown.querySelector('.title').textContent = names[material];
      dialog.querySelectorAll('[data-material]').forEach(button => {
        const selected = button.dataset.material === material;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
      });
      sliders.forEach((input, key) => {
        input.value = values[key];
        input.closest('.slider-row').querySelector('.slider-value').textContent = values[key];
        input.disabled = material !== 'glass' && (key === 'frost' || key === 'opacity');
        input.title = input.disabled ? '仅毛玻璃材质可调' : '';
      });
      if (persist) {
        try { localStorage.setItem('shuike:appearance', JSON.stringify({ material, values })); } catch (_) {}
        document.dispatchEvent(new CustomEvent('shuike:appearance-change', { detail: { material, values: { ...values } } }));
      }
    }
    function setMaterial(value) { if (!Object.hasOwn(names, value) || destroyed) return; material = value; apply(); }
    function resetDefaults() {
      if (destroyed) return;
      material = 'glass'; values = { ...defaults };
      theme.set('dark'); apply(); syncTheme(); menu(false);
      resetWindows?.();
      dialog.querySelector('.reset-status').textContent = '已恢复默认';
    }
    for (const [key, label] of fields) {
      const row = document.createElement('div'); row.className = 'slider-row';
      row.innerHTML = `<label for="appearance-${key}">${label}</label><div class="slider-content"><div class="slider-wrapper"><input id="appearance-${key}" class="custom-slider" type="range" min="0" max="100" step="1"></div><div class="slider-divider"></div><span class="slider-value"></span></div>`;
      const input = row.querySelector('input'); sliders.set(key, input);
      input.addEventListener('input', () => { values[key] = Number(input.value); apply(); }, options);
      dialog.querySelector('#appearance-controls').append(row);
    }
    function open() {
      if (destroyed || dialog.open || window.ShuikeIntro?.playing || root.dataset.view !== 'landing') return;
      menu(false); syncTheme(); dialog.inert = false; dialog.show(); position(); selectSettings(true);
    }
    function close({ restoreFocus = true } = {}) {
      if (!dialog.open) return Promise.resolve();
      restoreOnClose = restoreFocus;
      if (closing) return closing.done;
      menu(false); selectSettings(false); dialog.inert = true;
      const animation = dialog.animate([{opacity:1},{opacity:0}], {duration:motion.matches?0:180,easing:'ease',fill:'forwards'});
      const done = animation.finished.catch(() => {}).then(() => {
        if (destroyed) return;
        dialog.close(); animation.cancel(); closing = null; dialog.inert = false;
        if (restoreOnClose && root.dataset.view === 'landing') trigger.focus({preventScroll:true});
      });
      closing = { animation, done }; return done;
    }
    dropdown.addEventListener('click', () => menu(list.hidden), options);
    dialog.querySelectorAll('[data-material]').forEach(button => button.addEventListener('click', () => { setMaterial(button.dataset.material); menu(false); dropdown.focus(); }, options));
    dialog.addEventListener('click', event => { if (!event.target.closest('.header-dropdown-container')) menu(false); }, options);
    checkbox.addEventListener('change', () => { if (checkbox.checked !== (theme.theme === 'dark')) theme.toggle(); syncTheme(); }, options);
    document.addEventListener('shuike:theme-change', syncTheme, options);
    trigger.addEventListener('click', open, options);
    dialog.querySelector('.reset-defaults').addEventListener('click', resetDefaults, options);
    homeButton.addEventListener('click', () => close({ restoreFocus: false }), options);
    window.addEventListener('resize', position, options);
    dialog.querySelector('.close-btn').addEventListener('click', close, options);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      if (!list.hidden) { menu(false); dropdown.focus(); } else close();
    }, options);
    apply(false); syncTheme(); selectSettings(false);
    return Object.freeze({open,close,setMaterial,resetDefaults,get material(){return material;},get values(){return {...values};},destroy(){destroyed=true;controller.abort();closing?.animation.cancel();dialog.close();selectSettings(false);}});
  };
})();
