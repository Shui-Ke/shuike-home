(() => {
  'use strict';
  function mapCoordinates(point) {
    return { x: Math.atan2(point.x, point.z) / (2 * Math.PI), y: Math.asin(Math.max(-1, Math.min(1, -point.y))) / -Math.PI };
  }
  function mapLayout(width, height) {
    const top = Math.min(150, height * .27), bottom = height - 172;
    const mapWidth = Math.max(40, Math.min(width - 40, 1000, Math.max(40, bottom - top) * 2));
    return { x: width / 2, y: (top + bottom) / 2, width: mapWidth, height: mapWidth / 2 };
  }
  function parseLocation(data) {
    if (!data || data.error || typeof data.latitude !== 'number' || typeof data.longitude !== 'number' ||
      !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) return null;
    const lat = data.latitude * Math.PI / 180, lon = data.longitude * Math.PI / 180;
    // Deliberately keep only coarse coordinates and a region label, never the IP response.
    return { x: Math.cos(lat) * Math.sin(lon), y: -Math.sin(lat), z: Math.cos(lat) * Math.cos(lon),
      label: [...new Set([data.region, data.country_name].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().slice(0, 80)))].join(' · ') };
  }
  function locationWeight(point, location) {
    if (!location) return 0;
    const edge = Math.cos(14 * Math.PI / 180);
    const dot = point.x * location.x + point.y * location.y + point.z * location.z;
    const t = Math.max(0, Math.min(1, (dot - edge) / (1 - edge)));
    return t * t * (3 - 2 * t);
  }
  function createLocator({ fetcher = (...args) => fetch(...args), timeout = 8000 } = {}) {
    let cached = null, pending = null, controller = null, destroyed = false;
    return {
      locate() {
        if (destroyed) return Promise.resolve(null);
        if (cached) return Promise.resolve(cached);
        if (pending) return pending;
        controller = new AbortController();
        const request = controller;
        // Race the deadline as well as aborting: a broken transport cannot hang the UI.
        let timer;
        const deadline = new Promise(resolve => {
          request.signal.addEventListener('abort', () => resolve(null), { once: true });
          timer = setTimeout(() => request.abort(), timeout);
        });
        const query = Promise.resolve().then(() => fetcher('https://ipapi.co/json/', {
          signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
        })).then(response => response.ok ? response.json() : null).then(parseLocation).catch(() => null);
        pending = Promise.race([query, deadline]).then(result => {
          clearTimeout(timer);
          if (destroyed) return null;
          cached = result;
          return result;
        }).finally(() => { pending = null; });
        return pending;
      },
      destroy() { destroyed = true; cached = null; controller?.abort(); }
    };
  }
  const api = { mapCoordinates, mapLayout, parseLocation, locationWeight, createLocator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.ShuikeModules = window.ShuikeModules || {};
    window.ShuikeModules.worldMap = api;
  }
})();
