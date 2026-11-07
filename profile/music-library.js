/* ---------------------------------------------------------------------------
   Music library window
   The profile's "音乐库" card and player title open a floating macOS-style
   sheet. Only files that really exist in profile/Musik are listed; add a new
   object to TRACKS (and its files) to grow the library. Audio, the sheet, the
   page's mini player and the theme / topic skins all share this one module.

   The sheet is deliberately non-modal: the theme button and the topic switch
   on the page stay reachable while it is open, and the window is redrawn from
   the page's data-theme / data-topic attributes on the next microtask. Every
   style lives in music-library.css under .music-window, so the page's glass and
   brutalist skins cannot leak into it.
   --------------------------------------------------------------------------- */
(() => {
  'use strict';

  const TRACKS = [
    {
      id: 'self-doubt',
      title: 'self doubt (Prod.Robin Cause)',
      artist: 'Venoflame',
      album: 'self doubt (Prod.Robin Cause)',
      src: 'Musik/self doubt/Venoflame - self doubt (Prod_Robin Cause).m4a',
      cover: 'Musik/self doubt/pic.png',
      duration: 125.04,
      bytes: 3028901,
      format: 'M4A'
    },
    {
      id: 'thank-you-for-dears',
      title: 'Thank you for dears.',
      artist: 'GET IN THE RING',
      album: 'AQ',
      src: 'Musik/Thank you for dears/GET IN THE RING - Thank you for dears_.m4a',
      cover: 'Musik/Thank you for dears/pic.png',
      duration: 326.287,
      bytes: 7903460,
      format: 'M4A'
    },
    {
      id: 'a-rusty-dream',
      title: 'A Rusty Dream (from Cyberpunk: Edgerunners 2)',
      artist: 'DOUDOU',
      album: 'A Rusty Dream (from Cyberpunk: Edgerunners 2)',
      src: 'Musik/A Rusty Dream/DOUDOU - A Rusty Dream.m4a',
      cover: 'Musik/A Rusty Dream/pic.png',
      duration: 301.488,
      bytes: 7293393,
      format: 'M4A'
    }
  ];

  const dialog = document.querySelector('[data-music-window]');
  const frame = dialog ? dialog.querySelector('[data-mw-frame]') : null;
  if (!dialog || !frame) return;

  const root = document.documentElement;
  const shell = document.querySelector('.terminal-shell');
  const template = document.querySelector('#music-track-template');
  const audio = document.querySelector('[data-music-audio]');
  const miniPlayer = document.querySelector('.player-card');
  const miniTitle = miniPlayer ? miniPlayer.querySelector('[data-player-title]') : null;
  const miniMeta = miniPlayer ? miniPlayer.querySelector('[data-player-meta]') : null;
  const miniArt = miniPlayer ? miniPlayer.querySelector('[data-player-art]') : null;
  const pageThemeToggle = document.querySelector('[data-theme-toggle]');

  const scrollArea = dialog.querySelector('[data-mw-scroll]');
  const list = dialog.querySelector('[data-mw-list]');
  const alertBox = dialog.querySelector('[data-mw-alert]');
  const emptyNote = dialog.querySelector('[data-mw-empty]');
  const titlebar = dialog.querySelector('[data-mw-drag]');
  const themeButton = dialog.querySelector('[data-mw-theme]');
  const closeButton = dialog.querySelector('[data-mw-close]');
  const minimizeButton = dialog.querySelector('[data-mw-minimize]');
  const zoomButton = dialog.querySelector('[data-mw-zoom]');
  const footerCover = dialog.querySelector('[data-mw-footer-cover]');
  const footerArt = dialog.querySelector('[data-mw-footer-art]');
  const footerTitle = dialog.querySelector('[data-mw-now-title]');
  const footerArtist = dialog.querySelector('[data-mw-now-artist]');
  const footerState = dialog.querySelector('[data-mw-state]');
  const elapsedLabel = dialog.querySelector('[data-mw-elapsed]');
  const totalLabel = dialog.querySelector('[data-mw-total]');
  const progress = dialog.querySelector('[data-mw-progress]');
  const liveLabel = dialog.querySelector('[data-mw-live]');
  const playButton = dialog.querySelector('[data-mw-toggle]');
  const previousButton = dialog.querySelector('[data-mw-prev]');
  const nextButton = dialog.querySelector('[data-mw-next]');
  const modeButton = dialog.querySelector('[data-mw-mode]');
  const archiveArt = dialog.querySelector('[data-mw-archive-art]');
  const archiveTitle = dialog.querySelector('[data-mw-archive-title]');
  const archiveArtist = dialog.querySelector('[data-mw-archive-artist]');
  const archiveFormat = dialog.querySelector('[data-mw-archive-format]');
  const archiveDuration = dialog.querySelector('[data-mw-archive-duration]');
  const archiveSize = dialog.querySelector('[data-mw-archive-size]');
  const archivePanel = dialog.querySelector('[data-mw-archive]');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FAVORITES_KEY = 'shuike:music-favorites';
  const MODE_KEY = 'shuike:music-mode';
  const MODES = ['list', 'one', 'shuffle'];
  const MODE_LABELS = { list: '列表循环', one: '单曲循环', shuffle: '随机播放' };

  let rows = [];
  let alertTimer = 0;
  let pendingSeek = null;
  let favorites = readFavorites();

  const state = {
    current: 0,
    duration: TRACKS[0] ? TRACKS[0].duration : 0,
    playing: false,
    loading: false,
    error: false,
    closing: false,
    seeking: false,
    trackActive: false,
    mode: 'list',
    shuffleHistory: [],
    dragX: 0,
    dragY: 0,
    drag: null,
    lastTrigger: null
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const pad = value => String(value).padStart(2, '0');
  const safeNumber = value => (Number.isFinite(value) ? value : 0);
  const currentTrack = () => TRACKS[state.current] || null;

  function formatTime(value) {
    const total = Math.max(0, Math.floor(safeNumber(value) + 0.0001));
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function formatBytes(bytes, spaced = false) {
    const size = safeNumber(bytes);
    if (size <= 0) return spaced ? '0 MB' : '0M';
    const mib = size / 1048576;
    if (mib >= .1) return `${mib.toFixed(1)}${spaced ? ' MB' : 'M'}`;
    return `${Math.max(1, Math.round(size / 1024))}${spaced ? ' KB' : 'K'}`;
  }

  function cssUrl(value) {
    return `url("${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }

  function readFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY));
      return new Set(Array.isArray(stored) ? stored.filter(item => typeof item === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch (_) {
      // The interaction still works for this page when storage is unavailable.
    }
  }

  function readMode() {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      return MODES.includes(stored) ? stored : 'list';
    } catch (_) {
      return 'list';
    }
  }

  function saveMode() {
    try {
      localStorage.setItem(MODE_KEY, state.mode);
    } catch (_) {
      // The mode remains available for this page when storage is unavailable.
    }
  }

  function setMode(mode, { persist = true, announceChange = false } = {}) {
    const next = MODES.includes(mode) ? mode : 'list';
    const changed = next !== state.mode;
    state.mode = next;
    state.shuffleHistory.length = 0;
    if (modeButton) {
      modeButton.dataset.mode = next;
      modeButton.setAttribute('aria-label', `播放模式：${MODE_LABELS[next]}，点击切换`);
    }
    if (persist) saveMode();
    if (announceChange && changed) announce(`播放模式：${MODE_LABELS[next]}`);
  }

  function cycleMode() {
    setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length], { announceChange: true });
  }

  /* ----------------------------------------------------------------------- */
  /* Skins: read the page's own tokens and write a scoped [data-skin] state.  */
  /* ----------------------------------------------------------------------- */

  const readToken = (styles, name, fallback) => {
    const value = styles ? styles.getPropertyValue(name).trim() : '';
    return value || fallback;
  };

  function applySkin() {
    const light = root.dataset.theme === 'light';
    const desert = Boolean(shell && shell.getAttribute('data-topic') === 'desert');
    const skin = desert ? (light ? 'desert-day' : 'desert-night') : (light ? 'day' : 'night');
    if (dialog.dataset.skin !== skin) dialog.dataset.skin = skin;

    const rootStyle = getComputedStyle(root);
    if (desert) {
      const shellStyle = getComputedStyle(shell || root);
      const ink = readToken(shellStyle, '--brutal-ink', light ? '#0e1a24' : '#14120d');
      dialog.style.setProperty('--mw-accent', readToken(shellStyle, '--brutal-accent', light ? '#8fc7ea' : '#d8a12a'));
      dialog.style.setProperty('--mw-accent-ink', ink);
      dialog.style.setProperty('--mw-focus', ink);
      dialog.style.setProperty('--mw-focus-ring', ink);
      dialog.style.setProperty('--mw-desert-paper', readToken(shellStyle, '--brutal-paper', light ? '#cfe4f4' : '#e9dcbb'));
      dialog.style.setProperty('--mw-desert-paper-hi', readToken(shellStyle, '--brutal-paper-hi', light ? '#dcecf8' : '#efe4c8'));
      dialog.style.setProperty('--mw-desert-ink', ink);
      dialog.style.setProperty('--mw-desert-muted', readToken(shellStyle, '--brutal-muted', light ? '#4d6474' : '#5c5340'));
      dialog.style.setProperty('--mw-desert-shadow', readToken(shellStyle, '--brutal-shadow-strong', light ? 'rgb(14 26 36 / .92)' : 'rgb(20 18 13 / .92)'));
    } else {
      dialog.style.setProperty('--mw-accent', readToken(rootStyle, '--accent', '#dce896'));
      dialog.style.setProperty('--mw-accent-ink', readToken(rootStyle, '--accent-ink', '#20271d'));
      dialog.style.setProperty('--mw-focus', readToken(rootStyle, '--focus', '#dce896'));
      dialog.style.setProperty('--mw-focus-ring', readToken(rootStyle, '--focus', '#dce896'));
    }

    if (themeButton) themeButton.setAttribute('aria-label', light ? '切换黑夜模式' : '切换白天模式');
  }

  /* ----------------------------------------------------------------------- */
  /* Rows                                                                     */
  /* ----------------------------------------------------------------------- */

  function setFavoriteLabel(button, track, active) {
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'} ${track.title}`);
  }

  function renderList() {
    if (!list || !template) return;
    list.textContent = '';
    rows = TRACKS.map((track, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.trackId = track.id;
      node.dataset.index = String(index);

      const cover = node.querySelector('[data-mw-cover]');
      const coverArt = cover.querySelector('img');
      coverArt.src = track.cover;
      coverArt.alt = `${track.title} — 专辑封面`;
      cover.setAttribute('aria-label', `播放 ${track.title}`);
      cover.addEventListener('click', () => {
        if (state.current !== index) selectTrack(index, { autoplay: true });
        else togglePlay();
      });

      node.querySelector('[data-mw-row-title]').textContent = track.title;
      node.querySelector('[data-mw-row-artist]').textContent = track.artist;
      node.querySelector('[data-mw-row-album]').textContent = track.album;
      node.querySelector('[data-mw-row-duration]').textContent = formatTime(track.duration);
      node.querySelector('[data-mw-row-size]').textContent = formatBytes(track.bytes);

      const favorite = node.querySelector('[data-mw-favorite]');
      const isFavorite = favorites.has(track.id);
      setFavoriteLabel(favorite, track, isFavorite);
      favorite.addEventListener('click', () => {
        const active = !favorites.has(track.id);
        if (active) favorites.add(track.id);
        else favorites.delete(track.id);
        saveFavorites();
        setFavoriteLabel(favorite, track, active);
        favorite.classList.remove('is-pulsing');
        void favorite.offsetWidth;
        favorite.classList.add('is-pulsing');
        window.setTimeout(() => favorite.classList.remove('is-pulsing'), 380);
      });

      list.append(node);
      return { node, cover, favorite, track };
    });

    if (emptyNote) emptyNote.hidden = TRACKS.length > 0;
    if (!TRACKS.length) dialog.dataset.empty = 'true';
  }

  function populateMeta() {
    const count = TRACKS.length;
    const countLabel = `${pad(count)} ${count === 1 ? 'TRACK' : 'TRACKS'}`;
    dialog.querySelectorAll('[data-mw-count]').forEach(node => {
      node.textContent = countLabel;
    });
    dialog.querySelectorAll('[data-mw-track-count]').forEach(node => {
      node.textContent = pad(count);
    });
    const total = TRACKS.reduce((sum, track) => sum + track.bytes, 0);
    dialog.querySelectorAll('[data-mw-total-size]').forEach(node => {
      node.textContent = formatBytes(total, true);
    });
    if (archiveSize) archiveSize.textContent = formatBytes(total, true);
  }

  function updateRowStates() {
    rows.forEach((row, index) => {
      const current = index === state.current;
      const playing = current && state.playing;
      row.node.dataset.current = current ? 'true' : 'false';
      row.node.dataset.playing = playing ? 'true' : 'false';
      row.node.dataset.loading = current && state.loading ? 'true' : 'false';
      row.node.setAttribute('aria-busy', current && state.loading ? 'true' : 'false');
      if (current) row.node.setAttribute('aria-current', 'true');
      else row.node.removeAttribute('aria-current');
      row.cover.setAttribute('aria-label', playing ? `暂停 ${row.track.title}` : `播放 ${row.track.title}`);
    });

    const track = currentTrack();
    if (footerCover) footerCover.setAttribute('aria-label', state.playing ? `暂停 ${track ? track.title : ''}` : `播放 ${track ? track.title : ''}`);
    if (playButton) playButton.setAttribute('aria-label', state.playing ? '暂停' : '播放');
  }

  function updateDurations() {
    rows.forEach((row, index) => {
      const total = index === state.current ? state.duration : row.track.duration;
      const durationNode = row.node.querySelector('[data-mw-row-duration]');
      if (durationNode) durationNode.textContent = formatTime(total);
    });
    if (archiveDuration) archiveDuration.textContent = formatTime(state.duration || (currentTrack() ? currentTrack().duration : 0));
    if (totalLabel) totalLabel.textContent = formatTime(state.duration || 0);
  }

  function placeArchive() {
    if (!archivePanel) return;
    const row = rows[state.current];
    const detail = row && row.node.querySelector('[data-mw-track-detail]');
    if (!detail) return;
    if (archivePanel.parentElement !== detail) detail.append(archivePanel);
  }

  function revealArchive() {
    if (!dialog.open || !archivePanel || !scrollArea) return;
    window.requestAnimationFrame(() => {
      if (!dialog.open) return;
      const view = scrollArea.getBoundingClientRect();
      const rect = archivePanel.getBoundingClientRect();
      if (rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1) return;
      archivePanel.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reduceMotion.matches ? 'auto' : 'smooth'
      });
    });
  }

  function updateTrackUI() {
    const track = currentTrack();
    if (!track) return;
    if (footerTitle) footerTitle.textContent = track.title;
    if (footerArtist) footerArtist.textContent = track.artist;
    if (footerArt) {
      footerArt.src = track.cover;
      footerArt.alt = `${track.title} 封面`;
    }
    if (archiveArt) {
      archiveArt.src = track.cover;
      archiveArt.alt = `${track.title} 封面`;
    }
    if (archiveTitle) archiveTitle.textContent = track.album;
    if (archiveArtist) archiveArtist.textContent = track.artist;
    if (archiveFormat) archiveFormat.textContent = track.format;
    if (archiveDuration) archiveDuration.textContent = formatTime(state.duration || track.duration);
    if (archiveSize) archiveSize.textContent = formatBytes(track.bytes, true);
    frame.style.setProperty('--mw-art', cssUrl(track.cover));
    updateDurations();
    updateRowStates();
    placeArchive();
    if (dialog.open) revealArchive();
    if (state.trackActive) syncMiniTrack();
    setProgressUI(audio ? safeNumber(audio.currentTime) : 0);
  }

  /* ----------------------------------------------------------------------- */
  /* Progress                                                                */
  /* ----------------------------------------------------------------------- */

  function setProgressUI(value) {
    const total = state.duration || (currentTrack() ? currentTrack().duration : 0);
    const seconds = clamp(safeNumber(value), 0, total || 0);
    const ratio = total > 0 ? seconds / total : 0;
    dialog.style.setProperty('--mw-p', ratio.toFixed(5));
    dialog.style.setProperty('--mw-p-pct', `${(ratio * 100).toFixed(3)}%`);
    if (elapsedLabel) elapsedLabel.textContent = formatTime(seconds);
    if (totalLabel) totalLabel.textContent = formatTime(total);
    if (progress) {
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', String(Math.max(0, Math.round(total))));
      progress.setAttribute('aria-valuenow', String(Math.round(seconds)));
      progress.setAttribute('aria-valuetext', `${formatTime(seconds)} / ${formatTime(total)}`);
    }
  }

  function seekTo(value) {
    const total = state.duration || 0;
    if (!total) return;
    const target = clamp(safeNumber(value), 0, total);
    if (audio && audio.readyState >= 1) {
      try {
        audio.currentTime = target;
      } catch (_) {
        pendingSeek = target;
      }
    } else if (audio && audio.getAttribute('src')) {
      pendingSeek = target;
    }
    setProgressUI(target);
    updateStateLabel();
  }

  function seekFromPointer(event) {
    if (!progress) return;
    const rect = progress.getBoundingClientRect();
    if (!rect.width) return;
    seekTo(((event.clientX - rect.left) / rect.width) * (state.duration || 0));
  }

  /* ----------------------------------------------------------------------- */
  /* Playback                                                                */
  /* ----------------------------------------------------------------------- */

  function announce(message) {
    if (liveLabel) liveLabel.textContent = message;
  }

  function updateStateLabel() {
    let label = 'READY';
    if (state.error) label = 'ERROR';
    else if (state.loading) label = 'LOADING';
    else if (state.playing) label = 'PLAYING';
    else if (audio && audio.currentTime > 0) label = 'PAUSED';
    if (footerState) footerState.textContent = label;
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);
    dialog.dataset.loading = state.loading ? 'true' : 'false';
    updateRowStates();
    updateStateLabel();
  }

  function syncMiniPlayer(playing) {
    if (!miniPlayer) return;
    miniPlayer.dataset.playing = playing ? 'true' : 'false';
    const toggle = miniPlayer.querySelector('[data-player-toggle]');
    if (toggle) toggle.setAttribute('aria-label', playing ? '暂停' : '播放');
    const status = miniPlayer.querySelector('[data-player-status]');
    if (status) status.textContent = playing ? '播放中' : '已暂停';
  }

  /* Once a track has actually been started, the page's music card becomes the
     docked "now playing" card: cover, title and artist replace the generic
     library icon / label. The card keeps that state while paused or after the
     sheet is closed, so closing the window still shows what is playing. */
  function syncMiniTrack() {
    if (!miniPlayer) return;
    const track = currentTrack();
    const active = Boolean(state.trackActive && track);
    miniPlayer.dataset.trackActive = active ? 'true' : 'false';
    if (miniTitle) {
      miniTitle.textContent = active ? track.title : '音乐库';
      miniTitle.setAttribute('aria-label', active ? `打开音乐库窗口，当前曲目 ${track.title}` : '音乐库，打开播放窗口');
    }
    if (miniMeta) miniMeta.textContent = active ? track.artist : 'SHUIKE ARCHIVE';
    if (miniArt) {
      if (active) {
        if (miniArt.getAttribute('src') !== track.cover) miniArt.src = track.cover;
        miniArt.hidden = false;
      } else {
        miniArt.hidden = true;
        miniArt.removeAttribute('src');
      }
    }
  }

  function reflectPlayback(announceChange = true) {
    const wasPlaying = state.playing;
    state.playing = Boolean(audio) && !audio.paused && !audio.ended;
    if (state.playing && !state.trackActive) {
      state.trackActive = true;
      syncMiniTrack();
    }
    dialog.dataset.playing = state.playing ? 'true' : 'false';
    syncMiniPlayer(state.playing);
    updateRowStates();
    updateStateLabel();
    if (announceChange && wasPlaying !== state.playing) {
      const track = currentTrack();
      if (state.playing) announce(`正在播放 ${track ? track.title : '曲目'}`);
      else if (track) announce(`已暂停 ${track.title}`);
    }
  }

  function showAlert(message) {
    if (!alertBox) return;
    window.clearTimeout(alertTimer);
    alertBox.textContent = message;
    alertBox.hidden = false;
    if (scrollArea) scrollArea.scrollTop = 0;
    alertTimer = window.setTimeout(hideAlert, 7000);
  }

  function hideAlert() {
    if (!alertBox) return;
    window.clearTimeout(alertTimer);
    alertBox.hidden = true;
    alertBox.textContent = '';
  }

  function ensureSource() {
    const track = currentTrack();
    if (!track || !audio) return false;
    const current = audio.getAttribute('src');
    if (audio.dataset.trackId === track.id && current) return true;
    audio.dataset.trackId = track.id;
    audio.src = track.src;
    audio.load();
    state.duration = track.duration;
    pendingSeek = null;
    setProgressUI(0);
    updateDurations();
    return true;
  }

  function playCurrent() {
    if (!ensureSource()) return;
    if (state.duration && audio.currentTime >= state.duration - .04) {
      try { audio.currentTime = 0; } catch (_) {}
      setProgressUI(0);
    }
    state.error = false;
    hideAlert();
    if (!state.trackActive) {
      state.trackActive = true;
      syncMiniTrack();
    }
    setLoading(true);
    const started = audio.play();
    if (started && started.catch) {
      started.catch(error => {
        setLoading(false);
        if (error && error.name === 'AbortError') return;
        state.playing = false;
        dialog.dataset.playing = 'false';
        syncMiniPlayer(false);
        updateRowStates();
        updateStateLabel();
        showAlert('音频没能开始播放，请重新点击封面上的播放键。');
        announce('音频未能播放');
      });
    }
  }

  function pauseCurrent() {
    if (audio && !audio.paused) audio.pause();
  }

  function togglePlay() {
    if (!audio) return;
    if (audio.paused) playCurrent();
    else pauseCurrent();
  }

  function selectTrack(index, { autoplay = false, shuffle = false } = {}) {
    if (!TRACKS[index] || !audio) return;
    if (index === state.current) {
      if (!audio.getAttribute('src')) ensureSource();
      if (autoplay) playCurrent();
      return;
    }
    if (!shuffle) state.shuffleHistory.length = 0;
    audio.pause();
    state.current = index;
    state.duration = TRACKS[index].duration;
    state.error = false;
    pendingSeek = null;
    audio.removeAttribute('src');
    audio.dataset.trackId = '';
    audio.load();
    setProgressUI(0);
    updateTrackUI();
    if (autoplay) playCurrent();
  }

  function restartCurrent() {
    if (!ensureSource()) return;
    try { audio.currentTime = 0; } catch (_) {}
    pendingSeek = null;
    setProgressUI(0);
    updateStateLabel();
  }

  function randomOtherIndex() {
    if (TRACKS.length < 2) return state.current;
    let index = state.current;
    while (index === state.current) index = Math.floor(Math.random() * TRACKS.length);
    return index;
  }

  function rememberShufflePosition() {
    state.shuffleHistory.push(state.current);
    if (state.shuffleHistory.length > 12) state.shuffleHistory.shift();
  }

  function nextTrack() {
    const wasPlaying = Boolean(audio) && !audio.paused;
    if (state.mode === 'shuffle' && TRACKS.length > 1) {
      rememberShufflePosition();
      selectTrack(randomOtherIndex(), { autoplay: wasPlaying, shuffle: true });
      return;
    }
    if (TRACKS.length > 1) {
      selectTrack((state.current + 1) % TRACKS.length, { autoplay: wasPlaying });
      return;
    }
    restartCurrent();
  }

  function previousTrack() {
    const wasPlaying = Boolean(audio) && !audio.paused;
    if (state.mode === 'shuffle' && TRACKS.length > 1) {
      let previous = state.shuffleHistory.pop();
      if (!Number.isInteger(previous) || previous === state.current) previous = randomOtherIndex();
      selectTrack(previous, { autoplay: wasPlaying, shuffle: true });
      return;
    }
    if (TRACKS.length > 1) {
      selectTrack((state.current - 1 + TRACKS.length) % TRACKS.length, { autoplay: wasPlaying });
      return;
    }
    restartCurrent();
  }

  /* What happens when the current file reaches its end. `one` replays the same
     track, `shuffle` jumps to a different random track and records the old one
     for the Previous button, and `list` walks forward and wraps at the end. */
  function handleEnded() {
    if (TRACKS.length <= 1) {
      playCurrent();
      return;
    }
    if (state.mode === 'shuffle') {
      rememberShufflePosition();
      selectTrack(randomOtherIndex(), { autoplay: true, shuffle: true });
      return;
    }
    if (state.mode === 'one') {
      playCurrent();
      return;
    }
    selectTrack((state.current + 1) % TRACKS.length, { autoplay: true });
  }

  /* ----------------------------------------------------------------------- */
  /* Window open / close / minimize / zoom / drag                            */
  /* ----------------------------------------------------------------------- */

  function updateTriggers(open) {
    document.querySelectorAll('[data-music-open]').forEach(trigger => {
      trigger.setAttribute('aria-expanded', String(open));
    });
  }

  function frameDragBounds() {
    const width = frame.offsetWidth;
    const height = frame.offsetHeight;
    return {
      x: Math.max(0, (window.innerWidth - width) / 2 - 8),
      y: Math.max(0, (window.innerHeight - height) / 2 - 8)
    };
  }

  function applyDrag() {
    frame.style.setProperty('--mw-drag-x', `${Math.round(state.dragX)}px`);
    frame.style.setProperty('--mw-drag-y', `${Math.round(state.dragY)}px`);
  }

  function clampDrag() {
    const bounds = frameDragBounds();
    state.dragX = clamp(state.dragX, -bounds.x, bounds.x);
    state.dragY = clamp(state.dragY, -bounds.y, bounds.y);
    applyDrag();
  }

  function originFor(trigger) {
    const target = trigger || state.lastTrigger;
    const rect = target && typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    return {
      x: rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect && rect.height ? rect.top + rect.height / 2 : window.innerHeight / 2
    };
  }

  function setTransformOffset(propertyX, propertyY, point) {
    const centerX = window.innerWidth / 2 + state.dragX;
    const centerY = window.innerHeight / 2 + state.dragY;
    frame.style.setProperty(propertyX, `${(point.x - centerX).toFixed(1)}px`);
    frame.style.setProperty(propertyY, `${(point.y - centerY).toFixed(1)}px`);
  }

  function resetScroll(force = false) {
    if (!scrollArea) return;
    if (force || scrollArea.scrollTop < 30) scrollArea.scrollTop = 0;
  }

  function open(trigger) {
    if (dialog.open) {
      dialog.focus({ preventScroll: true });
      return;
    }
    if (state.closing) return;
    state.lastTrigger = trigger || document.querySelector('.player-title[data-music-open]') || document.querySelector('[data-music-open]') || null;
    applySkin();
    hideAlert();
    resetScroll(true);
    if (typeof dialog.show === 'function') dialog.show();
    else dialog.setAttribute('open', '');
    dialog.classList.remove('is-closing', 'is-open');
    setTransformOffset('--mw-from-x', '--mw-from-y', originFor(state.lastTrigger));
    frame.style.removeProperty('--mw-exit-x');
    frame.style.removeProperty('--mw-exit-y');
    updateTriggers(true);
    ensureSource();
    // The window is non-modal: no body lock, no inert page. Focus the sheet so
    // Escape works immediately; the page's own controls stay clickable.
    const reveal = () => {
      dialog.classList.add('is-open');
      dialog.focus({ preventScroll: true });
      resetScroll(true);
      // Web fonts / the album image can finish one frame after the sheet is
      // shown; a single late reset keeps the first view at the top of the list,
      // then the detail card is brought into view under the current row.
      window.setTimeout(() => {
        resetScroll(false);
        revealArchive();
      }, 140);
    };
    // Force the start transform to be painted before the transition starts.
    void frame.offsetWidth;
    if (reduceMotion.matches) reveal();
    else window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
  }

  function close({ reason = 'close', restoreFocus = true } = {}) {
    if (!dialog.open || state.closing) return;
    state.closing = true;

    const target = reason === 'minimize'
      ? (document.querySelector('.player-title[data-music-open]') || state.lastTrigger)
      : state.lastTrigger;
    if (target) setTransformOffset('--mw-exit-x', '--mw-exit-y', originFor(target));
    dialog.classList.remove('is-open');
    dialog.classList.add('is-closing');
    updateTriggers(false);

    const finish = () => {
      if (dialog.open) dialog.close();
      dialog.classList.remove('is-closing');
      state.closing = false;
      if (restoreFocus) {
        const focusTarget = reason === 'minimize'
          ? (document.querySelector('.player-title[data-music-open]') || state.lastTrigger)
          : state.lastTrigger;
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
      }
    };
    if (reduceMotion.matches) finish();
    else window.setTimeout(finish, 250);
  }

  function toggleZoom() {
    if (!dialog.open || window.matchMedia('(max-width: 700px)').matches) return;
    const zoomed = !dialog.hasAttribute('data-zoomed');
    dialog.toggleAttribute('data-zoomed', zoomed);
    if (zoomButton) zoomButton.setAttribute('aria-label', zoomed ? '还原音乐库窗口' : '放大音乐库窗口');
    window.setTimeout(clampDrag, 330);
  }

  function toggleTheme() {
    if (pageThemeToggle && !pageThemeToggle.closest('[inert]')) {
      pageThemeToggle.click();
    } else {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('shuike:theme', next); } catch (_) {}
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#000' : '#e2e4de');
    }
    applySkin();
  }

  /* ----------------------------------------------------------------------- */
  /* Events                                                                  */
  /* ----------------------------------------------------------------------- */

  document.querySelectorAll('[data-music-open]').forEach(trigger => {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'music-window');
    trigger.addEventListener('click', event => {
      event.preventDefault();
      if (dialog.open) {
        dialog.focus({ preventScroll: true });
        return;
      }
      open(trigger);
    });
  });

  if (closeButton) closeButton.addEventListener('click', () => close());
  if (minimizeButton) minimizeButton.addEventListener('click', () => close({ reason: 'minimize' }));
  if (zoomButton) zoomButton.addEventListener('click', toggleZoom);
  if (themeButton) themeButton.addEventListener('click', toggleTheme);
  if (playButton) playButton.addEventListener('click', togglePlay);
  if (footerCover) footerCover.addEventListener('click', togglePlay);
  if (previousButton) previousButton.addEventListener('click', previousTrack);
  if (nextButton) nextButton.addEventListener('click', nextTrack);
  if (modeButton) modeButton.addEventListener('click', cycleMode);

  // These listeners run after profile.js's decorative mini-player listeners, so
  // they only have to follow the real <audio> state and leave the animation
  // classes alone.
  if (miniPlayer) {
    const miniToggle = miniPlayer.querySelector('[data-player-toggle]');
    if (miniToggle) {
      miniToggle.addEventListener('click', () => {
        if (audio && audio.paused) playCurrent();
        else pauseCurrent();
      });
    }
    miniPlayer.querySelectorAll('[data-player-skip]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.playerSkip === 'prev') previousTrack();
        else nextTrack();
      });
    });
  }

  if (titlebar) {
    titlebar.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      if (!dialog.open) return;
      state.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: state.dragX,
        baseY: state.dragY
      };
      dialog.classList.add('is-dragging');
      try { titlebar.setPointerCapture(event.pointerId); } catch (_) {}
    });    titlebar.addEventListener('pointermove', event => {
      if (!state.drag || event.pointerId !== state.drag.pointerId) return;
      const bounds = frameDragBounds();
      state.dragX = clamp(state.drag.baseX + event.clientX - state.drag.startX, -bounds.x, bounds.x);
      state.dragY = clamp(state.drag.baseY + event.clientY - state.drag.startY, -bounds.y, bounds.y);
      applyDrag();
    });
    const endDrag = event => {
      if (!state.drag || (event && event.pointerId !== state.drag.pointerId)) return;
      state.drag = null;
      dialog.classList.remove('is-dragging');
    };
    titlebar.addEventListener('pointerup', endDrag);
    titlebar.addEventListener('pointercancel', endDrag);
    titlebar.addEventListener('lostpointercapture', endDrag);
    titlebar.addEventListener('dblclick', event => {
      if (!event.target.closest('button')) toggleZoom();
    });
  }

  // Clicking a non-interactive part of the sheet keeps the keyboard focus in
  // the window, so Escape always has a clear target without trapping the page.
  frame.addEventListener('pointerdown', event => {
    if (!dialog.open) return;
    if (event.target.closest('button, [role="slider"], a, input, textarea, select')) return;
    dialog.focus({ preventScroll: true });
  });

  if (scrollArea) {
    scrollArea.addEventListener('keydown', event => {
      if (event.target !== scrollArea) return;
      const page = Math.max(120, scrollArea.clientHeight * .8);
      if (event.key === 'ArrowDown') { scrollArea.scrollTop += 48; event.preventDefault(); }
      else if (event.key === 'ArrowUp') { scrollArea.scrollTop -= 48; event.preventDefault(); }
      else if (event.key === 'PageDown' || event.key === ' ') { scrollArea.scrollTop += page; event.preventDefault(); }
      else if (event.key === 'PageUp') { scrollArea.scrollTop -= page; event.preventDefault(); }
      else if (event.key === 'Home') { scrollArea.scrollTop = 0; event.preventDefault(); }
      else if (event.key === 'End') { scrollArea.scrollTop = scrollArea.scrollHeight; event.preventDefault(); }
    });
  }

  // Wheel over the title bar / footer / album detail should still browse the
  // list; over the list the native scroll is left untouched.
  frame.addEventListener('wheel', event => {
    if (!scrollArea || !event.deltaY || scrollArea.contains(event.target)) return;
    event.preventDefault();
    scrollArea.scrollTop += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  }, { passive: false });

  if (progress) {
    progress.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      state.seeking = true;
      try { progress.setPointerCapture(event.pointerId); } catch (_) {}
      seekFromPointer(event);
      event.preventDefault();
    });
    progress.addEventListener('pointermove', event => {
      if (state.seeking) seekFromPointer(event);
    });
    const endSeek = event => {
      if (!state.seeking) return;
      state.seeking = false;
      try { progress.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    progress.addEventListener('pointerup', endSeek);
    progress.addEventListener('pointercancel', endSeek);
    progress.addEventListener('lostpointercapture', () => { state.seeking = false; });
    progress.addEventListener('keydown', event => {
      const step = event.shiftKey ? 15 : 5;
      const total = state.duration || 0;
      const current = audio ? audio.currentTime : 0;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { seekTo(current - step); event.preventDefault(); }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { seekTo(current + step); event.preventDefault(); }
      else if (event.key === 'PageDown') { seekTo(current - 20); event.preventDefault(); }
      else if (event.key === 'PageUp') { seekTo(current + 20); event.preventDefault(); }
      else if (event.key === 'Home') { seekTo(0); event.preventDefault(); }
      else if (event.key === 'End') { seekTo(total); event.preventDefault(); }
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !dialog.open) return;
    if (!dialog.contains(document.activeElement)) return;
    event.preventDefault();
    close();
  });

  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || !dialog.open) return;
    if (!dialog.contains(document.activeElement)) return;
    if (event.target.closest('button, [role="slider"], a, input, textarea, select')) return;
    event.preventDefault();
    togglePlay();
  });

  window.addEventListener('resize', () => {
    clampDrag();
  });

  if (audio) {
    audio.preload = 'metadata';
    audio.volume = .9;
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        state.duration = audio.duration;
        updateDurations();
        setProgressUI(pendingSeek != null ? pendingSeek : audio.currentTime);
        if (pendingSeek != null) {
          try { audio.currentTime = pendingSeek; } catch (_) {}
          pendingSeek = null;
        }
      }
    });
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && Math.abs(audio.duration - state.duration) > .05) {
        state.duration = audio.duration;
        updateDurations();
      }
    });
    audio.addEventListener('timeupdate', () => {
      if (!state.seeking) setProgressUI(audio.currentTime);
    });
    audio.addEventListener('play', () => {
      state.error = false;
      reflectPlayback();
    });
    audio.addEventListener('playing', () => {
      setLoading(false);
      reflectPlayback();
    });
    audio.addEventListener('pause', () => {
      setLoading(false);
      reflectPlayback();
    });
    audio.addEventListener('ended', () => {
      setLoading(false);
      reflectPlayback(false);
      setProgressUI(state.duration);
      updateStateLabel();
      handleEnded();
    });
    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      state.error = true;
      setLoading(false);
      reflectPlayback(false);
      showAlert('音频无法加载，请检查 Musik 文件夹中的本地文件。');
      announce('音频加载失败');
    });
  }

  if (shell) {
    new MutationObserver(() => applySkin()).observe(shell, { attributes: true, attributeFilter: ['data-topic'] });
  }
  new MutationObserver(() => applySkin()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('shuike:theme-change', applySkin);

  /* ----------------------------------------------------------------------- */
  /* Initial paint                                                           */
  /* ----------------------------------------------------------------------- */

  renderList();
  populateMeta();
  applySkin();
  updateTrackUI();
  updateStateLabel();
  syncMiniTrack();
  setMode(readMode(), { persist: false });
  reflectPlayback(false);
  setProgressUI(0);
  if (zoomButton) zoomButton.setAttribute('aria-label', '放大音乐库窗口');
  if (audio && TRACKS.length) {
    // Do not fetch an audio file on page load. Metadata is warmed when the
    // window first opens or when the mini player is used.
    audio.dataset.trackId = '';
  }

  window.ShuikeProfileMusic = Object.freeze({
    open: () => open(document.querySelector('.player-title[data-music-open]')),
    close: () => close(),
    minimize: () => close({ reason: 'minimize' }),
    toggle: togglePlay,
    play: playCurrent,
    pause: pauseCurrent,
    next: nextTrack,
    previous: previousTrack,
    setMode: (mode) => setMode(mode, { announceChange: true }),
    get mode() {
      return state.mode;
    },
    get state() {
      return {
        open: dialog.open,
        skin: dialog.dataset.skin,
        track: currentTrack() ? currentTrack().id : null,
        mode: state.mode,
        playing: Boolean(audio) && !audio.paused && !audio.ended,
        duration: state.duration,
        currentTime: audio ? safeNumber(audio.currentTime) : 0
      };
    }
  });
})();
