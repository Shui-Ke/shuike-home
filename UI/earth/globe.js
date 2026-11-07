(() => {
  'use strict';
  function latLonToXYZ(latitude, longitude) {
    const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
    return { x: Math.cos(lat) * Math.sin(lon), y: -Math.sin(lat), z: Math.cos(lat) * Math.cos(lon) };
  }
  // Local parser so the glow colour never depends on js/theme.js having been created first.
  function toneToRgb(value) {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(value ?? '').trim());
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].replace(/./g, digit => digit + digit) : match[1];
    const tone = parseInt(digits, 16);
    return { r: (tone >> 16) & 255, g: (tone >> 8) & 255, b: tone & 255 };
  }
  function projectPoint(point, angle, radius, camera = 3.5) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = point.x * cos + point.z * sin;
    const z = -point.x * sin + point.z * cos;
    const scale = camera / (camera - z);
    const depth = (z + 1) / 2;
    return { x: x * radius * scale, y: point.y * radius * scale, z, scale,
      size: (.5 + .38 * depth) * scale, alpha: .08 + .82 * depth * depth };
  }
  function zoomLimit(radius, width, height) {
    return Math.max(1, Math.min(2.6, width * .43 / (radius * 1.05), height * .36 / (radius * 1.05)));
  }
  function wheelZoom(current, delta, mode, pageHeight, maximum) {
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
    return Math.max(.35, Math.min(maximum, current * Math.exp(-Math.max(-180, Math.min(180, pixels)) * .0025)));
  }
  const TAU = Math.PI * 2, EARTH_RADIUS = .016;
  // Artistic distances and radii: a readable overview, not a physical scale model.
  const PLANETS = [
    { name: 'mercury', orbit: .15, radius: .008, phase: .3, speed: .12 },
    { name: 'venus', orbit: .28, radius: .014, phase: 2.5, speed: .09 },
    { name: 'earth', orbit: .42, radius: EARTH_RADIUS, phase: -Math.PI / 2, speed: 0 },
    { name: 'mars', orbit: .55, radius: .011, phase: .8, speed: .065 },
    { name: 'jupiter', orbit: .69, radius: .035, phase: 3.5, speed: .035 },
    { name: 'saturn', orbit: .80, radius: .029, phase: -.5, speed: .026 },
    { name: 'uranus', orbit: .91, radius: .022, phase: 1.9, speed: .019 },
    { name: 'neptune', orbit: 1, radius: .021, phase: 4.7, speed: .014 }
  ];
  function orbitPoint(distance, phase) {
    const x = Math.cos(phase) * distance, y = Math.sin(phase) * distance * .42;
    const tilt = -.48;
    return { x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt), z: Math.sin(phase) * distance * Math.sqrt(1 - .42 ** 2) };
  }
  function rotateOrbit(point, yaw = 0, pitch = 0) {
    const x = point.x * Math.cos(yaw) + (point.z || 0) * Math.sin(yaw);
    const z = -point.x * Math.sin(yaw) + (point.z || 0) * Math.cos(yaw);
    return { x, y: point.y * Math.cos(pitch) - z * Math.sin(pitch), z: point.y * Math.sin(pitch) + z * Math.cos(pitch) };
  }
  function smoothStep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function sceneCamera(width, height, radius, zoom, travel, centerY = .52, rotation = {}) {
    const blend = smoothStep(travel), yaw = (rotation.yaw || 0) * blend, pitch = (rotation.pitch || 0) * blend;
    const earth = rotateOrbit(orbitPoint(.42, -Math.PI / 2), yaw, pitch);
    const closeScale = radius * zoom / EARTH_RADIUS;
    const orbitX = rotateOrbit(orbitPoint(1, 0), yaw, pitch), orbitY = rotateOrbit(orbitPoint(1, Math.PI / 2), yaw, pitch);
    const farScale = Math.min(width * .43, height * .32 / Math.max(.60, Math.hypot(orbitX.y, orbitY.y)));
    return { scale: Math.exp(Math.log(closeScale) * (1 - blend) + Math.log(farScale) * blend),
      x: earth.x * (1 - blend), y: earth.y * (1 - blend), cx: width / 2, cy: height * centerY, blend, yaw, pitch };
  }
  function sceneProject(point, camera) {
    const rotated = rotateOrbit(point, camera.yaw, camera.pitch);
    return { x: camera.cx + (rotated.x - camera.x) * camera.scale, y: camera.cy + (rotated.y - camera.y) * camera.scale, z: rotated.z };
  }
  function canEnterSolar({ targetZoom, zoom, now, lastWheel, minimumSince }) {
    return targetZoom <= .35 && zoom <= .352 && now - minimumSince >= 450 && now - lastWheel > 180;
  }
  function spherePoints(count) {
    return Array.from({ length: count }, (_, i) => {
      const y = 1 - 2 * (i + .5) / count, r = Math.sqrt(1 - y * y), phi = i * 2.39996323;
      return { x: r * Math.cos(phi), y, z: r * Math.sin(phi) };
    });
  }
  function particleSphere(count, seed = 0x9e3779b9) {
    let state = seed >>> 0;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    return Array.from({ length: count }, () => {
      const y = random() * 2 - 1;
      const phi = random() * TAU;
      const radius = Math.sqrt(1 - y * y);
      const shell = .92 + random() * .12;
      return {
        x: radius * Math.cos(phi) * shell,
        y: y * shell,
        z: radius * Math.sin(phi) * shell
      };
    });
  }
  function sampleLandPixels(data, width, height, spacing = 6) {
    const points = [];
    // Read each pixel. Decimate only after testing the mask; wider polar spacing
    // compensates for the distortion of the equirectangular projection.
    for (let y = 0; y < height; y++) {
      const latitude = 90 - (y + .5) / height * 180;
      const rowSpacing = Math.max(spacing, Math.round(spacing / Math.max(.035, Math.cos(latitude * Math.PI / 180))));
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const land = data[i + 3] > 127 && data[i] > 127 && data[i + 1] > 127 && data[i + 2] > 127;
        if (!land || y % spacing || (x + (y % (spacing * 2) ? Math.floor(rowSpacing / 2) : 0)) % rowSpacing) continue;
        points.push(latLonToXYZ(latitude, (x + .5) / width * 360 - 180));
      }
    }
    return points;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { latLonToXYZ, projectPoint, sampleLandPixels, toneToRgb, zoomLimit, wheelZoom, orbitPoint, sceneCamera, sceneProject, canEnterSolar, PLANETS };
  if (typeof window === 'undefined') return;
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createDotGlobe = function (canvas, config = {}) {
    const settings = { texture: '', speed: .13, spacing: 6, maxRadius: 118, centerY: .52, widthRatio: .23, heightRatio: .145, zoomCap: 0, tone: '', interactive: true, keyboard: true, selectable: false, observe: false, wheelScope: null, pointerScope: null, elements: null, view: null, ...config };
    const root = document.documentElement;
    const context = canvas.getContext('2d');
    if (!context) return { pause() {}, resume() {}, setZoom() {}, resetZoom() {}, openMap() {}, closeMap() {}, destroy() {} };
    const map = window.ShuikeModules.worldMap;
    const locator = map.createLocator();
    const elements = settings.elements || {};
    const mapTrigger = elements.mapTrigger || document.querySelector('#globe-open-map');
    const mapControls = elements.mapControls || document.querySelector('#world-map-controls');
    const mapStatus = elements.mapStatus || document.querySelector('#map-status');
    const mapBack = elements.mapBack || document.querySelector('#map-back');
    const mapRetry = elements.mapRetry || document.querySelector('#map-retry');
    // Historic landing pages gate the scene with html[data-view]; standalone
    // embeds without a data-view attribute stay active.
    const viewActive = () => typeof settings.view === 'function'
      ? Boolean(settings.view())
      : (root.dataset.view ? root.dataset.view === 'landing' : true);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController(), options = { signal: controller.signal };
    const texture = new Image();
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
    const brush = sprite.getContext('2d');
    const goldSprite = document.createElement('canvas'); goldSprite.width = goldSprite.height = 32;
    let tone = '#fff';
    function readTone() {
      tone = String(settings.tone || '').trim()
        || getComputedStyle(document.documentElement).getPropertyValue('--globe-glow').trim()
        || '#fff';
    }
    // The glow sprite is baked once per theme, so a light page gets dark dots.
    function buildSprite() {
      readTone();
      const toneRgb = toneToRgb(tone) || { r: 255, g: 255, b: 255 };
      const solid = `rgb(${toneRgb.r},${toneRgb.g},${toneRgb.b})`;
      const glow = brush.createRadialGradient(16, 16, 0, 16, 16, 16);
      glow.addColorStop(0, solid);
      glow.addColorStop(.18, `rgba(${toneRgb.r},${toneRgb.g},${toneRgb.b},.94)`);
      glow.addColorStop(.35, `rgba(${toneRgb.r},${toneRgb.g},${toneRgb.b},.31)`);
      glow.addColorStop(1, `rgba(${toneRgb.r},${toneRgb.g},${toneRgb.b},0)`);
      brush.clearRect(0, 0, 32, 32);
      brush.fillStyle = glow; brush.fillRect(0, 0, 32, 32);
      const goldBrush = goldSprite.getContext('2d');
      const gold = rootThemeGold();
      const goldGlow = goldBrush.createRadialGradient(16, 16, 0, 16, 16, 16);
      goldGlow.addColorStop(0, `rgba(${gold},1)`);
      goldGlow.addColorStop(.25, `rgba(${gold},.95)`);
      goldGlow.addColorStop(.55, `rgba(${gold},.3)`);
      goldGlow.addColorStop(1, `rgba(${gold},0)`);
      goldBrush.clearRect(0, 0, 32, 32); goldBrush.fillStyle = goldGlow; goldBrush.fillRect(0, 0, 32, 32);
    }
    function rootThemeGold() { return document.documentElement.dataset.theme === 'light' ? '153,104,24' : '232,189,104'; }
    buildSprite();
    let points = [], width = 0, height = 0, radius = 0, angle = -.45;
    let frame = 0, last = 0, paused = false, destroyed = false;
    let zoom = 1, targetZoom = 1, maxZoom = 2.6, orbitPhase = 0, defaultState = true;
    let travel = 0, solarTarget = 0, solarTime = 0, lastWheel = -Infinity, minimumSince = Infinity;
    let plans = 0, plansTarget = 0;
    const solarRotation = { yaw: 0, pitch: 0 };
    let solarDrag = null, suppressDragClick = false;
    let mapTravel = 0, mapTarget = 0, locationFade = 0, location = null, locatePending = false, focusEarth = false;
    // Planet focus: a selected world glides from its orbit to the centre while
    // its neighbours dissolve. solarTime freezes so the camera target is stable.
    let planetFocus = null, focus = 0, focusTarget = 0;
    let lastBodies = [];
    const sphere = spherePoints(1000), focusSphere = spherePoints(5200), sunSphere = particleSphere(2200);
    const earthAnchor = () => ({ visible: solarTarget === 0 && travel === 0 && mapTarget === 0 && mapTravel === 0, radius: radius * zoom });
    let lastAnchor = null;
    function reportZoom(force = false) {
      const anchor = earthAnchor();
      if (force || !lastAnchor || anchor.visible !== lastAnchor.visible || Math.abs(anchor.radius - lastAnchor.radius) > .1) {
        lastAnchor = anchor;
        document.dispatchEvent(new CustomEvent('shuike:earth-anchor', { detail: anchor }));
      }
      const isDefault = mapTravel === 0 && mapTarget === 0 && travel === 0 && solarTarget === 0 && Math.abs(zoom - 1) < .002 && Math.abs(targetZoom - 1) < .002;
      root.dataset.globeZoomed = String(!isDefault);
      canvas.dataset.zoom = zoom.toFixed(3); canvas.dataset.targetZoom = targetZoom.toFixed(3); canvas.dataset.maxZoom = maxZoom.toFixed(3);
      canvas.dataset.scene = mapTravel === 1 ? 'map' : mapTravel > 0 ? 'map-transition' : travel === 0 ? 'earth' : travel === 1 ? 'solar' : 'transition';
      canvas.dataset.solarProgress = travel.toFixed(3);
      canvas.dataset.mapProgress = mapTravel.toFixed(3);
      canvas.dataset.plansProgress = plans.toFixed(3);
      if (force || isDefault !== defaultState) {
        defaultState = isDefault;
        const detail = { zoom, targetZoom, isDefault };
        settings.onZoom?.(detail);
        document.dispatchEvent(new CustomEvent('shuike:globe-zoom', { detail }));
      }
    }
    async function locate() {
      if (destroyed || locatePending) return;
      locatePending = true;
      canvas.dataset.locationState = 'loading';
      if (mapStatus) mapStatus.textContent = '正在查询 IP 的大致位置…';
      if (mapRetry) mapRetry.hidden = true;
      const result = await locator.locate();
      locatePending = false;
      if (destroyed) return;
      location = result;
      points.forEach(point => { point.gold = map.locationWeight(point, result); });
      canvas.dataset.locationState = result ? 'ready' : 'unavailable';
      if (mapStatus) mapStatus.textContent = result ? (result.label || '') : '暂时无法定位，世界地图仍可正常浏览。';
      if (mapRetry) mapRetry.hidden = Boolean(result);
      if (motion.matches) locationFade = result ? 1 : 0;
      sync();
    }
    function openMap() {
      if (!mapTrigger || !mapControls || !allowed() || paused || mapTarget || !viewActive() || (travel !== 0 && travel !== 1)) return;
      stopSolarDrag();
      mapTarget = 1; targetZoom = zoom; focusEarth = false;
      if (motion.matches) mapTravel = 1;
      mapControls.hidden = false;
      if (mapBack) mapBack.textContent = 'Return';
      mapBack?.focus({ preventScroll: true });
      reportZoom(true); locate(); sync();
    }
    function closeMap({ restoreFocus = true } = {}) {
      if (!mapTarget && !mapTravel) return;
      mapTarget = 0; focusEarth = restoreFocus;
      if (mapControls) mapControls.hidden = true;
      if (motion.matches) mapTravel = 0;
      reportZoom(true); sync();
    }
    function setSolar(value) {
      stopSolarDrag();
      if (!value) clearPlanetFocus({ silent: false });
      if (value && travel === 0) solarRotation.yaw = solarRotation.pitch = 0;
      solarTarget = value ? 1 : 0;
      if (motion.matches) travel = solarTarget;
      reportZoom(true);
      document.dispatchEvent(new CustomEvent('shuike:globe-scene-change', { detail: { scene: value ? 'solar' : 'earth' } }));
      if (!frame) sync();
    }
    function setPlans(value) {
      if (value) {
        if (mapTarget || mapTravel) closeMap({ restoreFocus: false });
        if (!solarTarget && travel === 0) setSolar(true);
      }
      plansTarget = value ? 1 : 0;
      if (motion.matches) plans = plansTarget;
      reportZoom(true);
      if (!frame) sync();
    }
    function setZoom(value) {
      if (destroyed || !Number.isFinite(value)) return;
      stopSolarDrag();
      clearPlanetFocus({ silent: false });
      closeMap({ restoreFocus: false });
      solarTarget = 0;
      if (motion.matches) { travel = 0; solarRotation.yaw = solarRotation.pitch = 0; }
      targetZoom = Math.max(.35, Math.min(maxZoom, value));
      if (Math.abs(targetZoom - 1) < .015) targetZoom = 1;
      if (motion.matches) zoom = targetZoom;
      reportZoom(true);
      if (!frame) sync();
    }
    function clearPlanetFocus({ silent = true } = {}) {
      if (!planetFocus) return;
      const name = planetFocus;
      planetFocus = null;
      focus = 0;
      focusTarget = 0;
      canvas.classList.remove('is-planet-focused');
      delete canvas.dataset.planetFocus;
      if (!silent) document.dispatchEvent(new CustomEvent('shuike:planet-blur', { detail: { name } }));
    }
    function focusPlanet(name) {
      if (!settings.selectable || !settings.interactive || destroyed) return;
      if (!PLANETS.some(planet => planet.name === name)) return;
      if (travel < .985 || solarTarget !== 1 || mapTarget || mapTravel || plans > .01) return;
      if (planetFocus === name) return;
      planetFocus = name;
      focusTarget = 1;
      canvas.classList.add('is-planet-focused');
      canvas.dataset.planetFocus = name;
      if (motion.matches) focus = 1;
      document.dispatchEvent(new CustomEvent('shuike:planet-focus', {
        detail: { name, index: PLANETS.findIndex(planet => planet.name === name) + 1 }
      }));
      if (motion.matches) sync();
      else if (!frame) sync();
    }
    function unfocusPlanet() {
      if (!planetFocus) return;
      const name = planetFocus;
      focusTarget = 0;
      canvas.classList.remove('is-planet-focused');
      delete canvas.dataset.planetFocus;
      document.dispatchEvent(new CustomEvent('shuike:planet-blur', { detail: { name } }));
      if (motion.matches) {
        focus = 0;
        planetFocus = null;
        sync();
      } else if (!frame) {
        last = 0;
        sync();
      }
    }
    function planetAtEvent(event) {
      if (!lastBodies.length) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      let best = null, bestDistance = Infinity;
      for (const body of lastBodies) {
        if (body.name === 'sun') continue;
        const reach = Math.max(20, body.r * 1.4);
        const distance = Math.hypot(x - body.x, y - body.y);
        if (distance <= reach && distance < bestDistance) {
          best = body;
          bestDistance = distance;
        }
      }
      return best;
    }
    canvas.dataset.state = 'reading-texture';
    function clear() { context.clearRect(0, 0, width, height); }
    function allowed() { return !destroyed && points.length > 0 && !document.hidden && !window.ShuikeIntro?.playing; }
    function dot(x, y, size, alpha, ink = sprite) {
      if (x < -8 || y < -8 || x > width + 8 || y > height + 8) return;
      context.globalAlpha = alpha;
      context.drawImage(ink, x - size * 3, y - size * 3, size * 6, size * 6);
    }
    function bodyPosition(body, camera) {
      const world = body.orbit ? orbitPoint(body.orbit, body.phase + solarTime * body.speed) : { x: 0, y: 0 };
      const position = sceneProject(world, camera);
      if (body.name !== 'earth' && travel < 1) {
        // Start outside the viewport, then settle onto the same orbital coordinates.
        // The offset is reversible and recomputed on resize; no random entry jumps.
        const initial = sceneProject(world, sceneCamera(width, height, radius, .35, 0, settings.centerY));
        const dx = initial.x - width / 2, dy = initial.y - height * settings.centerY;
        const distance = Math.hypot(dx, dy) || 1, edge = Math.hypot(width, height) + 300;
        const remaining = (1 - camera.blend) ** 3;
        position.x += (dx / distance * edge - dx) * remaining;
        position.y += (dy / distance * edge - dy) * remaining;
      }
      const sunBoost = body.name === 'sun' ? 1 + smoothStep(plans) * 2.5 : 1;
      return { ...body, ...position, r: body.radius * camera.scale * sunBoost };
    }
    function drawBody(body) {
      if (body.x + body.r * 2 < 0 || body.x - body.r * 2 > width || body.y + body.r * 2 < 0 || body.y - body.r * 2 > height) return;
      const isEarth = body.name === 'earth', isSun = body.name === 'sun';
      const fade = (isSun ? 1 : 1 - smoothStep(plans)) * (body.alpha ?? 1);
      if (fade <= .002) return;
      const source = isEarth ? points : isSun ? sunSphere : body.focus ? focusSphere : sphere;
      // Small distant planets retain their silhouettes without rendering thousands of points.
      const budget = Math.max(70, Math.ceil(body.r * body.r * (isSun ? 5 : 3)));
      const step = Math.max(1, Math.ceil(source.length / budget));
      for (let i = 0; i < source.length; i += step) {
        const p = projectPoint(source[i], angle, body.r);
        const size = p.size * (isEarth ? Math.max(.48, body.r / 110) : isSun ? .92 : body.focus ? Math.max(.65, body.r / 150) : .65);
        dot(body.x + p.x, body.y + p.y, size, (isSun ? .38 + p.alpha * .6 : p.alpha) * (1 - smoothStep(mapTravel)) * fade);
      }
      if (body.name === 'saturn') {
        const ringCount = body.focus ? 520 : 240;
        const ringSize = body.focus ? Math.max(.48, body.r / 190) : .48;
        for (let i = 0; i < ringCount; i++) {
          const phase = i / ringCount * TAU, ring = 1.65 + .28 * Math.sin(i * 2.4);
          const p = rotateOrbit(orbitPoint(body.r * ring, phase), solarRotation.yaw * smoothStep(travel), solarRotation.pitch * smoothStep(travel));
          if (Math.hypot(p.x, p.y) < body.r * 1.04 && p.z < 0) continue;
          dot(body.x + p.x, body.y + p.y, ringSize, .48 * (1 - smoothStep(mapTravel)) * fade);
        }
      }
    }
    function drawMap(earth) {
      const blend = smoothStep(mapTravel), layout = map.mapLayout(width, height);
      if (mapControls) mapControls.style.maxWidth = `${Math.max(300, layout.width)}px`;
      const step = Math.max(1, Math.ceil(points.length / Math.max(70, Math.ceil(earth.r * earth.r * 3))));
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const p = projectPoint(point, angle, earth.r);
        const x = (earth.x + p.x) * (1 - blend) + (layout.x + point.mapX * layout.width) * blend;
        const y = (earth.y + p.y) * (1 - blend) + (layout.y + point.mapY * layout.height) * blend;
        const size = p.size * Math.max(.48, earth.r / 110) * (1 - blend) + Math.max(.65, layout.width / 850) * blend;
        const alpha = (p.alpha * (1 - blend) + .9 * blend) * (i % step ? blend : 1);
        const gold = (point.gold || 0) * locationFade * blend;
        dot(x, y, size, alpha * (1 - gold));
        if (gold > .002) dot(x, y, size * 1.2, alpha * gold, goldSprite);
      }
    }
    function updateTrigger(earth) {
      if (!mapTrigger) return;
      mapTrigger.hidden = !allowed() || paused || Boolean(mapTarget || mapTravel) || !viewActive() || (travel > 0 && travel < 1) || plans > .01;
      if (!mapTrigger.hidden) {
        const diameter = Math.max(36, earth.r * 2.088);
        mapTrigger.style.left = `${earth.x}px`; mapTrigger.style.top = `${earth.y}px`;
        mapTrigger.style.width = mapTrigger.style.height = `${diameter}px`;
        if (focusEarth) { focusEarth = false; mapTrigger.focus({ preventScroll: true }); }
      }
    }
    function draw() {
      clear();
      if (!allowed()) { if (mapTrigger) mapTrigger.hidden = true; return; }
      const camera = sceneCamera(width, height, radius, zoom, travel, settings.centerY, solarRotation);
      const bodies = (travel > 0 ? [{ name: 'sun', radius: .055 }, ...PLANETS] : [PLANETS[2]])
        .map(body => bodyPosition(body, camera));
      const earth = bodies.find(body => body.name === 'earth');
      updateTrigger(earth);
      const focusEase = smoothStep(focus);
      const focused = planetFocus ? bodies.find(body => body.name === planetFocus) : null;
      if (focused) {
        // Glide the selected world to the centre while it grows to a close-up.
        const targetRadius = Math.min(width * .26, height * .43);
        focused.x += (width / 2 - focused.x) * focusEase;
        focused.y += (height * .5 - focused.y) * focusEase;
        focused.r += (targetRadius - focused.r) * focusEase;
        focused.focus = focusEase;
        focused.z = 99;
      }
      if (focusEase > 0) {
        for (const body of bodies) body.alpha = body === focused ? 1 : 1 - focusEase;
      }
      lastBodies = bodies.map(body => ({ name: body.name, x: body.x, y: body.y, r: body.r }));
      for (const planet of PLANETS) {
        const opacity = (planet.name === 'earth' ? 1 : camera.blend) * (1 - smoothStep(mapTravel)) * (1 - smoothStep(plans)) * (1 - focusEase);
        if (!opacity) continue;
        const count = Math.max(180, Math.min(6000, Math.ceil(TAU * planet.orbit * camera.scale / 3)));
        for (let i = 0; i < count; i++) {
          const p = sceneProject(orbitPoint(planet.orbit, (i / count + orbitPhase) * TAU), camera);
          if (p.x < -5 || p.x > width + 5 || p.y < -5 || p.y > height + 5) continue;
          // Oceans also occlude the orbit, even though Earth only draws land dots.
          if (bodies.some(body => (p.x - body.x) ** 2 + (p.y - body.y) ** 2 < (body.r * 1.044 + 1) ** 2)) continue;
          const brightness = .5 + .5 * Math.sin(i * 2.39996);
          dot(p.x, p.y, .48 + brightness * .15, opacity * (.22 + .3 * brightness));
        }
      }
      const plansFade = smoothStep(plans);
      const sunBody = bodies.find(body => body.name === 'sun');
      if (sunBody && plansFade > .01) {
        const glowRadius = sunBody.r * 2.65;
        const glow = context.createRadialGradient(sunBody.x, sunBody.y, sunBody.r * .1, sunBody.x, sunBody.y, glowRadius);
        glow.addColorStop(0, `rgba(255,255,255,${.2 * plansFade})`);
        glow.addColorStop(.2, `rgba(255,255,255,${.08 * plansFade})`);
        glow.addColorStop(.58, `rgba(255,255,255,${.018 * plansFade})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(sunBody.x, sunBody.y, glowRadius, 0, TAU);
        context.fill();
        context.globalCompositeOperation = 'source-over';
      }
      bodies.sort((a, b) => a.z - b.z).filter(body => !mapTravel || body.name !== 'earth').forEach(drawBody);
      if (mapTravel) drawMap(earth);
      context.globalAlpha = 1;
      canvas.dataset.angle = angle.toFixed(4);
      canvas.dataset.solarYaw = solarRotation.yaw.toFixed(4);
      canvas.dataset.solarPitch = solarRotation.pitch.toFixed(4);
    }
    function tick(time) {
      frame = 0;
      if (!allowed() || paused || motion.matches) { last = 0; draw(); return; }
      const dt = last ? Math.min((time - last) / 1000, .05) : 0;
      if (!mapTarget && !mapTravel) {
        angle = (angle + dt * settings.speed) % (Math.PI * 2);
        orbitPhase = (orbitPhase + dt * .035 * zoom) % 1;
        travel = Math.max(0, Math.min(1, travel + Math.sign(solarTarget - travel) * dt / 1.6));
        plans = Math.max(0, Math.min(1, plans + Math.sign(plansTarget - plans) * dt / 1.1));
        if (travel === 0) solarRotation.yaw = solarRotation.pitch = 0;
        // Keep Earth's anchor fixed so reversing the camera always returns to its original center.
        if (travel === 1 && solarTarget === 1 && !planetFocus) solarTime += dt;
        // Freeze the orbit while a planet is selected, then ease the close-up in/out.
        if (focusTarget) focus = Math.min(1, focus + dt / 1.05);
        else if (focus > 0) focus = Math.max(0, focus - dt / .85);
        if (!focusTarget && focus === 0 && planetFocus) planetFocus = null;
        zoom += (targetZoom - zoom) * (1 - Math.exp(-dt * 9));
        if (Math.abs(targetZoom - zoom) < .002) zoom = targetZoom;
      }
      mapTravel = Math.max(0, Math.min(1, mapTravel + Math.sign(mapTarget - mapTravel) * dt / 1.25));
      if (location) locationFade = Math.min(1, locationFade + dt / .9);
      reportZoom();
      last = time; draw();
      if (mapTravel === 1 && mapTarget === 1 && (!location || locationFade === 1)) { last = 0; return; }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (!allowed() || paused || !viewActive() || mapTarget || mapTravel) stopSolarDrag();
      cancelAnimationFrame(frame); frame = 0; last = 0;
      canvas.classList.toggle('is-visible', Boolean(allowed()));
      draw();
      if (allowed() && !paused && !motion.matches) frame = requestAnimationFrame(tick);
    }
    function resize() {
      // Inline embeds size the canvas from its container; the full-page scene
      // is fixed to the viewport, so both resolve to the same measurement.
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(box.width || innerWidth));
      height = Math.max(1, Math.round(box.height || innerHeight));
      radius = Math.min(settings.maxRadius, width * settings.widthRatio, height * settings.heightRatio);
      maxZoom = settings.zoomCap > 0 ? Math.max(1, settings.zoomCap) : zoomLimit(radius, width, height);
      targetZoom = Math.min(targetZoom, maxZoom); zoom = Math.min(zoom, maxZoom); reportZoom();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0); sync();
    }
    texture.onload = () => {
      if (destroyed) return;
      try {
        const sampling = document.createElement('canvas');
        sampling.width = texture.naturalWidth; sampling.height = texture.naturalHeight;
        const source = sampling.getContext('2d', { willReadFrequently: true });
        source.drawImage(texture, 0, 0);
        const pixels = source.getImageData(0, 0, sampling.width, sampling.height);
        points = sampleLandPixels(pixels.data, pixels.width, pixels.height, settings.spacing);
        points.forEach(point => { const p = map.mapCoordinates(point); point.mapX = p.x; point.mapY = p.y; });
        if (!points.length) throw new Error('The land mask contains no sampled land pixels.');
        canvas.dataset.state = 'ready'; canvas.dataset.pointCount = String(points.length);
        document.dispatchEvent(new CustomEvent('shuike:globe-ready', { detail: { pointCount: points.length } }));
        sync();
      } catch (error) { fail(error); }
    };
    function fail(error) {
      canvas.dataset.state = 'error';
      console.warn('Earth texture could not be sampled:', error);
      document.dispatchEvent(new CustomEvent('shuike:globe-error'));
    }
    texture.onerror = () => { if (!destroyed) fail(new Error('Earth texture failed to decode.')); };
    document.addEventListener('shuike:intro-end', sync, options);
    document.addEventListener('shuike:intro-start', sync, options);
    document.addEventListener('visibilitychange', sync, options);
    document.addEventListener('shuike:theme-change', () => { buildSprite(); sync(); }, options);
    document.addEventListener('shuike:view-change', sync, options);
    mapTrigger?.addEventListener('click', openMap, options);
    mapBack?.addEventListener('click', () => closeMap(), options);
    mapRetry?.addEventListener('click', locate, options);
    document.querySelector('#enter-files')?.addEventListener('click', () => closeMap({ restoreFocus: false }), options);
    window.addEventListener('resize', resize, options);
    // Inline embeds can change size without a window resize (responsive grid,
    // font swap, panel open), so follow the canvas box itself when asked.
    const observer = settings.observe && typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (observer) observer.observe(canvas);
    motion.addEventListener('change', () => {
      if (motion.matches) { zoom = targetZoom; travel = solarTarget; mapTravel = mapTarget; locationFade = location ? 1 : 0; reportZoom(); }
      sync();
    }, options);
    const interactive = 'button:not(#globe-open-map),a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],.glass-panel,#settings-dialog,.landing-menu,.window-dock,.map-controls,.earth-terminal';
    function canRotateSolar() {
      return allowed() && !paused && viewActive() && !root.dataset.expandedWindow && travel === 1 && solarTarget === 1 && !mapTarget && !mapTravel;
    }
    function stopSolarDrag() {
      if (!solarDrag) return;
      const { target, id } = solarDrag;
      solarDrag = null;
      delete root.dataset.solarDragging;
      if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    }
    (settings.pointerScope || window).addEventListener('pointerdown', event => {
      suppressDragClick = false;
      if (solarDrag || event.pointerType !== 'mouse' || event.button !== 0 || event.defaultPrevented || !canRotateSolar() || event.target.closest?.(interactive)) return;
      solarDrag = { id: event.pointerId, target: event.target, x: event.clientX, y: event.clientY, yaw: solarRotation.yaw, pitch: solarRotation.pitch, moved: false };
    }, options);
    // Select a planet from the solar overview; a click anywhere while focused
    // returns to the system. The info panel is page-owned (planet-focus event).
    canvas.addEventListener('click', event => {
      if (!settings.selectable || !settings.interactive || paused || destroyed || !allowed() || !viewActive()) return;
      canvas.classList.remove('is-planet-hover');
      if (planetFocus) {
        event.preventDefault();
        unfocusPlanet();
        return;
      }
      if (!(travel > .985 && solarTarget === 1)) return;
      const hit = planetAtEvent(event);
      if (!hit) return;
      event.preventDefault();
      focusPlanet(hit.name);
    }, options);
    canvas.addEventListener('pointermove', event => {
      if (!settings.selectable || planetFocus) {
        canvas.classList.remove('is-planet-hover');
        return;
      }
      const hit = travel > .985 && solarTarget === 1 ? planetAtEvent(event) : null;
      canvas.classList.toggle('is-planet-hover', Boolean(hit));
    }, options);
    canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-planet-hover'), options);
    window.addEventListener('pointermove', event => {
      if (!solarDrag || event.pointerId !== solarDrag.id) return;
      if (!(event.buttons & 1) || !canRotateSolar()) { stopSolarDrag(); return; }
      const dx = event.clientX - solarDrag.x, dy = event.clientY - solarDrag.y;
      if (!solarDrag.moved && Math.hypot(dx, dy) < 4) return;
      if (!solarDrag.moved) {
        solarDrag.moved = true;
        solarDrag.target.setPointerCapture?.(solarDrag.id);
        root.dataset.solarDragging = 'true';
      }
      suppressDragClick = true;
      event.preventDefault();
      solarRotation.yaw = ((solarDrag.yaw + dx * .0045 + Math.PI) % TAU + TAU) % TAU - Math.PI;
      solarRotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, solarDrag.pitch - dy * .0045));
      if (motion.matches) draw();
    }, { ...options, passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(type, event => { if (event.pointerId === solarDrag?.id) stopSolarDrag(); }, options);
    }
    window.addEventListener('blur', stopSolarDrag, options);
    window.addEventListener('dragstart', event => { if (solarDrag) event.preventDefault(); }, options);
    window.addEventListener('selectstart', event => { if (solarDrag) event.preventDefault(); }, options);
    window.addEventListener('click', event => {
      if (!suppressDragClick || event.detail === 0) return;
      suppressDragClick = false;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { ...options, capture: true });
    function onWheel(event) {
      if (!settings.interactive || !allowed() || paused || root.dataset.expandedWindow || event.ctrlKey || event.metaKey || event.defaultPrevented || !event.deltaY || event.target.closest?.(interactive)) return;
      // A scoped wheel (inline embeds) only fires over its canvas, so the page
      // keeps scrolling normally everywhere else.
      event.preventDefault();
      stopSolarDrag();
      if (planetFocus) { unfocusPlanet(); return; }
      if (mapTarget || mapTravel) return;
      const now = performance.now(), previousWheel = lastWheel;
      lastWheel = now;
      if (travel > 0 || solarTarget) {
        if (event.deltaY < 0) setSolar(false);
        return;
      }
      if (event.deltaY > 0 && canEnterSolar({ targetZoom, zoom, now, lastWheel: previousWheel, minimumSince })) {
        setSolar(true); return;
      }
      const next = wheelZoom(targetZoom, event.deltaY, event.deltaMode, height, maxZoom);
      if (next <= .35 && targetZoom > .35) minimumSince = now;
      if (next > .35) minimumSince = Infinity;
      setZoom(next);
    }
    (settings.wheelScope || window).addEventListener('wheel', onWheel, { ...options, passive: false });
    window.addEventListener('keydown', event => {
      if (!settings.interactive || settings.keyboard === false) return;
      if (event.key === 'Escape' && mapTarget) { event.preventDefault(); closeMap(); return; }
      if (event.target === mapTrigger) return;
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || !allowed() || root.dataset.expandedWindow || event.target.closest?.(interactive)) return;
      event.preventDefault(); setZoom(1);
    }, options);
    resize(); texture.src = settings.texture;
    return Object.freeze({
      get pointCount() { return points.length; },
      get earthAnchor() { return earthAnchor(); },
      get zoom() { return zoom; },
      get targetZoom() { return targetZoom; },
      get scene() { return canvas.dataset.scene; },
      get plans() { return smoothStep(plans); },
      get focusedPlanet() { return planetFocus; },
      get focusProgress() { return smoothStep(focus); },
      get bodies() { return lastBodies.map(body => ({ ...body })); },
      get sun() {
        const camera = sceneCamera(width, height, radius, zoom, travel, settings.centerY, solarRotation);
        return {
          x: width / 2,
          y: height * settings.centerY,
          radius: .055 * camera.scale * (1 + smoothStep(plans) * 2.5)
        };
      },
      openMap, closeMap,
      setZoom,
      setSolar,
      setPlans,
      focusPlanet,
      unfocus: unfocusPlanet,
      resetZoom() { setZoom(1); },
      pause() { paused = true; sync(); },
      resume() { if (!destroyed) { paused = false; sync(); } },
      destroy() { clearPlanetFocus(); stopSolarDrag(); destroyed = true; observer?.disconnect(); controller.abort(); locator.destroy(); cancelAnimationFrame(frame); texture.onload = texture.onerror = null; points = []; lastBodies = []; canvas.classList.remove('is-planet-hover'); if (mapTrigger) mapTrigger.hidden = true; if (mapControls) mapControls.hidden = true; delete root.dataset.globeZoomed; canvas.classList.remove('is-visible'); clear(); }
    });
  };
})();
