/* VIKTOR LEGEND 2 — gfx.js: ізо-рендер світу, погода, ніч/вогонь, тріп-фх, мінімапа і велика карта */
IB.GFX={cam:{x:66,y:118},shake:0};
IB.tripFx=[];
IB.weatherP=[];

const T_COL={};
function terrCols(){
  const P=IB.PAL;
  T_COL[0]=[P.a2,P.a3,P.a4];           /* вода */
  T_COL[1]=[P.sa1,P.sa2,P.sa3];        /* берег */
  T_COL[2]=[P.g4,P.g5,P.g3];           /* луга */
  T_COL[3]=[P.f2,P.f3,P.f1];           /* ліс */
  T_COL[4]=[P.c2,P.c3,P.c1];           /* скеля */
  T_COL[5]=[P.sn1,P.sn2,P.sn3];        /* сніг */
  T_COL[7]=[P.r2,P.r3,P.r1];           /* стежка */
  T_COL[8]=[P.g2,P.g3,P.g4];           /* загін */
  T_COL[9]=[P.r3,P.r4,P.r2];           /* вулиця */
  T_COL[10]=[P.g3,P.g4,P.g2];          /* під забудовою */
}
terrCols();

function tileScreen(tx,ty){
  return {x:(tx-ty)*16, y:(tx+ty)*8};
}

