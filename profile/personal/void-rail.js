/* 00 — LEFT SIDE UI
   Builds the vertical chapter strip and moves the big-title annotation to the
   actual display title's vertical position. The annotation only exists while
   its title is in view; the index keeps the current chapter marked. The ticker
   sits above this UI (z-index 90) so it is never covered. */
(() => {
  'use strict';

  const rail = document.querySelector('[data-void-rail]');
  const index = document.querySelector('[data-void-index]');
  if (!rail && !index) return;

  const body = rail?.querySelector('[data-rail-body]');
  const chapterEl = rail?.querySelector('[data-rail-chapter]');
  const nameEl = rail?.querySelector('[data-rail-name]');
  const titleEl = rail?.querySelector('[data-rail-title]');

  const sections = [...document.querySelectorAll('[data-section]')];
  const span = (zh, en) => `<span class="lang-zh">${zh}</span><span class="lang-en" lang="en">${en}</span>`;

  // The page titles wrap their copy in .line-sweep__inner, which is revealed by
  // the section observer. The annotation is not in that list, so take the inner
  // copy out of the wrapper and show it directly.
  const titleHTML = title => {
    if (!title) return span('个人名片', 'PERSONAL CARD');
    const holder = document.createElement('div');
    holder.innerHTML = title.innerHTML;
    const sweep = holder.querySelector('.line-sweep__inner');
    return sweep ? sweep.innerHTML : holder.innerHTML;
  };

  /* ---------- chapter strip ---------- */
  const indexButtons = new Map();
  const list = index?.querySelector('[data-index-list]');
  if (list) {
    sections.forEach(section => {
      const chapter = section.dataset.chapter || '';
      if (!chapter) return;
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'void-index__item';
      button.textContent = chapter;
      button.setAttribute('aria-label', `${chapter} ${section.dataset.nameZh || ''} / ${section.dataset.nameEn || ''}`);
      button.addEventListener('click', () => {
        const top = section.getBoundingClientRect().top + window.scrollY - 18;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
      item.append(button);
      list.append(item);
      indexButtons.set(chapter, button);
    });
  }

  const activeSection = () => {
    let active = sections[0] || null;
    const probe = window.innerHeight * .45;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= probe) active = section;
    }
    return active;
  };

  const updateIndex = () => {
    const chapter = activeSection()?.dataset.chapter || '';
    indexButtons.forEach((button, key) => {
      const on = key === chapter;
      button.classList.toggle('is-active', on);
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  };

  /* ---------- title annotation ---------- */
  const entries = [];
  sections.forEach(section => {
    const title = section.querySelector('.hero__title, .display-title');
    const trigger = title || section.querySelector('.section-head');
    if (!trigger) return;
    entries.push({
      trigger,
      chapter: section.dataset.chapter || '',
      nameZh: section.dataset.nameZh || '',
      nameEn: section.dataset.nameEn || '',
      html: titleHTML(title)
    });
  });

  if (!rail || !body || !chapterEl || !nameEl || !titleEl) {
    if (index) requestAnimationFrame(updateIndex);
    return;
  }

  let current = null;
  let ticking = false;

  const findEntry = () => {
    let best = null;
    let bestDistance = Infinity;
    const middle = window.innerHeight / 2;
    const min = 0;
    const max = window.innerHeight * .82;
    for (const entry of entries) {
      const rect = entry.trigger.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      if (center < min || center > max) continue;
      const distance = Math.abs(center - middle);
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }
    return best;
  };

  const hideLabel = () => {
    current = null;
    rail.classList.remove('is-visible');
  };

  const showLabel = entry => {
    const rect = entry.trigger.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    if (center < 0 || center > window.innerHeight * .82) {
      hideLabel();
      return;
    }
    if (current !== entry) {
      current = entry;
      chapterEl.textContent = `[ ${entry.chapter} ]`;
      nameEl.innerHTML = span(entry.nameZh, entry.nameEn);
      titleEl.innerHTML = entry.html;
      body.classList.remove('is-enter');
      void body.offsetWidth;
      body.classList.add('is-enter');
    }
    rail.classList.add('is-visible');
    // Place the annotation at the title's centre, not at a fixed screen spot.
    rail.style.top = `${Math.round(center - body.offsetHeight / 2)}px`;
  };

  const update = () => {
    ticking = false;
    updateIndex();
    const entry = findEntry();
    if (entry) showLabel(entry);
    else hideLabel();
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  if (document.fonts?.ready) document.fonts.ready.then(requestUpdate);
  requestUpdate();
})();
