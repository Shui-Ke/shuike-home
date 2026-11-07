(() => {
  "use strict";

  const timecode = document.querySelector("[data-timecode]");
  if (!timecode) return;

  const SEGMENTS_FOR_DIGIT = {
    0: "abcdef",
    1: "bc",
    2: "abdeg",
    3: "abcdg",
    4: "bcfg",
    5: "acdfg",
    6: "acdefg",
    7: "abc",
    8: "abcdefg",
    9: "abcdfg",
  };
  const SEGMENT_NAMES = ["a", "b", "c", "d", "e", "f", "g"];
  const MAX_HOURS = 99;
  const MAX_CENTISECONDS = (MAX_HOURS * 3600 + 59 * 60 + 59) * 100 + 99;
  const MAX_MILLISECONDS = MAX_CENTISECONDS * 10 + 9;

  const unitDigits = {
    hours: Array.from(timecode.querySelectorAll('[data-unit="hours"] [data-digit]')),
    minutes: Array.from(timecode.querySelectorAll('[data-unit="minutes"] [data-digit]')),
    seconds: Array.from(timecode.querySelectorAll('[data-unit="seconds"] [data-digit]')),
    centiseconds: Array.from(timecode.querySelectorAll('[data-unit="centiseconds"] [data-digit]')),
  };

  let frameId = 0;
  let startedAt = 0;
  let lastLabelledSecond = -1;

  // Build the square, elevator-style segmented digits once on startup.
  Object.values(unitDigits).flat().forEach((digit) => {
    SEGMENT_NAMES.forEach((name) => {
      const segment = document.createElement("span");
      segment.className = `segment segment--${name}`;
      segment.dataset.segment = name;
      digit.appendChild(segment);
    });
  });

  function setDigit(digit, value) {
    if (!digit) return;

    const nextValue = String(value);
    if (digit.dataset.value === nextValue) return;

    digit.dataset.value = nextValue;
    const activeSegments = SEGMENTS_FOR_DIGIT[value] || "";
    Array.from(digit.children).forEach((segment) => {
      segment.classList.toggle("is-on", activeSegments.includes(segment.dataset.segment));
    });
  }

  function setUnit(unit, value) {
    const digits = unitDigits[unit];
    setDigit(digits[0], Math.floor(value / 10));
    setDigit(digits[1], value % 10);
  }

  function renderTime(elapsedMs) {
    const centiseconds = Math.min(MAX_CENTISECONDS, Math.max(0, Math.floor(elapsedMs / 10)));
    const totalSeconds = Math.floor(centiseconds / 100);
    const hours = Math.min(MAX_HOURS, Math.floor(totalSeconds / 3600));
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    setUnit("hours", hours);
    setUnit("minutes", minutes);
    setUnit("seconds", seconds);
    setUnit("centiseconds", centiseconds % 100);

    if (totalSeconds !== lastLabelledSecond) {
      lastLabelledSecond = totalSeconds;
      timecode.setAttribute(
        "aria-label",
        `${timecode.dataset.themeOwner === "page" ? "页面停留" : "录制时长"} ${hours} 小时 ${minutes} 分 ${seconds} 秒`
      );
    }
  }

  function tick(now) {
    const elapsed = Math.min(Math.max(now - startedAt, 0), MAX_MILLISECONDS);
    renderTime(elapsed);
    if (elapsed < MAX_MILLISECONDS) {
      frameId = window.requestAnimationFrame(tick);
    }
  }

  function startTimer() {
    if (frameId) window.cancelAnimationFrame(frameId);
    startedAt = performance.now();
    lastLabelledSecond = -1;
    renderTime(0);
    frameId = window.requestAnimationFrame(tick);
  }

  startTimer();

  // If the browser restores the page from the back-forward cache, start over.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) startTimer();
  });

  // Keep the automatic light/dark styling in sync while the page stays open.
  const forcedTheme = new URLSearchParams(location.search).get("theme");
  if (timecode.dataset.themeOwner !== "page" && forcedTheme !== "light" && forcedTheme !== "dark") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
    const themeColor = document.querySelector('meta[name="theme-color"]');

    const syncTheme = () => {
      const theme = systemTheme.matches ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      if (themeColor) {
        themeColor.setAttribute("content", theme === "light" ? "#f4f2ec" : "#060606");
      }
    };

    syncTheme();
    if (systemTheme.addEventListener) {
      systemTheme.addEventListener("change", syncTheme);
    }
  }
})();
