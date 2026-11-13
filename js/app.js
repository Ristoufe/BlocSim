/* Blocapta BlocSim - application : état, panneaux, boucle, interactions */

/* ------------------------------------------------------------------ */
/* Démarrage : chargement des journées                                 */
/* ------------------------------------------------------------------ */
let DATA = [];
/* ------------------------------------------------------------------ */
/* État de l'application                                               */
/* ------------------------------------------------------------------ */
const SPEEDS=[{v:0.5,l:"x30"},{v:1,l:"x60"},{v:2,l:"x120"},{v:5,l:"x300"},{v:12,l:"x720"}];
const app={dayIdx:0, sim:null, t:570, speed:2, playing:true, last:performance.now()};
let SIMS=[];
function getSim(i){ return SIMS[i] || (SIMS[i]=buildDay(DATA[i])); }

function setDay(i){
  app.dayIdx=i; const sel = app.sim? app.sim.selected : null; app.sim=getSim(i); app.sim.selected = (sel && app.sim.byRoom[sel]) ? sel : null;
  const busy = app.sim.cases.filter(c=>!c.night).length;
  app.t = busy>6 ? Math.max(app.sim.t0, 570) : app.sim.cases[0].s-5;
  document.querySelectorAll(".daycard").forEach((b,j)=>b.setAttribute("aria-pressed", j===i));
  try{ localStorage.setItem("blocapta-day", String(i)); }catch(e){}
  renderSide(true);
}
function selectRoom(r){ app.sim.selected = r; renderSide(true); requestAnimationFrame(resize); }

/* panneau latéral */
const side=document.getElementById("side");
function renderSide(full){
  const sim=app.sim, t=app.t;
  if(sim.selected) return renderRoomPanel(full);
  if(full){
    side.innerHTML = `
    <div class="sec"><h2>${sim.day.label}</h2><div class="kpis" id="kpis"></div></div>
    <div class="sec"><h2>Fil des événements</h2><ul class="feed" id="feed"></ul></div>
    <div class="sec"><h2>Qui est qui</h2><div class="legend">${Object.entries(ROLE).map(([k,r])=>`<span><i style="background:${r.color}"></i>${r.label}</span>`).join("")}</div>
      <div class="states">${["accueil","induc","chir","ferm","reveil","bio","prepa","libre"].map(k=>`<span><i style="background:${STATE[k].color}"></i>${STATE[k].label}</span>`).join("")}</div></div>
    <div class="sec"><h2>Annulées ce jour (${sim.day.cancelled.length})</h2>${sim.day.cancelled.length? `<ul class="canc">${sim.day.cancelled.map(c=>`<li>${SPEC_SHORT(c.spec)} : ${c.reason}</li>`).join("")}</ul>`:`<p class="note">Aucune annulation enregistrée.</p>`}</div>
    <div class="sec note">Données réelles de l'export OPROOM : heures d'entrée en salle, durées, spécialités, actes, type, anesthésie et annulations. Modélisé : découpage des phases, équipes paramédicales, brancardage, bionettoyage, séjour en SSPI, trajets et constantes vitales. Les soignants sont désignés par des codes. Cliquer sur une salle pour l'ouvrir.</div>`;
  }
  const done=sim.cases.filter(c=>c.end<=t).length, inOp=sim.rooms.filter(r=>{const s=roomState(sim,r,t).st; return !["libre","ferme","prepa","bio"].includes(s);}).length;
  const acc=sim.cases.filter(c=>t>=c.arr2 && t<c.s).length, rec=sim.cases.filter(c=>t>=c.inRec&&t<c.outRec).length;
  const urg=sim.cases.filter(c=>c.type!=="P").length, staff=sim.agents.filter(a=>a.role!=="PAT" && posAt(a,t) && segAt(a,t).act!=="idle").length;
  const k=document.getElementById("kpis"); if(k) k.innerHTML=`
    <div class="kpi"><b>${inOp}/${sim.rooms.length}</b><span>salles en activité</span></div>
    <div class="kpi"><b>${done}/${sim.cases.length}</b><span>interventions finies</span></div>
    <div class="kpi"><b>${acc}</b><span>patients à l'accueil</span></div>
    <div class="kpi"><b>${rec}</b><span>patients en SSPI</span></div>
    <div class="kpi"><b>${urg}</b><span>urgences du jour</span></div>
    <div class="kpi"><b>${staff}</b><span>soignants en poste actif</span></div>`;
  const f=document.getElementById("feed");
  if(f){ const evs=sim.events.filter(e=>e.t<=t).slice(-14).reverse();
    f.innerHTML = evs.map(e=>`<li data-room="${e.room}"><time>${fmt(e.t)}</time><span class="chip ${e.kind==="u"?"u":""}">${e.room==="SSPI"?"SSPI":e.room}</span><span>${e.txt}</span></li>`).join("") || `<li><span></span><span></span><span class="note">La journée n'a pas encore commencé.</span></li>`; }
}

