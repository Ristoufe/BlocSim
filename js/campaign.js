/* Blocapta BlocSim - campagnes : plusieurs semaines « sans outil » contre « avec outil »
 *
 * Les deux bras d'une campagne voient exactement les mêmes journées (mêmes patients, mêmes durées
 * de base, mêmes urgences : nombres aléatoires communs). La seule différence est l'outil.
 * La campagne est répétée plusieurs fois (graines différentes) pour donner des fourchettes.
 */

const FIL_ROUGE = [
  {id:"A", name:"Déploiement un lundi à 8 h",
   text:"L'outil est mis en service un lundi à 8 h dans tout son périmètre. On suit retards, annulations, fatigue et confiance sur le premier mois.",
   days:20},
  {id:"B", name:"Panne dès les premiers usages",
   text:"L'outil tombe en panne le mardi matin de la première semaine. On compare la remontée de la confiance avec et sans support technique sur place.",
   days:20, forcedOutage:{day:1, at:570}},
  {id:"C", name:"Chirurgien senior réticent",
   text:"Le chirurgien titulaire d'une salle est très sceptique et influent. On regarde si sa réticence se propage à son équipe, comparée à une salle menée par une IBODE « championne ».",
   days:20, skeptic:true}
];

function toolFromFiche(norm, opts={}){
  if(!norm) return null;
  return {
    name:norm.name, active:true,
    rooms:norm.rooms, specs:norm.specs,
    steps:norm.steps.map(s=>({...s})),
    availability:norm.availability,
    supportOnSite: opts.support==="present" ? true : opts.support==="absent" ? false : norm.supportOnSite,
    restoreMin: opts.support==="present" ? 30 : opts.support==="absent" ? Math.max(180, norm.restoreMin) : norm.restoreMin,
    learn0: 1.5/(1+norm.trainingH/2),       // surcoût du premier usage, réduit par la formation (à calibrer)
    microFail:norm.microFail,
    degradedExtra:norm.degradedExtra,
    champions:norm.champions
  };
}

const quant=(a,q)=>{ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const i=(s.length-1)*q, lo=Math.floor(i), hi=Math.ceil(i); return s[lo]+(s[hi]-s[lo])*(i-lo); };
const mean=a=>a.length? a.reduce((x,y)=>x+y,0)/a.length : null;
function addWorkdays(date, n){
  const d=new Date(date+"T12:00:00Z"); let k=0;
  while(k<n){ d.setUTCDate(d.getUTCDate()+1); const w=d.getUTCDay(); if(w!==0 && w!==6) k++; }
  return d.toISOString().slice(0,10);
}

