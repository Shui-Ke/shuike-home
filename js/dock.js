(() => {
  'use strict';
  window.ShuikeModules.createDock=function(dock){
    const controller=new AbortController(),options={signal:controller.signal};
    const buttons=[...dock.querySelectorAll('.dock-button')];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,x=null;
    function reset(){x=null;cancelAnimationFrame(frame);frame=0;buttons.forEach(button=>{button.style.setProperty('--dock-scale','1');button.style.setProperty('--dock-shift','0px');});}
    function render(){
      frame=0;if(x===null)return;
      const parent=dock.getBoundingClientRect();
      // Offset-based centers stay stable while the icons transform.
      const scales=buttons.map(button=>{
        const center=parent.left+button.offsetLeft+button.offsetWidth/2;
        const distance=Math.abs(x-center);
        return 1+.48*Math.pow(Math.max(0,1-distance/145),2);
      });
      const extras=scales.map((scale,i)=>(scale-1)*buttons[i].offsetWidth);
      const total=extras.reduce((a,b)=>a+b,0);let before=0;
      buttons.forEach((button,i)=>{
        button.style.setProperty('--dock-scale',scales[i].toFixed(3));
        button.style.setProperty('--dock-shift',`${before+extras[i]/2-total/2}px`);before+=extras[i];
      });
    }
    dock.addEventListener('pointermove',event=>{
      if(event.pointerType!=='mouse'||reduced.matches||innerWidth<700)return;
      x=event.clientX;if(!frame)frame=requestAnimationFrame(render);
    },options);
    dock.addEventListener('pointerleave',reset,options);window.addEventListener('blur',reset,options);window.addEventListener('resize',reset,options);
    reduced.addEventListener('change',reset,options);
    return {destroy(){reset();controller.abort();}};
  };
})();
