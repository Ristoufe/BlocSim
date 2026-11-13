/* Blocapta BlocSim - dessin du plan, des salles, des personnes et de la frise */
/* ------------------------------------------------------------------ */
/* Dessin                                                              */
/* ------------------------------------------------------------------ */
const map=document.getElementById("map"), mctx=map.getContext("2d");
const tlc=document.getElementById("tlc"), tctx=tlc.getContext("2d");
let DPR=Math.min(2,window.devicePixelRatio||1);
const view={s:1,ox:0,oy:0,fit:true};

function fitView(){
  const r=map.getBoundingClientRect(); const s=Math.min(r.width/(W+20), r.height/(H+20));
  view.s=s; view.ox=(r.width-W*s)/2; view.oy=(r.height-H*s)/2; view.fit=true;
}
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  for(const c of [map,tlc]){ const r=c.getBoundingClientRect(); c.width=Math.max(1,r.width*DPR); c.height=Math.max(1,r.height*DPR); }
  const rc=document.getElementById("roomcv"); if(rc){ const r=rc.getBoundingClientRect(); rc.width=r.width*DPR; rc.height=r.height*DPR; }
  const e=document.getElementById("ecg"); if(e){ const r=e.getBoundingClientRect(); e.width=r.width*DPR; e.height=r.height*DPR; }
  if(view.fit) fitView();
}

function rrect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function floorTiles(ctx,x,y,w,h,step,col){
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); ctx.strokeStyle=col; ctx.lineWidth=1;
  ctx.beginPath(); for(let i=x;i<=x+w;i+=step){ctx.moveTo(i,y);ctx.lineTo(i,y+h);} for(let j=y;j<=y+h;j+=step){ctx.moveTo(x,j);ctx.lineTo(x+w,j);} ctx.stroke(); ctx.restore();
}
function walls(ctx,x,y,w,h,door,side){
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--wall"); ctx.lineWidth=5; ctx.lineCap="square";
  const g=20; ctx.beginPath();
  // haut
  if(side==="top"){ ctx.moveTo(x,y); ctx.lineTo(door.x-g,y); ctx.moveTo(door.x+g,y); ctx.lineTo(x+w,y);} else { ctx.moveTo(x,y); ctx.lineTo(x+w,y); }
  ctx.moveTo(x+w,y); ctx.lineTo(x+w,y+h);
  if(side==="bottom"){ ctx.moveTo(x+w,y+h); ctx.lineTo(door.x+g,y+h); ctx.moveTo(door.x-g,y+h); ctx.lineTo(x,y+h);} else { ctx.moveTo(x+w,y+h); ctx.lineTo(x,y+h); }
  ctx.moveTo(x,y+h); ctx.lineTo(x,y);
  ctx.stroke();
  // porte battante
  ctx.strokeStyle="#7d8b91"; ctx.lineWidth=1.2; ctx.beginPath();
  const dy = side==="bottom"? y+h : y; const sg = side==="bottom"? -1:1;
  ctx.arc(door.x-g, dy, 2*g*0.98, sg>0?0:-Math.PI/2*0, sg>0?Math.PI/2*0.6: -Math.PI/2*0.6, sg<0); ctx.stroke();
}