function renderRoomPanel(full){
  const sim=app.sim, r=sim.selected, t=app.t, st=roomState(sim,r,t), R=ROOMS[r];
  if(full){
    side.innerHTML=`
    <div class="sec">
      <div class="rhead"><h2>${r==="SSPI"?"Box actes SSPI":r}</h2><span class="state" id="rstate"></span></div>
      <button class="close" id="closeroom" type="button">Retour à la vue d'ensemble</button>
      <canvas id="roomcv" aria-label="Vue détaillée de la salle"></canvas>
      <div class="monitor"><canvas id="ecg" aria-hidden="true"></canvas><div class="vit" id="vit"></div></div>
      <div class="steps" id="steps"></div>
    </div>
    <div class="sec"><h2>Intervention en cours</h2><dl class="kv" id="case"></dl></div>
    <div class="sec"><h2>Équipe en salle</h2><ul class="team" id="team"></ul></div>
    <div class="sec"><h2>Programme de la salle</h2><ul class="feed" id="prog"></ul></div>
    <div class="sec"><h2>Journal de la salle</h2><ul class="feed" id="rlog"></ul></div>`;
    document.getElementById("closeroom").onclick=()=>selectRoom(null);
    resize();
  }
  const S=STATE[st.st]; const rs=document.getElementById("rstate"); rs.textContent=S.label; rs.style.background=S.color;
  const c = st.c && !st.next ? st.c : null;
  // étapes
  document.getElementById("steps").innerHTML = PHASES.map((p,i)=>{
    let cls=""; if(c){ if(i<st.i) cls="done"; if(i===st.i) cls="on"; }
    return `<div class="${cls}" title="${p.n}" style="${cls==="on"?`background:${STATE[p.k].color}`:""}">${["Accueil","Induction","Installation","Opératoire","Fermeture","Réveil","Bionett."][i]}</div>`; }).join("");
  // fiche
  const shown = c || st.c || st.next;
  const ce=document.getElementById("case");
  if(shown){
    const P=shown.ph.t;
    ce.innerHTML=`
      <dt>Acte</dt><dd>${shown.proc}</dd>
      <dt>Spécialité</dt><dd>${SPEC_SHORT(shown.spec)}</dd>
      <dt>Type</dt><dd>${shown.type==="P"?"Programmé":shown.type==="U"?"<b style='color:var(--crit)'>Urgence</b>":"Urgence différée"} · ${shown.adm==="AMB"?"Ambulatoire":shown.adm==="HOSP"?"Hospitalisation":"Externe"}</dd>
      <dt>Anesthésie</dt><dd>${shown.anInf? shown.an2+" (déduite, non saisie)" : shown.anl}</dd>
      <dt>Patient</dt><dd class="mono">${shown.pid}</dd>
      <dt>Chirurgien</dt><dd class="mono">${shown.ch}</dd>
      <dt>Anesthésiste</dt><dd class="mono">${shown.mar}</dd>
      <dt>Horaires</dt><dd class="mono">${fmt(P[0])} entrée · ${fmt(P[3])} incision · ${fmt(P[6])} sortie</dd>
      <dt>Durée en salle</dt><dd>${dur(shown.dur)}${!c && st.next? " (à venir)":""}</dd>`;
  } else ce.innerHTML=`<dt>Salle</dt><dd>${st.st==="libre"? "Libre, aucune intervention prévue dans les 25 prochaines minutes":"Fermée ce jour"}</dd>`;
  // équipe
  const inRoom = (sim.drawn||[]).filter(([a,p])=>p.x>=R.x&&p.x<=R.x+R.w&&p.y>=R.y&&p.y<=R.y+R.h);
  const ACT={anesth:"anesthésie",induction:"induction",reveil:"réveil",operate:"opère",console:"en console",install:"installation",close:"fermeture",prep:"prépare la table",instrument:"instrumente",circulate:"circule",clean:"bionettoyage",pick:"prend en charge",drop:"dépose",table:"sur la table",walk:"en déplacement"};
  document.getElementById("team").innerHTML = inRoom.length ? inRoom.map(([a,p])=>`<li><i style="background:${ROLE[a.role].color}"></i><span class="mono">${a.code}</span> ${ROLE[a.role].label}<em>${ACT[p.act]||""}</em></li>`).join("") : `<li class="note">Personne en salle pour le moment.</li>`;
  // programme
  document.getElementById("prog").innerHTML = (sim.byRoom[r]||[]).map(k=>`<li data-seek="${k.s}"><time>${fmt(k.s)}</time><span class="chip ${k.type!=="P"?"u":""}">${k.type==="P"?"PROG":k.type}</span><span style="${t>=k.end?"color:var(--ink-3)":""}">${k.proc} · ${dur(k.dur)}</span></li>`).join("");
  document.getElementById("rlog").innerHTML = sim.events.filter(e=>e.room===r && e.t<=t).slice(-10).reverse().map(e=>`<li><time>${fmt(e.t)}</time><span></span><span>${e.txt}</span></li>`).join("") || `<li><span></span><span></span><span class="note">Rien pour l'instant.</span></li>`;
}

