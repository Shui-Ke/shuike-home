/* Shared arc control; Profile supplies the OC trigger and action handlers. */
(() => {
  'use strict';
  let instance = 0;
  class OCRadialMenu extends HTMLElement {
    static get observedAttributes() { return ['open', 'flip', 'data-variant']; }
    get open() { return this.hasAttribute('open'); }
    set open(value) { this.toggleAttribute('open', Boolean(value)); }
    get flip() { return this.hasAttribute('flip'); }
    set flip(value) { this.toggleAttribute('flip', Boolean(value)); }
    show() { this.open = true; }
    hide() { this.open = false; }
    toggle() { this.open = !this.open; }
    attributeChangedCallback(name) {
      if (!this._ready) return;
      // Flipping the side or swapping the variant only redraws the current sweep;
      // neither may replay the intro.
      if (name === 'flip' || name === 'data-variant') this._draw(this._progress || 0);
      else this._animate();
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._frame);
      window.clearInterval(this._hudTimer);
      window.clearInterval(this._glitchTimer);
    }
    connectedCallback() {
      if (this._ready) { this._animate(); return; }
      this.dataset.ready = 'true';
      this.classList.add('oc-arc');
      this.setAttribute('role', 'group');
      this.setAttribute('aria-label', 'OC 互动选项');
      const clipId = `oc-arc-clip-${++instance}`;
      const actionsId = `oc-arc-actions-${instance}`;
      // Sweep down the upper-left quadrant: -99° to -171°, radii 250/170.
      const outline = this._sector(0);
      this.innerHTML = `
        <svg class="oc-arc__shape" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
          <defs><clipPath id="${clipId}" clipPathUnits="objectBoundingBox">
            <path transform="scale(.003333333333 .003333333333)" d="${outline}"/>
          </clipPath></defs>
        </svg>
        <button class="oc-arc__glass" type="button" aria-label="收起扇形菜单" aria-controls="${actionsId}" aria-expanded="true"></button>
        <svg class="oc-arc__edge" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
          <path class="oc-arc__outline" d="${outline}"/>
          <path class="oc-arc__shine"/>
          <path class="oc-arc__inner"/>
        </svg>
        <button class="oc-arc__line-trigger" type="button" aria-label="展开扇形菜单" aria-expanded="false" aria-controls="${actionsId}"></button>
        <div class="oc-arc__actions" id="${actionsId}">
        <button class="oc-arc__button oc-arc__button--touch" type="button" data-action="touch" aria-label="点击互动">
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M11 17V8a2 2 0 0 1 4 0v8-3a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v5c0 4-2.7 7-6.5 7h-3c-2.3 0-3.9-1-5.4-3L6 18.8a2.1 2.1 0 0 1 3.2-2.7L11 18"/>
            <path class="oc-arc__click-rays" d="M13 1v2M5.5 4l1.8 1.8M3 10h2M20.5 4l-1.8 1.8"/>
          </svg>
        </button>
        <button class="oc-arc__button oc-arc__button--talk" type="button" data-action="talk" aria-label="对话" aria-pressed="false">
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M5 5h22v17H15l-7 6v-6H5Z"/>
            <path class="oc-arc__dialogue-lines" d="M10 11h12M10 16h8"/>
          </svg>
        </button>
        <button class="oc-arc__button oc-arc__button--heart" type="button" data-action="affection" aria-label="爱心" aria-pressed="false">
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path class="oc-arc__heart" d="M16 27S4 19.3 4 11.5A6.5 6.5 0 0 1 16 8a6.5 6.5 0 0 1 12 3.5C28 19.3 16 27 16 27Z"/>
          </svg>
        </button></div>
        <span class="oc-arc__glitch" aria-hidden="true"></span>
        <span class="oc-arc__hud" aria-hidden="true">
          <span class="oc-arc__hud-time" data-hud="time"></span>
          <span class="oc-arc__hud-line"></span>
          <span class="oc-arc__hud-date" data-hud="date"></span>
        </span>`;
      this._glassClip = `url(#${clipId})`;
      // Seven-segment readout: current time above the leader line, date below.
      this._hud = {
        time: this.querySelector('[data-hud="time"]'),
        date: this.querySelector('[data-hud="date"]')
      };
      this._hudClock = '';
      this._renderHud();
      this._hudTimer = window.setInterval(() => this._renderHud(), 1000);
      this.querySelector('.oc-arc__glass').addEventListener('click', () => {
        if (!this.hasAttribute('external-trigger')) this.hide();
      });
      this.querySelector('.oc-arc__line-trigger').addEventListener('click', () => this.show());
      this.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.open && !this.hasAttribute('external-trigger')) { event.preventDefault(); this.hide(); }
      });
      this.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button || !this.contains(button)) return;
        // Touch is a momentary action: retain only the normal press/hover feedback.
        if (button.dataset.action !== 'touch') {
          const selected = button.getAttribute('aria-pressed') !== 'true';
          this.querySelectorAll('[aria-pressed]').forEach(item => {
            item.setAttribute('aria-pressed', String(item === button && selected));
          });
          this.dispatchEvent(new CustomEvent('oc-menu-select', {
            bubbles: true,
            detail: { action: selected ? button.dataset.action : null }
          }));
        }
        this.dispatchEvent(new CustomEvent('oc-menu-activate', {
          bubbles: true, detail: { action: button.dataset.action }
        }));
      });
      this._ready = true;
      this._progress = 0;
      this._draw(0);
      this._animate();
    }
    _segments(text) {
      const map = {
        0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
        5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
      };
      return Array.from(text).map(char => {
        if (char === ':' || char === '.') return `<i class="oc-arc__hud-sep">${char}</i>`;
        const on = map[char] || '';
        const cells = Array.from('abcdefg').map(seg =>
          `<b class="oc-arc__hud-seg oc-arc__hud-seg--${seg}${on.includes(seg) ? ' is-on' : ''}"></b>`
        ).join('');
        return `<i class="oc-arc__hud-digit">${cells}</i>`;
      }).join('');
    }
    _renderHud() {
      if (!this._hud || !this._hud.time) return;
      const now = new Date();
      const pad = value => String(value).padStart(2, '0');
      const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (clock === this._hudClock) return;
      this._hudClock = clock;
      this._hud.time.innerHTML = this._segments(clock);
      this._hud.date.innerHTML = this._segments(`${pad(now.getMonth() + 1)}.${pad(now.getDate())}`);
    }
    _glitch(active) {
      const node = this.querySelector('.oc-arc__glitch');
      window.clearInterval(this._glitchTimer);
      this.classList.remove('is-glitching');
      if (!node) return;
      if (!active) {
        node.textContent = '';
        node.classList.remove('is-live');
        return;
      }
      const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01#%&*+=/\\';
      let ticks = 0;
      node.classList.add('is-live');
      this.classList.add('is-glitching');
      this._glitchTimer = window.setInterval(() => {
        node.textContent = Array.from({ length: 6 }, () => glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
        ticks += 1;
        if (ticks > 7) {
          window.clearInterval(this._glitchTimer);
          node.textContent = '';
          node.classList.remove('is-live');
          this.classList.remove('is-glitching');
        }
      }, 55);
    }
    _point(radius, angle) {
      const rad = angle * Math.PI / 180;
      // `flip` reflects the whole fan about the box's vertical centre (x = 150), so the
      // same sweep opens toward the right when the menu sits right of the character.
      const x = 270 + radius * Math.cos(rad);
      return `${(this.hasAttribute('flip') ? 300 - x : x).toFixed(3)} ${(270 + radius * Math.sin(rad)).toFixed(3)}`;
    }
    _arc(radius, progress, trim = 0) {
      const angle = trim / radius * 180 / Math.PI;
      const sweep = this.hasAttribute('flip') ? 1 : 0;
      return `M${this._point(radius, -99 - angle)} A${radius} ${radius} 0 0 ${sweep} ${this._point(radius, -99 - 72 * progress + angle)}`;
    }
    _corner(progress) {
      // Reduce the corner radius during the opening sweep to avoid self-intersection.
      return Math.min(16, 170 * (72 * progress * Math.PI / 180) / 3);
    }
    _sector(progress) {
      const corner = this._corner(progress);
      const outerAngle = corner / 250 * 180 / Math.PI;
      const innerAngle = corner / 170 * 180 / Math.PI;
      const end = -99 - 72 * progress;
      const innerSweep = this.hasAttribute('flip') ? 0 : 1;
      return `${this._arc(250, progress, corner)}
        Q${this._point(250, end)} ${this._point(250 - corner, end)}
        L${this._point(170 + corner, end)}
        Q${this._point(170, end)} ${this._point(170, end + innerAngle)}
        A170 170 0 0 ${innerSweep} ${this._point(170, -99 - innerAngle)}
        Q${this._point(170, -99)} ${this._point(170 + corner, -99)}
        L${this._point(250 - corner, -99)}
        Q${this._point(250, -99)} ${this._point(250, -99 - outerAngle)} Z`;
    }
    _draw(progress) {
      this._progress = progress;
      this.style.setProperty('--arc-panel', progress.toFixed(3));
      const glassNode = this.querySelector('.oc-arc__glass');
      if (glassNode && this._glassClip) {
        glassNode.style.clipPath = this.getAttribute('data-variant') === 'line' ? 'none' : this._glassClip;
      }
      const path = this._sector(progress);
      this.querySelector('clipPath path').setAttribute('d', path);
      this.querySelector('.oc-arc__outline').setAttribute('d', path);
      this.querySelector('.oc-arc__shine').setAttribute('d', this._arc(247, progress, this._corner(progress)));
      this.querySelector('.oc-arc__inner').setAttribute('d', this._arc(173, progress, this._corner(progress)));
      this.querySelectorAll('[data-action]').forEach((button, index) => {
        const reveal = Math.min(1, Math.max(0, (progress - ((2 - index) * .24 + .18)) / .25));
        button.style.setProperty('--reveal', reveal);
        button.style.setProperty('--reveal-offset', `${(1 - reveal) * 8}px`);
      });
    }
    _animate() {
      cancelAnimationFrame(this._frame);
      const target = this.open ? 1 : 0;
      const start = this._progress;
      const line = this.querySelector('.oc-arc__line-trigger');
      const glass = this.querySelector('.oc-arc__glass');
      const actions = this.querySelector('.oc-arc__actions');
      const external = this.hasAttribute('external-trigger');
      const trigger = external ? document.getElementById(this.getAttribute('external-trigger')) : line;
      const hadFocus = this.contains(document.activeElement);
      // Leader line + clock readout: replay the whole "extend, blink twice, appear"
      // sequence each time the menu opens.
      this._glitch(Boolean(target));
      const hud = this.querySelector('.oc-arc__hud');
      if (hud) {
        if (target) {
          this._renderHud();
          hud.classList.remove('is-live');
          void hud.offsetWidth;
          hud.classList.add('is-live');
        } else {
          hud.classList.remove('is-live');
        }
      }
      this.classList.toggle('is-closing', !target);
      if (target) {
        this.removeAttribute('data-collapsed');
        this.removeAttribute('aria-hidden');
      }
      line.hidden = external || Boolean(target);
      line.setAttribute('aria-expanded', String(Boolean(target)));
      glass.setAttribute('aria-expanded', String(Boolean(target)));
      glass.disabled = external || !target;
      glass.setAttribute('aria-hidden', String(external));
      actions.inert = true;
      if (!target && hadFocus && trigger) trigger.focus({ preventScroll:true });
      this.dispatchEvent(new CustomEvent('oc-menu-toggle', { bubbles:true, detail:{open:Boolean(target)} }));
      const complete = () => {
        this._draw(target);
        this.classList.remove('is-closing');
        actions.inert = !target;
        if (!target && external) {
          this.setAttribute('data-collapsed', '');
          this.setAttribute('aria-hidden', 'true');
        }
        if (target && hadFocus) this.querySelector('[data-action]').focus({ preventScroll:true });
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || start === target) { complete(); return; }
      const duration = 650 * Math.abs(target - start);
      const began = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - began) / duration);
        this._draw(start + (target - start) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) this._frame = requestAnimationFrame(frame);
        else complete();
      };
      this._frame = requestAnimationFrame(frame);
    }
  }
  if (!customElements.get('oc-radial-menu')) customElements.define('oc-radial-menu', OCRadialMenu);
})();