function drawBed(ctx,x,y,ang,state,sel){
  ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
  ctx.fillStyle="rgba(20,30,35,.16)"; rrect(ctx,-16+2,-9+3,32,18,4); ctx.fill();
  ctx.fillStyle="#fdfefe"; ctx.strokeStyle="#5d6b72"; ctx.lineWidth=1.2; rrect(ctx,-16,-9,32,18,4); ctx.fill(); ctx.stroke();
  ctx.fillStyle= state==="sspi"? "#b9cfe0" : state==="table"? "#7fa9c9" : "#c9d9e6"; rrect(ctx,-6,-8,20,16,3); ctx.fill();
  ctx.fillStyle="#e9eef2"; rrect(ctx,-15,-6,7,12,2); ctx.fill();
  ctx.fillStyle="#d9a77f"; ctx.beginPath(); ctx.arc(-10,0,4,0,7); ctx.fill();
  ctx.restore();
}
function drawPerson(ctx,x,y,role,dir,moving,rt,seed,scale=1){
  const R=ROLE[role]; const bob = moving? Math.sin(rt*14+seed)*1.2 : 0;
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  ctx.fillStyle="rgba(20,30,35,.18)"; ctx.beginPath(); ctx.ellipse(1.5,3,8,6,0,0,7); ctx.fill();
  ctx.rotate((dir??0)+Math.PI/2);
  if(moving){ const sw=Math.sin(rt*14+seed)*3.5; ctx.fillStyle="#3b4a52"; ctx.beginPath(); ctx.ellipse(-3,sw,2,3,0,0,7); ctx.ellipse(3,-sw,2,3,0,0,7); ctx.fill(); }
  ctx.translate(0,bob*0.4);
  ctx.fillStyle=R.color; ctx.strokeStyle="#1d2a30"; ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.ellipse(0,0,8.5,5.6,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#e2b48f"; ctx.beginPath(); ctx.arc(0,-0.5,3.9,0,7); ctx.fill();
  ctx.fillStyle=R.cap; ctx.beginPath(); ctx.arc(0,0.4,3.9,Math.PI*1.05,Math.PI*1.95+Math.PI,false); ctx.fill();
  ctx.restore();
}

function drawRoom(ctx,R,sim,t,rt,detail){
  const st = sim ? roomState(sim,R.name,t) : {st:"ferme"};
  const used = sim && sim.byRoom[R.name];
  ctx.fillStyle= used? "#f6f8f7":"#eaeeee"; ctx.fillRect(R.x,R.y,R.w,R.h);
  floorTiles(ctx,R.x,R.y,R.w,R.h,R.small?16:20,"rgba(38,52,59,.06)");
  // bandeau d'état côté mur du fond
  const S=STATE[st.st]; const bandY = R.top? R.y : R.y+R.h-8;
  ctx.fillStyle=S.color; ctx.fillRect(R.x,bandY,R.w,8);
  // flux laminaire (plafond)
  const k=R.k, cx=R.cx, cy=R.cy, s=R.sign;
  ctx.strokeStyle="rgba(61,143,134,.25)"; ctx.setLineDash([4,4]); ctx.lineWidth=1;
  ctx.strokeRect(cx-60*k, cy-80*k, 120*k, 160*k); ctx.setLineDash([]);
  // scialytique allumé
  const lit = ["instal","chir","ferm"].includes(st.st);
  if(lit){ const g=ctx.createRadialGradient(cx,cy,2,cx,cy,70*k); g.addColorStop(0,"rgba(255,246,200,.75)"); g.addColorStop(1,"rgba(255,246,200,0)"); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,70*k,0,7); ctx.fill(); }
  // table
  ctx.fillStyle="#56656c"; rrect(ctx,cx-17*k,cy-46*k,34*k,92*k,4*k); ctx.fill();
  ctx.fillStyle="#7b8a91"; rrect(ctx,cx-14*k,cy-43*k,28*k,86*k,3*k); ctx.fill();
  // poste d'anesthésie + moniteur
  const ax=cx+52*k, ay=cy-74*k*s;
  ctx.fillStyle="#3a4950"; rrect(ctx,ax-14*k,ay-12*k,28*k,24*k,3*k); ctx.fill();
  ctx.fillStyle= (st.c && !st.next && st.st!=="bio") ? "#0e1a1f":"#56656c"; ctx.fillRect(ax-10*k,ay-7*k,20*k,10*k);
  if(st.c && !st.next && st.st!=="bio"){ ctx.strokeStyle="#57e389"; ctx.lineWidth=1; ctx.beginPath(); for(let i=0;i<18;i++){ const xx=ax-9*k+i*k; const ph=(i+rt*30)%18; ctx.lineTo(xx, ay-2*k - (ph>8&&ph<10?4*k:0)); } ctx.stroke(); }
  // table d'instruments
  ctx.fillStyle="#cfd8db"; ctx.strokeStyle="#7d8b91"; ctx.lineWidth=1; rrect(ctx,cx-92*k,cy+(14-14)*k*s-12*k+28*k*s,34*k,24*k,2*k); ctx.fill(); ctx.stroke();
  // colonne coelio ou robot
  if(st.c && st.c.robot && !st.next){
    const px=cx+62*k, py=cy+20*k*s; ctx.fillStyle="#d7dde0"; ctx.strokeStyle="#4d5c63"; ctx.lineWidth=1.2;
    rrect(ctx,px-12*k,py-12*k,24*k,24*k,4*k); ctx.fill(); ctx.stroke();
    if(["chir","ferm","instal"].includes(st.st)){ ctx.strokeStyle="#4d5c63"; ctx.lineWidth=3*k; ctx.beginPath(); for(let a=0;a<4;a++){ ctx.moveTo(px,py); ctx.lineTo(cx+(8-a*5)*k, cy+(-18+a*10)*k); } ctx.stroke(); }
    const C=spot(R.name,"CONSOLE"); ctx.fillStyle="#3a4950"; rrect(ctx,C.x-15,C.y-12*R.sign-8,30,16,3); ctx.fill();
  }
  // libellés
  ctx.fillStyle= used? "rgba(22,34,42,.75)":"rgba(22,34,42,.35)";
  ctx.font=`600 ${R.small?15:24}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-mono")}`;
  ctx.textBaseline="top"; const ly = R.top? R.y+16 : R.y+R.h-(R.small?30:58);
  ctx.fillText(R.label, R.x+10, ly);
  ctx.font=`500 ${R.small?10:12.5}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-ui")}`;
  ctx.fillStyle="rgba(22,34,42,.8)";
  const sub = !used? "Fermée ce jour" : (st.c? SPEC_SHORT(st.c.spec) : S.label);
  ctx.fillText(sub, R.x+10, ly+(R.small?17:28));
  if(used && !R.small){
    ctx.textAlign="right"; ctx.font=`600 12px ${getComputedStyle(document.documentElement).getPropertyValue("--font-mono")}`;
    ctx.fillStyle=S.color; let lab=S.label;
    if(st.c && !st.next && st.st!=="bio") lab += " " + fmt(t-st.c.s).replace(/^00:/,"0:");
    ctx.fillText(lab, R.x+R.w-10, ly+2); ctx.textAlign="left";
  }
  if(st.st==="panne"){
    ctx.save(); ctx.beginPath(); ctx.rect(R.x,R.y,R.w,R.h); ctx.clip(); ctx.strokeStyle="rgba(91,58,58,.28)"; ctx.lineWidth=6;
    ctx.beginPath(); for(let i=-R.h;i<R.w;i+=22){ ctx.moveTo(R.x+i,R.y+R.h); ctx.lineTo(R.x+i+R.h,R.y); } ctx.stroke(); ctx.restore();
    ctx.fillStyle="#5b3a3a"; rrect(ctx,R.cx-70*R.k,R.cy-16,140*R.k,32,4); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`600 ${R.small?10:13}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-ui")}`; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(st.pan.label||"Panne", R.cx, R.cy-4); ctx.font=`500 ${R.small?9:11}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-mono")}`; ctx.fillText("jusqu'à "+fmt(st.pan.to), R.cx, R.cy+9); ctx.textAlign="left";
  }
  walls(ctx,R.x,R.y,R.w,R.h,R.door,R.top?"bottom":"top");
  if(sim && sim.selected===R.name){ ctx.strokeStyle="#0b7a6e"; ctx.lineWidth=3; ctx.setLineDash([8,5]); ctx.strokeRect(R.x-6,R.y-6,R.w+12,R.h+12); ctx.setLineDash([]); }
}