function drawRoomDetail(rt){
  const cv=document.getElementById("roomcv"); if(!cv) return; const sim=app.sim, R=ROOMS[sim.selected];
  const c=cv.getContext("2d"), w=cv.width/DPR, h=cv.height/DPR;
  const pad=R.small?6:10, bw=R.w+pad*2, bh=R.small? R.h+pad*2 : 270, bx=R.x-pad, by=R.small? R.y-pad : clamp(R.cy-bh/2, R.y-pad, R.y+R.h+pad-bh);
  const s=Math.min(w/bw, h/bh);
  c.setTransform(DPR,0,0,DPR,0,0); c.fillStyle="#e4e9ea"; c.fillRect(0,0,w,h);
  c.setTransform(DPR*s,0,0,DPR*s, DPR*(w/2-(bx+bw/2)*s), DPR*(h/2-(by+bh/2)*s));
  c.save(); c.beginPath(); c.rect(R.x-pad,R.y-pad,R.w+pad*2,R.h+pad*2); c.clip();
  const sel=sim.selected; sim.selected=null;
  drawScene(c,sim,app.t,rt,{detail:true, labels:p=>p.x>=R.x&&p.x<=R.x+R.w&&p.y>=R.y&&p.y<=R.y+R.h});
  sim.selected=sel; c.restore();
  // moniteur
  const e=document.getElementById("ecg"), ec=e.getContext("2d"), ew=e.width/DPR, eh=e.height/DPR; ec.setTransform(DPR,0,0,DPR,0,0);
  ec.clearRect(0,0,ew,eh);
  const st=roomState(sim,sim.selected,app.t), k=st.c && !st.next && st.st!=="bio" ? st.c : null;
  const vit=document.getElementById("vit");
  if(!k){ ec.strokeStyle="#2c3b42"; ec.beginPath(); ec.moveTo(0,eh/2); ec.lineTo(ew,eh/2); ec.stroke(); ec.fillStyle="#6c8088"; ec.font="12px "+getComputedStyle(document.documentElement).getPropertyValue("--font-mono"); ec.fillText("Moniteur en veille",8,16); vit.innerHTML=""; return; }
  const v=vitals(k,app.t), bps=v.hr/60, speed=60;
  ec.strokeStyle="#57e389"; ec.lineWidth=1.6; ec.beginPath();
  for(let x=0;x<ew;x++){ const tt=(rt - (ew-x)/speed)*bps; const ph=tt-Math.floor(tt); let y=0;
    if(ph<0.08) y=Math.sin(ph/0.08*Math.PI)*0.12; else if(ph>0.16&&ph<0.18) y=-0.15; else if(ph>=0.18&&ph<0.21) y=1; else if(ph>=0.21&&ph<0.24) y=-0.3; else if(ph>0.36&&ph<0.5) y=Math.sin((ph-0.36)/0.14*Math.PI)*0.22;
    const yy=eh*0.42 - y*eh*0.36; if(x===0) ec.moveTo(x,yy); else ec.lineTo(x,yy); }
  ec.stroke();
  ec.strokeStyle="#7fd4ff"; ec.lineWidth=1.2; ec.beginPath();
  for(let x=0;x<ew;x++){ const tt=(rt-(ew-x)/speed)*bps; const ph=tt-Math.floor(tt); const y=Math.max(0,Math.sin((ph-0.25)*Math.PI*1.4))*Math.exp(-ph*1.5); const yy=eh*0.95 - y*eh*0.28; if(x===0) ec.moveTo(x,yy); else ec.lineTo(x,yy);} ec.stroke();
  vit.innerHTML=`<span class="v-hr">FC</span><b class="v-hr">${v.hr}</b><span class="v-sp">SpO2</span><b class="v-sp">${v.sp}</b><span class="v-bp">PNI</span><b class="v-bp" style="font-size:15px">${v.sys}/${v.dia}</b>${v.co?`<span class="v-co">EtCO2</span><b class="v-co">${v.co}</b>`:""}${v.bis?`<span class="v-co">BIS</span><b class="v-co">${v.bis}</b>`:""}`;
}

