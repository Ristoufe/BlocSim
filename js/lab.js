/* Blocapta BlocSim - « Tester un outil » : fiche logiciel, campagne avec / sans outil, rapport */

const LAB_FICHES = [
  {file:"scantrace-v2.json", label:"ScanTrace v2 - traçabilité des implants (durées de l'éditeur)"},
  {file:"checklist-tablette.json", label:"CheckBloc - check-list sur tablette (mesuré sur site)"},
  {file:"scantrace-incomplete.json", label:"ScanTrace v2 - fiche commerciale incomplète"}
];
// palette catégorielle (référence dataviz, mode clair), dans l'ordre fixe des emplacements
const SERIES = ["#2a78d6","#eb6834","#1baf7a","#eda100"];
const ARM_COLOR = ["#7d8b91", SERIES[0], SERIES[1], SERIES[2]];   // « sans outil » en gris neutre
const ROLE_COLOR = {CHIR:SERIES[0], MAR:SERIES[1], IADE:SERIES[2], IBODE:SERIES[3]};
const VERDICT_TXT = {NON_ANALYSABLE:"Non analysable", ANALYSABLE_AVEC_RESERVES:"Analysable avec réserves", ANALYSABLE:"Analysable"};
const CONF_TXT = {aucune:"aucune", faible:"faible", moyenne:"moyenne", elevee:"élevée"};

const lab = {file:LAB_FICHES[0].file, fiche:null, check:null, scenario:"A", days:20, reps:20, human:{...HUMAN_DEFAULTS}, out:null, busy:false,
  llm:{status:null, model:null, busy:null, error:null, text:"", garde:null, generated:false}};
const labEl = document.createElement("div"); labEl.className="modal labwrap"; labEl.hidden=true; document.body.appendChild(labEl);
const esc = s => String(s??"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fr1 = x => x==null||!Number.isFinite(x) ? "-" : ((Math.round(x*10)/10)||0).toLocaleString("fr-FR");
const fr2 = x => x==null||!Number.isFinite(x) ? "-" : ((Math.round(x*100)/100)||0).toLocaleString("fr-FR");

function initLab(daysEl){
  const b=document.createElement("button"); b.className="daycard newday labbtn"; b.type="button";
  b.innerHTML=`<b>Tester un outil</b><span>fiche + avec / sans</span>`; b.onclick=openLab;
  daysEl.insertBefore(b, daysEl.firstChild.nextSibling);
}
async function llmStatus(){
  try{ lab.llm.status = await fetch("api/llm/status").then(r=>r.json()); }
  catch(e){ lab.llm.status = {ok:false, models:[], error:"Le serveur local ne relaie pas le LLM (lancer npm start)."}; }
  const S = lab.llm.status;
  if(!lab.llm.model) lab.llm.model = S.models?.includes(S.defaultModel) ? S.defaultModel : (S.models||[])[0] || null;
}
async function openLab(){
  labEl.hidden=false;
  if(!lab.llm.status) await llmStatus();
  if(!lab.fiche) await loadFiche(lab.file); else renderLab();
  labEl.querySelector("button,select")?.focus();
}
function closeLab(){ labEl.hidden=true; }
async function loadFiche(file){
  lab.file=file;
  try{ lab.fiche = await fetch("data/fiches/"+file).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }); }
  catch(e){ lab.fiche=null; }
  lab.check = lab.fiche ? checkFiche(lab.fiche) : null; lab.out=null; lab.llm.garde=null; lab.llm.generated=false;
  renderLab();
}