function drawZone(ctx,Z,key,sim,t){
  ctx.fillStyle="#f2f4f3"; ctx.fillRect(Z.x,Z.y,Z.w,Z.h);
  floorTiles(ctx,Z.x,Z.y,Z.w,Z.h,20,"rgba(38,52,59,.05)");
  const mono=getComputedStyle(document.documentElement).getPropertyValue("--font-mono"), ui=getComputedStyle(document.documentElement).getPropertyValue("--font-ui");
  ctx.fillStyle="rgba(22,34,42,.75)"; ctx.font=`600 15px ${mono}`; ctx.textBaseline="top";
  const top = Z.y<CY; ctx.fillText(Z.label.toUpperCase(), Z.x+10, top? Z.y+12 : Z.y+Z.h-26);
  if(key==="ACC"){ ctx.strokeStyle="rgba(38,52,59,.18)"; ctx.lineWidth=1; ACC_SLOTS.forEach(p=>{ ctx.strokeRect(p.x-20,p.y-13,40,26); }); ctx.font=`500 11px ${ui}`; ctx.fillStyle="#7d8b91"; ctx.fillText("vers les services", 26, 266); }
  if(key==="REC"){
    REC_BEDS.forEach((b,i)=>{ if(sim && i>=sim.sspiBeds){ ctx.fillStyle="rgba(91,58,58,.12)"; ctx.fillRect(b.x-22,b.y-14,44,28); ctx.strokeStyle="rgba(91,58,58,.4)"; ctx.beginPath(); ctx.moveTo(b.x-22,b.y-14); ctx.lineTo(b.x+22,b.y+14); ctx.moveTo(b.x+22,b.y-14); ctx.lineTo(b.x-22,b.y+14); ctx.stroke(); return; }
      ctx.strokeStyle="rgba(38,52,59,.22)"; ctx.strokeRect(b.x-22,b.y-14,44,28); ctx.fillStyle="#9aa6ab"; ctx.font=`500 10px ${mono}`; ctx.fillText(String(i+1), b.x-21, b.y-13); ctx.fillStyle="#3a4950"; ctx.fillRect(b.x+24,b.y-6,6,12); });
    ctx.strokeStyle="#26343b"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(1690,300); ctx.lineTo(1690,440); ctx.moveTo(1550,292); ctx.lineTo(1820,292); ctx.stroke();
  }
  if(key==="OFF"){ ctx.fillStyle="#dde3e4"; rrect(ctx,40,575,190,22,4); ctx.fill(); ctx.fillStyle="#7d8b91"; ctx.font=`500 11px ${ui}`; ctx.fillText("vestiaires", 46, 580); }
  if(key==="ARS"){ ctx.fillStyle="#dde3e4"; for(let i=0;i<5;i++){ rrect(ctx,1566,560+i*16,238,10,2); ctx.fill(); } }
  walls(ctx,Z.x,Z.y,Z.w,Z.h,Z.door, top?"bottom":"top");
}

