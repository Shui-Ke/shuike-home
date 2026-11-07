/* =========================================================
   SHUIKE — PERSONAL DOSSIER interaction layer
   · language switch (ZH / EN)
   · scroll chapter + reading progress
   · reveal choreography
   · particle field + dot-matrix glyphs
   · Mingyun tap-to-bounce
   ========================================================= */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reduceMedia.matches;
  const TAU = Math.PI * 2;
  const INK = "#eee9de";
  const SIGNAL = "#d8c39a";
  const MUTED = "#91897c";
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* ---------------------------------------------------------
     Language
     --------------------------------------------------------- */

  const LANGUAGE = {
    zh: {
      title: "SHUIKE — 个人档案",
      description: "SHUIKE — 个人档案：界面设计、动态图形与前端实验。",
      documentLang: "zh-CN",
      groupLabel: "语言切换",
      zhLabel: "中文",
      enLabel: "English",
      brandLabel: "返回上一页",
      companionLabel: "点击 Mingyun，让她弹一下",
      companionStatus: "Mingyun 弹了一下。"
    },
    en: {
      title: "SHUIKE — Personal Dossier",
      description: "SHUIKE — personal dossier. Interface design, motion graphics and front-end experiments.",
      documentLang: "en",
      groupLabel: "Language",
      zhLabel: "Chinese",
      enLabel: "English",
      brandLabel: "Back to previous page",
      companionLabel: "Tap Mingyun to make her bounce",
      companionStatus: "Mingyun bounced."
    }
  };

  const langSwitch = $(".lang-switch");
  const languageButtons = $$("[data-set-lang]");
  const brand = $(".brand");
  const companionButton = $("[data-companion]");
  const companionStatus = $("[data-companion-status]");
  const metaDescription = $('meta[name="description"]');
  let currentLang = root.dataset.lang === "en" ? "en" : "zh";

  function refreshLanguageUI(lang) {
    const copy = LANGUAGE[lang];
    root.dataset.lang = lang;
    root.lang = copy.documentLang;
    document.title = copy.title;
    if (metaDescription) metaDescription.setAttribute("content", copy.description);
    if (langSwitch) langSwitch.setAttribute("aria-label", copy.groupLabel);
    if (brand) {
      const backLabel = brand.dataset[lang === "zh" ? "backLabelZh" : "backLabelEn"];
      brand.setAttribute("aria-label", backLabel || copy.brandLabel);
    }
    if (companionButton) companionButton.setAttribute("aria-label", copy.companionLabel);

    languageButtons.forEach((button) => {
      const isActive = button.dataset.setLang === lang;
      button.setAttribute("aria-pressed", String(isActive));
      const target = button.dataset.setLang === "zh" ? copy.zhLabel : copy.enLabel;
      button.setAttribute("aria-label", target);
      button.title = target;
    });

    // The chapter readout is assembled from data attributes and needs a refresh.
    if (typeof updateScrollState === "function") {
      requestAnimationFrame(() => updateScrollState(true));
    }
  }

  function saveLanguage(lang) {
    try {
      localStorage.setItem("shuike:dossier-lang", lang);
    } catch (_) {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(history.state, "", url.href);
    } catch (_) {}
  }

  function setLanguage(lang, options = {}) {
    if (lang !== "zh" && lang !== "en") return;
    currentLang = lang;
    refreshLanguageUI(lang);
    if (options.persist !== false) saveLanguage(lang);
    if (companionStatus) companionStatus.textContent = "";
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.setLang);
    });
  });

  refreshLanguageUI(currentLang);

  /* ---------------------------------------------------------
     Shared site theme (shuike:theme / light-dark)
     --------------------------------------------------------- */

  const THEME_KEY = "shuike:theme";
  const themeToggle = $("[data-theme-toggle]");
  const themeMeta = $('meta[name="theme-color"]');

  function syncThemeControl() {
    const light = root.dataset.theme === "light";
    if (themeMeta) themeMeta.setAttribute("content", light ? "#e9e9ec" : "#000000");
    if (!themeToggle) return;
    themeToggle.setAttribute("aria-pressed", String(light));
    themeToggle.setAttribute("aria-label", light ? "切换夜间模式" : "切换白天模式");
  }

  function applyTheme(value, persist) {
    if (value !== "light" && value !== "dark") return;
    root.dataset.theme = value;
    root.style.colorScheme = value === "light" ? "light" : "dark";
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, value);
      } catch (_) {}
    }
    syncThemeControl();
    document.dispatchEvent(new CustomEvent("shuike:theme-change", {
      detail: { theme: value, colorScheme: value === "light" ? "light" : "dark" }
    }));
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "light" ? "dark" : "light", true);
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY && (event.newValue === "light" || event.newValue === "dark")) {
      applyTheme(event.newValue, false);
    }
  });

  document.addEventListener("shuike:theme-change", syncThemeControl);
  syncThemeControl();

  /* ---------------------------------------------------------
     Selectable practice modules
     --------------------------------------------------------- */

  const moduleCards = $$(".modules .module");
  let selectedModule = null;

  function selectModule(card) {
    selectedModule = selectedModule === card ? null : card;
    moduleCards.forEach((item) => {
      const selected = item === selectedModule;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  }

  moduleCards.forEach((card) => {
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");
    card.addEventListener("click", () => selectModule(card));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectModule(card);
    });
  });

  /* ---------------------------------------------------------
     Scroll readout / chapter detection
     --------------------------------------------------------- */

  const sections = $$("[data-section]");
  const chapterReadout = $("[data-chapter-label]");
  const progressBar = $("[data-progress-bar]");
  const scrollMeterFill = $("[data-scroll-meter-fill]");
  const scrollPercent = $("[data-scroll-percent]");
  const masthead = $(".masthead");
  let scrollTicking = false;

  function activeSection() {
    if (!sections.length) return null;
    const probe = window.scrollY + window.innerHeight * 0.4;
    let current = sections[0];
    sections.forEach((section) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      if (top <= probe) current = section;
    });
    return current;
  }

  function updateScrollState(force = false) {
    const docHeight = document.documentElement.scrollHeight;
    const max = Math.max(1, docHeight - window.innerHeight);
    const y = Math.max(0, window.scrollY);
    const progress = Math.min(1, y / max);
    const percent = String(Math.round(progress * 100)).padStart(3, "0");

    if (progressBar) progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (scrollMeterFill) scrollMeterFill.style.transform = `scaleY(${progress.toFixed(4)})`;
    if (scrollPercent) scrollPercent.textContent = percent;
    if (masthead) masthead.classList.toggle("is-scrolled", y > 8);

    const section = activeSection();
    if (section && chapterReadout) {
      const chapter = section.dataset.chapter || "00";
      const name = currentLang === "en" ? section.dataset.nameEn : section.dataset.nameZh;
      const label = `${chapter} / ${name || ""}`.trim();
      if (force || chapterReadout.textContent !== label) chapterReadout.textContent = label;
    }

    scrollTicking = false;
  }

  function requestScrollState() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollState);
  }

  window.addEventListener("scroll", requestScrollState, { passive: true });
  window.addEventListener("resize", requestScrollState);
  window.addEventListener("pageshow", requestScrollState);
  requestScrollState();

  /* ---------------------------------------------------------
     Typographic entrances
     --------------------------------------------------------- */

  const lineTargets = [];
  const typeTargets = $$("[data-typewriter]");
  const activeTypewriters = new Map();

  function prepareLineSweep(element) {
    if (!element || element.dataset.lineSweep) return;
    const inner = document.createElement("span");
    inner.className = "line-sweep__inner";
    while (element.firstChild) inner.appendChild(element.firstChild);
    const line = document.createElement("span");
    line.className = "line-sweep__line";
    line.setAttribute("aria-hidden", "true");
    element.append(inner, line);
    element.classList.add("line-sweep");
    element.dataset.lineSweep = "1";
    lineTargets.push(element);
  }

  function collectVisibleTextNodes(root) {
    const nodes = [];
    if (!root) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue || "";
      let parent = node.parentElement;
      let hidden = !value.trim();
      while (parent && !hidden) {
        if (parent.getAttribute?.("aria-hidden") === "true") hidden = true;
        if (getComputedStyle(parent).display === "none") hidden = true;
        if (parent === root) break;
        parent = parent.parentElement;
      }
      if (!hidden) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  function finishTypewriter(element, restore = true) {
    const record = activeTypewriters.get(element);
    if (!record) return;
    window.clearTimeout(record.timer);
    if (restore) {
      record.nodes.forEach((node, index) => {
        node.nodeValue = record.originals[index];
      });
    }
    record.cursor.remove();
    element.removeAttribute("aria-label");
    element.classList.remove("is-typing");
    element.classList.add("is-typed");
    activeTypewriters.delete(element);
  }

  function startTypewriter(element) {
    if (reducedMotion || element.dataset.typingStarted || activeTypewriters.has(element)) return;
    const nodes = collectVisibleTextNodes(element);
    if (!nodes.length) return;

    element.dataset.typingStarted = "1";
    const originals = nodes.map((node) => node.nodeValue);
    const fullText = originals.join("").replace(/\s+/g, " ").trim();
    const cursor = document.createElement("span");
    cursor.className = "type-cursor";
    cursor.setAttribute("aria-hidden", "true");

    nodes.forEach((node) => { node.nodeValue = ""; });
    element.classList.add("is-typing");
    element.setAttribute("aria-label", fullText);

    const segments = nodes.map((node, index) => ({
      node,
      chars: Array.from(originals[index])
    }));
    const total = segments.reduce((sum, segment) => sum + segment.chars.length, 0);
    const delay = total > 150 ? 11 : total > 80 ? 15 : 22;
    let segmentIndex = 0;
    let charIndex = 0;
    let timer = 0;

    const placeCursor = (node) => {
      if (!node.parentElement) return;
      if (cursor.parentNode) cursor.remove();
      node.parentElement.insertBefore(cursor, node.nextSibling);
    };

    const finish = () => finishTypewriter(element, false);
    const step = () => {
      const segment = segments[segmentIndex];
      if (!segment) {
        cursor.remove();
        element.removeAttribute("aria-label");
        element.classList.remove("is-typing");
        element.classList.add("is-typed");
        activeTypewriters.delete(element);
        return;
      }

      const count = Math.min(segment.chars.length, charIndex + 1);
      segment.node.nodeValue = segment.chars.slice(0, count).join("");
      charIndex = count;
      placeCursor(segment.node);

      if (charIndex >= segment.chars.length) {
        segmentIndex += 1;
        charIndex = 0;
      }

      if (segmentIndex >= segments.length) {
        timer = window.setTimeout(() => {
          cursor.remove();
          element.removeAttribute("aria-label");
          element.classList.remove("is-typing");
          element.classList.add("is-typed");
          activeTypewriters.delete(element);
        }, 420);
        return;
      }

      timer = window.setTimeout(step, delay);
    };

    placeCursor(segments[0].node);
    activeTypewriters.set(element, { nodes, originals, cursor, timer, finish });
    timer = window.setTimeout(step, 90);
  }

  if (!reducedMotion) {
    $$([".hero__title", ".display-title", ".contact__main h2"].join(", ")).forEach(prepareLineSweep);
  }

  /* ---------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------- */

  const revealItems = $$("[data-reveal]");

  if ("IntersectionObserver" in window && !reducedMotion) {
    root.classList.add("reveal-armed");
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    }, {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.07
    });
    revealItems.forEach((item) => revealObserver.observe(item));

    const textTargets = [...new Set([...lineTargets, ...typeTargets])];
    const textObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        if (element.classList.contains("line-sweep")) {
          element.classList.add("is-text-revealed");
        }
        if (element.hasAttribute("data-typewriter")) {
          startTypewriter(element);
        }
        textObserver.unobserve(element);
      });
    }, {
      rootMargin: "0px 0px 0px 0px",
      threshold: 0.01
    });
    textTargets.forEach((item) => textObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-revealed"));
    lineTargets.forEach((item) => item.classList.add("is-text-revealed"));
  }

  const modulesBlock = $(".modules");
  if (modulesBlock) {
    if ("IntersectionObserver" in window && !reducedMotion) {
      const modulesObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          // Toggle instead of unobserving, so leaving and coming back
          // replays the right-side deal-in.
          modulesBlock.classList.toggle("is-stacked-in", entry.isIntersecting);
        });
      }, {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.1
      });
      modulesObserver.observe(modulesBlock);
    } else {
      modulesBlock.classList.add("is-stacked-in");
    }
  }

  // The clipped window is only a few pixels wide while closed, so an
  // IntersectionObserver can never see 35% of it. Measure the unclipped box
  // on scroll instead, and open once a third of the window is in view.
  const windowOpeners = $$(".window-open-center, .window-open-left");
  let windowOpenFrame = 0;
  let windowOpenArmed = reducedMotion;

  windowOpeners.forEach((element) => {
    const lines = element.classList.contains("window-open-center")
      ? ["left", "right"]
      : ["sweep"];
    lines.forEach((name) => {
      const line = document.createElement("span");
      line.className = `window-edge-line window-edge-line--${name}`;
      line.setAttribute("aria-hidden", "true");
      element.appendChild(line);
    });
  });

  function updateWindowOpeners() {
    windowOpenFrame = 0;
    if (!windowOpenArmed || !windowOpeners.length) return;
    const viewport = window.innerHeight;
    windowOpeners.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const revealed = element.classList.contains("is-window-revealed");

      // Fully out of the viewport: re-arm the window so the opening plays
      // again when the user scrolls back to it.
      if (revealed) {
        if (rect.bottom < -80 || rect.top > viewport + 80) {
          element.classList.remove("is-window-revealed");
        }
        return;
      }

      const visible = Math.max(0, Math.min(rect.bottom, viewport) - Math.max(rect.top, 0));
      const ratio = visible / Math.max(1, Math.min(rect.height, viewport));
      if (ratio >= 0.35) element.classList.add("is-window-revealed");
    });
  }

  function requestWindowOpenCheck() {
    if (windowOpenFrame) return;
    windowOpenFrame = window.requestAnimationFrame(updateWindowOpeners);
  }

  if (windowOpeners.length) {
    if (reducedMotion) {
      windowOpeners.forEach((element) => element.classList.add("is-window-revealed"));
    } else {
      window.addEventListener("scroll", requestWindowOpenCheck, { passive: true });
      window.addEventListener("resize", requestWindowOpenCheck, { passive: true });
      // Give the closed gold line a beat to be read before the first
      // in-view window unfolds. Without this, the hero window was already
      // open before the page had finished establishing itself.
      window.setTimeout(() => {
        windowOpenArmed = true;
        updateWindowOpeners();
      }, 900);
    }
  }

  reduceMedia.addEventListener?.("change", (event) => {
    if (event.matches) {
      revealItems.forEach((item) => item.classList.add("is-revealed"));
      lineTargets.forEach((item) => item.classList.add("is-text-revealed"));
      if (modulesBlock) modulesBlock.classList.add("is-stacked-in");
      windowOpeners.forEach((item) => item.classList.add("is-window-revealed"));
      activeTypewriters.forEach((record, element) => finishTypewriter(element, true));
    }
  });

  /* ---------------------------------------------------------
     Clock
     --------------------------------------------------------- */

  const clockNodes = $$("[data-clock]");
  const yearNodes = $$("[data-year]");
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  function updateClock() {
    const now = new Date();
    const time = timeFormatter.format(now);
    clockNodes.forEach((node) => { node.textContent = time; });
    yearNodes.forEach((node) => { node.textContent = String(now.getFullYear()); });
  }

  updateClock();
  window.setInterval(updateClock, 1000);

  /* ---------------------------------------------------------
     Shared pointer spotlight on technical windows
     --------------------------------------------------------- */

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".tech-window").forEach((windowElement) => {
      let moveFrame = 0;
      let pointerX = 70;
      let pointerY = 0;

      windowElement.addEventListener("pointermove", (event) => {
        const rect = windowElement.getBoundingClientRect();
        pointerX = ((event.clientX - rect.left) / rect.width) * 100;
        pointerY = ((event.clientY - rect.top) / rect.height) * 100;
        if (moveFrame) return;
        moveFrame = requestAnimationFrame(() => {
          windowElement.style.setProperty("--mx", pointerX.toFixed(2) + "%");
          windowElement.style.setProperty("--my", pointerY.toFixed(2) + "%");
          moveFrame = 0;
        });
      });

      windowElement.addEventListener("pointerleave", () => {
        if (moveFrame) cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        windowElement.style.removeProperty("--mx");
        windowElement.style.removeProperty("--my");
      });
    });
  }

  /* ---------------------------------------------------------
     Mingyun — tap to pop
     --------------------------------------------------------- */

  const companion = $(".companion");
  const companionArt = $(".companion__art", companion || document);
  const companionPulse = $(".companion__pulse", companion || document);
  let bounceAnimation = null;
  let pulseTimer = 0;
  let statusTimer = 0;

  function announceCompanion() {
    if (!companionStatus) return;
    window.clearTimeout(statusTimer);
    companionStatus.textContent = "";
    statusTimer = window.setTimeout(() => {
      companionStatus.textContent = LANGUAGE[currentLang].companionStatus;
    }, 30);
  }

  function popCompanion() {
    if (!companionArt || !companion) return;

    if (bounceAnimation) {
      try { bounceAnimation.cancel(); } catch (_) {}
      bounceAnimation = null;
    }

    announceCompanion();

    if (reducedMotion) {
      companion.classList.remove("is-poked");
      void companion.offsetWidth;
      companion.classList.add("is-poked");
      window.setTimeout(() => companion.classList.remove("is-poked"), 600);
      return;
    }

    const lift = window.innerWidth <= 720 ? 20 : 36;
    if (typeof companionArt.animate === "function") {
      bounceAnimation = companionArt.animate([
        { transform: "translate3d(0, 0, 0) scale(1, 1)", offset: 0 },
        { transform: "translate3d(0, 9px, 0) scale(1.08, .91)", offset: .12 },
        { transform: `translate3d(0, -${lift}px, 0) scale(.955, 1.055)`, offset: .31 },
        { transform: "translate3d(0, 0, 0) scale(1.03, .97)", offset: .53 },
        { transform: "translate3d(0, -7px, 0) scale(.992, 1.008)", offset: .69 },
        { transform: "translate3d(0, 0, 0) scale(1.007, .993)", offset: .84 },
        { transform: "translate3d(0, 0, 0) scale(1, 1)", offset: 1 }
      ], {
        duration: 900,
        easing: "linear"
      });
      bounceAnimation.addEventListener("finish", () => { bounceAnimation = null; });
    }

    if (companionPulse) {
      window.clearTimeout(pulseTimer);
      companionPulse.classList.remove("is-active");
      void companionPulse.offsetWidth;
      companionPulse.classList.add("is-active");
      pulseTimer = window.setTimeout(() => {
        companionPulse.classList.remove("is-active");
      }, 900);
    }
  }

  companionButton?.addEventListener("click", popCompanion);

  /* ---------------------------------------------------------
     Canvas particles + dot-matrix glyphs
     --------------------------------------------------------- */

  function createDust(canvas) {
    if (!canvas) return { draw() {}, resize() {} };
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return { draw() {}, resize() {} };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    const pointer = { x: .5, y: .5, targetX: .5, targetY: .5 };

    function makePoints() {
      const count = width < 640 ? 32 : width < 1080 ? 58 : 88;
      points = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: .2 + Math.random() * .8,
        size: Math.random() < .13 ? 1.5 : 1,
        speed: .2 + Math.random() * .7,
        drift: 3 + Math.random() * 15,
        phase: Math.random() * TAU,
        rate: .12 + Math.random() * .42,
        accent: Math.random() < .065,
        alpha: .12 + Math.random() * .34
      }));
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      makePoints();
    }

    function draw(time) {
      if (!width || !height) return;
      const t = reducedMotion ? 0 : time * .001;
      ctx.clearRect(0, 0, width, height);
      pointer.x += (pointer.targetX - pointer.x) * .045;
      pointer.y += (pointer.targetY - pointer.y) * .045;

      for (const point of points) {
        const travel = ((point.y - t * point.speed * 14) % (height + 36) + height + 36) % (height + 36);
        const x = point.x
          + Math.sin(t * point.rate + point.phase) * point.drift
          + (pointer.x - .5) * point.z * 17;
        const y = travel - 18;
        const twinkle = .6 + Math.sin(t * (.5 + point.rate) + point.phase) * .4;
        ctx.globalAlpha = Math.max(0, point.alpha * twinkle);
        ctx.fillStyle = point.accent ? SIGNAL : INK;
        ctx.fillRect(x, y, point.size, point.size);
      }
      ctx.globalAlpha = 1;
    }

    const onPointerMove = (event) => {
      pointer.targetX = event.clientX / Math.max(1, window.innerWidth);
      pointer.targetY = event.clientY / Math.max(1, window.innerHeight);
    };
    if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    resize();
    draw(0);

    return { draw, resize };
  }

  /* ---------- Dot-matrix drawing primitives ---------- */

  function dot(ctx, x, y, radius, alpha, color = INK) {
    if (alpha <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(.32, radius), 0, TAU);
    ctx.fill();
  }

  function cross(ctx, x, y, size, alpha, color = SIGNAL) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x - size, y, size * 2, .8);
    ctx.fillRect(x, y - size, .8, size * 2);
  }

  function drawSeal(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5;
    const cy = h * .5;
    const min = Math.min(w, h);
    const ringRadius = min * .43;

    // Two offset target rings, broken by calibration gaps.
    for (let ring = 0; ring < 2; ring++) {
      const radius = ringRadius - ring * 9;
      const count = 96;
      const rotation = t * .045 * (ring ? -1.4 : 1);
      for (let i = 0; i < count; i++) {
        if (i % 11 === 0) continue;
        const angle = (i / count) * TAU + rotation;
        const tick = i % 8 === 0 ? 2.4 : 0;
        const x = cx + Math.cos(angle) * (radius + tick);
        const y = cy + Math.sin(angle) * (radius + tick);
        const accent = i === 5 || i === 53;
        dot(ctx, x, y, accent ? 1.5 : .75, accent ? .92 : .2 + ring * .06, accent ? SIGNAL : INK);
      }
    }

    // A slowly rotating acquisition arc.
    const arcStart = t * .16;
    for (let i = 0; i < 22; i++) {
      const angle = arcStart + i * .026;
      const alpha = .05 + (i / 22) * .5;
      dot(
        ctx,
        cx + Math.cos(angle) * ringRadius,
        cy + Math.sin(angle) * ringRadius,
        i > 17 ? 1.35 : .8,
        alpha,
        SIGNAL
      );
    }

    // Cardinal registration crosses.
    cross(ctx, cx, cy - ringRadius - 8, 3, .36);
    cross(ctx, cx, cy + ringRadius + 8, 3, .2);
    cross(ctx, cx - ringRadius - 8, cy, 3, .2);
    cross(ctx, cx + ringRadius + 8, cy, 3, .36);

    // The GM monogram, sampled into particles.
    const markWidth = Math.min(w * .69, h * .9);
    const scale = markWidth / 180;
    const ox = cx - 90 * scale;
    const oy = cy - 66 * scale;
    const spacing = 3.6;
    const shapes = [
      { x: 25, y: 16, w: 18, h: 100 },
      { x: 53, y: 64, w: 18, h: 52 },
      { x: 81, y: 16, w: 18, h: 100 },
      { x: 109, y: 16, w: 18, h: 58 },
      { x: 137, y: 16, w: 18, h: 100 },
      { x: 25, y: 16, w: 28, h: 8 },
      { x: 55, y: 64, w: 16, h: 8 },
      { x: 25, y: 108, w: 46, h: 8 },
      { x: 81, y: 16, w: 74, h: 8 }
    ];
    let index = 0;

    for (const shape of shapes) {
      for (let y = shape.y + 1.4; y < shape.y + shape.h; y += spacing) {
        for (let x = shape.x + 1.2; x < shape.x + shape.w; x += spacing) {
          index++;
          const isAccent = index % 41 === 0 || (shape.h === 8 && index % 17 === 0);
          const jitterX = Math.sin(t * .55 + index * .92) * .5;
          const jitterY = Math.cos(t * .48 + index * .63) * .5;
          const alpha = isAccent ? .9 : .26 + (Math.sin(index * 1.73) + 1) * .11;
          const radius = isAccent ? 1.3 : .72 + (index % 5 === 0 ? .15 : 0);
          dot(
            ctx,
            ox + x * scale + jitterX,
            oy + y * scale + jitterY,
            radius,
            alpha,
            isAccent ? SIGNAL : INK
          );
        }
      }
    }

    // A final hairline below the mark.
    const baseY = oy + 119 * scale;
    for (let x = 25; x <= 155; x += 4.4) {
      dot(ctx, ox + x * scale, baseY, .45, .18);
    }

    ctx.globalAlpha = 1;
  }

  function drawCube(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5;
    const cy = h * .51;
    const scale = Math.min(w, h) * .285;
    const yaw = -.62 + Math.sin(t * .16) * .22;
    const pitch = .54;

    function project(x, y, z) {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
      return {
        x: cx + x1 * scale,
        y: cy + y1 * scale,
        z: z2
      };
    }

    const vertices = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          vertices.push({ coords: [x, y, z], ...project(x, y, z) });
        }
      }
    }

    const edges = [
      [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
      [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
    ];
    const stepCount = 11;

    edges.forEach((edge, edgeIndex) => {
      const a = vertices[edge[0]];
      const b = vertices[edge[1]];
      for (let i = 0; i <= stepCount; i++) {
        const f = i / stepCount;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const depth = (a.z + b.z) * .5;
        const alpha = .25 + (depth + 1.5) * .1;
        const active = (i + edgeIndex * 3) % 37 === 0;
        dot(ctx, x, y, active ? 1.45 : .86, active ? .95 : alpha, active ? SIGNAL : INK);
      }
    });

    vertices.forEach((vertex, index) => {
      const active = index === 3 || index === 6;
      dot(ctx, vertex.x, vertex.y, active ? 1.8 : 1.1, active ? .95 : .42, active ? SIGNAL : INK);
    });

    // Horizon registration marks.
    cross(ctx, 12, h - 13, 2.6, .18);
    cross(ctx, w - 12, 13, 2.6, .18);
    ctx.globalAlpha = 1;
  }

  const ellipseRings = [
    { radiusX: .83, radiusY: .27, rotation: -.38, speed: .13, alpha: .29 },
    { radiusX: .62, radiusY: .5, rotation: .62, speed: -.18, alpha: .34 },
    { radiusX: .42, radiusY: .4, rotation: .12, speed: .24, alpha: .44 }
  ];

  function drawOrbit(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5;
    const cy = h * .5;
    const base = Math.min(w, h) * .42;

    ellipseRings.forEach((ring, ringIndex) => {
      const count = 68;
      for (let i = 0; i < count; i++) {
        if (i % 9 === 0) continue;
        const angle = (i / count) * TAU + t * ring.speed;
        const x = Math.cos(angle) * base * ring.radiusX;
        const y = Math.sin(angle) * base * ring.radiusY;
        const rx = x * Math.cos(ring.rotation) - y * Math.sin(ring.rotation);
        const ry = x * Math.sin(ring.rotation) + y * Math.cos(ring.rotation);
        const active = i % 23 === 0;
        dot(
          ctx,
          cx + rx,
          cy + ry,
          active ? 1.2 : .7,
          active ? .72 : ring.alpha,
          active ? SIGNAL : INK
        );
      }

      // One bright satellite with a short dotted trail.
      const headAngle = t * (.7 + ringIndex * .13) + ringIndex * 2.1;
      for (let i = 0; i < 10; i++) {
        const angle = headAngle - i * .055;
        const x = Math.cos(angle) * base * ring.radiusX;
        const y = Math.sin(angle) * base * ring.radiusY;
        const rx = x * Math.cos(ring.rotation) - y * Math.sin(ring.rotation);
        const ry = x * Math.sin(ring.rotation) + y * Math.cos(ring.rotation);
        dot(ctx, cx + rx, cy + ry, i === 0 ? 1.7 : .75, (1 - i / 10) * .82, SIGNAL);
      }
    });

    dot(ctx, cx, cy, 2.2, .9, SIGNAL);
    dot(ctx, cx, cy, 5.5, .18, SIGNAL);
    ctx.globalAlpha = 1;
  }

  function drawBrackets(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const pointsFor = (coords) => coords.map(([x, y]) => ({ x: x * w, y: y * h }));
    const paths = [
      pointsFor([[.34, .26], [.16, .5], [.34, .74]]),
      pointsFor([[.66, .26], [.84, .5], [.66, .74]])
    ];
    const slash = pointsFor([[.57, .22], [.43, .78]]);

    function samplePath(points, gap, drawPoint) {
      let index = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        const steps = Math.max(2, Math.round(length / gap));
        for (let step = 0; step <= steps; step++) {
          const f = step / steps;
          drawPoint(a.x + dx * f, a.y + dy * f, index++);
        }
      }
    }

    paths.forEach((path) => {
      samplePath(path, 6.3, (x, y, index) => {
        const active = index % 13 === 0;
        dot(ctx, x, y, active ? 1.4 : .85, active ? .9 : .34, active ? SIGNAL : INK);
      });
    });

    samplePath(slash, 5.6, (x, y, index) => {
      dot(ctx, x, y, .85, .34 + (Math.sin(index * .7 + t * 1.4) + 1) * .1, INK);
    });

    const sweep = (t * .34) % 1;
    const liveY = h * (.2 + sweep * .66);
    dot(ctx, w * .5, liveY, 1.5, .7, SIGNAL);
    ctx.globalAlpha = .25;
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(w * .17, liveY, w * .66, .6);

    cross(ctx, 13, 13, 2.5, .2);
    cross(ctx, 13, h - 13, 2.5, .2);
    ctx.globalAlpha = 1;
  }

  function drawSignal(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cy = h * .5;
    const scanX = ((t * .085) % 1.15) * (w + 30) - 15;

    // Fine horizontal measurement lines.
    for (let y = 8; y < h - 6; y += 9) {
      dot(ctx, 8, y, .45, .08);
      dot(ctx, w - 8, y, .45, .08);
    }

    for (let line = 0; line < 3; line++) {
      for (let x = 9; x < w - 8; x += 3.8) {
        const phase = x / w;
        const envelope = Math.pow(Math.sin(Math.PI * phase), .72);
        const wave = Math.sin(x * .057 + t * (.7 - line * .17) + line * 1.8);
        const y = cy + wave * (h * .23) * envelope * (1 - line * .17);
        const nearScan = Math.abs(x - scanX) < 26;
        const alpha = (.25 + line * .03) * envelope + (nearScan ? .28 : 0);
        dot(
          ctx,
          x,
          y,
          nearScan ? 1.2 : .74,
          alpha,
          nearScan || (line === 1 && x % 38 < 4) ? SIGNAL : INK
        );
      }
    }

    // Dotted scan head.
    for (let y = 11; y < h - 8; y += 7.5) {
      dot(ctx, scanX, y, .6, .22 + (y / h) * .3, SIGNAL);
    }

    // Baseline ticks.
    for (let x = 10; x < w - 8; x += 17) {
      dot(ctx, x, h - 10, .55, x % 51 < 3 ? .5 : .12, x % 51 < 3 ? SIGNAL : INK);
    }

    ctx.globalAlpha = 1;
  }

  function drawLayers(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5;
    const layerCount = 4;
    const cols = 9;
    const rows = 5;
    const planeW = w * .62;
    const planeD = h * .2;
    const yFor = layer => h * .29 + layer * h * .135 + Math.sin(t * .6 + layer * .9) * 1.4;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

    for (let layer = 0; layer < layerCount; layer++) {
      const yBase = yFor(layer);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const u = (col / (cols - 1) - .5) * planeW;
          const v = (row / (rows - 1) - .5) * planeD;
          const x = cx + u + v * .55;
          const y = yBase + v * .45;
          const active = (col + row * 3 + layer * 5) % 19 === 0;
          dot(ctx, x, y, active ? 1.25 : .62, .13 + layer * .035 + (active ? .35 : 0), active ? SIGNAL : INK);
        }
      }

      corners.forEach(([sx, sy]) => {
        const u = sx * planeW * .5;
        const v = sy * planeD * .5;
        const x = cx + u + v * .55;
        const y = yBase + v * .45;
        dot(ctx, x, y, 1.1, .34, SIGNAL);
        if (layer < layerCount - 1) {
          const nextY = yFor(layer + 1) + v * .45;
          for (let step = 1; step < 4; step++) {
            dot(ctx, x, y + (nextY - y) * step / 4, .55, .14, INK);
          }
        }
      });
    }

    // A live plane brightens as it passes through the stack.
    const scan = (t * .22) % 1;
    const scanLayer = Math.min(layerCount - 1, Math.floor(scan * layerCount));
    const scanY = yFor(scanLayer);
    for (let x = w * .18; x < w * .82; x += 4.2) {
      const v = Math.sin((x / w) * Math.PI) * planeD * .22;
      dot(ctx, x, scanY + v, .65, .22, SIGNAL);
    }

    cross(ctx, 12, h - 13, 2.6, .18);
    cross(ctx, w - 12, 13, 2.6, .18);
    ctx.globalAlpha = 1;
  }

  function drawNeural(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const layers = [4, 5, 3];
    const xs = [w * .2, w * .5, w * .8];
    const nodes = layers.map((count, layerIndex) => Array.from({ length: count }, (_, index) => ({
      x: xs[layerIndex],
      y: h * (.18 + .64 * (index + .5) / count)
    })));

    nodes.forEach((layer, layerIndex) => {
      if (layerIndex >= nodes.length - 1) return;
      layer.forEach((from, fromIndex) => {
        nodes[layerIndex + 1].forEach((to, toIndex) => {
          const seed = fromIndex * 3 + toIndex * 5 + layerIndex * 11;
          for (let step = 0; step <= 10; step++) {
            const f = step / 10;
            const x = from.x + (to.x - from.x) * f;
            const y = from.y + (to.y - from.y) * f;
            const shimmer = .5 + .5 * Math.sin(t * 1.1 + seed + step * .7);
            dot(ctx, x, y, .48, .07 + shimmer * .045 * (1 - Math.abs(f - .5)), INK);
          }
          if (seed % 4 === 0) {
            const p = (t * .24 + seed * .071) % 1;
            dot(ctx, from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, 1.2, .7, SIGNAL);
          }
        });
      });
    });

    nodes.forEach((layer, layerIndex) => {
      layer.forEach((node, nodeIndex) => {
        const pulse = .45 + .45 * (.5 + .5 * Math.sin(t * 1.4 + layerIndex * .9 + nodeIndex * .7));
        dot(ctx, node.x, node.y, 4.8, .12, SIGNAL);
        dot(ctx, node.x, node.y, 1.7, pulse, SIGNAL);
      });
    });

    for (let x = w * .2; x < w * .8; x += 9) {
      dot(ctx, x, h - 13, .55, .12, INK);
    }
    cross(ctx, 13, 13, 2.5, .2);
    ctx.globalAlpha = 1;
  }

  function drawWaves(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cy = h * .5;
    const waves = [
      { amp: .3, freq: 1.8, speed: .42, phase: 0, tone: SIGNAL, alpha: .11 },
      { amp: .2, freq: 2.9, speed: -.34, phase: Math.PI * .5, tone: SIGNAL, alpha: .085 },
      { amp: .36, freq: 1.2, speed: .24, phase: Math.PI, tone: INK, alpha: .065 }
    ];

    // Overlapping translucent sine / cosine fields.
    ctx.globalCompositeOperation = "lighter";
    waves.forEach(wave => {
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x <= w; x += 2.5) {
        const y = cy + Math.sin((x / w) * Math.PI * 2 * wave.freq + t * wave.speed + wave.phase) * h * wave.amp;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = wave.tone;
      ctx.lineWidth = .8;
      ctx.globalAlpha = Math.min(.32, wave.alpha * 2.6);
      ctx.stroke();
      ctx.lineTo(w, cy);
      ctx.closePath();
      ctx.globalAlpha = wave.alpha;
      ctx.fillStyle = wave.tone;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Dotted graph lines on top.
    waves.forEach((wave, waveIndex) => {
      for (let x = 3; x < w - 3; x += 2.4) {
        const y = cy + Math.sin((x / w) * Math.PI * 2 * wave.freq + t * wave.speed + wave.phase) * h * wave.amp;
        const active = (Math.round(x / 2.4) + waveIndex * 9) % 29 === 0;
        const edge = Math.pow(Math.sin(Math.PI * x / w), .35);
        dot(ctx, x, y, active ? 1.3 : .58, (active ? .9 : .32) * edge, active ? SIGNAL : INK);
      }
    });

    ctx.globalAlpha = .2;
    ctx.fillStyle = INK;
    ctx.fillRect(0, cy, w, 1);
    ctx.globalAlpha = 1;
    for (let x = 6; x < w - 5; x += 13) {
      dot(ctx, x, cy, .45, .12, INK);
    }
    for (const row of [0, 1, 2, 3, 4]) {
      const y = h * (.2 + row * .15);
      ctx.globalAlpha = .07;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;
    cross(ctx, 12, h - 13, 2.6, .18);
    cross(ctx, w - 12, 13, 2.6, .18);
    ctx.globalAlpha = 1;
  }

  function drawSpiral(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5;
    const cy = h * .5;
    const base = Math.min(w, h) * .43;
    const turns = 3.4;
    const count = 280;

    // Two interlaced spirals, one faint counter-rotation for depth.
    for (let i = 0; i < count; i++) {
      const p = i / (count - 1);
      const radius = base * Math.pow(p, .78);
      const angle = p * Math.PI * 2 * turns + t * .32;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * .78;
      const active = i % 37 === 0;
      dot(ctx, x, y, active ? 1.25 : .58, .12 + p * .5 + (active ? .3 : 0), active ? SIGNAL : INK);
    }

    for (let i = 0; i < count * .55; i++) {
      const p = i / (count * .55 - 1);
      const radius = base * Math.pow(p, .8);
      const angle = p * Math.PI * 2 * (turns - .4) - t * .2 + Math.PI;
      dot(ctx, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * .78, .5, .14 + p * .22, INK);
    }

    // A pulse travelling outwards through the spiral.
    const pulse = (t * .28) % 1;
    const pulseRadius = base * Math.pow(pulse, .78);
    const pulseAngle = pulse * Math.PI * 2 * turns + t * .32;
    dot(ctx, cx + Math.cos(pulseAngle) * pulseRadius, cy + Math.sin(pulseAngle) * pulseRadius * .78, 1.7, .85, SIGNAL);

    const core = .55 + .25 * Math.sin(t * 1.6);
    dot(ctx, cx, cy, 3.4, core, SIGNAL);
    dot(ctx, cx, cy, 7, .12, SIGNAL);
    cross(ctx, 13, 13, 2.5, .2);
    cross(ctx, w - 13, h - 13, 2.5, .2);
    ctx.globalAlpha = 1;
  }

  const glyphDrawers = {
    seal: drawSeal,
    cube: drawCube,
    orbit: drawOrbit,
    brackets: drawBrackets,
    signal: drawSignal,
    layers: drawLayers,
    neural: drawNeural,
    waves: drawWaves,
    spiral: drawSpiral
  };

  function createGlyph(canvas) {
    const name = canvas.dataset.glyph;
    const drawGlyph = glyphDrawers[name];
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx || !drawGlyph) return null;

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.max(1, Math.round(width * dpr));
      const targetHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    }

    function draw(time) {
      if (!width || !height) return;
      drawGlyph(ctx, width, height, reducedMotion ? 0 : time * .001);
    }

    resize();
    return { canvas, resize, draw };
  }

  const dust = createDust($("#dust-field"));
  const glyphs = $$("canvas[data-glyph]").map(createGlyph).filter(Boolean);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      dust.resize();
      glyphs.forEach((glyph) => glyph.resize());
    });
    glyphs.forEach((glyph) => resizeObserver.observe(glyph.canvas));
  } else {
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        dust.resize();
        glyphs.forEach((glyph) => glyph.resize());
      }, 100);
    });
  }

  let animationFrame = 0;
  let lastGlyphTime = 0;

  function renderLoop(now) {
    dust.draw(now);
    if (now - lastGlyphTime > 1000 / 24) {
      glyphs.forEach((glyph) => glyph.draw(now));
      lastGlyphTime = now;
    }
    animationFrame = requestAnimationFrame(renderLoop);
  }

  function startCanvasMotion() {
    if (reducedMotion || animationFrame) return;
    animationFrame = requestAnimationFrame(renderLoop);
  }

  function stopCanvasMotion() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function renderCanvasStill() {
    dust.draw(0);
    glyphs.forEach((glyph) => glyph.draw(0));
  }

  if (reducedMotion) {
    renderCanvasStill();
  } else {
    startCanvasMotion();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopCanvasMotion();
    } else if (!reducedMotion) {
      startCanvasMotion();
    }
  });

  reduceMedia.addEventListener?.("change", (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      stopCanvasMotion();
      renderCanvasStill();
    } else {
      startCanvasMotion();
    }
  });

  // Make sure a late font load cannot leave the chapter / progress readouts stale.
  if (document.fonts?.ready) {
    document.fonts.ready.then(requestScrollState).catch(() => {});
  }

  // Expose a tiny read-only debug surface, matching the rest of the site.
  window.ShuikeDossier = Object.freeze({
    setLanguage: (lang) => setLanguage(lang),
    pulseCompanion: popCompanion,
    get language() { return currentLang; },
    get reducedMotion() { return reducedMotion; }
  });
})();
