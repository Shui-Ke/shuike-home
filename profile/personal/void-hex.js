/* 00 — HEX BOOT STREAM
   Decodes nothing: it converts the short boot message into uppercase hex
   bytes (spaces between bytes, 0A closing each line) and types the stream
   out character by character next to a blinking cursor. The run starts once
   the dossier curtain has been removed, plays exactly once, then fades out
   and hands the frame over to the earth scene (shuike:hex-complete). */
(() => {
  'use strict';

  const MESSAGE = [
    'LOADINGING...',
    '25%',
    '50%',
    '100...',
    "Welcome to shuike's profile!"
  ].join('\n');

  const code = document.querySelector('[data-hex-code]');
  if (!code) return;
  const hex = code.closest('.void__hex');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const encodeLine = line => Array.from(new TextEncoder().encode(line))
    .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

  // Keep the 0A terminator visible so the hex really is the whole message.
  const stream = MESSAGE.split('\n')
    .map((line, index, lines) => encodeLine(line) + (index < lines.length - 1 ? ' 0A' : ''))
    .join('\n');

  let frame = 0;
  let hold = 0;
  let startedAt = 0;
  let started = false;
  let finished = false;

  const setState = state => { if (hex) hex.dataset.state = state; };
  setState('idle');

  function finish() {
    if (finished) return;
    finished = true;
    setState('done');
    if (!hex) {
      document.dispatchEvent(new CustomEvent('shuike:hex-complete'));
      return;
    }
    hex.classList.add('is-complete');
    window.setTimeout(() => {
      hex.hidden = true;
      document.dispatchEvent(new CustomEvent('shuike:hex-complete'));
    }, 480);
  }

  if (reduced.matches) {
    // No typing animation: show the completed log for a beat, then hand over.
    code.textContent = stream;
    setState('typing');
    hold = window.setTimeout(finish, 1600);
  } else {
    // Time-based so a throttled frame never slows the run down.
    const type = now => {
      if (!startedAt) startedAt = now;
      const count = Math.min(stream.length, Math.floor((now - startedAt) / 18));
      code.textContent = stream.slice(0, count);
      if (count < stream.length) {
        frame = requestAnimationFrame(type);
        return;
      }
      frame = 0;
      // Let the last line breathe before the log disappears.
      hold = window.setTimeout(finish, 900);
    };

    const start = () => {
      if (started) return;
      started = true;
      setState('typing');
      frame = requestAnimationFrame(type);
    };

    // The page owns its opening curtain; typing behind it would be wasted.
    // Start when transition.js removes [data-pt-cover], with a hard fallback.
    const cover = document.querySelector('[data-pt-cover]');
    if (!cover) {
      start();
    } else {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-pt-cover]')) {
          observer.disconnect();
          start();
        }
      });
      observer.observe(document.body, { childList: true });
      window.setTimeout(() => {
        if (!started) {
          observer.disconnect();
          start();
        }
      }, 8000);
    }
  }

  window.addEventListener('pagehide', () => {
    if (frame) cancelAnimationFrame(frame);
    if (hold) clearTimeout(hold);
    frame = hold = 0;
  });
})();
