/*!
 * <shuike-mac-window> — a reusable Mac-style window.
 *
 * Drop-in usage:
 *   <script src="/js/mac-window.js" defer></script>
 *   <shuike-mac-window window-title="CONTACT.DOSSIER" meta="05 / EMPTY" reveal></shuike-mac-window>
 *
 * Attributes:
 *   window-title window title (default "WINDOW"); kept separate from the native
 *                `title` attribute so hovering the window never shows a browser tooltip
 *   meta         right-side status text (optional)
 *   width        CSS width (default: 100% inline, min(680px, 100vw - 32px) floating)
 *   body-height  CSS body height (default: clamp(320px, 44vw, 520px)); acts as
 *                min-height unless fixed-body is set
 *   reveal       scale in from small when scrolled into view; replays after leaving
 *   floating     position: fixed; useful for programmatically spawned windows
 *   no-drag      disable title-bar dragging
 *   zoomable     turn the green light into a real zoom button; emits mac-window:zoom
 *   zoomed       reflect the current zoom state in the green button's label / aria-pressed
 *   fixed-body   keep the body at body-height and scroll its slotted content
 *
 * Programmatic use:
 *   ShuikeMacWindow.create({
 *     title: 'DETAIL.WINDOW',
 *     meta: '06 / OPEN',
 *     floating: true,
 *     x: 120,
 *     y: 140,
 *     content: 'Any HTML node or plain text'
 *   });
 */