/* ------------------------------------------------------------------ */
/* Écran                                                               */
/* ------------------------------------------------------------------ */
function renderLab(){
  const c = lab.check;
  labEl.innerHTML = `<div class="mbox lbox" role="dialog" aria-modal="true" aria-labelledby="ltitle">
    <div class="mhead"><h2 id="ltitle">Tester un outil avant de le déployer</h2><button class="close" type="button" id="lclose">Fermer</button></div>
    <p class="note">Blocapta lit la fiche du logiciel, vérifie qu'elle est complète, puis simule plusieurs semaines du bloc deux fois : sans l'outil et avec l'outil, sur exactement les mêmes patients et les mêmes urgences. Les soignants sont des agents qui apprennent, se fatiguent, prennent ou perdent confiance et s'influencent entre eux.</p>
    <div class="lgrid">
      <div class="lcol">
        <h3>1. Fiche du logiciel</h3>
        <select id="l-fiche" aria-label="Fiche à analyser">${LAB_FICHES.map(f=>`<option value="${f.file}" ${f.file===lab.file?"selected":""}>${esc(f.label)}</option>`).join("")}${lab.file==="__upload"?`<option value="__upload" selected>${lab.llm.generated?"Fiche créée par l'IA":"Fiche importée"}</option>`:""}</select>
        <label class="upl">Importer une fiche (JSON au format du template) <input type="file" id="l-upload" accept=".json,application/json"></label>
        ${llmBarHTML()}
        ${c ? checkHTML(c) : `<p class="note">Fiche illisible.</p>`}
        ${llmTextHTML()}
        <h3>2. Scénario</h3>
        <div class="presets lsc">${FIL_ROUGE.map(s=>`<button class="preset" type="button" data-sc="${s.id}" aria-pressed="${s.id===lab.scenario}"><b>${s.id}. ${esc(s.name)}</b><span>${esc(s.text)}</span></button>`).join("")}</div>
        <h3>3. Réglages</h3>
        <div class="form lform">
          <label for="l-days">Durée : <output id="o-days">${lab.days} jours</output></label><input id="l-days" type="range" min="10" max="60" step="5" value="${lab.days}">
          <label for="l-reps">Répétitions : <output id="o-reps">${lab.reps}</output></label><input id="l-reps" type="range" min="5" max="50" step="5" value="${lab.reps}">
          <label for="l-lambda">Aversion à la perte λ : <output id="o-lambda">${fr2(lab.human.lambda)}</output></label><input id="l-lambda" type="range" min="1.8" max="2.25" step="0.05" value="${lab.human.lambda}">
          <label for="l-alpha">Vitesse d'apprentissage α <span class="tag">à calibrer</span> : <output id="o-alpha">${fr2(lab.human.alpha)}</output></label><input id="l-alpha" type="range" min="0.02" max="0.2" step="0.01" value="${lab.human.alpha}">
          <label for="l-kappa">Influence des collègues κ <span class="tag">à calibrer</span> : <output id="o-kappa">x${fr1(lab.human.kappaScale)}</output></label><input id="l-kappa" type="range" min="0" max="3" step="0.25" value="${lab.human.kappaScale}">
        </div>
        <div class="mfoot"><button class="btn play" type="button" id="l-run" ${!c||c.verdict==="NON_ANALYSABLE"||lab.busy?"disabled":""}>${lab.busy?"Calcul en cours…":"Lancer la comparaison"}</button></div>
        ${c && c.verdict==="NON_ANALYSABLE" ? `<p class="note crit">La fiche doit être complétée avant l'analyse : aucun résultat chiffré n'est produit.</p>` : ""}
      </div>
      <div class="lcol lres" id="l-res">${lab.out ? resultsHTML(lab.out) : `<div class="lempty">Choisis une fiche et un scénario, puis lance la comparaison. Le calcul prend quelques secondes.</div>`}</div>
    </div>
  </div>`;
  bindLab();
  if(lab.out) bindCharts();
}

/* relecteur IA (modèle local) */
function llmBarHTML(){
  const S = lab.llm.status, L = lab.llm;
  if(!S || !S.ok) return `<div class="llmbar off"><b>Relecteur IA indisponible</b><span>${esc(S?.error||"Ollama ne répond pas.")} Le contrôle se fait par les règles seules.</span></div>`;
  return `<div class="llmbar">
    <label for="l-model">Relecteur IA local</label>
    <select id="l-model">${S.models.map(m=>`<option ${m===L.model?"selected":""}>${esc(m)}</option>`).join("")}</select>
    <button class="btn" type="button" id="l-review" ${!lab.fiche||L.busy?"disabled":""}>${L.busy==="review"?"Relecture…":"Relire la fiche avec l'IA"}</button>
    ${L.error?`<span class="note crit">${esc(L.error)}</span>`:""}
  </div>`;
}
function llmTextHTML(){
  const S = lab.llm.status, L = lab.llm;
  if(!S || !S.ok) return "";
  return `<details ${L.generated||L.busy==="gen"?"open":""}><summary>Créer la fiche à partir d'un texte (notice, note de cadre)</summary>
    <p class="note">L'IA remplit le template à partir du texte. Ce qui n'y figure pas reste « Inconnu », et tout chiffre absent du texte est retiré.</p>
    <textarea id="l-text" rows="7" placeholder="Coller ici la notice de l'éditeur ou le compte rendu d'essai…">${esc(L.text)}</textarea>
    <div class="rbtns"><button class="btn" type="button" id="l-ex1">Exemple : notice ScanTrace</button><button class="btn" type="button" id="l-ex2">Exemple : note de cadre CheckBloc</button>
    <button class="btn play" type="button" id="l-gen" ${L.busy?"disabled":""}>${L.busy==="gen"?"Lecture du texte…":"Créer la fiche"}</button></div>
    ${L.generated?`<p class="note">Fiche créée par ${esc(L.model)}${L.garde&&L.garde.length?` · ${L.garde.length} chiffre(s) retiré(s) par le garde-fou`:""}. <button class="linkbtn" type="button" id="l-dl">Télécharger la fiche (JSON)</button></p>`:""}
  </details>`;
}

