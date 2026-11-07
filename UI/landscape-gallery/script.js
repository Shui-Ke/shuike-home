(function () {
  "use strict";

  const data = Array.isArray(window.LANDSCAPE_GALLERY) ? window.LANDSCAPE_GALLERY : [];
  const gallery = document.querySelector("[data-gallery]");
  const viewport = document.querySelector("[data-viewport]");
  const track = document.querySelector("[data-track]");
  const currentLabel = document.querySelector("[data-current]");
  const totalLabel = document.querySelector("[data-total]");

  if (!gallery || !viewport || !track || data.length === 0) {
    return;
  }

  const total = data.length;
  // Optional relative directory supports embedding without changing the standalone demo.
  const IMAGE_DIR = gallery.dataset.imageDir || "images/";
  const textless = gallery.dataset.textless === "true";
  const AUTO_DELAY = 5000;
  const RESUME_DELAY = 3400;
  const AUTO_DURATION = 880;
  const MANUAL_DURATION = 660;
  const SNAP_DURATION = 420;
  const FAST_FLICK = 0.52;
  const MIN_FLICK_DISTANCE = 16;
  const DRAG_THRESHOLD = 0.23;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = motionQuery.matches;
  let autoEnabled = !reduceMotion;

  let index = 1;
  let width = 0;
  let isAnimating = false;
  let animationTarget = null;
  let animationSource = "auto";
  let transitionTimer = null;
  let autoTimer = null;
  let pointer = null;

  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function normalizePosition(position) {
    return ((position - 1 + total) % total) + 1;
  }

  function realIndexFromPosition(position) {
    return normalizePosition(position) - 1;
  }

  function translateFor(position) {
    return "translate3d(" + (-position * width) + "px, 0, 0)";
  }

  /* Build the loop: [clone last] [all real slides] [clone first]. */
  const slides = [];
  const allItems = [data[total - 1], ...data, data[0]];

  allItems.forEach((item, position) => {
    const isClone = position === 0 || position === total + 1;
    const realNumber = realIndexFromPosition(position) + 1;
    const slide = document.createElement("figure");

    slide.className = "slide";
    slide.dataset.position = String(position);
    slide.style.setProperty("--slide-accent", item.accent || "#2a2722");
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", realNumber + " / " + total);

    if (isClone) {
      slide.setAttribute("aria-hidden", "true");
    }

    const image = document.createElement("img");
    image.className = "slide__image";
    image.src = IMAGE_DIR + item.file;
    image.alt = isClone ? "" : item.alt || item.title;
    image.loading = "eager";
    image.decoding = "async";
    image.draggable = false;

    const reveal = () => image.classList.add("is-loaded");
    if (image.complete && image.naturalWidth > 0) {
      reveal();
    } else {
      image.addEventListener("load", reveal, { once: true });
      image.addEventListener("error", reveal, { once: true });
    }

    const shade = document.createElement("div");
    shade.className = "slide__shade";
    shade.setAttribute("aria-hidden", "true");

    slide.append(image, shade);
    if (!textless) {
      const caption = document.createElement("figcaption");
      caption.className = "slide__caption";

      const category = document.createElement("div");
      category.className = "slide__category";
      category.textContent = pad(realNumber) + " — " + item.category;

      const title = document.createElement("h2");
      title.className = "slide__title";
      title.textContent = item.title;

      const description = document.createElement("p");
      description.className = "slide__description";
      description.textContent = item.description;

      caption.append(category, title, description);
      slide.append(caption);
    }
    track.append(slide);
    slides.push(slide);
  });

  totalLabel.textContent = textless ? "" : pad(total);

  function updateChrome(position) {
    const realIndex = realIndexFromPosition(position);
    const item = data[realIndex];

    currentLabel.textContent = textless ? "" : pad(realIndex + 1);
    gallery.setAttribute(
      "aria-label",
      "横版作品轮播，当前第 " + (realIndex + 1) + " 张，共 " + total + " 张：" + item.title
    );

    slides.forEach((slide, slidePosition) => {
      if (slidePosition === 0 || slidePosition === total + 1) {
        return;
      }
      slide.setAttribute("aria-hidden", slidePosition === realIndex + 1 ? "false" : "true");
    });
  }

  function clearAutoTimer() {
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function pauseAuto() {
    clearAutoTimer();
  }

  function scheduleAuto(delay) {
    clearAutoTimer();

    if (!autoEnabled || isAnimating || pointer !== null || document.hidden) {
      return;
    }

    autoTimer = window.setTimeout(() => {
      autoTimer = null;
      if (!autoEnabled || pointer !== null || isAnimating || document.hidden) {
        return;
      }
      goTo(index + 1, { source: "auto", duration: AUTO_DURATION });
    }, delay);
  }

  function setTransformInstant(position) {
    track.style.transition = "none";
    track.style.transform = translateFor(position);
    // Flush the style before a later transition starts.
    void track.offsetWidth;
  }

  function animateTo(position, duration) {
    if (reduceMotion || duration <= 0) {
      setTransformInstant(position);
      window.requestAnimationFrame(finishTransition);
      return;
    }

    const from = track.style.transform || translateFor(index);
    track.style.transition = "none";
    track.style.transform = from;
    void track.offsetWidth;

    track.style.transition = "transform " + duration + "ms cubic-bezier(0.22, 0.76, 0.18, 1)";
    track.style.transform = translateFor(position);

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
    }
    transitionTimer = window.setTimeout(finishTransition, duration + 120);
  }

  function goTo(target, options) {
    if (!width) {
      return;
    }

    if (isAnimating) {
      settleAnimation(false);
    }

    clearAutoTimer();

    const settings = options || {};
    const duration = settings.duration !== undefined ? settings.duration : MANUAL_DURATION;
    const source = settings.source || "manual";
    const nextPosition = clamp(target, 0, total + 1);

    if (nextPosition === index && !pointer) {
      setTransformInstant(index);
      updateChrome(index);
      scheduleAuto(RESUME_DELAY);
      return;
    }

    isAnimating = true;
    animationTarget = nextPosition;
    animationSource = source;
    updateChrome(nextPosition);
    animateTo(nextPosition, duration);
  }

  function finishTransition() {
    if (!isAnimating) {
      return;
    }

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    const target = animationTarget;
    const normalized = normalizePosition(target);
    const needsJump = target !== normalized;

    isAnimating = false;
    animationTarget = null;
    index = normalized;

    if (needsJump) {
      setTransformInstant(index);
    }

    updateChrome(index);
    scheduleAuto(animationSource === "auto" ? AUTO_DELAY : RESUME_DELAY);
  }

  function settleAnimation(reschedule) {
    if (!isAnimating) {
      return;
    }

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    const normalized = normalizePosition(animationTarget);
    isAnimating = false;
    animationTarget = null;
    index = normalized;
    setTransformInstant(index);
    updateChrome(index);

    if (reschedule !== false) {
      scheduleAuto(RESUME_DELAY);
    }
  }

  function measureWidth() {
    const computedWidth = Number.parseFloat(window.getComputedStyle(viewport).width);
    return Number.isFinite(computedWidth) && computedWidth > 0
      ? computedWidth
      : viewport.getBoundingClientRect().width;
  }

  function measure() {
    const nextWidth = measureWidth();
    if (!nextWidth) {
      return;
    }

    if (isAnimating) {
      settleAnimation(false);
    }

    width = nextWidth;
    setTransformInstant(index);
  }

  function renderDrag(offset) {
    track.style.transition = "none";
    track.style.transform =
      "translate3d(" + (-index * width + offset) + "px, 0, 0)";
  }

  function recordSample(x, time) {
    if (!pointer) {
      return;
    }
    const samples = pointer.samples;
    const last = samples[samples.length - 1];
    if (!last || Math.abs(x - last.x) >= 0.5) {
      samples.push({ x: x, t: time });
    }
    while (samples.length > 2 && time - samples[0].t > 130) {
      samples.shift();
    }
  }

  function releaseVelocity(now) {
    if (!pointer || pointer.samples.length < 2) {
      return 0;
    }
    const samples = pointer.samples;
    const last = samples[samples.length - 1];
    if (now - last.t > 90) {
      return 0;
    }
    const first = samples[0];
    const elapsed = last.t - first.t;
    if (elapsed < 16) {
      return 0;
    }
    return (last.x - first.x) / elapsed;
  }

  function bindDragListeners() {
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", cancelHold);
  }

  function unbindDragListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", cancelHold);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (pointer !== null) {
      return;
    }

    pauseAuto();
    if (isAnimating) {
      settleAnimation(false);
    }

    if (event.pointerType !== "touch" && event.cancelable) {
      event.preventDefault();
    }

    const now = performance.now();
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      delta: 0,
      axis: null,
      moved: false,
      samples: [{ x: event.clientX, t: now }]
    };

    gallery.focus({ preventScroll: true });
    bindDragListeners();
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) {
      return;
    }

    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;

    if (!pointer.axis && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      pointer.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }

    if (pointer.axis === "y") {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    if (Math.abs(dx) > 4) {
      pointer.moved = true;
      gallery.classList.add("is-dragging");
    }

    pointer.lastX = event.clientX;
    pointer.delta = clamp(dx, -width, width);
    renderDrag(pointer.delta);
    recordSample(event.clientX, performance.now());
  }

  function endPointer(event, cancelled) {
    if (!pointer || event.pointerId !== pointer.id) {
      return;
    }

    unbindDragListeners();

    const now = performance.now();
    const dx = clamp(event.clientX - pointer.startX, -width, width);
    const dy = event.clientY - pointer.startY;
    const horizontal =
      pointer.axis === "x" ||
      (pointer.axis === null && Math.abs(dx) > Math.abs(dy));

    pointer.delta = horizontal ? dx : 0;
    recordSample(event.clientX, now);

    const velocity = horizontal ? releaseVelocity(now) : 0;
    const wasMoved = pointer.moved && horizontal && Math.abs(pointer.delta) > 4;
    const fast =
      wasMoved &&
      Math.abs(velocity) > FAST_FLICK &&
      Math.abs(pointer.delta) > MIN_FLICK_DISTANCE;
    const far = Math.abs(pointer.delta) > Math.max(44, width * DRAG_THRESHOLD);

    let step = 0;
    if (!cancelled && wasMoved) {
      if (fast) {
        step = velocity < 0 ? 1 : -1;
      } else if (far) {
        step = pointer.delta < 0 ? 1 : -1;
      }
    }

    const shouldSnapBack = !cancelled && step === 0 && wasMoved;

    pointer = null;
    gallery.classList.remove("is-dragging");

    if (step !== 0) {
      goTo(index + step, { source: "gesture", duration: MANUAL_DURATION });
    } else if (shouldSnapBack) {
      animateBackToCurrent();
    } else {
      setTransformInstant(index);
      scheduleAuto(RESUME_DELAY);
    }
  }

  function animateBackToCurrent() {
    isAnimating = true;
    animationTarget = index;
    animationSource = "gesture";
    updateChrome(index);
    animateTo(index, SNAP_DURATION);
  }

  function cancelHold() {
    if (!pointer) {
      return;
    }

    unbindDragListeners();
    pointer = null;
    gallery.classList.remove("is-dragging");
    setTransformInstant(index);
    scheduleAuto(RESUME_DELAY);
  }

  function onPointerUp(event) {
    endPointer(event, false);
  }

  function onPointerCancel(event) {
    endPointer(event, true);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1, { source: "keyboard", duration: MANUAL_DURATION });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1, { source: "keyboard", duration: MANUAL_DURATION });
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(1, { source: "keyboard", duration: MANUAL_DURATION });
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(total, { source: "keyboard", duration: MANUAL_DURATION });
    }
  }

  function onMotionPreferenceChange(event) {
    reduceMotion = event.matches;
    autoEnabled = !reduceMotion;

    if (!autoEnabled) {
      pauseAuto();
    }

    if (autoEnabled && !isAnimating && pointer === null) {
      scheduleAuto();
    }
  }

  gallery.addEventListener("pointerdown", onPointerDown);
  gallery.addEventListener("keydown", onKeyDown);
  gallery.addEventListener("dragstart", (event) => event.preventDefault());

  track.addEventListener("transitionend", (event) => {
    if (event.target !== track || !String(event.propertyName).includes("transform")) {
      return;
    }
    if (isAnimating) {
      finishTransition();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAuto();
    } else {
      scheduleAuto(1200);
    }
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      if (!width) {
        return;
      }
      const nextWidth = measureWidth();
      if (Math.abs(nextWidth - width) > 0.5) {
        measure();
      }
    });
    resizeObserver.observe(viewport);
  } else {
    window.addEventListener("resize", measure);
  }

  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionPreferenceChange);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(onMotionPreferenceChange);
  }

  requestAnimationFrame(() => {
    measure();
    updateChrome(index);
    gallery.classList.add("is-ready");
    scheduleAuto(AUTO_DELAY);
  });
})();
