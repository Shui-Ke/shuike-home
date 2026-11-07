/*
 * PROJECT / 两道波之间的项目档案
 *
 * One canvas draws two long ink ribbons with quiet breathing and drag tension.
 * DOM cards sample the same ribbon geometry so their anchors stay attached.
 * Text stays crisp and selectable while the card is open. Wheel, drag, touch, arrow
 * keys and the pager all move the same horizontal position; cards open from
 * their crest as that position passes them. The footer date and the right-side
 * chrono vault filter the deck by real year / month.
 */
(function () {
  'use strict';

  const PROJECT_STORAGE_KEY = 'shuike:projects:v1';

  function readLocalProjects() {
    try {
      const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  const localProjects = readLocalProjects();
  const sourceProjects = Array.isArray(localProjects)
    ? localProjects.slice()
    : (Array.isArray(window.ShuikeProjects) ? window.ShuikeProjects.slice() : []);
  const currentCalendarYear = new Date().getFullYear();
  const allProjects = sourceProjects.filter((project) => project && typeof project === 'object').map((project, index) => {
    const year = Number.parseInt(project.year, 10);
    const month = Number.parseInt(project.month, 10);
    return {
      ...project,
      year: Number.isFinite(year) ? year : currentCalendarYear,
      month: month >= 1 && month <= 12 ? month : 1,
      order: index
    };
  }).sort((a, b) => a.order - b.order);

  // Only the visible neighborhood is rendered; it moves with the selection.
  let archiveYears = [];
  let renderedYear = null;
  let yearShiftAnimation = null;

  const root = document.documentElement;
  const body = document.body;
  const stage = document.querySelector('[data-project-stage], .project-stage');
  const layer = document.querySelector('[data-project-layer]');
  const canvas = document.querySelector('[data-wave-canvas]');
  const context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const pager = document.querySelector('.pager');
  const prevButton = document.querySelector('[data-prev]');
  const nextButton = document.querySelector('[data-next]');
  const currentLabel = document.querySelector('[data-current]');
  const totalLabel = document.querySelector('[data-total]');
  const pagerStatus = document.querySelector('[data-pager-status]');
  const live = document.querySelector('[data-live]');
  const themeButton = document.querySelector('[data-theme-toggle]');
  const yearBox = document.querySelector('[data-year-box]');
  const yearValue = document.querySelector('[data-year]');
  const yearMonth = document.querySelector('[data-year-month]');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const syncButton = document.querySelector('[data-vault-toggle]');
  const syncIcon = syncButton && syncButton.querySelector('.sync-button__icon');
  const vault = document.querySelector('[data-date-vault]');
  const vaultClose = document.querySelector('[data-vault-close]');
  const yearRoller = document.querySelector('[data-year-roller]');
  const yearWindow = document.querySelector('[data-year-window]');
  const yearTrack = document.querySelector('[data-year-track]');
  const yearCountLabel = document.querySelector('[data-year-count]');
  const vaultStatus = document.querySelector('[data-vault-status]');
  const vaultSeal = document.querySelector('[data-vault-seal]');
  const monthStrip = document.querySelector('[data-month-strip]');
  const monthGrid = document.querySelector('[data-month-grid]');
  const monthAll = document.querySelector('[data-month-all]');

  if (!stage || !layer || !canvas || !context) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const initialYear = allProjects.length ? Math.max(...allProjects.map((project) => project.year)) : currentCalendarYear;
  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    spacing: 560,
    amplitude: 60,
    centerY: 0,
    wavelength: 1120,
    position: 0,
    target: 0,
    intro: 0,
    active: 0,
    lastActive: -1,
    frame: 0,
    flow: 0,
    flowFrame: 0,
    flowLast: 0,
    motionLast: 0,
    renderLast: 0,
    lastPosition: 0,
    tension: 0,
    dragging: false,
    tracking: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTarget: 0,
    wheelTimer: 0,
    announceTimer: 0,
    resizeFrame: 0,
    reduceMotion: motionQuery.matches,
    ink: '#f1efe8',
    theme: root.dataset.theme === 'light' ? 'light' : 'dark',
    selectedYear: initialYear,
    selectedMonth: null,
    vaultOpen: false,
    yearWheel: 0,
    yearFocusTimer: 0,
    yearTypingToken: 0
  };

  let cards = [];
  let visibleProjects = [];
  let yearOptions = [];
  let monthButtons = [];
  let yearItemHeight = 54;
  const pad = (value) => String(value).padStart(2, '0');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const maxScroll = () => Math.max(0, (visibleProjects.length - 1) * state.spacing);
  const projectDate = (project) => `${project.year}.${pad(project.month)}`;
  const projectsFor = (year, month = null) => allProjects.filter((project) => (
    project.year === year && (month === null || project.month === month)
  ));
  const monthPlanCounts = (year) => {
    const counts = new Array(13).fill(0);
    allProjects.forEach((project) => {
      if (project.year === year && project.month >= 1 && project.month <= 12) counts[project.month] += 1;
    });
    return counts;
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function isExternalLink(value) {
    return /^https?:\/\//i.test(value || '');
  }

  function localHref(value) {
    if (!value) return '';
    const href = String(value).trim();
    if (!href) return '';
    if (/^(?:javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function externalHref(value) {
    if (!value) return '';
    const href = String(value).trim();
    if (!/^https?:\/\//i.test(href)) return '';
    return href;
  }

  function makeGitHubLink(project) {
    const href = externalHref(project.github);
    if (!href) return '';
    return `
      <a class="project__link" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 ${escapeHTML(project.title)}（新标签）">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .5C5.73.5.99 5.24.99 11.5c0 4.86 3.15 8.98 7.52 10.43.55.1.75-.24.75-.53v-2.1c-3.06.67-3.71-1.3-3.71-1.3-.5-1.28-1.22-1.62-1.22-1.62-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.48-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.91 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.51.22 2.63.11 2.91.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.4.34.75 1.01.75 2.04v3.02c0 .29.2.64.76.53a10.52 10.52 0 0 0 7.51-10.42C23.01 5.24 18.27.5 12 .5z"/></svg>
        <span>GitHub</span>
      </a>`;
  }

  function makePageLink(project) {
    const href = localHref(project.href);
    if (!href) return '';
    const external = isExternalLink(href);
    const label = project.hrefLabel || 'Open';
    const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    const suffix = external ? '（新标签）' : '';
    return `
      <a class="project__link" href="${escapeHTML(href)}"${target} aria-label="打开项目 ${escapeHTML(project.title)}${suffix}">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true" focusable="false"><path d="M2.2 9.8 9.8 2.2M3.1 2.2h6.7v6.7"/></svg>
        <span>${escapeHTML(label)}</span>
      </a>`;
  }

  function buildCards(projects) {
    layer.replaceChildren();
    cards = [];
    projects.forEach((project, index) => {
      const article = document.createElement('article');
      const side = index % 2 === 0 ? 'above' : 'below';
      const titleId = `project-title-${state.selectedYear}-${state.selectedMonth || 'all'}-${index}`;
      const tags = Array.isArray(project.tags) ? project.tags.filter(Boolean) : [];
      const links = `${makeGitHubLink(project)}${makePageLink(project)}`;
      const tagMarkup = tags.length
        ? `<ul class="project__tags" aria-label="项目标签">${tags.map((tag) => `<li>${escapeHTML(tag)}</li>`).join('')}</ul>`
        : '<ul class="project__tags" aria-hidden="true"></ul>';

      article.className = 'project';
      article.dataset.index = String(index);
      article.dataset.side = side;
      article.dataset.projectId = project.id;
      article.setAttribute('aria-labelledby', titleId);
      article.setAttribute('aria-hidden', 'true');
      article.inert = true;
      article.style.setProperty('--alpha', '0');
      article.style.setProperty('--stem', '12px');
      article.style.setProperty('--node-opacity', '.3');
      article.innerHTML = `
        <span class="project__node" aria-hidden="true"></span>
        <span class="project__stem" aria-hidden="true"></span>
        <div class="project__panel">
          <div class="project__top">
            <span class="project__number">${pad(index + 1)}</span>
            <span class="project__category">${escapeHTML(project.category || 'PROJECT')}</span>
            <span class="project__year">${projectDate(project)}</span>
          </div>
          <h2 class="project__title" id="${titleId}">${escapeHTML(project.title)}</h2>
          ${project.subtitle ? `<p class="project__subtitle">${escapeHTML(project.subtitle)}</p>` : ''}
          <p class="project__description">${escapeHTML(project.description || '')}</p>
          <div class="project__footer">
            ${tagMarkup}
            <div class="project__links">${links}</div>
          </div>
        </div>`;
      layer.appendChild(article);
      cards.push({
        el: article,
        index,
        project,
        title: project.title,
        side,
        interactive: false,
        reveal: 0
      });
    });
  }

  function measure() {
    state.width = Math.max(1, stage.clientWidth || window.innerWidth);
    state.height = Math.max(1, stage.clientHeight || window.innerHeight);
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.spacing = Math.max(360, Math.min(560, state.width * 0.39));
    state.amplitude = clamp(state.height * 0.073, 30, 68);
    state.centerY = state.height * 0.545;
    state.wavelength = state.spacing * 2;

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    cards.forEach((card) => {
      const y = state.centerY + (card.side === 'above' ? -1.3 : 0.1) * state.amplitude;
      card.el.style.setProperty('--node-y', `${y.toFixed(2)}px`);
    });


    state.ink = getComputedStyle(root).getPropertyValue('--wave-ink').trim() || state.ink;
  }

  // Both Canvas and DOM use this field. Breathing stays within a few pixels
  // at rest; pointer velocity gently bends the shoulders without shaking text.
  function waveY(worldX, secondary = false) {
    const theta = (2 * Math.PI * worldX) / state.wavelength;
    const time = state.reduceMotion ? 0 : state.flow;
    const breath = Math.sin(theta * .63 + time * .32) * .035;
    const bend = state.reduceMotion ? 0 : state.tension * .18 * Math.sin(theta + .4);
    const shape = secondary
      ? .66 + .55 * Math.cos(theta + .48 + Math.sin(time * .19) * .035)
        + .08 * Math.sin(theta * 1.5 + .8) - bend * .65
      : -.3 - Math.cos(theta) + .075 * Math.sin(theta * 1.5) + bend;
    return state.centerY + state.amplitude * (shape + breath);
  }

  function buildWavePath(secondary) {
    const center = state.width * .5;
    const overscan = 76;
    const step = 3;
    context.beginPath();
    for (let x = -overscan; x <= state.width + overscan; x += step) {
      const worldX = x - center + state.position;
      const y = waveY(worldX, secondary);
      if (x === -overscan) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }

  function paintWave(secondary) {
    buildWavePath(secondary);
    context.save();
    context.strokeStyle = state.ink;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.setLineDash([]);
    context.globalAlpha = secondary ? .17 : .43;
    context.lineWidth = secondary ? .8 : 1;
    context.stroke();
    // A broad reflection follows the line, without turning it into marching dashes.
    const lightX = state.width * (.5 + .34 * Math.sin(state.flow * .13));
    const light = context.createLinearGradient(lightX - state.width * .45, 0, lightX + state.width * .45, 0);
    light.addColorStop(0, 'transparent');
    light.addColorStop(.5, state.ink);
    light.addColorStop(1, 'transparent');
    context.strokeStyle = light;
    context.globalAlpha = secondary ? .1 : .38;
    context.stroke();
    context.restore();
  }

  function drawWave() {
    if (!context || !state.width || !state.height) return;

    context.clearRect(0, 0, state.width, state.height);

    paintWave(true);
    paintWave(false);

    context.globalAlpha = 1;
    context.setLineDash([]);
  }

  function flowTick(now) {
    state.flowFrame = 0;
    if (state.reduceMotion || document.hidden) return;

    if (!state.flowLast) state.flowLast = now;
    const elapsed = Math.min(50, now - state.flowLast);
    state.flowLast = now;
    state.flow += elapsed * .001;
    const speed = (state.position - state.lastPosition) / Math.max(elapsed, 1);
    state.lastPosition = state.position;
    state.tension += (clamp(speed * .32, -1, 1) - state.tension) * (1 - Math.exp(-elapsed / 180));
    render();
    state.flowFrame = requestAnimationFrame(flowTick);
  }

  function ensureFlow() {
    if (state.reduceMotion || document.hidden || state.flowFrame) return;
    state.flowLast = 0;
    state.lastPosition = state.position;
    state.flowFrame = requestAnimationFrame(flowTick);
  }

  function stopFlow() {
    if (state.flowFrame) cancelAnimationFrame(state.flowFrame);
    state.flowFrame = 0;
    state.flowLast = 0;
  }

  function setInteractive(card, interactive) {
    if (card.interactive === interactive) return;
    card.interactive = interactive;
    if (!interactive && card.el.contains(document.activeElement)) {
      stage.focus({ preventScroll: true });
    }
    card.el.inert = !interactive;
    if (interactive) card.el.removeAttribute('aria-hidden');
    else card.el.setAttribute('aria-hidden', 'true');
  }

  function updatePager() {
    const total = visibleProjects.length;
    if (!total) {
      state.active = -1;
      state.lastActive = -1;
      if (currentLabel) currentLabel.textContent = '00';
      if (totalLabel) totalLabel.textContent = '00';
      if (pagerStatus) pagerStatus.textContent = '当前筛选没有项目';
      if (prevButton) prevButton.disabled = true;
      if (nextButton) nextButton.disabled = true;
      if (pager) pager.setAttribute('aria-label', '项目翻页，当前筛选没有项目');
      return;
    }

    const active = clamp(state.active, 0, total - 1);
    state.active = active;
    const number = pad(active + 1);
    const totalText = pad(total);
    if (currentLabel) currentLabel.textContent = number;
    if (totalLabel) totalLabel.textContent = totalText;
    if (pagerStatus) pagerStatus.textContent = `第 ${active + 1} 个项目，共 ${total} 个`;
    if (prevButton) prevButton.disabled = active <= 0;
    if (nextButton) nextButton.disabled = active >= total - 1;
    if (pager) pager.setAttribute('aria-label', `项目翻页，当前第 ${active + 1} 个，共 ${total} 个`);
  }

  function archiveScopeLabel() {
    if (state.selectedMonth) return `${state.selectedYear} 年 ${state.selectedMonth} 月`;
    return `${state.selectedYear} 年`;
  }

  function announceActive() {
    if (!live) return;
    window.clearTimeout(state.announceTimer);
    if (!visibleProjects.length) {
      state.announceTimer = window.setTimeout(() => {
        live.textContent = `${archiveScopeLabel()}，没有项目。`;
      }, 200);
      return;
    }

    const targetIndex = clamp(Math.round(state.target / state.spacing), 0, visibleProjects.length - 1);
    state.announceTimer = window.setTimeout(() => {
      if (state.dragging) return;
      const card = cards[targetIndex];
      if (card) live.textContent = `${pad(targetIndex + 1)} / ${pad(visibleProjects.length)}，${card.title}。`;
    }, 220);
  }

  function setActiveIfNeeded(nextActive) {
    if (nextActive === state.active && state.lastActive === nextActive) return;
    if (state.lastActive >= 0 && nextActive !== state.active) {
      const previous = cards[state.active];
      if (previous && previous.el.contains(document.activeElement)) {
        stage.focus({ preventScroll: true });
      }
    }
    state.active = nextActive;
    state.lastActive = nextActive;
    updatePager();
  }

  function render() {
    if (!state.width) return;
    const now = performance.now();
    const elapsed = Math.min(50, now - (state.renderLast || now - 16));
    state.renderLast = now;

    if (!visibleProjects.length) {
      if (state.active !== -1) {
        const previous = cards[state.active];
        if (previous && previous.el.contains(document.activeElement)) {
          stage.focus({ preventScroll: true });
        }
        state.active = -1;
        state.lastActive = -1;
        updatePager();
      }
      drawWave();
      return;
    }

    const nearest = clamp(Math.round(state.position / state.spacing), 0, visibleProjects.length - 1);
    setActiveIfNeeded(nearest);

    const activeCard = cards[state.active];
    cards.forEach((card) => {
      const offset = card.index * state.spacing - state.position;
      card.el.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
      card.el.style.setProperty('--node-y', `${waveY(card.index * state.spacing, card.side === 'below').toFixed(2)}px`);

      const distance = Math.abs(offset);
      const base = clamp(1 - distance / state.spacing, 0, 1);
      const growth = clamp((base - .22) / .78, 0, 1);
      const eased = growth * growth * (3 - 2 * growth);
      const desired = card === activeCard ? eased * state.intro : 0;
      const reveal = state.reduceMotion ? desired
        : card.reveal + (desired - card.reveal) * (1 - Math.exp(-elapsed / 115));
      const panelReveal = clamp((reveal - .12) / .88, 0, 1);
      const stemBase = state.height <= 520 ? 8 : 12;
      const stemTravel = state.height <= 520 ? 22 : 34;
      const stem = stemBase + stemTravel * Math.min(1, reveal * 1.45);
      const alpha = panelReveal * panelReveal * (3 - 2 * panelReveal);
      const nodeOpacity = .3 + reveal * .7;
      const active = reveal > .68 && card.index === state.active;

      card.reveal = reveal;
      card.el.style.setProperty('--lift', `${((1 - panelReveal) * 14 * (card.side === 'above' ? 1 : -1)).toFixed(2)}px`);
      card.el.style.setProperty('--stem-alpha', Math.min(1, reveal * 2).toFixed(3));
      card.el.style.setProperty('--stem', `${stem.toFixed(2)}px`);
      card.el.style.setProperty('--alpha', alpha.toFixed(3));
      card.el.style.setProperty('--node-opacity', nodeOpacity.toFixed(3));
      card.el.classList.toggle('is-active', active);
      card.el.classList.toggle('is-open', reveal > .995);
      setInteractive(card, active);
    });

    drawWave();
  }

  function tick(now) {
    state.frame = 0;
    let moving = false;
    const elapsed = Math.min(50, now - (state.motionLast || now - 16.667));
    state.motionLast = now;

    if (state.intro < 1) {
      if (state.reduceMotion) state.intro = 1;
      else {
        state.intro = Math.min(1, state.intro + elapsed / 520);
        moving = true;
      }
    }

    if (state.dragging) {
      state.position = state.target;
    } else if (state.reduceMotion) {
      state.position = state.target;
    } else {
      const difference = state.target - state.position;
      if (Math.abs(difference) > .1) {
        state.position += difference * (1 - Math.exp(-elapsed / 125));
        if (Math.abs(state.target - state.position) < .12) state.position = state.target;
        moving = true;
      } else if (state.position !== state.target) {
        state.position = state.target;
      }
    }

    render();

    if (moving || (state.target !== state.position)) {
      state.frame = requestAnimationFrame(tick);
    }
  }

  function ensureFrame() {
    if (state.frame) return;
    state.motionLast = 0;
    state.frame = requestAnimationFrame(tick);
  }

  function cancelSnap() {
    window.clearTimeout(state.wheelTimer);
    state.wheelTimer = 0;
  }

  function snapToNearest(delay = 0) {
    cancelSnap();
    const finish = () => {
      if (state.dragging) return;
      const max = maxScroll();
      if (!visibleProjects.length) {
        state.target = 0;
        state.position = 0;
        ensureFrame();
        announceActive();
        return;
      }
      const nearest = clamp(Math.round(state.target / state.spacing), 0, visibleProjects.length - 1);
      state.target = clamp(nearest * state.spacing, 0, max);
      if (state.reduceMotion) state.position = state.target;
      ensureFrame();
      announceActive();
    };
    if (delay > 0) state.wheelTimer = window.setTimeout(finish, delay);
    else finish();
  }

  function hideGesture() {
    body.classList.add('has-interacted');
  }

  function goTo(index, options = {}) {
    if (!visibleProjects.length) return;
    const next = clamp(Math.round(index), 0, visibleProjects.length - 1);
    cancelSnap();
    hideGesture();
    state.target = next * state.spacing;
    if (state.reduceMotion) state.position = state.target;
    ensureFrame();
    if (options.announce !== false) announceActive();
  }

  function goBy(step) {
    if (!visibleProjects.length) return;
    const base = clamp(Math.round(state.target / state.spacing), 0, visibleProjects.length - 1);
    goTo(base + step);
  }

  /* Year selection renders a moving neighborhood; months filter the selected year. */
  function monthChipMarkup(month) {
    return `<span class="month-chip__num">${pad(month)}</span><span class="month-chip__count" aria-hidden="true">00</span>`;
  }

  function buildMonthControls() {
    [monthStrip, monthGrid].forEach((container) => {
      if (!container) return;
      container.replaceChildren();
      for (let month = 1; month <= 12; month += 1) {
        const button = document.createElement('button');
        button.className = 'month-chip';
        button.type = 'button';
        button.dataset.month = String(month);
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = monthChipMarkup(month);
        container.appendChild(button);
        monthButtons.push(button);
      }
    });
  }

  function buildYearRoller() {
    if (!yearTrack) return;
    const existing = new Map(yearOptions.map(option => [Number(option.dataset.archiveYear), option]));
    yearOptions = [];
    archiveYears = Array.from({length: 21}, (_, i) => state.selectedYear + 8 - i).filter(Number.isSafeInteger);
    renderedYear = state.selectedYear;
    archiveYears.forEach((year, index) => {
      const count = projectsFor(year).length;
      const option = existing.get(year) || document.createElement('div');
      existing.delete(year);
      option.className = 'vault-year';
      option.id = `vault-year-${year}`;
      option.dataset.archiveYear = String(year);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', `${year} 年，${count} 个项目`);
      option.style.setProperty('--year-order', String(Math.max(0, index - 8)));
      if (!option.firstChild) option.innerHTML = `<span class="vault-year__value">${year}</span><span class="vault-year__count" aria-hidden="true">${pad(count)}</span>`;
      yearTrack.appendChild(option);
      yearOptions.push(option);
    });
    existing.forEach(option => option.remove());
  }

  function onMonthClick(event) {
    const button = event.target.closest('[data-month]');
    if (!button) return;
    toggleMonth(Number(button.dataset.month));
  }

  function onYearClick(event) {
    const option = event.target.closest('[data-archive-year]');
    if (!option) return;
    selectYear(Number(option.dataset.archiveYear));
  }

  function updateMonthControls() {
    const counts = monthPlanCounts(state.selectedYear);
    monthButtons.forEach((button) => {
      const month = Number(button.dataset.month);
      const count = counts[month];
      const selected = state.selectedMonth === month;
      button.classList.toggle('has-projects', count > 0);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.setAttribute('aria-label', `${state.selectedYear} 年 ${month} 月，${count} 个项目`);
      const countLabel = button.querySelector('.month-chip__count');
      if (countLabel) countLabel.textContent = pad(count);
    });

    if (monthAll) {
      monthAll.setAttribute('aria-pressed', state.selectedMonth === null ? 'true' : 'false');
    }
  }

  function updateYearTrack(animate = true) {
    if (!yearTrack || !yearOptions.length) return;
    const height = yearOptions[0].offsetHeight || yearItemHeight;
    const center = (yearWindow.clientHeight - height) / 2;
    const previousYear = renderedYear;
    // Read the in-flight position before recycling rows. Rapid wheel events
    // continue from this exact visual position instead of restarting a step.
    const matrix = new DOMMatrixReadOnly(getComputedStyle(yearTrack).transform);
    const visualYear = archiveYears[0] - (center - matrix.m42) / height;
    if (yearShiftAnimation) yearShiftAnimation.cancel();
    if (renderedYear !== state.selectedYear) buildYearRoller();
    yearItemHeight = height;
    const index = archiveYears.indexOf(state.selectedYear);
    const y = center - index * height;
    yearTrack.style.transform = `translate3d(0, ${y}px, 0)`;
    if (animate && !state.reduceMotion && previousYear !== null && Math.abs(state.selectedYear - visualYear) > .001) {
      const distance = clamp(visualYear - state.selectedYear, -6, 6);
      yearShiftAnimation = yearTrack.animate([
        {transform: `translate3d(0, ${y + distance * height}px, 0)`},
        {transform: `translate3d(0, ${y}px, 0)`}
      ], {duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)'});
    }
  }

  function updateYearControls(animate = true) {
    updateYearTrack(animate);
    yearOptions.forEach((option) => {
      const year = Number(option.dataset.archiveYear);
      const selected = year === state.selectedYear;
      const count = projectsFor(year).length;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
      const countLabel = option.querySelector('.vault-year__count');
      if (countLabel) countLabel.textContent = pad(count);
    });

    const total = projectsFor(state.selectedYear).length;
    if (yearCountLabel) yearCountLabel.textContent = `${pad(total)} ENTRIES`;
    if (vaultStatus) {
      const scopeTotal = state.selectedMonth ? visibleProjects.length : total;
      vaultStatus.textContent = `${state.selectedYear}${state.selectedMonth ? `.${pad(state.selectedMonth)}` : ''} · ${pad(scopeTotal)} ENTRIES`;
    }
    if (vaultSeal) {
      vaultSeal.textContent = `SHUIKE / ${String(state.selectedYear).slice(-2)}`;
    }
    if (yearRoller) {
      yearRoller.setAttribute('aria-activedescendant', `vault-year-${state.selectedYear}`);
      yearRoller.setAttribute('aria-label', `${state.selectedYear} 年，${total} 个项目。使用滚轮或上下方向键选择年份。`);
    }
  }

  function updateYearCaption() {
    if (!yearBox) return;
    if (yearMonth) {
      if (state.selectedMonth) {
        yearMonth.textContent = pad(state.selectedMonth);
        yearMonth.classList.add('is-set');
      } else {
        yearMonth.textContent = '';
        yearMonth.classList.remove('is-set');
      }
    }
    yearBox.setAttribute('aria-label', `${state.selectedYear} 年${state.selectedMonth ? ` ${state.selectedMonth} 月` : ''}`);
  }

  function setYearDisplay() {
    state.yearTypingToken += 1;
    if (yearValue) yearValue.textContent = `${state.selectedYear}.`;
    updateYearCaption();
  }

  function announceArchiveScope() {
    if (!live) return;
    window.clearTimeout(state.announceTimer);
    const count = visibleProjects.length;
    state.announceTimer = window.setTimeout(() => {
      live.textContent = `${archiveScopeLabel()}，${count ? `共 ${count} 个项目。` : '没有项目。'}`;
    }, 180);
  }

  function applyArchiveFilter(options = {}) {
    const { initial = false, announce = true } = options;
    if (layer.contains(document.activeElement)) stage.focus({ preventScroll: true });

    visibleProjects = projectsFor(state.selectedYear, state.selectedMonth);
    buildCards(visibleProjects);
    measure();
    state.position = 0;
    state.target = 0;
    state.active = visibleProjects.length ? 0 : -1;
    state.lastActive = -1;
    if (!initial) state.intro = state.reduceMotion ? 1 : .32;

    updatePager();
    updateMonthControls();
    updateYearControls(!initial);
    updateYearCaption();
    render();
    if (visibleProjects.length && !initial) ensureFrame();
    if (announce) announceArchiveScope();
  }

  function selectYear(year) {
    if (!Number.isSafeInteger(year)) return;
    if (year === state.selectedYear) {
      if (state.selectedMonth !== null) {
        state.selectedMonth = null;
        updateYearCaption();
        applyArchiveFilter();
      }
      return;
    }
    state.selectedYear = year;
    state.selectedMonth = null;
    state.yearWheel = 0;
    setYearDisplay();
    applyArchiveFilter();
  }

  function selectYearByOffset(offset) {
    if (offset) selectYear(state.selectedYear - offset);
  }

  function toggleMonth(month) {
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    const nextMonth = state.selectedMonth === month ? null : month;
    state.selectedMonth = nextMonth;
    updateYearCaption();
    applyArchiveFilter();
  }

  function clearMonthFilter() {
    if (state.selectedMonth === null) return;
    state.selectedMonth = null;
    updateYearCaption();
    applyArchiveFilter();
  }

  function spinSyncIcon() {
    if (!syncIcon || state.reduceMotion) return;
    syncIcon.classList.remove('is-rotating');
    void syncIcon.offsetWidth;
    syncIcon.classList.add('is-rotating');
  }

  function openVault() {
    if (state.vaultOpen || !vault) return;
    state.vaultOpen = true;
    spinSyncIcon();
    updateMonthControls();
    updateYearControls(false);
    vault.classList.add('is-open');
    vault.inert = false;
    vault.removeAttribute('inert');
    vault.setAttribute('aria-hidden', 'false');
    body.classList.add('vault-open');
    if (syncButton) {
      syncButton.setAttribute('aria-expanded', 'true');
      syncButton.setAttribute('aria-label', '关闭年份选择');
    }

    window.clearTimeout(state.yearFocusTimer);
    state.yearFocusTimer = window.setTimeout(() => {
      if (state.vaultOpen && yearRoller) yearRoller.focus({ preventScroll: true });
    }, state.reduceMotion ? 90 : 280);
  }

  function closeVault(options = {}) {
    const { restoreFocus = true } = options;
    if (!state.vaultOpen || !vault) return;
    state.vaultOpen = false;
    window.clearTimeout(state.yearFocusTimer);
    const hadFocus = vault.contains(document.activeElement);
    vault.classList.remove('is-open');
    body.classList.remove('vault-open');
    if (restoreFocus && syncButton) syncButton.focus({ preventScroll: true });
    else if (hadFocus && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    vault.inert = true;
    vault.setAttribute('aria-hidden', 'true');
    if (syncButton) {
      syncButton.setAttribute('aria-expanded', 'false');
      syncButton.setAttribute('aria-label', '打开年份选择');
    }
  }

  function onYearWheel(event) {
    if (!state.vaultOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 60 : 1;
    state.yearWheel += clamp(event.deltaY * unit, -240, 240);
    if (Math.abs(state.yearWheel) < 40) return;
    const direction = Math.sign(state.yearWheel);
    state.yearWheel = 0;
    selectYearByOffset(direction);
  }

  function onYearKeyDown(event) {
    if (!state.vaultOpen) return;
    let offset = 0;
    if (event.key === 'ArrowDown') offset = 1;
    else if (event.key === 'ArrowUp') offset = -1;
    else if (event.key === 'PageDown') offset = 3;
    else if (event.key === 'PageUp') offset = -3;
    else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      selectYear(currentCalendarYear);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      selectYear(initialYear);
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectYearByOffset(offset);
  }

  function onDocumentPointerDown(event) {
    if (!state.vaultOpen) return;
    if (vault && vault.contains(event.target)) return;
    if (syncButton && syncButton.contains(event.target)) return;
    closeVault({ restoreFocus: false });
  }

  function onVaultToggle() {
    if (state.vaultOpen) closeVault();
    else openVault();
  }

  function onVaultClose() {
    closeVault();
  }

  function onMonthAll() {
    clearMonthFilter();
  }

  /* Theme is page-scoped: it reuses the storage key and inherited token name
     so Home, Profile and Project always open in the same light/dark mode. */
  function syncThemeChrome() {
    state.ink = getComputedStyle(root).getPropertyValue('--wave-ink').trim() || state.ink;
    metaTheme && (metaTheme.content = state.theme === 'light' ? '#efede6' : '#070707');
    if (themeButton) {
      themeButton.setAttribute('aria-label', state.theme === 'light' ? '切换至深色模式' : '切换至浅色模式');
    }
    drawWave();
  }

  function setTheme(theme, persist = true) {
    const next = theme === 'light' ? 'light' : 'dark';
    state.theme = next;
    root.dataset.theme = next;
    root.style.colorScheme = next === 'light' ? 'light' : 'dark';
    if (persist) {
      try { localStorage.setItem('shuike:theme', next); } catch (_) {}
    }
    syncThemeChrome();
    try {
      document.dispatchEvent(new CustomEvent('shuike:theme-change', {
        detail: { theme: next, colorScheme: next === 'light' ? 'light' : 'dark' }
      }));
    } catch (_) {}
  }

  function onThemeClick() {
    setTheme(state.theme === 'light' ? 'dark' : 'light');
  }

  function onThemeStorage(event) {
    if (event.key !== 'shuike:theme') return;
    if (event.newValue === 'light' || event.newValue === 'dark') {
      setTheme(event.newValue, false);
    }
  }

  function onWheel(event) {
    if (event.ctrlKey) return;
    event.preventDefault();
    hideGesture();
    cancelSnap();

    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.width : 1;
    const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const amount = clamp(raw * unit, -320, 320);
    state.target = clamp(state.target + amount * 1.8, 0, maxScroll());
    ensureFrame();
    snapToNearest(170);
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (event.target.closest && event.target.closest('a, button')) return;
    if (state.pointerId !== null) return;

    state.tracking = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.startTarget = state.position;
    cancelSnap();
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(event) {
    if (!state.tracking || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (!state.dragging) {
      if (Math.abs(dx) < 5) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.05) return;
      state.dragging = true;
      body.classList.add('is-dragging');
      hideGesture();
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(event.pointerId); } catch (_) {}
      }
    }

    if (event.cancelable) event.preventDefault();
    const next = clamp(state.startTarget - dx, 0, maxScroll());
    state.target = next;
    state.position = next;
    ensureFrame();
  }

  function finishPointer() {
    if (!state.tracking) return;
    const wasDragging = state.dragging;
    state.tracking = false;
    state.dragging = false;
    state.pointerId = null;
    body.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (wasDragging || Math.abs(state.target - state.position) > .1) {
      snapToNearest();
    }
  }

  function onPointerUp(event) {
    if (event && state.pointerId !== null && event.pointerId !== state.pointerId) return;
    finishPointer();
  }

  function onKeyDown(event) {
    if (document.body.classList.contains('editor-open')) return;
    if (event.key === 'Escape' && state.vaultOpen) {
      event.preventDefault();
      closeVault();
      return;
    }
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], .date-vault')) return;

    let handled = true;
    if (event.key === 'ArrowRight') goBy(1);
    else if (event.key === 'ArrowLeft') goBy(-1);
    else if (event.key === 'Home') goTo(0);
    else if (event.key === 'End') goTo(visibleProjects.length - 1);
    else handled = false;
    if (handled) event.preventDefault();
  }

  function onPrev() {
    goBy(-1);
  }

  function onNext() {
    goBy(1);
  }

  function scheduleResize() {
    if (state.resizeFrame) return;
    state.resizeFrame = requestAnimationFrame(() => {
      state.resizeFrame = 0;
      const active = visibleProjects.length
        ? clamp(Math.round(state.position / state.spacing), 0, visibleProjects.length - 1)
        : 0;
      measure();
      state.position = visibleProjects.length ? clamp(active * state.spacing, 0, maxScroll()) : 0;
      state.target = state.position;
      applyInitialPosition();
      updateYearTrack(false);
      render();
    });
  }

  function applyInitialPosition() {
    state.target = clamp(state.target, 0, maxScroll());
    state.position = clamp(state.position, 0, maxScroll());
  }

  function onMotionChange(event) {
    state.reduceMotion = event.matches;
    if (state.reduceMotion) {
      state.intro = 1;
      state.position = state.target;
      stopFlow();
      drawWave();
      render();
    } else {
      ensureFlow();
      ensureFrame();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopFlow();
      return;
    }
    ensureFrame();
    ensureFlow();
  }

  function typeYear() {
    if (!yearValue || !yearBox) return;
    const token = ++state.yearTypingToken;
    const written = `${state.selectedYear}.`;
    yearValue.textContent = '';
    updateYearCaption();
    if (state.reduceMotion) {
      yearValue.textContent = written;
      return;
    }

    let index = 0;
    window.setTimeout(function typeNext() {
      if (token !== state.yearTypingToken) return;
      if (index >= written.length) return;
      yearValue.textContent += written[index];
      index += 1;
      window.setTimeout(typeNext, index === written.length ? 210 : 88);
    }, 560);
  }

  function onSyncAnimationEnd() {
    if (syncIcon) syncIcon.classList.remove('is-rotating');
  }

  function addListeners() {
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onPointerDown);
    prevButton && prevButton.addEventListener('click', onPrev);
    nextButton && nextButton.addEventListener('click', onNext);
    themeButton && themeButton.addEventListener('click', onThemeClick);
    syncButton && syncButton.addEventListener('click', onVaultToggle);
    vaultClose && vaultClose.addEventListener('click', onVaultClose);
    monthAll && monthAll.addEventListener('click', onMonthAll);
    monthStrip && monthStrip.addEventListener('click', onMonthClick);
    monthGrid && monthGrid.addEventListener('click', onMonthClick);
    yearTrack && yearTrack.addEventListener('click', onYearClick);
    yearRoller && yearRoller.addEventListener('wheel', onYearWheel, { passive: false });
    yearRoller && yearRoller.addEventListener('keydown', onYearKeyDown);
    syncIcon && syncIcon.addEventListener('animationend', onSyncAnimationEnd);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('storage', onThemeStorage);
    window.addEventListener('blur', finishPointer);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  }

  function init() {
    buildMonthControls();
    buildYearRoller();
    setTheme(state.theme, false);
    applyArchiveFilter({ initial: true, announce: false });
    addListeners();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        body.classList.add('is-ready');
        body.classList.remove('is-booting');
        if (state.reduceMotion) {
          state.intro = 1;
          render();
        } else {
          ensureFrame();
          ensureFlow();
        }
        typeYear();
      });
    });
  }

  window.ShuikeProjectPage = {
    get index() { return state.active; },
    get total() { return visibleProjects.length; },
    get year() { return state.selectedYear; },
    get month() { return state.selectedMonth; },
    get years() { return archiveYears.slice(); },
    get projects() {
      return allProjects.map((project) => ({
        ...project,
        tags: Array.isArray(project.tags) ? project.tags.slice() : []
      }));
    },
    get storageKey() { return PROJECT_STORAGE_KEY; },
    get vaultOpen() { return state.vaultOpen; },
    get position() { return state.position; },
    get target() { return state.target; },
    goTo,
    next: () => goBy(1),
    previous: () => goBy(-1),
    setYear(year) { selectYear(year); },
    setMonth(month) {
      if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) return;
      if (state.selectedMonth === month) return;
      state.selectedMonth = month;
      updateYearCaption();
      applyArchiveFilter();
    },
    openVault,
    closeVault,
    refreshLayout: scheduleResize,
    setTheme,
    destroy() {
      cancelSnap();
      window.clearTimeout(state.announceTimer);
      window.clearTimeout(state.yearFocusTimer);
      state.yearTypingToken += 1;
      if (state.frame) cancelAnimationFrame(state.frame);
      if (state.resizeFrame) cancelAnimationFrame(state.resizeFrame);
      stopFlow();
      if (state.vaultOpen) closeVault({ restoreFocus: false });
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onPointerDown);
      prevButton && prevButton.removeEventListener('click', onPrev);
      nextButton && nextButton.removeEventListener('click', onNext);
      themeButton && themeButton.removeEventListener('click', onThemeClick);
      syncButton && syncButton.removeEventListener('click', onVaultToggle);
      vaultClose && vaultClose.removeEventListener('click', onVaultClose);
      monthAll && monthAll.removeEventListener('click', onMonthAll);
      monthStrip && monthStrip.removeEventListener('click', onMonthClick);
      monthGrid && monthGrid.removeEventListener('click', onMonthClick);
      yearTrack && yearTrack.removeEventListener('click', onYearClick);
      if (yearShiftAnimation) yearShiftAnimation.cancel();
      yearRoller && yearRoller.removeEventListener('wheel', onYearWheel);
      yearRoller && yearRoller.removeEventListener('keydown', onYearKeyDown);
      syncIcon && syncIcon.removeEventListener('animationend', onSyncAnimationEnd);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', scheduleResize);
      window.removeEventListener('storage', onThemeStorage);
      window.removeEventListener('blur', finishPointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
      else if (motionQuery.removeListener) motionQuery.removeListener(onMotionChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    }
  };

  init();
})();