function drawScene(ctx,sim,t,rt,opts={}){
  const css=getComputedStyle(document.documentElement);
  ctx.fillStyle=css.getPropertyValue("--paper"); ctx.fillRect(-2000,-2000,W+4000,H+4000);
  // couloir
  ctx.fillStyle="#ecefef"; ctx.fillRect(20,440,W-40,90);
  floorTiles(ctx,20,440,W-40,90,30,"rgba(38,52,59,.05)");
  ctx.strokeStyle="rgba(11,122,110,.35)"; ctx.setLineDash([14,10]); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(30,CY); ctx.lineTo(W-30,CY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle="rgba(22,34,42,.45)"; ctx.font=`600 12px ${css.getPropertyValue("--font-mono")}`; ctx.textBaseline="middle"; ctx.fillText("COULOIR PROPRE", 1300, CY+30);
  for(const k in ZONES) drawZone(ctx,ZONES[k],k,sim,t);
  for(const n in ROOMS) drawRoom(ctx,ROOMS[n],sim,t,rt,opts.detail);
  if(!sim) return;
  // personnes
  const list=[];
  for(const a of sim.agents){ const p=posAt(a,t); if(!p) continue; list.push([a,p]); }
  // IDE de SSPI, placées au lit des patients présents
  const inRec = sim.cases.filter(c=>t>=c.inRec && t<c.outRec);
  const nIde = (t%1440>=420 && t%1440<1170) ? 3 : 1;
  for(let i=0;i<nIde;i++){
    const mine = inRec.filter((c,j)=>j%nIde===i); let p;
    if(mine.length){ const c=mine[Math.floor(t/6+i)%mine.length]; const b=REC_BEDS[c.bed]; p={x:b.x-28,y:b.y+ (i%2?8:-8)}; }
    else p={x:1580+i*30,y:270};
    list.push([{role:"IDESSPI",code:"IDE SSPI "+(i+1),lane:i*3},{...p,moving:false,act:"sspi"}]);
  }
  sim.drawn=list;
  // patients d'abord (lits), puis soignants
  for(const [a,p] of list){ if(a.role!=="PAT") continue;
    const c=sim.cases.find(x=>x.id===a.caseId);
    let ang = p.dir!=null ? p.dir : (p.act==="table" ? Math.PI/2*(ROOMS[c.room].sign) * -1 : 0);
    if(p.act==="table"){ ang = ROOMS[c.room].sign>0 ? -Math.PI/2 : Math.PI/2; }
    drawBed(ctx,p.x,p.y,ang,p.act);
  }
  for(const [a,p] of list){ if(a.role==="PAT") continue;
    let dir=p.dir;
    if(dir==null){ const z = a.segs? segAt(a,t) : null; const R = z && z.p && ROOMS[z.p.z]; if(R) dir=Math.atan2(R.cy-p.y,R.cx-p.x); else dir=-Math.PI/2; }
    drawPerson(ctx,p.x,p.y,a.role,dir,p.moving,rt,(a.lane||0)*3, opts.detail?1.1:1.3);
  }
  if(opts.labels){
    ctx.font=`500 10.5px ${css.getPropertyValue("--font-ui")}`; ctx.textBaseline="middle";
    for(const [a,p] of list){ if(!opts.labels(p)) continue; const txt= a.role==="PAT"? a.code : a.code; const w=ctx.measureText(txt).width+8;
      ctx.fillStyle="rgba(22,34,42,.85)"; rrect(ctx,p.x+10,p.y-17,w,14,3); ctx.fill(); ctx.fillStyle="#fff"; ctx.fillText(txt,p.x+14,p.y-10); }
  }
}

/* ------------------------------------------------------------------ */
/* Frise                                                               */
/* ------------------------------------------------------------------ */
function drawTimeline(sim,t){
  const c=tctx, w=tlc.width/DPR, h=tlc.height/DPR; c.setTransform(DPR,0,0,DPR,0,0);
  const css=getComputedStyle(document.documentElement);
  c.fillStyle=css.getPropertyValue("--panel"); c.fillRect(0,0,w,h);
  const lanes=[...ORDER.filter(r=>sim.byRoom[r]), ...(sim.byRoom["SSPI"]?["SSPI"]:[])];
  const L=78, Rm=14, top=22, rowsH=h-top-30, lh=Math.min(16, rowsH/(lanes.length+1));
  const X=m=> L+(m-sim.t0)/(sim.t1-sim.t0)*(w-L-Rm);
  sim.tlGeo={L,Rm,top,lh,lanes,X,w};
  c.font=`500 11px ${css.getPropertyValue("--font-mono")}`; c.textBaseline="middle"; c.fillStyle=css.getPropertyValue("--ink-2");
  for(let m=Math.ceil(sim.t0/60)*60;m<=sim.t1;m+=60){ const x=X(m); c.strokeStyle="rgba(38,52,59,.08)"; c.beginPath(); c.moveTo(x,top-4); c.lineTo(x,h-6); c.stroke(); if(w>500 || (m/60)%2===0) c.fillText(fmt(m).slice(0,2)+"h", x-8, 11); }
  lanes.forEach((r,i)=>{
    const y=top+i*lh; c.fillStyle= sim.selected===r? css.getPropertyValue("--ink") : css.getPropertyValue("--ink-2");
    c.font=`${sim.selected===r?600:500} 11px ${css.getPropertyValue("--font-mono")}`; c.fillText(r==="SSPI"?"Box SSPI":r, 8, y+lh/2);
    for(const k of sim.byRoom[r]){
      const x0=X(k.s), x1=X(k.end); c.fillStyle= k.type==="P"? "#0b7a6e" : k.type==="U"? "#c2412d" : "#c77700";
      const xd=X(k.s+k.dur);
      c.globalAlpha = t>=k.end? .45 : 1; c.fillRect(x0,y+2,Math.max(1.5,xd-x0),lh-4);
      if(k.waitBed>0){ c.fillStyle="#c2412d"; c.fillRect(xd,y+lh/2-3,Math.max(1,x1-xd),6); }
      c.globalAlpha=1;
      c.fillStyle="#3a9ad9"; c.globalAlpha=.55; c.fillRect(x1,y+lh/2-1,Math.max(1,X(k.cleanEnd)-x1),2); c.globalAlpha=1;
    }
    for(const z of (sim.closures||[]).filter(z=>z.room===r)){ const a=X(z.from), b=X(z.to); c.fillStyle="rgba(91,58,58,.35)"; c.fillRect(a,y+1,b-a,lh-2); c.strokeStyle="#5b3a3a"; c.strokeRect(a,y+1,b-a,lh-2); }
  });
  // occupation SSPI
  const y0=top+lanes.length*lh+4, sh=h-y0-8;
  c.fillStyle=css.getPropertyValue("--ink-2"); c.font=`500 11px ${css.getPropertyValue("--font-mono")}`; c.fillText("SSPI", 8, y0+sh/2);
  c.beginPath(); c.moveTo(X(sim.t0),y0+sh);
  for(let m=sim.t0;m<=sim.t1;m+=5){ const n=sim.cases.filter(k=>m>=k.inRec&&m<k.outRec).length; c.lineTo(X(m), y0+sh - Math.min(1,n/sim.sspiBeds)*sh); }
  c.lineTo(X(sim.t1),y0+sh); c.closePath(); c.fillStyle="rgba(194,56,111,.22)"; c.fill();
  // tête de lecture
  const px=X(t); c.strokeStyle=css.getPropertyValue("--ink"); c.lineWidth=2; c.beginPath(); c.moveTo(px,top-6); c.lineTo(px,h-4); c.stroke();
  c.fillStyle=css.getPropertyValue("--ink"); rrect(c,px-22,0,44,15,3); c.fill(); c.fillStyle="#fff"; c.textAlign="center"; c.fillText(fmt(t),px,8); c.textAlign="left";
}
