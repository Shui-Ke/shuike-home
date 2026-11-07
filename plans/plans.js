/*
 * Plans — a quiet, explorable star map built with Three.js.
 *
 * Structure: a glowing core ("我") → concrete tasks, drawn as dashed threads of
 * particles. Long-term directions are spatial clusters without default lines.
 * Cross-task links sleep in the dark and unfold from a task when it is clicked.
 * Text is HTML positioned from projected 3D coordinates, so it always faces the
 * screen and stays crisp at every camera angle.
 *
 * Classic script on purpose: index.html can be opened directly from disk, where
 * ES modules are blocked by the browser's file:// CORS rules.
 */
(function () {
  'use strict';

  const DATA = window.ShuikePlansData;
  const T = window.THREE;
  const canvas = document.getElementById('plans-canvas');

  if (!DATA || !canvas) return;

  const dom = {
    intro: document.getElementById('intro'),
    introCanvas: document.getElementById('intro-canvas'),
    introSkip: document.getElementById('intro-skip'),
    introStage: document.getElementById('intro-stage'),
    introCaption: document.getElementById('intro-caption'),
    introPercent: document.getElementById('intro-percent'),
    panel: document.getElementById('detail-panel'),
    panelKicker: document.getElementById('detail-kicker'),
    panelContent: document.getElementById('detail-content'),
    panelClose: document.getElementById('detail-close'),
    indexPane: document.getElementById('index-pane'),
    indexCollapse: document.getElementById('index-collapse'),
    indexTree: document.getElementById('index-tree'),
    indexScrim: document.getElementById('index-scrim'),
    statusPanel: document.getElementById('status-panel'),
    statusCollapse: document.getElementById('status-collapse'),
    statusTab: document.getElementById('status-tab'),
    statusScrim: document.getElementById('status-scrim'),
    miniMap: document.getElementById('mini-map'),
    drift: document.getElementById('toggle-drift'),
    labels: document.getElementById('toggle-labels'),
    reset: document.getElementById('reset-view'),
    pieDone: document.getElementById('pie-done'),
    piePercent: document.getElementById('pie-percent'),
    summaryDone: document.getElementById('summary-done'),
    summaryDoing: document.getElementById('summary-doing'),
    summaryTotal: document.getElementById('summary-total'),
    summaryTotalSide: document.getElementById('summary-total-side'),
    summaryDirectionCount: document.getElementById('summary-direction-count'),
    summaryAverage: document.getElementById('summary-average'),
    summaryAverageSide: document.getElementById('summary-average-side'),
    legendDone: document.getElementById('legend-done'),
    legendDoing: document.getElementById('legend-doing'),
    live: document.getElementById('live'),
    fallback: document.getElementById('fallback'),
    fallbackContent: document.getElementById('fallback-content'),
    pageStars: document.getElementById('page-stars'),
    milkyWay: document.getElementById('milky-way'),
    mapFrame: document.getElementById('map-frame')
  };

  const media = {
    compact: window.matchMedia('(max-width: 760px)'),
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)')
  };

  const compact = media.compact.matches;
  let reduced = media.reduced.matches;
  const isTouch = window.matchMedia('(hover: none)').matches;
  const layoutScale = 1;
  const visualScale = compact ? 2 : 1;

  // A portrait screen needs a taller constellation, not a smaller one. The
  // graph is stretched only at the position level so sprites and text keep
  // their proportions.
  function layoutPosition(value) {
    if (!compact) return value;
    value.x *= 0.72;
    value.y *= 1.8;
    value.z *= 0.92;
    return value;
  }

  const state = {
    ready: false,
    entrance: 0,
    entranceStart: 0,
    time: 0,
    visualTime: 0,
    motionTime: 0,
    motionBlend: 0,
    driftOn: !reduced,
    labelsAll: false,
    hoverNode: null,
    selectedNode: null,
    detailOpen: false,
    highlight: null,
    expandedPlan: null,
    expandedNodes: new Set(),
    expandedLinks: new Set(),
    lastCanvasClickAt: 0,
    lastCanvasClickX: 0,
    lastCanvasClickY: 0,
    pointer: null,
    lastHoverCheck: 0,
    skyTurn: 0,
    skyShift: 0,
    lastInteraction: performance.now(),
    lastFrame: performance.now()
  };

  const view = {
    theta: 0.54,
    phi: 1.16,
    radius: 26,
    targetTheta: 0.54,
    targetPhi: 1.16,
    targetRadius: 26,
    target: new T.Vector3(0, 0, 0),
    desiredTarget: new T.Vector3(0, 0, 0),
    minRadius: 9,
    maxRadius: 80
  };

  const graphNodes = [];
  const planNodes = [];
  const directionNodes = [];
  const nodeById = new Map();
  const links = [];
  const pickMeshes = [];
  const labelLayer = document.getElementById('node-layer') || document.createElement('div');
  const treeRows = new Map();
  const treeGroups = new Map();
  const appRoot = document.getElementById('app');
  let intro = null;
  let introFinished = false;
  let introSafety = null;
  let introStatus = '';
  let introPercent = -1;

  let centerNode = null;
  let scene;
  let camera;
  let renderer;
  let graph;
  let raycaster;
  let selectionSprite;
  let starFar;
  let starDust;
  let starMaterialFar;
  let starMaterialDust;
  let starGroupFar;
  let starGroupDust;
  let clusterDust;
  let nebulaGroup;
  let skyStarsGroup;
  let skyStarsMaterial;
  let mapObserver = null;
  let pageStarsContext = null;
  let miniMapContext = null;
  let lastMiniDraw = 0;
  let animationRunning = false;

  const textures = {};
  const tmp = {
    v1: new T.Vector3(),
    v2: new T.Vector3(),
    v3: new T.Vector3(),
    right: new T.Vector3(),
    up: new T.Vector3(),
    dir: new T.Vector3(),
    quat: new T.Quaternion()
  };

  // The homepage language is black, white and particle dust. Direction identity
  // stays spatial; here it is reinforced with a six-step grey scale rather than
  // six unrelated hues.
  const MONO_TONES = ['#f3f3f3', '#d9d9d9', '#c1c1c1', '#aaaaaa', '#949494', '#7f7f7f'];
  const C = {
    cool: 0xc1c1c1,
    warm: 0xf3f3f3,
    white: 0xffffff,
    coldWhite: 0xf7f7f7
  };

  function directionTone(index) {
    return MONO_TONES[index % MONO_TONES.length];
  }

  const stat = (() => {
    let plans = 0;
    let done = 0;
    let sum = 0;
    DATA.directions.forEach(direction => {
      direction.plans.forEach(plan => {
        plans += 1;
        sum += plan.progress;
        if (plan.progress >= 100) done += 1;
      });
    });
    return {
      directions: DATA.directions.length,
      plans,
      done,
      average: plans ? Math.round(sum / plans) : 0
    };
  })();

  /* ------------------------------------------------------------------ init */

  function init() {
    buildFallback();
    setupPageStars();
    if (!T) {
      showFallback();
      return;
    }

    createRenderer();
    createScene();
    createTextures();
    resize();
    buildGraph();
    setupControls();
    setupUi();
    bindEvents();
    applyHomeView(true);
    updateStats();
    buildTree();
    syncIndexState();
    syncUi();

    if ('ResizeObserver' in window) {
      mapObserver = new ResizeObserver(() => {
        if (state.ready) resize();
      });
      mapObserver.observe(canvas);
    }

    renderer.render(scene, camera);
    if (document.documentElement.dataset.entry === 'home') {
      // Continue the homepage sun into this graph's actual projected anchors.
      if (appRoot) appRoot.inert = true;
      if (window.ShuikePlansArrival) window.ShuikePlansArrival.play(introAnchors, () => finishIntro({ skipped: true, fromHome: true }));
      else finishIntro({ skipped: true, fromHome: true });
      return;
    }
    if (appRoot) appRoot.inert = true;
    if (reduced || !window.ShuikePlansIntro || !dom.intro || !dom.introCanvas) {
      finishIntro({ skipped: true });
      return;
    }
    window.requestAnimationFrame(startIntro);
  }

  function introAnchors() {
    if (!centerNode || !directionNodes.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const cameraDistance = Math.max(0.1, camera.position.distanceTo(view.target));
    const worldHeight = 2 * cameraDistance * Math.tan(camera.fov * Math.PI / 360);
    const pixelsPerWorld = rect.height / Math.max(1, worldHeight);
    const screenSize = (worldUnits, min, max) => clamp(worldUnits * pixelsPerWorld, min, max);
    const project = node => {
      const position = new T.Vector3();
      node.group.getWorldPosition(position);
      position.project(camera);
      return {
        x: rect.left + (position.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-position.y * 0.5 + 0.5) * rect.height,
        color: node.colorStyle,
        // The intro collapses the sun and draws its stars at the same pixel
        // footprint as the actual node sprites underneath, so the handoff
        // does not jump in scale.
        coreRadius: screenSize((node.coreScale || 0.8) * 0.22, 4, 30),
        glowRadius: screenSize((node.glowScale || 2) * 0.5, 18, 220),
        ringRadius: node.ringScale ? screenSize(node.ringScale * 0.5, 8, 90) : 0
      };
    };
    return {
      sun: project(centerNode),
      targets: directionNodes.map(project)
    };
  }

  function updateIntroStatus(detail = {}) {
    const stage = detail.stage || 'planets';
    const percent = Number.isFinite(detail.percent) ? detail.percent : 0;
    const copy = {
      planets: ['01 / SOL', '行星隐去，只留下太阳'],
      ignite: ['02 / IGNITE', '太阳开始发光'],
      connect: ['03 / LINK', '粒子链接正在生长'],
      connected: ['04 / READY', '星图已连接'],
      align: ['05 / ALIGN', '收回星图尺寸']
    }[stage] || ['01 / SOL', '行星隐去，只留下太阳'];
    if (stage !== introStatus) {
      introStatus = stage;
      if (dom.introStage) dom.introStage.textContent = copy[0];
      if (dom.introCaption) dom.introCaption.textContent = copy[1];
    }
    if (percent !== introPercent) {
      introPercent = percent;
      if (dom.introPercent) {
        dom.introPercent.textContent = String(percent).padStart(3, '0');
      }
    }
  }

  function skipIntro(event) {
    if (event) event.preventDefault();
    if (introFinished) return;
    if (intro) intro.skip();
    else finishIntro({ skipped: true });
  }

  function onIntroKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      skipIntro();
    }
  }

  function startIntro() {
    if (introFinished) return;
    if (!window.ShuikePlansIntro || !dom.intro || !dom.introCanvas) {
      finishIntro({ skipped: true });
      return;
    }
    try {
      intro = window.ShuikePlansIntro.create(dom.introCanvas, {
        getAnchors: introAnchors,
        onStatus: updateIntroStatus,
        onComplete: () => finishIntro()
      });
      if (!intro) {
        finishIntro({ skipped: true });
        return;
      }
      intro.start();
      if (dom.introSkip) dom.introSkip.addEventListener('click', skipIntro);
      document.addEventListener('keydown', onIntroKeyDown);
      introSafety = window.setTimeout(() => finishIntro({ skipped: true }), 9000);
      announce('正在连接星图');
    } catch (error) {
      console.error('[Plans] intro failed', error);
      finishIntro({ skipped: true });
    }
  }

  function finishIntro(options = {}) {
    if (introFinished) return;
    introFinished = true;
    if (introSafety) {
      window.clearTimeout(introSafety);
      introSafety = null;
    }
    if (dom.introSkip) {
      dom.introSkip.removeEventListener('click', skipIntro);
      dom.introSkip.disabled = true;
    }
    document.removeEventListener('keydown', onIntroKeyDown);
    if (intro) {
      intro.destroy();
      intro = null;
    }
    if (appRoot) appRoot.inert = false;
    if (dom.intro) {
      if (options.fromHome) {
        dom.intro.classList.add('is-gone');
        dom.intro.hidden = true;
        dom.intro.setAttribute('aria-hidden', 'true');
      } else {
        dom.intro.classList.add('is-leaving');
        dom.intro.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
          dom.intro.classList.add('is-gone');
          dom.intro.hidden = true;
        }, 900);
      }
    }
    state.ready = true;
    state.entrance = 1;
    state.entranceStart = performance.now();
    if (reduced) state.motionTime = 0;
    document.body.classList.add('is-ready');
    document.body.classList.remove('is-loading');
    updateStats(true);
    startAnimation();
    announce(options.fromHome || !options.skipped ? '星图已连接' : '已跳过进场动画，星图已连接');
  }

  function createRenderer() {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2));
    if ('outputColorSpace' in renderer && T.SRGBColorSpace) {
      renderer.outputColorSpace = T.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && T.sRGBEncoding) {
      renderer.outputEncoding = T.sRGBEncoding;
    }
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
  }

  function createScene() {
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(compact ? 46 : 40, 1, 0.1, 320);
    graph = new T.Group();
    scene.add(graph);
    raycaster = new T.Raycaster();
    if (!labelLayer.parentElement) {
      labelLayer.className = 'node-layer';
      labelLayer.setAttribute('aria-hidden', 'true');
      dom.mapFrame.appendChild(labelLayer);
    }
  }

  /* --------------------------------------------------------------- textures */

  function makeCanvasTexture(size, draw) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = size;
    textureCanvas.height = size;
    const ctx = textureCanvas.getContext('2d');
    draw(ctx, size);
    const texture = new T.CanvasTexture(textureCanvas);
    if ('colorSpace' in texture && T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
    else if ('encoding' in texture && T.sRGBEncoding) texture.encoding = T.sRGBEncoding;
    texture.minFilter = T.LinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function makeGlowTexture() {
    return makeCanvasTexture(256, (ctx, size) => {
      const c = size / 2;
      const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.055, 'rgba(255,255,255,.82)');
      gradient.addColorStop(0.18, 'rgba(255,255,255,.34)');
      gradient.addColorStop(0.38, 'rgba(255,255,255,.12)');
      gradient.addColorStop(0.66, 'rgba(255,255,255,.035)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    });
  }

  function makeStarTexture() {
    return makeCanvasTexture(256, (ctx, size) => {
      const c = size / 2;
      const dot = ctx.createRadialGradient(c, c, 0, c, c, c * 0.52);
      dot.addColorStop(0, 'rgba(255,255,255,1)');
      dot.addColorStop(0.05, 'rgba(255,255,255,1)');
      dot.addColorStop(0.12, 'rgba(255,255,255,.7)');
      dot.addColorStop(0.24, 'rgba(255,255,255,.13)');
      dot.addColorStop(0.52, 'rgba(255,255,255,0)');
      ctx.fillStyle = dot;
      ctx.fillRect(0, 0, size, size);

      // A barely visible diffraction ring keeps the larger points from reading
      // as generic UI dots without bringing back the old star-spike ornament.
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function makeProgressRing(progress, done) {
    return makeCanvasTexture(256, (ctx, size) => {
      const c = size / 2;
      const r = 104;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      if (progress > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = done ? 'rgba(255,255,255,.96)' : 'rgba(255,255,255,.9)';
        ctx.lineWidth = done ? 3.8 : 2.7;
        ctx.shadowColor = 'rgba(255,255,255,.95)';
        ctx.shadowBlur = done ? 20 : 11;
        ctx.stroke();
        ctx.restore();

        if (!done) {
          const angle = -Math.PI / 2 + Math.PI * 2 * progress;
          ctx.save();
          ctx.beginPath();
          ctx.arc(c + Math.cos(angle) * r, c + Math.sin(angle) * r, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.shadowColor = 'rgba(255,255,255,.95)';
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.restore();
        }
      }

      if (done) {
        ctx.beginPath();
        ctx.arc(c, c, r + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.13)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });
  }

  function makeDashedRing() {
    return makeCanvasTexture(256, (ctx, size) => {
      const c = size / 2;
      ctx.setLineDash([1.5, 8]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(c, c, 108, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.66)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c, c, 84, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function makeNebulaTexture() {
    let seed = 0x9e3779b9;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    return makeCanvasTexture(512, (ctx, size) => {
      const c = size / 2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 24; i += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.pow(random(), 0.7) * 168;
        const x = c + Math.cos(angle) * distance;
        const y = c + Math.sin(angle) * distance * 0.72;
        const radius = 34 + random() * 120;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${0.025 + random() * 0.035})`);
        gradient.addColorStop(0.45, `rgba(255,255,255,${0.012 + random() * 0.018})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
      }
      const veil = ctx.createRadialGradient(c, c, 0, c, c, c);
      veil.addColorStop(0, 'rgba(0,0,0,0)');
      veil.addColorStop(0.74, 'rgba(0,0,0,0)');
      veil.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, size, size);
    });
  }

  function createTextures() {
    textures.glow = makeGlowTexture();
    textures.star = makeStarTexture();
    textures.dashed = makeDashedRing();
    textures.nebula = makeNebulaTexture();
    textures.ringDone = makeProgressRing(1, true);
    textures.ringProgress = new Map();
    DATA.directions.forEach(direction => {
      direction.plans.forEach(plan => {
        if (plan.progress >= 100) return;
        const key = `${plan.progress}`;
        if (!textures.ringProgress.has(key)) {
          textures.ringProgress.set(key, makeProgressRing(plan.progress / 100, false));
        }
      });
    });
  }

  /* ----------------------------------------------------------------- graph */

  function buildGraph() {
    addBackdrop();
    addSelectionRing();

    centerNode = createCenterNode();
    createDirectionNodes();
    createPlanNodes();
    createLinks();

    updateStats();
  }

  function addBackdrop() {
    const nebulaMaterialA = new T.SpriteMaterial({
      map: textures.nebula,
      color: 0x9a9a9a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending
    });
    const nebulaA = new T.Sprite(nebulaMaterialA);
    nebulaA.position.set(-14, 7, -42);
    nebulaA.scale.set(92, 62, 1);
    nebulaA.renderOrder = -20;

    const nebulaMaterialB = new T.SpriteMaterial({
      map: textures.nebula,
      color: 0x777777,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending
    });
    const nebulaB = new T.Sprite(nebulaMaterialB);
    nebulaB.position.set(22, -9, -50);
    nebulaB.scale.set(78, 55, 1);
    nebulaB.renderOrder = -20;

    const nebulaMaterialC = new T.SpriteMaterial({
      map: textures.nebula,
      color: 0x8c8c8c,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending
    });
    const nebulaC = new T.Sprite(nebulaMaterialC);
    nebulaC.position.set(-2, -2, -58);
    nebulaC.scale.set(146, 96, 1);
    nebulaC.material.rotation = .38;
    nebulaC.renderOrder = -21;

    nebulaGroup = new T.Group();
    nebulaGroup.add(nebulaA, nebulaB, nebulaC);
    scene.add(nebulaGroup);
  }

  // A sparse far shell for depth. It is fixed in world space, so orbiting the
  // camera with the mouse naturally turns the sky behind the constellation.
  function addSkyStars() {
    const cloud = makeStarCloud(
      compact ? 520 : 1200,
      32,
      92,
      [1.0, 2.9],
      .9,
      [0xffffff, 0xe4e4e4, 0xb9b9b9, 0x8c8c8c],
      0x4f1bbcdc
    );
    cloud.material.depthTest = false;
    cloud.points.renderOrder = -10;
    skyStarsMaterial = cloud.material;
    skyStarsGroup = new T.Group();
    skyStarsGroup.add(cloud.points);
    scene.add(skyStarsGroup);
  }

  function makeStarCloud(count, minRadius, maxRadius, sizeRange, opacity, palette, seed) {
    let localSeed = seed >>> 0;
    const random = () => {
      localSeed = (localSeed * 1664525 + 1013904223) >>> 0;
      return localSeed / 4294967296;
    };

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const seeds = new Float32Array(count);
    const color = new T.Color();
    const paletteColors = palette.map(hex => new T.Color(hex));

    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const cosPhi = random() * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const radius = minRadius + Math.pow(random(), 0.64) * (maxRadius - minRadius);
      positions[i * 3] = Math.cos(theta) * sinPhi * radius;
      positions[i * 3 + 1] = cosPhi * radius;
      positions[i * 3 + 2] = Math.sin(theta) * sinPhi * radius;

      color.copy(paletteColors[Math.floor(random() * paletteColors.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      const bright = random();
      sizes[i] = sizeRange[0] + Math.pow(bright, 2.2) * (sizeRange[1] - sizeRange[0]);
      alphas[i] = 0.18 + random() * 0.7;
      seeds[i] = random();
    }

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new T.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new T.BufferAttribute(alphas, 1));
    geometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));

    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2) }
      },
      vertexShader: [
        'attribute float aSize;',
        'attribute float aAlpha;',
        'attribute float aSeed;',
        'attribute vec3 aColor;',
        'uniform float uTime;',
        'uniform float uOpacity;',
        'uniform float uPixelRatio;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  float twinkle = 0.72 + 0.28 * sin(uTime * (0.18 + aSeed * 0.55) + aSeed * 31.4159);',
        '  float depthScale = clamp(95.0 / max(4.0, -mvPosition.z), 0.45, 3.4);',
        '  gl_PointSize = clamp(aSize * uPixelRatio * depthScale * (0.78 + 0.4 * twinkle), 0.7, 8.5);',
        '  vColor = aColor;',
        '  vAlpha = aAlpha * twinkle * uOpacity;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  float core = smoothstep(0.5, 0.03, d);',
        '  float alpha = pow(core, 2.1) * vAlpha;',
        '  if (alpha < 0.004) discard;',
        '  gl_FragColor = vec4(vColor, alpha);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n')
    });

    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    return { points, material };
  }

  function addStarfield() {
    const palette = [0xffffff, 0xe8e8e8, 0xcfcfcf, 0xa6a6a6, 0x7d7d7d];
    starFar = makeStarCloud(compact ? 2600 : 4400, 32, 96, [0.9, 2.8], 0.95, palette, 0x5f3759df);
    starDust = makeStarCloud(compact ? 600 : 1100, 7, 30, [0.7, 2.0], 0.46, [0xd8d8d8, 0xffffff, 0x949494], 0x2b7c4a21);

    starGroupFar = new T.Group();
    starGroupFar.add(starFar.points);
    scene.add(starGroupFar);

    starGroupDust = new T.Group();
    starGroupDust.add(starDust.points);
    scene.add(starGroupDust);

    starMaterialFar = starFar.material;
    starMaterialDust = starDust.material;
  }

  function addSelectionRing() {
    const material = new T.SpriteMaterial({
      map: textures.dashed,
      color: C.warm,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: T.AdditiveBlending
    });
    selectionSprite = new T.Sprite(material);
    selectionSprite.visible = false;
    selectionSprite.renderOrder = 6;
    scene.add(selectionSprite);
  }

  function addGlowSprite(group, color, opacity, scale, map = textures.glow) {
    const material = new T.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: T.AdditiveBlending
    });
    const sprite = new T.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    sprite.renderOrder = 2;
    group.add(sprite);
    return sprite;
  }

  function addCoreSprite(group, color, opacity, scale) {
    const material = new T.SpriteMaterial({
      map: textures.star,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: T.AdditiveBlending
    });
    const sprite = new T.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    sprite.renderOrder = 5;
    group.add(sprite);
    return sprite;
  }

  function addPickMesh(group, radius, node) {
    const geometry = new T.SphereGeometry(1, 8, 6);
    const material = new T.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      colorWrite: false
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.scale.setScalar(radius);
    mesh.userData.node = node;
    mesh.renderOrder = -1;
    group.add(mesh);
    pickMeshes.push(mesh);
    return mesh;
  }

  function createNodeLabel(node) {
    const anchor = document.createElement('div');
    anchor.className = 'node-anchor';
    const label = document.createElement('div');
    label.className = 'node-label';
    label.style.setProperty('--node-color', node.colorStyle);

    if (node.type === 'plan') {
      label.classList.add('label-plan');
      const bubble = document.createElement('span');
      bubble.className = 'plan-bubble';
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.className = 'plan-name';
      name.textContent = node.name;
      const percent = document.createElement('span');
      percent.className = 'plan-percent';
      percent.textContent = `${node.pct}%`;
      bubble.append(dot, name, percent);
      label.appendChild(bubble);
    } else if (node.type === 'direction') {
      label.classList.add('label-direction');
      const zh = document.createElement('span');
      zh.className = 'label-zh';
      zh.textContent = node.name;
      const en = document.createElement('span');
      en.className = 'label-en';
      en.textContent = node.en;
      const meta = document.createElement('span');
      meta.className = 'label-meta';
      meta.textContent = `${pad2(node.data.plans.length)} 计划 · ${node.pct}%`;
      label.append(zh, en, meta);
      label.classList.add('is-visible');
    } else {
      label.classList.add('label-center');
      const zh = document.createElement('span');
      zh.className = 'label-zh';
      zh.textContent = node.name;
      const en = document.createElement('span');
      en.className = 'label-en';
      en.textContent = node.en;
      const meta = document.createElement('span');
      meta.className = 'label-meta';
      meta.textContent = `${pad2(stat.plans)} 个计划 · ${stat.average}%`;
      label.append(zh, en, meta);
      label.classList.add('is-visible');
    }

    anchor.appendChild(label);
    labelLayer.appendChild(anchor);
    node.label = { anchor, el: label };
  }

  function createCenterNode() {
    const progress = stat.average / 100;
    const node = {
      id: 'self',
      type: 'center',
      name: DATA.self.name,
      en: DATA.self.en,
      data: DATA.self,
      progress,
      pct: stat.average,
      color: new T.Color(C.warm),
      colorStyle: directionTone(0),
      position: new T.Vector3(0, 0, 0),
      done: false,
      baseGlowOpacity: 0.76,
      baseCoreOpacity: 1,
      glowScale: 3.4 * visualScale,
      coreScale: 0.94 * visualScale,
      phase: 0.3,
      hover: 0,
      hoverTarget: 0,
      dim: 1,
      dimTarget: 1,
      pulseSpeed: 0.48
    };

    const group = new T.Group();
    group.position.copy(node.position);
    graph.add(group);
    node.group = group;

    node.glow = addGlowSprite(group, C.warm, node.baseGlowOpacity, node.glowScale);
    node.innerGlow = addGlowSprite(group, C.coldWhite, 0.52, node.glowScale * 0.4);
    node.core = addCoreSprite(group, C.white, node.baseCoreOpacity, node.coreScale);

    const ringMaterial = new T.MeshBasicMaterial({
      color: C.warm,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: T.AdditiveBlending
    });
    const ringGeometry = new T.TorusGeometry(1, 0.0048, 5, 128);
    const ringA = new T.Mesh(ringGeometry, ringMaterial);
    ringA.rotation.set(1.18, 0.12, 0.16);
    ringA.scale.setScalar(1.75 * visualScale);
    ringA.renderOrder = 4;
    group.add(ringA);
    node.ringA = ringA;

    const ringMaterialB = new T.MeshBasicMaterial({
      color: C.cool,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: T.AdditiveBlending
    });
    const ringB = new T.Mesh(ringGeometry, ringMaterialB);
    ringB.rotation.set(0.4, 0.7, -0.3);
    ringB.scale.setScalar(2.35 * visualScale);
    ringB.renderOrder = 4;
    group.add(ringB);
    node.ringB = ringB;

    const shell = makeShellPoints();
    group.add(shell.points);
    node.shell = shell;

    addPickMesh(group, 1.25 * visualScale, node);
    createNodeLabel(node);
    registerNode(node);
    return node;
  }

  function makeShellPoints() {
    const count = compact ? 150 : 240;
    let seed = 0x9d2c5680;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const seeds = new Float32Array(count);
    const color = new T.Color();
    const palette = [new T.Color(C.warm), new T.Color(C.white), new T.Color(C.cool)];

    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const cosPhi = random() * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const radius = 1.15 + Math.pow(random(), 0.55) * 2.1;
      positions[i * 3] = Math.cos(theta) * sinPhi * radius;
      positions[i * 3 + 1] = cosPhi * radius * 0.72;
      positions[i * 3 + 2] = Math.sin(theta) * sinPhi * radius;
      color.copy(palette[Math.floor(random() * palette.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = 0.45 + random() * 1.15;
      alphas[i] = 0.35 + random() * 0.6;
      seeds[i] = random();
    }

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new T.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new T.BufferAttribute(alphas, 1));
    geometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));

    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.5 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2) }
      },
      vertexShader: [
        'attribute float aSize;',
        'attribute float aAlpha;',
        'attribute float aSeed;',
        'attribute vec3 aColor;',
        'uniform float uTime;',
        'uniform float uOpacity;',
        'uniform float uPixelRatio;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  float twinkle = 0.7 + 0.3 * sin(uTime * (0.7 + aSeed) + aSeed * 22.0);',
        '  gl_PointSize = clamp(aSize * uPixelRatio * (60.0 / max(5.0, -mvPosition.z)) * (0.8 + 0.4 * twinkle), 1.0, 8.0);',
        '  vColor = aColor;',
        '  vAlpha = aAlpha * twinkle * uOpacity;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  float core = smoothstep(0.5, 0.04, d);',
        '  float alpha = pow(core, 2.0) * vAlpha;',
        '  if (alpha < 0.004) discard;',
        '  gl_FragColor = vec4(vColor, alpha);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n')
    });

    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    return { points, material };
  }

  const directionLayout = [
    { az: -0.85, el: 0.31 },
    { az: 1.15, el: 0.04 },
    { az: 2.35, el: -0.37 },
    { az: 3.55, el: 0.42 },
    { az: 4.75, el: -0.23 },
    { az: 5.85, el: 0.13 }
  ];

  function createDirectionNodes() {
    let seed = 0x6a09e667;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    DATA.directions.forEach((definition, index) => {
      const layout = directionLayout[index % directionLayout.length];
      const radius = 7.4 + random() * 0.65;
      const cosEl = Math.cos(layout.el);
      const basePosition = new T.Vector3(
        Math.sin(layout.az) * cosEl * radius,
        Math.sin(layout.el) * radius,
        Math.cos(layout.az) * cosEl * radius
      ).multiplyScalar(layoutScale);
      const position = layoutPosition(basePosition.clone());

      const progress = definition.plans.length
        ? definition.plans.reduce((sum, plan) => sum + plan.progress, 0) / definition.plans.length / 100
        : 0;
      const tone = directionTone(index);

      const node = {
        id: definition.id,
        type: 'direction',
        name: definition.name,
        en: definition.en,
        data: definition,
        progress,
        pct: Math.round(progress * 100),
        color: new T.Color(tone),
        colorStyle: tone,
        position,
        basePosition,
        done: false,
        baseGlowOpacity: 0.44,
        baseCoreOpacity: 0.9,
        glowScale: 1.55 * visualScale,
        coreScale: 0.44 * visualScale,
        phase: random() * Math.PI * 2,
        hover: 0,
        hoverTarget: 0,
        dim: 1,
        dimTarget: 1,
        pulseSpeed: 0.3 + random() * 0.2,
        layout
      };

      const group = new T.Group();
      group.position.copy(position);
      graph.add(group);
      node.group = group;

      node.glow = addGlowSprite(group, tone, node.baseGlowOpacity, node.glowScale);
      node.core = addCoreSprite(group, C.white, node.baseCoreOpacity, node.coreScale);

      const ringGroup = new T.Group();
      ringGroup.rotation.x = Math.PI / 2 + 0.28 + random() * 0.25;
      ringGroup.rotation.z = random() * Math.PI;
      ringGroup.scale.setScalar(0.88 * visualScale);
      group.add(ringGroup);
      node.ringGroup = ringGroup;

      const ringMaterial = new T.MeshBasicMaterial({
        color: tone,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      const ring = new T.Mesh(new T.TorusGeometry(1, 0.0038, 5, 112), ringMaterial);
      ring.renderOrder = 3;
      ringGroup.add(ring);
      node.ring = ring;

      const pivot = new T.Group();
      pivot.rotation.z = random() * Math.PI * 2;
      ringGroup.add(pivot);
      const orbitMaterial = new T.SpriteMaterial({
        map: textures.glow,
        color: tone,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      const orbitDot = new T.Sprite(orbitMaterial);
      orbitDot.scale.setScalar(0.13 * visualScale);
      orbitDot.position.set(1, 0, 0);
      orbitDot.renderOrder = 4;
      pivot.add(orbitDot);
      node.pivot = pivot;

      addPickMesh(group, 1.05 * visualScale, node);
      createNodeLabel(node);
      registerNode(node);
      directionNodes.push(node);
    });
  }

  function createPlanNodes() {
    let seed = 0x3c6ef372;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    directionNodes.forEach((directionNode, directionIndex) => {
      const outward = directionNode.position.clone().normalize();
      const helper = Math.abs(outward.y) > 0.92 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
      const tangent = new T.Vector3().crossVectors(helper, outward).normalize();
      const bitangent = new T.Vector3().crossVectors(outward, tangent).normalize();
      const plans = directionNode.data.plans;

      plans.forEach((plan, planIndex) => {
        const angle = planIndex * 2.399963 + directionIndex * 0.77 + (random() - 0.5) * 0.2;
        const distance = 2.35 + planIndex * 0.21 + random() * 0.62;
        const offset = new T.Vector3()
          .addScaledVector(tangent, Math.cos(angle) * distance)
          .addScaledVector(bitangent, Math.sin(angle) * distance)
          .addScaledVector(outward, 0.62 + random() * 0.48);
        offset.y += ((planIndex % 2) * 2 - 1) * (0.24 + random() * 0.3);

        const position = layoutPosition(directionNode.basePosition.clone().add(offset.multiplyScalar(layoutScale)));
        const progress = plan.progress / 100;
        const done = plan.progress >= 100;
        const node = {
          id: plan.id,
          type: 'plan',
          name: plan.name,
          en: plan.en,
          data: plan,
          direction: directionNode,
          progress,
          pct: plan.progress,
          done,
          color: directionNode.color,
          colorStyle: directionNode.colorStyle,
          position,
          baseGlowOpacity: 0.34,
          baseCoreOpacity: 0.94,
          glowScale: 0.43 * visualScale,
          coreScale: 0.17 * visualScale,
          ringScale: 0.72 * visualScale,
          phase: random() * Math.PI * 2,
          hover: 0,
          hoverTarget: 0,
          dim: 1,
          dimTarget: 1,
          pulseSpeed: 0.24 + random() * 0.22
        };

        const group = new T.Group();
        group.position.copy(position);
        graph.add(group);
        node.group = group;

        node.glow = addGlowSprite(group, directionNode.colorStyle, node.baseGlowOpacity, node.glowScale);
        node.core = addCoreSprite(group, C.white, node.baseCoreOpacity, node.coreScale);

        const ringTexture = done ? textures.ringDone : textures.ringProgress.get(`${plan.progress}`);
        const ringMaterial = new T.SpriteMaterial({
          map: ringTexture,
          color: done ? C.warm : directionNode.colorStyle,
          transparent: true,
          opacity: done ? 1 : 0.62,
          depthWrite: false,
          blending: T.AdditiveBlending
        });
        const ring = new T.Sprite(ringMaterial);
        ring.scale.set(node.ringScale, node.ringScale, 1);
        ring.renderOrder = 3;
        group.add(ring);
        node.ring = ring;
        node.baseRingOpacity = ringMaterial.opacity;

        if (done) {
          node.doneHalo = addGlowSprite(group, C.warm, 0.12, node.ringScale * 1.65);
          node.doneHalo.renderOrder = 2;
        }

        addPickMesh(group, 0.44 * visualScale + 0.28, node);
        createNodeLabel(node);
        registerNode(node);
        planNodes.push(node);
      });
    });
  }

  function registerNode(node) {
    nodeById.set(node.id, node);
    graphNodes.push(node);
  }

  function addClusterDust() {
    let seed = 0x243f6a88;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const perCluster = compact ? 38 : 82;
    const positions = [];
    const colors = [];
    const sizes = [];
    const alphas = [];
    const seeds = [];
    const white = new T.Color(C.white);

    directionNodes.forEach(direction => {
      for (let i = 0; i < perCluster; i += 1) {
        const theta = random() * Math.PI * 2;
        const cosPhi = random() * 2 - 1;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        const radius = 0.55 + Math.pow(random(), 0.62) * 4.0;
        const point = new T.Vector3(
          Math.cos(theta) * sinPhi * radius,
          cosPhi * radius * 0.86,
          Math.sin(theta) * sinPhi * radius
        );
        point.add(direction.basePosition);
        layoutPosition(point);
        positions.push(point.x, point.y, point.z);
        const color = direction.color.clone().lerp(white, 0.18 + random() * 0.5);
        colors.push(color.r, color.g, color.b);
        sizes.push(0.28 + Math.pow(random(), 1.8) * 0.95);
        alphas.push(0.1 + random() * 0.36);
        seeds.push(random());
      }

      direction.data.plans.forEach(plan => {
        const planNode = nodeById.get(plan.id);
        if (!planNode) return;
        for (let i = 0; i < 5; i += 1) {
          const point = planNode.position.clone().add(new T.Vector3(
            (random() - 0.5) * 1.2,
            (random() - 0.5) * 1.2,
            (random() - 0.5) * 1.2
          ));
          positions.push(point.x, point.y, point.z);
          const color = direction.color.clone().lerp(white, 0.3 + random() * 0.5);
          colors.push(color.r, color.g, color.b);
          sizes.push(0.24 + random() * 0.5);
          alphas.push(0.12 + random() * 0.34);
          seeds.push(random());
        }
      });
    });

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new T.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new T.Float32BufferAttribute(alphas, 1));
    geometry.setAttribute('aSeed', new T.Float32BufferAttribute(seeds, 1));

    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.55 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2) }
      },
      vertexShader: [
        'attribute float aSize;',
        'attribute float aAlpha;',
        'attribute float aSeed;',
        'attribute vec3 aColor;',
        'uniform float uTime;',
        'uniform float uOpacity;',
        'uniform float uPixelRatio;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  float twinkle = 0.66 + 0.34 * sin(uTime * (0.4 + aSeed * 0.6) + aSeed * 18.0);',
        '  float depthScale = clamp(80.0 / max(4.0, -mvPosition.z), 0.35, 2.9);',
        '  gl_PointSize = clamp(aSize * uPixelRatio * depthScale * (0.8 + 0.35 * twinkle), 0.55, 5.8);',
        '  vColor = aColor;',
        '  vAlpha = aAlpha * twinkle * uOpacity;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  float core = smoothstep(0.5, 0.02, d);',
        '  float alpha = pow(core, 2.4) * vAlpha;',
        '  if (alpha < 0.004) discard;',
        '  gl_FragColor = vec4(vColor, alpha);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n')
    });

    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 0;
    graph.add(points);
    clusterDust = { points, material };
  }

  function createLinks() {
    const indexMap = new Map();
    graphNodes.forEach((node, index) => indexMap.set(node, index));

    // The only default connection is the one from "我" to each concrete task.
    // Directions remain as spatial clusters and labels, not as line hubs.
    planNodes.forEach(plan => {
      addLink({
        kind: 'task',
        a: centerNode,
        b: plan,
        seed: indexMap.get(plan) + 1,
        progress: plan.progress,
        colorA: C.warm,
        colorB: plan.color,
        baseOpacity: compact ? 0.92 : 0.84
      });
    });

    // Cross-task links are dormant until a task is clicked. They then unfold
    // from the selected star toward the tasks it touches.
    DATA.links.forEach((definition, index) => {
      const from = nodeById.get(definition.from);
      const to = nodeById.get(definition.to);
      if (!from || !to || from.type !== 'plan' || to.type !== 'plan') return;
      if (from.direction === to.direction) return;
      addLink({
        kind: 'cross',
        a: from,
        b: to,
        seed: index + 41,
        progress: (from.progress + to.progress) * 0.5,
        colorA: from.color,
        colorB: to.color,
        baseOpacity: 0,
        note: definition.note
      });
    });
  }

  function makeLinkCurve(a, b, kind, seed) {
    const start = a.position.clone();
    const end = b.position.clone();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const length = start.distanceTo(end);
    let control;

    if (kind === 'task') {
      const direction = new T.Vector3().subVectors(end, start);
      const side = new T.Vector3().crossVectors(direction, new T.Vector3(0, 1, 0));
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
      side.normalize();
      const sign = seed % 2 === 0 ? 1 : -1;
      control = mid.clone()
        .addScaledVector(side, sign * Math.min(0.85, length * 0.045))
        .add(new T.Vector3(0, 0.1 + (seed % 3) * 0.045, 0));
    } else {
      const direction = new T.Vector3().subVectors(end, start);
      const side = new T.Vector3(-direction.z, 0, direction.x);
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
      side.normalize();
      const sign = seed % 2 === 0 ? 1 : -1;
      const closeness = clamp(1 - mid.length() / 6.5, 0, 1);
      const lift = 0.5 + length * 0.035 + closeness * 2.2;
      const outward = mid.lengthSq() > 0.01
        ? mid.clone().normalize()
        : side.clone().multiplyScalar(sign);
      control = mid.clone()
        .add(new T.Vector3(0, lift, 0))
        .addScaledVector(side, sign * length * (0.04 + closeness * 0.06))
        .addScaledVector(outward, 0.2 + closeness * 1.5);
    }

    return new T.QuadraticBezierCurve3(start, control, end);
  }

  function addLink(config) {
    const curve = makeLinkCurve(config.a, config.b, config.kind, config.seed);
    const length = Math.max(0.5, curve.getLength());
    let localSeed = (config.seed * 2654435761) >>> 0;
    const random = () => {
      localSeed = (localSeed * 1664525 + 1013904223) >>> 0;
      return localSeed / 4294967296;
    };

    // Build the link out of short groups of particles with quiet gaps: a
    // dashed line made of starlight rather than a continuous stroke.
    const dashCount = config.kind === 'task'
      ? Math.round(clamp(length * (compact ? 2.4 : 3.0), 12, 36))
      : Math.round(clamp(length * 2.8, 10, 30));
    const perDash = compact ? 2 : 3;
    const particleCount = dashCount * perDash;
    const positions = new Float32Array(particleCount * 3);
    const tValues = new Float32Array(particleCount);
    const seeds = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);
    const point = new T.Vector3();

    let cursor = 0;
    for (let dash = 0; dash < dashCount; dash += 1) {
      for (let j = 0; j < perDash; j += 1) {
        const within = perDash === 2 ? 0.27 + j * 0.2 : 0.24 + j * 0.16;
        const t = clamp((dash + within) / dashCount, 0.012, 0.988);
        curve.getPointAt(t, point);
        positions[cursor * 3] = point.x;
        positions[cursor * 3 + 1] = point.y;
        positions[cursor * 3 + 2] = point.z;
        tValues[cursor] = t;
        seeds[cursor] = random();
        let size = (config.kind === 'task' ? 0.92 : 1.12) + random() * 0.62;
        if (dash % 5 === 0) size += 0.28;
        sizes[cursor] = size;
        cursor += 1;
      }
    }

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('aT', new T.BufferAttribute(tValues, 1));
    geometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
    geometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));

    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new T.Color(config.colorA) },
        uColorB: { value: new T.Color(config.colorB) },
        uWarm: { value: new T.Color(C.warm) },
        uLit: { value: config.kind === 'cross' ? 1 : 0 },
        uReveal: { value: config.kind === 'cross' ? 0 : 1 },
        uRevealDir: { value: 0 },
        uBoost: { value: 0 },
        uOpacity: { value: config.kind === 'cross' ? 0 : config.baseOpacity },
        uStrength: { value: config.kind === 'cross' ? 0.72 + 0.28 * config.progress : 1 },
        uWarmMix: { value: config.kind === 'cross' ? 0.48 : 0.3 },
        uSeed: { value: (config.seed * 0.61803398875) % 1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2) },
        uPointScale: { value: config.kind === 'cross' ? (compact ? 1.5 : 1.18) : (compact ? 1.22 : 1) }
      },
      vertexShader: [
        'attribute float aT;',
        'attribute float aSeed;',
        'attribute float aSize;',
        'uniform float uTime;',
        'uniform float uPixelRatio;',
        'uniform float uPointScale;',
        'varying float vT;',
        'varying float vSeed;',
        'varying float vTwinkle;',
        'void main() {',
        '  vT = aT;',
        '  vSeed = aSeed;',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  float twinkle = 0.72 + 0.28 * sin(uTime * (0.55 + aSeed * 0.8) + aSeed * 24.0);',
        '  gl_PointSize = clamp(aSize * uPointScale * uPixelRatio * (55.0 / max(6.0, -mvPosition.z)), 1.0, 7.5);',
        '  vTwinkle = twinkle;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'uniform vec3 uColorA;',
        'uniform vec3 uColorB;',
        'uniform vec3 uWarm;',
        'uniform float uLit;',
        'uniform float uReveal;',
        'uniform float uRevealDir;',
        'uniform float uBoost;',
        'uniform float uOpacity;',
        'uniform float uStrength;',
        'uniform float uWarmMix;',
        'uniform float uTime;',
        'uniform float uSeed;',
        'varying float vT;',
        'varying float vSeed;',
        'varying float vTwinkle;',
        'void main() {',
        '  float radius = length(gl_PointCoord - vec2(0.5));',
        '  float dotShape = smoothstep(0.5, 0.08, radius);',
        '  if (dotShape < 0.01) discard;',
        '  float revealSample = mix(vT, 1.0 - vT, uRevealDir);',
        '  float reveal = 1.0 - smoothstep(uReveal - 0.025, uReveal + 0.005, revealSample);',
        '  float lit = 1.0 - smoothstep(uLit - 0.03, uLit + 0.01, vT);',
        '  float front = exp(-pow((vT - uLit) / 0.03, 2.0)) * step(0.002, uLit);',
        '  float wave = 0.5 + 0.5 * sin((vT * 20.0 - uTime * 1.1 + uSeed * 6.2831853) * 3.1415926);',
        '  float brightness = mix(0.085, 0.82, lit) + front * 0.3 + lit * wave * 0.11;',
        '  brightness += uBoost * (0.12 + 0.36 * lit);',
        '  float edge = smoothstep(0.0, 0.045, vT);',
        '  float alpha = dotShape * reveal * edge * brightness * uOpacity * uStrength * vTwinkle;',
        '  vec3 color = mix(mix(uColorA, uColorB, smoothstep(0.0, 1.0, vT)), uWarm, lit * uWarmMix + front * 0.26);',
        '  gl_FragColor = vec4(color * (1.0 + front * 0.35), alpha);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n')
    });

    const pointCloud = new T.Points(geometry, material);
    pointCloud.frustumCulled = false;
    pointCloud.renderOrder = config.kind === 'cross' ? 2 : 1;
    pointCloud.visible = config.kind === 'task';
    graph.add(pointCloud);

    const link = {
      kind: config.kind,
      a: config.a,
      b: config.b,
      note: config.note || '',
      curve,
      points: pointCloud,
      material,
      baseOpacity: config.baseOpacity,
      opacity: config.kind === 'cross' ? 0 : config.baseOpacity,
      opacityTarget: config.kind === 'cross' ? 0 : config.baseOpacity,
      boost: 0,
      boostTarget: 0,
      reveal: config.kind === 'cross' ? 0 : 1,
      revealTarget: config.kind === 'cross' ? 0 : 1,
      revealDir: 0,
      progress: config.progress,
      strength: config.kind === 'cross' ? 0.72 + 0.28 * config.progress : 1,
      pointScale: config.kind === 'cross' ? (compact ? 1.5 : 1.18) : (compact ? 1.22 : 1),
      delay: ((config.seed * 7) % 10) / 30,
      id: links.length
    };

    if (config.kind === 'cross') {
      config.a.crossLinks = config.a.crossLinks || [];
      config.b.crossLinks = config.b.crossLinks || [];
      config.a.crossLinks.push({ node: config.b, note: link.note, link });
      config.b.crossLinks.push({ node: config.a, note: link.note, link });
    }

    links.push(link);
  }

  /* ---------------------------------------------------------------- camera */

  function resize() {
    if (!renderer) return;
    const width = Math.max(1, canvas.clientWidth || 800);
    const height = Math.max(1, canvas.clientHeight || 520);
    const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.75 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 380 ? 52 : width < 620 ? 46 : width < 900 ? 42 : 40;
    camera.updateProjectionMatrix();

    if (starMaterialFar) starMaterialFar.uniforms.uPixelRatio.value = dpr;
    if (starMaterialDust) starMaterialDust.uniforms.uPixelRatio.value = dpr;
    if (skyStarsMaterial) skyStarsMaterial.uniforms.uPixelRatio.value = dpr;
    if (centerNode && centerNode.shell) centerNode.shell.material.uniforms.uPixelRatio.value = dpr;
    if (clusterDust) clusterDust.material.uniforms.uPixelRatio.value = dpr;
    links.forEach(link => {
      link.material.uniforms.uPixelRatio.value = dpr;
      link.material.uniforms.uPointScale.value = link.pointScale;
    });

    view.maxRadius = Math.max(58, computeHomeView().radius * 2.7);
    if (!state.ready) {
      applyHomeView(true);
    }
    drawMiniMap();
  }

  function stageIsNarrow() {
    return compact || (canvas.clientWidth || window.innerWidth) < 620;
  }

  function computeHomeView(fit = false) {
    const aspect = Math.max(0.25, (canvas.clientWidth || 800) / (canvas.clientHeight || 520));
    const narrow = stageIsNarrow();
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const halfWidth = narrow ? 8.4 : 10.6;
    const halfHeight = narrow ? 7.4 : 6.8;
    const widthLimited = halfWidth / (tan * aspect);
    const heightLimited = halfHeight / tan;
    let radius = clamp(Math.max(widthLimited, heightLimited) * 1.03, narrow ? 20 : 14, narrow ? 62 : 40);
    if (fit && graphNodes.length) radius = Math.max(radius, fitRadiusToNodes(radius));
    // Keep the constellation inside the open space between the floating notes.
    if (!narrow) radius *= 1.18;
    return {
      theta: compact ? 0.62 : 0.56,
      phi: compact ? 1.18 : 1.15,
      radius: clamp(radius, narrow ? 20 : 14, narrow ? 72 : 44)
    };
  }

  // Keep every star inside the usable area above the HUD. Node labels have a
  // few extra pixels of margin in the limits.
  function fitRadiusToNodes(initialRadius) {
    const testCamera = new T.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 320);
    const theta = compact ? 0.62 : 0.56;
    const phi = compact ? 1.18 : 1.15;
    const narrow = stageIsNarrow();
    const limitX = narrow ? 0.8 : 0.85;
    const limitY = narrow ? 0.76 : 0.8;
    const sinPhi = Math.sin(phi);
    let radius = initialRadius;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      testCamera.position.set(
        radius * sinPhi * Math.sin(theta),
        radius * Math.cos(phi),
        radius * sinPhi * Math.cos(theta)
      );
      testCamera.lookAt(0, 0, 0);
      testCamera.updateMatrixWorld();
      let maxX = 0;
      let maxY = 0;
      graphNodes.forEach(node => {
        const projected = node.position.clone().project(testCamera);
        maxX = Math.max(maxX, Math.abs(projected.x));
        maxY = Math.max(maxY, Math.abs(projected.y));
      });
      if (maxX <= limitX && maxY <= limitY) break;
      radius *= 1.035;
      if (radius > 90) break;
    }
    return radius;
  }

  function applyHomeView(immediate) {
    const home = computeHomeView(true);
    view.targetTheta = home.theta;
    view.targetPhi = home.phi;
    view.targetRadius = home.radius;
    view.minRadius = compact ? 15 : 8.5;
    view.maxRadius = Math.max(58, home.radius * 2.7);
    view.desiredTarget.set(0, 0, 0);
    if (immediate) {
      view.theta = home.theta;
      view.phi = home.phi;
      view.radius = home.radius;
      view.target.set(0, 0, 0);
      view.desiredTarget.set(0, 0, 0);
      updateCamera(1);
    }
  }

  function resetView(options = {}) {
    closeDetail({ restoreFocus: false });
    state.selectedNode = null;
    state.hoverNode = null;
    state.highlight = null;
    updateExpansion(null);
    updateLabelStates();
    const home = computeHomeView(true);
    view.targetTheta = home.theta;
    view.targetPhi = home.phi;
    view.targetRadius = home.radius;
    view.desiredTarget.set(0, 0, 0);
    state.lastInteraction = performance.now();
    if (options.announce !== false) announce('已回到全景');
  }

  function focusNode(node) {
    if (!node) return;
    const isSmall = stageIsNarrow();
    camera.updateMatrixWorld();
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const vFov = (camera.fov * Math.PI) / 180;

    const worldPosition = new T.Vector3();
    node.group.getWorldPosition(worldPosition);

    // A task with connections is framed together with the small constellation
    // that opened around it. Focusing on the task alone would push those stars
    // outside the viewport.
    const focusNodes = [];
    if (node.type === 'plan' && state.expandedNodes.size > 1) {
      state.expandedNodes.forEach(id => {
        const other = nodeById.get(id);
        if (other) focusNodes.push(other);
      });
    } else {
      focusNodes.push(node);
    }

    const positions = focusNodes.map(other => {
      const position = new T.Vector3();
      other.group.getWorldPosition(position);
      return position;
    });
    const centroid = new T.Vector3();
    positions.forEach(position => centroid.add(position));
    centroid.multiplyScalar(1 / positions.length);

    let radius;
    if (positions.length > 1) {
      let spread = 0;
      positions.forEach(position => {
        spread = Math.max(spread, position.distanceTo(centroid));
      });
      radius = clamp((spread / Math.tan(vFov / 2)) * 1.35 + 1.5, isSmall ? 24 : 13, isSmall ? 50 : 38);
    } else {
      radius = node.type === 'plan' ? (isSmall ? 25 : 12.5) : node.type === 'direction' ? (isSmall ? 31 : 16.5) : view.radius * 0.83;
    }

    const target = centroid.clone();

    view.desiredTarget.copy(target);
    if (view.desiredTarget.length() > 30) view.desiredTarget.setLength(30);
    view.targetRadius = clamp(radius, view.minRadius, view.maxRadius);
    state.lastInteraction = performance.now();
  }

  function updateCamera(dt) {
    const damping = 1 - Math.exp(-3.6 * dt);
    view.theta += (view.targetTheta - view.theta) * damping;
    view.phi += (view.targetPhi - view.phi) * damping;
    view.radius += (view.targetRadius - view.radius) * (1 - Math.exp(-4.4 * dt));
    view.target.lerp(view.desiredTarget, 1 - Math.exp(-4.2 * dt));

    const sinPhi = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.radius * sinPhi * Math.sin(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sinPhi * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }

  function setupControls() {
    const home = computeHomeView(true);
    view.theta = home.theta;
    view.phi = home.phi;
    view.radius = home.radius;
    view.targetTheta = home.theta;
    view.targetPhi = home.phi;
    view.targetRadius = home.radius;
    view.minRadius = compact ? 15 : 8.5;
    view.maxRadius = Math.max(58, home.radius * 2.7);
    view.target.set(0, 0, 0);
    view.desiredTarget.set(0, 0, 0);
    updateCamera(1);
  }

  function panBy(dx, dy) {
    const mask = 1 - Math.exp(-4 * (1 / 60));
    camera.updateMatrixWorld();
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const worldHeight = 2 * view.radius * Math.tan((camera.fov * Math.PI) / 360);
    const perPixel = worldHeight / Math.max(1, canvas.clientHeight);
    view.desiredTarget.addScaledVector(tmp.right, -dx * perPixel);
    view.desiredTarget.addScaledVector(tmp.up, dy * perPixel);
    const limit = compact ? 17 : 25;
    if (view.desiredTarget.length() > limit) view.desiredTarget.setLength(limit);
    view.target.lerp(view.desiredTarget, mask);
    state.lastInteraction = performance.now();
  }

  function rotateBy(dx, dy) {
    view.targetTheta -= dx * 0.005;
    view.targetPhi = clamp(view.targetPhi - dy * 0.005, 0.24, 2.9);
    state.lastInteraction = performance.now();
  }

  function zoomBy(factor) {
    view.targetRadius = clamp(view.targetRadius * factor, view.minRadius, view.maxRadius);
    state.lastInteraction = performance.now();
  }

  /* ------------------------------------------------------------------ input */

  const pointers = new Map();
  let gesture = null;
  let lastPortrait = window.innerHeight > window.innerWidth;
  let lastCompact = media.compact.matches;

  function handleResize() {
    resize();
    drawPageStars();
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait !== lastPortrait) {
      lastPortrait = portrait;
      if (state.ready && !state.detailOpen) {
        window.setTimeout(() => applyHomeView(false), 80);
      }
    }

    const nowCompact = media.compact.matches;
    if (nowCompact !== lastCompact) {
      lastCompact = nowCompact;
      if (nowCompact) {
        dom.indexPane.classList.remove('is-mobile-open');
        dom.indexPane.classList.add('is-collapsed');
        dom.indexScrim.hidden = true;
        dom.indexCollapse.setAttribute('aria-expanded', 'false');
        dom.indexCollapse.setAttribute('aria-label', '展开索引');
        dom.statusPanel.classList.add('is-collapsed');
        dom.statusCollapse.setAttribute('aria-expanded', 'false');
        dom.statusCollapse.setAttribute('aria-label', '展开状态栏');
        dom.statusCollapse.title = '展开状态栏';
        dom.statusTab.hidden = false;
        dom.statusScrim.hidden = true;
      } else {
        dom.indexPane.classList.remove('is-mobile-open');
        dom.indexScrim.hidden = true;
        dom.statusScrim.hidden = true;
        dom.indexCollapse.setAttribute('aria-expanded', String(!dom.indexPane.classList.contains('is-collapsed')));
        dom.indexCollapse.setAttribute('aria-label', dom.indexPane.classList.contains('is-collapsed') ? '展开索引' : '收起索引');
        dom.indexCollapse.title = dom.indexPane.classList.contains('is-collapsed') ? '展开索引' : '收起索引';
        if (!dom.statusPanel.classList.contains('is-collapsed')) {
          dom.statusTab.hidden = true;
          dom.statusCollapse.setAttribute('aria-expanded', 'true');
          dom.statusCollapse.setAttribute('aria-label', '收起状态栏');
          dom.statusCollapse.title = '收起状态栏';
        }
      }
    }
  }

  function handleOrientationChange() {
    window.setTimeout(handleResize, 120);
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('keydown', onCanvasKeyDown);

    dom.panelClose.addEventListener('click', () => closeDetail({ restoreFocus: true }));
    dom.indexCollapse.addEventListener('click', toggleIndexPane);
    dom.indexTree.addEventListener('click', onTreeClick);
    dom.indexScrim.addEventListener('click', () => closeMobileIndex(true));
    dom.statusCollapse.addEventListener('click', () => setStatusCollapsed(true));
    dom.statusTab.addEventListener('click', () => setStatusCollapsed(false));
    dom.statusScrim.addEventListener('click', () => setStatusCollapsed(true));
    dom.reset.addEventListener('click', () => resetView());
    dom.drift.addEventListener('click', () => {
      state.driftOn = !state.driftOn;
      state.lastInteraction = performance.now();
      syncUi();
      announce(state.driftOn ? '自动漂浮已开启' : '自动漂浮已暂停');
    });
    dom.labels.addEventListener('click', () => {
      state.labelsAll = !state.labelsAll;
      syncUi();
      updateLabelStates();
      announce(state.labelsAll ? '已显示全部计划名称' : '已收起计划名称，仅保留方向');
    });

    dom.panelContent.addEventListener('click', onPanelContentClick);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('keydown', onDocumentKeyDown);
    // Fallback for a double click whose second click lands on the detail sheet
    // that just opened over the star (the native dblclick target changes).
    document.addEventListener('pointerup', onDocumentPointerUp);
    document.addEventListener('visibilitychange', () => {
      state.lastFrame = performance.now();
    });

    if (media.reduced.addEventListener) {
      media.reduced.addEventListener('change', event => {
        reduced = event.matches;
        if (event.matches) {
          state.driftOn = false;
          state.motionBlend = 0;
          if (!introFinished) finishIntro({ skipped: true });
        }
        syncUi();
      });
    }
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2 && event.button !== 1) return;
    event.preventDefault();
    state.lastInteraction = performance.now();
    canvas.focus({ preventScroll: true });

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      /* browsers that cannot capture pointers still receive move events on the canvas */
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });

    if (pointers.size === 1) {
      const panButton = event.pointerType === 'mouse' && (event.button === 2 || event.button === 1);
      const ctrlPan = event.pointerType === 'mouse' && event.button === 0 && (event.ctrlKey || event.metaKey);
      const mode = panButton || ctrlPan ? 'pan' : 'rotate';
      gesture = {
        mode,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        maxMove: 0,
        startedAt: performance.now()
      };
      document.body.classList.add(mode === 'pan' ? 'is-panning' : 'is-rotating');
      setHoverNode(null);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = {
        mode: 'touch2',
        prevDistance: Math.hypot(a.x - b.x, a.y - b.y),
        prevX: (a.x + b.x) / 2,
        prevY: (a.y + b.y) / 2,
        maxMove: 99,
        startedAt: performance.now()
      };
      document.body.classList.remove('is-rotating', 'is-panning');
    }
  }

  function onPointerMove(event) {
    const point = pointers.get(event.pointerId);
    if (point) {
      point.x = event.clientX;
      point.y = event.clientY;
    } else if (event.pointerType === 'mouse') {
      state.pointer = { x: event.clientX, y: event.clientY };
    }

    if (!gesture) {
      if (event.pointerType === 'mouse') {
        state.pointer = { x: event.clientX, y: event.clientY };
        state.lastInteraction = performance.now();
      }
      return;
    }

    if (gesture.mode === 'touch2' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (gesture.prevDistance > 0) {
        zoomBy(gesture.prevDistance / distance);
      }
      panBy(midX - gesture.prevX, midY - gesture.prevY);
      gesture.prevDistance = distance;
      gesture.prevX = midX;
      gesture.prevY = midY;
      return;
    }

    if (gesture.mode === 'rotate') {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      gesture.maxMove = Math.max(gesture.maxMove, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
      rotateBy(dx, dy);
    } else if (gesture.mode === 'pan') {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      gesture.maxMove = Math.max(gesture.maxMove, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
      panBy(dx, dy);
    }
  }

  function onPointerUp(event) {
    const wasGesture = gesture;
    const stillHere = pointers.has(event.pointerId);
    pointers.delete(event.pointerId);

    if (wasGesture && wasGesture.mode === 'rotate' && stillHere && wasGesture.button === 0) {
      const elapsed = performance.now() - wasGesture.startedAt;
      if (wasGesture.maxMove < 6 && elapsed < 700) {
        if (event.pointerType === 'mouse') {
          const now = performance.now();
          const isDouble = now - state.lastCanvasClickAt < 500 &&
            Math.hypot(event.clientX - state.lastCanvasClickX, event.clientY - state.lastCanvasClickY) < 9;
          if (isDouble) {
            state.lastCanvasClickAt = 0;
            resetView();
          } else {
            state.lastCanvasClickAt = now;
            state.lastCanvasClickX = event.clientX;
            state.lastCanvasClickY = event.clientY;
            const node = pickNode(event.clientX, event.clientY);
            if (node) selectNode(node);
            else closeDetail({ restoreFocus: false });
          }
        } else {
          const node = pickNode(event.clientX, event.clientY);
          if (node) selectNode(node);
          else closeDetail({ restoreFocus: false });
        }
      }
    }

    if (wasGesture && wasGesture.maxMove >= 6) {
      state.lastCanvasClickAt = 0;
    }

    document.body.classList.remove('is-rotating', 'is-panning');
    gesture = null;

    if (pointers.size === 1) {
      const [point] = [...pointers.values()];
      gesture = {
        mode: 'rotate',
        x: point.x,
        y: point.y,
        startX: point.x,
        startY: point.y,
        maxMove: 99,
        startedAt: performance.now()
      };
    }

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* noop */
    }

    if (event.pointerType === 'mouse') {
      state.pointer = { x: event.clientX, y: event.clientY };
    }
  }

  function onPointerCancel(event) {
    pointers.delete(event.pointerId);
    gesture = null;
    document.body.classList.remove('is-rotating', 'is-panning');
  }

  function onPointerLeave(event) {
    if (gesture) return;
    if (event.pointerType === 'mouse') {
      state.pointer = null;
      setHoverNode(null);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    state.lastInteraction = performance.now();
    const lineHeight = 16;
    const pageHeight = 100;
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= lineHeight;
    else if (event.deltaMode === 2) delta *= pageHeight;
    zoomBy(Math.exp(delta * 0.0011));
  }

  function onCanvasKeyDown(event) {
    const key = event.key;
    if (key === 'ArrowLeft') {
      event.preventDefault();
      view.targetTheta += 0.1;
      state.lastInteraction = performance.now();
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      view.targetTheta -= 0.1;
      state.lastInteraction = performance.now();
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      view.targetPhi = clamp(view.targetPhi - 0.075, 0.24, 2.9);
      state.lastInteraction = performance.now();
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      view.targetPhi = clamp(view.targetPhi + 0.075, 0.24, 2.9);
      state.lastInteraction = performance.now();
    } else if (key === '+' || key === '=') {
      event.preventDefault();
      zoomBy(0.9);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      zoomBy(1.1);
    } else if (key === '0') {
      event.preventDefault();
      resetView();
    } else if (key === 'Enter' || key === ' ') {
      const rect = canvas.getBoundingClientRect();
      const node = pickNode(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (node) {
        event.preventDefault();
        selectNode(node);
      }
    }
  }

  function onDocumentPointerUp(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target === canvas || canvas.contains(event.target)) return;
    if (!state.lastCanvasClickAt) return;
    if (performance.now() - state.lastCanvasClickAt >= 500) return;
    if (Math.hypot(event.clientX - state.lastCanvasClickX, event.clientY - state.lastCanvasClickY) >= 9) return;
    const target = event.target;
    if (target && target.closest && target.closest('button, a, input, textarea, select, [role="button"]')) return;
    state.lastCanvasClickAt = 0;
    resetView();
  }

  function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (media.compact.matches && dom.indexPane.classList.contains('is-mobile-open')) {
      event.preventDefault();
      closeMobileIndex(true);
    } else if (state.detailOpen) {
      event.preventDefault();
      closeDetail({ restoreFocus: true });
    }
  }

  function pickNode(clientX, clientY) {
    if (!renderer) return null;
    scene.updateMatrixWorld();
    const rect = canvas.getBoundingClientRect();
    const ndc = new T.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.node : null;
  }

  /* ---------------------------------------------------------------- hover */

  function setHoverNode(node) {
    if (node === state.hoverNode) return;
    state.hoverNode = node;
    document.body.classList.toggle('is-hovering-node', Boolean(node) && !gesture);
    updateHighlight();
    updateLabelStates();
  }

  function updateExpansion(node) {
    const plan = node && node.type === 'plan' ? node : null;
    const nodes = new Set();
    const expandedLinks = new Set();

    if (plan) {
      nodes.add(plan.id);
      (plan.crossLinks || []).forEach(entry => {
        nodes.add(entry.node.id);
        expandedLinks.add(entry.link);
      });
    }

    links.forEach(link => {
      if (link.kind !== 'cross') return;
      const active = expandedLinks.has(link);
      link.revealTarget = active ? 1 : 0;
      if (active && plan) link.revealDir = link.a === plan ? 0 : 1;
    });

    state.expandedPlan = plan;
    state.expandedNodes = nodes;
    state.expandedLinks = expandedLinks;
    document.body.classList.toggle('has-constellation', Boolean(plan));
  }

  function updateHighlight() {
    const anchor = state.hoverNode || state.selectedNode;
    const expandedNodes = state.expandedNodes;
    const expandedLinks = state.expandedLinks;

    if (!anchor && expandedNodes.size === 0) {
      state.highlight = null;
      nodesForEach(node => {
        node.dimTarget = 1;
        node.hoverTarget = 0;
      });
      links.forEach(link => {
        if (link.kind === 'task') {
          link.opacityTarget = link.baseOpacity;
          link.boostTarget = 0;
        } else {
          link.opacityTarget = 0;
          link.boostTarget = 0;
          link.revealTarget = 0;
        }
      });
      updateLabelStates();
      return;
    }

    const relatedNodes = new Set();
    const labelNodes = new Set();
    const activeTasks = new Set();

    if (anchor) {
      relatedNodes.add(anchor.id);
      labelNodes.add(anchor.id);

      if (anchor.type === 'center') {
        graphNodes.forEach(node => relatedNodes.add(node.id));
      } else if (anchor.type === 'plan') {
        activeTasks.add(anchor.id);
        relatedNodes.add(centerNode.id);
        if (anchor.direction) relatedNodes.add(anchor.direction.id);
      } else if (anchor.type === 'direction') {
        relatedNodes.add(centerNode.id);
        anchor.data.plans.forEach(plan => {
          activeTasks.add(plan.id);
          relatedNodes.add(plan.id);
        });
      }
    }

    // Clicking a task opens its small local constellation. These nodes stay
    // awake while the detail is open, even if the pointer moves elsewhere.
    expandedNodes.forEach(id => {
      const node = nodeById.get(id);
      relatedNodes.add(id);
      labelNodes.add(id);
      if (node && node.direction) relatedNodes.add(node.direction.id);
    });

    state.highlight = { anchor, nodes: relatedNodes, labelNodes, links: expandedLinks };

    graphNodes.forEach(node => {
      const related = relatedNodes.has(node.id);
      node.dimTarget = related ? 1 : node.type === 'center' ? 0.62 : node.done ? 0.52 : 0.24;
      if (node === state.hoverNode) node.hoverTarget = 1;
      else if (node === state.selectedNode) node.hoverTarget = 0.66;
      else node.hoverTarget = related ? 0.2 : 0;
    });

    links.forEach(link => {
      if (link.kind === 'task') {
        const isActive = Boolean(anchor) && (anchor.type === 'center' || activeTasks.has(link.b.id));
        const isExpanded = Boolean(state.expandedPlan) && expandedNodes.has(link.b.id);

        if (state.expandedPlan) {
          // A clicked task leaves only its own quiet thread to "我". The other
          // radial threads recede so the cross-task constellation can appear.
          if (link.b === state.expandedPlan) {
            link.opacityTarget = link.baseOpacity * 0.46;
            link.boostTarget = 0.18;
          } else {
            link.opacityTarget = 0;
            link.boostTarget = 0;
          }
        } else if (isActive) {
          link.opacityTarget = Math.min(1, link.baseOpacity + 0.14);
          link.boostTarget = 0.8;
        } else if (isExpanded) {
          link.opacityTarget = link.baseOpacity * 0.58;
          link.boostTarget = 0.16;
        } else if (anchor) {
          link.opacityTarget = link.baseOpacity * 0.18;
          link.boostTarget = 0;
        } else {
          link.opacityTarget = link.baseOpacity;
          link.boostTarget = 0;
        }
      } else {
        const expanded = expandedLinks.has(link);
        link.opacityTarget = expanded ? 0.96 * (0.65 + 0.35 * link.progress) : 0;
        link.boostTarget = expanded ? 0.62 : 0;
      }
    });

    updateLabelStates();
  }

  function nodesForEach(fn) {
    graphNodes.forEach(fn);
  }

  function updateLabelStates() {
    const highlight = state.highlight;
    const related = highlight ? highlight.nodes : null;
    const labelNodes = highlight ? highlight.labelNodes : null;
    graphNodes.forEach(node => {
      if (!node.label) return;
      const isHover = node === state.hoverNode;
      const isSelected = node === state.selectedNode;
      const isRelated = Boolean(related && related.has(node.id));
      const hasLabel = Boolean(labelNodes && labelNodes.has(node.id));
      let visible = node.type !== 'plan';
      if (node.type === 'plan') {
        visible = state.labelsAll || isHover || isSelected || hasLabel;
      }
      const dim = Boolean(highlight && node.type !== 'center' && !isRelated && !isHover && !isSelected);
      node.label.el.classList.toggle('is-visible', visible);
      node.label.el.classList.toggle('is-hovered', isHover || isSelected);
      node.label.el.classList.toggle('is-related', Boolean(visible && hasLabel && !isHover && !isSelected));
      node.label.el.classList.toggle('is-dim', dim);
    });
  }

  /* ---------------------------------------------------------------- detail */

  function selectNode(node, options = {}) {
    if (!node) return;
    if (media.compact.matches && dom.indexPane.classList.contains('is-mobile-open')) {
      closeMobileIndex(false);
    }
    const openedStatus = dom.statusPanel.classList.contains('is-collapsed');
    if (openedStatus) {
      setStatusCollapsed(false, { focus: false });
    }
    state.selectedNode = node;
    updateExpansion(node);
    renderDetail(node);
    openDetail(Boolean(options.focusPanel));
    updateHighlight();
    syncTreeActive();
    focusNode(node);
    if (openedStatus && !media.compact.matches) {
      // Keep the selected node framed when an optional detail sheet opens.
      window.setTimeout(() => {
        if (state.selectedNode === node && state.detailOpen) focusNode(node);
      }, 500);
    }
    state.lastInteraction = performance.now();
    announce(`已展开：${node.name}`);
  }

  function openDetail(focusPanel) {
    state.detailOpen = true;
    dom.panel.classList.add('is-open');
    dom.panel.setAttribute('aria-hidden', 'false');
    dom.panel.inert = false;
    document.body.classList.add('has-detail');
    dom.panelContent.scrollTop = 0;
    if (focusPanel) {
      dom.panel.focus({ preventScroll: true });
    }
  }

  function closeDetail(options = {}) {
    if (!state.detailOpen && !state.selectedNode) return;
    state.detailOpen = false;
    state.selectedNode = null;
    updateExpansion(null);
    dom.panel.classList.remove('is-open');
    dom.panel.setAttribute('aria-hidden', 'true');
    dom.panel.inert = true;
    document.body.classList.remove('has-detail');
    if (selectionSprite) selectionSprite.visible = false;
    updateHighlight();
    updateLabelStates();
    syncTreeActive();
    announce('已收起详情');
    if (options.restoreFocus) canvas.focus({ preventScroll: true });
  }

  function renderDetail(node) {
    dom.panelContent.replaceChildren();
    dom.panel.style.setProperty('--accent', node.colorStyle);

    if (node.type === 'plan') {
      renderPlanDetail(node);
      dom.panelKicker.textContent = `${node.direction.en} · ${node.en}`;
    } else if (node.type === 'direction') {
      renderDirectionDetail(node);
      dom.panelKicker.textContent = `${node.en} · DIRECTION`;
    } else {
      renderCenterDetail(node);
      dom.panelKicker.textContent = 'ORIGIN · SHUIKE';
    }
  }

  function renderPlanDetail(node) {
    const plan = node.data;
    const direction = node.direction;
    const fragment = document.createDocumentFragment();
    const status = plan.progress >= 100 ? '已实现' : '进行中';
    const firstUndone = plan.steps.find(step => !step.done);

    fragment.append(
      detailTitle(plan.name),
      element('p', 'detail-title-en', `${direction.name} / ${direction.en} / ${plan.en}`),
      progressBlock(plan.progress)
    );

    fragment.append(element('p', 'detail-summary', plan.summary));

    const meta = element('div', 'detail-meta');
    meta.append(metaItem('时间', plan.timeline));
    meta.append(metaItem('状态', status));
    fragment.append(meta);

    if (plan.progress >= 100) {
      const next = element('div', 'detail-next');
      next.append(element('span', 'next-label', 'COMPLETED · 已实现'));
      next.append(element('p', '', '这一颗星已经亮起，并会一直在原处保持明亮。它不再需要推进，只作为下一段路径的参照。'));
      fragment.append(next);
    } else if (firstUndone) {
      const next = element('div', 'detail-next');
      next.append(element('span', 'next-label', 'NOW · 下一步'));
      next.append(element('p', '', firstUndone.label));
      fragment.append(next);
    }

    fragment.append(sectionTitle('路径'));
    const steps = element('ol', 'steps');
    let currentMarked = false;
    plan.steps.forEach(step => {
      const item = element('li', 'step', step.label);
      if (step.done) {
        item.classList.add('is-done');
        item.append(element('span', 'sr-only', '（已完成）'));
      } else if (!currentMarked) {
        item.classList.add('is-current');
        item.setAttribute('aria-current', 'step');
        item.append(element('span', 'sr-only', '（进行中）'));
        currentMarked = true;
      }
      steps.append(item);
    });
    fragment.append(steps);

    const related = (node.crossLinks || []);
    if (related.length) {
      fragment.append(sectionTitle('跨方向关联'));
      const wrap = element('div', 'related');
      related.forEach(entry => {
        const other = entry.node;
        const chip = element('button', 'related-chip');
        chip.type = 'button';
        chip.dataset.node = other.id;
        chip.style.setProperty('--chip-color', other.direction.colorStyle);
        chip.setAttribute('aria-label', `${other.name}，${other.direction.name}方向，完成度 ${other.pct}%。${entry.note}`);
        const dot = document.createElement('i');
        const name = element('span', '', other.name);
        const percent = element('em', '', `${other.pct}%`);
        chip.append(dot, name, percent);
        wrap.append(chip);
      });
      fragment.append(wrap);
    }

    if (plan.tags && plan.tags.length) {
      const tags = element('div', 'tags');
      plan.tags.forEach(tag => tags.append(element('span', 'tag', tag)));
      fragment.append(tags);
    }

    fragment.append(overviewButton());
    dom.panelContent.append(fragment);
    animateProgress(dom.panelContent, plan.progress);
  }

  function renderDirectionDetail(node) {
    const direction = node.data;
    const fragment = document.createDocumentFragment();
    fragment.append(
      detailTitle(direction.name),
      element('p', 'detail-title-en', `${direction.en} · 长期方向`),
      progressBlock(node.pct)
    );
    fragment.append(element('p', 'detail-summary', direction.summary));
    fragment.append(element('p', 'detail-note', direction.motto));

    fragment.append(sectionTitle(`方向下的星点 · ${pad2(direction.plans.length)}`));
    const list = element('div', 'direction-plan-list');
    direction.plans.forEach(plan => {
      const button = element('button', 'direction-plan');
      button.type = 'button';
      button.dataset.node = plan.id;
      if (plan.progress >= 100) button.classList.add('is-done');
      button.append(element('span', 'dp-name', plan.name));
      button.append(element('span', 'dp-percent', plan.progress >= 100 ? '已实现' : `${plan.progress}%`));
      const track = element('span', 'dp-track');
      const fill = element('span', 'dp-fill');
      fill.style.setProperty('--value', `${plan.progress}%`);
      fill.style.width = `${plan.progress}%`;
      track.append(fill);
      button.append(track);
      list.append(button);
    });
    fragment.append(list);

    const connected = new Map();
    direction.plans.forEach(plan => {
      const planNode = nodeById.get(plan.id);
      if (!planNode) return;
      (planNode.crossLinks || []).forEach(entry => {
        const otherDirection = entry.node.direction;
        if (!otherDirection) return;
        if (!connected.has(otherDirection.id)) connected.set(otherDirection.id, { node: otherDirection, count: 0 });
        connected.get(otherDirection.id).count += 1;
      });
    });
    if (connected.size) {
      fragment.append(sectionTitle('相连的方向'));
      const wrap = element('div', 'related');
      connected.forEach(({ node: otherDirection, count }) => {
        const chip = element('button', 'related-chip');
        chip.type = 'button';
        chip.dataset.node = otherDirection.id;
        chip.style.setProperty('--chip-color', otherDirection.colorStyle);
        const dot = document.createElement('i');
        const name = element('span', '', otherDirection.name);
        const countEl = element('em', '', `×${count}`);
        chip.setAttribute('aria-label', `查看 ${otherDirection.name} 方向，与当前方向有 ${count} 条关联`);
        chip.append(dot, name, countEl);
        wrap.append(chip);
      });
      fragment.append(wrap);
    }

    fragment.append(overviewButton());
    dom.panelContent.append(fragment);
    animateProgress(dom.panelContent, node.pct);
  }

  function renderCenterDetail(node) {
    const fragment = document.createDocumentFragment();
    fragment.append(
      detailTitle(DATA.self.name),
      element('p', 'detail-title-en', `${DATA.self.en} · ${DATA.self.caption}`),
      progressBlock(stat.average)
    );
    fragment.append(element('p', 'detail-summary', DATA.self.summary));
    fragment.append(element('p', 'detail-note', DATA.self.note));

    const stats = element('div', 'stats-grid');
    stats.append(statCell(stat.directions, '方向'));
    stats.append(statCell(stat.plans, '计划'));
    stats.append(statCell(stat.done, '已实现', true));
    fragment.append(stats);

    fragment.append(sectionTitle('六个方向'));
    const wrap = element('div', 'related');
    directionNodes.forEach(direction => {
      const chip = element('button', 'related-chip');
      chip.type = 'button';
      chip.dataset.node = direction.id;
      chip.style.setProperty('--chip-color', direction.colorStyle);
      const dot = document.createElement('i');
      chip.append(dot, element('span', '', direction.name), element('em', '', `${direction.pct}%`));
      wrap.append(chip);
    });
    fragment.append(wrap);
    fragment.append(overviewButton());
    dom.panelContent.append(fragment);
    animateProgress(dom.panelContent, stat.average);
  }

  function detailTitle(text) {
    const title = element('h2', 'detail-title', text);
    title.id = 'detail-title';
    return title;
  }

  function progressBlock(percent) {
    const block = element('div', 'detail-progress');
    const head = element('div', 'progress-head');
    head.append(element('p', 'progress-caption', '完成度'));
    const value = element('p', 'progress-value', `${percent}`);
    value.append(element('span', '', '%'));
    head.append(value);
    block.append(head);
    const track = element('div', 'progress-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', '完成度');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(percent));
    const fill = element('div', 'progress-fill');
    fill.style.width = '0%';
    track.append(fill);
    block.append(track);
    return block;
  }

  function animateProgress(container, percent) {
    const fill = container.querySelector('.progress-fill');
    if (!fill) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        fill.style.width = `${percent}%`;
      });
    });
  }

  function metaItem(label, value) {
    const item = element('span');
    item.append(document.createElement('i'));
    item.append(element('b', '', label));
    item.append(document.createTextNode(value));
    return item;
  }

  function sectionTitle(text) {
    return element('h3', 'section-title', text);
  }

  function statCell(value, label, gold) {
    const cell = element('div', 'stat-cell');
    const number = element('b', gold ? 'is-gold' : '', pad2(value));
    cell.append(number, element('span', '', label));
    return cell;
  }

  function overviewButton() {
    const button = element('button', 'overview-button');
    button.type = 'button';
    button.dataset.action = 'overview';
    button.innerHTML = '<span>回到全景</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="6.4"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"/></svg>';
    return button;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function onPanelContentClick(event) {
    const action = event.target.closest('[data-action]');
    if (action && action.dataset.action === 'overview') {
      resetView();
      canvas.focus({ preventScroll: true });
      return;
    }
    const target = event.target.closest('[data-node]');
    if (!target) return;
    const node = nodeById.get(target.dataset.node);
    if (node) selectNode(node, { focusPanel: false });
  }

  /* ----------------------------------------------------------------- index */

  function buildTree() {
    if (!dom.indexTree) return;
    dom.indexTree.replaceChildren();
    treeRows.clear();
    treeGroups.clear();

    const selfButton = element('button', 'tree-self');
    selfButton.type = 'button';
    selfButton.dataset.node = 'self';
    selfButton.setAttribute('aria-label', `我，平均推进 ${stat.average}%`);
    selfButton.title = '我 · SHUIKE';
    const selfCopy = element('span', 'tree-self-copy');
    selfCopy.append(element('strong', '', '我'), element('small', '', 'SHUIKE'));
    selfButton.append(
      element('span', 'tree-self-mark', '我'),
      selfCopy,
      element('em', 'tree-self-meta', `${stat.average}%`)
    );
    treeRows.set('self', selfButton);
    dom.indexTree.append(selfButton);

    DATA.directions.forEach((definition, index) => {
      const directionNode = nodeById.get(definition.id);
      if (!directionNode) return;
      const group = element('section', 'tree-group is-collapsed');
      group.style.setProperty('--group-color', directionTone(index));
      group.dataset.direction = definition.id;

      const row = element('div', 'tree-row');
      const twist = element('button', 'tree-twist');
      twist.type = 'button';
      twist.dataset.treeToggle = definition.id;
      twist.setAttribute('aria-expanded', 'false');
      twist.setAttribute('aria-label', `收起${definition.name}方向下的任务`);
      twist.title = `收起${definition.name}方向`;
      twist.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

      const main = element('button', 'tree-row-main');
      main.type = 'button';
      main.dataset.node = definition.id;
      main.setAttribute('aria-label', `${definition.name}方向，完成度 ${directionNode.pct}%`);
      main.title = `${definition.name} · ${definition.en}`;
      const text = element('span', 'tree-text');
      text.append(element('strong', '', definition.name), element('small', '', definition.en));
      main.append(element('i', 'tree-color'), text, element('em', 'tree-pct', `${directionNode.pct}%`));
      row.append(twist, main);
      group.append(row);

      const children = element('div', 'tree-children');
      const inner = element('div', 'tree-children-inner');
      definition.plans.forEach(plan => {
        const planNode = nodeById.get(plan.id);
        if (!planNode) return;
        const task = element('button', 'tree-task');
        task.type = 'button';
        task.dataset.node = plan.id;
        task.setAttribute('aria-label', `${plan.name}，${plan.progress >= 100 ? '已实现' : `完成度 ${plan.progress}%`}，${definition.name}方向`);
        task.title = `${plan.name} · ${plan.progress >= 100 ? '已实现' : `${plan.progress}%`}`;
        if (plan.progress >= 100) task.classList.add('is-done');
        task.append(
          element('span', 'tree-task-name', plan.name),
          element('em', 'tree-task-meta', plan.progress >= 100 ? '已实现' : `${plan.progress}%`)
        );
        inner.append(task);
        treeRows.set(plan.id, task);
      });
      children.append(inner);
      group.append(children);
      dom.indexTree.append(group);
      treeGroups.set(definition.id, { group, twist, main });
      treeRows.set(definition.id, main);
    });

    syncTreeActive();
  }

  function onTreeClick(event) {
    const toggle = event.target.closest('[data-tree-toggle]');
    if (toggle) {
      toggleTreeFolder(toggle.dataset.treeToggle);
      return;
    }
    const target = event.target.closest('[data-node]');
    if (!target) return;
    const node = nodeById.get(target.dataset.node);
    if (!node) return;
    if (media.compact.matches && dom.indexPane.classList.contains('is-mobile-open')) {
      closeMobileIndex(false);
    }
    selectNode(node);
  }

  function toggleTreeFolder(directionId) {
    const entry = treeGroups.get(directionId);
    if (!entry) return;
    const willCollapse = !entry.group.classList.contains('is-collapsed');
    entry.group.classList.toggle('is-collapsed', willCollapse);
    entry.twist.setAttribute('aria-expanded', String(!willCollapse));
    const direction = DATA.directions.find(item => item.id === directionId);
    entry.twist.setAttribute('aria-label', `${willCollapse ? '展开' : '收起'}${direction ? direction.name : ''}方向下的任务`);
    entry.twist.title = `${willCollapse ? '展开' : '收起'}${direction ? direction.name : ''}方向`;
  }

  function syncTreeActive() {
    treeRows.forEach(row => {
      row.classList.remove('is-active');
      row.removeAttribute('aria-current');
    });
    if (!state.selectedNode) return;

    const row = treeRows.get(state.selectedNode.id);
    if (row) {
      row.classList.add('is-active');
      row.setAttribute('aria-current', 'true');
      if (state.ready) {
        try {
          row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (error) {
          /* scrollIntoView is a progressive enhancement */
        }
      }
    }

    const selected = state.selectedNode;
    const directionId = selected.type === 'plan' && selected.direction
      ? selected.direction.id
      : selected.type === 'direction' ? selected.id : null;
    if (directionId) {
      const entry = treeGroups.get(directionId);
      if (entry) {
        entry.group.classList.remove('is-collapsed');
        entry.twist.setAttribute('aria-expanded', 'true');
        const direction = DATA.directions.find(item => item.id === directionId);
        entry.twist.setAttribute('aria-label', `收起${direction ? direction.name : ''}方向下的任务`);
        entry.twist.title = `收起${direction ? direction.name : ''}方向`;
      }
    }
  }

  function syncIndexState() {
    if (!dom.indexPane) return;
    const mobile = media.compact.matches;
    dom.indexPane.classList.remove('is-mobile-open');
    dom.indexScrim.hidden = true;
    dom.indexPane.classList.toggle('is-collapsed', mobile);
    dom.indexCollapse.setAttribute('aria-expanded', String(!mobile));
    dom.indexCollapse.setAttribute('aria-label', mobile ? '展开索引' : '收起索引');
    dom.indexCollapse.title = mobile ? '展开索引' : '收起索引';
  }

  function toggleIndexPane() {
    const mobile = media.compact.matches;
    if (mobile) {
      if (dom.indexPane.classList.contains('is-mobile-open')) closeMobileIndex(true);
      else openMobileIndex();
      return;
    }
    const collapsed = dom.indexPane.classList.toggle('is-collapsed');
    dom.indexCollapse.setAttribute('aria-expanded', String(!collapsed));
    dom.indexCollapse.setAttribute('aria-label', collapsed ? '展开索引' : '收起索引');
    dom.indexCollapse.title = collapsed ? '展开索引' : '收起索引';
    announce(collapsed ? '索引已收起' : '索引已展开');
    window.setTimeout(resize, 340);
  }

  function openMobileIndex() {
    if (!dom.statusPanel.classList.contains('is-collapsed')) {
      setStatusCollapsed(true, { focus: false });
    }
    dom.indexPane.classList.remove('is-collapsed');
    dom.indexPane.classList.add('is-mobile-open');
    dom.indexScrim.hidden = false;
    dom.indexCollapse.setAttribute('aria-expanded', 'true');
    dom.indexCollapse.setAttribute('aria-label', '收起索引');
    dom.indexCollapse.title = '收起索引';
    state.lastInteraction = performance.now();
    announce('索引已展开');
  }

  function closeMobileIndex(restoreFocus) {
    if (!dom.indexPane.classList.contains('is-mobile-open')) return;
    dom.indexPane.classList.remove('is-mobile-open');
    dom.indexPane.classList.add('is-collapsed');
    dom.indexScrim.hidden = true;
    dom.indexCollapse.setAttribute('aria-expanded', 'false');
    dom.indexCollapse.setAttribute('aria-label', '展开索引');
    dom.indexCollapse.title = '展开索引';
    if (restoreFocus) dom.indexCollapse.focus({ preventScroll: true });
    announce('索引已收起');
  }

  function setStatusCollapsed(collapsed, options = {}) {
    if (!dom.statusPanel) return;
    const mobile = media.compact.matches;
    const wasCollapsed = dom.statusPanel.classList.contains('is-collapsed');
    if (collapsed === wasCollapsed) return;

    if (collapsed) {
      dom.statusPanel.classList.add('is-collapsed');
      dom.statusTab.hidden = false;
      dom.statusScrim.hidden = true;
      dom.statusCollapse.setAttribute('aria-expanded', 'false');
      dom.statusCollapse.setAttribute('aria-label', '展开状态栏');
      dom.statusCollapse.title = '展开状态栏';
      if (options.focus !== false) dom.statusTab.focus({ preventScroll: true });
      if (!mobile) window.setTimeout(resize, 380);
      announce('状态栏已收起，可从右侧状态标签重新打开');
    } else {
      if (mobile) closeMobileIndex(false);
      dom.statusPanel.classList.remove('is-collapsed');
      dom.statusTab.hidden = true;
      dom.statusScrim.hidden = !mobile;
      dom.statusCollapse.setAttribute('aria-expanded', 'true');
      dom.statusCollapse.setAttribute('aria-label', '收起状态栏');
      dom.statusCollapse.title = '收起状态栏';
      dom.statusPanel.classList.remove('is-arriving');
      void dom.statusPanel.offsetWidth;
      dom.statusPanel.classList.add('is-arriving');
      window.setTimeout(() => dom.statusPanel.classList.remove('is-arriving'), 620);
      window.setTimeout(() => {
        resize();
        drawMiniMap();
        if (options.focus !== false) dom.statusCollapse.focus({ preventScroll: true });
      }, 380);
      announce('状态栏已展开');
    }
  }

  /* -------------------------------------------------------------------- ui */

  function setupUi() {
    dom.panel.inert = true;
    dom.indexScrim.hidden = true;
    dom.statusScrim.hidden = true;
    syncIndexState();
    const mobile = media.compact.matches;
    dom.statusPanel.classList.toggle('is-collapsed', mobile);
    dom.statusTab.hidden = !mobile;
    dom.statusCollapse.setAttribute('aria-expanded', String(!mobile));
    dom.statusCollapse.setAttribute('aria-label', mobile ? '展开状态栏' : '收起状态栏');
    dom.statusCollapse.title = mobile ? '展开状态栏' : '收起状态栏';
    setupMiniMap();
    syncUi();
  }

  function syncUi() {
    dom.drift.setAttribute('aria-pressed', String(state.driftOn));
    dom.labels.setAttribute('aria-pressed', String(state.labelsAll));
    dom.drift.setAttribute('aria-label', state.driftOn ? '暂停自动漂浮' : '开启自动漂浮');
    dom.labels.setAttribute('aria-label', state.labelsAll ? '隐藏全部计划名称' : '显示全部计划名称');
    dom.drift.title = state.driftOn ? '暂停自动漂浮' : '开启自动漂浮';
    dom.labels.title = state.labelsAll ? '隐藏计划名称' : '显示全部计划名称';
  }

  function updateStats(animate = false) {
    const total = stat.plans;
    const done = stat.done;
    const doing = total - done;
    const percent = total ? Math.round((done / total) * 100) : 0;

    if (dom.piePercent) dom.piePercent.textContent = String(percent);
    if (dom.summaryDone) dom.summaryDone.textContent = pad2(done);
    if (dom.summaryDoing) dom.summaryDoing.textContent = pad2(doing);
    if (dom.summaryTotal) dom.summaryTotal.textContent = pad2(total);
    if (dom.summaryTotalSide) dom.summaryTotalSide.textContent = pad2(total);
    if (dom.summaryDirectionCount) dom.summaryDirectionCount.textContent = pad2(stat.directions);
    if (dom.summaryAverage) dom.summaryAverage.textContent = String(stat.average);
    if (dom.summaryAverageSide) dom.summaryAverageSide.textContent = String(stat.average);
    if (dom.legendDone) dom.legendDone.textContent = pad2(done);
    if (dom.legendDoing) dom.legendDoing.textContent = pad2(doing);

    if (dom.pieDone) {
      const radius = Number(dom.pieDone.getAttribute('r')) || 52;
      const circumference = 2 * Math.PI * radius;
      dom.pieDone.style.strokeDasharray = animate
        ? `${(circumference * percent) / 100} ${circumference}`
        : `0 ${circumference}`;
    }

    const meta = dom.indexPane?.querySelector('.index-meta-line span:last-child');
    if (meta) meta.textContent = `${pad2(stat.directions)} 方向 · ${pad2(total)} 任务`;

    // The local editor updates data.updated on every save; keep the printed
    // edition in sync without making it another source of truth.
    const edition = dom.indexPane?.querySelector('.index-edition');
    if (edition && typeof DATA.updated === 'string' && DATA.updated) {
      edition.textContent = `PLANS / ${DATA.updated}`;
    }
  }

  function setupMiniMap() {
    if (!dom.miniMap) return;
    miniMapContext = dom.miniMap.getContext('2d');
    drawMiniMap();
  }

  function drawMiniMap() {
    if (!miniMapContext || !dom.miniMap || !renderer || !dom.miniMap.clientWidth) return;
    if (dom.statusPanel.classList.contains('is-collapsed')) return;
    if (document.body.classList.contains('has-detail')) return;
    const width = dom.miniMap.clientWidth;
    const height = dom.miniMap.clientHeight;
    if (width < 2 || height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (dom.miniMap.width !== targetWidth || dom.miniMap.height !== targetHeight) {
      dom.miniMap.width = targetWidth;
      dom.miniMap.height = targetHeight;
    }

    const context = miniMapContext;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const background = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    background.addColorStop(0, '#121212');
    background.addColorStop(0.6, '#080808');
    background.addColorStop(1, '#020202');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const sourceW = width / scale;
    const sourceH = height / scale;
    const sourceX = (sourceWidth - sourceW) / 2;
    const sourceY = (sourceHeight - sourceH) / 2;
    context.drawImage(canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
  }

  function setupPageStars() {
    if (!dom.pageStars) return;
    const ctx = dom.pageStars.getContext('2d');
    if (!ctx) return;
    pageStarsContext = ctx;
    drawPageStars();
  }

  function drawPageStars() {
    if (!pageStarsContext || !dom.pageStars) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    dom.pageStars.width = Math.max(1, Math.round(width * dpr));
    dom.pageStars.height = Math.max(1, Math.round(height * dpr));
    pageStarsContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    pageStarsContext.clearRect(0, 0, width, height);

    const count = Math.round(Math.min(420, Math.max(120, (width * height) / 3900)));
    for (let index = 0; index < count; index += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = 0.14 + Math.pow(Math.random(), 2.6) * 0.55;
      const alpha = 0.16 + Math.random() * 0.48;
      const palette = Math.random() < 0.18 ? '190,190,190' : Math.random() < 0.45 ? '225,225,225' : '250,250,250';
      pageStarsContext.fillStyle = `rgba(${palette},${alpha.toFixed(3)})`;
      pageStarsContext.beginPath();
      pageStarsContext.arc(x, y, radius, 0, Math.PI * 2);
      pageStarsContext.fill();
    }
  }

  function announce(message) {
    if (!dom.live) return;
    dom.live.textContent = message;
  }

  /* ------------------------------------------------------------------- loop */

  function startAnimation() {
    if (animationRunning) return;
    animationRunning = true;
    state.lastFrame = performance.now();
    renderer.setAnimationLoop(animate);
  }

  function animate() {
    if (!renderer) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    if (document.hidden) return;

    state.time += dt;
    if (!reduced) state.visualTime += dt;

    if (state.ready && !reduced) {
      state.entrance = Math.min(1, state.entrance + dt / 2.2);
    }

    const idleFor = now - state.lastInteraction;
    const canDrift = state.driftOn && !reduced &&
      !state.detailOpen &&
      !dom.indexPane.classList.contains('is-mobile-open') &&
      !state.hoverNode && !gesture && idleFor > 7600;
    state.motionBlend += ((canDrift ? 1 : 0) - state.motionBlend) * (1 - Math.exp(-1.2 * dt));
    if (canDrift) {
      view.targetTheta += dt * 0.012;
      state.motionTime += dt;
    }

    updateCamera(dt);
    updateGraph(dt, now);
    scene.updateMatrixWorld();
    updateLabels();
    updateHover(now);
    updateSelection(dt);
    renderer.render(scene, camera);
    if (state.ready && now - lastMiniDraw > 110) {
      lastMiniDraw = now;
      drawMiniMap();
    }
  }

  function updateGraph(dt, now) {
    const motion = reduced ? 0 : state.motionBlend;
    const ease = 1 - Math.exp(-6 * dt);

    if (motion > 0.001) {
      graph.position.y = Math.sin(state.motionTime * 0.24) * 0.16 * motion;
      graph.rotation.z = Math.sin(state.motionTime * 0.13) * 0.007 * motion;
      graph.rotation.y = Math.sin(state.motionTime * 0.09) * 0.012 * motion;
    } else {
      graph.position.y += (0 - graph.position.y) * ease;
      graph.rotation.z += (0 - graph.rotation.z) * ease;
      graph.rotation.y += (0 - graph.rotation.y) * ease;
    }

    if (starGroupFar) {
      starGroupFar.rotation.y = state.visualTime * 0.0065;
      starGroupFar.rotation.x = Math.sin(state.visualTime * 0.02) * 0.02;
    }
    if (starGroupDust) {
      starGroupDust.rotation.y = -state.visualTime * 0.014;
      starGroupDust.rotation.z = Math.sin(state.visualTime * 0.05) * 0.035;
    }

    if (dom.pageStars) {
      const pointerX = state.pointer ? state.pointer.x / Math.max(1, window.innerWidth) - .5 : 0;
      const pointerY = state.pointer ? state.pointer.y / Math.max(1, window.innerHeight) - .5 : 0;
      const targetTurn = (view.theta - .56) * .18 + pointerX * .12;
      const targetShift = (view.phi - 1.15) * 30 + pointerY * 12;
      state.skyTurn += (targetTurn - state.skyTurn) * (1 - Math.exp(-4 * dt));
      state.skyShift += (targetShift - state.skyShift) * (1 - Math.exp(-4 * dt));
      const turn = reduced ? 0 : state.skyTurn;
      const shift = reduced ? 0 : state.skyShift;
      dom.pageStars.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0) scale(2.5) rotate(${turn.toFixed(5)}rad)`;
    }

    if (dom.milkyWay) {
      const turn = reduced ? 0 : state.skyTurn * .4;
      const shift = reduced ? 0 : state.skyShift * .45;
      dom.milkyWay.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0) scale(1.12) rotate(${turn.toFixed(5)}rad)`;
    }

    if (nebulaGroup) {
      nebulaGroup.rotation.z = Math.sin(state.visualTime * 0.012) * 0.025;
      nebulaGroup.position.x = Math.sin(state.visualTime * 0.009) * 0.35;
      nebulaGroup.position.y = Math.cos(state.visualTime * 0.007) * 0.2;
    }

    const pointTime = reduced ? 0 : state.visualTime;
    if (starMaterialFar) starMaterialFar.uniforms.uTime.value = pointTime;
    if (starMaterialDust) starMaterialDust.uniforms.uTime.value = pointTime;
    if (skyStarsMaterial) skyStarsMaterial.uniforms.uTime.value = pointTime;
    if (centerNode && centerNode.shell) centerNode.shell.material.uniforms.uTime.value = pointTime;
    if (clusterDust) clusterDust.material.uniforms.uTime.value = pointTime;

    const entrance = reduced ? 1 : smoothstep(state.entrance);

    graphNodes.forEach(node => {
      const nodeEase = 1 - Math.exp(-8 * dt);
      node.hover += (node.hoverTarget - node.hover) * nodeEase;
      node.dim += (node.dimTarget - node.dim) * nodeEase;

      const pulse = 1 + Math.sin(state.visualTime * node.pulseSpeed + node.phase) * 0.028 * (reduced ? 0 : 1);
      const scale = pulse * (1 + node.hover * 0.22);
      const alphaBoost = 1 + node.hover * 0.62;
      const dim = node.dim;

      if (node.glow) {
        node.glow.scale.setScalar(node.glowScale * scale);
        node.glow.material.opacity = node.baseGlowOpacity * dim * alphaBoost * (0.5 + 0.5 * entrance);
      }
      if (node.innerGlow) {
        node.innerGlow.scale.setScalar(node.glowScale * 0.4 * scale);
        node.innerGlow.material.opacity = 0.68 * dim * alphaBoost * (0.5 + 0.5 * entrance);
      }
      if (node.core) {
        node.core.scale.setScalar(node.coreScale * (1 + node.hover * 0.12));
        node.core.material.opacity = node.baseCoreOpacity * dim;
      }
      if (node.ring && node.baseRingOpacity !== undefined) {
        node.ring.scale.setScalar(node.ringScale * (1 + node.hover * 0.15));
        node.ring.material.opacity = node.baseRingOpacity * dim * (1 + node.hover * 0.25) * (0.45 + 0.55 * entrance);
      }
      if (node.doneHalo) {
        node.doneHalo.scale.setScalar(node.ringScale * 1.65 * (1 + node.hover * 0.1));
        node.doneHalo.material.opacity = 0.16 * Math.max(0.56, dim) * (0.8 + 0.2 * Math.sin(state.visualTime * 0.6 + node.phase));
      }
      if (node.ringA) {
        node.ringA.rotation.y += dt * 0.04 * (reduced ? 0 : 1);
        node.ringA.rotation.z += dt * 0.018 * (reduced ? 0 : 1);
      }
      if (node.ringB) {
        node.ringB.rotation.y -= dt * 0.025 * (reduced ? 0 : 1);
        node.ringB.rotation.x += dt * 0.012 * (reduced ? 0 : 1);
      }
      if (node.shell) {
        node.shell.points.rotation.y += dt * 0.045 * (reduced ? 0 : 1);
      }
      if (node.pivot) {
        node.pivot.rotation.z += dt * 0.12 * (reduced ? 0 : 1);
      }
      if (node.type === 'direction' && node.ring) {
        node.ring.material.opacity = 0.24 * dim * (1 + node.hover * 0.3) * (0.4 + 0.6 * entrance);
      }
    });

    links.forEach(link => {
      const linkEase = 1 - Math.exp(-6 * dt);
      link.opacity += (link.opacityTarget - link.opacity) * linkEase;
      link.boost += (link.boostTarget - link.boost) * linkEase;
      link.reveal += (link.revealTarget - link.reveal) * (1 - Math.exp(-5 * dt));

      const uniforms = link.material.uniforms;
      uniforms.uTime.value = reduced ? 0 : state.visualTime;
      uniforms.uOpacity.value = link.opacity;
      uniforms.uBoost.value = link.boost;

      if (link.kind === 'task') {
        const localEntrance = clamp((entrance - link.delay) / (1 - link.delay), 0, 1);
        uniforms.uLit.value += (link.progress * localEntrance - uniforms.uLit.value) * linkEase;
        uniforms.uReveal.value = 1;
        uniforms.uRevealDir.value = 0;
        uniforms.uStrength.value = 1;
        link.points.visible = link.opacity > 0.004;
      } else {
        uniforms.uLit.value = 1;
        uniforms.uStrength.value = link.strength;
        uniforms.uReveal.value = link.reveal;
        uniforms.uRevealDir.value = link.revealDir;
        link.points.visible = link.opacity > 0.006 && link.reveal > 0.002;
      }
    });

    if (selectionSprite && selectionSprite.visible && state.selectedNode) {
      updateSelectionTarget();
    }
  }

  function updateHover(now) {
    if (!state.pointer || gesture || state.pointer.type === 'touch' || isTouch) return;
    if (now - state.lastHoverCheck < 65) return;
    state.lastHoverCheck = now;
    const node = pickNode(state.pointer.x, state.pointer.y);
    setHoverNode(node);
  }

  function updateSelection(dt) {
    if (!selectionSprite || !state.selectedNode) {
      if (selectionSprite) selectionSprite.visible = false;
      return;
    }
    selectionSprite.visible = true;
    updateSelectionTarget();
    const node = state.selectedNode;
    const size = node.type === 'plan' ? node.ringScale * 1.35 : node.type === 'direction' ? 2.4 * visualScale : 4.6 * visualScale;
    const pulse = 1 + Math.sin(state.visualTime * 0.9) * 0.025;
    selectionSprite.scale.setScalar(size * pulse);
    selectionSprite.material.rotation += dt * 0.18 * (reduced ? 0 : 1);
    selectionSprite.material.opacity = 0.56 + Math.sin(state.visualTime * 0.9) * 0.1;
  }

  function updateSelectionTarget() {
    if (!selectionSprite || !state.selectedNode) return;
    const position = new T.Vector3();
    state.selectedNode.group.getWorldPosition(position);
    selectionSprite.position.copy(position);
  }

  function updateLabels() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    graphNodes.forEach(node => {
      if (!node.label) return;
      const world = new T.Vector3();
      node.group.getWorldPosition(world);
      world.project(camera);
      const onScreen = world.z > -1 && world.z < 1 && world.x > -1.15 && world.x < 1.15 && world.y > -1.15 && world.y < 1.15;
      const screenX = (world.x * 0.5 + 0.5) * width;
      const screenY = (-world.y * 0.5 + 0.5) * height;
      const below = node.type === 'plan' && screenY < 62;
      const behindHeader = node.type === 'direction' && screenY < 46;
      node.label.el.classList.toggle('is-below', below);
      node.label.anchor.style.transform = `translate3d(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px, 0)`;
      node.label.anchor.style.visibility = onScreen && !behindHeader ? 'visible' : 'hidden';
      const zIndex = Math.round((1 - world.z) * 1000);
      node.label.anchor.style.zIndex = node === state.hoverNode || node === state.selectedNode ? '1200' : String(zIndex);
    });
  }

  /* ---------------------------------------------------------------- fallback */

  function buildFallback() {
    if (!dom.fallbackContent) return;
    const fragment = document.createDocumentFragment();
    DATA.directions.forEach(direction => {
      const group = element('div', 'fallback-group');
      group.append(element('h3', '', `${direction.name} · ${direction.en}`));
      group.append(element('p', '', direction.summary));
      const list = document.createElement('ul');
      direction.plans.forEach(plan => {
        const item = document.createElement('li');
        item.append(element('b', '', plan.name));
        item.append(element('span', '', plan.progress >= 100 ? '已实现' : `${plan.progress}%`));
        list.append(item);
      });
      group.append(list);
      fragment.append(group);
    });
    dom.fallbackContent.append(fragment);
  }

  function showFallback() {
    document.getElementById('handoff-still')?.remove();
    introFinished = true;
    if (introSafety) {
      window.clearTimeout(introSafety);
      introSafety = null;
    }
    if (intro) {
      intro.destroy();
      intro = null;
    }
    if (dom.introSkip) {
      dom.introSkip.removeEventListener('click', skipIntro);
      dom.introSkip.disabled = true;
    }
    document.removeEventListener('keydown', onIntroKeyDown);
    if (dom.intro) {
      dom.intro.classList.add('is-gone');
      dom.intro.hidden = true;
      dom.intro.setAttribute('aria-hidden', 'true');
    }
    if (appRoot) appRoot.inert = false;
    if (dom.fallback) dom.fallback.hidden = false;
    document.body.classList.add('is-fallback');
    document.body.classList.remove('is-loading');
  }

  /* ----------------------------------------------------------------- utils */

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function destroy() {
    introFinished = true;
    if (introSafety) {
      window.clearTimeout(introSafety);
      introSafety = null;
    }
    if (intro) {
      intro.destroy();
      intro = null;
    }
    if (dom.introSkip) {
      dom.introSkip.removeEventListener('click', skipIntro);
      dom.introSkip.disabled = true;
    }
    document.removeEventListener('keydown', onIntroKeyDown);
    if (dom.intro) {
      dom.intro.classList.add('is-gone');
      dom.intro.hidden = true;
    }
    if (mapObserver) {
      mapObserver.disconnect();
      mapObserver = null;
    }
    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    }
    document.removeEventListener('keydown', onDocumentKeyDown);
    document.removeEventListener('pointerup', onDocumentPointerUp);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleOrientationChange);
    if (appRoot) appRoot.inert = false;
    animationRunning = false;
  }

  window.ShuikePlanMap = Object.freeze({
    reset: () => resetView(),
    focus: id => {
      const node = nodeById.get(id);
      if (node) selectNode(node, { focusPanel: true });
    },
    close: () => closeDetail({ restoreFocus: false }),
    get ready() { return state.ready; },
    get view() { return { theta: view.theta, phi: view.phi, radius: view.radius }; },
    get debug() {
      return {
        taskLinks: links.filter(link => link.kind === 'task').length,
        crossLinks: links.filter(link => link.kind === 'cross').length,
        visibleCross: links.filter(link => link.kind === 'cross' && link.points.visible).length,
        expanded: state.expandedLinks.size,
        expandedNodes: state.expandedNodes.size,
        selected: state.selectedNode ? state.selectedNode.id : null,
        target: { x: view.target.x, y: view.target.y, z: view.target.z }
      };
    },
    data: DATA,
    destroy
  });

  // Run last: `directionLayout`, textures and the other consts above must be
  // initialized before the graph is built, while every function is hoisted.
  try {
    init();
  } catch (error) {
    console.error('[Plans] initialization failed', error);
    showFallback();
  }
})();