/* ------------------------------------------------------------------ */
/* Un bras, une répétition                                             */
/* ------------------------------------------------------------------ */
function runArm(arm, C, rep){
  const tool = arm.tool ? JSON.parse(JSON.stringify(arm.tool)) : null;
  // tirage des paramètres incertains de l'outil, commun à tous les bras d'une même répétition
  const pr = rng((C.seed+rep*7907)*31+11);
  if(tool) tool.steps.forEach(st=>{ const u=pr()*2-1; st.with = Math.max(0.1, st.with*(1+st.spread*u)); });
  const useTool = tool && tool.active;
  const profiles = (arm.profiles||[]).map(p=>({...p}));
  const H = makeTeam(C.human, C.seed+rep*1000, profiles);
  const series = [];
  for(let d=0; d<C.days; d++){
    const date = d===0 ? C.start : addWorkdays(C.start, d);
    const next = addWorkdays(date, 1);
    const gap = Math.round((new Date(next)-new Date(date))/864e5);
    // pannes de l'outil ce jour : même tirage pour tous les bras, durée selon le support
    const or = rng((C.seed+rep*7907+d*131)*17+3);
    const outages = [];
    if(useTool){
      const rate = (1-tool.availability)*1440/120;          // nombre moyen de pannes par jour
      if(or() < rate){ const at=480+Math.floor(or()*540); outages.push({from:at, to:at+Math.round(tool.restoreMin*(0.6+0.8*or()))}); }
      if(C.forcedOutage && !arm.noForced && C.forcedOutage.day===d){ const at=C.forcedOutage.at; outages.push({from:at, to:at+(tool.supportOnSite?30:180)}); }
    }
    // salles ouvertes ce jour-là : tirées comme dans le moteur (jour de la semaine, mois, taux réels)
    const seed = C.seed+rep*1000+d;
    const cfg = {...C.cfg, seed, date, rooms: typeof roomsFor==="function" ? roomsFor(date, seed) : C.cfg.rooms, name:`${arm.label} - jour ${d+1}`};
    const hook = (c,s)=>humanCase(H, c, s, tool, {outages});
    const day = generateDay(cfg, hook);
    if(C.keepDay===d){
      // journée gardée pour la rejouer sur le plan : pannes et usages de l'outil dans le fil des événements
      const zr=(tool.rooms&&tool.rooms[0])||cfg.rooms[0]; outages.forEach(z=>{ day.extraEvents.push({t:z.from, room:zr, txt:`Panne de ${tool.name} : mode dégradé jusqu'à ${fmt(z.to)}`, kind:"u"}); day.extraEvents.push({t:z.to, room:zr, txt:`${tool.name} de nouveau disponible`, kind:"bio"}); });
      day.cases.forEach(c=>{ if(!c.tool) return; const k=c.tool.map(x=>x.kind); const txt = k.includes("panne")? `${tool.name} en panne : ancienne méthode (${c.proc})` : k.includes("contournement")? `${tool.name} contourné par l'équipe (${c.proc})` : k.includes("echec")? `${tool.name} : échec ponctuel, reprise à la main (${c.proc})` : null; if(txt) day.extraEvents.push({t:c.s+2, room:c.room, txt, kind:"late"}); });
      day.label = `${arm.label}, jour ${d+1}`;
      return {kept:day};
    }
    humanEndDay(H, gap);
    const hs = humanDaySummary(H);
    const R = day.report;
    const roomT = {};
    for(const a of Object.values(H.agents)) if(a.room && a.role!=="CHIR" && a.role!=="MAR" && !/garde/.test(a.code)) (roomT[a.room]=roomT[a.room]||[]).push(a.T);
    series.push({
      d, date,
      done:R.done, deprog:R.deprog, annul:R.annul, late:R.late, overMin:R.overMin, urgWait:R.urgWait, occ:R.occ,
      outMin: outages.reduce((x,z)=>x+z.to-z.from,0),
      T:hs.T, adoption:hs.adoption, err:hs.err, overload:hs.overload, gaps:hs.gaps, lowTrust:hs.lowTrust,
      TR:Object.fromEntries(Object.entries(hs.byRole).map(([k,v])=>[k,v.T])),
      TLX:Object.fromEntries(Object.entries(hs.byRole).map(([k,v])=>[k,v.tlx])),
      F:Object.fromEntries(Object.entries(hs.byRole).map(([k,v])=>[k,v.F])),
      roomT:Object.fromEntries(Object.entries(roomT).map(([k,v])=>[k,mean(v)]))
    });
  }
  return {series, agents:Object.values(H.agents).map(a=>({code:a.code, role:a.role, room:a.room, profile:a.profile, T0:a.T0, T:a.T, F:a.F, uses:a.uses, fails:a.fails, gaps:a.gaps, firstOut:a.firstOut, Th:a.hist.map(h=>h.T)}))};
}