function checkHTML(c){
  const lvl = c.verdict==="NON_ANALYSABLE" ? "crit" : c.verdict==="ANALYSABLE" ? "ok" : "warn";
  const bad = c.champs.filter(x=>x.statut==="O");
  const llmNote = c.llm && c.llm.resume ? `<p class="note">Avis du relecteur IA : ${esc(c.llm.resume)}</p>` : c.llm && c.llm.erreur ? `<p class="note crit">Relecture IA impossible : ${esc(c.llm.erreur)}</p>` : "";
  return `<div class="verdict ${lvl}">
      <b>${VERDICT_TXT[c.verdict]}</b><span>Confiance de l'analyse : ${CONF_TXT[c.confiance]} · ${c.llm&&!c.llm.erreur?`règles + relecture IA (${esc(c.llm.model)}, ${fr1(c.llm.ms/1000)} s)`:"règles seules"}</span>
      <span class="mono">Obligatoires ${c.score_completude.obligatoires} · recommandés ${c.score_completude.recommandes} · facultatifs ${c.score_completude.facultatifs}</span>
    </div>${llmNote}
    ${bad.length? `<details ${c.verdict==="NON_ANALYSABLE"?"open":""}><summary>${bad.length} champ(s) obligatoire(s) à reprendre</summary><ul class="clist">${bad.map(x=>`<li><span class="mono">${x.id}</span> ${esc(x.label)} : <b>${x.statut_champ}</b>${x.critique?` <span class="tag">critique</span>`:""}${x.par==="llm"?` <span class="tag ia">IA</span> <span class="note">${esc(x.raison)}</span>`:""}</li>`).join("")}</ul></details>` : ""}
    ${c.alertes.length? `<details><summary>${c.alertes.length} alerte(s)</summary><ul class="clist">${c.alertes.map(a=>`<li><span class="tag">${a.type.replace(/_/g," ")}</span>${a.par&&a.par!=="regles"?` <span class="tag ia">${a.par==="llm"?"IA":"garde-fou"}</span>`:""} ${esc(a.detail)}</li>`).join("")}</ul></details>` : ""}
    ${c.questions_a_l_auteur.length? `<details ${c.verdict==="NON_ANALYSABLE"?"open":""}><summary>Questions à l'auteur de la fiche</summary><ol class="clist">${c.questions_a_l_auteur.slice(0,5).map(q=>`<li>${esc(q.question)}<br><span class="note">Exemple : ${esc(q.exemple_reponse)}</span></li>`).join("")}</ol></details>` : ""}
    ${c.fiche_normalisee? `<details><summary>Ce que la simulation retient de la fiche</summary><ul class="clist">
      <li>Périmètre : ${c.fiche_normalisee.rooms? c.fiche_normalisee.rooms.join(", ") : "toutes les salles"} · ${c.fiche_normalisee.specs? c.fiche_normalisee.specs.map(SPEC_SHORT).join(", ") : "toutes spécialités"}</li>
      ${c.fiche_normalisee.steps.map(s=>`<li>${esc(s.etape)} (${s.role}, ${s.inRoom?"en salle":"hors salle"}) : ${fr1(s.without)} min → ${fr1(s.with)} min <span class="tag">${esc(s.preuveLabel)}${s.spread>0.1?`, ± ${Math.round(s.spread*100)} %`:""}</span></li>`).join("")}
      <li>Disponibilité ${fr1(c.fiche_normalisee.availability*100)} % · support ${c.fiche_normalisee.supportOnSite?"sur place":"à distance"}, rétablissement ${c.fiche_normalisee.restoreMin} min · formation ${fr1(c.fiche_normalisee.trainingH)} h${c.fiche_normalisee.champions?" · référents dans l'équipe":""}</li>
    </ul></details>` : ""}`;
}

function bindLab(){
  const $=id=>labEl.querySelector("#"+id);
  $("lclose").onclick=closeLab;
  $("l-fiche").onchange=e=>{ if(e.target.value!=="__upload") loadFiche(e.target.value); };
  $("l-upload").onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ try{ lab.fiche=JSON.parse(rd.result); lab.check=checkFiche(lab.fiche); }catch(err){ lab.fiche=null; lab.check=null; alertBox("Le fichier n'est pas un JSON lisible."); } lab.file="__upload"; lab.out=null; renderLab(); };
    rd.readAsText(f);
  };
  labEl.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{ lab.scenario=b.dataset.sc; lab.out=null; renderLab(); });
  const bind=(id,set,show)=>{ const el=$(id); el.oninput=()=>{ set(+el.value); $(id.replace("l-","o-")).textContent=show(+el.value); }; };
  bind("l-days",v=>lab.days=v,v=>v+" jours"); bind("l-reps",v=>lab.reps=v,v=>v);
  bind("l-lambda",v=>lab.human.lambda=v,fr2); bind("l-alpha",v=>lab.human.alpha=v,fr2); bind("l-kappa",v=>lab.human.kappaScale=v,v=>"x"+fr1(v));
  $("l-run").onclick=runLab;
  const ms=$("l-model"); if(ms) ms.onchange=()=>{ lab.llm.model=ms.value; };
  const rv=$("l-review"); if(rv) rv.onclick=llmReview;
  const tx=$("l-text"); if(tx) tx.oninput=()=>{ lab.llm.text=tx.value; };
  const ex=(id,f)=>{ const b=$(id); if(b) b.onclick=async()=>{ lab.llm.text=await fetch("data/notices/"+f).then(r=>r.text()); renderLab(); }; };
  ex("l-ex1","scantrace-notice.txt"); ex("l-ex2","checkbloc-note-cadre.txt");
  const gn=$("l-gen"); if(gn) gn.onclick=llmGenerate;
  const dl=$("l-dl"); if(dl) dl.onclick=()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(lab.fiche,null,2)],{type:"application/json"})); a.download="fiche-"+String(lab.fiche.champs["B0.nom"]||"logiciel").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-")+".json"; a.click(); };
  const kd=$("l-keep"); if(kd) kd.onclick=showLabDay;
}
async function llmReview(){
  lab.llm.busy="review"; lab.llm.error=null; renderLab();
  try{ lab.check = await agent1(lab.fiche, {model:lab.llm.model}); lab.out=null; }
  catch(e){ lab.llm.error = "Relecture impossible : "+e.message; }
  lab.llm.busy=null; renderLab();
}
async function llmGenerate(){
  if(!lab.llm.text.trim()){ lab.llm.error="Coller d'abord un texte."; renderLab(); return; }
  lab.llm.busy="gen"; lab.llm.error=null; renderLab();
  try{
    const r = await agent2(lab.llm.text, {model:lab.llm.model});
    if(r.erreur) throw new Error(r.erreur);
    lab.fiche = r.fiche; lab.file="__upload"; lab.llm.garde=r.garde; lab.llm.generated=true;
    lab.check = checkFiche(lab.fiche, {alertes:r.garde}); lab.out=null;
  } catch(e){ lab.llm.error = "Création impossible : "+e.message; }
  lab.llm.busy=null; renderLab();
}
function alertBox(msg){ const r=labEl.querySelector("#l-res"); if(r) r.innerHTML=`<div class="lempty crit">${esc(msg)}</div>`; }

function runLab(){
  lab.busy=true; renderLab();
  setTimeout(()=>{
    const t0=performance.now();
    lab.out = runCampaign({fiche:lab.fiche, scenario:lab.scenario, days:lab.days, reps:lab.reps, human:{...lab.human}});
    lab.out.wall = performance.now()-t0;
    lab.busy=false; renderLab();
    labEl.querySelector("#l-res")?.scrollIntoView({block:"start", behavior:"smooth"});
  }, 30);
}

// rejouer une journée « avec outil » sur le plan animé
function showLabDay(){
  const o=lab.out; const sel=labEl.querySelector("#l-dayarm"), dsel=labEl.querySelector("#l-dayn");
  const arm=+sel.value, d=+dsel.value;
  const day=campaignDay(o, arm, d);
  DATA.push(day); SIMS.push(null); const i=DATA.length-1;
  addDayCard(day,i); closeLab(); setDay(i);
}

/* ------------------------------------------------------------------ */
/* Résultats                                                           */
/* ------------------------------------------------------------------ */
function resultsHTML(o){
  if(o.blocked) return `<div class="lempty crit">Fiche non analysable : complète-la d'abord.</div>`;
  const R=o.report, A=o.arms;
  const lvl = {rouge:"crit", orange:"warn", vert:"ok"}[R.level];
  const icon = {rouge:"✕", orange:"!", vert:"✓"};
  const defs = TOTAL_DEFS;
  const cell=(t,i,def)=>{
    const v=t[def.k];
    if(i===0 && (def.k==="T"||def.k==="adoption")) return `<td class="mono dz">-</td>`;
    const val = def.k==="T"? fr2(v.med) : fr1(v.med)+(def.unit==="%"?" %":"");
    const rng = v.p10!=null && v.p90!=null && v.p10!==v.p90 ? `<small>${def.k==="T"?fr2(v.p10):fr1(v.p10)} à ${def.k==="T"?fr2(v.p90):fr1(v.p90)}</small>` : "";
    let d="";
    if(i>0 && def.k!=="T" && def.k!=="adoption" && v.dMed!=null && Math.abs(v.dMed)>=0.05){
      const bad = def.worse*v.dMed>0, good = def.worse*v.dMed<0;
      d=`<em class="${bad?"dbad":good?"dgood":"dz"}">${v.dMed>0?"+":""}${fr1(v.dMed)}</em>`;
    }
    return `<td class="mono">${val}${d}${rng}</td>`;
  };
  const dayOpts = Array.from({length:o.C.days},(_,d)=>`<option value="${d}" ${o.scenario.id==="B"&&d===1?"selected":""}>Jour ${d+1} (${o.daily[0][d].date.split("-").reverse().slice(0,2).join("/")})</option>`).join("");
  return `
  <div class="concl ${lvl}">
    <div class="ctop"><span class="cicon" aria-hidden="true">${icon[R.level]}</span><b>${esc(R.conclusion)}</b></div>
    <span class="cconf">Confiance de l'analyse : <b>${esc(R.confidence)}</b> · ${o.C.days} jours ouvrés · ${o.C.reps} répétitions · ${fr1((o.wall||o.ms)/1000)} s de calcul</span>
    <ul>${R.lines.map(l=>`<li>${esc(l)}</li>`).join("")}</ul>
  </div>
  <h3>Signaux de risque pour les patients et les équipes</h3>
  <ul class="risks">${R.risks.map(r=>`<li class="${{rouge:"crit",orange:"warn",vert:"ok"}[r.level]}"><span class="ricon" aria-hidden="true">${icon[r.level]}</span><span class="rlvl">${r.level}</span>${esc(r.txt)}</li>`).join("")}</ul>
  <h3>Confiance dans l'outil, jour après jour</h3>
  ${trustChart(o)}
  ${o.scenario.id==="B" && o.cohort ? cohortChart(o) : ""}
  ${o.scenario.id==="C" && o.rooms ? roomChart(o) : roleChart(o)}
  <h3>Retard ajouté par l'outil, semaine par semaine</h3>
  ${weekChart(o)}
  <h3>Tableau comparatif <span class="note">(médiane, fourchette 10 % - 90 % des répétitions, écart au bras sans outil)</span></h3>
  <div class="tscroll"><table class="ltable"><thead><tr><th></th>${A.map((a,i)=>`<th><i class="sw" style="background:${ARM_COLOR[i]}"></i>${esc(a.label)}</th>`).join("")}</tr></thead>
  <tbody>${defs.map(def=>`<tr><th>${esc(def.label)}${def.unit&&def.unit!=="%"?` (${def.unit})`:""}</th>${o.totals.map((t,i)=>cell(t,i,def)).join("")}</tr>`).join("")}</tbody></table></div>
  <h3>Voir une journée sur le plan</h3>
  <div class="row wrap"><select id="l-dayarm" aria-label="Bras">${A.map((a,i)=>`<option value="${i}" ${i===A.length-1?"selected":""}>${esc(a.label)}</option>`).join("")}</select><select id="l-dayn" aria-label="Jour">${dayOpts}</select><button class="btn" type="button" id="l-keep">Rejouer cette journée</button></div>
  <p class="note">La journée s'ajoute à la barre du haut : pannes, contournements et échecs de l'outil apparaissent dans le fil des événements.</p>
  <h3>Hypothèses et paramètres</h3>
  <ul class="clist">${R.hypotheses.map(h=>`<li>${esc(h)}</li>`).join("")}</ul>
  <table class="ltable params"><tbody>${HUMAN_PARAMS_DOC.map(p=>`<tr><th>${esc(p.label)}</th><td class="mono">${fr2((o.C.human&&o.C.human[p.k])??HUMAN_DEFAULTS[p.k])}</td><td>${esc(p.src)} ${p.calib?`<span class="tag">à calibrer</span>`:""}</td></tr>`).join("")}</tbody></table>
  <div class="rbtns"><button class="btn" type="button" id="l-csv">Exporter les courbes (CSV)</button></div>`;
}

