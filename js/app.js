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
  app.t = app.sim.day.generated ? Math.max(app.sim.t0, 455) : busy>6 ? Math.max(app.sim.t0, 570) : app.sim.cases.length ? app.sim.cases[0].s-5 : app.sim.t0;
  if(app.sim.day.generated){ app.playing=true; if(globalThis.syncPlay) globalThis.syncPlay(); }
  document.querySelectorAll(".daycard").forEach(b=>b.setAttribute("aria-pressed", b.dataset.idx!==undefined && +b.dataset.idx===i));
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
    ${sim.day.report? reportHTML(sim.day) : ""}
    <div class="sec"><h2>${sim.day.generated? "En ce moment" : sim.day.label}</h2><div class="kpis" id="kpis"></div></div>
    <div class="sec"><h2>Fil des événements</h2><ul class="feed" id="feed"></ul></div>
    <div class="sec"><h2>Exporter la journée</h2>
      <p class="note">Une ligne par intervention, avec les colonnes de l'export OPROOM (séparateur point-virgule, lisible dans Excel). La version détaillée ajoute 37 colonnes : heure prévue, mode d'arrivée, pré-anesthésie, classe et délai des urgences, chaque attente (MAR, chirurgien, brancard, SSPI, aval), équipe, brancardiers, équipements, complications.</p>
      <div class="rbtns"><button class="btn" type="button" id="csv1">CSV format OPROOM</button><button class="btn" type="button" id="csv2">CSV détaillé</button></div>
      ${sim.day.logFiles? `<p class="note">Enregistré automatiquement : ${sim.day.logFiles.map(f=>`<span class="mono">${f}</span>`).join("<br>")}</p>` : ""}
    </div>
    <div class="sec"><h2>Qui est qui</h2><div class="legend">${Object.entries(ROLE).map(([k,r])=>`<span><i style="background:${r.color}"></i>${r.label}</span>`).join("")}</div>
      <div class="states">${["accueil","induc","chir","ferm","reveil","bio","prepa","libre","attMar","attChir","attPat","attente","panne"].map(k=>`<span><i style="background:${STATE[k].color}"></i>${STATE[k].label}</span>`).join("")}</div></div>
    <div class="sec"><h2>Annulées ce jour (${sim.day.cancelled.length})</h2>${sim.day.cancelled.length? `<ul class="canc">${sim.day.cancelled.map(c=>`<li>${SPEC_SHORT(c.spec)} : ${c.reason}</li>`).join("")}</ul>`:`<p class="note">Aucune annulation enregistrée.</p>`}</div>
    <div class="sec note">Données réelles de l'export OPROOM : heures d'entrée en salle, durées, spécialités, actes, type, anesthésie et annulations. Modélisé : découpage des phases, équipes paramédicales, brancardage, bionettoyage, séjour en SSPI, trajets et constantes vitales. Les soignants sont désignés par des codes. Cliquer sur une salle pour l'ouvrir.</div>`;
  }
  const done=sim.cases.filter(c=>c.end<=t).length, inOp=sim.rooms.filter(r=>{const s=roomState(sim,r,t).st; return !["libre","ferme","prepa","bio"].includes(s);}).length;
  const acc=sim.cases.filter(c=> sim.v===2 ? (c.preIn!=null && t>=c.preIn && t<c.s) : (t>=c.arr2 && t<c.s)).length, rec=sim.cases.filter(c=>t>=c.inRec&&t<c.outRec).length;
  const urg=sim.cases.filter(c=>c.type!=="P").length, staff=sim.agents.filter(a=>a.role!=="PAT" && posAt(a,t) && segAt(a,t).act!=="idle").length;
  const k=document.getElementById("kpis"); if(k) k.innerHTML=`
    <div class="kpi"><b>${inOp}/${sim.rooms.length}</b><span>salles en activité</span></div>
    <div class="kpi"><b>${done}/${sim.cases.length}</b><span>interventions finies</span></div>
    <div class="kpi"><b>${acc}</b><span>${sim.v===2?"patients en pré-anesthésie":"patients à l'accueil"}</span></div>
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
      <dt>Durée en salle</dt><dd>${dur(shown.dur)}${!c && st.next? " (à venir)":""}</dd>
      ${shown.phT? `<dt>Arrivée</dt><dd>${({debout:"à pied",fauteuil:"en fauteuil",couche:"couché"})[shown.mode]||""}${shown.preIn!=null?`, ${shown.preC? `attente en zone d'accueil à ${fmt(shown.preIn)}, salle de pré-anesthésie de ${shown.room} à ${fmt(shown.sasIn)}` : shown.preSlot.kind==="sas" ? `salle de pré-anesthésie de ${shown.room} à ${fmt(shown.preIn)}` : `pré-anesthésie à ${fmt(shown.preIn)} (poste ${shown.preSlot.kind==="couche"?"couché":"assis"} ${shown.preSlot.i+1})`}`:""}${shown.marAlr?`, ALR par ${shown.alrBy}`:""}</dd>` : ""}
      ${shown.clsLabel? `<dt>Délai maximal</dt><dd>${shown.clsLabel} : ${fmt(shown.deadline)}, ${shown.s<=shown.deadline?"respecté":"<b style='color:var(--crit)'>dépassé</b>"}</dd>` : ""}
      ${shown.planned!=null && shown.phT? `<dt>Prévu à</dt><dd class="mono">${fmt(shown.planned)}${shown.s-shown.planned>=5?` (retard ${Math.round(shown.s-shown.planned)} min)`:""}</dd>` : ""}
      ${(shown.waits||[]).length? `<dt>Attentes</dt><dd>${shown.waits.map(w=>`${w.kind} ${Math.round(w.b-w.a)} min`).join(" · ")}</dd>` : ""}
      ${shown.team? `<dt>Équipe</dt><dd class="mono">${shown.team.iade}, ${shown.team.ibode}, ${shown.team.circ}</dd>` : ""}
      ${shown.vpaMar||shown.chirVisit||shown.labo||shown.ident||shown.prep? `<dt>Avant l'anesthésie</dt><dd>${[shown.vpaMar&&`visite de ${shown.vpaMar[2]} à ${fmt(shown.vpaMar[0])}`, shown.chirVisit&&`${shown.chirVisit[2]} : ${[shown.consent&&"consentement",shown.marq&&"marquage du côté"].filter(Boolean).join(" et ")}`, shown.labo&&`examen manquant, résultat à ${fmt(shown.labo[1])}`, shown.ident&&"discordance d'identité vérifiée", shown.prep&&"patient non préparé", shown.jeuneReport&&"reporté en fin de programme (jeûne)"].filter(Boolean).join(" · ")}</dd>` : ""}
      ${shown.boxGroup? `<dt>Boîte d'instruments</dt><dd>${shown.boxGroup}${shown.boxRefused?", première boîte non conforme":""}</dd>` : ""}
      ${shown.radio||shown.extempoAt||shown.transfuAt||shown.dmMiss||shown.intub||shown.comptage? `<dt>Pendant l'intervention</dt><dd>${[shown.intub&&"intubation difficile", shown.radio&&`scopie par ${shown.radio[2]} à ${fmt(shown.radio[0])}`, shown.extempoAt&&`examen extemporané (${Math.round(shown.extempoAt[1]-shown.extempoAt[0])} min)`, shown.transfuAt&&`transfusion, produits livrés à ${fmt(shown.transfuAt[1])}`, shown.dmMiss&&"dispositif stérile manquant", shown.comptage&&"comptage discordant"].filter(Boolean).join(" · ")}</dd>` : ""}
      ${shown.latex||shown.child||shown.septic||shown.complic||shown.bmr||shown.interne? `<dt>Particularités</dt><dd>${[shown.latex&&"allergie au latex",shown.child&&"enfant",shown.septic&&"patient septique (bionettoyage renforcé)",shown.bmr&&"porteur de BMR (fin de programme, bionettoyage renforcé)",shown.interne&&"interne qui opère",shown.complic&&"complication peropératoire"].filter(Boolean).join(", ")}</dd>` : ""}`;
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
const newBtn=document.createElement("button"); newBtn.className="daycard newday"; newBtn.type="button";
newBtn.innerHTML=`<b>+ Créer une journée</b><span>scénario à simuler</span>`; newBtn.onclick=()=>openScenario();
daysEl.appendChild(newBtn);
DATA.forEach((d,i)=>addDayCard(d,i));
const spEl=document.getElementById("speeds");
SPEEDS.forEach(s=>{ const b=document.createElement("button"); b.className="btn"; b.type="button"; b.textContent=s.l; b.title=`1 seconde = ${s.v*60} secondes simulées`; b.onclick=()=>{app.speed=s.v; syncSpeed();}; spEl.appendChild(b); });
function syncSpeed(){ [...spEl.children].forEach((b,i)=>b.setAttribute("aria-pressed", SPEEDS[i].v===app.speed)); }
const playBtn=document.getElementById("play");
function syncPlay(){ playBtn.textContent=app.playing?"Pause":"Lecture"; }
globalThis.syncPlay=syncPlay;
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

const getJSON=u=>fetch(u).then(r=>{ if(!r.ok) throw new Error(u+" : HTTP "+r.status); return r.json(); });
Promise.all([getJSON("data/days.json"), getJSON("data/stats.json")])
  .then(([d,st])=>{ DATA=d; STATS=st; startApp(); })
  .catch(err=>{
    const box=document.createElement("div"); box.className="loaderr";
    box.innerHTML="Impossible de charger les journées (data/days.json).<br>Lancez l'application avec <code>npm start</code> puis ouvrez http://localhost:8080 : un fichier ouvert directement depuis le disque ne peut pas lire les données.";
    document.getElementById("mapwrap").appendChild(box); console.error(err);
  });

/* ------------------------------------------------------------------ */
/* Journées simulées : cartes, bilan, écran de configuration           */
/* ------------------------------------------------------------------ */
function addDayCard(d,i){
  const daysEl=document.getElementById("days");
  const b=document.createElement("button"); b.className="daycard"+(d.generated?" gen":""); b.type="button";
  const n=d.cases.length, u=d.cases.filter(c=>c.type!=="P").length;
  b.innerHTML=`<b>${d.generated?"Simulation : ":""}${d.label.replace(" 2026","")}</b><span>${n} interv. · ${u} urg. · ${d.cancelled.length} annul.</span>`;
  b.dataset.idx=i; b.onclick=()=>setDay(i);
  const first=daysEl.querySelector(".daycard:not(.newday)");
  if(d.generated && first) daysEl.insertBefore(b, daysEl.querySelector(".daycard.gen") || first); else daysEl.appendChild(b);
  return b;
}

function reportHTML(d){
  const R=d.report, B=d.baseline, cfg=d.cfg, V=d.validation;
  const delta=(v,b,unit="")=>{ if(b==null) return ""; const x=v-b; if(Math.abs(x)<0.5) return `<em class="dz">identique sans aléas</em>`; return `<em class="${x>0?"dbad":"dgood"}">${x>0?"+":""}${Math.round(x)}${unit} vs sans aléas</em>`; };
  const k=(v,label,cls="",extra="")=>`<div class="kpi ${cls}"><b>${v}</b><span>${label}</span>${extra}</div>`;
  const jour = d.jour ? d.jour.charAt(0).toUpperCase()+d.jour.slice(1) : "";
  const changes=(d.staffChanges||[]);
  return `<div class="sec report">
    <h2>Bilan de la simulation</h2>
    <p class="note">${d.label} · ${jour} ${d.date.split("-").reverse().join("/")} · ${formatParam("periode",cfg.periode)} · ${cfg.rooms.length} salles · ${cfg.sspiBeds} lits de SSPI · graine ${cfg.seed}</p>
    ${V? `<p class="valid ${V.violations?"ko":"ok"}">${V.violations? `${V.violations} incohérence${V.violations>1?"s":""} détectée${V.violations>1?"s":""} sur ${V.checks} contrôles` : `Contrôles de réalisme : ${V.checks} vérifications, aucune incohérence (personne à deux endroits, MAR à plus de deux patients, SSPI sans personnel, brancards)`}</p>` : ""}
    <p class="note">Les écarts « vs sans aléas » comparent à la même journée (mêmes patients, mêmes urgences habituelles, même graine) sans absences, pannes, retards de patients, complications ni afflux.</p>
    <h3 class="rh">Activité</h3>
    <div class="rgrid">
      ${k(R.done, `interventions réalisées, dont ${R.urg} urgences`)}
      ${k(R.deprog, "déprogrammées faute de temps", R.deprog?"bad":"", delta(R.deprog,B.deprog))}
      ${R.annulJ!=null? k(R.annulJ+R.absents, `annulées le jour même (${R.absents} absents, ${R.annulJ} à l'accueil)`) : ""}
      ${R.annul!=null? k(R.annul, "annulées avant le jour J (taux réel)") : ""}
      ${R.sallesFermees? k(R.sallesFermees, "cas perdus : salle fermée faute de personnel", "bad") : ""}
      ${R.urgReport? k(R.urgReport, "urgences reportées au lendemain", "bad") : ""}
    </div>
    <h3 class="rh">Délais</h3>
    <div class="rgrid">
      ${k(R.late+" min", `retard moyen du programmé (${R.lateN} cas à plus de 20 min)`, "", delta(R.late,B.late," min"))}
      ${R.urgInTime!=null? k(R.urgInTime+" %", "urgences prises en charge dans leur délai", R.urgInTime<90?"bad":"") : ""}
      ${k(R.urgWait+" min", `attente moyenne des urgences (max ${R.urgWaitMax} min)`)}
      ${k(dur(R.overMin), `de débordement après 18 h 30 (${R.overRooms} salle${R.overRooms>1?"s":""})`, "", delta(R.overMin,B.overMin," min"))}
    </div>
    ${R.waitMar!=null? `<h3 class="rh">Où le temps se perd (minutes cumulées)</h3>
    <div class="rgrid">
      ${k(R.roomWaitPatient, "salle prête, patient pas encore là")}
      ${k(R.waitMar, "attente d'un MAR (induction, réveil, ALR)")}
      ${k(R.waitChir, "attente du chirurgien")}
      ${k(R.bedBlock, `patient bloqué en salle faute de lit ou d'IDE en SSPI (${R.bedBlockN} cas)`, R.bedBlock>30?"bad":"")}
      ${k(R.waitBrancard+R.waitBran, "attente d'un brancard ou d'un brancardier")}
      ${k(R.waitPre, "attente d'un poste ou de l'IDE en pré-anesthésie")}
      ${k(R.waitEquip, "attente d'un équipement partagé")}
      ${k(R.waitSortie+R.waitAval, "sortie de SSPI retardée (MAR, lit d'aval)")}
    </div>
    ${R.waitVerif!=null? `<h3 class="rh">Vérifications, matériel et imprévus de l'intervention</h3>
    <div class="rgrid">
      ${k(R.waitVerif, `minutes de vérifications avant l'anesthésie (${R.vpa} visites du MAR, ${R.chirVisit} passages du chirurgien, ${R.labo} examens en urgence)`)}
      ${k(R.annulJeune+R.annulAnticoag+R.annulExamen+R.annulImplant, `annulations pour jeûne, anticoagulant, examen ou implant${R.jeuneReport? `, ${R.jeuneReport} report en fin de programme`:""}`, (R.annulJeune+R.annulAnticoag+R.annulExamen+R.annulImplant)?"bad":"")}
      ${k(R.waitSteri, `minutes d'attente de boîtes d'instruments${R.boxNC? ` (${R.boxNC} non conforme${R.boxNC>1?"s":""})`:""}`, R.waitSteri>30?"bad":"")}
      ${k(R.waitMateriel, "minutes d'attente de matériel (implant, dispositif, chariot, IBODE habilitée)")}
      ${k(R.waitRadio, "minutes d'attente du manipulateur radio")}
      ${k(R.waitExtempo+R.waitTransfu, `minutes d'attente d'extemporanés (${R.extempo}) et de produits sanguins (${R.transfu})`)}
    </div>
    <p class="note">${R.interne} intervention${R.interne>1?"s":""} avec un interne, ${R.intubDiff} intubation${R.intubDiff>1?"s":""} difficile${R.intubDiff>1?"s":""}, ${R.bmr} patient${R.bmr>1?"s":""} BMR, ${R.finProgramme} bionettoyage${R.finProgramme>1?"s":""} de fin de programme.${R.siPanne? ` Panne informatique : ${R.siPanne} min en mode dégradé.`:""}${R.autoclave? ` Panne d'autoclave : ${R.autoclave} min.`:""}</p>` : ""}
    <p class="note">Pic de la SSPI : ${R.sspiPeak}/${cfg.sspiBeds} lits. ${R.convHosp? R.convHosp+" ambulatoire(s) converti(s) en hospitalisation. ":""}${R.complic? R.complic+" complication(s) peropératoire(s). ":""}${changes.length? "Personnel : "+changes.map(x=>x.label+(x.absent?" absent":"")).join(", ")+"." : "Aucune absence de personnel."}</p>` : ""}
    <details class="hyp"><summary>Hypothèses à calibrer (${MODEL_HYPOTHESES.length} règles du modèle, ${PARAMS_A_CALIBRER.length} réglages)</summary>
      <p class="note">Ces valeurs ne sont pas mesurables dans l'export OPROOM. Les résultats qui en dépendent sont des ordres de grandeur, à confirmer avec les équipes du bloc.</p>
      <ul>${MODEL_HYPOTHESES.map(h=>`<li><b>${h.label}</b> : ${h.value}</li>`).join("")}</ul>
      <p class="note">Réglages à calibrer : ${PARAMS_A_CALIBRER.map(p=>`${p.label} (${formatParam(p.key,cfg[p.key])})`).join(", ")}.</p>
    </details>
    <div class="rbtns"><button class="btn" type="button" id="editScn">Modifier ce scénario</button><button class="btn" type="button" id="rerun">Relancer avec un autre tirage</button></div>
  </div>`;
}

const modal=document.createElement("div"); modal.className="modal"; modal.hidden=true; document.body.appendChild(modal);
let scn=null;
function openScenario(base){
  scn = base ? JSON.parse(JSON.stringify(base)) : defaultConfig();
  scn = {...paramDefaults(), ...scn};
  renderScenario(); modal.hidden=false; const f=modal.querySelector("input,button"); if(f) f.focus();
}
function closeScenario(){ modal.hidden=true; }
const SPEC_LIST = ()=>Object.keys(STATS.urg);
function paramControl(p, v){
  const tg=SOURCE_TAG[p.source], tag=tg?` <span class="ptag ${tg[0]}">${tg[1]}</span>`:"";
  const id="p-"+p.key, help=(p.help?`<small>${p.help}</small>`:"")+(tag?`<small class="psrc">${tag}</small>`:"");
  if(p.type==="bool") return `<label for="${id}">${p.label}</label><div><input id="${id}" data-param="${p.key}" type="checkbox" ${v?"checked":""}>${help}</div>`;
  if(p.type==="enum") return `<label for="${id}">${p.label}</label><div><select id="${id}" data-param="${p.key}">${p.options.map(o=>`<option value="${o[0]}" ${o[0]===v?"selected":""}>${o[1]}</option>`).join("")}</select>${help}</div>`;
  if(p.type==="time") return `<label for="${id}">${p.label}</label><div><input id="${id}" data-param="${p.key}" type="time" value="${fmt(v)}">${help}</div>`;
  const pct=p.unit==="%", step=p.step||1;
  return `<label for="${id}">${p.label} : <output id="o-${p.key}">${formatParam(p.key,v)}</output></label><div><input id="${id}" data-param="${p.key}" type="range" min="${p.min}" max="${p.max}" step="${step}" value="${v}">${help}</div>`;
}
function renderScenario(){
  const c=scn; const di=dayInfo(c.date);
  const evRows = c.events.map((e,i)=>`<li>${e.kind==="panne"
      ? `<span class="chip">PANNE</span> ${e.room} de ${fmt(e.at)} à ${fmt(e.until)}${e.label?` · ${e.label}`:""}`
      : `<span class="chip u">${({vitale:"IMMÉDIATE",urgente:"< 1 H",differee:"< 24 H"})[e.prio]||e.prio}</span> ${fmt(e.at)} · ${SPEC_SHORT(e.spec)}${e.dur?` · ${e.dur} min`:""}`}
      <button class="close" type="button" data-del="${i}">Retirer</button></li>`).join("");
  const adv = PARAM_GROUPS.filter(g=>g.id!=="calendrier").map(g=>{
    const ps=PARAMS.filter(p=>p.group===g.id);
    return `<details class="pgroup"><summary>${g.label} <span class="note">(${ps.length})</span></summary><div class="form">${ps.map(p=>paramControl(p,c[p.key])).join("")}</div></details>`;
  }).join("");
  modal.innerHTML=`<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mtitle">
    <div class="mhead"><h2 id="mtitle">Créer une journée à simuler</h2><button class="close" type="button" id="mclose">Fermer</button></div>
    <p class="note">Toutes les valeurs restent dans des bornes réalistes. Chaque réglage indique sa source : <span class="ptag data">données réelles</span>, <span class="ptag reg">réglementation</span> ou <span class="ptag cal">à calibrer</span> (hypothèse à faire valider par les équipes du bloc). Le programme et les urgences sont tirés des données réelles pour le jour et le mois choisis ; chaque personne, brancard, lit et équipement est une ressource unique, et la journée est vérifiée automatiquement à la fin.</p>
    <h3>Scénarios</h3>
    <div class="presets">${PRESETS.map(p=>`<button class="preset" type="button" data-preset="${p.id}"><b>${p.name}</b><span>${p.text}</span></button>`).join("")}</div>
    <h3>Journée</h3>
    <div class="form">
      <label for="f-name">Nom</label><input id="f-name" type="text" value="${(c.name||"").replace(/"/g,"&quot;")}">
      <label for="f-date">Date</label><div class="row"><input id="f-date" type="date" value="${c.date}"><span class="note">${di.jour}${di.weekend?" : pas de programme, garde seulement":` : activité habituelle ${Math.round(di.wf*100)} % (jour) × ${Math.round(di.mf*100)} % (mois)`}</span></div>
      ${paramControl(PARAM_BY_KEY.periode, c.periode)}
      <span class="flabel">Salles ouvertes</span><div><div class="roomchips">${ALL_ROOMS.map(r=>`<button type="button" class="rchip" data-room="${r}" aria-pressed="${c.rooms.includes(r)}">${r}${r===c.urgRoom?" · urg.":""}</button>`).join("")}</div><button class="btn small" type="button" id="f-autorooms">Tirer les salles selon le jour</button></div>
      <label for="f-urgroom">Salle d'urgence</label><select id="f-urgroom">${ALL_ROOMS.map(r=>`<option ${r===c.urgRoom?"selected":""}>${r}</option>`).join("")}</select>
      <label for="f-burst">Afflux de victimes : <output id="o-burst">${c.burst.n}</output></label><div class="row"><input id="f-burst" type="range" min="0" max="12" value="${c.burst.n}"><span>à</span><input id="f-burstat" type="time" value="${fmt(c.burst.at)}"></div>
      <label for="f-seed">Tirage aléatoire</label><div class="row"><input id="f-seed" type="number" min="1" max="99999" value="${c.seed}"><button class="btn" type="button" id="f-dice">Nouveau tirage</button></div>
    </div>
    <h3>Réglages détaillés</h3>
    ${adv}
    <h3>Événements de la journée</h3>
    <ul class="evlist">${evRows || `<li class="note">Aucun événement ajouté. Les urgences tirées au hasard s'ajoutent à cette liste.</li>`}</ul>
    <div class="addev">
      <select id="e-kind" aria-label="Type d'événement"><option value="vitale">Urgence immédiate</option><option value="urgente">Urgence à moins de 1 h</option><option value="differee">Urgence à moins de 24 h</option><option value="panne">Panne de salle</option></select>
      <input id="e-at" type="time" value="11:00" aria-label="Heure">
      <select id="e-spec" aria-label="Spécialité">${SPEC_LIST().map(s=>`<option value="${s}">${SPEC_SHORT(s)}</option>`).join("")}</select>
      <select id="e-room" aria-label="Salle" hidden>${ALL_ROOMS.map(r=>`<option>${r}</option>`).join("")}</select>
      <input id="e-dur" type="number" min="10" max="480" placeholder="durée (min)" aria-label="Durée en minutes">
      <button class="btn" type="button" id="e-add">Ajouter</button>
    </div>
    <div class="mfoot"><button class="btn play" type="button" id="m-run">Lancer la simulation</button></div>
  </div>`;
  const $=id=>modal.querySelector("#"+id);
  const toMin=v=>{ const [h,m]=v.split(":").map(Number); return h*60+(m||0); };
  modal.querySelectorAll("[data-param]").forEach(el=>{
    const key=el.dataset.param;
    const upd=()=>{ const p=PARAM_BY_KEY[key]; c[key]=clampParam(key, p.type==="bool"? el.checked : el.value); const o=$("o-"+key); if(o) o.textContent=formatParam(key,c[key]); };
    el.oninput=upd; el.onchange=upd;
  });
  $("f-name").oninput=e=>c.name=e.target.value;
  $("f-date").onchange=e=>{ if(e.target.value){ c.date=e.target.value; renderScenario(); } };
  $("f-burst").oninput=e=>{ c.burst.n=+e.target.value; $("o-burst").textContent=e.target.value; };
  $("f-burstat").onchange=e=>{ if(e.target.value) c.burst.at=toMin(e.target.value); };
  $("f-urgroom").onchange=e=>{ c.urgRoom=e.target.value; if(!c.rooms.includes(c.urgRoom)) c.rooms.push(c.urgRoom); renderScenario(); };
  $("f-seed").oninput=e=>{ c.seed=Math.max(1,+e.target.value||1); };
  $("f-dice").onclick=()=>{ c.seed=1+Math.floor(Math.random()*99998); $("f-seed").value=c.seed; };
  $("f-autorooms").onclick=()=>{ c.rooms=roomsFor(c.date, c.seed); renderScenario(); };
  $("mclose").onclick=closeScenario;
  modal.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>{ const p=PRESETS.find(x=>x.id===b.dataset.preset); scn=p.apply({...defaultConfig(), seed:c.seed}); renderScenario(); });
  modal.querySelectorAll("[data-room]").forEach(b=>b.onclick=()=>{ const r=b.dataset.room; c.rooms = c.rooms.includes(r) ? c.rooms.filter(x=>x!==r) : [...c.rooms, r]; if(!c.rooms.length) c.rooms=[r]; renderScenario(); });
  modal.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{ c.events.splice(+b.dataset.del,1); renderScenario(); });
  const kind=$("e-kind");
  kind.onchange=()=>{ const p=kind.value==="panne"; $("e-spec").hidden=p; $("e-room").hidden=!p; $("e-dur").placeholder = p? "durée de la panne (min)" : "durée (min)"; };
  $("e-add").onclick=()=>{
    const at=toMin($("e-at").value||"11:00"), d=+$("e-dur").value||0;
    if(kind.value==="panne") c.events.push({kind:"panne", room:$("e-room").value, at, until:at+(d||120), label:"Panne"});
    else c.events.push({kind:"urgence", prio:kind.value, at, spec:$("e-spec").value, dur:d||null});
    c.events.sort((a,b)=>a.at-b.at); renderScenario();
  };
  $("m-run").onclick=()=>runScenario(c);
}
function runScenario(cfg){
  const d=generateDay(cfg);
  DATA.push(d); SIMS.push(null); const i=DATA.length-1;
  addDayCard(d,i);
  closeScenario(); setDay(i);
  saveLog(getSim(i)).then(r=>{ if(r && r.saved){ d.logFiles=r.saved; if(app.dayIdx===i && !app.sim.selected) renderSide(true); } });
}
modal.addEventListener("click",e=>{ if(e.target===modal) closeScenario(); });
document.addEventListener("keydown",e=>{ if(e.code==="Escape" && !modal.hidden){ e.stopImmediatePropagation(); closeScenario(); } }, true);
document.addEventListener("click",e=>{
  if(e.target.id==="editScn") openScenario(app.sim.day.cfg);
  if(e.target.id==="csv1") downloadCSV(app.sim,false);
  if(e.target.id==="csv2") downloadCSV(app.sim,true);
  if(e.target.id==="rerun"){ const c={...app.sim.day.cfg, seed:1+Math.floor(Math.random()*99998)}; runScenario(c); }
});