/* ---------- ГОЛОВНИЙ РЕНДЕР СВІТУ ---------- */
IB.renderWorld=(g,dt)=>{
  const W=IB.W,cam=IB.GFX.cam;
  const L=IB.E.team[0];
  /* камера за лідером */
  cam.x=IB.lerp(cam.x,L.x,IB.M.min(1,dt*4));
  cam.y=IB.lerp(cam.y,L.y,IB.M.min(1,dt*4));
  const cx=(cam.x-cam.y)*16, cy=(cam.x+cam.y)*8-(cam.h||0)*10;
  const ox=240-cx, oy=168-cy-20;

  g.fillStyle='#0a0f0a';g.fillRect(0,0,480,336);

  /* видимий діапазон тайлів */
  const tx0=IB.M.max(0,IB.M.floor(cam.x-22)),tx1=IB.M.min(W.W-1,IB.M.ceil(cam.x+22));
  const ty0=IB.M.max(0,IB.M.floor(cam.y-24)),ty1=IB.M.min(W.H-1,IB.M.ceil(cam.y+24));

  const nf=IB.nightFactor();
  const snowCap=IB.G.wx.type==='snow'||IB.G.wx.type==='blizzard';

  /* земля */
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
    const t=W.at(tx,ty),h=W.elevAt(tx,ty);
    const s=tileScreen(tx,ty);
    const sx=s.x+ox, sy=s.y+oy-h*10;
    if(sx<-40||sx>520||sy<-60||sy>380)continue;
    const cc=T_COL[t]||T_COL[2];
    const v=IB.hsh(tx,ty,3);
    let col=cc[v<0.4?0:(v<0.75?1:2)];
    IB.rhomb(g,sx,sy,32,16,col);
    /* дрібні деталі */
    if(t===2||t===3){if(v>0.9)IB.P(g,sx+14+IB.hsh(tx,ty,4)*6,sy+6+IB.hsh(ty,tx,5)*4,2,1,IB.PAL.g6);}
    if(t===5&&v>0.8)IB.P(g,sx+10,sy+7,3,1,'#ffffff88');
    if(t===7){IB.P(g,sx+12,sy+6,8,2,IB.shade(col,-0.15));}
    /* вода: хвильки */
    if(t===0){
      const wv=IB.M.sin(IB.G.t*3+tx*0.8+ty*0.5);
      if(wv>0.55)IB.P(g,sx+8+IB.hsh(tx,ty,6)*12,sy+6,7,1,'#7ac8d866');
      if(wv<-0.6)IB.P(g,sx+14,sy+9,6,1,'#a8e0ec55');
    }
    /* кліфи: сусід нижче */
    const eL=W.elevAt(tx-1,ty),eR=W.elevAt(tx,ty+1);
    const hh=10;
    if(eL<h-0.01){
      const dh=IB.M.round((h-eL)*10);
      IB.PA(g,[[sx,sy+8],[sx+16,sy+16],[sx+16,sy+16+dh],[sx,sy+8+dh]],IB.shade(IB.shade(col,-0.28),0));
    }
    if(eR<h-0.01){
      const dh=IB.M.round((h-eR)*10);
      IB.PA(g,[[sx+16,sy+16],[sx+32,sy+8],[sx+32,sy+8+dh],[sx+16,sy+16+dh]],IB.shade(IB.shade(col,-0.16),0));
    }
    /* сніг на вершинах при погоді */
    if(snowCap&&h>4&&v>0.3){IB.PA(g,[[sx,sy+8],[sx+16,sy],[sx+32,sy+8],[sx+16,sy+16]],'#dce8f055');}
  }

  /* ---------- об'єкти+будівлі+сутності: сортування за глибиною ---------- */
  const draws=[];
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
    const p=W.propAt(tx,ty);
    if(p)draws.push({d:p.x+p.y,f:drawProp,a:p});
  }
  for(const b of W.buildings){
    if(b.x+b.w<tx0||b.x>tx1||b.y+b.h<ty0||b.y>ty1)continue;
    draws.push({d:(b.x+b.w/2)+(b.y+b.h/2),f:drawBuilding,a:b});
  }
  /* структури кемпінгів */
  for(const c of W.CAMPS){
    const cc=IB.G.camps[c.id];
    if(!cc)continue;
    if(IB.dist(c.x,c.y,cam.x,cam.y)>30)continue;
    if(cc.fire)draws.push({d:c.x+c.y-0.6,f:drawFire,a:{x:c.x,y:c.y,fuel:cc.fuel}});
    if(cc.tent)draws.push({d:c.x+c.y+1.5,f:drawTent,a:{x:c.x-3,y:c.y-2}});
    if(cc.well)draws.push({d:c.x+c.y+1.6,f:drawCampWell,a:{x:c.x+3,y:c.y-2}});
    if(cc.table)draws.push({d:c.x+c.y+1.8,f:drawTable,a:{x:c.x-2,y:c.y+3}});
    if(cc.dry)draws.push({d:c.x+c.y+2,f:drawDry,a:{x:c.x+2.5,y:c.y+3}});
    if(cc.farm.built)draws.push({d:c.x+c.y+2.2,f:drawFarm,a:{x:c.x+3,y:c.y+2,stage:cc.farm.stage,ready:cc.farm.ready,planted:cc.farm.planted}});
  }
  /* v2.1: похідні табори (табір будь-де) */
  for(const c of (IB.G.wildCamps||[])){
    const cc=IB.G.camps[c.id];
    if(!cc)continue;
    if(IB.dist(c.x,c.y,cam.x,cam.y)>30)continue;
    if(cc.fire)draws.push({d:c.x+c.y-0.6,f:drawFire,a:{x:c.x,y:c.y,fuel:cc.fuel}});
    if(cc.tent)draws.push({d:c.x+c.y+1.5,f:drawTent,a:{x:c.x-2.5,y:c.y-1.5}});
    if(cc.well)draws.push({d:c.x+c.y+1.6,f:drawCampWell,a:{x:c.x+2.5,y:c.y-1.5}});
    if(cc.table)draws.push({d:c.x+c.y+1.8,f:drawTable,a:{x:c.x-1.5,y:c.y+2}});
    if(cc.dry)draws.push({d:c.x+c.y+2,f:drawDry,a:{x:c.x+2,y:c.y+2.5}});
    if(cc.farm&&cc.farm.built)draws.push({d:c.x+c.y+2.2,f:drawFarm,a:{x:c.x+2.5,y:c.y+1.5,stage:cc.farm.stage,ready:cc.farm.ready,planted:cc.farm.planted}});
  }
  for(const e of IB.E.team)draws.push({d:e.x+e.y+0.3,f:drawHero,a:e});
  for(const n of IB.E.npcs)draws.push({d:n.x+n.y,f:drawNpc,a:n});
  for(const a of IB.E.animals)draws.push({d:a.x+a.y,f:drawAnimal,a});
  /* v1.5: звірі — рись (земля), круки/кажани (літають, трохи вище за глибиною) */
  for(const b of (IB.E.beasts||[]))draws.push({d:b.x+b.y+(b.type==='lynx'?0.2:4.2),f:drawBeast,a:b});
  if(IB.E.tourist)draws.push({d:IB.E.tourist.x+IB.E.tourist.y,f:drawTourist,a:IB.E.tourist});
  for(const f of IB.E.fishes)draws.push({d:f.x+f.y,f:drawFishShadow,a:f});
  for(const c of (IB.E.cars||[]))draws.push({d:c.x+c.y+0.25,f:drawCar,a:c});
  for(const fx of IB.tripFx)draws.push({d:fx.x+fx.y,f:drawTripFx,a:fx});
  draws.sort((a,b)=>a.d-b.d);
  for(const dr of draws)dr.f(g,dr.a,ox,oy,dt);

  /* ---------- плаваючі повідомлення ---------- */
  for(const m of IB.floatMsgs){
    const s=tileScreen(m.x,m.y);
    g.font='8px monospace';g.fillStyle='#ffffffcc';
    g.fillText(m.txt,s.x+ox-4,s.y+oy-26-m.t*12);
    m.t+=dt;
  }
  for(let i=IB.floatMsgs.length-1;i>=0;i--)if(IB.floatMsgs[i].t>1.2)IB.floatMsgs.splice(i,1);

  /* ---------- тріп-хвилі ---------- */
  if(IB.G.trip.active){
    const hue=(IB.G.t*137+performance.now()*0.03)%360;
    g.fillStyle='hsla('+hue+',70%,50%,0.14)';g.fillRect(0,0,480,336);
    g.fillStyle='hsla('+((hue+120)%360)+',80%,60%,0.08)';g.fillRect(0,0,480,336);
    for(let i=0;i<5;i++){
      const ph=performance.now()*0.001+i;
      g.strokeStyle='hsla('+((hue+i*60)%360)+',85%,70%,0.35)';g.lineWidth=1.5;
      g.beginPath();
      for(let x=0;x<=480;x+=12)g.lineTo(x,168+IB.M.sin(x*0.02+ph*2+i)*60);
      g.stroke();
    }
  }

  /* ---------- ніч/вогонь світло ---------- */
  if(nf>0.05){
    /* v2.3: мерехтіння ночі на вечірці */
    const nfF=nf*(IB.G.party.active?(0.93+0.07*IB.M.sin(performance.now()*0.02)):1);
    g.fillStyle='rgba(8,14,26,'+(nfF*0.55).toFixed(3)+')';g.fillRect(0,0,480,336);
    /* світло вогнів */
    for(const c of W.CAMPS.concat(IB.G.wildCamps||[])){
      const cc=IB.G.camps[c.id];
      if(cc&&cc.fire&&cc.fuel>0){
        const s=tileScreen(c.x,c.y);
        const fx=s.x+ox,fy=s.y+oy-6;
        /* v2.3: вогонь пульсує в такт вечірці — світло міняється */
        const pk=IB.G.party.active?(1.32+IB.M.sin(performance.now()*0.017)*0.16):1;
        const fl=(0.75+IB.M.sin(performance.now()*0.01)*0.15)*pk;
        const gr=g.createRadialGradient(fx,fy,4,fx,fy,80*fl);
        gr.addColorStop(0,'rgba(240,180,60,'+IB.M.min(0.85,0.5*nf*pk).toFixed(3)+')');
        gr.addColorStop(0.5,'rgba(220,120,40,'+IB.M.min(0.5,0.22*nf*pk).toFixed(3)+')');
        gr.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=gr;g.beginPath();g.arc(fx,fy,80*fl,0,7);g.fill();
      }
    }
    /* місяць/зорі */
    if(nf>0.6){
      g.fillStyle='#ffffff99';
      for(let i=0;i<40;i++){
        const sx=IB.hsh(i,1,50)*480,sy=IB.hsh(i,2,51)*140;
        if(IB.hsh(i,3,52)>0.5)g.fillRect(sx,sy,1,1);
      }
    }
    /* v1.5: СВІТЛО ФОНАРИКІВ — кожен герой несе фонарик уночі (якщо увімкнені) */
    if(IB.G.torch!==false){
      const tm=performance.now()*0.011;
      for(const h of IB.E.team){
        const s=tileScreen(h.x,h.y);
        const fx=s.x+ox+16,fy=s.y+oy+4-h.swim*4;
        const fl=0.92+IB.M.sin(tm+h.x*3.1)*0.08;
        const gr=g.createRadialGradient(fx,fy-6,3,fx,fy-6,54*fl);
        gr.addColorStop(0,'rgba(255,238,178,'+(0.5*nf)+')');
        gr.addColorStop(0.45,'rgba(255,222,140,'+(0.24*nf)+')');
        gr.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=gr;g.beginPath();g.arc(fx,fy-6,54*fl,0,7);g.fill();
        /* яскраве ядро променя */
        const gr2=g.createRadialGradient(fx,fy-8,1,fx,fy-8,16*fl);
        gr2.addColorStop(0,'rgba(255,248,210,'+(0.55*nf)+')');
        gr2.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=gr2;g.beginPath();g.arc(fx,fy-8,16*fl,0,7);g.fill();
      }
    }
  }

  /* ---------- погода ---------- */
  drawWeather(g,dt);

  /* ---------- v1.4: ЗОЛОТА ГОДИНА — тепле світло ранку/вечора ---------- */
  {
    const gh=IB.goldenHour();
    if(gh>0.02){
      g.fillStyle='rgba(255,166,60,'+(0.16*gh)+')';g.fillRect(0,0,480,336);
      g.fillStyle='rgba(255,110,40,'+(0.08*gh)+')';g.fillRect(0,0,480,120);
      const sg=g.createLinearGradient(0,0,0,336);
      sg.addColorStop(0,'rgba(120,40,90,'+(0.10*gh)+')');sg.addColorStop(1,'rgba(255,180,80,0)');
      g.fillStyle=sg;g.fillRect(0,0,480,336);
    }
  }

  /* туман */
  if(IB.G.wx.type==='fog'){
    g.fillStyle='rgba(160,175,190,0.30)';g.fillRect(0,0,480,336);
    g.fillStyle='rgba(160,175,190,0.18)';
    const t=performance.now()*0.0004;
    for(let i=0;i<3;i++)g.fillRect(0,(i*120+t*30)%336,480,40);
  }
  /* хуртовина: біла завіса по краях */
  if(IB.G.wx.type==='blizzard'){
    const gr=g.createRadialGradient(240,168,80,240,168,300);
    gr.addColorStop(0,'rgba(230,240,250,0.05)');
    gr.addColorStop(1,'rgba(220,235,248,0.5)');
    g.fillStyle=gr;g.fillRect(0,0,480,336);
  }

  /* GPS-маркер */
  if(IB.G.route){
    const s=tileScreen(IB.G.route.x,IB.G.route.y);
    const fx=s.x+ox,fy=s.y+oy-14;
    const bob=IB.M.sin(performance.now()*0.004)*3;
    IB.PA(g,[[fx,fy-14+bob],[fx-5,fy-6+bob],[fx+5,fy-6+bob]],'#e05a8a');
    IB.P(g,fx-1,fy-6+bob,2,4,'#c84870');
    const d=IB.dist(IB.E.team[0].x,IB.E.team[0].y,IB.G.route.x,IB.G.route.y);
    g.font='7px monospace';g.fillStyle='#e05a8a';g.fillText(IB.M.round(d*3)+' м',fx-8,fy-18+bob);
  }

  /* сповіщення про тріп-бачення артефактів у світі */
  if(IB.G.vision>0||IB.G.trip.active){
    for(const a of IB.ARTIFACTS){
      if(!a.world||IB.artHas(a.id))continue;
      const s=tileScreen(a.x,a.y);
      const fx=s.x+ox,fy=s.y+oy-8;
      const pl=0.5+IB.M.sin(performance.now()*0.005)*0.3;
      g.strokeStyle='rgba(176,106,224,'+pl+')';g.lineWidth=2;
      g.beginPath();g.arc(fx,fy,8,0,7);g.stroke();
      g.fillStyle='rgba(176,106,224,'+pl+')';g.fillRect(fx-2,fy-10,4,4);
    }
  }

  /* ---------- v2.3: ВЕЧІРКОВІ ГЛІЧІ — п'яні кольори, мерехтіння, зсув смуг ---------- */
  if(IB.partyFx&&IB.partyFx.lvl>0.02&&IB.G.party.active){
    const F=IB.partyFx,t=performance.now()*0.001,lvl=F.lvl*(0.85+0.15*IB.M.sin(t*2.2));
    if(F.mode==='psy'||F.mode==='psy2'){
      const hue=(t*(F.mode==='psy2'?85:50))%360;
      g.fillStyle='hsla('+hue.toFixed(0)+',80%,55%,'+(0.10+0.08*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
      g.fillStyle='hsla('+((hue+140)%360).toFixed(0)+',85%,60%,'+(0.07*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
    }else if(F.mode==='blue'){
      g.fillStyle='rgba(70,100,170,'+(0.16+0.06*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
      g.fillStyle='rgba(24,34,64,'+(0.12*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
    }else if(F.mode==='grey'){
      g.fillStyle='rgba(118,124,130,'+(0.20+0.05*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
    }else{
      g.fillStyle='rgba(255,150,60,'+(0.08*lvl).toFixed(3)+')';g.fillRect(0,0,480,336);
    }
    /* мерехтіння */
    if(IB.M.random()<0.12*lvl){g.fillStyle='rgba(255,242,205,'+(0.05+IB.M.random()*0.10).toFixed(3)+')';g.fillRect(0,0,480,336);}
    /* гліч-смуги: зсув горизонтальних шматків кадру */
    if(IB.M.random()<0.14*lvl){
      const n=1+IB.ri(0,3);
      for(let i=0;i<n;i++){
        const sy=IB.ri(0,318),hh=2+IB.ri(0,7),dx=IB.rnd(-12,12);
        g.drawImage(g.canvas,0,sy,480,hh,dx,sy,480,hh);
      }
    }
    /* подвійний зір на розгулі */
    if(lvl>0.55){g.globalAlpha=0.12+0.06*(lvl-0.55);g.drawImage(g.canvas,IB.M.sin(t*3.1)*4,IB.M.cos(t*2.3)*2.5);g.globalAlpha=1;}
    /* CSS-фільтр канваса — GPU, міняється з фазою */
    const cv=g.canvas;let flt='';
    if(F.mode==='psy')flt='saturate(1.7) hue-rotate('+(IB.M.sin(t*1.3)*40*lvl).toFixed(0)+'deg)';
    else if(F.mode==='psy2')flt='saturate(1.9) contrast(1.06) hue-rotate('+(IB.M.sin(t*2.1)*60*lvl).toFixed(0)+'deg)';
    else if(F.mode==='blue')flt='saturate(0.72) hue-rotate(-12deg) brightness(0.9)';
    else if(F.mode==='grey')flt='grayscale(0.6) brightness(0.95)';
    else flt='saturate('+(1+0.3*lvl).toFixed(2)+')';
    if(cv._pf!==flt){cv.style.filter=flt;cv._pf=flt;}
  }else{
    const cv=g.canvas;
    if(cv._pf){cv.style.filter='';cv._pf='';}
  }
};

/* ---------- ПРОПСИ (v1.3: дерева ВИЩІ й РІЗНІ — ялинка/смерека/мішані/PNG з v5) ---------- */
function drawProp(g,p,ox,oy,dt){
  const s=tileScreen(p.x,p.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  const P=IB.PAL,v=IB.hsh(p.x,p.y,p.seed*100|0);
  switch(p.type){
    case 'spruce':case 'spruce2':case 'spruce3':{
      /* ВИЩІ ялинки: 34-52px (було 20-26) + різноманіття розмірів */
      const tall=p.type==='spruce'?1:(p.type==='spruce2'?0.82:1.18);
      const hgt=(32+v*16)*tall;
      const wdt=(10-(tall<1?2:0))*(p.type==='spruce2'?0.85:1);
      IB.O(g,x+4,y,9,3.5,'#00000028');
      IB.P(g,x-1,y-5,2,6,P.b2);
      const lay=[['#16321e',0.5],['#1e4228',0.68],['#265232',0.84],['#2e623c',0.96]];
      for(let i=0;i<4;i++){
        const wy=y-7-(hgt-8)*(i+1)/4.6, wdw=wdt-i*2.2;
        IB.PA(g,[[x-wdw,wy],[x+wdw,wy],[x,wy-11]],lay[i][0]);
        IB.PA(g,[[x-wdw*0.5,wy-4],[x+wdw*0.5,wy-4],[x,wy-11]],IB.shade(lay[i][0],0.15));
      }
      IB.P(g,x-1,y-6-hgt,2,3,'#2e623c');
      /* сніжні шапки на верхніх ярусах */
      if(v>0.72)IB.PA(g,[[x-3,y-7-hgt+6],[x+3,y-7-hgt+6],[x,y-7-hgt-2]],'#dce8f0aa');
      break;}
    case 'oak':{
      /* МІШАНЕ широке дерево (PNG дуба з першої частини), масштаб 1.3-2.0 */
      const im=IB.img('tree_o');
      const sc=1.3+v*0.7;
      IB.O(g,x+5,y,11,4,'#00000030');
      if(im)g.drawImage(im,x-im.width*sc/2,y-im.height*sc+4,im.width*sc,im.height*sc);
      else{IB.P(g,x-2,y-18,4,18,'#4e3a20');IB.O(g,x,y-26,13,9,'#3e6a2e');IB.O(g,x-5,y-30,8,6,'#4e7a38');IB.O(g,x+6,y-28,7,5,'#548640');}
      break;}
    case 'tree2':{
      /* тополя/береза вища (PNG з v5), масштаб 1.2-1.7 */
      const im=IB.img('tree_o2');
      const sc=1.2+v*0.5;
      IB.O(g,x+4,y,8,3,'#00000028');
      if(im)g.drawImage(im,x-im.width*sc/2,y-im.height*sc+4,im.width*sc,im.height*sc);
      else{IB.P(g,x-1,y-16,2,16,'#d8d8cc');IB.O(g,x,y-22,8,6,'#5a8a3a');}
      break;}
    case 'pine':{
      /* альпійська сосна (PNG з v5), масштаб 1.1-1.6 */
      const im=IB.img('pine');
      const sc=1.1+v*0.5;
      IB.O(g,x+3,y,7,2.5,'#00000028');
      if(im)g.drawImage(im,x-im.width*sc/2,y-im.height*sc+3,im.width*sc,im.height*sc);
      else{IB.P(g,x-1,y-4,2,5,P.b2);IB.PA(g,[[x-7,y-8],[x+7,y-8],[x,y-20]],'#1e4228');IB.PA(g,[[x-5,y-14],[x+5,y-14],[x,y-24]],'#265232');}
      break;}
    case 'birch':{
      IB.O(g,x+3,y,6,2.5,'#00000028');
      IB.P(g,x-1,y-16,2,17,'#d8d8cc');
      IB.P(g,x-1,y-10,2,1,'#2a2a24');IB.P(g,x-1,y-6,2,1,'#2a2a24');
      IB.O(g,x,y-20,7,6,'#5a8a3a');IB.O(g,x-3,y-23,4,3.5,'#6a9a46');IB.O(g,x+4,y-21,4,3,'#6a9a46');
      break;}
    case 'mrock':{
      /* гірський валун (PNG з першої частини), масштаб 1.2-1.8 */
      const im=IB.img(v>0.66?'mtn_rock':(v>0.33?'mtn_rock2':'mtn_rock3'));
      const sc=1.2+v*0.6;
      IB.O(g,x+4,y,10,3.5,'#00000030');
      if(im)g.drawImage(im,x-im.width*sc/2,y-im.height*sc+3,im.width*sc,im.height*sc);
      else{IB.PA(g,[[x-8,y],[x-3,y-8],[x+4,y-9],[x+9,y-1]],'#58605a');}
      break;}
    case 'fence':{
      /* дерев'яний паркан (PNG з v5) — не блокує */
      const im=IB.img('fence');
      if(im)g.drawImage(im,x-im.width*0.9/2,y-im.height*0.9+2,im.width*0.9,im.height*0.9);
      else{IB.P(g,x-8,y-6,16,1,'#7a5e38');IB.P(g,x-6,y-6,2,6,'#5e4628');IB.P(g,x+4,y-6,2,6,'#5e4628');}
      break;}
    case 'lamp':{
      /* вуличний ліхтар (PNG з v5) — світить уночі */
      const im=IB.img('lamp');
      if(im)g.drawImage(im,x-im.width*0.9/2,y-im.height*0.9+3,im.width*0.9,im.height*0.9);
      else{IB.P(g,x-1,y-26,2,26,'#3a4048');IB.P(g,x-4,y-30,8,5,'#2a2e36');}
      const nf=IB.nightFactor();
      if(nf>0.3){
        const ly=y-(im?im.height*0.9-8:28);
        IB.O(g,x,ly,3,2.5,'#f8e8a0');
        const gr=g.createRadialGradient(x,ly,2,x,ly,26*nf);
        gr.addColorStop(0,'rgba(240,200,90,'+(0.4*nf)+')');gr.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=gr;g.beginPath();g.arc(x,ly,26*nf,0,7);g.fill();
      }
      break;}
    case 'bush':{
      IB.O(g,x+2,y,6,2.5,'#00000025');
      IB.O(g,x,y-4,6,5,'#38502c');IB.O(g,x-3,y-5,4,3,'#446035');IB.O(g,x+3,y-6,3.5,3,'#405a32');
      if(p.berries){IB.O(g,x-2,y-5,1.5,1.5,PALbe());IB.O(g,x+2,y-4,1.5,1.5,'#d84058');IB.O(g,x,y-7,1.4,1.4,PALbe());}
      break;}
    /* ---------- v1.4: ВУЛИЧНИЙ РЕКВІЗИТ СІЛ — PNG З ПЕРШОЇ ЧАСТИНИ ---------- */
    case 'bench':case 'barrels':case 'crate':case 'busstop':case 'swing':case 'slide':{
      const im=IB.img(p.type);
      IB.O(g,x+4,y,10,3.2,'#00000026');
      if(im){const an=IB.V5_ANCH[p.type];
        if(an)g.drawImage(im,x-an.ax,y-an.ay);else g.drawImage(im,x-im.width/2,y-im.height+4);}
      else{
        if(p.type==='bench'){IB.P(g,x-9,y-6,18,3,'#7a5e38');IB.P(g,x-9,y-10,18,2,'#96784e');IB.P(g,x-8,y-4,2,4,'#5e4628');IB.P(g,x+6,y-4,2,4,'#5e4628');}
        else if(p.type==='barrels'){IB.O(g,x-4,y-6,5,4,'#8a5a3a');IB.O(g,x+3,y-6,5,4,'#6a4a30');IB.P(g,x-4,y-8,10,1,'#9a6a44');}
        else if(p.type==='crate'){IB.P(g,x-6,y-8,12,8,'#a88048');IB.P(g,x-6,y-8,12,1,'#c0a060');IB.P(g,x-1,y-8,1,8,'#7a5e38');}
        else if(p.type==='busstop'){IB.P(g,x-11,y-14,2,14,'#5e4628');IB.P(g,x+9,y-14,2,14,'#5e4628');IB.P(g,x-13,y-16,26,3,'#3a6a8a');IB.P(g,x-11,y-6,20,3,'#d8d0c0');}
        else if(p.type==='swing'){IB.P(g,x-9,y-16,2,16,'#7a5e38');IB.P(g,x+7,y-16,2,16,'#7a5e38');IB.P(g,x-10,y-17,18,2,'#96784e');IB.P(g,x-3,y-15,1,7,'#4e3a20');IB.P(g,x+2,y-15,1,7,'#4e3a20');IB.P(g,x-4,y-9,7,2,'#8a5a3a');}
        else if(p.type==='slide'){IB.PA(g,[[x-8,y-16],[x-6,y-16],[x-2,y],[x-4,y]],'#96784e');IB.PA(g,[[x-6,y-16],[x+8,y-6],[x+10,y-4],[x-2,y-4]],'#6a9ac8');IB.P(g,x-8,y-18,4,2,'#7a5e38');}
      }
      break;}
    case 'deadtree':{
      /* сухостій (PNG з першої частини) — у глибині лісу */
      const im=IB.img('dead');
      IB.O(g,x+2,y,6,2.2,'#00000020');
      if(im){const an=IB.V5_ANCH['dead']||{ax:11,ay:33};g.drawImage(im,x-an.ax,y-an.ay);}
      else{IB.P(g,x-1,y-16,2,16,'#4e4238');IB.P(g,x-4,y-12,4,1,'#4e4238');IB.P(g,x+1,y-10,4,1,'#4e4238');}
      break;}
    case 'mush':{
      IB.O(g,x,y-2,3.5,2,'#e8dcc8');IB.O(g,x-3,y-2,2.5,1.5,'#d8c8a8');
      IB.O(g,x-1,y-5,4,2.5,'#c85048');IB.O(g,x-4,y-4,2.5,1.5,'#b84038');
      IB.P(g,x-2,y-5,1,1,'#f0e8e0');IB.P(g,x+0,y-4,1,1,'#f0e8e0');
      break;}
    case 'triph':{
      const pl=0.5+IB.M.sin(performance.now()*0.006)*0.3;
      IB.O(g,x,y-2,3,2,'#e8d8f0');
      IB.O(g,x-1,y-6,4,3,'rgba(176,106,224,'+pl+')');
      IB.O(g,x-1,y-6,2,1.5,'rgba(240,200,255,'+pl+')');
      g.strokeStyle='rgba(176,106,224,'+pl*0.7+')';g.beginPath();g.arc(x,y-4,7,0,7);g.stroke();
      break;}
    case 'herb':{
      IB.P(g,x-1,y-4,1,4,'#3a6a3a');IB.P(g,x,y-6,1,3,'#3a6a3a');
      IB.O(g,x-2,y-5,1.5,1.5,'#e8d050');IB.O(g,x+1,y-6,1.5,1.5,'#e8d050');
      break;}
    case 'flower':{
      IB.P(g,x,y-3,1,3,'#3e5a32');
      IB.O(g,x,y-4,1.6,1.3,v<0.5?'#c85078':'#e8d050');
      break;}
    case 'rock':{
      IB.O(g,x+2,y,6,2.5,'#00000028');
      IB.PA(g,[[x-5,y],[x-2,y-5],[x+3,y-6],[x+6,y-1]],'#58605a');
      IB.PA(g,[[x-2,y-5],[x+3,y-6],[x+4,y-2],[x-1,y-1]],'#6e7872');
      break;}
    case 'tower':{
      IB.O(g,x+3,y,8,3,'#00000030');
      IB.PA(g,[[x-7,y],[x-3,y-16],[x+2,y-18],[x+7,y-2]],'#58605a');
      IB.PA(g,[[x-3,y-16],[x+2,y-18],[x+4,y-10],[x-1,y-9]],'#6e7872');
      IB.P(g,x-2,y-8,3,1,'#3e4440');
      break;}
    case 'wood':{
      if(p.amt>0){IB.P(g,x-6,y-2,12,3,'#7a5e38');IB.P(g,x-6,y-2,12,1,'#96784e');IB.O(g,x-6,y-1,1.5,1.5,'#5e4628');
        if(p.amt>1){IB.P(g,x-4,y-5,10,3,'#6a5230');IB.O(g,x+6,y-3.5,1.5,1.5,'#4e3a20');}}
      break;}
    default:break;
  }
}
function PALbe(){return IB.M.sin(performance.now()*0.001)>0?'#b82840':'#d84058';}

/* ---------- БУДІВЛІ (v1.4: ще БІЛЬШЕ активів з ПЕРШОЇ ЧАСТИНИ — дачі,
   цегляні, сільські котеджі wood/vill/cottage, старі хати hist, крамниця,
   лісництво admin3, сільрада khrus; пропорції v5 1:1; процедурний фолбек) ---------- */
const BLD_IMG={
  house:['bld_dacha1_0','bld_dacha1_1','bld_dacha2_0','bld_dacha2_1','bld_dacha3_0','wood1','wood2','vill2','cottage_b'],
  brick:['bld_bhouse2_0','bld_bhouse2_1'],
  bar:['bld_bhouse1_0'],
  shop:['bld_shop1_0'],
  barn:['bld_garage_0'],
};
/* v1.4: якорі PNG-котеджів v5 (ax,ay — південний кут footprint у пікселях PNG);
   для них малюємо drawImage(px-ax, py-ay), для старих (без якоря) — центр-низ */
IB.V5_ANCH={
  wood1:{ax:34,ay:100},wood2:{ax:34,ay:96},vill1:{ax:50,ay:136},vill2:{ax:34,ay:114},
  cottage_b:{ax:34,ay:124},hist2:{ax:18,ay:62},hist2b:{ax:18,ay:62},hist2c:{ax:18,ay:62},
  hist3:{ax:34,ay:78},shop2:{ax:18,ay:64},admin3:{ax:50,ay:128},khrus:{ax:18,ay:76},
  bench:{ax:11,ay:12},barrels:{ax:10,ay:13},crate:{ax:10,ay:9},busstop:{ax:13,ay:13},
  swing:{ax:12,ay:16},slide:{ax:10,ay:18},dead:{ax:11,ay:33},
};
/* v2.4b: дрібні будІвлі бІльші (відгук «є малі будІвлі — збільшуй»): старі
   хати-курени, стодола, сільрада, гараж, ларьок і крамниця малюються у
   масштабі села; якорі масштабуються разом, колізії footprint не чіпаємо. */
IB.V5_SCL={hist2:1.5,hist2b:1.5,hist2c:1.5,hist3:1.35,khrus:1.45,
  bld_garage_0:1.4,shop2:1.25,bld_shop1_0:1.15};
function bldPick(b){
  if(b.img)return b.img;                       /* v1.4: явний актив у даних світу */
  if(b.type==='shop')return 'bld_shop1_0';
  if(b.type==='kiosk')return 'shop2';
  if(b.type==='bar')return 'bld_bhouse1_0';
  if(b.type==='barn')return b.w<=3?'hist3':'bld_garage_0';
  if(b.type==='forge')return 'bld_bhouse2_0';
  if(b.type==='farm')return 'vill1';
  if(b.type==='hut')return ['hist2','hist2b','hist2c'][(b.x*5+b.y*3)%3];
  if(b.type==='house')return BLD_IMG.house[(b.x*3+b.y*7)%BLD_IMG.house.length];
  return null;
}
function drawBuilding(g,b,ox,oy,dt){
  const s=tileScreen(b.x+b.w/2,b.y+b.h/2);
  const x=s.x+ox-16*b.w/2, y=s.y+oy-8*b.h/2;
  const P=IB.PAL;
  const wpx=b.w*16,dpx=b.h*16;
  const nf=IB.nightFactor();
  const lit=nf>0.4;
  const px=x+wpx/2, py=y+dpx;           /* південний кут footprint — анкер PNG */
  const name=bldPick(b);
  const im=name?IB.img(name):null;
  /* тінь */
  IB.O(g,px+6,py+2,wpx*0.62,dpx*0.5,'#00000030');
  if(b.type==='well'){
    IB.isoBox(g,x,y,20,14,8,P.c2,P.c1,P.c1);
    IB.PA(g,[[x+4,y+7],[x+10,y+2],[x+16,y+7],[x+10,y+12]],'#1a1418');
    IB.P(g,x+9,y-8,2,10,P.b2);IB.P(g,x+14,y-8,2,10,P.b2);
    IB.PA(g,[[x+6,y-8],[x+18,y-8],[x+12,y-13]],P.rf2);
    return;
  }
  if(b.type==='ruin'){
    IB.isoBox(g,x,y,wpx,dpx,5,P.c1,IB.shade(P.c1,-0.2),P.c2);
    IB.P(g,x+6,y-8,3,8,P.c2);IB.P(g,x+wpx-14,y-6,4,6,P.c1);
    IB.P(g,x+10,y+dpx/2-4,8,2,P.c2);
    return;
  }
  if(b.type==='church'){
    /* гуцульська дерев'яна церква: ВИЩА вежа + хрест (масштаб v5) */
    const cw=Math.max(wpx,36);
    IB.isoBox(g,x,y,cw,dpx,12,P.b2,P.w2,P.w3);
    IB.isoBox(g,x+cw/2-10,y-8,20,dpx*0.6,20,P.rf2,P.rf3,P.rf4);
    IB.PA(g,[[x+cw/2-8,y-26],[x+cw/2,y-40],[x+cw/2+8,y-26]],P.rf3);
    IB.P(g,x+cw/2-1,y-52,2,12,P.y2);IB.P(g,x+cw/2-5,y-48,10,2,P.y2);IB.P(g,x+cw/2-3,y-44,6,2,P.y2);
    IB.P(g,x+4,y+dpx/2-2,4,5,'#3a2a1a');
    /* вікна-свічки уночі */
    if(lit){IB.P(g,x+cw/2-8,y-14,3,4,'#f0c060');IB.P(g,x+cw/2+5,y-14,3,4,'#f0c060');
      IB.O(g,x+cw/2-6,y-12,6,7,'rgba(240,180,60,0.22)');IB.O(g,x+cw/2+7,y-12,6,7,'rgba(240,180,60,0.22)');}
    drawSign(g,b,px,py);
    return;
  }
  if(b.type==='border'){
    /* прикордонний КПП: стовпчик-смуга + шлагбаум + стела */
    IB.isoBox(g,x,y,26,dpx,10,P.w2,P.w3,P.b3);
    IB.P(g,x+2,y-18,3,16,P.be1);IB.P(g,x+5,y-18,3,16,P.wht);
    IB.P(g,x+8,y-18,3,16,P.be1);
    IB.P(g,x+2,y-20,12,2,P.y3);
    IB.P(g,x+15,y-11,12,2,P.y2); /* шлагбаум */
    IB.P(g,x+14,y-11,2,3,P.blk);
    drawSign(g,b,px,py);
    return;
  }
  /* ---------- ДАЧІ/ХАТИ/КРАМНИЦЯ/КОРЧМА — PNG ПЕРШОЇ ЧАСТИНИ ---------- */
  if(im){
    const an=IB.V5_ANCH[name];                 /* v1.4: точний якір котеджів v5 */
    const scl=(IB.V5_SCL&&IB.V5_SCL[name])||1; /* v2.4b: дрібні будІвлі бІльші */
    if(an)g.drawImage(im,px-an.ax*scl,py-an.ay*scl,im.width*scl,im.height*scl);
    else g.drawImage(im,px-im.width*scl/2,py-im.height*scl+6,im.width*scl,im.height*scl);
    /* вікна світяться уночі — теплі плями на фасаді */
    if(lit){
      const wh=im.height*scl;
      IB.P(g,px-20,py-wh*0.44,6,7,'#f0c060');
      IB.P(g,px+13,py-wh*0.44,6,7,'#f0c060');
      IB.O(g,px-17,py-wh*0.44+3,8,9,'rgba(240,180,60,0.20)');
      IB.O(g,px+16,py-wh*0.44+3,8,9,'rgba(240,180,60,0.20)');
    }
    /* димар з димом для хат */
    if(b.type==='house'&&IB.M.sin(performance.now()*0.0011+b.x)>0){
      const chy=py-(an?an.ay*scl:im.height*scl-6)+10;
      g.fillStyle='rgba(200,205,210,0.25)';
      IB.O(g,px+20,chy-4-((performance.now()*0.008)%8),3,3,'rgba(200,205,210,0.22)');
      IB.O(g,px+22,chy-10-((performance.now()*0.006)%10),2.4,2.4,'rgba(200,205,210,0.16)');
    }
    /* тент крамниці + бочки біля корчми */
    if(b.type==='shop'&&!b.img){for(let i=0;i<7;i++)IB.P(g,px-24+i*7,py+2,7,4,i%2?'#c84838':'#e8e8e0');}
    if(b.type==='bar'&&!b.img){IB.O(g,px+26,py+4,4,3,'#6a5230');IB.O(g,px+18,py+5,4,3,'#5e4628');IB.O(g,px+34,py+5,3.5,2.6,'#5e4628');}
    drawSign(g,b,px,py);
    return;
  }
  /* ---------- ПРОЦЕДУРНИЙ ФОЛБЕК (якщо PNG не завантажився) ---------- */
  const hgt=b.type==='chapel'?26:16+(b.w>5?6:0);
  const wall=P.w1,wallD=P.w2;
  IB.isoBox(g,x,y,wpx,dpx,hgt,wallD,IB.shade(wall,-0.25),wall);
  const rh=hgt+7;
  IB.PA(g,[[x-2,y+dpx/2-4],[x+wpx/2,y+dpx/2-4-dpx/2-rh+6],[x+wpx+2,y+dpx/2-4],[x+wpx/2,y+dpx/2-4+rh]],P.rf2);
  IB.PA(g,[[x+wpx/2,y+dpx/2-4-rh],[x+wpx+2,y+dpx/2-4],[x+wpx/2,y+dpx/2-4+rh]],P.rf1);
  for(let i=1;i<4;i++){
    IB.P(g,x+2,y+dpx/2-4-rh+i*2, wpx-4, 1, IB.shade(P.rf2,-0.12));
  }
  const dx0=x+wpx/2-4,dy0=y+dpx-2;
  IB.P(g,dx0,dy0-9,8,9,'#3a2818');
  IB.P(g,dx0+1,dy0-8,6,7,'#4e3a20');
  IB.P(g,dx0+5,dy0-5,1,1,'#d8b050');
  IB.P(g,x+5,y+dpx/2-2,5,5,lit?'#f0c060':'#1a2430');IB.P(g,x+wpx-10,y+dpx/2-2,5,5,lit?'#f0c060':'#1a2430');
  IB.P(g,x+6,y+dpx/2-1,3,3,lit?'#f8e0a0':'#0e1620');
  drawSign(g,b,px,py);
  if(b.type==='chapel'){
    IB.P(g,x+wpx/2-1,y+dpx/2-4-hgt-8,2,8,'#d8d8cc');IB.P(g,x+wpx/2-3,y+dpx/2-4-hgt-6,6,1,'#d8d8cc');
  }
  if(b.type==='forge'){
    IB.O(g,x+wpx/2,y-6,3,2,'#3a4038');
  }
  if(b.type==='molfar'){
    const pl=0.5+IB.M.sin(performance.now()*0.004)*0.3;
    g.strokeStyle='rgba(112,240,224,'+pl+')';g.beginPath();g.arc(x+wpx/2,y+dpx/2-6,22,0,7);g.stroke();
    IB.O(g,x+wpx/2+14,y+dpx+6,2,3,'rgba(112,240,224,'+pl+')');
  }
}
/* вивіска будівлі — дошка з назвою над південним кутом */
function drawSign(g,b,px,py){
  if(!b.label)return;
  const w=b.label.length*4+10;
  IB.P(g,px-w/2,py+2,w,9,'#1a1a22');
  IB.P(g,px-w/2+1,py+3,w-2,7,'#2e3038');
  g.font='6px monospace';g.textAlign='center';
  g.fillStyle='#f0d050';g.fillText(b.label,px,py+8);
  g.textAlign='left';
}

/* ---------- СТРУКТУРИ ТАБОРУ ---------- */
function drawFire(g,f,ox,oy,dt){
  const s=tileScreen(f.x,f.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  IB.O(g,x,y,8,4,'#2a2a28');
  /* каміння по колу */
  for(let i=0;i<7;i++){const a=i/7*6.28;IB.O(g,x+IB.M.cos(a)*8,y+IB.M.sin(a)*4,2,1.5,'#58605a');}
  if(f.fuel>0){
    const fl=IB.M.sin(performance.now()*0.02)*0.3+1;
    IB.PA(g,[[x-3,y-2],[x,y-2-10*fl],[x+3,y-2]],'#e07038');
    IB.PA(g,[[x-2,y-2],[x,y-2-16*fl],[x+2,y-2]],'rgba(240,190,80,0.9)');
    IB.PA(g,[[x-1,y-2],[x,y-2-7*fl],[x+1,y-2]],'#f8e8a0');
    if(IB.M.random()<0.15)IB.floatMsgs.push({x:f.x+IB.rnd(-0.3,0.3),y:f.y,txt:'✦',t:0.9});
  }else{
    IB.P(g,x-2,y-4,4,4,'#1a1a18');
  }
  /* казан на вогні */
  if(IB.G.camps&&IB.G.camps[IB.G.nearCamp(f.x,f.y,1)?.id||'']?.table&&false){}
}
function drawTent(g,t,ox,oy){
  const s=tileScreen(t.x,t.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  IB.O(g,x,y+1,10,4,'#00000030');
  IB.PA(g,[[x-11,y],[x,y-14],[x+11,y]],'#3a6a4a');
  IB.PA(g,[[x-11,y],[x,y-14],[x-3,y]],IB.shade('#3a6a4a',-0.2));
  IB.PA(g,[[x-3,y],[x,y-7],[x+3,y]],'#1e4228');
  IB.P(g,x+9,y-13,1,3,'#b84838');
}
function drawCampWell(g,w,ox,oy){
  const s=tileScreen(w.x,w.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  IB.isoBox(g,x-8,y-6,16,10,7,IB.PAL.c2,IB.PAL.c1,IB.PAL.c1);
  IB.P(g,x-2,y-16,2,12,IB.PAL.b2);IB.P(g,x+4,y-16,2,12,IB.PAL.b2);
  IB.PA(g,[[x-5,y-16],[x+7,y-16],[x+1,y-21]],IB.PAL.rf2);
  IB.O(g,x+1,y-8,4,2,'#28565f');
}
function drawTable(g,t,ox,oy){
  const s=tileScreen(t.x,t.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  IB.P(g,x-7,y-4,14,3,'#8a6a42');IB.P(g,x-6,y-1,2,2,'#5e4628');IB.P(g,x+4,y-1,2,2,'#5e4628');
  IB.O(g,x-3,y-6,3,2,'#3a4038');IB.O(g,x+3,y-6,2.5,2,'#6a5230');
}
function drawDry(g,d,ox,oy){
  const s=tileScreen(d.x,d.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  IB.P(g,x-6,y-12,1,12,'#5e4628');IB.P(g,x+5,y-12,1,12,'#5e4628');IB.P(g,x-6,y-12,12,1,'#5e4628');
  for(let i=0;i<3;i++)IB.P(g,x-4+i*4,y-10,2,5,'#c85048');
}
function drawFarm(g,f,ox,oy){
  const s=tileScreen(f.x,f.y);
  const x=s.x+ox, y=s.y+oy;
  IB.P(g,x+4,y+2,26,12,'#5e4628');
  IB.P(g,x+6,y+4,22,8,'#4e3a20');
  for(let i=0;i<3;i++)IB.P(g,x+7+i*7,y+5,4,6,'#3a2c18');
  if(f.planted){
    for(let i=0;i<3;i++){
      const gh=f.stage*2+2;
      IB.P(g,x+8+i*7,y+8-gh,2,gh,'#486036');
      if(f.ready){IB.O(g,x+9+i*7,y+7,2,2,'#b89058');}
    }
  }
}

/* ---------- СУТНОСТІ ---------- */
function drawHero(g,h,ox,oy,dt){
  const s=tileScreen(h.x,h.y);
  const x=s.x+ox+16,y=s.y+oy+10-h.swim*4;
  if(IB.G.party.active&&h.lying>0){
    /* v2.3: «упав / попадали» — герой лежить біля вогню */
    g.save();g.translate(x,y-2);g.rotate(h.lieDir||1.35);IB.drawPerson(g,0,0,'d',0,h.look);g.restore();
  }else{
    const hop=(IB.G.party.active&&!h.swim)?IB.M.abs(IB.M.sin(performance.now()*0.009+h.x*3.1))*2.2:0;
    IB.drawPerson(g,x,y-hop,h.dir,h.fr,h.look);
  }
  /* v1.3: ІМ'Я, ЩО СВІТИТЬСЯ над головою */
  const nc=h.def&&h.def.nameColor?h.def.nameColor:'#f0d050';
  const ny=y-36+IB.M.sin(performance.now()*0.003+h.x*1.7)*1.6;
  g.font='bold 7px monospace';g.textAlign='center';
  g.shadowColor=nc;g.shadowBlur=6;
  g.fillStyle=nc;g.fillText(h.name,x,ny);
  g.fillText(h.name,x,ny);
  g.shadowBlur=0;
  g.fillStyle='#ffffffcc';g.font='7px monospace';g.fillText(h.name,x,ny);
  g.textAlign='left';
  /* лідер — золотий шеврон над іменем */
  if(h.id==='viktor'){
    const bob2=IB.M.sin(performance.now()*0.004)*2;
    IB.PA(g,[[x,y-46+bob2],[x-4,y-40+bob2],[x+4,y-40+bob2]],'#f0d050');
  }
  if(h.frozen){
    g.fillStyle='#28565f';IB.O(g,x,y-14,9,14,'rgba(90,140,200,0.5)');
    g.font='11px monospace';g.fillStyle='#8ad0e0';g.fillText('❄',x-4,y-40);
  }
  if(h.alc>=3){
    const wob=IB.M.sin(performance.now()*0.008)*1.5;
    g.font='10px monospace';g.fillText('🥴',x+7+wob,y-32);
  }
  /* v1.5: фонарик у руці — уночі, якщо увімкнені */
  if(IB.nightFactor()>0.15&&IB.G.torch!==false){
    IB.P(g,x+6,y-9,3,2,'#2e3440');
    IB.P(g,x+9,y-8.5,1.6,1,'rgba(255,240,180,0.95)');
  }
  if(IB.G.party.active&&h.lying>0){
    g.font='9px monospace';g.fillText('💤',x+6,y-12);
  }else if(IB.G.party.active){
    const bob=IB.M.sin(performance.now()*0.006+h.x)*3;
    g.font='11px monospace';g.fillText(['🎵','🎶','💃','🍻'][IB.ri(0,3)],x-7,y-34+bob);
  }
  /* v2.3: бульбашки-діалоги над героями */
  if(h.bubble){
    const b=h.bubble;g.font='7px monospace';
    const w=IB.M.min(IB.M.max(g.measureText(b.txt).width+10,26),150);
    const bx=IB.M.max(3,IB.M.min(480-w-3,x-w/2)),by=IB.M.max(18,y-56);
    g.globalAlpha=0.93;
    IB.P(g,bx,by-9,w,12,'#f2efe4');
    g.strokeStyle=(h.def&&h.def.nameColor)||'#f0d050';g.lineWidth=1;g.strokeRect(bx+0.5,by-8.5,w-1,11);
    IB.PA(g,[[x-3,by+3.5],[x+3,by+3.5],[x,by+7]],'#f2efe4');
    g.fillStyle='#22262e';g.textAlign='center';g.fillText(b.txt,bx+w/2,by);g.textAlign='left';
    g.globalAlpha=1;
  }
}
function drawNpc(g,n,ox,oy){
  const s=tileScreen(n.x,n.y);
  const x=s.x+ox+16,y=s.y+oy+10;
  IB.drawPerson(g,x,y,n.dir,n.fr,n.look);
  if(n.quest&&!IB.G.flags['side_'+n.quest+'_done']){
    const bob=IB.M.sin(performance.now()*0.005)*2;
    g.font='10px monospace';g.fillStyle='#f0d050';g.fillText('!',x-1,y-36+bob);
  }
  if(n.role==='molfar'){
    const pl=0.4+IB.M.sin(performance.now()*0.005)*0.25;
    g.strokeStyle='rgba(112,240,224,'+pl+')';g.beginPath();g.arc(x,y-12,15,0,7);g.stroke();
  }
}
function drawTourist(g,t,ox,oy){
  const s=tileScreen(t.x,t.y);
  const x=s.x+ox+16,y=s.y+oy+10;
  IB.drawPerson(g,x,y,t.dir,t.fr,t.look);
  g.font='9px monospace';g.fillStyle='#e07038';
  g.fillText(t.follow?'...':'HELP',x-10,y-38);
}
function drawAnimal(g,a,ox,oy){
  const s=tileScreen(a.x,a.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  if(a.type==='sheep')IB.drawSheep(g,x,y,a.fr,a.dark);
  else if(a.type==='goat')IB.drawGoat(g,x,y,a.fr);
  else if(a.type==='dog')IB.drawDog(g,x,y,a.dir,a.fr);
  else if(a.type==='bear')IB.drawBear(g,x,y,a.fr,a.dir);
  if(a.lost){g.font='9px monospace';g.fillStyle='#e8a0d0';g.fillText('!',x,y-14);}
}

/* ==================== v1.5: ЗВІРІ — рись / круки / кажани ==================== */
function drawBeast(g,b,ox,oy,dt){
  const s=tileScreen(b.x,b.y);
  if(b.type==='lynx'){
    const x=s.x+ox+16,y=s.y+oy+8;
    const c='#c07838',cd=IB.shade(c,-0.28),cm='#d89858';
    g.fillStyle='#00000030';g.beginPath();g.ellipse(x,y-1,8,2.8,0,0,7);g.fill();
    const lw=b.state==='flee'?-2:(b.fr===1?-1:1);
    IB.P(g,x-6,y-4,2,4,cd);IB.P(g,x+3,y-4,2,4,cd);
    IB.O(g,x,y-8,7.5,4,c);
    IB.O(g,x+6,y-10,4,3.4,cm);
    /* вушка з пензликами */
    IB.PA(g,[[x+4,y-12],[x+5,y-16],[x+7,y-12]],cd);
    IB.PA(g,[[x+7,y-12],[x+8.5,y-15],[x+9.5,y-11]],cd);
    IB.P(g,x+8,y-10,1.2,1.2,'#1a1418');
    /* плями */
    IB.P(g,x-3,y-9,1.6,1.6,cd);IB.P(g,x,y-7,1.6,1.6,cd);IB.P(g,x+2,y-10,1.4,1.4,cd);
    /* короткий хвіст з чорним кінчиком */
    IB.P(g,x-7+lw,y-9,3,2.4,c);IB.P(g,x-9+lw,y-9,2,2,'#1a1418');
    /* вуса */
    IB.P(g,x+9,y-8,3,0.8,'#e8e0d0aa');
    if(b.state==='stalk'&&IB.M.random()<dt*2)IB.floatMsg(b.x,b.y,'🐾');
    if(b.state==='lunge'){g.font='8px monospace';g.fillStyle='#ff5040';g.fillText('!',x-1,y-20);}
    return;
  }
  if(b.type==='ravens'){
    for(const bird of b.birds){
      const bx=s.x+ox+16+bird.ox*16,by=s.y+oy+8+bird.oy*8-bird.z;
      /* тінь на землі */
      g.fillStyle='rgba(0,0,0,0.22)';
      g.beginPath();g.ellipse(s.x+ox+16+bird.ox*16,s.y+oy+8+bird.oy*8,3,1.4,0,0,7);g.fill();
      const fl=Math.sin(bird.ph*2.4);
      g.fillStyle='#14161c';
      if(fl>0){IB.PA(g,[[bx-5,by],[bx,by-2.5],[bx+5,by-1]],'#14161c');}
      else{IB.PA(g,[[bx-5,by-3],[bx,by-1],[bx+5,by-2.5]],'#14161c');}
      IB.O(g,bx,by-1,3,2,'#1a1d24');
      IB.P(g,bx+3,by-2.5,2.4,1,'#38404c'); /* дзьоб */
      IB.P(g,bx+2.6,by-3,1,1,'#68707c'); /* око */
    }
    if(b.state==='dive'&&IB.M.random()<dt*6){const v=b.birds[0];IB.floatMsg(b.x+v.ox,b.y+v.oy,'КАР!');}
    return;
  }
  if(b.type==='bats'){
    const t=performance.now()*0.001;
    for(const bt of b.bats){
      const bx=s.x+ox+16+IB.M.cos(bt.a)*bt.r*16;
      const by=s.y+oy+8+IB.M.sin(bt.a)*bt.r*8-bt.z;
      const fl=Math.sin(t*22+bt.a*5);
      g.fillStyle='rgba(24,20,34,0.92)';
      if(fl>0)IB.PA(g,[[bx-4,by],[bx,by-2],[bx+4,by-0.6]],'rgba(24,20,34,0.92)');
      else IB.PA(g,[[bx-4,by-2],[bx,by-0.6],[bx+4,by-2.2]],'rgba(24,20,34,0.92)');
      IB.O(g,bx,by-1,1.6,1.4,'#181420');
      IB.P(g,bx-1,by-2.4,0.8,1,'#181420');IB.P(g,bx+0.4,by-2.4,0.8,1,'#181420');
    }
    return;
  }
}
function drawFishShadow(g,f,ox,oy){
  if(IB.W.at(f.x,f.y)!==0)return;
  const s=tileScreen(f.x,f.y);
  const x=s.x+ox+16,y=s.y+oy+8;
  g.fillStyle='rgba(10,30,36,0.5)';
  IB.O(g,x,y,4,1.6,'rgba(8,26,32,0.55)');
  IB.PA(g,[[x+3,y],[x+6,y-1.5],[x+6,y+1.5]],'rgba(8,26,32,0.45)');
}
function drawTripFx(g,fx,ox,oy,dt){
  const s=tileScreen(fx.x,fx.y);
  const x=s.x+ox+16,y=s.y+oy+8-fx.z;
  g.save();g.globalAlpha=fx.a;
  if(fx.kind==='ghost'){IB.drawPerson(g,x,y,'d',0,{skin:'#f0d050',hair:'#f0d050',jacket:'#e0a830',pants:'#b87038',hat:'hat',hatc:'#e0a830'});}
  else if(fx.kind==='food'){g.font='12px monospace';g.fillText('🍲',x-6,y);}
  else if(fx.kind==='note'){g.font='12px monospace';g.fillText(['🎵','🎶'][fx.v%2],x-6,y);}
  else if(fx.kind==='eye'){g.strokeStyle=IB.PAL.mg1;g.beginPath();g.arc(x,y,6,0,7);g.stroke();IB.O(g,x,y,2.5,2.5,IB.PAL.mg3);}
  else if(fx.kind==='line'){g.strokeStyle='rgba(90,160,255,0.6)';g.beginPath();g.moveTo(x-10,y);g.lineTo(x+10,y-8);g.lineTo(x+16,y+4);g.stroke();}
  else if(fx.kind==='shadow'){IB.O(g,x,y,7,9,'rgba(20,16,40,0.7)');g.font='10px monospace';g.fillText('😈',x-5,y-10);}
  else if(fx.kind==='star'){g.font='12px monospace';g.fillText('✦',x-5,y);g.fillStyle='#ffe14e';}
  g.restore();
}

/* ---------- ПОГОДА-ЧАСТИНКИ ---------- */
function drawWeather(g,dt){
  const type=IB.G.wx.type;
  if(type==='sun'||type==='cloud'&&false)return;
  /* керування пулом частинок */
  const want={rain:90,hail:70,snow:80,blizzard:150,wind:30}[type]||0;
  while(IB.weatherP.length<want)IB.weatherP.push({x:IB.rnd(0,480),y:IB.rnd(-336,336),v:IB.rnd(60,140),d:IB.rnd(0.6,1.4)});
  if(!want)IB.weatherP.length=0;
  g.save();
  for(const p of IB.weatherP){
    if(type==='rain'){
      p.y+=p.v*2.2*dt;p.x-=p.v*0.3*dt;
      g.strokeStyle='rgba(120,170,220,0.5)';g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x+1.5,p.y+7);g.stroke();
    }else if(type==='hail'){
      p.y+=p.v*3*dt;
      g.fillStyle='rgba(200,230,245,0.75)';g.fillRect(p.x,p.y,2,2);
    }else if(type==='snow'||type==='blizzard'){
      const spd=type==='blizzard'?2.6:1;
      p.y+=p.v*0.9*dt*spd;p.x+=(IB.M.sin(p.y*0.02+p.d*9)*14-30*spd)*dt;
      g.fillStyle=type==='blizzard'?'rgba(240,248,255,0.85)':'rgba(240,248,255,0.7)';
      g.fillRect(p.x,p.y,type==='blizzard'?2:1.6,type==='blizzard'?2:1.6);
    }else if(type==='wind'){
      p.x+=p.v*2.4*dt;p.y+=IB.M.sin(p.x*0.01)*0.4;
      g.strokeStyle='rgba(200,210,200,0.25)';g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x+9,p.y+1);g.stroke();
    }
    if(p.y>340){p.y=IB.rnd(-20,0);p.x=IB.rnd(0,480);}
    if(p.x<-10)p.x=490;if(p.x>490)p.x=-10;
  }
  g.restore();
  /* хмарність — тінь */
  if(type==='cloud'){
    g.fillStyle='rgba(60,70,80,0.22)';g.fillRect(0,0,480,336);
  }
}

/* ---------- МІНІКАРТА ---------- */
IB.drawMinimap=(g)=>{
  const W=IB.W,sc=120/W.W;
  g.fillStyle='#070d0a';g.fillRect(0,0,120,120);
  const step=2;
  for(let y=0;y<W.H;y+=step)for(let x=0;x<W.W;x+=step){
    const t=W.at(x,y),h=W.elevAt(x,y);
    let c='#101810';
    if(t===0)c='#1e4450';else if(t===1)c='#8a7444';else if(t===5)c='#d8e4ee';
    else if(t===4)c='#5e6a62';else if(t===3)c='#28512e';else if(t===2)c='#3f6a38';
    else if(t===9)c='#8a6038';else if(t===7)c='#6a5030';else if(t===10)c='#5e4628';
    if(h>5&&t!==0)c=IB.lerpCol?c:'#a8c0d0';
    g.fillStyle=c;g.fillRect(x*sc,y*sc*(120/W.H),step*sc+1,step*(120/W.H)+1);
  }
  /* артефакти при баченні */
  if(IB.G.vision>0||IB.G.trip.active){
    for(const a of IB.ARTIFACTS){
      if(!a.world||IB.artHas(a.id))continue;
      g.fillStyle='#b06ae0';g.fillRect(a.x*sc-1.5,a.y*sc*(120/W.H)-1.5,3,3);
    }
  }
  /* POI */
  for(const p of W.pois){
    g.fillStyle=p.kind==='village'?'#f0d050':(p.kind==='camp'?'#5cb878':'#c8d0d8');
    g.fillRect(p.x*sc-1,p.y*sc*(120/W.H)-1,2,2);
  }
  /* група */
  for(const h of IB.E.team){
    g.fillStyle=h.id==='viktor'?'#ffffff':'#c8d8c8';
    g.fillRect(h.x*sc-1,h.y*sc*(120/W.H)-1,h.id==='viktor'?3:2,h.id==='viktor'?3:2);
  }
  /* бліп порятунку */
  const bl=IB.blip();
  if(bl){g.fillStyle='#5aa0ff';g.fillRect(bl.x*sc-2,bl.y*sc*(120/W.H)-2,4,4);}
  /* маршрут */
  if(IB.G.route){
    const L=IB.E.team[0];
    g.strokeStyle='#e05a8a';g.setLineDash([2,2]);
    g.beginPath();g.moveTo(L.x*sc,L.y*sc*(120/W.H));g.lineTo(IB.G.route.x*sc,IB.G.route.y*sc*(120/W.H));g.stroke();
    g.setLineDash([]);
  }
};

/* ---------- ВЕЛИКА КАРТА (панель) ---------- */
IB.drawBigMapBase=(canvas)=>{
  const g=canvas.getContext('2d');
  const sc=canvas.width/IB.W.W, scY=canvas.height/IB.W.H;
  g.fillStyle='#070d0a';g.fillRect(0,0,canvas.width,canvas.height);
  const step=2;
  for(let y=0;y<IB.W.H;y+=step)for(let x=0;x<IB.W.W;x+=step){
    const t=IB.W.at(x,y),h=IB.W.elevAt(x,y);
    let c;
    if(t===0)c='#1e4450';else if(t===1)c='#8a7444';else if(t===5)c='#d8e4ee';
    else if(t===4)c='#5e6a62';else if(t===3)c='#28512e';else if(t===2)c='#3f6a38';
    else if(t===9)c='#9a7044';else if(t===7)c='#6a5030';else if(t===10)c='#5e4628';else if(t===8)c='#3e6a34';
    else c='#31502c';
    if(h>6&&t!==0)c='#a8c0d0';else if(h>4&&t!==0)c=IB.shade(c,0.1);
    g.fillStyle=c;g.fillRect(x*sc,y*scY,step*sc+0.5,step*scY+0.5);
  }
  g.font='7px monospace';
  for(const p of IB.W.pois){
    const px=p.x*sc,py=p.y*scY;
    g.fillStyle=p.kind==='village'?'#f0d050':(p.kind==='camp'?'#5cb878':(p.kind==='molfar'||p.kind==='ruin'?'#b06ae0':'#e8e8e8'));
    g.fillRect(px-2,py-2,4,4);
    g.fillStyle='#ffffffcc';g.fillText(p.name,px+4,py+2);
  }
  /* артефакти */
  for(const a of IB.ARTIFACTS){
    if(!a.world)continue;
    const found=IB.artHas(a.id);
    const show=found||(IB.G.vision>0&&!a.hidden)||(IB.G.trip.active)||(IB.G.flags.molfarKnown&&a.id==='a5');
    if(!show)continue;
    const px=a.x*sc,py=a.y*scY;
    g.fillStyle=found?'#8a8c94':'#b06ae0';
    g.beginPath();g.arc(px,py,4,0,7);g.fill();
    g.fillStyle='#ffffffcc';g.fillText(found?a.name:(IB.G.vision>0?a.name:'? ? ?'),px+5,py+3);
  }
  /* група + герої */
  for(const h of IB.E.team){
    const px=h.x*sc,py=h.y*scY;
    g.fillStyle=h.id==='viktor'?'#ffffff':'#b8c8ba';
    g.fillRect(px-1.5,py-1.5,3,3);
  }
  /* бліп */
  const bl=IB.blip();
  if(bl){g.fillStyle='#5aa0ff';g.beginPath();g.arc(bl.x*sc,bl.y*scY,5,0,7);g.stroke();}
  /* маршрут */
  if(IB.G.route){
    const L=IB.E.team[0];
    g.strokeStyle='#e05a8a';g.setLineDash([4,3]);g.lineWidth=1.5;
    g.beginPath();g.moveTo(L.x*sc,L.y*scY);g.lineTo(IB.G.route.x*sc,IB.G.route.y*scY);g.stroke();
    g.setLineDash([]);
  }
  /* вівця Івася */
  if(IB.G.quests.side.sheep&&!IB.G.flags.sheepFound){
    const a=IB.E.animals.find(a=>a.lost);
    if(a){g.fillStyle='#e8a0d0';g.fillRect(a.x*sc-2,a.y*scY-2,4,4);g.fillStyle='#e8a0d0';g.fillText('ВІВЦЯ',a.x*sc+4,a.y*scY);}
  }
};

/* ---------- ТРІП-ФХ ОНОВЛЕННЯ ---------- */
IB.updateFx=(dt)=>{
  /* спавн галюцинацій: тріп «5 г» + ГРИБНИЙ ТРІП/РОЗГУЛ на вечірці (v2.3) */
  const psy=IB.G.trip.active||IB.partyPsy();
  if(psy){
    const L=IB.E.team[0];
    if(IB.tripFx.length<26&&IB.M.random()<dt*(IB.G.trip.active?4:1.8)){
      const kinds={viktor:['ghost','star'],andriy:['food','star'],taras:['note','star'],petro:['line','eye'],maksym:['shadow','star']};
      const kk=kinds[L.id]||['star'];
      const a=IB.rnd(0,6.28),r=IB.rnd(3,12);
      IB.tripFx.push({x:L.x+IB.M.cos(a)*r,y:L.y+IB.M.sin(a)*r,z:IB.rnd(8,50),
        kind:kk[IB.ri(0,kk.length-1)],v:IB.ri(0,9),a:1,life:IB.rnd(3,7),t:0});
    }
  }
  for(let i=IB.tripFx.length-1;i>=0;i--){
    const fx=IB.tripFx[i];
    fx.t+=dt;fx.z+=IB.M.sin(fx.t*2)*dt*6;
    fx.x+=IB.M.sin(fx.t*0.8)*dt*0.7;fx.y+=IB.M.cos(fx.t*0.6)*dt*0.7;
    fx.a=IB.M.min(1,fx.life-fx.t);
    if(fx.t>=fx.life)IB.tripFx.splice(i,1);
  }
  if(!psy&&IB.tripFx.length)IB.tripFx.length=IB.M.max(0,IB.tripFx.length-1);
};


/* ==================== v1.3: АВТО — справжні машини з ПЕРШОЇ ЧАСТИНИ ==================== */
function drawCar(g,c,ox,oy,dt){
  const s=tileScreen(c.x,c.y);
  const x=s.x+ox+16,y=s.y+oy+6;
  if(c.type==='van'){
    /* білий фургон групи (спогад про Київ) — процедурний */
    IB.O(g,x+6,y,30,11,'#00000035');
    IB.isoBox(g,x,y,44,23,13,c.c,IB.shade(c.c,-0.18),IB.shade(c.c,-0.3));
    IB.P(g,x+9,y-6,27,7,'#2a3e5c');
    IB.P(g,x+11,y-5,6,4,'#8ab8d8');IB.P(g,x+20,y-5,6,4,'#8ab8d8');IB.P(g,x+29,y-5,6,4,'#8ab8d8');
    IB.P(g,x+6,y+5,3,4,IB.shade(c.c,-0.35));IB.P(g,x+36,y+5,3,4,IB.shade(c.c,-0.35));
    IB.P(g,x+12,y+2,21,4,'#c83828');            /* v2.4b: ван бІльший */
    return;
  }
  const m=c.model&&IB.img('car_'+c.model+'_se')?c.model:null;
  const im=m?IB.img('car_'+m+'_se'):null;
  if(im){
    /* PNG-машини v5 (ВАЗ, Lanos, SUV, Truck) — вид SE, для лівого напрямку дзеркало */
    const sc=0.62;                     /* v2.4b: машини бІльші (було 0.42) */
    const src=(c.dir==='l')?(IB.mirror('car_'+m+'_se')||im):im;
    g.fillStyle='#00000035';g.beginPath();g.ellipse(x,y-1,im.width*sc*0.5,im.height*sc*0.28,0,0,7);g.fill();
    g.drawImage(src,x-im.width*sc/2,y-im.height*sc+4,im.width*sc,im.height*sc);
    /* фара/габарити вночі + БІП-БІП спалах */
    if(IB.nightFactor()>0.4){
      g.fillStyle='rgba(248,240,190,0.8)';
      IB.O(g,x+(c.dir==='l'?-im.width*sc*0.2:im.width*sc*0.2),y-4,2.2,2.2,'rgba(248,240,190,0.8)');
    }
    if(c.honkT>4.4){g.font='10px monospace';g.fillStyle='#f0d050';g.fillText('БІП!',x-9,y-im.height*sc-6);}
    return;
  }
  /* фолбек — процедурний бокс */
  const dark=IB.shade(c.c,-0.35);
  IB.isoBox(g,x,y,26,14,7,c.c,IB.shade(c.c,-0.18),IB.shade(c.c,-0.3));
  IB.P(g,x+5,y-3,15,4,'#2a3e5c');
  IB.P(g,x+6,y-2,4,3,'#9ac4e0');IB.P(g,x+12,y-2,4,3,'#9ac4e0');
  IB.P(g,x+3,y+3,2,3,dark);IB.P(g,x+21,y+3,2,3,dark);
}

/* ==================== v1.2: СХОДЖЕННЯ (мандрівка) ==================== */
/* ==================== v2.4 «ФІНАЛ»: СХОДЖЕННЯ — ІЗОМЕТРІЯ ====================
   Гора-піраміда з терасами (ліс смерек → полонина → скелі → сніжники),
   звивиста стежка-серпантин, вся група ЙДЕ по ній (анімація кроків) і
   штурмує вершину; хмари у ТРИ ШАРИ (за вершинами, море хмар під вершиною,
   перед камерою); ізо-вершини сусіди; прапорець+тур / озеро / стела на
   фініші; експедиція — ізо-траса з ваном, стовпами і пилом. */
IB.ASC_STAGES={
  peak:['ПІДНІЖЖЯ — СТАРА СТЕЖКА','ГРАВІЙ І СМЕРЕКИ','ПОЛОНИНА — ВІТЕР З ХРЕБТА','СКЕЛЬНІ ВИХОДИ','СНІЖНИК — ОСТАННІЙ РИВОК','ВЕРШИНА'],
  lake:['ПІДНІЖЖЯ','ЯЛИНОВИЙ ЛІС','ПОЛОНИНА','БЕРЕГ ОЗЕРА'],
  border:['ДОЛИНА ТИСУ','ГРУНТОВА ДОРОГА','ПРИКОРДОННА СТЕЛА'],
  expedition:['ЗАВАНТАЖЕННЯ В БІЛИЙ ВАН','ВОЛИНСЬКА ТРАСА','ЗАЛІСІННЯ','ПЛЯЖ СВІТЯЗЯ'],
};
IB.TRAVEL_CUR=null;
/* звивиста стежка схилом — група йде по ній у ланцюжку */
IB._ascTrail=[[288,268],[196,256],[296,244],[204,232],[282,218],[208,204],[270,190],[214,176],[256,162],[222,148],[250,134],[232,120],[246,106],[240,98]];
IB._ascTrailTot=(()=>{
  let t=0;
  for(let i=1;i<IB._ascTrail.length;i++)
    t+=IB.dist(IB._ascTrail[i-1][0],IB._ascTrail[i-1][1],IB._ascTrail[i][0],IB._ascTrail[i][1]);
  return t;
})();
IB._ascPos=(s)=>{
  s=IB.clamp(s,0,1);
  const d=s*IB._ascTrailTot;let acc=0;
  for(let i=1;i<IB._ascTrail.length;i++){
    const a=IB._ascTrail[i-1],b=IB._ascTrail[i];
    const seg=IB.dist(a[0],a[1],b[0],b[1]);
    if(acc+seg>=d){
      const t2=IB.clamp((d-acc)/IB.M.max(1,seg),0,1),dx=b[0]-a[0];
      return {x:IB.lerp(a[0],b[0],t2),y:IB.lerp(a[1],b[1],t2),
        dir:dx>6?'r':(dx<-6?'l':(b[1]<a[1]?'u':'d'))};
    }
    acc+=seg;
  }
  const e=IB._ascTrail[IB._ascTrail.length-1];
  return {x:e[0],y:e[1],dir:'u'};
};
IB._ascCloud=(g,x,y,sc,al)=>{
  g.fillStyle='rgba(240,246,252,'+al+')';
  g.beginPath();g.ellipse(x,y,26*sc,9*sc,0,0,7);g.fill();
  g.beginPath();g.ellipse(x+15*sc,y-6*sc,17*sc,8*sc,0,0,7);g.fill();
  g.beginPath();g.ellipse(x-17*sc,y-4*sc,14*sc,7*sc,0,0,7);g.fill();
  g.beginPath();g.ellipse(x-2*sc,y-10*sc,12*sc,6*sc,0,0,7);g.fill();
};
IB._ascPine=(g,x,y,sc,c)=>{
  IB.P(g,x-1.5*sc,y-8*sc,3*sc,9*sc,'#3a2c18');
  IB.PA(g,[[x,y-20*sc],[x-6*sc,y-7*sc],[x+6*sc,y-7*sc]],c||'#1e4228');
  IB.PA(g,[[x,y-26*sc],[x-4.5*sc,y-13*sc],[x+4.5*sc,y-13*sc]],c||'#265232');
};
/* далека ізо-вершина зі сніжною шапкою */
IB._bgPeak=(g,ax,ay,bw,hgt,c1,c2)=>{
  IB.PA(g,[[ax,ay],[ax-bw,ay+hgt],[ax,ay+hgt]],c1);
  IB.PA(g,[[ax,ay],[ax,ay+hgt],[ax+bw,ay+hgt]],c2);
  IB.PA(g,[[ax,ay],[ax-bw*0.26,ay+hgt*0.26],[ax,ay+hgt*0.26]],'#e8f0f4');
  IB.PA(g,[[ax,ay],[ax,ay+hgt*0.26],[ax+bw*0.26,ay+hgt*0.26]],'#f0f6f8');
};
/* ГОРА — піраміда з терасами за висотою: сніг / скелі / полонина / ліс */
IB._ascMtn=(g,ax,ay,bw,hgt)=>{
  const bands=[[0,0.22,'#eef4f8','#dce8f0'],[0.22,0.42,'#88928c','#58605a'],
               [0.42,0.62,'#6a8448','#4c6232'],[0.62,1.02,'#2e5230','#1e4228']];
  for(const b of bands){
    const y1=ay+hgt*b[0],y2=ay+hgt*b[1];
    IB.PA(g,[[ax-bw*b[0],y1],[ax,y1],[ax,y2],[ax-bw*b[1],y2]],b[2]);
    IB.PA(g,[[ax,y1],[ax+bw*b[0],y1],[ax+bw*b[1],y2],[ax,y2]],b[3]);
  }
  /* піедмонт — темне лісове підніжжя (третя грань) */
  IB.PA(g,[[ax-bw,ay+hgt],[ax,ay+hgt+hgt*0.32],[ax+bw,ay+hgt]],'#16281a');
  /* фактура: сніг блищить, осип — каміння, полонина — квіти, ліс — хвоїнки */
  for(let i=0;i<110;i++){
    const t=0.03+IB.hsh(i,1,950)*0.97,y=ay+t*hgt;
    const side=IB.hsh(i,2,951)<0.5?-1:1;
    const lim=IB.M.max(8,bw*IB.M.min(t,1)-10);
    const x=ax+side*(6+IB.hsh(i,3,952)*lim);
    let c;
    if(t<0.22)c=IB.hsh(i,4,953)<0.5?'#ffffff':'#c8d8e4';
    else if(t<0.42)c=IB.hsh(i,4,953)<0.5?'#4e5a54':'#7a847e';
    else if(t<0.62)c=['#f0d050','#e86a8a','#9a70d0','#7e9454'][i&3];
    else c=IB.hsh(i,4,953)<0.6?'#16321e':'#3a5a30';
    g.fillStyle=c;g.fillRect(x|0,y|0,1.6,1.6);
  }
};
IB.drawAscent=(g,dt)=>{
  const C=IB.TRAVEL_CUR;if(!C)return;
  const r=C.route;
  const stages=IB.ASC_STAGES[r.kind]||IB.ASC_STAGES.peak;
  const st=IB.M.min(stages.length-1,IB.M.floor(C.prog/100*stages.length));
  const wx=IB.G.wx.type,nf=IB.nightFactor(),gh=IB.goldenHour();
  const T=performance.now()*0.001;
  /* ---------- НЕБО ---------- */
  const sky=g.createLinearGradient(0,0,0,336);
  if(nf>0.5){sky.addColorStop(0,'#0a1226');sky.addColorStop(1,'#182338');}
  else if(wx==='sun'){sky.addColorStop(0,'#28598c');sky.addColorStop(1,gh>0.4?'#e8c8a0':'#a8c4d8');}
  else if(wx==='snow'||wx==='blizzard'){sky.addColorStop(0,'#8aa4b8');sky.addColorStop(1,'#d8e4ee');}
  else if(wx==='rain'||wx==='storm'){sky.addColorStop(0,'#3a4452');sky.addColorStop(1,'#7a8a98');}
  else {sky.addColorStop(0,'#5a7a94');sky.addColorStop(1,'#b8c8d4');}
  g.fillStyle=sky;g.fillRect(0,0,480,336);
  if(nf>0.5)for(let i=0;i<42;i++){
    const sx=IB.hsh(i,1,940)*480,sy=IB.hsh(i,2,941)*150;
    g.fillStyle='rgba(215,228,255,'+(0.35+0.45*IB.hsh(i,3,942))*(0.55+0.45*IB.M.sin(T*2+i))+')';
    g.fillRect(sx,sy,1.4,1.4);
  }
  /* сонце / місяць */
  g.fillStyle=nf>0.5?'#e8e8d8':(gh>0.4?'#f8c070':'#f8e8a0');
  g.beginPath();g.arc(398,62,11,0,7);g.fill();
  if(nf<=0.5){g.fillStyle='rgba(248,232,160,0.16)';g.beginPath();g.arc(398,62,20,0,7);g.fill();}
  /* птахи у небі */
  g.strokeStyle='rgba(30,40,50,0.5)';g.lineWidth=1.3;
  for(let i=0;i<3;i++){
    const bx=(T*24+i*150)%540-30,by=66+i*20+IB.M.sin(T*1.6+i*2)*5;
    const w2=IB.M.sin(T*7+i*2)*2.5;
    g.beginPath();g.moveTo(bx-4,by+w2);g.lineTo(bx,by);g.lineTo(bx+4,by+w2);g.stroke();
  }
  if(r.kind==='expedition'){IB._ascExpedition(g,C,st,T,nf);}
  else{
    /* ---------- ХМАРИ ЗА ВЕРШИНАМИ ---------- */
    for(let i=0;i<4;i++){
      const cx=((i*150+T*9)%620)-70,cy=96+IB.hsh(i,4,943)*58;
      IB._ascCloud(g,cx,cy,0.8+i*0.15,0.75);
    }
    /* ---------- ІЗО-ВЕРШИНИ-СУСІДИ ---------- */
    const pc1=nf>0.5?'#16283e':'#3a5a6c',pc2=nf>0.5?'#1e3450':'#4a7280';
    IB._bgPeak(g,60,196,56,52,pc1,pc2);
    IB._bgPeak(g,428,186,52,58,pc1,pc2);
    IB._bgPeak(g,118,224,34,28,pc1,pc2);
    /* ---------- ГОРА ---------- */
    IB._ascMtn(g,240,88,174,152);
    /* смереки підніжжям (за стежкою) */
    for(let i=0;i<11;i++){
      const px=74+i*34+IB.hsh(i,5,944)*16,py=252+IB.hsh(i,6,945)*30;
      if(IB.dist(px,py,288,268)>26)IB._ascPine(g,px,py,0.9+IB.hsh(i,7,946)*0.7);
    }
    /* ---------- МОРЕ ХМАР ПІД ВЕРШИНОЮ (з ~62% підйому) ---------- */
    if(C.prog>62){
      for(let i=0;i<12;i++){
        const cx=((i*46+T*11)%640)-80;
        g.fillStyle='rgba(236,244,250,0.55)';
        g.beginPath();g.ellipse(cx,160+IB.M.sin(i*1.7)*8,40,9,0,0,7);g.fill();
        g.beginPath();g.ellipse(cx+20,152+IB.M.sin(i*1.3)*6,24,7,0,0,7);g.fill();
      }
    }
    /* ---------- СТЕЖКА-СЕРПАНТИН ---------- */
    g.lineCap='round';g.lineJoin='round';
    g.beginPath();g.moveTo(IB._ascTrail[0][0],IB._ascTrail[0][1]);
    for(let i=1;i<IB._ascTrail.length;i++)g.lineTo(IB._ascTrail[i][0],IB._ascTrail[i][1]);
    g.globalAlpha=0.9;
    g.strokeStyle='#241a10';g.lineWidth=7;g.stroke();
    g.strokeStyle='#8a6a42';g.lineWidth=4;g.stroke();
    g.setLineDash([4,8]);g.strokeStyle='#a87848';g.lineWidth=1.6;g.stroke();g.setLineDash([]);
    g.globalAlpha=1;
    /* ---------- ФІНІШ СТЕЖКИ: ПРАПОРЕЦЬ+ТУР / ОЗЕРО / СТЕЛА ---------- */
    if(r.kind==='lake'){
      g.fillStyle='#28565f';g.beginPath();g.ellipse(240,90,46,13,0,0,7);g.fill();
      g.fillStyle='#3a6c74';g.beginPath();g.ellipse(240,88,34,8,0,0,7);g.fill();
      g.fillStyle='rgba(170,225,240,0.6)';g.fillRect(216,86,14,1.5);g.fillRect(240,90,18,1.5);
      for(let i=0;i<7;i++){const a=i/7*6.28;
        g.fillStyle='#58605a';g.beginPath();g.ellipse(240+IB.M.cos(a)*48,90+IB.M.sin(a)*13,4,2.4,0,0,7);g.fill();}
    }else if(r.kind==='border'){
      IB.isoBox(g,228,84,26,12,5,'#88928c','#58605a','#6e7872');
      IB.P(g,234,58,12,30,'#e8e8e2');
      IB.P(g,234,58,12,5,'#b82840');IB.P(g,234,74,12,6,'#2a3e5c');
    }else{
      IB.isoBox(g,233,96,14,7,4,'#58605a','#4e5a54','#6e7872'); /* тур з каміння */
      IB.P(g,239,80,2,17,'#5e4628');
    }
    /* ---------- ГРУПА ЙДЕ І ШТУРМУЄ (анімація кроків, ланцюжок) ---------- */
    if(C.bubT===undefined){C.bubT=2.5;C.bub=null;}
    C.bubT-=dt;
    if(C.bubT<=0){
      C.bubT=3.5+IB.rnd(0,3);
      const L=['Далі, хлопці!','Ой, вітєр!','Гора кличе!','Красота!','Смалина б тут…','Тричі «гей»!','Ще ривок!','Дихай, дихай…'];
      C.bub={i:IB.ri(0,4),t:2.4,txt:L[IB.ri(0,L.length-1)]};
    }
    if(C.bub){C.bub.t-=dt;if(C.bub.t<=0)C.bub=null;}
    const mem=[];
    for(let i=0;i<5;i++){
      const s=C.prog/100-i*0.05;
      mem.push({i:i,p:IB._ascPos(s)});
    }
    mem.sort((a,b)=>a.p.y-b.p.y);
    for(const m of mem){
      const h=IB.E.team[m.i];if(!h)continue;
      const fr=1+(IB.M.floor(T*6+m.i*0.8)&1);
      const sc=IB.lerp(0.68,0.95,IB.clamp((m.p.y-98)/180,0,1));
      IB.drawPerson(g,m.p.x,m.p.y,m.p.dir,fr,h.look,sc);
      if(C.bub&&C.bub.i===m.i){
        g.font='7px monospace';
        const w=C.bub.txt.length*4.4+10;
        g.fillStyle='rgba(250,248,238,0.94)';g.fillRect(m.p.x-w/2,m.p.y-30*sc-9,w,11);
        g.fillStyle='#241a10';g.fillText(C.bub.txt,m.p.x-w/2+5,m.p.y-30*sc);
      }
    }
    /* прапорець махає з вершини */
    if(r.kind==='peak'){
      const fw=IB.M.sin(T*3)*2.5;
      IB.PA(g,[[241,80],[251+fw,83],[241,87]],'#c83828');
    }
    /* пориви вітру на полонині (етап 3+) */
    if(st>=2&&nf<=0.5){
      g.strokeStyle='rgba(255,255,255,0.28)';g.lineWidth=1.4;
      for(let i=0;i<3;i++){
        const wy=186+i*9,wx2=((T*(46+i*14)+i*260)%600)-60;
        g.beginPath();g.moveTo(wx2,wy);g.quadraticCurveTo(wx2+30,wy-4,wx2+64,wy);g.stroke();
      }
    }
    /* ambient-сніжок на сніжниках (етап 5+) */
    if(r.kind==='peak'&&st>=4){
      g.fillStyle='rgba(240,248,255,0.8)';
      for(let i=0;i<26;i++){
        const xx=(IB.hsh(i,1,922)*480+T*14)%480,yy=(IB.hsh(i,2,923)*336+T*26)%336;
        g.fillRect(xx,yy,1.6,1.6);
      }
    }
  }
  /* ---------- погода-частинки ---------- */
  if(wx==='rain'||wx==='hail'){g.strokeStyle='rgba(160,200,230,0.5)';g.beginPath();
    for(let i=0;i<40;i++){const xx=IB.hsh(i,1,920)*480,yy=(IB.hsh(i,2,921)*336+performance.now()*0.25*(wx==='hail'?1.6:1))%336;
      g.moveTo(xx,yy);g.lineTo(xx-2,yy+8);}g.stroke();}
  if(wx==='snow'||wx==='blizzard'){g.fillStyle='rgba(240,248,255,0.8)';
    for(let i=0;i<60;i++){const xx=(IB.hsh(i,1,922)*480+performance.now()*0.02)%480,yy=(IB.hsh(i,2,923)*336+performance.now()*0.05)%336;
      g.fillRect(xx,yy,2,2);}}
  if(wx==='fog'){g.fillStyle='rgba(180,195,210,0.35)';g.fillRect(0,0,480,336);}
  /* ---------- ХМАРИ ПЕРЕД КАМЕРОЮ (паралакс) ---------- */
  for(let i=0;i<4;i++){
    const cx=((i*170+T*17)%640)-80,cy=246+IB.hsh(i,8,947)*44;
    IB._ascCloud(g,cx,cy,1.25,0.42);
  }
  /* золота година + темрява */
  if(gh>0.2&&nf<0.5){g.fillStyle='rgba(248,180,90,'+(gh*0.13)+')';g.fillRect(0,0,480,336);}
  if(nf>0.1){g.fillStyle='rgba(10,16,30,'+(nf*0.45)+')';g.fillRect(0,0,480,336);}
  /* ---------- HUD СХОДЖЕННЯ ---------- */
  g.fillStyle='rgba(6,12,10,0.78)';g.fillRect(6,6,468,34);
  g.font='9px monospace';g.fillStyle='#f0d050';g.fillText(r.name,12,20);
  g.fillStyle='#c8d8cc';g.font='7px monospace';
  g.fillText('ЗРАЗУ: '+r.from+' • СКЛАДНІСТЬ '+r.diff+' • '+r.hours+' ГОД',12,33);
  /* стадія */
  g.fillStyle='rgba(6,12,10,0.78)';g.fillRect(6,44,468,16);
  g.font='8px monospace';g.fillStyle='#7ccc8e';
  g.fillText('ЕТАП '+(st+1)+'/'+stages.length+': '+stages[st],12,56);
  /* бар прогресу */
  g.fillStyle='#1a241c';g.fillRect(6,64,468,10);
  g.fillStyle='#5cb878';g.fillRect(6,64,468*C.prog/100,10);
  g.font='7px monospace';g.fillStyle='#e8f0e8';
  g.fillText('ВИСОТА: '+IB.M.round((r.alt||600)*C.prog/100+((r.alt||600)>800?380:120))+' М',12,72);
  /* статус групи компактно */
  g.font='7px monospace';
  let sx=12;
  for(const h of IB.E.team){
    g.fillStyle=h.def&&h.def.nameColor?h.def.nameColor:'#c8d8cc';
    g.fillText(h.name+' '+IB.M.round(h.hp)+'%',sx,88);sx+=72;
  }
  /* підказка */
  g.fillStyle='rgba(6,12,10,0.78)';g.fillRect(120,306,240,22);
  g.font='9px monospace';g.fillStyle='#f0d050';
  g.fillText('E / КЛІК — КРОК УГОРУ • ESC — НАЗАД',130,320);
};
/* експедиція: ізо-траса, ван трясеться, стовпи, пил, пляж Світязя */
IB._ascExpedition=(g,C,st,T,nf)=>{
  /* земля: поля → залісіння → пісок і море */
  if(st>=3){
    g.fillStyle=nf>0.5?'#2a2418':'#c8b888';g.fillRect(0,150,480,186);
    g.fillStyle='#28565f';g.fillRect(0,296,480,40);
    g.fillStyle='rgba(170,225,240,0.5)';
    for(let i=0;i<8;i++)g.fillRect((i*61+T*12)%480,302+i%4*8,16,1.5);
    for(let i=0;i<6;i++)IB._ascPine(g,24+i*86,158+IB.hsh(i,5,962)*12,0.8+IB.hsh(i,6,963)*0.5,'#1e4228');
  }else{
    g.fillStyle=nf>0.5?'#16281a':(st>=2?'#2e5230':'#3a5a30');g.fillRect(0,150,480,186);
    for(let i=0;i<(st>=2?14:9);i++){
      const px=14+i*36+IB.hsh(i,5,960)*14,py=158+IB.hsh(i,6,961)*26;
      IB._ascPine(g,px,py,0.8+IB.hsh(i,7,961)*0.7);
    }
  }
  /* ізо-траса */
  IB.PA(g,[[0,224],[480,212],[480,252],[0,264]],'#5e4a30');
  IB.PA(g,[[0,230],[480,218],[480,226],[0,238]],'#6e5a3a');
  g.strokeStyle='#c8b888';g.lineWidth=2;g.setLineDash([10,12]);
  g.beginPath();g.moveTo(0,250);g.lineTo(480,238);g.stroke();g.setLineDash([]);
  /* стовпи з провісами */
  g.strokeStyle='#3a2c18';g.lineWidth=2;
  for(let i=0;i<6;i++){
    const px=44+i*88,py=196+IB.hsh(i,9,964)*4;
    IB.P(g,px-1,py-26,2,26,'#3a2c18');IB.P(g,px-6,py-24,12,2,'#3a2c18');
  }
  g.strokeStyle='rgba(40,40,40,0.4)';g.lineWidth=1;g.beginPath();
  for(let i=0;i<5;i++){
    const x1=44+i*88,x2=44+(i+1)*88,y1=172+IB.hsh(i,9,964)*4,y2=172+IB.hsh(i+1,9,964)*4;
    g.moveTo(x1,y1);g.quadraticCurveTo((x1+x2)/2,IB.M.min(y1,y2)-12,x2,y2);
  }
  g.stroke();
  /* БІЛИЙ ВАН — трясеться на волинських вибоїнах */
  const vx=IB.lerp(24,418,C.prog/100),bob=IB.M.sin(T*11)*1.3,vy=198+bob;
  IB.isoBox(g,vx,vy,56,24,14,'#eceae2','#b8b8b0','#d0cec6');
  IB.P(g,vx+6,vy+16,44,10,'#c8c4ba');
  IB.P(g,vx+8,vy+17,11,7,'#2a3e5c');IB.P(g,vx+23,vy+17,10,7,'#8ac4d8');IB.P(g,vx+36,vy+17,10,7,'#8ac4d8');
  IB.P(g,vx+9,vy+35,11,6,'#1a1a1a');IB.P(g,vx+36,vy+35,11,6,'#1a1a1a');
  /* пил з-під коліс */
  for(let i=0;i<3;i++){
    g.fillStyle='rgba(180,160,120,'+(0.3-i*0.09)+')';
    g.beginPath();g.ellipse(vx-12-i*13,236-i*4,7-i*2,4-i,0,0,7);g.fill();
  }
  /* бризки на пляжі */
  if(st>=3)for(let i=0;i<4;i++){
    g.fillStyle='rgba(220,245,250,0.5)';
    g.beginPath();g.ellipse(60+i*120,298+IB.M.sin(T*4+i)*3,5,2,0,0,7);g.fill();
  }
};

/* ==================== v1.2: ІНТЕР'ЄРИ ==================== *//* ==================== v1.2: ІНТЕР'ЄРИ ==================== */
IB.INT_CUR=null;
IB.INT_DEFS={
  house:{w:11,h:7,title:'ХАТА',owner:'ГОСПОДАР',
    items:[{k:'pech',x:2,y:1,label:'ПІЧ'},{k:'table',x:6,y:2,label:'СТІЛ'},{k:'host',x:8,y:4,label:'ГОСПОДАР'},{k:'bed',x:3,y:4,label:'ЛИЖКО'}]},
  church:{w:13,h:8,title:'ЦЕРКВА',owner:'ОТЕЦЬ ПАВЛО',
    items:[{k:'pray',x:5,y:1,label:'СВІЧКИ'},{k:'icons',x:9,y:1,label:'ІКОНОСТАС'},{k:'priest',x:7,y:4,label:'ОТЕЦЬ ПАВЛО'}]},
  shop:{w:12,h:7,title:'КРАМНИЦЯ',owner:'ПРОДАВЧИНЯ',
    items:[{k:'counter',x:5,y:2,label:'ПРИЛАВОК — ТОРГ'},{k:'host',x:8,y:4,label:'ПРОДАВЧИНЯ'},{k:'shelf',x:2,y:1,label:'ПОЛИЦІ'}]},
  bar:{w:13,h:8,title:'КОРЧМА',owner:'БАРМЕН',
    items:[{k:'barkeep',x:6,y:1,label:'БАРНА СТІЙКА'},{k:'table',x:3,y:4,label:'СТОЛИК'},{k:'guitar',x:10,y:3,label:'БАНДУРА'},{k:'host',x:8,y:5,label:'ГУЦУЛИ'}]},
  forge:{w:12,h:7,title:'КОВАЛЬНЯ',owner:'КОВАЛЬ',
    items:[{k:'anvil',x:5,y:2,label:'ГІРН — ТОРГ'},{k:'host',x:8,y:4,label:'КОВАЛЬ'},{k:'fire',x:2,y:1,label:'ГОРН'}]},
  farm:{w:12,h:7,title:'САДИБА',owner:'ГОСПОДИНЯ',
    items:[{k:'farmw',x:6,y:2,label:'ГОСПОДИНЯ — ТОРГ'},{k:'pech',x:2,y:1,label:'ПІЧ'},{k:'table',x:9,y:4,label:'СТІЛ'}]},
  border:{w:9,h:6,title:'ПРИКОРДОННИЙ КПП',owner:'ПОГРАНИЧНИК',
    items:[{k:'guard',x:4,y:2,label:'ПОГРАНИЧНИК'},{k:'stella',x:7,y:3,label:'СТЕЛА — ФОТО'}]},
  /* v1.4: старі хати-курени і сільські ларьки — нові типи з активами v5 */
  hut:{w:9,h:6,title:'КУРІНЬ',
    items:[{k:'pech',x:2,y:1,label:'ПІЧ'},{k:'table',x:5,y:2,label:'СТІЛ'},{k:'bed',x:7,y:4,label:'ЛИЖКО'}]},
  kiosk:{w:7,h:5,title:'СІЛЬСЬКИЙ ЛАРЬОК',owner:'ПРОДАВЧИНЯ',
    items:[{k:'counter',x:3,y:2,label:'ПРИЛАВОК — ТОРГ'},{k:'host',x:5,y:3,label:'ПРОДАВЧИНЯ'},{k:'shelf',x:1,y:1,label:'ПОЛИЦІ'}]},
};
IB.drawInterior=(g,dt)=>{
  const C=IB.INT_CUR;if(!C)return;
  const D=C.def,P=IB.PAL;
  const rw=D.w,rh=D.h;
  const OX=240-(rw-rh)*8,OY=64;
  g.fillStyle='#0b0d0b';g.fillRect(0,0,480,336);
  /* світно з вікна */
  const nf=IB.nightFactor();
  const wl=IB.G.wx.type;
  g.fillStyle=nf>0.5?'#0a1226':(wl==='rain'||wl==='blizzard'||wl==='snow'?'#4a5866':'#8ab2cc');
  g.fillRect(0,0,480,336);
  if(nf<=0.5&&wl==='sun'){g.fillStyle='#f8e8a0';g.beginPath();g.arc(400,60,14,0,7);g.fill();}
  /* підлога */
  for(let ty=0;ty<rh;ty++)for(let tx=0;tx<rw;tx++){
    const sx=(tx-ty)*16+OX,sy=(tx+ty)*8+OY;
    const v=IB.hsh(tx,ty,60);
    IB.rhomb(g,sx,sy,32,16,v>0.85?'#8a6a42':(v>0.5?'#7a5e38':'#6e5230'));
  }
  /* стіни: північно-східна і північно-західна грані */
  for(let i=0;i<rw;i++){
    const sx=(i-0)*16+OX,sy=i*8+OY;
    IB.PA(g,[[sx,sy+8],[sx+16,sy],[sx+32,sy+8],[sx+32,sy+30],[sx+16,sy+22],[sx,sy+30]],'#4e3a20');
    IB.P(g,sx+4,sy+9,24,2,'#5e4628');
  }
  for(let i=0;i<rh;i++){
    const sx=(0-i)*16+OX-32+16,sy=i*8+OY;
    IB.PA(g,[[sx,sy+8],[sx+16,sy],[sx+32,sy+8],[sx+32,sy+30],[sx+16,sy+22],[sx,sy+30]],'#443218');
  }
  /* вікно на пн-східній стіні */
  {
    const wi=IB.M.floor(rw/2);
    const sx=(wi)*16+OX,sy=wi*8+OY;
    IB.P(g,sx+6,sy+4,14,12,'#2a3e5c');
    g.fillStyle=nf>0.5?'#0a1226':(wl==='sun'?'#a8d0e8':'#5a6a78');
    g.fillRect(sx+7,sy+5,12,10);
    if(wl==='sun'&&nf<=0.5){g.fillStyle='#f8e8a0';g.fillRect(sx+9,sy+7,3,3);}
    IB.P(g,sx+12,sy+5,2,10,'#5e4628');IB.P(g,sx+7,sy+9,12,2,'#5e4628');
  }
  /* меблі/об'єкти */
  for(const it of D.items){
    const sx=(it.x-it.y)*16+OX,sy=(it.x+it.y)*8+OY;
    const hl=(C.hi===it);
    if(it.k==='pech'){IB.isoBox(g,sx-14,sy,30,22,16,'#d8d0c8','#c8bcb0','#b8a898');
      IB.O(g,sx+1,sy+2,7,4,'#2a2a2a');
      const fl=IB.M.sin(performance.now()*0.008)>0;
      IB.P(g,sx-2,sy+2,4,fl?3:2,'#e07038');}
    else if(it.k==='table'||it.k==='counter'){IB.isoBox(g,sx-12,sy,26,16,8,'#8a6a42','#6e5230','#5e4628');
      IB.P(g,sx-4,sy-2,8,3,'#e8d8b8');}
    else if(it.k==='bed'){IB.isoBox(g,sx-12,sy,26,14,6,'#c8b088','#b09868','#9a8058');}
    else if(it.k==='shelf'){IB.isoBox(g,sx-10,sy,22,12,12,'#7a5e38','#6e5230','#5e4628');
      IB.P(g,sx-6,sy-8,14,3,'#c8a028');IB.P(g,sx-4,sy-3,10,3,'#3a62b8');}
    else if(it.k==='barkeep'||it.k==='anvil'){IB.isoBox(g,sx-14,sy,30,18,10,'#5a4630','#4e3a26','#443218');
      if(it.k==='anvil'){IB.P(g,sx-6,sy-14,14,6,'#3e4440');IB.P(g,sx-2,sy-8,4,6,'#2e3230');}}
    else if(it.k==='pray'){IB.P(g,sx-2,sy-12,3,10,'#f0e8d0');IB.P(g,sx-5,sy-8,3,7,'#f0e8d0');IB.P(g,sx+2,sy-9,3,6,'#f0e8d0');
      const fl=IB.M.sin(performance.now()*0.01)*0.5+0.5;
      g.fillStyle='rgba(240,180,60,'+(0.25+fl*0.2)+')';g.beginPath();g.arc(sx,sy-4,14,0,7);g.fill();}
    else if(it.k==='icons'){IB.isoBox(g,sx-14,sy,30,8,18,'#d8c898','#c8b888','#b8a878');
      IB.P(g,sx-8,sy-14,18,10,'#c8a028');IB.P(g,sx-4,sy-11,10,4,'#b82840');}
    else if(it.k==='guitar'){IB.P(g,sx-2,sy-10,3,14,'#8a6038');IB.O(g,sx-1,sy-14,6,7,'#c8a050');
      IB.P(g,sx-6,sy-16,10,4,'#5e4628');}
    else if(it.k==='stella'){IB.P(g,sx-6,sy-22,12,20,'#e8e8e2');IB.P(g,sx-5,sy-20,10,4,'#b82840');
      IB.P(g,sx-5,sy-14,10,2,'#2a3e5c');}
    else if(it.k==='guard'){IB.drawPerson(g,sx,sy-6,'d',0,{skin:'#e0a878',hair:'#241a10',hat:'cap',hatc:'#3a5a3a',jacket:'#3a5a3a',pants:'#2e3a2e'});}
    else if(it.k==='host'||it.k==='priest'||it.k==='farmw'){
      IB.drawPerson(g,sx,sy-6,'d',0,IB.lookBySeed(it.x*7+it.y));}
    if(hl&&it.k!=='host'){g.strokeStyle='#f0d050';g.lineWidth=1;g.strokeRect(sx-16,sy-16,34,22);}
  }
  /* група */
  const leader=C.hero;
  IB.drawPerson(g,(leader.x-leader.y)*16+OX,(leader.x+leader.y)*8+OY-4,leader.dir,leader.fr,IB.E.team[0].look);
  for(let i=1;i<IB.E.team.length;i++){
    const h=IB.E.team[i];
    const mx=IB.clamp(C.entry.x-1-(i-1)*0.8,0.6,rw-1.6),my=IB.clamp(C.entry.y+0.3+(i%2)*0.5,0.6,rh-1);
    IB.drawPerson(g,(mx-my)*16+OX,(mx+my)*8+OY-4,h.dir||'d',0,h.look);
  }
  /* v2.4c.1: маркер виходу ПОВЕРХ групи — двері, килимок, сяйво, жовта
     стрілка, що підстрибує, з обводкою і підписом «E — ВИХІД» */
  {
    const ex=(C.entry.x-C.entry.y)*16+OX,ey=(C.entry.x+C.entry.y)*8+OY;
    const bob=IB.M.round(IB.M.sin(performance.now()*0.005)*2.5);
    g.fillStyle='rgba(240,200,120,0.12)';g.beginPath();g.arc(ex,ey-4,22,0,7);g.fill();
    IB.rhomb(g,ex,ey+2,28,14,'#5e4628');
    IB.rhomb(g,ex,ey+2,18,9,'#8a6a42');
    IB.P(g,ex-9,ey-24,18,22,'#241a0e');
    IB.P(g,ex-6,ey-22,12,18,'#4a3a22');
    IB.P(g,ex+2,ey-15,2,3,'#c8a028');
    g.fillStyle='#f0d050';g.strokeStyle='#241a0e';g.lineWidth=1;
    g.beginPath();g.moveTo(ex,ey-37+bob);g.lineTo(ex-6,ey-30+bob);g.lineTo(ex+6,ey-30+bob);g.closePath();g.fill();g.stroke();
    g.font='bold 9px monospace';
    g.fillStyle='#241a0e';g.fillText('E — ВИХІД',ex-20,ey-45+bob);
    g.fillStyle='#f0d050';g.fillText('E — ВИХІД',ex-21,ey-46+bob);
  }
  /* затемнення від стін + тепле світло */
  g.fillStyle='rgba(40,24,10,0.10)';g.fillRect(0,0,480,336);
  /* назва + підказка */
  g.fillStyle='rgba(6,12,10,0.82)';g.fillRect(6,6,468,18);
  g.font='9px monospace';g.fillStyle='#f0d050';g.fillText(D.title+' • '+(C.b.name||''),12,19);
  const it2=C.hi;
  g.fillStyle='rgba(6,12,10,0.82)';g.fillRect(110,306,260,22);
  g.font='9px monospace';g.fillStyle='#f0d050';
  g.fillText(it2?('[E] '+it2.label):(C.nearExit?'[E] ВИХІД — НА ВУЛИЦЮ • ESC — ВИЙТИ':'РУХ — WASD • E — ДО ОБ\'ЄКТІВ • ESC — ВИЙТИ'),122,320);
};

/* ==================== v1.2: ФОТО-ПОЛАРОЇДИ ==================== */
/* ==================== v2.4 «ФІНАЛ»: ФОТО-ПОЛАРОЇДИ — СЕРІЇ З 3 КАДРІВ ====================
   Кожен спуск затвора — три полароїди з різними позами групи:
   КАДР 1 «УСІ РАЗОМ», КАДР 2 «СТРИБОК!» (іскри), КАДР 3 «ПРАПОРЕЦЬ»
   (Легінь тримає прапор, теплий фільтр). У кадрі — ізо-піраміда вершини
   зі сніжною шапкою і прапорцем, хмари, птахи, смереки по кутах,
   передній план, віньєтка, зерно плівки і помаранчевий штамп часу. */
IB.PHOTO_VARS=['УСІ РАЗОМ','СТРИБОК!','ПРАПОРЕЦЬ'];
IB.renderPhoto=(g,entry,X,Y,W,H,small)=>{
  const seed=entry.seed||1;
  /* рамка полароїда */
  g.fillStyle='#f4f0e6';g.fillRect(X-3,Y-3,W+6,H+6+(small?0:14));
  const wx=entry.wx||'sun';
  /* небо за погодою */
  const sky=g.createLinearGradient(0,Y,0,Y+H);
  if(wx==='sun'){sky.addColorStop(0,'#28598c');sky.addColorStop(1,'#a8c4d8');}
  else if(wx==='snow'||wx==='blizzard'){sky.addColorStop(0,'#8aa4b8');sky.addColorStop(1,'#d8e4ee');}
  else if(wx==='rain'){sky.addColorStop(0,'#4a5866');sky.addColorStop(1,'#8a9aa8');}
  else {sky.addColorStop(0,'#5a6a7c');sky.addColorStop(1,'#b8c4cc');}
  g.fillStyle=sky;g.fillRect(X,Y,W,H);
  /* сонце з ореолом */
  if(wx==='sun'){
    g.fillStyle='rgba(248,232,160,0.25)';g.beginPath();g.arc(X+W-14,Y+11,11,0,7);g.fill();
    g.fillStyle='#f8e8a0';g.beginPath();g.arc(X+W-14,Y+11,6,0,7);g.fill();
  }
  /* хмари у кадрі */
  for(let i=0;i<(small?3:4);i++){
    const cx=X+W*0.1+IB.hsh(i,seed,710)*W*0.78,cy=Y+H*(0.12+IB.hsh(i,1,711)*0.2);
    g.fillStyle='rgba(240,246,252,0.72)';
    g.beginPath();g.ellipse(cx,cy,W*0.15,H*0.05,0,0,7);g.fill();
    g.beginPath();g.ellipse(cx+W*0.1,cy-H*0.03,W*0.09,H*0.04,0,0,7);g.fill();
  }
  /* птахи */
  g.strokeStyle='rgba(30,40,50,0.5)';g.lineWidth=1;
  for(let i=0;i<2;i++){
    const bx=X+W*(0.18+i*0.3),by=Y+H*(0.18+IB.hsh(i,seed,712)*0.15);
    g.beginPath();g.moveTo(bx-3,by);g.lineTo(bx,by-2);g.lineTo(bx+3,by);g.stroke();
  }
  /* хребти за seed */
  for(let i=0;i<3;i++){
    g.fillStyle=['#31506b','#3f6a72','#547c60'][i];
    g.beginPath();g.moveTo(X,Y+H);
    for(let px=0;px<=W;px+=8){
      const v=IB.hsh(seed*100+(px/8|0),i,700+i);
      g.lineTo(X+px,Y+H*0.42+i*H*0.17-v*H*0.22);
    }
    g.lineTo(X+W,Y+H);g.fill();
  }
  /* сюжети за типом точки */
  if(entry.kind==='peak'){
    /* ізо-піраміда вершини зі сніжною шапкою і прапорцем */
    const pkx=X+W*0.5,pky=Y+H*0.28;
    IB.PA(g,[[pkx-22,Y+H*0.72],[pkx,pky],[pkx+22,Y+H*0.72]],'#88928c');
    IB.PA(g,[[pkx-22,Y+H*0.72],[pkx,pky],[pkx,Y+H*0.72]],'#6e7872');
    IB.PA(g,[[pkx,pky],[pkx-8,pky+10],[pkx+8,pky+10]],'#f0f6f8');
    IB.P(g,pkx-1,pky-9,2,11,'#3a3a3a');
    IB.PA(g,[[pkx+1,pky-9],[pkx+11,pky-6],[pkx+1,pky-3]],'#c83828');
  }else if(entry.kind==='lake'||entry.kind==='shatsk'){
    g.fillStyle='#28565f';g.fillRect(X,Y+H*0.62,W,H*0.38);
    g.fillStyle='rgba(160,220,235,0.4)';
    for(let i=0;i<6;i++)g.fillRect(X+4+IB.hsh(i,seed,705)*(W-16),Y+H*0.64+i*3,10,1);
    if(entry.kind==='shatsk'){g.fillStyle='#c8b888';g.fillRect(X,Y+H-6,W,6);g.fillStyle='#2e5230';
      IB.PA(g,[[X+10,Y+H-6],[X+14,Y+H-20],[X+18,Y+H-6]],'#2e5230');IB.PA(g,[[X+W-20,Y+H-6],[X+W-16,Y+H-18],[X+W-12,Y+H-6]],'#2e5230');}
  }else if(entry.kind==='border'){
    IB.P(g,X+W/2-7,Y+H*0.3,14,H*0.5,'#e8e8e2');
    IB.P(g,X+W/2-6,Y+H*0.34,12,4,'#b82840');
    IB.P(g,X+W/2-6,Y+H*0.5,12,3,'#2a3e5c');
  }else if(entry.kind==='rocks'){
    for(let i=0;i<4;i++)IB.isoBox(g,X+10+i*22,Y+H*0.55,20,10,10+IB.hsh(i,seed,708)*8,'#5e6a62','#4e5a54','#6e7872');
  }else if(entry.kind==='ruin'){
    IB.isoBox(g,X+W/2-18,Y+H*0.5,36,16,8,'#5e6a62','#4e5a54','#6e7872');
    IB.P(g,X+W/2-12,Y+H*0.5-8,6,8,'#5e6a62');
  }
  /* смереки по кутах кадру */
  const pnc=small?'#16321e':'#1e4228';
  for(let i=0;i<3;i++){
    const by=Y+H-1;
    IB.PA(g,[[X+6+i*7,by-10],[X+3+i*7,by],[X+9+i*7,by]],pnc);
    IB.PA(g,[[X+W-6-i*7,by-12],[X+W-9.5-i*7,by],[X+W-2.5-i*7,by]],pnc);
  }
  /* передній план — сніг або трава з квітами */
  g.fillStyle=entry.kind==='peak'?'#dce8f0':'#2e5230';
  g.fillRect(X,Y+H-5,W,5);
  g.fillStyle=entry.kind==='peak'?'#f0f6f8':'#3a5a30';
  g.fillRect(X,Y+H-4,W,3);
  for(let i=0;i<8;i++){
    g.fillStyle=entry.kind==='peak'?'#c8d8e4':['#f0d050','#e86a8a','#9a70d0'][i%3];
    g.fillRect(X+4+IB.hsh(i,seed,713)*(W-8),Y+H-4.5,1.5,1.5);
  }
  /* ГРУПА — 5 постатей, пози залежать від кадру */
  const vr=entry.var||0;
  for(let i=0;i<5;i++){
    const px=X+W*0.5+(i-2)*W*0.115;
    let py=Y+H*0.88,fr=0,dir='d';
    if(vr===1){py-=4+(i&1)*3;fr=1;if(i&1)dir='l';}
    if(vr===2&&i>0){fr=2;if(i&1)dir='r';}
    const look=IB.HERO_DEFS[i]?IB.HERO_DEFS[i].look:null;
    IB.drawPerson(g,px,py,dir,fr,look||{skin:'#e0a878',hair:'#241a10',jacket:'#5a6a3a',pants:'#3a4030'},small?0.62:0.82);
  }
  /* КАДР 3: Легінь тримає прапор */
  if(vr===2&&!small){
    const fx=X+W*0.5+W*0.33;
    IB.P(g,fx,Y+H*0.6,2,H*0.28,'#5e4628');
    IB.PA(g,[[fx+2,Y+H*0.6],[fx+13,Y+H*0.65],[fx+2,Y+H*0.7]],'#c83828');
  }
  /* КАДР 2: іскри над стрибком */
  if(vr===1){
    g.font='7px monospace';g.fillStyle='#f8e8a0';
    for(let i=0;i<5;i++)g.fillText('✦',X+W*0.12+IB.hsh(i,seed,716)*W*0.76,Y+H*0.34+IB.hsh(i,2,717)*H*0.22);
  }
  /* фільтри настрою кадру */
  if(vr===1){g.fillStyle='rgba(110,170,255,0.10)';g.fillRect(X,Y,W,H);}
  if(vr===2){g.fillStyle='rgba(248,180,90,0.13)';g.fillRect(X,Y,W,H);}
  /* віньєтка + зерно плівки */
  const vg=g.createRadialGradient(X+W/2,Y+H*0.45,W*0.3,X+W/2,Y+H*0.5,W*0.75);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.28)');
  g.fillStyle=vg;g.fillRect(X,Y,W,H);
  for(let i=0;i<24;i++){
    g.fillStyle=IB.hsh(i,seed,718)<0.5?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
    g.fillRect(X+IB.hsh(i,1,719)*W,Y+IB.hsh(i,2,719)*H,1.4,1.4);
  }
  /* штамп часу як на плівці */
  if(!small){
    g.fillStyle='rgba(248,150,60,0.85)';g.font='6px monospace';
    g.fillText('Д'+entry.day+' • '+entry.time,X+W-44,Y+12);
  }
  /* підпис */
  if(!small){
    g.fillStyle='#1a1a1a';g.font='7px monospace';g.textAlign='center';
    g.fillText(entry.name,X+W/2,Y+H+11);
    g.fillStyle='#5a5a5a';
    g.fillText('ДЕНЬ '+entry.day+' • '+entry.time+(entry.alt?' • '+entry.alt+' М':''),X+W/2,Y+H+19);
    if(entry.var!==undefined){
      g.fillStyle='#c83828';
      g.fillText('КАДР '+(entry.var+1)+'/3 — '+IB.PHOTO_VARS[entry.var],X+W/2,Y+H+26);
    }
    g.textAlign='left';
  }
};
IB.drawAlbumPhotoSmall=IB.drawAlbumPhotoSmall=(cv,entry)=>{
  const g=cv.getContext('2d');
  g.imageSmoothingEnabled=false;
  g.clearRect(0,0,cv.width,cv.height);
  IB.renderPhoto(g,entry,0,0,cv.width,cv.height-6,true);
  g.fillStyle='#1a1a1a';g.font='6px monospace';g.textAlign='center';
  g.fillText(entry.name,cv.width/2,cv.height-1);
  g.textAlign='left';
};

/* ==================== v1.2: ВЕЛИКА КАРТА v2 (зверху базової) ==================== */
IB.drawBigMap=(canvas)=>{
  IB.drawBigMapBase(canvas);
  const g=canvas.getContext('2d');
  const sc=canvas.width/IB.W.W,scY=canvas.height/IB.W.H;
  const X=v=>v*sc,Y=v=>v*scY;
  /* хребти підписи */
  g.font='8px monospace';g.fillStyle='rgba(240,240,220,0.5)';
  g.fillText('Ч О Р Н О Г О Р А',X(78),Y(14));
  g.fillText('Ґ О Р Ґ А Н И',X(92),Y(60));
  g.fillText('СВИДОВЕЦЬ',X(142),Y(66));
  g.fillText('М А Р М А Р О С Ь К І  А Л Ь П И',X(158),Y(172));
  g.font='7px monospace';g.fillStyle='rgba(180,200,230,0.6)';
  g.fillText('р.ЧЕРЕМОШ',X(26),Y(146));
  g.fillText('р.ЧЕРЕМОШ',X(120),Y(134));
  g.fillText('р.ПРУТ',X(110),Y(62));
  g.fillText('р.БИСТРИЦЯ',X(36),Y(76));
  /* кордони */
  g.strokeStyle='#d84a4a';g.lineWidth=2;g.setLineDash([6,4]);
  g.beginPath();g.moveTo(X(0),Y(213));g.lineTo(X(239),Y(213));g.stroke();
  g.beginPath();g.moveTo(X(237),Y(88));g.lineTo(X(237),Y(212));g.stroke();
  g.setLineDash([]);
  g.font='8px monospace';g.fillStyle='#e8a0a0';
  g.fillText('К О Р Д О Н   З   Р У М У Н І Є Ю',X(56),Y(217.5));
  g.fillText('КОРДОН',X(238.5),Y(120));g.fillText('МОЛДОВА',X(238.5),Y(130));
  /* маршрути-мандрівки */
  const campAt=n=>IB.W.CAMPS.find(c=>c.name===n);
  const vilAt=n=>IB.W.VILLAGES.find(v=>v.name===n);
  for(const r of IB.W.ROUTES){
    if(r.kind==='expedition')continue;
    const f=campAt(r.from)||vilAt(r.from);
    if(!f)continue;
    const fx=(f.x+(f.w?f.w/2:0)),fy=(f.y+(f.h?f.h/2:0));
    g.strokeStyle='rgba(240,208,80,0.55)';g.lineWidth=1;g.setLineDash([3,3]);
    g.beginPath();g.moveTo(X(fx),Y(fy));g.lineTo(X(r.x),Y(r.y));g.stroke();
    g.setLineDash([]);
    g.fillStyle='#f0d050';
    IB.PA(g,[[X(r.x),Y(r.y)-6],[X(r.x)-4,Y(r.y)+2],[X(r.x)+4,Y(r.y)+2]],'#f0d050');
  }
  /* v2.1: похідні табори — жовті намети на карті */
  for(const c of (IB.G.wildCamps||[])){
    IB.PA(g,[[X(c.x),Y(c.y)-6],[X(c.x)-4.5,Y(c.y)+3],[X(c.x)+4.5,Y(c.y)+3]],'#ff8c38');
    g.strokeStyle='#1a1208';g.lineWidth=1;
    g.beginPath();g.moveTo(X(c.x),Y(c.y)-6);g.lineTo(X(c.x)-4.5,Y(c.y)+3);g.lineTo(X(c.x)+4.5,Y(c.y)+3);g.closePath();g.stroke();
    g.fillStyle='#1a1208';g.fillRect(X(c.x)-1,Y(c.y)-1,2,2);
  }
  /* інсет ШАЦЬКІ ОЗЕРА */
  const IX=4,IY=4,IW=88,IH=56;
  g.fillStyle='rgba(8,14,12,0.85)';g.fillRect(IX,IY,IW,IH);
  g.strokeStyle='#5cb878';g.lineWidth=1;g.strokeRect(IX,IY,IW,IH);
  g.fillStyle='#28598c';g.fillRect(IX+4,IY+8,IW-8,26);
  g.fillStyle='#7ab2d8';g.beginPath();g.ellipse(IX+IW/2,IY+22,IW/2-10,10,0,0,7);g.fill();
  g.fillStyle='#c8b888';g.fillRect(IX+4,IY+34,IW-8,10);
  g.fillStyle='#2e5230';IB.PA(g,[[IX+12,IY+34],[IX+17,IY+20],[IX+22,IY+34]],'#2e5230');
  IB.PA(g,[[IX+IW-24,IY+34],[IX+IW-18,IY+18],[IX+IW-12,IY+34]],'#2e5230');
  g.fillStyle='#f0d050';g.font='7px monospace';
  g.fillText('ШАЦЬКІ ОЗЕРА',IX+10,IY+50);
  g.fillText('СВІТЯЗЬ • 6429 га',IX+12,IY+7);
  g.fillStyle='#e8e8e2';g.fillText('клік = авто-експедиція',IX+8,IY+44);
  /* підпис групи на маршруті */
  if(IB.G.route){
    const L=IB.E.team[0];
    g.fillStyle='#e05a8a';g.font='7px monospace';
    g.fillText('→ маршрут',X(L.x)+4,Y(L.y)-4);
  }
  /* ---------- v1.4: ТУРИСТИЧНІ ШТАМПИ — пройдені маршрути ---------- */
  const stamps=IB.G.stamps||{};
  let nst=0;
  for(const r of IB.W.ROUTES){
    const st=stamps[r.id];if(!st)continue;
    nst++;
    const sx=X(r.x),sy=Y(r.y);
    const ang=(-0.22+IB.hsh(r.id.length,4,730)*0.3);
    g.save();g.translate(sx+12,sy-10);g.rotate(ang);
    /* «гумовий» штамп: подвійне кільце + галочка + день */
    g.strokeStyle='rgba(210,70,70,0.85)';g.lineWidth=1.6;
    g.beginPath();g.arc(0,0,9,0,7);g.stroke();
    g.strokeStyle='rgba(210,70,70,0.5)';g.lineWidth=1;
    g.beginPath();g.arc(0,0,6.5,0,7);g.stroke();
    g.fillStyle='rgba(210,70,70,0.9)';g.font='8px monospace';g.textAlign='center';
    g.fillText('✓',0,3);
    g.font='5px monospace';g.fillText('Д'+st.d,0,15);
    g.textAlign='left';
    g.restore();
  }
  /* лічильник штампів */
  g.font='8px monospace';g.textAlign='right';
  g.fillStyle='rgba(240,240,220,0.85)';
  g.fillText('ШТАМПИ: '+nst+'/'+IB.W.ROUTES.length+' ✉',canvas.width-6,canvas.height-6);
  g.textAlign='left';
};

/* ==================== v1.4: КІНО-МОМЕНТ НА ВЕРШИНІ ====================
   Пауза 2.6с: панорама хребтів (повільний дрейф), віньєтка + літербокс,
   заголовок «ВЕРШИНА!», полароїд опускається зверху і «зhangає» на мотузці. */
IB.SUMMIT=null;
IB.drawSummit=(g,dt)=>{
  const S=IB.SUMMIT;if(!S)return;
  /* t збільшується у головному циклі (loop) */
  const spot=S.spot,r=S.route;
  const wx=IB.G.wx.type;
  /* небо за погодою (з золотою годиною) */
  const gh=IB.goldenHour();
  const sky=g.createLinearGradient(0,0,0,336);
  if(wx==='sun'){sky.addColorStop(0,'#28598c');sky.addColorStop(1,'#a8c4d8');}
  else if(wx==='snow'||wx==='blizzard'){sky.addColorStop(0,'#8aa4b8');sky.addColorStop(1,'#d8e4ee');}
  else if(wx==='rain'||wx==='storm'){sky.addColorStop(0,'#3a4452');sky.addColorStop(1,'#7a8a98');}
  else {sky.addColorStop(0,'#5a6a7c');sky.addColorStop(1,'#b8c4cc');}
  g.fillStyle=sky;g.fillRect(0,0,480,336);
  /* сонце/місяць */
  const nf=IB.nightFactor();
  const cy=90+IB.M.sin(S.t*0.25)*4;
  g.fillStyle=nf>0.5?'#e8e8d8':(gh>0.4?'#f8c070':'#f8e8a0');
  g.beginPath();g.arc(392,cy,13,0,7);g.fill();
  if(nf<=0.5){g.fillStyle='rgba(248,232,160,0.18)';g.beginPath();g.arc(392,cy,22,0,7);g.fill();}
  /* хмари під ногами (над хмарами) для вершин */
  if(r.kind==='peak'){
    g.fillStyle='rgba(235,240,246,0.5)';
    for(let i=0;i<6;i++){
      const cx=((i*97+S.t*9)%560)-40, cyy=250+Math.sin(i*2.1)*24;
      g.beginPath();g.ellipse(cx,cyy,52,10,0,0,7);g.fill();
      g.beginPath();g.ellipse(cx+18,cyy-6,30,8,0,0,7);g.fill();
    }
  }
  /* панорама хребтів — 4 шари, повільний дрейф у протилежні боки */
  const drift=(i)=>Math.sin(S.t*0.14+i*1.7)*10*(i%2?1:-1);
  const rcols=nf>0.5?['#0c1626','#101e30','#16283e','#1e3450']
                     :(gh>0.4?['#5a3a50','#6a4a58','#7a5a60','#8a6a68']
                             :['#22405c','#2a5068','#32606c','#3e7272']);
  for(let i=0;i<4;i++){
    g.fillStyle=rcols[i];
    g.beginPath();g.moveTo(0,336);
    for(let x=0;x<=480;x+=12){
      const p=IB.hsh(i*100+(x/12|0),3,930+i);
      const base=120+i*44-S.t*3*(0.4+i*0.2);
      g.lineTo(x+drift(i),base-p*46);
    }
    g.lineTo(480,336);g.fill();
  }
  /* група на піку по центру з прапорцем */
  const px0=228,py0=206;
  for(let i=0;i<5;i++){
    const look=IB.HERO_DEFS[i]?IB.HERO_DEFS[i].look:null;
    IB.drawPerson(g,px0-24+i*12,py0+(i%2?2:0),'u',0,look||{skin:'#e0a878',hair:'#241a10',jacket:'#5a6a3a',pants:'#3a4030'},0.8);
  }
  IB.P(g,px0+30,py0-22,2,16,'#d8d8cc');
  const fw=IB.M.sin(S.t*3)*2;
  IB.PA(g,[[px0+32,py0-22],[px0+40+fw,py0-19],[px0+32,py0-15]],'#c83828');
  /* птахи */
  for(let i=0;i<3;i++){
    const bx=(S.t*26+i*120)%540-30,by=80+i*22+Math.sin(S.t*2+i)*5;
    g.strokeStyle='rgba(30,40,50,0.55)';g.lineWidth=1.4;
    const w2=Math.sin(S.t*7+i*2)*3;
    g.beginPath();g.moveTo(bx-5,by+w2);g.lineTo(bx,by);g.lineTo(bx+5,by+w2);g.stroke();
  }
  /* літербокс (кінотеатр) */
  g.fillStyle='#050805';g.fillRect(0,0,480,30);g.fillRect(0,306,480,30);
  /* віньєтка */
  const vg=g.createRadialGradient(240,168,120,240,168,340);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.55)');
  g.fillStyle=vg;g.fillRect(0,0,480,336);
  /* заголовок */
  const a1=IB.M.min(1,S.t/0.5)*(S.t>2.1?IB.M.max(0,1-(S.t-2.1)/0.4):1);
  g.globalAlpha=a1;
  g.font='14px monospace';g.textAlign='center';
  g.fillStyle='#f8e8a0';
  g.fillText('✦ '+spot.name+' ✦',240,64);
  g.font='8px monospace';g.fillStyle='#e8f0e8';
  g.fillText((spot.alt?('ВИСОТА '+spot.alt+' М • '):'')+'ДЕНЬ '+IB.G.day+' • '+IB.clockStr(),240,78);
  g.globalAlpha=1;g.textAlign='left';
  /* полароїд: опускається зверху (0.4–1.1с), потім гойдається на «мотузці» */
  const ease=S.t<0.4?0:(S.t<1.1?1-Math.pow(1-(S.t-0.4)/0.7,2):1);
  const hangY=(S.t>=1.1)?(Math.sin((S.t-1.1)*2.4)*2):0;
  const ang=(S.t>=1.1)?Math.sin((S.t-1.1)*2.4)*0.06:0.12*(1-ease);
  const tY=-8+ease*(142+hangY);
  /* мотузка від верхньої кромки до полароїда */
  g.strokeStyle='#d8d8cc99';g.lineWidth=1;
  g.beginPath();g.moveTo(240,30);g.lineTo(240,tY-66);g.stroke();
  g.save();g.translate(240,tY);g.rotate(ang);
  g.fillStyle='#c8b888';g.fillRect(-3,-71,6,8);   /* прищіпка */
  const shots=IB.G.album.filter(a=>a.spot===spot.id&&a.day===IB.G.day);
  const si=IB.M.min(shots.length-1,IB.M.floor(S.t/1.25));
  IB.renderPhoto(g,shots.length?shots[si]:{name:spot.name,kind:spot.kind,day:IB.G.day,time:IB.clockStr(),wx:wx,seed:1,var:0},-56,-64,112,88,false);
  g.restore();
  /* підказка */
  if(S.t>1.2){
    g.font='7px monospace';g.textAlign='center';
    g.fillStyle='rgba(232,240,232,'+(0.55+0.35*Math.sin(S.t*4))+')';
    g.fillText('клік / E — далі • КАДР '+(si+1)+'/'+shots.length+' — в альбомі ✉',240,296);
    g.textAlign='left';
  }
};