/* ------------------------------------------------------------------ */
/* Boucle                                                              */
/* ------------------------------------------------------------------ */
let sideTick=0;
function frame(now){
  const dt=Math.min(0.1,(now-app.last)/1000); app.last=now;
  const sim=app.sim;
  if(app.playing){ app.t+=dt*app.speed; if(app.t>=sim.t1){ app.t=sim.t1; app.playing=false; syncPlay(); } }
  const rt=now/1000;
  const c=mctx; c.setTransform(DPR,0,0,DPR,0,0);
  c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--paper"); c.fillRect(0,0,map.width,map.height);
  c.setTransform(DPR*view.s,0,0,DPR*view.s,DPR*view.ox,DPR*view.oy);
  drawScene(c,sim,app.t,rt,{labels: view.s>1.25 ? (()=>true) : null});
  drawTimeline(sim,app.t);
  const cl=document.getElementById("clock"); cl.firstChild.nodeValue=fmt(app.t); document.getElementById("clockday").textContent = (app.t>=1440?"lendemain · ":"")+sim.day.label;
  if(sim.selected) drawRoomDetail(rt);
  if(now-sideTick>350){ sideTick=now; renderSide(false); }
  requestAnimationFrame(frame);
}


function startApp(){
SIMS=DATA.map(()=>null);
/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */
const daysEl=document.getElementById("days");
DATA.forEach((d,i)=>{
  const b=document.createElement("button"); b.className="daycard"; b.type="button";
  const n=d.cases.length, u=d.cases.filter(c=>c.type!=="P").length;
  b.innerHTML=`<b>${d.label.replace(" 2026","")}</b><span>${n} interv. · ${u} urg. · ${d.cancelled.length} annul.</span>`;
  b.onclick=()=>setDay(i); daysEl.appendChild(b);
});
const spEl=document.getElementById("speeds");
SPEEDS.forEach(s=>{ const b=document.createElement("button"); b.className="btn"; b.type="button"; b.textContent=s.l; b.title=`1 seconde = ${s.v*60} secondes simulées`; b.onclick=()=>{app.speed=s.v; syncSpeed();}; spEl.appendChild(b); });
function syncSpeed(){ [...spEl.children].forEach((b,i)=>b.setAttribute("aria-pressed", SPEEDS[i].v===app.speed)); }
const playBtn=document.getElementById("play");
function syncPlay(){ playBtn.textContent=app.playing?"Pause":"Lecture"; }
playBtn.onclick=()=>{ if(app.t>=app.sim.t1) app.t=app.sim.t0; app.playing=!app.playing; syncPlay(); };
document.getElementById("back").onclick=()=>{ app.t=Math.max(app.sim.t0,app.t-15); renderSide(false); };
document.getElementById("fwd").onclick=()=>{ app.t=Math.min(app.sim.t1,app.t+15); renderSide(false); };
document.addEventListener("keydown",e=>{ if(e.target.tagName==="BUTTON" && e.code==="Space") return; if(e.code==="Space"){ e.preventDefault(); playBtn.click(); } if(e.code==="ArrowRight") document.getElementById("fwd").click(); if(e.code==="ArrowLeft") document.getElementById("back").click(); if(e.code==="Escape" && app.sim.selected) selectRoom(null); });

const toWorld=(cx,cy)=>{ const r=map.getBoundingClientRect(); return {x:(cx-r.left-view.ox)/view.s, y:(cy-r.top-view.oy)/view.s}; };
function zoomAt(f,cx,cy){ const r=map.getBoundingClientRect(); const px=cx-r.left, py=cy-r.top; const ns=clamp(view.s*f, 0.3, 4); view.ox=px-(px-view.ox)*ns/view.s; view.oy=py-(py-view.oy)*ns/view.s; view.s=ns; view.fit=false; }
map.addEventListener("wheel",e=>{ e.preventDefault(); zoomAt(e.deltaY<0?1.12:1/1.12, e.clientX, e.clientY); },{passive:false});
document.getElementById("zin").onclick=()=>{ const r=map.getBoundingClientRect(); zoomAt(1.25, r.left+r.width/2, r.top+r.height/2); };
document.getElementById("zout").onclick=()=>{ const r=map.getBoundingClientRect(); zoomAt(0.8, r.left+r.width/2, r.top+r.height/2); };
document.getElementById("zfit").onclick=()=>fitView();
let drag=null;
map.addEventListener("pointerdown",e=>{ drag={x:e.clientX,y:e.clientY,ox:view.ox,oy:view.oy,moved:false}; map.setPointerCapture(e.pointerId); });
map.addEventListener("pointermove",e=>{
  if(drag){ const dx=e.clientX-drag.x, dy=e.clientY-drag.y; if(Math.abs(dx)+Math.abs(dy)>4){ drag.moved=true; view.ox=drag.ox+dx; view.oy=drag.oy+dy; view.fit=false; map.style.cursor="grabbing"; } return; }
  const w=toWorld(e.clientX,e.clientY), tip=document.getElementById("tip");
  let best=null, bd=14/Math.max(.6,view.s)+4;
  for(const [a,p] of (app.sim.drawn||[])){ const d=Math.hypot(p.x-w.x,p.y-w.y); if(d<bd){bd=d;best=[a,p];} }
  if(best){ const [a]=best; const seg = a.segs? segAt(a,app.t):null; const r=map.getBoundingClientRect();
    tip.innerHTML=`<b>${a.code}</b>${ROLE[a.role].label}`; tip.style.display="block"; tip.style.left=(e.clientX-r.left+14)+"px"; tip.style.top=(e.clientY-r.top+10)+"px"; map.style.cursor="pointer"; }
  else { tip.style.display="none"; const room=roomAt(w); map.style.cursor= room? "pointer":"grab"; }
});
map.addEventListener("pointerup",e=>{ const d=drag; drag=null; map.style.cursor="grab"; if(d && !d.moved){ const r=roomAt(toWorld(e.clientX,e.clientY)); if(r && app.sim.byRoom[r]) selectRoom(r); } });
map.addEventListener("pointerleave",()=>{ document.getElementById("tip").style.display="none"; });
function roomAt(w){ for(const n in ROOMS){ const R=ROOMS[n]; if(w.x>=R.x&&w.x<=R.x+R.w&&w.y>=R.y&&w.y<=R.y+R.h) return n; } return null; }

tlc.addEventListener("pointerdown",e=>{
  const g=app.sim.tlGeo; if(!g) return; const r=tlc.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
  const seek=xx=>{ app.t = clamp(app.sim.t0 + (xx-g.L)/(g.w-g.L-g.Rm)*(app.sim.t1-app.sim.t0), app.sim.t0, app.sim.t1); renderSide(false); };
  seek(x); const lane=Math.floor((y-g.top)/g.lh); if(x<g.L && lane>=0 && lane<g.lanes.length) selectRoom(g.lanes[lane]);
  const mv=ev=>seek(ev.clientX-r.left); const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); };
  window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
});
side.addEventListener("click",e=>{ const li=e.target.closest("li"); if(!li) return; if(li.dataset.seek){ app.t=+li.dataset.seek-1; renderSide(false); } else if(li.dataset.room && ROOMS[li.dataset.room] && app.sim.byRoom[li.dataset.room]) selectRoom(li.dataset.room); });

window.addEventListener("resize",resize);
let startDay=0; try{ const v=+localStorage.getItem("blocapta-day"); if(v>=0 && v<DATA.length) startDay=v; }catch(e){}
if(matchMedia("(prefers-reduced-motion: reduce)").matches){ app.playing=false; }
syncSpeed(); syncPlay(); setDay(startDay); resize(); fitView();
requestAnimationFrame(t=>{ app.last=t; frame(t); });
}

fetch("data/days.json")
  .then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
  .then(d=>{ DATA=d; startApp(); })
  .catch(err=>{
    const box=document.createElement("div"); box.className="loaderr";
    box.innerHTML="Impossible de charger les journées (data/days.json).<br>Lancez l'application avec <code>npm start</code> puis ouvrez http://localhost:8080 : un fichier ouvert directement depuis le disque ne peut pas lire les données.";
    document.getElementById("mapwrap").appendChild(box); console.error(err);
  });
