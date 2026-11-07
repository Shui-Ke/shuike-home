/* =========================================================
   OBSIDIAN COLUMN / TORSION STACK
   A slowly turning column of stacked rectangular crystal bands,
   suspended behind a frosted dossier window.
   Three.js r152 / procedural geometry / no external textures.
   ========================================================= */

(() => {
  "use strict";

  const canvas = document.querySelector("#column-canvas");
  if (!canvas) return;

  const els = {
    loader: document.querySelector("[data-loader]"),
    fallback: document.querySelector("[data-fallback]"),
    progressBar: document.querySelector("[data-progress-bar]"),
    chapterNum: document.querySelector(".chapter-readout__num"),
    chapterName: document.querySelector("[data-chapter-name]")
  };

  const state = {
    ready: false,
    running: false,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    finePointer: window.matchMedia("(pointer: fine)").matches,
    mobile: window.innerWidth <= 720,
    targetProgress: 0,
    progress: 0,
    pointerX: 0,
    pointerY: 0,
    pointerTargetX: 0,
    pointerTargetY: 0,
    frame: 0,
    elapsed: 0,
    loopPhase: 0,
    loopVelocity: 0.16,
    wheelEnergy: 0,
    lastWheelAt: -Infinity,
    spin: 0,
    spinVelocity: 0.055,
    contextLost: false
  };

  let renderer;
  let scene;
  let camera;
  let column;
  let dustField;
  let dustMaterial;
  let glowTexture;
  let coreLight;
  let backdropGroup;
  let clockStart = performance.now();

  const TAU = Math.PI * 2;
  let Y_AXIS;
  let tempQ;

  if (!window.THREE) {
    fail("THREE.JS FAILED TO LOAD");
    return;
  }

  Y_AXIS = new THREE.Vector3(0, 1, 0);
  tempQ = new THREE.Quaternion();

  try {
    init();
  } catch (error) {
    console.error(error);
    fail(error && error.message ? error.message : "SCENE INITIALIZATION FAILED");
  }

  function init() {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false
    });

    if (!renderer.getContext()) throw new Error("WEBGL CONTEXT UNAVAILABLE");

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.mobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 90);
    camera.position.set(0, getCameraY(), getCameraZ());
    camera.lookAt(0, getLookY(), 0);

    glowTexture = makeGlowTexture();
    scene.environment = makeEnvironment();
    backdropGroup = addBackground();
    addLights();
    buildColumn();
    buildDust();

    // Follow the site-wide light/dark theme. Light mode lets the dossier paper
    // show through; the dark studio backdrop belongs to the dark scene.
    function syncSceneTheme() {
      const light = document.documentElement.dataset.theme === "light";
      if (backdropGroup) backdropGroup.visible = !light;
      if (dustField) dustField.visible = !light;
    }
    syncSceneTheme();
    document.addEventListener("shuike:theme-change", syncSceneTheme);

    bindEvents();
    resize(true);

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    document.addEventListener("visibilitychange", onVisibilityChange);

    updateHud(true);
    renderer.render(scene, camera);

    state.running = !state.reduced;
    window.setTimeout(reveal, 560);
    if (!state.reduced) startLoop();
  }

  function getCameraZ() {
    return state.mobile ? 20.5 : 16.9;
  }

  function getCameraY() {
    return state.mobile ? 1.6 : 1.4;
  }

  function getColumnY() {
    return state.mobile ? -1.1 : -0.12;
  }

  function getLookY() {
    return state.mobile ? 0.45 : 0.4;
  }

  function reveal() {
    if (state.ready || state.contextLost) return;
    state.ready = true;
    document.body.classList.add("is-ready");
    if (state.reduced) renderer.render(scene, camera);
  }

  function fail(message) {
    console.error("[OBSIDIAN COLUMN]", message);
    if (els.loader) els.loader.style.display = "none";
    if (els.fallback) {
      els.fallback.hidden = false;
      const second = els.fallback.querySelector("p:last-child");
      if (second && message) second.textContent = `${message}. Open this study in a current browser with WebGL 2 enabled.`;
    }
    document.body.classList.add("is-ready", "is-fallback");
    state.contextLost = true;
  }

  function onContextLost(event) {
    event.preventDefault();
    fail("WEBGL CONTEXT LOST");
  }

  /* ---------------------------------------------------------
     World / background
     --------------------------------------------------------- */

  function makeBackdropTexture() {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1100;
    const ctx = c.getContext("2d");

    const base = ctx.createLinearGradient(0, 0, 0, c.height);
    base.addColorStop(0, "#010202");
    base.addColorStop(0.4, "#030302");
    base.addColorStop(0.7, "#050403");
    base.addColorStop(1, "#000000");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, c.width, c.height);

    softSpot(ctx, c.width * 0.51, c.height * 0.44, c.width * 0.38, "rgba(119, 91, 55, .03)");
    softSpot(ctx, c.width * 0.63, c.height * 0.59, c.width * 0.25, "rgba(91, 66, 39, .015)");
    softSpot(ctx, c.width * 0.14, c.height * 0.3, c.width * 0.26, "rgba(54, 69, 65, .015)");
    softSpot(ctx, c.width * 0.86, c.height * 0.2, c.width * 0.18, "rgba(105, 82, 52, .008)");

    // A soft vertical lift behind the column.
    const shaft = ctx.createLinearGradient(c.width * 0.44, 0, c.width * 0.6, c.height);
    shaft.addColorStop(0, "rgba(214, 184, 137, 0)");
    shaft.addColorStop(0.35, "rgba(214, 184, 137, .012)");
    shaft.addColorStop(0.55, "rgba(233, 201, 151, .03)");
    shaft.addColorStop(1, "rgba(214, 184, 137, 0)");
    ctx.fillStyle = shaft;
    ctx.fillRect(c.width * 0.36, 0, c.width * 0.3, c.height);

    // Sparse mineral noise.
    ctx.save();
    for (let i = 0; i < 1300; i++) {
      const x = Math.random() * c.width;
      const y = Math.random() * c.height;
      const a = Math.random() * 0.03;
      ctx.fillStyle = `rgba(235, 210, 168, ${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      c.width * 0.5, c.height * 0.48, c.width * 0.15,
      c.width * 0.5, c.height * 0.48, c.width * 0.7
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.58, "rgba(0,0,0,.18)");
    vignette.addColorStop(1, "rgba(0,0,0,.86)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, c.width, c.height);

    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function softSpot(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color.replace(/[\d.]+\)$/, "0.09)"));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function addBackground() {
    const group = new THREE.Group();
    const texture = makeBackdropTexture();
    const geometry = new THREE.PlaneGeometry(80, 60);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      depthWrite: true,
      toneMapped: false
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(0, 0.6, -8);
    plane.renderOrder = -10;
    group.add(plane);

    const backGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xd2b184,
      transparent: true,
      opacity: 0.03,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    }));
    backGlow.position.set(0, 0.2, -4.2);
    backGlow.scale.set(10, 13, 1);
    backGlow.renderOrder = -2;
    group.add(backGlow);

    const shaftTexture = makeShaftTexture();
    const shaftMaterial = new THREE.MeshBasicMaterial({
      map: shaftTexture,
      color: 0xcdb286,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false
    });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 13.5), shaftMaterial);
    shaft.position.set(0.15, 0.2, -3.0);
    shaft.renderOrder = -1;
    group.add(shaft);

    const coolMist = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x819691,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    }));
    coolMist.position.set(-3.2, 2.8, -3.5);
    coolMist.scale.set(7, 9, 1);
    coolMist.renderOrder = -2;
    group.add(coolMist);

    scene.add(group);
    return group;
  }

  function makeGlowTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255, 242, 215, .95)");
    g.addColorStop(0.16, "rgba(242, 212, 160, .54)");
    g.addColorStop(0.46, "rgba(184, 145, 92, .13)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeShaftTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 1024;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);

    const vertical = ctx.createLinearGradient(0, 0, 0, c.height);
    vertical.addColorStop(0, "rgba(248, 224, 186, 0)");
    vertical.addColorStop(0.16, "rgba(248, 224, 186, .02)");
    vertical.addColorStop(0.42, "rgba(248, 224, 186, .2)");
    vertical.addColorStop(0.58, "rgba(248, 224, 186, .26)");
    vertical.addColorStop(0.82, "rgba(248, 224, 186, .06)");
    vertical.addColorStop(1, "rgba(248, 224, 186, 0)");
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.globalCompositeOperation = "destination-in";
    const horizontal = ctx.createLinearGradient(0, 0, c.width, 0);
    horizontal.addColorStop(0, "rgba(255,255,255,0)");
    horizontal.addColorStop(0.24, "rgba(255,255,255,.5)");
    horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
    horizontal.addColorStop(0.76, "rgba(255,255,255,.5)");
    horizontal.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, c.width, c.height);

    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeEnvironment() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d");

    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, "#070807");
    base.addColorStop(0.35, "#0b0906");
    base.addColorStop(0.66, "#080706");
    base.addColorStop(1, "#010202");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 512);

    softLight(ctx, 235, 115, 270, "rgba(128, 175, 169, .34)");
    softLight(ctx, 780, 220, 330, "rgba(250, 220, 170, .62)");
    softLight(ctx, 480, 36, 210, "rgba(255, 247, 228, .72)");
    softLight(ctx, 90, 440, 230, "rgba(100, 92, 70, .2)");
    softLight(ctx, 960, 380, 150, "rgba(172, 128, 82, .18)");

    ctx.save();
    ctx.filter = "blur(14px)";
    ctx.fillStyle = "rgba(255, 250, 234, .92)";
    ctx.fillRect(148, 14, 20, 272);
    ctx.fillRect(615, 270, 12, 208);
    ctx.fillStyle = "rgba(178, 219, 213, .32)";
    ctx.fillRect(312, 86, 6, 300);
    ctx.fillStyle = "rgba(255, 204, 130, .52)";
    ctx.fillRect(850, 42, 10, 258);
    ctx.fillStyle = "rgba(255, 246, 222, .8)";
    ctx.fillRect(742, 390, 34, 3);
    ctx.restore();

    radialSpot(ctx, 658, 136, 23, "rgba(255,255,247,.92)");
    radialSpot(ctx, 274, 330, 17, "rgba(201,231,226,.62)");
    radialSpot(ctx, 926, 304, 12, "rgba(255,214,153,.52)");

    const texture = new THREE.CanvasTexture(c);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromEquirectangular(texture);
    pmrem.dispose();
    texture.dispose();
    return target.texture;
  }

  function softLight(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.2)"));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function radialSpot(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  /* ---------------------------------------------------------
     Light
     --------------------------------------------------------- */

  function addLights() {
    scene.add(new THREE.HemisphereLight(0xc8b89d, 0x070504, 0.32));

    const key = new THREE.DirectionalLight(0xffe3ba, 1.8);
    key.position.set(4.5, 7.5, 6);
    scene.add(key);

    const neutral = new THREE.DirectionalLight(0xfff5e4, 1.25);
    neutral.position.set(-3, 5, 7);
    scene.add(neutral);

    const cool = new THREE.DirectionalLight(0xc3d6d2, 0.7);
    cool.position.set(-6, 4, -2);
    scene.add(cool);

    const rim = new THREE.DirectionalLight(0xffd39a, 1.2);
    rim.position.set(0, 1.5, -7);
    scene.add(rim);

    coreLight = new THREE.PointLight(0xe1b478, 3.1, 13, 2);
    coreLight.position.set(0, -0.3, -0.6);
    scene.add(coreLight);
  }

  /* ---------------------------------------------------------
     Column geometry
     --------------------------------------------------------- */

  function buildColumn() {
    column = new THREE.Group();
    column.position.set(0.12, getColumnY(), 0);
    scene.add(column);

    const crystal = makeCrystalMaterial();
    const crystalAlt = crystal.clone();
    crystalAlt.color.setHex(0x100c07);
    crystalAlt.transmission = 0.08;
    crystalAlt.metalness = 0.78;
    crystalAlt.attenuationColor.setHex(0x24180f);
    crystalAlt.envMapIntensity = 1.9;
    crystalAlt.clearcoatRoughness = 0.07;

    // One complete visual cycle: 32 layers, a full 360° of twist, and a
    // wide-narrow-wide radius profile. The pattern repeats exactly in Y.
    const cycleLayers = 32;
    const cycles = 4;
    const bandHeight = 0.3;
    const spacing = bandHeight + 0.01;
    const verticalPeriod = cycleLayers * spacing;
    const middleTop = 4.9;
    const thickness = 0.14;
    const gap = 0.012;
    const longPanels = 14;
    const shortPanels = 8;

    const panelGeometry = roundedBoxGeometry(1, 1, 1, 0.05);
    const seamGeometry = new THREE.BoxGeometry(1, 1, 1);
    const evenMatrices = [];
    const oddMatrices = [];
    const seamMatrices = [];
    const dummy = new THREE.Object3D();

    const pushPanel = (list, lx, y, lz, sx, sy, sz, theta) => {
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      dummy.position.set(lx * cos + lz * sin, y, -lx * sin + lz * cos);
      dummy.rotation.set(0, theta, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      list.push(dummy.matrix.clone());
    };

    for (let cycle = 0; cycle < cycles; cycle++) {
      const cycleTop = middleTop + (1 - cycle) * verticalPeriod;

      for (let i = 0; i < cycleLayers; i++) {
        const t = i / (cycleLayers - 1);
        const pinch = Math.pow(Math.abs(t - 0.5) * 2, 1.45);
        const halfW = 0.82 + 0.5 * pinch;
        const halfD = halfW * 0.62;
        const twist = i * (Math.PI / 16);
        const y = cycleTop - i * spacing;
        const list = (cycle * cycleLayers + i) % 2 === 0 ? evenMatrices : oddMatrices;

        const longStep = (2 * halfW) / longPanels;
        const longLength = longStep - gap;
        for (let j = 0; j < longPanels; j++) {
          const lx = -halfW + longStep * (j + 0.5);
          pushPanel(list, lx, y, halfD, longLength, bandHeight, thickness, twist);
          pushPanel(list, lx, y, -halfD, longLength, bandHeight, thickness, twist);
        }

        const sideDepth = 2 * (halfD - thickness * 0.5);
        const shortStep = sideDepth / shortPanels;
        const shortLength = shortStep - gap;
        for (let j = 0; j < shortPanels; j++) {
          const lz = -halfD + thickness * 0.5 + shortStep * (j + 0.5);
          pushPanel(list, halfW, y, lz, thickness, bandHeight, shortLength, twist);
          pushPanel(list, -halfW, y, lz, thickness, bandHeight, shortLength, twist);
        }

        // Fine brass hairlines sit in the gaps, so every small rectangle is
        // legible while the band still reads as one connected surface.
        const seamHeight = bandHeight * 0.84;
        const seamZ = halfD + thickness * 0.5 + 0.002;
        for (let k = 1; k < longPanels; k++) {
          const lx = -halfW + longStep * k;
          pushPanel(seamMatrices, lx, y, seamZ, 0.008, seamHeight, 0.01, twist);
          pushPanel(seamMatrices, lx, y, -seamZ, 0.008, seamHeight, 0.01, twist);
        }
        const seamX = halfW + thickness * 0.5 + 0.002;
        const seamStartZ = -halfD + thickness * 0.5;
        for (let k = 1; k < shortPanels; k++) {
          const lz = seamStartZ + shortStep * k;
          pushPanel(seamMatrices, seamX, y, lz, 0.01, seamHeight, 0.008, twist);
          pushPanel(seamMatrices, -seamX, y, lz, 0.01, seamHeight, 0.008, twist);
        }
      }
    }

    const makeInstances = (matrices, material, geometry = panelGeometry) => {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      return mesh;
    };

    column.add(
      makeInstances(evenMatrices, crystal),
      makeInstances(oddMatrices, crystalAlt),
      makeInstances(seamMatrices, makeSeamMaterial(), seamGeometry)
    );
    column.userData.verticalPeriod = verticalPeriod;
    column.userData.loopSpeed = 0.16;
  }

  function roundedBoxGeometry(width, height, depth, radius) {
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: Math.min(radius * 0.45, 0.008),
      bevelThickness: Math.min(depth * 0.2, 0.008),
      curveSegments: 8
    });
    geometry.center();
    return geometry;
  }

  function makeCrystalMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x0d0a07,
      metalness: 0.72,
      roughness: 0.19,
      transmission: 0.12,
      thickness: 0.7,
      ior: 1.45,
      attenuationColor: new THREE.Color(0x1b130b),
      attenuationDistance: 1.1,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: 2.0,
      iridescence: 0.08,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [100, 260],
      flatShading: false,
      side: THREE.FrontSide
    });
  }

  function makeSeamMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xb2905e,
      metalness: 0.82,
      roughness: 0.26,
      emissive: 0x1b1108,
      emissiveIntensity: 0.55,
      envMapIntensity: 1.45
    });
  }

  function makeShardMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x766a57,
      metalness: 0.02,
      roughness: 0.09,
      transmission: 0.46,
      thickness: 0.9,
      ior: 1.44,
      attenuationColor: new THREE.Color(0x46351f),
      attenuationDistance: 1.15,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: 2.4,
      iridescence: 0.18,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [70, 220],
      flatShading: true
    });
  }

  function makeBodyMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x262117,
      metalness: 0.28,
      roughness: 0.17,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 2.0,
      iridescence: 0.16,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [70, 210],
      flatShading: true
    });
  }

  function makeRimMaterial() {
    const warm = new THREE.Color(0xe3e9df).convertSRGBToLinear();
    const pearl = new THREE.Color(0xf5e5c8).convertSRGBToLinear();

    return new THREE.ShaderMaterial({
      uniforms: {
        uWarm: { value: new THREE.Vector3(warm.r, warm.g, warm.b) },
        uPearl: { value: new THREE.Vector3(pearl.r, pearl.g, pearl.b) },
        uOpacity: { value: 0.36 }
      },
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorld;

        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uWarm;
        uniform vec3 uPearl;
        uniform float uOpacity;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorld;

        void main() {
          float fresnel = pow(1.0 - clamp(dot(normalize(vNormalView), normalize(vViewDir)), 0.0, 1.0), 2.8);
          float band = 0.5 + 0.5 * sin(vWorld.y * 2.0 + vWorld.x * 3.5 + vNormalView.y * 2.0);
          vec3 color = mix(uWarm, uPearl, smoothstep(0.2, 0.9, band));
          gl_FragColor = vec4(color, fresnel * uOpacity);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
  }

  function makeGoldMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xb08b58,
      metalness: 0.92,
      roughness: 0.26,
      emissive: 0x170e05,
      emissiveIntensity: 0.55,
      envMapIntensity: 1.7
    });
  }

  function makeChainMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x40514e,
      metalness: 0.9,
      roughness: 0.24,
      envMapIntensity: 1.5,
      emissive: 0x030808,
      emissiveIntensity: 0.55
    });
  }

  function makeCoreMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x3b2e1d,
      metalness: 0.9,
      roughness: 0.29,
      emissive: 0x080502,
      emissiveIntensity: 0.24,
      envMapIntensity: 1.15
    });
  }

  function makeVertebraGeometry(seed) {
    // Four-sided tube + irregular radial contour = a chunky, mineral vertebra.
    const geometry = new THREE.TorusGeometry(0.78, 0.3, 4, 18);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const angle = Math.atan2(v.y, v.x);
      const radial = 1 +
        Math.sin(angle * 3.0 + seed * 1.71) * 0.14 +
        Math.sin(angle * 7.0 - seed * 0.44) * 0.07;
      v.x *= radial * 1.2;
      v.y *= radial;
      v.z *= 1 + Math.sin(angle * 5.0 + seed * 2.1) * 0.17;
      position.setXYZ(i, v.x, v.y, v.z);
    }

    geometry.computeVertexNormals();
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  function addProcesses(level, index, coneGeometry, crystalGeometry, material) {
    const directions = [
      [-1, -0.1 + rand01(index + 101) * 0.46, (rand01(index + 113) - 0.5) * 0.5],
      [1, -0.04 + rand01(index + 102) * 0.5, (rand01(index + 114) - 0.5) * 0.5],
      [-0.55 + rand01(index + 115) * 0.3, 0.04 + rand01(index + 103) * 0.46, 0.7],
      [0.2 + rand01(index + 116) * 0.35, 0.14 + rand01(index + 104) * 0.4, -1]
    ];

    if (index % 2 === 0) {
      directions.push(
        [0.28 + rand01(index + 117) * 0.3, 0.9, 0.24],
        [-0.35, -0.82, 0.3]
      );
    }

    directions.forEach((d, j) => {
      const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
      const isExtra = j >= 4;
      const length = (0.46 + rand01(index * 5 + j + 105) * 0.8) *
        (j < 2 ? 1 : isExtra ? 1.35 : 0.8);
      const girth = (0.13 + rand01(index * 7 + j + 106) * 0.14) * (isExtra ? 1.16 : 1);
      const useCrystal = j % 2 === 0;
      const geometry = useCrystal ? crystalGeometry : coneGeometry;
      const anchor = new THREE.Vector3(
        (d[0] >= 0 ? 1 : -1) * (0.68 + Math.abs(d[0]) * 0.08),
        0.015,
        d[2] * 0.62
      );

      const spur = new THREE.Mesh(geometry, material);
      spur.scale.set(
        girth,
        useCrystal ? length * 0.55 : length,
        girth * (useCrystal ? 0.8 : 1)
      );
      tempQ.setFromUnitVectors(Y_AXIS, dir);
      spur.quaternion.copy(tempQ);
      spur.position.copy(anchor).addScaledVector(dir, length * (useCrystal ? 0.3 : 0.5));
      spur.frustumCulled = false;
      level.add(spur);

      // A small side branch gives the processes a mineral, grown silhouette.
      if (rand01(index * 11 + j + 107) > 0.54) {
        const branchDir = dir.clone();
        branchDir.x += (rand01(index + 108 + j) - 0.5) * 1.1;
        branchDir.y += 0.25 + rand01(index + 109 + j) * 0.4;
        branchDir.z += (rand01(index + 110 + j) - 0.5) * 0.7;
        branchDir.normalize();

        const branchLength = length * (0.3 + rand01(index + 111 + j) * 0.3);
        const branch = new THREE.Mesh(geometry, material);
        branch.scale.set(
          girth * 0.44,
          useCrystal ? branchLength * 0.55 : branchLength,
          girth * (useCrystal ? 0.36 : 0.44)
        );
        tempQ.setFromUnitVectors(Y_AXIS, branchDir);
        branch.quaternion.copy(tempQ);
        branch.position.copy(anchor).addScaledVector(dir, length * (0.52 + rand01(index + 112 + j) * 0.2));
        branch.position.addScaledVector(branchDir, branchLength * (useCrystal ? 0.3 : 0.5));
        level.add(branch);
      }
    });
  }

  function addChunks(level, index, geometry, material, gold) {
    for (let j = 0; j < 4; j++) {
      const angle = rand01(index * 3 + j + 120) * TAU;
      const radius = 0.72 + rand01(index * 4 + j + 121) * 0.3;
      const chunk = new THREE.Mesh(geometry, j === 3 ? gold : material);
      chunk.position.set(
        Math.cos(angle) * radius,
        (rand01(index * 5 + j + 122) - 0.5) * 0.22,
        Math.sin(angle) * radius
      );
      chunk.scale.set(
        0.8 + rand01(index + 123 + j) * 1.5,
        0.7 + rand01(index + 124 + j) * 1.5,
        0.8 + rand01(index + 125 + j) * 1.5
      );
      chunk.rotation.set(
        rand01(index + 126 + j) * TAU,
        rand01(index + 127 + j) * TAU,
        rand01(index + 128 + j) * TAU
      );
      level.add(chunk);
    }
  }

  function addCore(chainMaterial, coreMaterial, goldMaterial) {
    const points = [];
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const y = 5.6 - t * 11.2;
      points.push(new THREE.Vector3(
        Math.sin(t * 8.2) * 0.1 + 0.15,
        y,
        Math.cos(t * 6.1) * 0.08
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
    const coreGeometry = new THREE.TubeGeometry(curve, 130, 0.052, 6, false);
    const cord = new THREE.Mesh(coreGeometry, coreMaterial);
    cord.frustumCulled = false;
    column.add(cord);

    const threadGeometry = new THREE.TubeGeometry(curve, 130, 0.012, 5, false);
    const threadMaterial = new THREE.MeshBasicMaterial({
      color: 0xd5ac74,
      transparent: true,
      opacity: 0.1,
      toneMapped: false
    });
    const thread = new THREE.Mesh(threadGeometry, threadMaterial);
    thread.frustumCulled = false;
    column.add(thread);

    const nodeGeometry = new THREE.SphereGeometry(0.024, 8, 6);
    for (let i = 0; i < 8; i++) {
      const t = 0.1 + i * 0.11;
      const p = curve.getPointAt(t);
      const node = new THREE.Mesh(nodeGeometry, goldMaterial);
      node.position.copy(p);
      node.position.x += (i % 2 ? 1 : -1) * 0.02;
      column.add(node);
    }
  }

  function addChain(geometry, material, goldMaterial) {
    const count = 28;
    const chain = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 4.95 - t * 9.9;
      const link = new THREE.Mesh(geometry, material);
      link.position.set(
        1.4 + Math.sin(t * 6.0 + 0.4) * 0.15,
        y,
        0.36 + Math.cos(t * 5.2) * 0.12
      );
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      link.rotation.z = Math.sin(t * 9.0) * 0.2;
      link.scale.set(1, 1.45, 1);
      link.frustumCulled = false;
      chain.add(link);

      if (i % 7 === 3) {
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), goldMaterial);
        pin.position.copy(link.position);
        pin.position.y += 0.08;
        chain.add(pin);
      }
    }
    column.add(chain);
  }

  function addFloatingFragments(material, gold) {
    const geometry = new THREE.IcosahedronGeometry(0.075, 0);
    const fragments = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const mesh = new THREE.Mesh(geometry, i % 7 === 0 ? gold : material);
      const angle = rand01(i + 200) * TAU;
      const radius = 1.5 + rand01(i + 201) * 2.7;
      mesh.position.set(
        Math.cos(angle) * radius,
        (rand01(i + 202) - 0.5) * 8.2,
        Math.sin(angle) * radius * 0.7
      );
      mesh.scale.setScalar(0.38 + rand01(i + 203) * 1.15);
      mesh.rotation.set(
        rand01(i + 204) * TAU,
        rand01(i + 205) * TAU,
        rand01(i + 206) * TAU
      );
      mesh.userData.phase = rand01(i + 207) * TAU;
      mesh.userData.baseY = mesh.position.y;
      mesh.frustumCulled = false;
      fragments.add(mesh);
    }
    column.add(fragments);
    column.userData.fragments = fragments;
  }

  /* ---------------------------------------------------------
     Dust
     --------------------------------------------------------- */

  function buildDust() {
    const count = state.mobile ? 1200 : 3000;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const phases = new Float32Array(count);

    const palette = [0xe5c796, 0xffe9cd, 0xcbaa79, 0xf3ddba, 0xd8b382, 0xf9e8ce];
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const bokeh = Math.random() < 0.065;
      const angle = Math.random() * TAU;
      const radius = 0.9 + Math.pow(Math.random(), 0.64) * 5.2;
      const front = Math.random() < 0.17;

      positions[i * 3] = Math.cos(angle) * radius * (0.74 + Math.random() * 0.48);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9.0;
      positions[i * 3 + 2] = front
        ? 1.0 + Math.random() * 1.4
        : -4.2 + Math.random() * 4.8;

      if (Math.random() < 0.08) {
        color.setHex(0xbfd2cc).convertSRGBToLinear();
      } else {
        color.setHex(palette[Math.floor(Math.random() * palette.length)]).convertSRGBToLinear();
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = bokeh
        ? 12 + Math.random() * 24
        : 0.85 + Math.random() * 3.05;
      alphas[i] = bokeh
        ? 0.04 + Math.random() * 0.1
        : 0.22 + Math.random() * 0.5;
      if (Math.random() < 0.07) alphas[i] *= 1.6;
      phases[i] = Math.random() * TAU;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    dustMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uScroll: { value: 0 }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uScroll;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.08 + aPhase) * 0.09;
          p.y += cos(uTime * 0.062 + aPhase * 1.6) * 0.13;
          p.z += sin(uTime * 0.045 + aPhase * 0.8) * 0.07;
          p.y += uScroll * 0.3;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * (16.0 / max(4.0, -mv.z)), 0.6, 66.0) * uPixelRatio;

          float twinkle = 0.78 + 0.22 * sin(uTime * (0.32 + aPhase * 0.08) + aPhase * 8.0);
          vAlpha = aAlpha * twinkle;
          vColor = aColor;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv) * 2.0;
          if (d > 1.0) discard;
          float soft = smoothstep(1.0, 0.22, d);
          float core = smoothstep(0.4, 0.0, d);
          float alpha = vAlpha * (soft * 0.7 + core * 0.56);
          gl_FragColor = vec4(vColor, alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    dustField = new THREE.Points(geometry, dustMaterial);
    dustField.frustumCulled = false;
    dustField.renderOrder = 12;
    scene.add(dustField);
  }

  /* ---------------------------------------------------------
     Events / loop
     --------------------------------------------------------- */

  function bindEvents() {
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onReducedMotionChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(onReducedMotionChange);
    }
  }

  let reducedScrollFrame = 0;

  function onWheel(event) {
    if (!state.ready || state.reduced || state.contextLost) return;

    // Inverted wheel mapping: wheel up sends the stack down, wheel down up.
    const delta = clamp(event.deltaY, -180, 180);
    state.wheelEnergy = clamp(state.wheelEnergy + delta * 0.012, -4.2, 4.2);
    state.lastWheelAt = performance.now();
  }

  function onScroll() {
    if (!state.reduced || !state.ready || state.contextLost) return;
    updateScroll();
    updateHud(true);
    if (reducedScrollFrame) return;
    reducedScrollFrame = requestAnimationFrame(() => {
      reducedScrollFrame = 0;
      renderer.render(scene, camera);
    });
  }

  function onPointerMove(event) {
    if (state.reduced || !state.finePointer) return;
    state.pointerTargetX = (event.clientX / window.innerWidth - 0.5) * 2;
    state.pointerTargetY = (event.clientY / window.innerHeight - 0.5) * 2;
  }

  function onPointerLeave() {
    state.pointerTargetX = 0;
    state.pointerTargetY = 0;
  }

  function onReducedMotionChange(event) {
    state.reduced = event.matches;
    document.body.classList.toggle("is-reduced", state.reduced);

    if (state.reduced) {
      stopLoop();
      state.running = false;
      if (state.ready) renderer.render(scene, camera);
    } else {
      state.running = true;
      startLoop();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopLoop();
      state.running = false;
    } else if (!state.reduced && state.ready) {
      state.running = true;
      startLoop();
    }
  }

  function onResize() {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      state.mobile = window.innerWidth <= 720;
      resize(false);
    }, 80);
  }

  function resize(initial) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    state.mobile = width <= 720;

    camera.aspect = width / height;
    camera.position.z = getCameraZ();
    camera.position.y = getCameraY();
    camera.lookAt(0, getLookY(), 0);
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.mobile ? 1.5 : 2));
    renderer.setSize(width, height, false);

    if (dustMaterial) dustMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    if (column) column.position.y = getColumnY();

    if (state.ready || initial) {
      updateScroll();
      updateHud(true);
      if (state.reduced || !state.running) renderer.render(scene, camera);
    }
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    state.targetProgress = clamp(window.scrollY / max, 0, 1);
    return state.targetProgress;
  }

  function startLoop() {
    if (state.frame || state.contextLost) return;
    const now = performance.now();
    state.lastFrame = now;
    if (!clockStart) clockStart = now;
    state.frame = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
  }

  function tick(now) {
    state.frame = 0;
    if (!state.running || state.contextLost) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    state.elapsed = (now - clockStart) / 1000;
    updateScroll();

    const damp = 1 - Math.exp(-dt * 3.3);
    state.progress += (state.targetProgress - state.progress) * damp;

    const pointerDamp = 1 - Math.exp(-dt * 2.6);
    state.pointerX += (state.pointerTargetX - state.pointerX) * pointerDamp;
    state.pointerY += (state.pointerTargetY - state.pointerY) * pointerDamp;

    // The stack keeps turning when the page is still. The wheel feeds a
    // smoothed vertical velocity and also spins the stack faster; motion
    // eases back to the slow upward drift and base rotation when it stops.
    const verticalPeriod = column.userData.verticalPeriod || 10;
    const baseLoopSpeed = column.userData.loopSpeed || 0.16;

    if (now - state.lastWheelAt > 120) {
      state.wheelEnergy *= Math.exp(-dt * 3.2);
    }

    const targetLoopSpeed = baseLoopSpeed + state.wheelEnergy;
    state.loopVelocity += (targetLoopSpeed - state.loopVelocity) * (1 - Math.exp(-dt * 7));
    state.loopPhase = (state.loopPhase + state.loopVelocity * dt) % verticalPeriod;
    if (state.loopPhase < 0) state.loopPhase += verticalPeriod;

    const spinDrive = state.wheelEnergy * 0.12 + (state.loopVelocity - baseLoopSpeed) * 0.12;
    const targetSpinSpeed = clamp(0.055 + spinDrive, -0.48, 0.48);
    state.spinVelocity += (targetSpinSpeed - state.spinVelocity) * (1 - Math.exp(-dt * 6.5));
    state.spin = (state.spin + state.spinVelocity * dt) % TAU;

    column.rotation.y = -0.1 + state.spin + state.progress * 0.18 + state.pointerX * 0.025;
    column.rotation.x = -0.018 + Math.sin(state.progress * Math.PI) * 0.01 + state.pointerY * 0.01;
    column.rotation.z = Math.sin(state.elapsed * 0.17) * 0.006;
    column.position.y = getColumnY() + state.loopPhase + Math.sin(state.elapsed * 0.3) * 0.007;

    const camDamp = 1 - Math.exp(-dt * 2.2);
    const targetZ = getCameraZ() - state.progress * (state.mobile ? 0.35 : 0.75);
    camera.position.z += (targetZ - camera.position.z) * camDamp;
    camera.position.x += (state.pointerX * 0.14 - camera.position.x) * camDamp;
    camera.position.y += ((getCameraY() - state.pointerY * 0.035) - camera.position.y) * camDamp;
    camera.lookAt(0, getLookY(), 0);

    if (coreLight) {
      coreLight.intensity = 3.1 + Math.sin(state.elapsed * 0.45) * 0.3;
    }

    if (dustMaterial) {
      dustMaterial.uniforms.uTime.value = state.elapsed;
      dustMaterial.uniforms.uScroll.value = state.progress;
    }

    if (dustField) {
      dustField.rotation.y = Math.sin(state.elapsed * 0.025) * 0.018 - state.progress * 0.035;
    }

    updateHud(false);
    renderer.render(scene, camera);
    state.frame = requestAnimationFrame(tick);
  }

  function updateHud(force) {
    const p = state.progress;

    if (els.progressBar) {
      els.progressBar.style.transform = `scaleX(${p.toFixed(4)})`;
    }

    let num = "00";
    let name = "COLUMN";
    if (p >= 0.68) {
      num = "02";
      name = "DRIFT";
    } else if (p >= 0.12) {
      num = "01";
      name = "TORSION";
    }

    if (els.chapterNum && (force || els.chapterNum.textContent !== num)) els.chapterNum.textContent = num;
    if (els.chapterName && (force || els.chapterName.textContent !== name)) els.chapterName.textContent = name;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rand01(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }
})();
