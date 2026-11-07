/* Profile interactions; the OC opens its menu, whose touch action plays a reaction. */
(() => {
  'use strict';
  const sideClock = document.querySelector('[data-side-clock]');
  const sideDay = document.querySelector('[data-side-day]');
  const sideMonth = document.querySelector('[data-side-month]');
  function updateSideDate() {
    const now = new Date();
    if (sideClock) sideClock.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    if (sideDay) sideDay.textContent = String(now.getDate()).padStart(2, '0');
    if (sideMonth) sideMonth.textContent = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(now).toUpperCase();
  }
  if (sideClock || sideDay || sideMonth) {
    updateSideDate();
    setInterval(updateSideDate, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateSideDate(); });
  }

  const themeToggle = document.querySelector('[data-theme-toggle]');
  if (themeToggle) {
    const root = document.documentElement;
    const syncThemeControl = () => {
      const light = root.dataset.theme === 'light';
      themeToggle.setAttribute('aria-label', light ? '切换黑夜模式' : '切换白天模式');
      themeToggle.setAttribute('aria-pressed', String(light));
    };
    themeToggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('shuike:theme', next); } catch (_) {}
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#000' : '#e2e4de');
      syncThemeControl();
    });
    new MutationObserver(syncThemeControl).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    syncThemeControl();
  }

  const hero = document.querySelector('.side-hero');
  if (hero) {
    const reveal = event => {
      const rect = hero.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      hero.style.setProperty('--reveal-x', `${((event.clientX - rect.left) / rect.width * 100).toFixed(2)}%`);
      hero.style.setProperty('--reveal-y', `${((event.clientY - rect.top) / rect.height * 100).toFixed(2)}%`);
    };
    hero.addEventListener('pointermove', reveal, { passive: true });
    hero.addEventListener('pointerenter', reveal, { passive: true });
  }

  const player = document.querySelector('.player-card');
  if (player) {
    const toggle = player.querySelector('[data-player-toggle]');
    const status = player.querySelector('[data-player-status]');
    const setPlaying = playing => {
      player.dataset.playing = playing ? 'true' : 'false';
      if (toggle) toggle.setAttribute('aria-label', playing ? '暂停' : '播放');
      if (status) status.textContent = playing ? '播放中' : '已暂停';
      player.classList.remove('is-toggling');
      void player.offsetWidth;
      player.classList.add('is-toggling');
      window.setTimeout(() => player.classList.remove('is-toggling'), 430);
    };
    if (toggle) toggle.addEventListener('click', () => setPlaying(player.dataset.playing !== 'true'));
    player.querySelectorAll('[data-player-skip]').forEach(button => {
      button.addEventListener('click', () => {
        player.dataset.skip = button.dataset.playerSkip;
        player.classList.remove('is-skipping');
        void player.offsetWidth;
        player.classList.add('is-skipping');
        window.setTimeout(() => player.classList.remove('is-skipping'), 430);
      });
    });
  }

  /* OC character, four behaviours on one action layer:
     - 打招呼 plays once when the page opens, together with the self-introduction line;
     - 打哈欠 plays after two quiet minutes of idle, with its own sleepy line;
     - the menu's touch button plays one random clip from the reaction pool and the
       "you like touching" line;
     - the menu's talk button walks five monologues, one per click.
     Every menu interaction opens the voice panel and plays the matching wav; the panel
     follows the audio, not the animation. The idle loop runs underneath the whole time.
     The 640x1200 exports are already normalised (same canvas, same figure height and
     head line), so one shared CSS geometry fits every clip and no per-clip fitting is
     needed here. */
  const characterStage = document.querySelector('[data-character-stage]');
  if (characterStage) {
    const hit = characterStage.querySelector('[data-character-hit]');
    const action = characterStage.querySelector('[data-character-action]');
    const idleImage = characterStage.querySelector('.character-art--idle');
    const status = characterStage.querySelector('[data-character-status]');
    const CLIP_MS = 5240;      // 77 frames x ~67ms = 5159ms, plus a tail for the last frame
    const IDLE_LOOP_MS = 5159; // one idle loop
    const WINDOW_HEAD_MS = 1000; // frames 0-1s of every clip are the shared neutral pose
    const WINDOW_TAIL_MS = 4000; // and so is the last second of the idle loop
    const IDLE_MS = 120000;    // two minutes of idle before the yawn
    const FIRST = { src: 'MingYun/打招呼.webp', label: '明云向你打了个招呼' };
    // Talking ships in two lengths cut from the same source webp (the export holds two
    // talk motions back to back): 说话1 is the whole thing (6.64s), 说话2 is the first
    // motion only (4.03s). A recorded line outlasts either one, so the figure chains them
    // until the wav ends (see planTalk below).
    const TALK_LONG = { src: 'MingYun/说话1.webp', label: '明云正在说话', ms: 6640 };
    const TALK_SHORT = { src: 'MingYun/说话2.webp', label: '明云正在说话', ms: 4030 };

    /* Recorded lines (MiniMax · h3voice01): one wav per interaction. `ms` is the measured
       length of the file and drives both the panel lifetime and the mouth-motion plan;
       `ja` keeps the recorded line for reference and `zh` is the subtitle that is shown
       while that wav plays. Replacing a wav means re-measuring `ms`. */
    const VOICE_DIR = 'MingYun/voice/';
    const VOICES = {
      greeting: {
        src: `${VOICE_DIR}00_こんにちは_自己紹介.wav`,
        ms: 9070,
        ja: 'こんにちは……うん、端末は正常に起動したみたいね。私、見えてる？明芸よ、ここの管理者。',
        zh: '你好……嗯，终端好像正常启动了。能看到我吗？我是明芸，这里的管理员。'
      },
      touch: {
        src: `${VOICE_DIR}01_触るの好きだよね.wav`,
        ms: 3240,
        ja: 'あなたって、ほんと触るの好きだよね。',
        zh: '你还真是……很喜欢摸我呢。'
      },
      place: {
        src: `${VOICE_DIR}02_私のいる場所.wav`,
        ms: 7630,
        ja: '私のいる場所？……別にいい場所じゃないよ。あなたが来たら、危ないかもね。',
        zh: '我住的地方？……也不是什么好地方哦。你要是来了，说不定会有危险呢。'
      },
      food: {
        src: `${VOICE_DIR}03_好きな食べ物.wav`,
        ms: 9760,
        ja: '好きな食べ物……？うーん、特に好きなものもないし、特に嫌いなものもないかな。',
        zh: '喜欢吃的？……唔，好像也没什么特别喜欢的，也没什么特别讨厌的。'
      },
      stars: {
        src: `${VOICE_DIR}04_星はね.wav`,
        ms: 5580,
        ja: '星はね、好きなの。夜になると、つい空を見上げちゃう。',
        zh: '星星啊，我是喜欢的。一到晚上，就会忍不住抬头看天。'
      },
      ordinary: {
        src: `${VOICE_DIR}05_普通の生活に戻れたら.wav`,
        ms: 5460,
        ja: 'ん……いつか、また普通の生活に戻れたらいいよね。',
        zh: '嗯……要是有一天，能再回到普通的生活就好了。'
      },
      someday: {
        src: `${VOICE_DIR}06_いつか会えるよね.wav`,
        ms: 8360,
        ja: 'ねえ、いつか私たち、会えるよね？端末越しじゃなくて、ちゃんと顔を合わせてさ。',
        zh: '呐，总有一天我们能见面的吧？不是隔着终端，而是好好地面对面。'
      },
      yawn: {
        src: `${VOICE_DIR}07_眠い_なんとかしてよ.wav`,
        ms: 5490,
        ja: '眠い……ねえ、あなた、なんとかしてよ。',
        zh: '好困……喂，你想想办法啊。'
      }
    };
    // The yawn action holds its last (neutral) frame for the extra 250ms the wav needs,
    // so the clip, the line and the panel all end on the same beat.
    const LONG = { src: 'MingYun/打哈欠.webp', label: '明云打了个哈欠', ms: VOICES.yawn.ms };
    // The talk button walks the five monologues in file order (02–06).
    const TALK_LINES = [VOICES.place, VOICES.food, VOICES.stars, VOICES.ordinary, VOICES.someday];

    // Shortest run of the two talk clips that still covers `ms`; an overshoot of a few
    // hundred ms is preferred over stopping the mouth mid-line. Re-run at every clip end
    // with the time that is left, it slices long lines into 2–3 motions on its own.
    const planTalk = ms => {
      let best = [TALK_LONG], bestScore = Infinity;
      const walk = (chain, total) => {
        if (chain.length) {
          const gap = total - ms;
          // Undershooting is worse than overshooting: the voice would keep going while
          // the figure is already back on the idle loop.
          const score = gap >= 0 ? gap : -gap * 2.5;
          if (score < bestScore) { bestScore = score; best = chain; }
        }
        if (chain.length < 4) {
          walk(chain.concat(TALK_LONG), total + TALK_LONG.ms);
          walk(chain.concat(TALK_SHORT), total + TALK_SHORT.ms);
        }
      };
      walk([], 0);
      return best;
    };
    const RANDOM = [
      { src: 'MingYun/打招呼2.webp', label: '明云向你打了个招呼' },
      { src: 'MingYun/抱臂.webp', label: '明云抱起了手臂' },
      { src: 'MingYun/深呼吸.webp', label: '明云深呼吸了一下' },
      { src: 'MingYun/女人叹气.webp', label: '明云叹了口气' },
      { src: 'MingYun/ciallo.webp', label: '明云喊了声 Ciallo' }
    ];

    let busy = false, actionTimer = 0, idleTimer = 0, prefetchTimer = 0, clearTimer = 0;
    let lastRandom = -1, booted = false, pendingRandom = null;
    let idleStart = 0, pendingClip = null, pendingVoice = null, pendingTimer = 0;
    let pendingTalk = null, loadingTalk = null, lineIndex = 0;
    const fetched = new Set();
    const ready = new Set();
    const pickTalk = entry => planTalk(entry.ms)[0];
    const prefetch = clip => {
      if (!clip || fetched.has(clip.src) || document.hidden || navigator.connection?.saveData) return;
      fetched.add(clip.src);
      const img = new Image();
      img.decoding = 'async';
      const loaded = () => {
        ready.add(clip.src);
        if (pendingClip === clip) setLoading(false);
      };
      img.onload = loaded;
      img.src = clip.src;
      img.decode?.().then(loaded).catch(() => {});
    };

    // Every clip opens and closes on the same neutral pose. The idle loop shows that
    // pose during its first second and its last second, so a reaction may start
    // immediately inside either window and otherwise waits for the near (tail) window.
    const triggerDelay = () => {
      if (!idleStart) return 0;
      const phase = (performance.now() - idleStart) % IDLE_LOOP_MS;
      if (phase <= WINDOW_HEAD_MS || phase >= WINDOW_TAIL_MS) return 0;
      return WINDOW_TAIL_MS - phase;
    };

    // `line` rides along with the clip so the wav starts on the same frame as the
    // motion, even when the neutral window makes the clip wait a moment.
    const request = (clip, line) => {
      if (!clip || busy || pendingClip) return;
      window.clearTimeout(idleTimer);
      window.clearTimeout(prefetchTimer);
      if (!ready.has(clip.src)) setLoading(true);
      const wait = triggerDelay();
      if (wait <= 0) {
        play(clip, false, line);
        return;
      }
      pendingClip = clip;
      pendingVoice = line || null;
      pendingTimer = window.setTimeout(() => {
        const queued = pendingClip;
        const queuedVoice = pendingVoice;
        pendingClip = null;
        pendingVoice = null;
        pendingTimer = 0;
        if (queued) play(queued, false, queuedVoice);
      }, wait + 30);
    };

    // Anchor the idle's own clock: its first frame is painted as soon as it decodes, so
    // the loop phase is measured from there (a frame early at most). Waiting for the
    // load event would be late by however long the rest of the file takes to arrive.
    const anchorIdle = () => { if (!idleStart) idleStart = performance.now(); };
    if (idleImage && idleImage.decode) idleImage.decode().then(anchorIdle, anchorIdle);
    else anchorIdle();

    const armIdleAction = () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(prefetchTimer);
      prefetchTimer = window.setTimeout(() => {
        if (!document.hidden) prefetch(LONG);
      }, IDLE_MS - 30000);
      idleTimer = window.setTimeout(() => {
        request(LONG, { entry: VOICES.yawn, source: 'yawn', hold: LONG.ms });
      }, IDLE_MS);
    };

    const finish = () => {
      window.clearTimeout(actionTimer);
      actionTimer = 0;
      busy = false;
      // A talk requested during an interaction starts the moment that clip ends; the
      // action layer stays mounted, so there is no idle flash between the two.
      if (pendingTalk) {
        const next = pendingTalk;
        pendingTalk = null;
        play(pickTalk(next), true, { entry: next, source: 'talk' });
        return;
      }
      // The monologues outlast one 4–7s mouth motion. While their wav is
      // still running, chain the next motion instead of dropping back to the idle loop;
      // a tail under a second is not worth another clip.
      if (activeVoice && activeVoice.source === 'talk') {
        const left = activeVoice.entry.ms - (performance.now() - activeVoice.startedAt);
        if (left > 900) {
          play(planTalk(left)[0], true);
          return;
        }
      }
      characterStage.dataset.state = 'idle';
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        if (!busy) action.removeAttribute('src');
      }, 240);
      armIdleAction();
    };

    const play = (clip, chain = false, line = null) => {
      if (!clip || busy) return;
      busy = true;
      window.clearTimeout(idleTimer);
      window.clearTimeout(prefetchTimer);
      window.clearTimeout(clearTimer);
      window.clearTimeout(actionTimer);
      actionTimer = 0;
      fetched.add(clip.src);
      loadingTalk = line && line.source === 'talk' ? line.entry : null;
      if (!ready.has(clip.src)) setLoading(true);
      let live = false;
      const start = async () => {
        if (!busy || live) return;
        live = true;
        // The first audible syllable must not compete with the welcome image's decode.
        if (clip === FIRST) {
          try { await action.decode?.(); } catch (error) { fail(); return; }
        }
        ready.add(clip.src);
        setLoading(false);
        if (pendingRandom === clip) pendingRandom = null;
        characterStage.dataset.state = 'action';
        if (status) status.textContent = clip.label;
        if (clip === FIRST) {
          await new Promise(resolve => window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => window.setTimeout(resolve, 150));
          }));
          if (!busy) return;
        }
        // The clip timer starts on the first audible frame of the wav, not on the click:
        // otherwise a slow load would leave the action out of step with the voice (and
        // cut the tail of the yawn line).
        if (line) await startVoice(line);
        loadingTalk = null;
        if (line && line.source === 'talk') {
          const nextLine = TALK_LINES[lineIndex] || TALK_LINES[0];
          prefetch(pickTalk(nextLine));
        }
        if (!busy) return;
        window.clearTimeout(actionTimer);
        actionTimer = window.setTimeout(finish, clip.ms || CLIP_MS);
      };
      const fail = () => {
        setLoading(false);
        if (!busy) return;
        if (loadingTalk && !pendingTalk) hideVoice();
        loadingTalk = null;
        busy = false;
        window.clearTimeout(actionTimer);
        actionTimer = 0;
        action.onload = null;
        action.onerror = null;
        characterStage.dataset.state = 'idle';
        action.removeAttribute('src');
        if (pendingTalk) finish();
        else armIdleAction();
      };
      // Assigned rather than added, so a chained clip cannot leave a stale listener behind.
      action.onload = start;
      action.onerror = fail;
      // Clear first so a quick replay always restarts at frame 0. When a clip chains
      // straight into another one the current frame stays on screen until the new one
      // decodes, so that switch has no blank gap either. Re-assigning the *same* src
      // would not reload it (and would never fire `load`), so that loop is kept running.
      const same = action.getAttribute('src') === clip.src;
      if (chain && same) {
        start();
        return;
      }
      if (!chain) action.removeAttribute('src');
      action.src = clip.src;
      if (action.complete && action.naturalWidth) start();
    };

    const pickRandom = () => {
      if (RANDOM.length === 1) return RANDOM[0];
      let index = Math.floor(Math.random() * RANDOM.length);
      if (index === lastRandom) index = (index + 1) % RANDOM.length;
      lastRandom = index;
      return RANDOM[index];
    };

    const characterMenu = document.querySelector('#character-menu');
    const voice = document.querySelector('[data-oc-voice]');
    const voiceText = document.querySelector('[data-oc-voice-text]');
    const voiceClose = document.querySelector('[data-oc-voice-close]');
    const voiceProgress = document.querySelector('[data-oc-voice-progress]');
    const talkButton = characterMenu ? characterMenu.querySelector('.oc-arc__button--talk') : null;

    // Introduce LOADING once per page; later openings reveal only the line and digits.
    // Clip loading controls the buttons independently, so the clock never flickers.
    let loadingTimer = 0, loadingReadout = null, readoutAnimation = null;
    let readoutDigits = [];
    let readoutIntroduced = false;
    const disabledButtons = new Map();
    const setOpeningReadout = open => {
      if (!characterMenu) return;
      if (readoutAnimation) {
        readoutAnimation.onfinish = null;
        readoutAnimation.cancel();
      }
      readoutAnimation = null;
      readoutDigits.forEach(animation => animation.cancel());
      readoutDigits = [];
      const time = characterMenu.querySelector('[data-hud="time"]');
      const date = characterMenu.querySelector('[data-hud="date"]');
      const hud = time ? time.parentElement : null;
      const line = hud ? hud.querySelector('.oc-arc__hud-line') : null;
      const firstOpen = open && !readoutIntroduced;
      if (firstOpen && time && !loadingReadout) {
        loadingReadout = document.createElement('span');
        loadingReadout.className = time.className;
        // Seven segments approximate the letters as L O A d I n G.
        loadingReadout.innerHTML = ['def', 'abcdef', 'abcefg', 'bcdeg', 'bc', 'ceg', 'acdefg'].map(on =>
          `<i class="oc-arc__hud-digit">${Array.from('abcdefg').map(seg =>
            `<b class="oc-arc__hud-seg oc-arc__hud-seg--${seg}${on.includes(seg) ? ' is-on' : ''}"></b>`
          ).join('')}</i>`
        ).join('');
        loadingReadout.setAttribute('aria-label', 'LOADING');
        loadingReadout.style.setProperty('--arc-ink', '#ff4d4f');
        loadingReadout.style.animation = 'none';
        loadingReadout.style.opacity = '1';
        time.before(loadingReadout);
      }
      if (loadingReadout) loadingReadout.style.display = firstOpen ? '' : 'none';
      [time, date].forEach(node => {
        if (!node) return;
        node.style.display = firstOpen ? 'none' : '';
        node.style.animation = 'none';
        node.style.opacity = '1';
        node.style.alignSelf = 'center';
        node.style.translate = '-4cqw 0';
      });
      if (line) {
        // The HUD reveal owns the line's timing, without the component's extra blink.
        line.style.animation = 'none';
        line.style.transform = 'scaleX(1)';
        line.style.width = characterMenu.getAttribute('data-variant') === 'line' ? '16cqw' : '48cqw';
      }
      if (!open || !hud) return;
      const shown = { clipPath: 'inset(0 0% 0 0)', transform: 'translate(0, -50%)' };
      const folded = { clipPath: 'inset(0 100% 0 0)', transform: 'translate(-12px, -50%)' };
      const revealClock = () => {
        // Reserve both rows while folded, but show only the line as it extends.
        if (loadingReadout) loadingReadout.style.display = 'none';
        [time, date].forEach(node => {
          if (!node) return;
          node.style.display = '';
          node.style.opacity = '0';
        });
        const previousAnimation = readoutAnimation;
        readoutAnimation = hud.animate([folded, shown], {
          duration: 560, easing: 'cubic-bezier(.16, 1, .3, 1)'
        });
        if (previousAnimation) previousAnimation.cancel();
        readoutAnimation.onfinish = () => {
          readoutAnimation = null;
          readoutDigits = [time, date].filter(Boolean).map(node => {
            const above = node === time;
            node.style.opacity = '1';
            return node.animate([
              { clipPath: above ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)',
                transform: above ? 'translateY(8px)' : 'translateY(-8px)', opacity: 0 },
              { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)', opacity: 1 }
            ], { duration: 460, easing: 'cubic-bezier(.16, 1, .3, 1)' });
          });
        };
      };
      if (!firstOpen || !loadingReadout) {
        revealClock();
        return;
      }
      readoutIntroduced = true;
      readoutAnimation = hud.animate([folded, shown], {
        duration: 560, easing: 'cubic-bezier(.16, 1, .3, 1)'
      });
      readoutAnimation.onfinish = () => {
        readoutAnimation = loadingReadout.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], {
          duration: 500, iterations: 2, easing: 'steps(2, end)'
        });
        readoutAnimation.onfinish = () => {
          readoutAnimation = hud.animate([shown, folded], {
            duration: 220, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards'
          });
          readoutAnimation.onfinish = revealClock;
        };
      };
    };
    const setLoading = loading => {
      if (!characterMenu) return;
      if (loading && characterMenu.hasAttribute('data-busy')) return;
      window.clearTimeout(loadingTimer);
      characterMenu.toggleAttribute('data-busy', loading);
      if (loading) {
        loadingTimer = window.setTimeout(() => {
          characterMenu.querySelectorAll('[data-action]').forEach(button => {
            disabledButtons.set(button, { disabled: button.disabled, aria: button.getAttribute('aria-disabled') });
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
          });
        }, 1500);
      } else {
        disabledButtons.forEach((state, button) => {
          button.disabled = state.disabled;
          if (state.aria === null) button.removeAttribute('aria-disabled');
          else button.setAttribute('aria-disabled', state.aria);
        });
        disabledButtons.clear();
      }
    };

    /* One wav per interaction, one shared <audio> pool. All eight are only 3.34MB, so
       they are fetched up front into a hidden bank instead of waiting for the click: a
       cold wav used to start ~1s after the panel on a busy link. `activeVoice` is the
       line that currently owns the panel: it ends on the wav's `ended` event, or on
       `lifeTimer` when playback is refused by the autoplay policy (the subtitle stays up
       for the recorded length either way). */
    const voiceBank = document.createElement('div');
    voiceBank.className = 'voice-bank';
    voiceBank.hidden = true;
    voiceBank.setAttribute('aria-hidden', 'true');
    document.body.append(voiceBank);
    const audioPool = new Map();
    const audioFor = entry => {
      let audio = audioPool.get(entry.src);
      if (!audio) {
        audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.volume = .9;
        audio.src = entry.src;
        audioPool.set(entry.src, audio);
        // Attached, so Chrome keeps loading it after the first paint and never treats it
        // as a throwaway node before the first click.
        voiceBank.append(audio);
      }
      return audio;
    };
    Object.values(VOICES).forEach(entry => audioFor(entry));
    let activeVoice = null;
    let voiceToken = 0;

    const setTalkPressed = pressed => {
      if (talkButton) talkButton.setAttribute('aria-pressed', String(pressed));
    };
    // The panel rides inside .news-status-row, so it tilts with the dock's hover dent.
    // Only its width is measured: from the news column's left edge to the recording
    // timer's right edge. Its own z-index keeps it in front of the character artwork.
    // The two small controls are lifted above it by its measured height.
    const sizeVoice = () => {
      if (!voice) return;
      const row = voice.parentElement;
      const timer = document.querySelector('.recording-timer');
      const tools = document.querySelector('.news-tools');
      if (!row || !timer) return;
      const line = row.getBoundingClientRect();
      const right = timer.getBoundingClientRect().right;
      if (right > line.left) voice.style.width = Math.round(right - line.left) + 'px';
      if (tools) {
        const height = voice.getBoundingClientRect().height || 64;
        tools.style.setProperty('--tools-lift', Math.round(10 + height + 16) + 'px');
      }
    };
    sizeVoice();
    window.addEventListener('resize', sizeVoice);

    const hideVoice = () => {
      if (!voice) return;
      voice.dataset.open = 'false';
      if (voiceProgress) voiceProgress.classList.remove('is-running');
    };

    const showVoice = (entry, ms) => {
      if (!voice) return;
      if (voiceText) voiceText.textContent = entry.zh;
      voice.dataset.open = 'true';
      // The thin bar under the text runs for exactly as long as the wav.
      if (voiceProgress) {
        voice.style.setProperty('--voice-ms', `${Math.max(600, ms)}ms`);
        voiceProgress.classList.remove('is-running');
        void voiceProgress.offsetWidth;
        voiceProgress.classList.add('is-running');
      }
      // The line may wrap to a second row, so the controls above it are re-placed.
      sizeVoice();
    };

    // Drop the current line without touching the panel: a replacement line is shown on
    // the same frame, so the panel has to stay open across the swap.
    const releaseVoice = () => {
      if (!activeVoice) return null;
      const session = activeVoice;
      activeVoice = null;
      window.clearTimeout(session.lifeTimer);
      session.audio.onended = null;
      session.audio.pause();
      session.audio.currentTime = 0;
      return session;
    };

    const stopVoice = () => {
      const session = releaseVoice();
      if (!session) return;
      if (session.source === 'talk') setTalkPressed(false);
      if (!pendingTalk && !loadingTalk) hideVoice();
    };

    /* Resolves when the line is actually audible (or has been given up on). A requested
       monologue shows its text immediately; its progress bar still follows the wav. */
    const startVoice = line => new Promise(resolve => {
      const { entry, source, hold } = line;
      const previous = releaseVoice();
      if (previous && previous.source === 'talk') setTalkPressed(false);
      const audio = audioFor(entry);
      // `releaseVoice` already rewinds stopped lines; this only matters for an element
      // that never played (0) or was left mid-seek.
      if (audio.currentTime) audio.currentTime = 0;
      const token = ++voiceToken;
      const life = hold || entry.ms;
      const session = { entry, source, audio, token, startedAt: 0, lifeTimer: 0 };
      activeVoice = session;
      if (source === 'talk') setTalkPressed(true);

      let settled = false;
      let shown = false;
      const startClock = () => {
        window.clearTimeout(session.lifeTimer);
        if (hold) {
          // The yawn panel belongs to the action, not to the wav: close on the same beat.
          session.lifeTimer = window.setTimeout(() => {
            if (activeVoice && activeVoice.token === token) stopVoice();
          }, hold + 60);
          return;
        }
        const closeIfDone = () => {
          if (!activeVoice || activeVoice.token !== token) return;
          // A replaced wav can push `ended` past the fallback; if the file is still
          // running, wait for what is actually left instead of cutting it.
          const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : life;
          const left = total - audio.currentTime * 1000;
          if (!audio.paused && left > 300) {
            activeVoice.lifeTimer = window.setTimeout(closeIfDone, left + 400);
            return;
          }
          stopVoice();
        };
        session.lifeTimer = window.setTimeout(closeIfDone, life + 400);
      };
      const show = () => {
        if (shown || !activeVoice || activeVoice.token !== token) return;
        shown = true;
        session.startedAt = performance.now();
        if (!pendingTalk && (!loadingTalk || loadingTalk === entry)) showVoice(entry, life);
        startClock();
      };
      const settle = () => {
        if (settled) return;
        settled = true;
        show();
        resolve();
      };
      // A line that finally plays after the fallback below restarts the clock, so the
      // subtitle and the ruler still match its real first frame.
      const restart = () => {
        if (!activeVoice || activeVoice.token !== token || !shown) return;
        session.startedAt = performance.now();
        if (!pendingTalk && (!loadingTalk || loadingTalk === entry)) showVoice(entry, life);
        startClock();
      };

      audio.onended = () => {
        if (activeVoice && activeVoice.token === token) stopVoice();
      };
      // Start the subtitle's progress on the first audible frame. If the media
      // never produces one (blocked, 404, stalled), the fallback still shows the
      // subtitle for the recorded length and lets the action run.
      audio.addEventListener('playing', () => (settled ? restart() : settle()), { once: true });
      const started = audio.play();
      if (started && started.catch) {
        started.catch(() => settle());
      }
      window.setTimeout(settle, 4000);
    });
    if (voiceClose) voiceClose.addEventListener('click', stopVoice);

    // Talking ignores the idle loop's neutral windows: while the figure is free the clip
    // starts on the click itself. If an interaction clip is still running, the talk is
    // held and starts the moment that clip ends.
    const queueTalk = entry => {
      if (!entry || pendingTalk || loadingTalk) return false;
      if (busy) {
        // Already talking: further clicks wait for the current line instead of stacking.
        if (activeVoice && activeVoice.source === 'talk') return false;
        pendingTalk = entry;
        showVoice(entry, entry.ms);
        if (voiceProgress) voiceProgress.classList.remove('is-running');
        return true;
      }
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
      pendingClip = null;
      pendingVoice = null;
      showVoice(entry, entry.ms);
      if (voiceProgress) voiceProgress.classList.remove('is-running');
      play(pickTalk(entry), false, { entry, source: 'talk' });
      return true;
    };

    if (hit && characterMenu) {
      // The fan opens away from the character: left of it the sweep runs leftward, right
      // of it the component mirrors (see the component's `flip` attribute).
      const anchor = characterMenu.parentElement;
      const stage = document.querySelector('[data-character-stage]');
      const syncFlip = () => {
        if (!anchor || !stage) return;
        // Desert uses the vertical line menu; the default topic keeps the glass fan.
        const shell = document.querySelector('.terminal-shell');
        const desert = Boolean(shell && shell.getAttribute('data-topic') === 'desert');
        characterMenu.setAttribute('data-variant', desert ? 'line' : 'arc');
        // The desert layout never mirrors about the character.
        if (desert) {
          characterMenu.removeAttribute('flip');
          return;
        }
        const box = anchor.getBoundingClientRect();
        const area = stage.getBoundingClientRect();
        const mirrored = box.left + box.width / 2 > area.left + area.width / 2;
        characterMenu.toggleAttribute('flip', mirrored);
      };
      // Picking another topic changes which layout the menu should use.
      document.querySelectorAll('[data-topic-pick]').forEach(pick => {
        pick.addEventListener('click', () => window.setTimeout(syncFlip, 0));
      });
      // Any other path that swaps the topic (keyboard, script, future UI) must keep
      // the menu variant in sync, so watch the attribute itself.
      const shellNode = document.querySelector('.terminal-shell');
      if (shellNode) {
        new MutationObserver(syncFlip).observe(shellNode, { attributes: true, attributeFilter: ['data-topic'] });
      }
      hit.addEventListener('click', () => {
        characterMenu.toggle();
      });
      characterMenu.addEventListener('oc-menu-toggle', event => {
        hit.setAttribute('aria-expanded', String(event.detail.open));
        hit.setAttribute('aria-label', event.detail.open ? '收起明云互动菜单' : '展开明云互动菜单');
        if (anchor) anchor.classList.toggle('is-open', event.detail.open);
        setOpeningReadout(event.detail.open);
        if (!busy && !pendingClip) armIdleAction();
        if (event.detail.open) {
          if (!pendingRandom) pendingRandom = pickRandom();
          prefetch(pendingRandom);
          const nextLine = TALK_LINES[lineIndex] || TALK_LINES[0];
          prefetch(pickTalk(nextLine));
          window.requestAnimationFrame(syncFlip);
        }
      });
      characterMenu.addEventListener('oc-menu-activate', event => {
        if (!busy && !pendingClip) armIdleAction();
        if (event.detail.action === 'talk') {
          const line = TALK_LINES[lineIndex] || TALK_LINES[0];
          if (queueTalk(line)) lineIndex = (lineIndex + 1) % TALK_LINES.length;
          return;
        }
        if (event.detail.action !== 'touch') return;
        if (!booted || busy || pendingClip) {
          if (status) status.textContent = '明云正在动作中，请稍后再试';
          return;
        }
        if (!pendingRandom) pendingRandom = pickRandom();
        request(pendingRandom, { entry: VOICES.touch, source: 'touch' });
      });

      // The fan itself is a handle: press anywhere on the menu except the three action
      // buttons and drag it around the OC area. The component box itself takes the press,
      // because the sector glass is a disabled button in external-trigger mode.
      const lane = anchor ? anchor.parentElement : null;
      const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
      let drag = null;
      const endDrag = () => {
        if (!drag) return;
        drag = null;
        if (anchor) anchor.classList.remove('is-dragging');
        syncFlip();
      };
      if (anchor) {
        anchor.addEventListener('pointerdown', event => {
          if (event.button !== 0 || !characterMenu.open || !lane) return;
          if (event.target.closest('[data-action]')) return;
          const box = anchor.getBoundingClientRect();
          const laneBox = lane.getBoundingClientRect();
          const area = (stage || lane).getBoundingClientRect();
          drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: box.left - laneBox.left,
            top: box.top - laneBox.top,
            minX: area.left - laneBox.left,
            maxX: area.right - laneBox.left - box.width,
            minY: area.top - laneBox.top,
            maxY: area.bottom - laneBox.top - box.height
          };
          anchor.classList.add('is-dragging');
          try { anchor.setPointerCapture(event.pointerId); } catch (error) { /* best effort */ }
          event.preventDefault();
        });
        anchor.addEventListener('pointermove', event => {
          if (!drag || event.pointerId !== drag.pointerId) return;
          const x = clamp(drag.left + (event.clientX - drag.startX), drag.minX, drag.maxX);
          const y = clamp(drag.top + (event.clientY - drag.startY), drag.minY, drag.maxY);
          anchor.style.left = `${Math.round(x)}px`;
          anchor.style.top = `${Math.round(y)}px`;
        });
        anchor.addEventListener('pointerup', endDrag);
        anchor.addEventListener('pointercancel', endDrag);
      }
      window.addEventListener('blur', endDrag);
      window.addEventListener('resize', syncFlip);
      syncFlip();
    }

    const boot = () => {
      if (booted) return;
      booted = true;
      play(FIRST, false, { entry: VOICES.greeting, source: 'greeting' });
    };
    if (idleImage && idleImage.decode) idleImage.decode().then(() => window.setTimeout(boot, 260), boot);
    else window.setTimeout(boot, 1200);
  }

  const canvas = document.querySelector('[data-waveform]');
  if (canvas) {
    const context = canvas.getContext('2d');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const trails = [
      { alpha: .12, size: .6, speed: .7, freq: .032, offset: 0, scale: .65 },
      { alpha: .18, size: .75, speed: .95, freq: .04, offset: 1.4, scale: .75 },
      { alpha: .28, size: .9, speed: 1.2, freq: .05, offset: 2.8, scale: .85 },
      { alpha: .42, size: 1.05, speed: 1.5, freq: .062, offset: 4.2, scale: .95 },
      { alpha: .6, size: 1.2, speed: 1.8, freq: .076, offset: 5.6, scale: 1.05 },
      { alpha: .82, size: 1.4, speed: 2.1, freq: .09, offset: .8, scale: 1.12 }
    ];
    let width = 0, height = 0, ink = '#fff', frameId = 0, last = 0;
    function readInk() {
      ink = getComputedStyle(document.documentElement).getPropertyValue('--wave-ink').trim() || '#fff';
    }
    function draw(now) {
      if (!context || !width || !height) return;
      const time = now / 1000, center = height / 2;
      context.clearRect(0, 0, width, height);
      context.fillStyle = ink;
      for (const trail of trails) {
        context.globalAlpha = trail.alpha;
        context.shadowBlur = trail.alpha > .55 ? 3 : 0;
        context.shadowColor = ink;
        context.beginPath();
        let phase = trail.offset;
        for (let x = 0; x <= width; x += 3) {
          const t = x / width;
          const centerWeight = Math.sin(Math.PI * t);
          const localFreq = trail.freq * (.38 + 1.7 * centerWeight * centerWeight);
          phase += localFreq * 3;
          const amplitude = (height * .07 + height * .32 * centerWeight) * trail.scale;
          const seed = Math.sin(x * 12.9898 + trail.offset * 7.7) * 43758.5453;
          const noise = seed - Math.floor(seed);
          const y = center + Math.sin(phase + time * trail.speed + trail.offset) * amplitude + Math.sin(x * .015 + time * .6 + trail.offset) * 1.2;
          const radius = trail.size * (.65 + .7 * noise);
          context.moveTo(x + radius, y);
          context.arc(x, y, radius, 0, Math.PI * 2);
        }
        context.fill();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      context.save();
      context.fillStyle = ink;
      context.globalAlpha = .16;
      context.beginPath();
      context.moveTo(0, center);
      context.quadraticCurveTo(width / 2, center - 3.4, width, center);
      context.quadraticCurveTo(width / 2, center + 3.4, 0, center);
      context.closePath();
      context.fill();
      context.globalAlpha = .92;
      context.beginPath();
      context.moveTo(0, center);
      context.quadraticCurveTo(width / 2, center - 1.15, width, center);
      context.quadraticCurveTo(width / 2, center + 1.15, 0, center);
      context.closePath();
      context.fill();
      context.restore();
    }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      readInk();
      draw(performance.now());
    }
    function loop(now) {
      if (now - last > 33) { draw(now); last = now; }
      frameId = requestAnimationFrame(loop);
    }
    function start() {
      cancelAnimationFrame(frameId);
      readInk();
      if (reduceMotion.matches) { draw(performance.now()); return; }
      frameId = requestAnimationFrame(loop);
    }
    if (context) {
      new ResizeObserver(resize).observe(canvas);
      new MutationObserver(() => { readInk(); draw(performance.now()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      reduceMotion.addEventListener('change', start);
      addEventListener('resize', resize);
      resize();
      start();
    }
  }
})();


