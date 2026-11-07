/* 00 — PLANET DOSSIER
   Listens for the globe's planet-focus / planet-blur events and fills the
   left-hand card. The data is static, bilingual and shown through the same
   .lang-zh / .lang-en switch as the rest of the dossier. */
(() => {
  'use strict';

  const PLANETS = {
    mercury: {
      index: 1, zh: '水星', en: 'Mercury',
      typeZh: '类地行星', typeEn: 'Terrestrial',
      distance: '0.39 AU', diameter: '4,879 KM', orbit: '88 D', day: '58.6 D', moons: '0',
    },
    venus: {
      index: 2, zh: '金星', en: 'Venus',
      typeZh: '类地行星', typeEn: 'Terrestrial',
      distance: '0.72 AU', diameter: '12,104 KM', orbit: '225 D', day: '243 D', moons: '0',
    },
    earth: {
      index: 3, zh: '地球', en: 'Earth',
      typeZh: '类地行星', typeEn: 'Terrestrial',
      distance: '1.00 AU', diameter: '12,742 KM', orbit: '365 D', day: '23.9 H', moons: '1',
    },
    mars: {
      index: 4, zh: '火星', en: 'Mars',
      typeZh: '类地行星', typeEn: 'Terrestrial',
      distance: '1.52 AU', diameter: '6,779 KM', orbit: '687 D', day: '24.6 H', moons: '2',
    },
    jupiter: {
      index: 5, zh: '木星', en: 'Jupiter',
      typeZh: '气态巨行星', typeEn: 'Gas giant',
      distance: '5.20 AU', diameter: '139,820 KM', orbit: '11.9 Y', day: '9.9 H', moons: '95',
    },
    saturn: {
      index: 6, zh: '土星', en: 'Saturn',
      typeZh: '气态巨行星', typeEn: 'Gas giant',
      distance: '9.58 AU', diameter: '116,460 KM', orbit: '29.4 Y', day: '10.7 H', moons: '146',
    },
    uranus: {
      index: 7, zh: '天王星', en: 'Uranus',
      typeZh: '冰巨星', typeEn: 'Ice giant',
      distance: '19.2 AU', diameter: '50,724 KM', orbit: '84.0 Y', day: '17.2 H', moons: '28',
    },
    neptune: {
      index: 8, zh: '海王星', en: 'Neptune',
      typeZh: '冰巨星', typeEn: 'Ice giant',
      distance: '30.1 AU', diameter: '49,244 KM', orbit: '164.8 Y', day: '16.1 H', moons: '16',
    }
  };

  const panel = document.querySelector('[data-planet-panel]');
  if (!panel) return;

  const field = selector => panel.querySelector(selector);
  const elements = {
    code: field('[data-planet-code]'),
    index: field('[data-planet-index]'),
    name: field('[data-planet-name]'),
    latin: field('[data-planet-latin]'),
    type: field('[data-planet-type]'),
    facts: field('[data-planet-facts]')
  };

  let hideTimer = 0;

  const spans = (zh, en) => `<span class="lang-zh">${zh}</span><span class="lang-en" lang="en">${en}</span>`;
  const pad = value => String(value).padStart(2, '0');

  function open(name) {
    const data = PLANETS[name];
    if (!data) return;
    clearTimeout(hideTimer);
    elements.code.textContent = `PLANET / ${pad(data.index)}`;
    elements.index.textContent = pad(data.index);
    elements.name.innerHTML = spans(data.zh, data.en);
    elements.latin.textContent = data.en.toUpperCase();
    elements.type.innerHTML = spans(data.typeZh, data.typeEn);
    elements.facts.innerHTML = [
      ['DISTANCE', data.distance],
      ['DIAMETER', data.diameter],
      ['ORBIT', data.orbit],
      ['DAY', data.day],
      ['MOONS', data.moons]
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    panel.dataset.planet = name;
    panel.hidden = false;
    void panel.offsetWidth;
    panel.classList.add('is-open');
  }

  function close() {
    if (panel.hidden) return;
    panel.classList.remove('is-open');
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true;
    }, 380);
  }

  function dismiss() {
    const globe = window.ShuikeEarth?.current?.globe;
    if (globe?.unfocus) globe.unfocus();
    else close();
  }

  document.addEventListener('shuike:planet-focus', event => open(event.detail?.name));
  document.addEventListener('shuike:planet-blur', () => close());

  panel.querySelectorAll('[data-planet-close], [data-planet-back]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      dismiss();
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    dismiss();
  });
})();
