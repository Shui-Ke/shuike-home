(() => {
  'use strict';
  window.ShuikeModules.createResizable=function(panel,{getBounds,handle}) {
    const controller=new AbortController(), options={signal:controller.signal};
    const geometry=window.ShuikeModules.geometry;
    const edges=[];
    let active=null;
    const rect=()=>{const r=panel.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const emit=(name)=>panel.dispatchEvent(new CustomEvent(`shuike:panel-${name}`,{bubbles:true,detail:{id:panel.id,...rect()}}));
    function setRect(value){
      const r=geometry.constrain(value,getBounds());
      panel.style.left=`${r.x}px`;panel.style.top=`${r.y}px`;panel.style.width=`${r.width}px`;panel.style.height=`${r.height}px`;
      return r;
    }
    function stop(){
      if(!active)return;
      const previous=active;active=null;panel.classList.remove('is-resizing');
      if(previous.edge.hasPointerCapture(previous.id))previous.edge.releasePointerCapture(previous.id);
      emit('resizeend');
    }
    for(const direction of ['n','e','s','w','nw','ne','sw','se']){
      const edge=document.createElement('span');edge.className=`resize-edge resize-${direction}`;edge.dataset.direction=direction;edge.setAttribute('aria-hidden','true');panel.append(edge);edges.push(edge);
      edge.addEventListener('pointerdown',event=>{
        if(panel.dataset?.expanded === 'true' || active || event.button!==0 || !event.isPrimary)return;
        event.preventDefault();
        active={id:event.pointerId,edge,direction,x:event.clientX,y:event.clientY,start:rect(),mouse:event.pointerType==='mouse'};
        edge.setPointerCapture(event.pointerId);panel.classList.add('is-resizing');emit('resizestart');
      },options);
      edge.addEventListener('lostpointercapture',stop,options);
    }
    window.addEventListener('pointermove',event=>{
      if(!active || event.pointerId!==active.id)return;
      if(active.mouse && !(event.buttons&1)){stop();return;}
      setRect(geometry.resize(active.start,active.direction,event.clientX-active.x,event.clientY-active.y,getBounds()));emit('resize');
    },options);
    window.addEventListener('pointerup',event=>{if(active&&event.pointerId===active.id)stop();},options);
    window.addEventListener('mouseup',event=>{if(event.button===0)stop();},options);
    window.addEventListener('pointercancel',stop,options);window.addEventListener('blur',stop,options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();},options);
    window.addEventListener('resize',()=>{stop();if(!panel.hidden && panel.dataset?.expanded !== 'true')setRect(rect());},options);
    handle.addEventListener('keydown',event=>{
      if(panel.dataset?.expanded === 'true'||event.target!==handle||!event.altKey)return;
      const change={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(!change)return;event.preventDefault();stop();const r=rect(),step=event.shiftKey?32:8;
      setRect({...r,width:r.width+change[0]*step,height:r.height+change[1]*step});emit('resize');
    },options);
    return Object.freeze({setRect,getRect:rect,stop,destroy(){stop();controller.abort();edges.forEach(e=>e.remove());}});
  };
})();