/* ------------------------------------------------------------------ */
/* Campagne complète                                                   */
/* ------------------------------------------------------------------ */
// opts : {fiche (objet JSON), scenario:"A"|"B"|"C", days, reps, seed, start, human:{lambda,alpha,...}, cfg}
function runCampaign(opts){
  const sc = FIL_ROUGE.find(s=>s.id===(opts.scenario||"A")) || FIL_ROUGE[0];
  const check = checkFiche(opts.fiche);
  if(check.verdict==="NON_ANALYSABLE") return {blocked:true, check, scenario:sc};
  const norm = check.fiche_normalisee;
  const cfg = opts.cfg || defaultConfig();
  const C = {
    seed: opts.seed ?? 42, days: opts.days || sc.days, reps: opts.reps || 20,
    start: opts.start || "2026-11-16", human: opts.human || {}, cfg,
    forcedOutage: sc.forcedOutage || null
  };
  // salles du périmètre de l'outil, des plus souvent ouvertes aux moins souvent ouvertes
  const scopeRooms = ALL_ROOMS.filter(r=>r!==cfg.urgRoom && (!norm.rooms || norm.rooms.includes(r)))
    .sort((a,b)=>(STATS.rooms[b]?.open||0)-(STATS.rooms[a]?.open||0));
  const champ = (room)=>({kind:"champion", role:"IBODE", room, T:0.85, kappa:0.03, influence:2, label:"IBODE championne"});
  const baseProfiles = norm.champions && scopeRooms.length ? [champ((scopeRooms[1]||scopeRooms[0]))] : [];
  // bras de référence : mêmes étapes, faites à l'ancienne
  const legacy = toolFromFiche(norm); legacy.active = false;
  const arms = [{id:"sans", label:"Sans outil", tool:legacy, profiles:[]}];
  if(sc.id==="B"){
    arms.push({id:"support", label:"Avec outil, support sur place", tool:toolFromFiche(norm,{support:"present"}), profiles:baseProfiles});
    arms.push({id:"nosupport", label:"Avec outil, sans support", tool:toolFromFiche(norm,{support:"absent"}), profiles:baseProfiles});
    arms.push({id:"sanspanne", label:"Avec outil, sans panne", tool:toolFromFiche(norm,{support:"present"}), profiles:baseProfiles, noForced:true});   // témoin : même support que le bras « support », seule la panne forcée diffère
  } else if(sc.id==="C"){
    const sk = scopeRooms[0], ch = (scopeRooms[1]||scopeRooms[0]);
    const skeptic = {kind:"sceptique", role:"CHIR", room:sk, T:0.1, kappa:0.02, influence:3, label:"Chirurgien senior réticent"};
    arms.push({id:"avec", label:"Avec outil, sans réticent", tool:toolFromFiche(norm), profiles:[champ(ch)]});
    arms.push({id:"reticent", label:"Avec outil, chirurgien réticent", tool:toolFromFiche(norm), profiles:[skeptic, champ(ch)]});
  } else {
    arms.push({id:"avec", label:"Avec outil", tool:toolFromFiche(norm), profiles:baseProfiles});
  }
  const t0 = Date.now();
  const runs = arms.map(arm=>Array.from({length:C.reps}, (_,rep)=>runArm(arm, C, rep)));
  const out = {blocked:false, check, scenario:sc, norm, arms:arms.map(a=>({id:a.id, label:a.label})), C:{...C, cfg:undefined}, ms:Date.now()-t0};
  out.daily = arms.map((a,i)=>aggregateDaily(runs[i], C.days));
  out.totals = arms.map((a,i)=>aggregateTotals(runs[i], runs[0]));
  out.rooms = sc.id==="C" ? roomCompare(runs, arms, scopeRooms[0], (scopeRooms[1]||scopeRooms[0])) : null;
  out.weekly = arms.map((a,i)=>weeklyDelta(runs[i], runs[0], C.days));
  out.mainArm = sc.id==="A" ? 1 : 2;
  out.cohort = sc.id==="B" ? cohortTrust(runs, arms, C.days) : null;
  out.agentsEnd = arms.map((a,i)=>runs[i][0].agents);
  out.report = buildCampaignReport(out);
  out._arms = arms; out._C = C;
  return out;
}

// rejoue un jour précis d'un bras (première répétition) pour l'afficher sur le plan
function campaignDay(out, armIdx, d){
  const C = {...out._C, keepDay:d};
  return runArm(out._arms[armIdx], C, 0).kept;
}

