/* Carry the departing solar image into the actual projected graph anchors. */
(() => {
  'use strict';
  window.ShuikePlansArrival = {
    play(getAnchors, reveal) {
      const saved = window.ShuikePlansHandoff;
      const still = document.getElementById('handoff-still');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      if (!saved || !still || reduced.matches) {still?.remove(); reveal(); return;}
      const canvas = document.createElement('canvas');
      canvas.id = 'handoff-canvas'; canvas.setAttribute('aria-hidden','true');
      canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1001;pointer-events:none';
      const ctx=canvas.getContext('2d');
      if (!ctx) {still.remove();reveal();return;}
      document.body.append(canvas);
      let started=0, frame=0, done=false, revealed=false;
      const clamp=x=>Math.max(0,Math.min(1,x));
      const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
      const mix=(a,b,t)=>a+(b-a)*t;
      const finish=()=>{
        if(done)return;done=true;cancelAnimationFrame(frame);
        still.remove();canvas.remove();window.ShuikePlansHandoff=null;
        document.removeEventListener('keydown',skip);reduced.removeEventListener('change',finish);
        if(!revealed){revealed=true;reveal();}
      };
      const skip=e=>{if(e.key==='Escape'){e.preventDefault();finish();}};
      document.addEventListener('keydown',skip);reduced.addEventListener('change',finish);
      const draw=now=>{
        if(done)return;
        if(!started)started=now;
        const t=clamp((now-started)/780), blend=ease(t), fade=ease((t-.62)/.38);
        const anchors=getAnchors();
        if(!anchors){finish();return;}
        const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
          canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
        }
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
        ctx.fillStyle=`rgba(0,0,0,${1-fade})`;ctx.fillRect(0,0,w,h);
        const sx=saved.sun.x/saved.width*w,sy=saved.sun.y/saved.height*h;
        const initialRadius=saved.sun.radius*Math.min(w/saved.width,h/saved.height);
        const x=mix(sx,anchors.sun.x,blend),y=mix(sy,anchors.sun.y,blend);
        const radius=mix(initialRadius,anchors.sun.coreRadius,blend);
        const scale=radius/Math.max(1,initialRadius);
        ctx.globalAlpha=1-fade;
        ctx.drawImage(still,x-sx*scale,y-sy*scale,w*scale,h*scale);
        const growth=ease(t/.78);
        for(const target of anchors.targets){
          const dx=target.x-x,dy=target.y-y,dist=Math.hypot(dx,dy)||1;
          const start=Math.min(radius*.8,dist);
          ctx.strokeStyle='rgba(245,245,245,.26)';ctx.lineWidth=.7;ctx.setLineDash([1,6]);
          ctx.beginPath();ctx.moveTo(x+dx/dist*start,y+dy/dist*start);
          ctx.lineTo(x+dx*growth,y+dy*growth);ctx.stroke();ctx.setLineDash([]);
          const glow=ctx.createRadialGradient(x+dx*growth,y+dy*growth,0,x+dx*growth,y+dy*growth,10);
          glow.addColorStop(0,'rgba(255,255,255,.8)');glow.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=glow;ctx.fillRect(x+dx*growth-10,y+dy*growth-10,20,20);
        }
        ctx.globalAlpha=1;
        if(t>=.52&&!revealed){revealed=true;reveal();}
        if(t>=1){finish();return;}
        frame=requestAnimationFrame(draw);
      };
      const begin=()=>{if(done)return;still.style.background='transparent';still.style.visibility='hidden';frame=requestAnimationFrame(draw);};
      if(still.complete&&still.naturalWidth)begin();else still.decode().then(begin,finish);
    }
  };
})();