/* ------------------------------------------------------------------ */
/* Graphiques SVG (survol : réticule + infobulle)                      */
/* ------------------------------------------------------------------ */
const CHARTS = {};
let chartN = 0;
function lineChart({series, xs, yMin, yMax, yFmt, yLabel, band=true, h=220, fit=false}){
  if(fit){
    // échelle resserrée sur les données (pas de 0,05), bornée à [yMin, yMax]
    const v=series.flatMap(s=>s.pts.flatMap(p=>[p.v,p.lo,p.hi])).filter(Number.isFinite);
    yMin=Math.max(yMin, Math.floor((Math.min(...v)-0.03)*20)/20); yMax=Math.min(yMax, Math.ceil((Math.max(...v)+0.03)*20)/20);
  }
  const id="ch"+(++chartN), W=640, H=h, L=44, Rm=150, T=12, B=26;
  const x=i=>L+(W-L-Rm)*(xs.length<2?0:i/(xs.length-1)), y=v=>T+(H-T-B)*(1-(v-yMin)/(yMax-yMin));
  const ticks=[]; const step=(yMax-yMin)/4; for(let k=0;k<=4;k++) ticks.push(yMin+k*step);
  const grid=ticks.map(v=>`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" class="ax" text-anchor="end">${yFmt(v)}</text>`).join("");
  const xt=xs.map((d,i)=>i%5===0||i===xs.length-1?`<text x="${x(i)}" y="${H-8}" class="ax" text-anchor="middle">${d}</text>`:"").join("");
  // étiquettes directes à droite, écartées pour ne pas se chevaucher
  const ends=series.map((s,k)=>({k, y:y(s.pts[s.pts.length-1].v)})).sort((a,b)=>a.y-b.y);
  for(let i=1;i<ends.length;i++) if(ends[i].y-ends[i-1].y<14) ends[i].y=ends[i-1].y+14;
  const paths=series.map((s,k)=>{
    const d=s.pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const bd = band && s.pts[0].lo!=null ? `<path class="band" fill="${s.color}" d="${s.pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.hi).toFixed(1)}`).join("")}${[...s.pts].reverse().map((p,j)=>`L${x(s.pts.length-1-j).toFixed(1)},${y(p.lo).toFixed(1)}`).join("")}Z"/>` : "";
    const e=ends.find(z=>z.k===k);
    return `${bd}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dash?'stroke-dasharray="5 4"':""}/>
      <circle cx="${x(s.pts.length-1)}" cy="${y(s.pts[s.pts.length-1].v)}" r="4" fill="${s.color}" stroke="#fcfcfb" stroke-width="2"/>
      <text x="${W-Rm+8}" y="${e.y+4}" class="dl">${esc(s.label)} ${yFmt(s.pts[s.pts.length-1].v)}</text>`;
  }).join("");
  CHARTS[id]={series, xs, x, y, yFmt, L, R:W-Rm, T, B:H-B, W, H};
  return `<div class="chart" data-chart="${id}">
    <div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)}">${grid}${xt}${paths}<line class="xh" x1="0" x2="0" y1="${T}" y2="${H-B}" visibility="hidden"/><rect class="hit" x="${L}" y="${T}" width="${W-L-Rm}" height="${H-T-B}" fill="transparent"/></svg>
    <div class="ctip" hidden></div></div>`;
}
function bindCharts(){
  labEl.querySelectorAll("[data-chart]").forEach(el=>{
    const C=CHARTS[el.dataset.chart]; if(!C) return;
    const svg=el.querySelector("svg"), tip=el.querySelector(".ctip"), xh=el.querySelector(".xh");
    const move=e=>{
      const r=svg.getBoundingClientRect(), px=(e.clientX-r.left)*C.W/r.width;
      let i=Math.round((px-C.L)/(C.R-C.L)*(C.xs.length-1)); i=Math.max(0,Math.min(C.xs.length-1,i));
      const X=C.x(i); xh.setAttribute("x1",X); xh.setAttribute("x2",X); xh.setAttribute("visibility","visible");
      tip.hidden=false;
      tip.innerHTML=`<b>${esc(C.xs[i])}</b>`+C.series.map(s=>{ const p=s.pts[i]; return `<div><i style="background:${s.color}"></i>${esc(s.label)} <span class="mono">${C.yFmt(p.v)}${p.lo!=null?` (${C.yFmt(p.lo)} à ${C.yFmt(p.hi)})`:""}</span></div>`; }).join("");
      const left=X/C.W*r.width; tip.style.left=(left>r.width*0.55? left-tip.offsetWidth-12 : left+12)+"px"; tip.style.top="28px";
    };
    svg.addEventListener("pointermove",move);
    svg.addEventListener("pointerleave",()=>{ tip.hidden=true; xh.setAttribute("visibility","hidden"); });
  });
  labEl.querySelectorAll("[data-bar]").forEach(el=>{
    const tip=el.closest(".chart").querySelector(".ctip");
    el.addEventListener("pointerenter",()=>{ tip.hidden=false; tip.innerHTML=el.dataset.bar; const r=el.closest(".chart").getBoundingClientRect(), b=el.getBoundingClientRect(); tip.style.left=Math.min(r.width-180, b.left-r.left)+"px"; tip.style.top="28px"; });
    el.addEventListener("pointerleave",()=>{ tip.hidden=true; });
  });
  const csv=labEl.querySelector("#l-csv"); if(csv) csv.onclick=()=>labCSV(lab.out);
}
const xsOf = o => o.daily[0].map(x=>x.date.slice(8,10)+"/"+x.date.slice(5,7));