const DAILY_KEYS = ["late","overMin","deprog","done","occ","urgWait","T","adoption","err","overload","gaps","outMin"];
function aggregateDaily(reps, days){
  const res = [];
  for(let d=0; d<days; d++){
    const rows = reps.map(r=>r.series[d]);
    const o = {d, date:rows[0].date};
    for(const k of DAILY_KEYS){ const v=rows.map(x=>x[k]).filter(x=>x!=null); o[k]={med:quant(v,0.5), p10:quant(v,0.1), p90:quant(v,0.9)}; }
    for(const g of ["TR","TLX","F"]){ o[g]={}; for(const role of Object.keys(ROLE_LABEL)){ const v=rows.map(x=>x[g][role]).filter(x=>x!=null); o[g][role]={med:quant(v,0.5), p10:quant(v,0.1), p90:quant(v,0.9)}; } }
    res.push(o);
  }
  return res;
}

// totaux sur la campagne, et écart au bras « sans outil » répétition par répétition
const TOTAL_DEFS = [
  {k:"late", label:"Retard moyen du programmé", unit:"min", agg:"mean", worse:+1},
  {k:"overMin", label:"Débordement après 18 h 30 (par jour)", unit:"min", agg:"mean", worse:+1},
  {k:"deprog", label:"Déprogrammations (total)", unit:"", agg:"sum", worse:+1},
  {k:"done", label:"Interventions réalisées (total)", unit:"", agg:"sum", worse:-1},
  {k:"occ", label:"Taux d'occupation des vacations", unit:"%", agg:"mean", worse:0},
  {k:"overload", label:"Journées de surcharge (soignant-jours)", unit:"", agg:"sum", worse:+1},
  {k:"err", label:"Erreurs de saisie attendues (total)", unit:"", agg:"sum", worse:+1},
  {k:"gaps", label:"Usages contournés (total)", unit:"", agg:"sum", worse:+1},
  {k:"T", label:"Confiance moyenne en fin de campagne", unit:"", agg:"last", worse:-1},
  {k:"adoption", label:"Taux d'usage de l'outil (dernière semaine)", unit:"%", agg:"lastWeek", worse:-1}
];
function totalOf(series, def){
  const v = series.map(x=>x[def.k]);
  if(def.agg==="sum") return v.reduce((a,b)=>a+(b||0),0);
  if(def.agg==="last") return v[v.length-1];
  if(def.agg==="lastWeek"){ const w=v.slice(-5).filter(x=>x!=null); return w.length? 100*mean(w) : null; }
  return mean(v.filter(x=>x!=null));
}
function aggregateTotals(reps, base){
  const o = {};
  for(const def of TOTAL_DEFS){
    const vals = reps.map(r=>totalOf(r.series, def)).filter(x=>x!=null);
    const deltas = reps.map((r,i)=>{ const a=totalOf(r.series,def), b=totalOf(base[i].series,def); return a!=null && b!=null ? a-b : null; }).filter(x=>x!=null);
    o[def.k] = {med:quant(vals,0.5), p10:quant(vals,0.1), p90:quant(vals,0.9), dMed:quant(deltas,0.5), dP10:quant(deltas,0.1), dP90:quant(deltas,0.9)};
  }
  return o;
}
// scénario B : les soignants touchés par la panne précoce (bras sans support), suivis dans chaque bras
function cohortTrust(runs, arms, days){
  const ref = arms.findIndex(a=>a.id==="nosupport");
  const codes = runs[ref].map(r=>new Set(r.agents.filter(a=>a.firstOut!=null && a.firstOut<=2).map(a=>a.code)));
  return {
    n: quant(codes.map(s=>s.size),0.5),
    arms: arms.map((a,i)=>a.tool && a.tool.active===false ? null : Array.from({length:days},(_,d)=>{
      const v = runs[i].map((r,k)=>mean(r.agents.filter(x=>codes[k].has(x.code)).map(x=>x.Th[d]).filter(t=>t!=null))).filter(x=>x!=null);
      return {med:quant(v,0.5), p10:quant(v,0.1), p90:quant(v,0.9)};
    }))
  };
}

