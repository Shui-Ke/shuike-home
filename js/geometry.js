(() => {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  function constrain(rect, bounds, minWidth = 230, minHeight = 145) {
    const width = clamp(rect.width, Math.min(minWidth,bounds.right-bounds.left), bounds.right-bounds.left);
    const height = clamp(rect.height, Math.min(minHeight,bounds.bottom-bounds.top), bounds.bottom-bounds.top);
    return {x:clamp(rect.x,bounds.left,bounds.right-width),y:clamp(rect.y,bounds.top,bounds.bottom-height),width,height};
  }
  function resize(start, direction, dx, dy, bounds, minWidth=230, minHeight=145) {
    let l=start.x, t=start.y, r=l+start.width, b=t+start.height;
    minWidth=Math.min(minWidth,bounds.right-bounds.left); minHeight=Math.min(minHeight,bounds.bottom-bounds.top);
    if(direction.includes('w')) l=clamp(l+dx,bounds.left,r-minWidth);
    if(direction.includes('e')) r=clamp(r+dx,l+minWidth,bounds.right);
    if(direction.includes('n')) t=clamp(t+dy,bounds.top,b-minHeight);
    if(direction.includes('s')) b=clamp(b+dy,t+minHeight,bounds.bottom);
    return {x:l,y:t,width:r-l,height:b-t};
  }
  function shuffle(values, random) {
    const list=[...values];
    for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
    return list;
  }
  function scatter(count,bounds,compact=false,random=Math.random) {
    const slots=shuffle([[.04,.04],[.94,.02],[.48,.43],[.02,.94],[.97,.94]],random);
    const ranks=shuffle(Array.from({length:count},(_,i)=>i),random);
    const w=bounds.right-bounds.left,h=bounds.bottom-bounds.top;
    return ranks.map((rank,i)=>{
      const width=compact ? w*(.86+rank*.025) : w*(.25+rank*.027+random()*.014);
      const height=Math.max(145,h*(.32+rank*.035+random()*.045));
      const slot=slots[i%slots.length];
      const rect=constrain({x:bounds.left,y:bounds.top,width,height},bounds);
      rect.x=bounds.left+(w-rect.width)*(compact ? .5 : clamp(slot[0]+(random()-.5)*.10,0,1));
      rect.y=bounds.top+(h-rect.height)*(compact ? Math.min(.08+i*.09,.55) : clamp(slot[1]+(random()-.5)*.10,0,1));
      return rect;
    });
  }
  const geometry={constrain,resize,scatter,shuffle};
  if(typeof module!=='undefined' && module.exports) module.exports=geometry;
  else {window.ShuikeModules=window.ShuikeModules||{};window.ShuikeModules.geometry=geometry;}
})();