function trustChart(o){
  const series=o.arms.map((a,i)=>i===0?null:{label:a.label, color:ARM_COLOR[i], pts:o.daily[i].map(x=>({v:x.T.med, lo:x.T.p10, hi:x.T.p90}))}).filter(Boolean);
  return lineChart({series, xs:xsOf(o), yMin:0, yMax:1, yFmt:fr2, yLabel:"Confiance moyenne des soignants dans l'outil, de 0 à 1", fit:true})+
    `<p class="note">Confiance moyenne de tous les soignants, de 0 (aucune) à 1 (totale). Bande : 80 % des répétitions. Échelle resserrée sur les valeurs observées.${o.scenario.id==="B"?" La panne survient le jour 2.":""}</p>`;
}
function cohortChart(o){
  const K=o.cohort;
  const series=o.arms.map((a,i)=>K.arms[i]?{label:a.label.replace("Avec outil, ",""), color:ARM_COLOR[i], pts:K.arms[i].map(x=>({v:x.med, lo:x.p10, hi:x.p90}))}:null).filter(Boolean);
  return `<h3>Les ${fr1(K.n)} soignants touchés par la panne du jour 2</h3>`+lineChart({series, xs:xsOf(o), yMin:0, yMax:1, yFmt:fr2, yLabel:"Confiance des soignants touchés par la panne précoce", fit:true})+
    `<p class="note">Mêmes soignants dans chaque bras : avec un support sur place, sans support, et sans panne du tout (témoin). L'écart qui persiste est la trace de la panne.</p>`;
}
function roleChart(o){
  const i=o.mainArm ?? o.arms.length-1;
  const series=Object.keys(ROLE_LABEL).map(r=>({label:ROLE_LABEL[r], color:ROLE_COLOR[r], pts:o.daily[i].map(x=>({v:x.TR[r].med}))}));
  return `<h3>Confiance par métier (${esc(o.arms[i].label.toLowerCase())})</h3>`+lineChart({series, xs:xsOf(o), yMin:0, yMax:1, yFmt:fr2, yLabel:"Confiance par métier", band:false, h:200, fit:true});
}
function roomChart(o){
  const rc=o.rooms.find(r=>r.arm==="reticent"), ctl=o.rooms.find(r=>r.arm==="avec");
  const rows=[
    {label:`${rc.skepticRoom}, avec le chirurgien réticent`, v:rc.skeptic, c:ARM_COLOR[2]},
    {label:`${rc.skepticRoom}, même salle sans réticent`, v:ctl.skeptic, c:ARM_COLOR[1]},
    {label:`${rc.championRoom}, salle de l'IBODE championne`, v:rc.champion, c:ARM_COLOR[2]},
    {label:"Autres salles (moyenne)", v:rc.others, c:ARM_COLOR[2]}
  ];
  return `<h3>Confiance de l'équipe paramédicale par salle, en fin de campagne</h3><div class="chart hbars">${rows.map(r=>`<div class="hb" data-bar="<b>${esc(r.label)}</b><div class='mono'>${fr2(r.v)}</div>"><span>${esc(r.label)}</span><div class="track"><i style="width:${Math.max(1,r.v*100)}%;background:${r.c}"></i></div><b class="mono">${fr2(r.v)}</b></div>`).join("")}<div class="ctip" hidden></div></div>`;
}
function weekChart(o){
  const W=640, H=200, L=44, T=12, B=26, R=16;
  const arms=o.arms.map((a,i)=>i).slice(1), weeks=o.weekly[1].length;
  const vals=arms.flatMap(i=>o.weekly[i].flatMap(w=>[w.late.p10,w.late.p90,w.late.med])).filter(Number.isFinite);
  let lo=Math.min(0,...vals), hi=Math.max(0.5,...vals); const pad=(hi-lo)*0.1; lo-=pad; hi+=pad;
  const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const gw=(W-L-R)/weeks, bw=Math.min(28,(gw-16)/arms.length-2);
  const ticks=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" class="ax" text-anchor="end">${fr1(v)}</text>`).join("");
  const bars=arms.map((ai,k)=>o.weekly[ai].map((w,j)=>{
    const cx=L+gw*j+gw/2+(k-(arms.length-1)/2)*(bw+2), v=w.late.med, y0=y(0), y1=y(v);
    const top=Math.min(y0,y1), h=Math.max(1,Math.abs(y1-y0)), r=Math.min(4,h/2,bw/2);
    // barre arrondie seulement côté valeur, ancrée sur zéro
    const path = v>=0 ? `M${cx-bw/2},${y0}V${top+r}Q${cx-bw/2},${top} ${cx-bw/2+r},${top}H${cx+bw/2-r}Q${cx+bw/2},${top} ${cx+bw/2},${top+r}V${y0}Z`
                      : `M${cx-bw/2},${y0}V${top+h-r}Q${cx-bw/2},${top+h} ${cx-bw/2+r},${top+h}H${cx+bw/2-r}Q${cx+bw/2},${top+h} ${cx+bw/2},${top+h-r}V${y0}Z`;
    const tipTxt=`<b>Semaine ${w.week} · ${esc(o.arms[ai].label)}</b><div class='mono'>${v>0?"+":""}${fr1(v)} min par intervention (${fr1(w.late.p10)} à ${fr1(w.late.p90)})</div>`;
    return `<g data-bar="${tipTxt}"><rect x="${cx-bw/2-4}" y="${T}" width="${bw+8}" height="${H-T-B}" fill="transparent"/><path d="${path}" fill="${ARM_COLOR[ai]}"/><line x1="${cx}" x2="${cx}" y1="${y(w.late.p10)}" y2="${y(w.late.p90)}" class="whisk"/></g>`;
  }).join("")).join("");
  const xl=Array.from({length:weeks},(_,j)=>`<text x="${L+gw*j+gw/2}" y="${H-8}" class="ax" text-anchor="middle">Semaine ${j+1}</text>`).join("");
  return `<div class="chart">${arms.length>1?`<div class="legend">${arms.map(i=>`<span><i style="background:${ARM_COLOR[i]}"></i>${esc(o.arms[i].label)}</span>`).join("")}</div>`:""}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Retard ajouté par l'outil, en minutes par intervention programmée, semaine par semaine">${ticks}<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" class="zero"/>${bars}${xl}</svg><div class="ctip" hidden></div></div>
    <p class="note">Minutes de retard en plus (ou en moins) par intervention programmée, comparé à la même semaine sans outil. Trait : 80 % des répétitions.</p>`;
}