// écart au bras « sans outil », semaine par semaine (médiane des répétitions)
function weeklyDelta(reps, base, days){
  const W = [];
  for(let w=0; w*5<days; w++){
    const o = {week:w+1};
    for(const k of ["late","overMin","err","overload"]){
      const v = reps.map((r,i)=>{ const a=r.series.slice(w*5,w*5+5), b=base[i].series.slice(w*5,w*5+5); return mean(a.map(x=>x[k]))-mean(b.map(x=>x[k])); });
      o[k] = {med:quant(v,0.5), p10:quant(v,0.1), p90:quant(v,0.9)};
    }
    o.T = quant(reps.map(r=>r.series[Math.min(days-1,w*5+4)].T),0.5);
    o.adoption = quant(reps.map(r=>mean(r.series.slice(w*5,w*5+5).map(x=>x.adoption).filter(x=>x!=null))).filter(x=>x!=null),0.5);
    W.push(o);
  }
  return W;
}

function roomCompare(runs, arms, sk, ch){
  return arms.map((a,i)=>{
    const R = runs[i];
    const at = (room)=>R.map(r=>r.series[r.series.length-1].roomT[room]).filter(x=>x!=null);
    const others = R.map(r=>{ const last=r.series[r.series.length-1].roomT; const v=Object.entries(last).filter(([k])=>k!==sk&&k!==ch).map(([,v])=>v); return mean(v); }).filter(x=>x!=null);
    return {arm:a.id, skepticRoom:sk, championRoom:ch, skeptic:sk? quant(at(sk),0.5):null, champion:ch? quant(at(ch),0.5):null, others:quant(others,0.5)};
  });
}

/* ------------------------------------------------------------------ */
/* Rapport lisible : conclusion, signaux de risque, hypothèses         */
/* ------------------------------------------------------------------ */
const f1 = x => x==null? "-" : ((Math.round(x*10)/10)||0).toLocaleString("fr-FR");
const f2 = x => x==null? "-" : ((Math.round(x*100)/100)||0).toLocaleString("fr-FR");
const range = (a,b,u="") => `${f1(a)}${u} à ${f1(b)}${u}`;

