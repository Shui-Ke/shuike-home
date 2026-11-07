(() => {
  'use strict';
  const grid = window.ShuikeModules.createPointerGrid(document.querySelector('.pointer-grid'));
  const particles = window.ShuikeModules.createParticleJet(document.querySelector('.particle-jet'), document.querySelector('.home-title'));
  // The earth scene is a standalone component (UI/earth/earth.js). Keep a
  // stable facade here so the rest of the home (plans handoff, terminal,
  // settings) never has to wait for the texture to decode.
  let earth = null;
  const globe = Object.freeze({
    get mounted() { return Boolean(earth); },
    get pointCount() { return earth?.pointCount || 0; },
    get earthAnchor() { return earth?.earthAnchor || { visible: false, radius: 0 }; },
    get zoom() { return earth?.zoom ?? 1; },
    get targetZoom() { return earth?.targetZoom ?? 1; },
    get scene() { return earth?.scene || 'earth'; },
    get plans() { return earth?.plans ?? 0; },
    get sun() { return earth?.sun; },
    openMap(...args) { return earth?.openMap(...args); },
    closeMap(...args) { return earth?.closeMap(...args); },
    setZoom(value) { return earth?.setZoom(value); },
    setSolar(value) { return earth?.setSolar(value); },
    setPlans(value) { return earth?.setPlans(value); },
    resetZoom() { return earth?.resetZoom(); },
    pause() { earth?.pause(); },
    resume() { earth?.resume(); },
    destroy() { earth?.destroy(); earth = null; }
  });
  window.ShuikeEarth?.mount({
    globe: {
      centerY: .52,
      maxRadius: 118,
      speed: .13,
      onZoom: ({ isDefault }) => { if (isDefault) particles.resume(); else particles.pause(); }
    }
  }).then(instance => { earth = instance.globe; }).catch(() => {});
  const desktop = document.querySelector('#desktop');
  const dock = document.querySelector('#window-dock');
  const status = document.querySelector('#window-status');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const records = new Map();
  const folderControllers = new Set();
  const projectFolders = new Map();
  const FOLDER_STORAGE_KEY = 'shuike:folder-layout:v1';
  const geometry = window.ShuikeModules.geometry;
  let topIndex = 10;
  let detail = null;
  const hasFolders = record => Boolean(record.panel.querySelector('.window-body > .profile-folder[data-configured="true"]'));
  function bounds() {
    const heading = document.querySelector('.desktop-heading').getBoundingClientRect();
    return { left: 16, top: heading.bottom + 28, right: document.documentElement.clientWidth - 16, bottom: dock.getBoundingClientRect().top - 18 };
  }
  const announce = message => { status.textContent = message; };
  function emit(action, record) { document.dispatchEvent(new CustomEvent(`shuike:window-${action}`, { detail: { id: record.config.id, state: record.state } })); }
  function activate(record) {
    if (record.state !== 'open') return;
    if (topIndex > 900) {
      [...records.values()].sort((a,b) => Number(a.panel.style.zIndex) - Number(b.panel.style.zIndex)).forEach((r,i) => { r.panel.style.zIndex = String(i + 2); });
      topIndex = records.size + 2;
    }
    topIndex = Math.max(topIndex, ...[...records.values()].map(r => Number(r.panel.style.zIndex) || 0));
    record.panel.style.zIndex = String(++topIndex);
    // Personal Profile 窗口始终保持置顶；点击其他窗口只更新激活边框，不把它压到下面。
    const profile = profileRecord();
    if (profile && profile !== record && profile.state === 'open' && !profile.panel.hidden) {
      profile.panel.style.zIndex = String(++topIndex);
    }
    records.forEach(r => { const active = r === record; r.panel.dataset.active = String(active); r.dockButton.setAttribute('aria-pressed', String(active)); });
  }
  function open(record) {
    detail?.back({restoreFocus:false,animateReturn:false});
    const empty = !hasFolders(record);
    record.state = 'open'; record.panel.hidden = false; record.panel.dataset.state = 'open'; record.dockButton.dataset.state = 'open'; record.dockButton.setAttribute('aria-expanded','true');
    record.resize.setRect(record.resize.getRect()); activate(record);
    record.handle.focus({preventScroll:true}); announce(empty ? `${record.config.title}已打开，暂无文件夹，可从桌面拖入` : `${record.config.title}已打开`); emit('open',record);
  }
  function hide(record, state, message = '', { focus = true } = {}) {
    if (detail?.current === record) detail.back({restoreFocus:false,animateReturn:false});
    record.drag.stop(); record.resize.stop(); record.state = state; record.panel.dataset.state = state; record.panel.hidden = true; record.panel.dataset.active = 'false'; record.dockButton.dataset.state = state; record.dockButton.setAttribute('aria-expanded','false'); record.dockButton.setAttribute('aria-pressed','false');
    if (focus) record.dockButton.focus({preventScroll:true});
    const next = [...records.values()].filter(r => r.state === 'open').sort((a,b) => Number(b.panel.style.zIndex) - Number(a.panel.style.zIndex))[0]; if(next) activate(next);
    announce(message || `${record.config.title}已${state === 'closed' ? '关闭' : '最小化'}，可从底栏恢复`); emit(state === 'closed' ? 'close' : 'minimize',record);
  }
  // 文件夹被拖走后，窗口为空就自动收进底栏；Dock 仍可重新打开空窗口。
  function syncWindowVisibility(record) {
    if (!record || record.state !== 'open' || hasFolders(record)) return;
    hide(record, 'minimized', `${record.config.title}已无文件夹，收进底栏；可从底栏重新打开`, { focus: false });
  }
  // 未配置窗口自带的禁用 SHUIKE 文件夹只在窗口为空时露出，避免和有内容的文件夹叠在一起。
  function syncPlaceholder(record) {
    const placeholder = record?.panel.querySelector('.window-body > .profile-folder[data-placeholder="true"]');
    if (placeholder) placeholder.hidden = hasFolders(record);
  }
  // Personal Profile 文件夹当前所在的窗口；文件夹迁移后跟随目标窗口。
  function profileRecord() {
    const panel = projectFolders.get('window-01')?.folderDrag.panel;
    return panel ? records.get(panel.id) : null;
  }
  // 居中在标题与 Dock 之间的可用桌面区域，避免压住顶部 SHUIKE 和底部 Dock。
  function centerProfileWindow(record = profileRecord(), rect = null) {
    if (!record) return null;
    const area = bounds();
    const current = rect || record.resize.getRect();
    const width = Math.min(current.width, area.right - area.left);
    const height = Math.min(current.height, area.bottom - area.top);
    const centered = {
      x: area.left + (area.right - area.left - width) / 2,
      y: area.top + (area.bottom - area.top - height) / 2,
      width,
      height
    };
    const placed = record.resize.setRect(centered);
    record.initial = placed;
    return placed;
  }
  // 散开时 Personal Profile 占中心；其余窗口只用四个角区，避免随机到中心与它叠住。
  function scatterWindows(profile = profileRecord()) {
    const area = bounds();
    const compact = innerWidth <= 700;
    const layouts = geometry.scatter(records.size, area, compact);
    const entries = [...records.values()];
    entries.forEach((record, index) => { record.initial = layouts[index]; });
    if (!profile || compact) {
      entries.forEach(record => record.resize.setRect(record.initial));
      if (profile) centerProfileWindow(profile, profile.initial);
      return;
    }
    centerProfileWindow(profile, profile.initial);
    const slots = geometry.shuffle([[.04, .04], [.94, .02], [.02, .94], [.97, .94]], Math.random);
    let slotIndex = 0;
    entries.forEach((record, index) => {
      if (record === profile) return;
      const slot = slots[slotIndex++ % slots.length];
      const size = layouts[index];
      const jitter = .025;
      const tx = Math.max(0, Math.min(1, slot[0] + (Math.random() - .5) * jitter));
      const ty = Math.max(0, Math.min(1, slot[1] + (Math.random() - .5) * jitter));
      const x = area.left + (area.right - area.left - size.width) * tx;
      const y = area.top + (area.bottom - area.top - size.height) * ty;
      const rect = record.resize.setRect({ x, y, width: size.width, height: size.height });
      record.initial = rect;
    });
  }
  function folderSnapshot() {
    return [...projectFolders].map(([id, { folderDrag }]) => {
      const position = folderDrag.getPosition();
      return { id, owner: folderDrag.panel.id, placed: folderDrag.placed, x: position.x, y: position.y };
    });
  }
  function saveFolderLayout() {
    try { localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify({ version: 1, folders: folderSnapshot() })); } catch (_) {}
  }
  function readFolderLayout() {
    try {
      const data = JSON.parse(localStorage.getItem(FOLDER_STORAGE_KEY) || 'null');
      if (!data || data.version !== 1 || !Array.isArray(data.folders)) return null;
      const saved = new Map();
      for (const item of data.folders) {
        if (!item || typeof item.id !== 'string' || typeof item.owner !== 'string') continue;
        const x = Number(item.x), y = Number(item.y);
        saved.set(item.id, {
          owner: item.owner,
          placed: item.placed === true,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0
        });
      }
      return saved.size ? saved : null;
    } catch (_) { return null; }
  }
  function clearFolderLayout() {
    try { localStorage.removeItem(FOLDER_STORAGE_KEY); } catch (_) {}
  }
  function restoreFolderLayout() {
    const saved = readFolderLayout();
    projectFolders.forEach(({ folderDrag }, id) => {
      const item = saved?.get(id);
      const target = item ? records.get(item.owner)?.panel : null;
      if (item && target && (item.placed || target.id !== id)) folderDrag.moveTo(target, item.x, item.y);
      else folderDrag.home();
    });
  }
  function resetFolderLayout() {
    projectFolders.forEach(({ folderDrag }) => folderDrag.home());
    clearFolderLayout();
  }
  function create(config, index) {
    const panel = document.createElement('section'); panel.id = config.id; panel.className = 'glass-panel'; panel.setAttribute('aria-label',config.title); panel.dataset.state = 'open';
    const handle = document.createElement('header'); handle.className = 'window-bar'; handle.tabIndex = 0; handle.setAttribute('aria-label',`${config.title}标题栏，左键拖动，方向键移动，Alt 加方向键调整大小，Home 复位`);
    const close = document.createElement('button'); close.className = 'window-control window-close'; close.type = 'button'; close.setAttribute('aria-label',`关闭${config.title}`); close.innerHTML = '<span aria-hidden="true">×</span>';
    const minimize = document.createElement('button'); minimize.className = 'window-control window-minimize'; minimize.type = 'button'; minimize.setAttribute('aria-label',`最小化${config.title}`); minimize.innerHTML = '<span aria-hidden="true">−</span>';
    const maximize = document.createElement('button'); maximize.className = 'window-control window-maximize'; maximize.type = 'button'; maximize.setAttribute('aria-label', `放大${config.title}`); maximize.setAttribute('aria-pressed', 'false'); maximize.innerHTML = '<span aria-hidden="true">⤢</span>';
    const name = document.createElement('span'); name.className = 'window-name'; name.textContent = config.title;
    const grip = document.createElement('span'); grip.className = 'window-grip'; grip.setAttribute('aria-hidden','true'); grip.innerHTML = '<i></i><i></i><i></i>'; handle.append(close,minimize,maximize,name,grip);
    const body = document.createElement('div'); body.className = 'window-body';
    if(config.text) { const p = document.createElement('p'); p.textContent = config.text; body.append(p); }
    let projectHref = '';
    try {
      if (config.href && ['https:', 'http:', 'file:'].includes(new URL(config.href, location.href).protocol)) projectHref = config.href;
    } catch (_) { /* Invalid or unconfigured destinations stay inactive. */ }
    const projectLabel = config.projectTitle || config.linkLabel || 'SHUIKE';
    const projectAction = config.action || '';
    // A label without an href keeps an interactive placeholder: the folder opens on
    // hover, drags, and shows the double-click hint, but has no page to navigate to yet.
    // action: 'contact' is the exception: it opens the floating Mac window instead.
    const folderInteractive = Boolean(projectHref || projectAction || config.projectTitle || config.linkLabel);
    const folder = document.createElement(projectHref ? 'a' : 'button'); folder.className = 'profile-folder';
    if (projectHref) { folder.href = projectHref; folder.setAttribute('draggable', 'false'); folder.setAttribute('aria-label', `${projectLabel} 文件夹：双击或回车打开，可拖动移动位置`); }
    else if (projectAction === 'contact') { folder.type = 'button'; folder.dataset.contact = 'true'; folder.setAttribute('aria-label', `${projectLabel} 文件夹：双击或回车打开联系窗口，可拖动移动位置`); }
    else if (folderInteractive) { folder.type = 'button'; folder.dataset.pending = 'true'; folder.setAttribute('aria-label', `${projectLabel} 文件夹：页面尚未配置，单击显示提示，可拖动移动位置`); }
    else { folder.type = 'button'; folder.disabled = true; folder.setAttribute('aria-label', `${projectLabel}，尚未配置项目链接`); }
    folder.innerHTML = '<span class="folder-art" aria-hidden="true"><span class="folder-back"></span><span class="folder-paper"></span><span class="folder-paper"></span><span class="folder-paper"></span><span class="folder-front"></span></span><span class="folder-label"></span>';
    folder.querySelector('.folder-label').textContent = projectLabel;
    folder.dataset.configured = String(folderInteractive);
    if (config.id) folder.dataset.project = config.id;
    if (projectAction) folder.dataset.action = projectAction;
    if (!folderInteractive) folder.dataset.placeholder = 'true';
    body.prepend(folder);
    panel.append(handle,body);
    // 悬停提示放在窗口层，避免撑出滚动条；仅提示，不接收指针。
    if (folderInteractive) { const hint = document.createElement('span'); hint.className = 'folder-hint'; hint.setAttribute('aria-hidden', 'true'); hint.textContent = '双击打开 · 拖动移动'; panel.append(hint); }
    desktop.append(panel);
    // 双击打开、拖动摆放在窗口内（全屏时即视口内）自由移动。
    let folderDrag = null, pendingTimer = 0;
    const openProject = () => {
      if (projectAction === 'contact') {
        if (window.ShuikeContactWindow?.open({ anchor: folder, onStatus: announce })) return;
        announce('联系窗口暂不可用');
        return;
      }
      if (!projectHref) {
        folderDrag?.showHint();
        clearTimeout(pendingTimer);
        folder.classList.remove('is-folder-pending'); void folder.offsetWidth; folder.classList.add('is-folder-pending');
        pendingTimer = setTimeout(() => folder.classList.remove('is-folder-pending'), 380);
        announce(`${projectLabel} 页面尚未配置`);
        return;
      }
      if (window.ShuikeProfileEntry?.open(projectHref)) return;
      if (!window.ShuikePageTransition?.navigate(projectHref)) location.assign(projectHref);
    };
    if (folderInteractive) folderDrag = window.ShuikeModules.createFolderDrag(folder, {
      panel,
      onOpen: openProject,
      onMove: ({ from, to }) => {
        const fromRecord = records.get(from.id);
        const toRecord = records.get(to.id);
        if (fromRecord) syncPlaceholder(fromRecord);
        if (toRecord) syncPlaceholder(toRecord);
        if (fromRecord && fromRecord !== toRecord) syncWindowVisibility(fromRecord);
        if (toRecord) activate(toRecord);
        if (fromRecord && toRecord && fromRecord !== toRecord) {
          const label = folder.querySelector('.folder-label')?.textContent || '文件夹';
          const emptied = fromRecord.state !== 'open';
          announce(`${label} 已移入 ${toRecord.config.title}${emptied ? `，${fromRecord.config.title} 已收进底栏` : ''}`);
        }
        saveFolderLayout();
      }
    });
    if (folderDrag) {
      folderControllers.add(folderDrag);
      projectFolders.set(config.id, { folder, folderDrag });
    }
    // Keyboard activation follows the same mask path; modifier/new-tab clicks stay native.
    if (folderInteractive) folder.addEventListener('click', event => {
      if (event.detail !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openProject();
    }, options);
    if (folderInteractive) folder.addEventListener('animationend', () => folder.classList.remove('is-folder-pending'), options);
    const dockButton = document.createElement('button'); dockButton.type='button'; dockButton.className='dock-button'; dockButton.dataset.state='open'; dockButton.setAttribute('aria-label',`打开或恢复${config.title}`); dockButton.setAttribute('aria-controls',config.id); dockButton.setAttribute('aria-expanded','true'); dockButton.setAttribute('aria-pressed','false');
    const glyphs=[
      '<rect x="4" y="5" width="24" height="22" rx="4"/><path d="M4 12h24M10 8.5h.01M14 8.5h.01"/>',
      '<rect x="5" y="5" width="9" height="9" rx="2"/><rect x="18" y="5" width="9" height="9" rx="2"/><rect x="5" y="18" width="9" height="9" rx="2"/><rect x="18" y="18" width="9" height="9" rx="2"/>',
      '<circle cx="13" cy="13" r="8"/><circle cx="20" cy="20" r="8"/>',
      '<path d="m7 10 6 6-6 6m10 0h8"/>',
      '<path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5z"/>'
    ];
    const icon = document.createElement('span'); icon.className = `dock-icon dock-art-${index+1}`; icon.setAttribute('aria-hidden','true'); icon.innerHTML=`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyphs[index%glyphs.length]}</svg>`;
    const number=document.createElement('small');number.textContent=String(index+1).padStart(2,'0');icon.append(number);
    const tooltip=document.createElement('span');tooltip.className='dock-tooltip';tooltip.textContent=config.title;tooltip.setAttribute('aria-hidden','true');dockButton.append(icon,tooltip);dock.append(dockButton);
    const drag = window.ShuikeModules.createDraggable(panel,{handle,getBounds:bounds});
    const resize = window.ShuikeModules.createResizable(panel,{handle,getBounds:bounds});
    const record = {config,panel,handle,dockButton,drag,resize,maximize,state:'open',initial:null}; records.set(config.id,record);
    maximize.addEventListener('click',()=>detail.current===record?detail.back():detail.expand(record),options);
    panel.addEventListener('pointerdown',()=>activate(record),options); handle.addEventListener('focus',()=>activate(record),options);
    close.addEventListener('click',()=>hide(record,'closed'),options); minimize.addEventListener('click',()=>hide(record,'minimized'),options); dockButton.addEventListener('click',()=>open(record),options);
    panel.addEventListener('shuike:panel-reset',()=> { if(record.initial) resize.setRect(record.initial); },options);
    panel.addEventListener('shuike:panel-resizestart',()=>{drag.stop();activate(record);},options);
    panel.addEventListener('shuike:panel-dragstart',()=>resize.stop(),options);
    return record;
  }
  window.ShuikeWindows.forEach(create);
  const divider=document.createElement('span');divider.className='dock-divider';divider.setAttribute('aria-hidden','true');dock.append(divider);
  const resetButton=document.createElement('button'); resetButton.type='button'; resetButton.className='dock-button dock-reset'; resetButton.innerHTML='<span class="dock-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a10 10 0 1 1 0 9M7 5v7h7"/></svg></span><span class="dock-tooltip" aria-hidden="true">重新散开</span>'; resetButton.setAttribute('aria-label','恢复并随机排列有文件夹的窗口'); dock.append(resetButton);
  const backButton=document.createElement('button'); backButton.type='button'; backButton.className='dock-button dock-back'; backButton.setAttribute('aria-label','返回初始页面'); backButton.innerHTML='<span class="dock-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m14 7-9 9 9 9M5 16h22"/></svg></span><span class="dock-tooltip" aria-hidden="true">返回首页</span>';dock.append(backButton);
  detail=window.ShuikeModules.createWindowDetail({records,button:resetButton,activate,announce});
  function resetAll() {
    detail?.back({restoreFocus:false,animateReturn:false});
    window.ShuikeContactWindow?.close({restoreFocus:false});
    records.forEach(r=> { r.drag.stop();r.resize.stop(); });
    const profile=profileRecord();
    scatterWindows(profile);
    const visible=[];
    records.forEach(r=> {
      const open=hasFolders(r);
      syncPlaceholder(r);
      r.state=open?'open':'minimized';
      r.panel.hidden=!open; r.panel.dataset.state=r.state; r.panel.dataset.active='false';
      r.dockButton.dataset.state=r.state; r.dockButton.setAttribute('aria-expanded',String(open)); r.dockButton.setAttribute('aria-pressed','false');
      if(open) visible.push(r);
    });
    geometry.shuffle(visible,Math.random).filter(r=>r!==profile).forEach(activate);
    if(profile?.state==='open') activate(profile);
    const hidden=records.size-visible.length;
    if(!hidden) announce('全部窗口已按不同大小重新散开');
    else if(visible.length) announce(`${visible.length} 个有文件夹的窗口已重新散开，${hidden} 个空窗口收进底栏`);
    else announce('全部窗口已收进底栏，可从底栏重新打开');
  }
  restoreFolderLayout();
  resetAll(); resetButton.addEventListener('click',()=>detail.current?detail.back():resetAll(),options);
  const dockMotion=window.ShuikeModules.createDock(dock);
  // Settings binds the native checkbox change event to the existing theme API.
  const theme=window.ShuikeModules.createTheme();
  const settings=window.ShuikeModules.createSettings({theme,resetWindows:()=>{resetFolderLayout();resetAll();globe.resetZoom();}});
  const navigation=window.ShuikeModules.createLanding({desktop,dock,backButton,entry:document.querySelector('#landing-menu'),beforeEnter:()=>settings.close({restoreFocus:false}),stopInteractions:()=>{window.ShuikeContactWindow?.close({restoreFocus:false});detail.back({restoreFocus:false,animateReturn:false});records.forEach(r=>{r.drag.stop();r.resize.stop();});}});
  window.ShuikeHome=Object.freeze({
    windows: Object.freeze(Object.fromEntries([...records].map(([id,r])=>[id,Object.freeze({open:()=>open(r),expand:()=>detail.expand(r),restore:()=>{if(detail.current===r)detail.back();},close:()=>hide(r,'closed'),minimize:()=>hide(r,'minimized'),reset:()=>r.drag.reset(),getPosition:r.drag.getPosition,getRect:r.resize.getRect,setRect:r.resize.setRect})]))),
    resetAll,
    detail,
    particles,
    globe,
    theme,
    settings,
    navigation,
    contact: window.ShuikeContactWindow,
    destroy(){window.ShuikeContactWindow?.close({restoreFocus:false});detail.destroy();settings.destroy();navigation.destroy();theme.destroy();try{window.ShuikeEarth?.current?.unmount();}catch(_){}earth=null;particles.destroy();window.ShuikeIntro?.skip();grid.destroy();dockMotion.destroy();folderControllers.forEach(folderDrag=>folderDrag.destroy());records.forEach(r=>{r.drag.destroy();r.resize.destroy();});controller.abort();}
  });
  document.dispatchEvent(new CustomEvent('shuike:ready'));
})();