function labCSV(o){
  const roles=Object.keys(ROLE_LABEL);
  const head=["Bras","Jour","Date","Retard moyen (min)","Débordement (min)","Déprogrammées","Réalisées","Occupation (%)","Confiance moyenne","Usage de l'outil (%)","Erreurs attendues","Soignants en surcharge",...roles.map(r=>"Confiance "+r),...roles.map(r=>"Charge "+r)];
  const f=v=>v==null?"":String(Math.round(v*1000)/1000).replace(".",",");
  const rows=[]; o.daily.forEach((D,i)=>D.forEach(x=>rows.push([o.arms[i].label,x.d+1,x.date,f(x.late.med),f(x.overMin.med),f(x.deprog.med),f(x.done.med),f(x.occ.med),f(x.T.med),x.adoption.med==null?"":f(100*x.adoption.med),f(x.err.med),f(x.overload.med),...roles.map(r=>f(x.TR[r].med)),...roles.map(r=>f(x.TLX[r].med))])));
  const blob=new Blob(["﻿"+[head,...rows].map(r=>r.join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`blocapta-${o.norm.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-scenario-${o.scenario.id}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

labEl.addEventListener("click",e=>{ if(e.target===labEl) closeLab(); });
document.addEventListener("keydown",e=>{ if(e.code==="Escape" && !labEl.hidden){ e.stopImmediatePropagation(); closeLab(); } }, true);