function buildCampaignReport(out){
  const tool = out.mainArm;                  // bras principal : le cas le plus défavorable du scénario
  const T = out.totals, base = T[0], A = T[1], last = T[tool];
  const name = out.norm.name, days = out.C.days, weeks = Math.round(days/5);
  const lines = [], risks = [];
  const late = A.late, over = A.overMin;
  const sign = x => x>0 ? "+" : "";
  lines.push(`Sur ${weeks} semaine${weeks>1?"s":""} simulée${weeks>1?"s":""} (${out.C.reps} répétitions), ${name} change le retard moyen du programmé de ${sign(late.dMed)}${f1(late.dMed)} min par intervention (fourchette ${range(late.dP10,late.dP90," min")}) et le débordement après 18 h 30 de ${sign(over.dMed)}${f1(over.dMed)} min par jour.`);
  const W = out.weekly[1];
  if(W.length>1) lines.push(`Effet de l'apprentissage : ${sign(W[0].late.med)}${f1(W[0].late.med)} min de retard par intervention la première semaine, ${sign(W[W.length-1].late.med)}${f1(W[W.length-1].late.med)} min la dernière.`);
  if(A.err.dMed<=-0.5) lines.push(`Moins d'erreurs de saisie qu'avec l'ancienne méthode : ${f1(-A.err.dMed)} erreur(s) attendue(s) en moins sur la campagne.`);
  const d1 = out.daily[1][0], dN = out.daily[1][days-1];
  lines.push(`La confiance moyenne des soignants passe de ${f2(d1.T.med)} le premier soir à ${f2(dN.T.med)} en fin de campagne ; l'outil est utilisé dans ${f1(A.adoption.med)} % des cas la dernière semaine.`);
  if(out.scenario.id==="B"){
    const S=T[1], N=T[2];
    const K=out.cohort, L=days-1, iS=1, iN=2, iC=3;
    if(K && K.n>0){
      lines.push(`Les ${f1(K.n)} soignants touchés par la panne du mardi finissent le jour de la panne à ${f2(K.arms[iN][1].med)} de confiance sans support et ${f2(K.arms[iS][1].med)} avec un support sur place, contre ${f2(K.arms[iC][1].med)} pour les mêmes soignants sans panne.`);
      lines.push(`Quatre semaines plus tard, l'écart avec les mêmes soignants sans panne est encore de ${f2(K.arms[iN][L].med-K.arms[iC][L].med)} sans support et de ${f2(K.arms[iS][L].med-K.arms[iC][L].med)} avec support : ${Math.abs(K.arms[iN][L].med-K.arms[iC][L].med)>0.02?"la panne précoce laisse une trace durable":"la confiance s'est presque rétablie"}.`);
    }
    lines.push(`Sur l'ensemble de l'équipe, la confiance finit à ${f2(S.T.med)} avec un support sur place, contre ${f2(N.T.med)} sans support : ${S.T.med-N.T.med>0.02?"le support limite durablement la perte de confiance":"le support change peu la trajectoire moyenne"}.`);
  }
  if(out.scenario.id==="C" && out.rooms){
    const rc = out.rooms.find(r=>r.arm==="reticent"), ctl = out.rooms.find(r=>r.arm==="avec");
    if(rc && ctl) lines.push(`Dans la salle du chirurgien réticent (${rc.skepticRoom}), la confiance de l'équipe paramédicale finit à ${f2(rc.skeptic)}, contre ${f2(ctl.skeptic)} dans la même salle sans réticent, et ${f2(rc.champion)} dans la salle de l'IBODE championne (${rc.championRoom}).`);
  }
  // signaux de risque (objectif 5 du cahier des charges)
  const flag = (cond, level, txt) => { if(cond) risks.push({level, txt}); };
  flag(late.dMed>=5, "rouge", `Retard : +${f1(late.dMed)} min en moyenne par intervention programmée.`);
  flag(late.dMed>=2 && late.dMed<5, "orange", `Retard modéré : +${f1(late.dMed)} min par intervention programmée.`);
  flag(A.deprog.dMed>=1, A.deprog.dMed>=5?"rouge":"orange", `${f1(A.deprog.dMed)} déprogrammation(s) de plus sur la campagne.`);
  flag(A.overload.dMed>=3, A.overload.dMed>=10?"rouge":"orange", `Surcharge : ${f1(A.overload.dMed)} journées-soignant de plus au-dessus du seuil de charge.`);
  flag(A.adoption.med!=null && A.adoption.med<70, A.adoption.med<50?"rouge":"orange", `Adoption faible : l'outil n'est utilisé que dans ${f1(A.adoption.med)} % des cas, le reste est contourné (traçabilité incomplète).`);
  flag(last.T.med!=null && last.T.med<0.4, "rouge", `Perte de confiance : confiance finale de ${f2(last.T.med)} sur 1.`);
  flag(A.err.dMed>=0.5, "orange", `Risque d'erreur de saisie : ${f1(A.err.dMed)} erreur(s) attendue(s) de plus sur la campagne.`);
  if(!risks.length) risks.push({level:"vert", txt:"Aucun signal de risque au-dessus des seuils retenus."});
  const worst = risks.some(r=>r.level==="rouge") ? "rouge" : risks.some(r=>r.level==="orange") ? "orange" : "vert";
  const verdict = worst==="rouge" ? `Déploiement à risque en l'état : ${risks.filter(r=>r.level==="rouge").map(r=>r.txt.split(" :")[0].replace(/\.$/,"").toLowerCase()).join(", ")}. À corriger avant de déployer (formation, support, périmètre).`
    : worst==="orange" ? "Déploiement envisageable sous conditions : surveiller les signaux orange pendant le premier mois."
    : "Déploiement sans effet négatif notable dans le périmètre simulé.";
  const conf = {elevee:"élevée", moyenne:"moyenne", faible:"faible"}[out.check.confiance] || out.check.confiance;
  return {
    conclusion: verdict, level: worst, lines, risks,
    confidence: conf,
    hypotheses: [
      ...out.check.hypotheses_necessaires.map(h=>h.hypothese),
      "Équipes paramédicales : 1 IADE et 1 IBODE par salle, une équipe de garde la nuit.",
      "Paramètres humains α, κ, seuils de charge et d'usage : à calibrer, valeurs par défaut documentées.",
      `Aversion à la perte λ = ${f2((out.C.human&&out.C.human.lambda)||HUMAN_DEFAULTS.lambda)} (méta-analyse 2024).`
    ]
  };
}

