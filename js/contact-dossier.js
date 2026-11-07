// <shuike-contact-dossier> — the CONTACT.DOSSIER profile card.
// Used inside the floating Mac window (Files / hero) and the inline window on the
// Personal Dossier page. Light DOM on purpose: css/contact-window.css and each page
// can style it. Copy feedback is a CSS bubble; no native title tooltips.
(() => {
  'use strict';

  if (customElements.get('shuike-contact-dossier')) return;

  const STAR_CACHE_KEY = 'shuike:github-stars:v1';
  const STAR_CACHE_TTL = 10 * 60 * 1000;
  const STAR_FALLBACK = 2;
  const REPOS_URL = 'https://api.github.com/users/Shui-Ke/repos?per_page=100&type=owner';
  const SCRIPT_URL = document.currentScript?.src || '';
  const AVATAR_URL = SCRIPT_URL
    ? new URL('../assets/contact-avatar.jpg', SCRIPT_URL).href
    : 'assets/contact-avatar.jpg';

  function copyText(value) {
    if (!value) return Promise.resolve(false);
    const fallback = () => {
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none';
        document.body.append(area);
        area.select();
        area.setSelectionRange(0, value.length);
        const copied = document.execCommand('copy');
        area.remove();
        return copied;
      } catch (_) { return false; }
    };
    try {
      if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(value).then(() => true).catch(fallback);
      }
    } catch (_) { /* Fall through to the legacy path. */ }
    return Promise.resolve(fallback());
  }

  function readStarsCache() {
    try {
      const raw = sessionStorage.getItem(STAR_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Number.isFinite(data.value) || !Number.isFinite(data.ts)) return null;
      if (Date.now() - data.ts > STAR_CACHE_TTL) return null;
      return data.value;
    } catch (_) { return null; }
  }

  function writeStarsCache(value) {
    try { sessionStorage.setItem(STAR_CACHE_KEY, JSON.stringify({ value, ts: Date.now() })); } catch (_) {}
  }

  class ShuikeContactDossier extends HTMLElement {
    constructor() {
      super();
      this._controller = null;
      this._feedbackButton = null;
      this._feedbackTimer = 0;
      this._feedbackClearTimer = 0;
      this._onClick = this._onClick.bind(this);
    }

    connectedCallback() {
      this._controller?.abort();
      this._controller = new AbortController();
      this.classList.add('contact-dossier');
      this.lang = 'en';
      this._render();
      this.addEventListener('click', this._onClick, { signal: this._controller.signal });
      this._loadStars(this._controller.signal);
    }

    disconnectedCallback() {
      this._controller?.abort();
      this._controller = null;
      this._clearFeedback();
    }
    _render() {
      this.innerHTML = `
        <header class="contact-dossier__head">
          <figure class="contact-dossier__avatar">
            <img src="${AVATAR_URL}" alt="SHUIKE avatar" width="1179" height="1179" draggable="false" decoding="async">
          </figure>
          <div class="contact-dossier__identity">
            <p class="contact-dossier__eyebrow"><i aria-hidden="true"></i>OPEN CHANNEL <span>/ 05</span></p>
            <h2 class="contact-dossier__name">SHUIKE</h2>
            <p class="contact-dossier__date">2007.5.27</p>
          </div>
          <div class="contact-dossier__copy">
            <p>I am a Computer Science and Technology student in the Class of 2025, currently studying. I speak Chinese, English, German, and Japanese.</p>
            <p>I can do front-end and back-end development and work with Python, C++, and Java. I am currently learning data structures and algorithms, and computer architecture. I am proficient in Vibe Coding and front-end design, with some project experience.</p>
          </div>
        </header>
        <footer class="contact-dossier__foot">
          <div class="contact-dossier__stars" data-github-stars-box aria-label="GitHub stars: ${STAR_FALLBACK}">
            <svg class="contact-dossier__star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z" fill="currentColor"/></svg>
            <span class="contact-dossier__stars-copy"><strong data-github-stars>${STAR_FALLBACK}</strong><small>GITHUB STARS</small></span>
          </div>
          <div class="contact-dossier__actions">
            <button class="contact-dossier__action" type="button" data-copy="github.com/Shui-Ke" aria-label="Copy GitHub address: github.com/Shui-Ke">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.73.5.99 5.24.99 11.5c0 4.86 3.15 8.98 7.52 10.43.55.1.75-.24.75-.53v-2.1c-3.06.67-3.71-1.3-3.71-1.3-.5-1.28-1.22-1.62-1.22-1.62-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.48-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.91 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.51.22 2.63.11 2.91.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.4.34.75 1.01.75 2.04v3.02c0 .29.2.64.76.53a10.52 10.52 0 0 0 7.51-10.42C23.01 5.24 18.27.5 12 .5z" fill="currentColor"/></svg>
              <span>GITHUB</span>
            </button>
            <button class="contact-dossier__action" type="button" data-copy="3082331906@qq.com" aria-label="Copy QQ email: 3082331906@qq.com">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
              <span>QQ MAIL</span>
            </button>
          </div>
        </footer>
        <p class="contact-dossier__sr sr-only" data-contact-live role="status" aria-live="polite"></p>
      `;
    }

    _onClick(event) {
      const button = event.target.closest?.('[data-copy]');
      if (!button || !this.contains(button)) return;
      event.preventDefault();
      this._copy(button);
    }

    _clearFeedback() {
      clearTimeout(this._feedbackTimer);
      clearTimeout(this._feedbackClearTimer);
      this._feedbackTimer = 0;
      this._feedbackClearTimer = 0;
      if (this._feedbackButton) {
        delete this._feedbackButton.dataset.feedback;
        delete this._feedbackButton.dataset.feedbackVisible;
        delete this._feedbackButton.dataset.copied;
        this._feedbackButton = null;
      }
    }

    _hideFeedback() {
      const button = this._feedbackButton;
      if (!button) return;
      // Keep the text while the pill fades, otherwise ::after collapses to zero width
      // and the label disappears before the opacity transition finishes.
      delete button.dataset.feedbackVisible;
      delete button.dataset.copied;
      this._feedbackClearTimer = window.setTimeout(() => {
        if (this._feedbackButton === button) {
          delete button.dataset.feedback;
          this._feedbackButton = null;
        }
        this._feedbackClearTimer = 0;
      }, 260);
    }

    _showFeedback(button, copied) {
      this._clearFeedback();
      this._feedbackButton = button;
      button.dataset.feedback = copied ? 'Copied' : 'Copy failed';
      button.dataset.feedbackVisible = 'true';
      if (copied) button.dataset.copied = 'true';
      this._feedbackTimer = window.setTimeout(() => this._hideFeedback(), copied ? 1800 : 2600);
    }

    async _copy(button) {
      const value = button.dataset.copy || '';
      const copied = await copyText(value);
      if (!this.isConnected) return;
      this._showFeedback(button, copied);
      button.focus({ preventScroll: true });
      const live = this.querySelector('[data-contact-live]');
      if (live) live.textContent = copied ? 'Copied to clipboard' : 'Copy failed. Please copy manually.';
    }

    _setStars(value) {
      const total = Math.max(0, Math.round(Number(value) || 0));
      const number = this.querySelector('[data-github-stars]');
      if (number) number.textContent = String(total);
      const box = this.querySelector('[data-github-stars-box]');
      if (box) box.setAttribute('aria-label', `GitHub stars: ${total}`);
    }

    _loadStars(signal) {
      const cached = readStarsCache();
      if (cached != null) {
        this._setStars(cached);
        return;
      }
      this._setStars(STAR_FALLBACK);
      fetch(REPOS_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal
      })
        .then(response => response.ok ? response.json() : null)
        .then(repos => {
          if (!Array.isArray(repos) || signal.aborted || !this.isConnected) return;
          const total = repos.reduce((sum, repo) => sum + (Number(repo?.stargazers_count) || 0), 0);
          this._setStars(total);
          writeStarsCache(total);
        })
        .catch(() => { /* Offline / rate-limit keeps the known fallback. */ });
    }
  }

  customElements.define('shuike-contact-dossier', ShuikeContactDossier);
  window.ShuikeContactDossier = Object.freeze({ tag: 'shuike-contact-dossier' });
})();
