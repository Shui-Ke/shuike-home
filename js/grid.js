(() => {
  'use strict';
  window.ShuikeModules = window.ShuikeModules || {};
  window.ShuikeModules.createPointerGrid = function (layer) {
    const controller = new AbortController();
    const options = { passive: true, signal: controller.signal };
    let frame = 0;
    let x = -1000;
    let y = -1000;
    function render() {
      frame = 0;
      layer.style.setProperty('--pointer-x', `${x}px`);
      layer.style.setProperty('--pointer-y', `${y}px`);
    }
    function move(event) {
      x = event.clientX;
      y = event.clientY;
      layer.classList.add('is-visible');
      if (!frame) frame = requestAnimationFrame(render);
    }
    function hide() { layer.classList.remove('is-visible'); }
    window.addEventListener('pointermove', move, options);
    window.addEventListener('pointerdown', move, options);
    document.documentElement.addEventListener('pointerleave', hide, options);
    window.addEventListener('blur', hide, options);
    window.addEventListener('pointerup', event => { if (event.pointerType === 'touch') hide(); }, options);
    window.addEventListener('pointercancel', hide, options);
    return { destroy() { controller.abort(); cancelAnimationFrame(frame); hide(); } };
  };
})();