/* ------------------------------------------------------------------ */
/* Analyse de sensibilité : un paramètre « à calibrer » à la fois       */
/* ------------------------------------------------------------------ */
// Chaque paramètre est poussé à sa borne basse puis haute, les autres restant à leur valeur par défaut.
// On regarde si la conclusion (niveau vert / orange / rouge) et les chiffres clés changent.
const SENS_PARAMS = [
  {k:"lambda", label:"Aversion à la perte λ", lo:1.8, hi:2.25},
  {k:"alpha", label:"Vitesse d'apprentissage α", lo:0.04, hi:0.16},
  {k:"kappaScale", label:"Influence des collègues κ", lo:0.5, hi:2},
  {k:"scarHalfLife", label:"Mémoire d'une panne (jours)", lo:5, hi:30},
  {k:"useLow", label:"Seuil de contournement", lo:0.1, hi:0.3},
  {k:"learnB", label:"Pente d'apprentissage", lo:0.3, hi:0.7},
  {k:"tlxAlert", label:"Seuil de surcharge", lo:60, hi:80}
];
const SENS_OUT = [
  {k:"late", label:"Retard ajouté (min / intervention)", get:o=>o.totals[o.mainArm].late.dMed},
  {k:"T", label:"Confiance finale", get:o=>o.totals[o.mainArm].T.med},
  {k:"adoption", label:"Usage de l'outil (%)", get:o=>o.totals[o.mainArm].adoption.med},
  {k:"overload", label:"Journées de surcharge en plus", get:o=>o.totals[o.mainArm].overload.dMed}
];
// une ligne du tableau : un paramètre poussé à ses deux bornes
function sensRow(opts, p, reps){
  const val = o => Object.fromEntries(SENS_OUT.map(s=>[s.k, s.get(o)]));
  const run = v => { const o = runCampaign({...opts, reps, human:{...(opts.human||{}), [p.k]:v}}); return {v, level:o.report.level, conclusion:o.report.conclusion, out:val(o)}; };
  return {...p, base:(opts.human&&opts.human[p.k]) ?? HUMAN_DEFAULTS[p.k], low:run(p.lo), high:run(p.hi)};
}
function sensBase(opts, reps){
  const base = runCampaign({...opts, reps});
  if(base.blocked) return null;
  return {scenario:base.scenario, conclusion:base.report.conclusion, level:base.report.level, out:Object.fromEntries(SENS_OUT.map(s=>[s.k, s.get(base)]))};
}
function sensSummary(ref, rows){
  const variants = rows.flatMap(r=>[r.low, r.high]);
  const same = variants.filter(v=>v.level===ref.level).length;
  // paramètre le plus influent pour chaque résultat : plus grand écart entre borne basse et haute
  const top = Object.fromEntries(SENS_OUT.map(s=>{
    const r = [...rows].sort((a,b)=>Math.abs(b.high.out[s.k]-b.low.out[s.k])-Math.abs(a.high.out[s.k]-a.low.out[s.k]))[0];
    return [s.k, {param:r.label, spread:Math.abs(r.high.out[s.k]-r.low.out[s.k])}];
  }));
  const robust = same===variants.length;
  return {
    blocked:false, scenario:ref.scenario, ref, rows, top, same, total:variants.length, robust,
    summary: robust
      ? `La conclusion (« ${ref.conclusion} ») reste la même pour les ${variants.length} variantes testées : elle ne dépend pas des paramètres à calibrer dans leurs fourchettes.`
      : `La conclusion change dans ${variants.length-same} variante(s) sur ${variants.length}, à cause de : ${rows.filter(r=>r.low.level!==ref.level||r.high.level!==ref.level).map(r=>r.label.toLowerCase()).join(", ")}. Ces paramètres doivent être calibrés avec les équipes avant de trancher.`
  };
}
function runSensitivity(opts){
  const reps = opts.reps || 10;
  const ref = sensBase(opts, reps);
  if(!ref) return {blocked:true};
  return sensSummary(ref, SENS_PARAMS.map(p=>sensRow(opts, p, reps)));
}
