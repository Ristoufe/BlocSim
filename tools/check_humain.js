// Contrôles du modèle humain et des campagnes (grille d'audit, points 2, 3 et 4).
// Usage : npm run check     (s'arrête avec un code d'erreur si un contrôle échoue)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const E = vm.createContext({console, Math, JSON, Date, Number, String, Object, Array, Set, Map});
for(const f of ["js/params.js","js/config.js","js/engine.js","js/generator.js","js/human.js","js/fiche.js","js/campaign.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),"utf8"), E, {filename:f});
vm.runInContext("STATS="+fs.readFileSync(path.join(ROOT,"data/stats.json"),"utf8"), E);
const fiche = n => JSON.parse(fs.readFileSync(path.join(ROOT,"data/fiches",n+".json"),"utf8"));
const run = (code) => vm.runInContext(code, E);

const results = [];
const check = (name, ok, detail="") => results.push({name, ok, detail});

/* 0. Fidélité : occupation des vacations (définition du classeur « Ratios v2 », 8 h 30 - 17 h 30) à moins de 10 % de 54 %.
   Le volume, les horaires et le délai entre deux cas sont vérifiés par npm test (calibration du moteur). */
const fid = run(`(()=>{ const a=[]; let d="2026-01-05";
  for(let s=1;s<=120;s++){ d=addWorkdays(d,1); const c={...defaultConfig(), seed:s, date:d, rooms:roomsFor(d,s)}; a.push(generateDay(c).report.occ); }
  return {occ:a.reduce((x,y)=>x+y,0)/a.length}; })()`);
check("Fidélité : occupation des vacations à moins de 10 % de 54 % (120 jours ouvrés de 2026)", Math.abs(fid.occ/54-1)<0.1, `${fid.occ.toFixed(1)} %`);

/* 1. Fiches : le contrôle de complétude bloque une fiche incomplète */
E.__a = fiche("scantrace-incomplete"); E.__b = fiche("scantrace-v2"); E.__c = fiche("checklist-tablette");
const ca = run("checkFiche(__a)"), cb = run("checkFiche(__b)"), cc = run("checkFiche(__c)");
check("Fiche incomplète refusée", ca.verdict==="NON_ANALYSABLE" && ca.fiche_normalisee===null, ca.verdict);
check("Fiche avec durées de l'éditeur : réserves, confiance faible", cb.verdict==="ANALYSABLE_AVEC_RESERVES" && cb.confiance==="faible", `${cb.verdict} / ${cb.confiance}`);
E.__d = fiche("piege-vague"); const cd = run("checkFiche(__d)");
check("Fiche piège : les règles seules ne la bloquent pas (c'est le rôle du LLM)", cd.verdict!=="NON_ANALYSABLE", cd.verdict);
check("Fiche mesurée sur site : analysable, confiance élevée", cc.verdict==="ANALYSABLE" && cc.confiance==="elevee", `${cc.verdict} / ${cc.confiance}`);
check("Campagne refusée sur fiche incomplète", run("runCampaign({fiche:__a, reps:1, days:5})").blocked===true);

/* 2. Comparaison équitable : le bras sans outil rejoue exactement les journées de base */
const crn = run(`(()=>{
  const cfg = defaultConfig(); const norm = checkFiche(__c).fiche_normalisee; // salles du jour par défaut
  const legacy = toolFromFiche(norm); legacy.active=false;
  let same = true;
  for(let s=1; s<=15; s++){
    const plain = generateDay({...cfg, seed:s});
    const H = makeTeam({}, 1, []);
    const withHook = generateDay({...cfg, seed:s}, (c,t)=>humanCase(H,c,t,legacy,{outages:[]}));
    const k = d => JSON.stringify(d.cases.map(c=>[c.room,c.s,c.dur,c.proc]));
    if(k(plain)!==k(withHook)) same=false;
  }
  return same;
})()`);
check("Nombres aléatoires communs : sans outil = journée de base", crn);
const r1 = run("JSON.stringify(runCampaign({fiche:__c, scenario:'A', reps:3, days:10}).totals)");
const r2 = run("JSON.stringify(runCampaign({fiche:__c, scenario:'A', reps:3, days:10}).totals)");
check("Reproductibilité bit à bit d'une campagne", r1===r2);

/* 3. Valeurs impossibles : confiance, fatigue, charge bornées, pas de NaN */
const bounds = run(`(()=>{
  const bad = [];
  for(const sc of ["A","B","C"]){
    const o = runCampaign({fiche:__b, scenario:sc, reps:3, days:20});
    for(const D of o.daily) for(const x of D){
      for(const k of ["late","overMin","T","err","occ"]) if(x[k].med!=null && !Number.isFinite(x[k].med)) bad.push(sc+" "+k+" NaN");
      if(x.T.med<0 || x.T.med>1) bad.push(sc+" confiance hors [0,1]");
      if(x.occ.med<0 || x.occ.med>100) bad.push(sc+" occupation hors [0,100]");
      for(const r of Object.keys(ROLE_LABEL)){
        const F=x.F[r].med, L=x.TLX[r].med;
        if(F!=null && (F<0||F>1)) bad.push(sc+" fatigue hors [0,1]");
        if(L!=null && (L<0||L>100)) bad.push(sc+" charge hors [0,100]");
      }
    }
    for(const A of o.agentsEnd) for(const a of A) if(!(a.T>=0 && a.T<=1)) bad.push(sc+" agent "+a.code);
  }
  return bad;
})()`);
check("Bornes : confiance et fatigue dans [0,1], charge dans [0,100], occupation dans [0,100]", !bounds.length, bounds.slice(0,3).join(", "));

/* 4. Tests de comportement (fil rouge) */
// 4a. aversion à la perte : une panne fait baisser la confiance environ λ fois plus qu'un succès ne la fait monter
const la = run(`(()=>{
  const H = makeTeam({lambda:1.955}, 1, []);
  const a = {T:0.5}, b = {T:0.5};
  const up = trustEvent(H, a, 1), down = trustEvent(H, b, 0);
  return {up, down, ratio: -down/up};
})()`);
check("Aversion à la perte : une panne pèse λ fois plus qu'un succès", Math.abs(la.ratio-1.955)<1e-9, `ratio ${la.ratio.toFixed(3)}`);
// 4b. panne précoce : les soignants touchés perdent confiance par rapport aux mêmes soignants sans panne,
//     durablement, et le support sur place limite la perte
const pb = run(`(()=>{
  const o = runCampaign({fiche:__b, scenario:"B", reps:20});
  const K = o.cohort, L = o.C.days-1;
  return { n:K.n, dip:K.arms[2][1].med, ctl:K.arms[3][1].med, sup:K.arms[1][1].med,
           endN:K.arms[2][L].med, endS:K.arms[1][L].med, endC:K.arms[3][L].med };
})()`);
check("Panne précoce : chute de confiance des soignants touchés", pb.n>0 && pb.dip < pb.ctl-0.05, `${pb.dip.toFixed(3)} contre ${pb.ctl.toFixed(3)} sans panne, ${pb.n} soignants`);
check("Panne précoce : trace durable après 4 semaines", pb.endN < pb.endC, `${pb.endN.toFixed(3)} < ${pb.endC.toFixed(3)}`);
check("Panne précoce : le support sur place limite la perte", pb.sup > pb.dip && pb.endS >= pb.endN, `jour 2 : ${pb.sup.toFixed(3)} > ${pb.dip.toFixed(3)} ; fin : ${pb.endS.toFixed(3)} >= ${pb.endN.toFixed(3)}`);
// 4c. chirurgien réticent : son équipe a moins confiance que la même salle sans lui, et que la salle championne
const pc = run(`(()=>{
  const o = runCampaign({fiche:__c, scenario:"C", reps:20});
  const rc = o.rooms.find(r=>r.arm==="reticent"), ctl = o.rooms.find(r=>r.arm==="avec");
  return {rc, ctl};
})()`);
check("Chirurgien réticent : son équipe a moins confiance que sans lui", pc.rc.skeptic < pc.ctl.skeptic, `${pc.rc.skeptic.toFixed(3)} < ${pc.ctl.skeptic.toFixed(3)}`);
check("Chirurgien réticent : sa salle est sous la salle championne", pc.rc.skeptic < pc.rc.champion, `${pc.rc.skeptic.toFixed(3)} < ${pc.rc.champion.toFixed(3)}`);
// 4d. apprentissage : le surcoût de la première semaine est plus grand que celui de la dernière
const pd = run(`(()=>{ const o = runCampaign({fiche:__c, scenario:"A", reps:20}); const W=o.weekly[1]; return [W[0].late.med, W[W.length-1].late.med]; })()`);
check("Courbe d'apprentissage : surcoût semaine 1 > semaine 4", pd[0] > pd[1], `${pd[0].toFixed(2)} > ${pd[1].toFixed(2)} min`);

/* 5. Performance : une année de bloc en moins de quelques minutes */
const t0 = Date.now();
run("runCampaign({fiche:__c, scenario:'A', reps:1, days:250})");
const ms = Date.now()-t0;
check("Performance : une année (250 jours, avec et sans outil) en moins de 60 s", ms<60000, `${(ms/1000).toFixed(1)} s`);

const failed = results.filter(r=>!r.ok);
for(const r of results) console.log(`${r.ok?"ok  ":"ÉCHEC"} ${r.name}${r.detail?`  (${r.detail})`:""}`);
if(failed.length){ console.error(`\n${failed.length} contrôle(s) en échec.`); process.exit(1); }
console.log(`\n${results.length} contrôles du modèle humain : tous passés.`);