(() => {
  "use strict";

  if (customElements.get("shuike-mac-window")) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const EDGE = 120;

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host {
        --mw-bg: #0a0907;
        --mw-bar-top: rgb(255 255 255 / .055);
        --mw-bar-bottom: rgb(255 255 255 / .015);
        --mw-grid: rgb(238 233 222 / .025);
        --mw-glow: rgb(216 195 154 / .055);
        --mw-shadow: 0 30px 80px rgb(0 0 0 / .46), inset 0 1px 0 rgb(255 255 255 / .06);
        display: block;
        position: relative;
        z-index: 2;
        width: var(--mac-width, 100%);
        margin: var(--mac-margin, 0);
        color: var(--ink, #eee9de);
        font-family: var(--font-mono, "Cascadia Mono", "Cascadia Code", Consolas, monospace);
        transform-origin: 50% 58%;
        -webkit-tap-highlight-color: transparent;
      }

      :host([floating]) {
        position: fixed;
        left: var(--mac-left, 24px);
        top: var(--mac-top, 24px);
        z-index: 1000;
        margin: 0;
        width: var(--mac-width, min(680px, calc(100vw - 32px)));
      }

      :host([reveal]) {
        opacity: 0;
        transform: scale(.78);
        transition:
          opacity .55s ease,
          transform .95s cubic-bezier(.16, 1, .3, 1);
      }

      :host([reveal].is-expanded) {
        opacity: 1;
        transform: scale(1);
      }

      :host(.is-minimized) {
        opacity: 0;
        transform: scale(.72);
        visibility: hidden;
        pointer-events: none;
        transition:
          opacity .3s ease,
          transform .35s ease,
          visibility 0s linear .35s;
      }

      :host(.is-closing) {
        opacity: 0;
        transform: scale(.92);
        transition:
          opacity .28s ease,
          transform .3s ease;
      }

      :host([hidden]) {
        display: none !important;
      }

      :host(.is-dragging) {
        z-index: 1001;
      }

      :host(.is-moved) {
        z-index: 1000;
      }

      .frame {
        overflow: hidden;
        border: 1px solid var(--line-strong, rgb(238 233 222 / .3));
        border-radius: var(--mac-radius, 14px);
        background: var(--mw-bg);
        box-shadow: var(--mw-shadow);
        transform: translate3d(var(--mac-drag-x, 0), var(--mac-drag-y, 0), 0);
      }

      .frame.is-resetting {
        transition: transform .4s cubic-bezier(.16, 1, .3, 1);
      }

      .bar {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 14px;
        border-bottom: 1px solid var(--line, rgb(238 233 222 / .15));
        background: linear-gradient(180deg, var(--mw-bar-top), var(--mw-bar-bottom));
        font-size: 8px;
        line-height: 1;
        letter-spacing: .1em;
        text-transform: uppercase;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .bar:active {
        cursor: grabbing;
      }

      .bar:focus-visible {
        outline: 1px solid var(--signal, #d8c39a);
        outline-offset: -2px;
      }

      .bar.is-static {
        cursor: default;
        touch-action: auto;
      }

      .lights {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-right: 4px;
        flex: 0 0 auto;
      }

      .light {
        position: relative;
        display: block;
        width: 14px;
        height: 14px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        box-shadow: inset 0 0 0 1px rgb(0 0 0 / .18);
        font: 10px/1 var(--font-mono, Consolas, monospace);
        color: transparent;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
      }

      /* Keep the visual light macOS-sized but give it a larger hit area. */
      .light::after {
        content: "";
        position: absolute;
        inset: -4px;
        border-radius: 50%;
      }

      .light::before {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: rgb(50 0 0 / .58);
        opacity: 0;
        transition: opacity .15s ease;
        pointer-events: none;
      }

      .light--close { background: #ff5f57; }
      .light--close::before { content: "×"; }
      .light--minimize { background: #febc2e; }
      .light--minimize::before { content: "–"; }
      .light--zoom { background: #28c840; cursor: pointer; }
      .light--zoom::before { content: "+"; color: #073b0b; }
      .light--zoom:disabled { cursor: default; opacity: 1; }

      .lights:hover .light--close::before,
      .lights:hover .light--minimize::before,
      .lights:hover .light--zoom:not(:disabled)::before,
      .light:focus-visible::before {
        opacity: 1;
      }

      .light:hover { filter: brightness(1.1); }
      .light:focus-visible {
        outline: 1px solid var(--signal, #d8c39a);
        outline-offset: 2px;
      }

      .title {
        overflow: hidden;
        color: var(--muted, #91897c);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta {
        margin-left: auto;
        color: var(--muted-dark, #766f63);
        white-space: nowrap;
      }

      .meta[hidden] {
        display: none;
      }

      .body {
        min-height: var(--mac-body-height, clamp(320px, 44vw, 520px));
        padding: var(--mac-body-padding, 0);
        overflow: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--line-strong, rgb(238 233 222 / .3)) transparent;
        background:
          radial-gradient(ellipse at 50% 30%, var(--mw-glow), transparent 64%),
          repeating-linear-gradient(0deg, transparent 0 47px, var(--mw-grid) 47px 48px),
          repeating-linear-gradient(90deg, transparent 0 47px, var(--mw-grid) 47px 48px);
      }

      :host([fixed-body]) .body {
        height: var(--mac-body-height, clamp(320px, 44vw, 520px));
      }

      ::slotted(*) {
        position: relative;
        z-index: 1;
      }

      :host([data-theme="light"]) {
        --mw-bg: #f2ece1;
        --mw-bar-top: #f8f2e8;
        --mw-bar-bottom: #eae2d5;
        --mw-grid: rgb(24 21 15 / .045);
        --mw-glow: rgb(127 92 42 / .05);
        --mw-shadow: 0 30px 70px rgb(24 21 15 / .18), inset 0 1px 0 #fff;
      }

      :host([data-theme="light"]) .bar {
        border-bottom-color: rgb(24 21 15 / .14);
      }

      @media (prefers-reduced-motion: reduce) {
        :host([reveal]) {
          opacity: 1;
          transform: none;
          transition: none;
        }

        :host(.is-minimized),
        :host(.is-closing) {
          transition: none;
        }

        .frame.is-resetting {
          transition: none;
        }
      }
    </style>
    <div class="frame" part="frame">
      <div class="bar" part="bar" tabindex="0" role="group">
        <span class="lights">
          <button class="light light--close" type="button" data-window-action="close" aria-label="关闭窗口"></button>
          <button class="light light--minimize" type="button" data-window-action="minimize" aria-label="最小化窗口"></button>
          <button class="light light--zoom" type="button" data-window-action="zoom" aria-label="放大窗口" disabled></button>
        </span>
        <span class="title"></span>
        <span class="meta"></span>
      </div>
      <div class="body" part="body"><slot></slot></div>
    </div>
  `;

  class ShuikeMacWindow extends HTMLElement {
    static get observedAttributes() {
      return ["window-title", "meta", "width", "body-height", "reveal", "floating", "no-drag", "zoomable", "zoomed"];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.append(template.content.cloneNode(true));

      this._frame = root.querySelector(".frame");
      this._bar = root.querySelector(".bar");
      this._lights = root.querySelector(".lights");
      this._zoom = root.querySelector(".light--zoom");
      this._title = root.querySelector(".title");
      this._meta = root.querySelector(".meta");
      this._tx = 0;
      this._ty = 0;
      this._drag = null;
      this._io = null;
      this._themeObserver = null;
      this._resetTimer = 0;
      this._closeTimer = 0;
      this._minimized = false;
      this._closed = false;
      this._leftSinceMinimize = false;
      this._minimizeTracking = false;

      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onDoubleClick = this._onDoubleClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onThemeChange = this._onThemeChange.bind(this);
      this._onMotionChange = this._onMotionChange.bind(this);
      this._onLightsClick = this._onLightsClick.bind(this);
      this._onMinimizeScroll = this._onMinimizeScroll.bind(this);
    }

    connectedCallback() {
      if (!this.hasAttribute("role")) this.setAttribute("role", "group");
      this._bar.addEventListener("pointerdown", this._onPointerDown);
      this._bar.addEventListener("dblclick", this._onDoubleClick);
      this._bar.addEventListener("keydown", this._onKeyDown);
      this._lights.addEventListener("click", this._onLightsClick);
      document.addEventListener("shuike:theme-change", this._onThemeChange);
      motionQuery.addEventListener?.("change", this._onMotionChange);
      this._themeObserver = new MutationObserver(() => this._syncTheme());
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
      this._sync();
      this._syncTheme();
      this._setupReveal();
    }

    disconnectedCallback() {
      this._io?.disconnect();
      this._io = null;
      this._themeObserver?.disconnect();
      this._themeObserver = null;
      this._stopMinimizeTracking();
      clearTimeout(this._resetTimer);
      clearTimeout(this._closeTimer);
      document.removeEventListener("shuike:theme-change", this._onThemeChange);
      motionQuery.removeEventListener?.("change", this._onMotionChange);
      this._bar.removeEventListener("pointerdown", this._onPointerDown);
      this._bar.removeEventListener("dblclick", this._onDoubleClick);
      this._bar.removeEventListener("keydown", this._onKeyDown);
      this._lights.removeEventListener("click", this._onLightsClick);
      this._bar.removeEventListener("pointermove", this._onPointerMove);
      this._bar.removeEventListener("pointerup", this._onPointerUp);
      this._bar.removeEventListener("pointercancel", this._onPointerUp);
    }

    attributeChangedCallback(name) {
      if (!this.isConnected) return;
      this._sync();
      if (name === "reveal") this._setupReveal();
    }

    _sync() {
      const title = this.getAttribute("window-title") || "WINDOW";
      const meta = this.getAttribute("meta") || "";
      this._title.textContent = title;
      this._meta.textContent = meta;
      this._meta.hidden = !meta;

      const width = this.getAttribute("width") ||
        (this.hasAttribute("floating") ? "min(680px, calc(100vw - 32px))" : "100%");
      const height = this.getAttribute("body-height") || "clamp(320px, 44vw, 520px)";
      this.style.setProperty("--mac-width", width);
      this.style.setProperty("--mac-body-height", height);

      if (!this.hasAttribute("aria-label")) {
        this.setAttribute("aria-label", `${title} 窗口，拖动标题栏可移动`);
      }
      this._bar.setAttribute("aria-label", `${title} 窗口标题栏，拖动移动，方向键微调，双击复位`);
      this._bar.classList.toggle("is-static", this.hasAttribute("no-drag"));

      const zoomable = this.hasAttribute("zoomable");
      const zoomed = this.hasAttribute("zoomed");
      this._zoom.disabled = !zoomable;
      this._zoom.tabIndex = zoomable ? 0 : -1;
      this._zoom.setAttribute("aria-hidden", String(!zoomable));
      this._zoom.setAttribute("aria-pressed", String(zoomed));
      this._zoom.setAttribute("aria-label", zoomed ? "还原窗口大小" : "放大窗口");
    }

    _syncTheme() {
      const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      if (this.getAttribute("data-theme") !== theme) this.setAttribute("data-theme", theme);
    }

    _onThemeChange() {
      this._syncTheme();
    }

    _onMotionChange() {
      this._setupReveal();
    }

    _setupReveal() {
      this._io?.disconnect();
      this._io = null;
      if (this._closed || this._minimized) return;
      if (!this.hasAttribute("reveal") || motionQuery.matches || !("IntersectionObserver" in window)) {
        this.classList.add("is-expanded");
        return;
      }

      this.classList.remove("is-expanded");
      this._io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (this._closed || this._minimized) return;
          // A dragged window is no longer tied to its original layout slot;
          // keep it open while it is being handled.
          const keepOpen = entry.isIntersecting || this.classList.contains("is-moved");
          this.classList.toggle("is-expanded", keepOpen);
        });
      }, {
        threshold: 0.22,
        rootMargin: "0px 0px -8% 0px"
      });
      this._io.observe(this);
    }

    _onLightsClick(event) {
      const action = event.target.closest("[data-window-action]")?.dataset.windowAction;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "close") this.close();
      else if (action === "minimize") this.minimize();
      else if (action === "zoom" && this.hasAttribute("zoomable")) {
        this.dispatchEvent(new CustomEvent("mac-window:zoom", { bubbles: true, composed: true }));
      }
    }

    _frameOutOfView() {
      const rect = this._frame.getBoundingClientRect();
      return rect.bottom <= 0 || rect.top >= window.innerHeight;
    }

    _startMinimizeTracking() {
      if (this._minimizeTracking) return;
      this._minimizeTracking = true;
      window.addEventListener("scroll", this._onMinimizeScroll, { passive: true });
      window.addEventListener("resize", this._onMinimizeScroll, { passive: true });
    }

    _stopMinimizeTracking() {
      if (!this._minimizeTracking) return;
      this._minimizeTracking = false;
      window.removeEventListener("scroll", this._onMinimizeScroll);
      window.removeEventListener("resize", this._onMinimizeScroll);
    }

    _onMinimizeScroll() {
      if (!this._minimized || this._closed) return;
      const rect = this._frame.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= viewport) {
        this._leftSinceMinimize = true;
        return;
      }
      if (!this._leftSinceMinimize) return;
      const visible = Math.max(0, Math.min(rect.bottom, viewport) - Math.max(rect.top, 0));
      const ratio = visible / Math.max(1, Math.min(rect.height, viewport));
      if (ratio >= 0.22) this.restore();
    }

    minimize() {
      if (this._closed || this._minimized) return;
      this._minimized = true;
      this._leftSinceMinimize = this._frameOutOfView();
      this.classList.remove("is-expanded");
      this.classList.add("is-minimized");
      this.setAttribute("aria-hidden", "true");
      this.setAttribute("inert", "");
      this._startMinimizeTracking();
      this.dispatchEvent(new CustomEvent("mac-window:minimize", { bubbles: true, composed: true }));
    }

    restore() {
      if (this._closed || !this._minimized) return;
      this._minimized = false;
      this._leftSinceMinimize = false;
      this._stopMinimizeTracking();
      this.classList.remove("is-minimized");
      this.removeAttribute("aria-hidden");
      this.removeAttribute("inert");
      this.classList.remove("is-expanded");
      void this.offsetWidth;
      this.classList.add("is-expanded");
      this.dispatchEvent(new CustomEvent("mac-window:restore", { bubbles: true, composed: true }));
    }

    close() {
      if (this._closed) return;
      this._closed = true;
      this._minimized = false;
      this._leftSinceMinimize = false;
      this._stopMinimizeTracking();
      this._io?.disconnect();
      this._io = null;
      this.classList.remove("is-expanded", "is-minimized");
      this.setAttribute("aria-hidden", "true");
      this.setAttribute("inert", "");
      this.classList.add("is-closing");
      this.dispatchEvent(new CustomEvent("mac-window:close", { bubbles: true, composed: true }));
      const finish = () => {
        this.hidden = true;
        this.classList.remove("is-closing");
      };
      clearTimeout(this._closeTimer);
      if (motionQuery.matches) finish();
      else this._closeTimer = window.setTimeout(finish, 320);
    }

    _limits(baseLeft, baseTop, width, height, scale) {
      return {
        minX: (EDGE - baseLeft - width) / scale,
        maxX: (window.innerWidth - EDGE - baseLeft) / scale,
        minY: (60 - baseTop) / scale,
        maxY: (window.innerHeight - 80 - baseTop) / scale
      };
    }

    _setDrag(x, y) {
      this._tx = x;
      this._ty = y;
      this.classList.toggle("is-moved", x !== 0 || y !== 0);
      this._frame.style.setProperty("--mac-drag-x", `${x}px`);
      this._frame.style.setProperty("--mac-drag-y", `${y}px`);
    }

    _onPointerDown(event) {
      if (event.button !== 0 || this.hasAttribute("no-drag")) return;
      if (event.target.closest("a, button, input, textarea, select, [data-no-drag]")) return;
      event.preventDefault();

      const rect = this._frame.getBoundingClientRect();
      let scale = 1;
      const matrix = getComputedStyle(this).transform;
      if (matrix && matrix !== "none") {
        try {
          scale = new DOMMatrixReadOnly(matrix).a || 1;
        } catch (_) { /* keep 1 */ }
      }

      this._drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTx: this._tx,
        startTy: this._ty,
        scale,
        baseLeft: rect.left - this._tx * scale,
        baseTop: rect.top - this._ty * scale,
        width: rect.width,
        height: rect.height
      };
      this.classList.add("is-dragging");
      try { this._bar.setPointerCapture?.(event.pointerId); } catch (_) { /* optional */ }
      this._bar.focus({ preventScroll: true });
      this._bar.addEventListener("pointermove", this._onPointerMove);
      this._bar.addEventListener("pointerup", this._onPointerUp);
      this._bar.addEventListener("pointercancel", this._onPointerUp);
    }

    _onPointerMove(event) {
      const drag = this._drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const scale = drag.scale || 1;
      const limits = this._limits(drag.baseLeft, drag.baseTop, drag.width, drag.height, scale);
      const nextX = drag.startTx + (event.clientX - drag.startX) / scale;
      const nextY = drag.startTy + (event.clientY - drag.startY) / scale;
      this._setDrag(
        clamp(nextX, limits.minX, limits.maxX),
        clamp(nextY, limits.minY, limits.maxY)
      );
    }

    _onPointerUp(event) {
      const drag = this._drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      this._drag = null;
      this.classList.remove("is-dragging");
      try { this._bar.releasePointerCapture?.(event.pointerId); } catch (_) { /* optional */ }
      this._bar.removeEventListener("pointermove", this._onPointerMove);
      this._bar.removeEventListener("pointerup", this._onPointerUp);
      this._bar.removeEventListener("pointercancel", this._onPointerUp);
    }

    resetPosition({ animate = true } = {}) {
      if (!animate || motionQuery.matches) {
        this._setDrag(0, 0);
        return;
      }
      this._frame.classList.add("is-resetting");
      window.requestAnimationFrame(() => this._setDrag(0, 0));
      clearTimeout(this._resetTimer);
      this._resetTimer = window.setTimeout(() => this._frame.classList.remove("is-resetting"), 500);
    }

    _onDoubleClick(event) {
      if (this.hasAttribute("no-drag")) return;
      if (event.target.closest("a, button, input, textarea, select, [data-no-drag]")) return;
      this.resetPosition();
    }

    _onKeyDown(event) {
      if (this.hasAttribute("no-drag")) return;
      const step = event.shiftKey ? 40 : 12;
      let dx = 0;
      let dy = 0;
      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else if (event.key === "Home") {
        event.preventDefault();
        this.resetPosition();
        return;
      } else return;

      event.preventDefault();
      const rect = this._frame.getBoundingClientRect();
      const matrix = getComputedStyle(this).transform;
      let scale = 1;
      if (matrix && matrix !== "none") {
        try {
          scale = new DOMMatrixReadOnly(matrix).a || 1;
        } catch (_) { /* keep 1 */ }
      }
      const baseLeft = rect.left - this._tx * scale;
      const baseTop = rect.top - this._ty * scale;
      const limits = this._limits(baseLeft, baseTop, rect.width, rect.height, scale);
      this._setDrag(
        clamp(this._tx + dx / scale, limits.minX, limits.maxX),
        clamp(this._ty + dy / scale, limits.minY, limits.maxY)
      );
    }
  }

  customElements.define("shuike-mac-window", ShuikeMacWindow);

  window.ShuikeMacWindow = {
    create(options = {}) {
      const element = document.createElement("shuike-mac-window");
      if (options.title) element.setAttribute("window-title", options.title);
      if (options.meta) element.setAttribute("meta", options.meta);
      if (options.width) element.setAttribute("width", options.width);
      if (options.bodyHeight) element.setAttribute("body-height", options.bodyHeight);
      if (options.label) element.setAttribute("aria-label", options.label);
      if (options.reveal !== false) element.setAttribute("reveal", "");
      if (options.draggable === false) element.setAttribute("no-drag", "");
      if (options.zoomable) element.setAttribute("zoomable", "");
      if (options.zoomed) element.setAttribute("zoomed", "");
      if (options.fixedBody) element.setAttribute("fixed-body", "");
      if (options.className) element.className = options.className;
      if (options.floating) {
        element.setAttribute("floating", "");
        if (Number.isFinite(options.x)) element.style.setProperty("--mac-left", `${options.x}px`);
        if (Number.isFinite(options.y)) element.style.setProperty("--mac-top", `${options.y}px`);
      }
      (options.parent || document.body).append(element);

      if (options.content != null) {
        if (typeof options.content === "string") {
          const paragraph = document.createElement("p");
          paragraph.textContent = options.content;
          element.append(paragraph);
        } else if (options.content instanceof Node) {
          element.append(options.content);
        }
      }
      return element;
    }
  };
})();
