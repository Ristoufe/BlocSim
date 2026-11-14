#!/usr/bin/env node
// Blocapta en ligne de commande : contrôle d'une fiche logiciel, puis campagne « sans outil » contre « avec outil ».
//
//   node tools/outil.js --aide
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HELP = `
Blocapta : tester un logiciel sur le bloc simulé avant de le déployer

Usage
  npm run fiche -- <fiche.json>                     contrôle de complétude seulement (agent 1)
  npm run outil -- --fiche <fiche.json> [options]

Options de campagne
  --scenario A|B|C     A déploiement un lundi à 8 h · B panne précoce, avec ou sans support · C chirurgien senior réticent (défaut : A)
  --jours <n>          jours ouvrés simulés (défaut : 20, soit 4 semaines)
  --repetitions <n>    répétitions avec des graines différentes, pour les fourchettes (défaut : 20)
  --graine <n>         première graine (défaut : 42)
  --debut <AAAA-MM-JJ> premier jour, un lundi de préférence (défaut : 2026-11-16)
  --lambda <1.8-2.25>  aversion à la perte (défaut : 1,955)
  --alpha <x>          vitesse d'apprentissage de la confiance (défaut : 0,08, à calibrer)
  --kappa <x>          multiplie la sensibilité aux collègues (défaut : 1, à calibrer)
  --sortie <dossier>   dossier des CSV (défaut : logs)
  --sensibilite        pousse chaque paramètre « à calibrer » à ses bornes et dit si la conclusion change
  --sans-csv           ne pas écrire les CSV
  --json               résultat complet en JSON

Exemples
  npm run fiche -- data/fiches/scantrace-incomplete.json
  npm run outil -- --fiche data/fiches/scantrace-v2.json --scenario B
  npm run outil -- --fiche data/fiches/checklist-tablette.json --scenario C --repetitions 50
`;

function parseArgs(argv){
  const a = {_:[]};
  for(let i=0;i<argv.length;i++){
    const k = argv[i];
    if(!k.startsWith("--")){ a._.push(k); continue; }
    const name = k.slice(2);
    if(["sans-csv","json","aide","help","verifier","sensibilite"].includes(name)){ a[name]=true; continue; }
    if(argv[i+1]===undefined) fail(`valeur manquante pour --${name}`);
    a[name] = argv[++i];
  }
  return a;
}
function fail(msg){ console.error(`Erreur : ${msg}\nVoir : node tools/outil.js --aide`); process.exit(1); }
const num = (v,name,lo,hi)=>{ const n=Number(String(v).replace(",",".")); if(!Number.isFinite(n)||n<lo||n>hi) fail(`--${name} doit être entre ${lo} et ${hi}`); return n; };

function loadEngine(){
  const ctx = vm.createContext({console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat});
  for(const f of ["js/params.js","js/config.js","js/engine.js","js/generator.js","js/human.js","js/fiche.js","js/campaign.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT,f),"utf8"), ctx, {filename:f});
  vm.runInContext(`STATS = ${fs.readFileSync(path.join(ROOT,"data/stats.json"),"utf8")};`, ctx);
  return ctx;
}
function readFiche(p){
  if(!p) fail("indiquer une fiche, par exemple data/fiches/scantrace-v2.json");
  const f = path.resolve(p);
  if(!fs.existsSync(f)) fail(`fiche introuvable : ${p}`);
  try { return JSON.parse(fs.readFileSync(f,"utf8")); } catch(e){ fail(`fiche illisible (${e.message})`); }
}

/* ---------- affichage ---------- */
const VERDICT = {NON_ANALYSABLE:"NON ANALYSABLE", ANALYSABLE_AVEC_RESERVES:"ANALYSABLE AVEC RÉSERVES", ANALYSABLE:"ANALYSABLE"};
function printCheck(c, name){
  console.log(`\nContrôle de complétude : ${name}`);
  console.log(`Verdict : ${VERDICT[c.verdict]} · confiance : ${c.confiance}`);
  console.log(`Champs remplis : obligatoires ${c.score_completude.obligatoires} · recommandés ${c.score_completude.recommandes} · facultatifs ${c.score_completude.facultatifs}`);
  const bad = c.champs.filter(x=>x.statut==="O");
  if(bad.length){ console.log("\nChamps obligatoires à reprendre :"); bad.forEach(x=>console.log(`  - ${x.id} ${x.label} : ${x.statut_champ}${x.critique?" (critique)":""}. ${x.raison}`)); }
  if(c.alertes.length){ console.log("\nAlertes :"); c.alertes.forEach(x=>console.log(`  - [${x.type}] ${x.detail}`)); }
  if(c.questions_a_l_auteur.length){ console.log("\nQuestions à l'auteur de la fiche :"); c.questions_a_l_auteur.slice(0,5).forEach(q=>console.log(`  ${q.priorite}. ${q.question}\n     Exemple : ${q.exemple_reponse}`)); }
  if(c.hypotheses_necessaires.length){ console.log("\nHypothèses retenues pour l'analyse :"); c.hypotheses_necessaires.forEach(h=>console.log(`  - ${h.hypothese}`)); }
  console.log(`\n${c.verdict==="NON_ANALYSABLE"?"La fiche doit être complétée avant l'analyse.":"La fiche peut passer à l'analyse."}\n`);
}

function printCampaign(o){
  const f1 = x => x==null? "-" : ((Math.round(x*10)/10)||0).toString().replace(".",",");
  const f2 = x => x==null? "-" : ((Math.round(x*100)/100)||0).toString().replace(".",",");
  console.log(`\nScénario ${o.scenario.id} - ${o.scenario.name}`);
  console.log(`${o.scenario.text}`);
  console.log(`${o.C.days} jours ouvrés à partir du ${o.C.start}, ${o.C.reps} répétitions, calcul en ${(o.ms/1000).toFixed(1)} s`);
  console.log(`Confiance de l'analyse : ${o.report.confidence}\n`);
  const w = 44, cw = 22;
  console.log("".padEnd(w) + o.arms.map(a=>a.label.slice(0,cw-1).padStart(cw)).join(""));
  for(const def of vm.runInContext("TOTAL_DEFS", E)){
    if(["T","adoption"].includes(def.k)) continue;
    const cells = o.totals.map((t,i)=>{
      const v=t[def.k]; const d = i===0 ? "" : ` (${v.dMed>0?"+":""}${f1(v.dMed)})`;
      return (f1(v.med)+d).padStart(cw);
    });
    console.log(`${(def.label+(def.unit?` (${def.unit})`:"")).padEnd(w)}${cells.join("")}`);
  }
  for(const k of ["T","adoption"]){
    const def = vm.runInContext(`TOTAL_DEFS.find(d=>d.k==="${k}")`, E);
    console.log(`${def.label.padEnd(w)}${o.totals.map((t,i)=>(i===0?"-":k==="T"?f2(t[k].med):f1(t[k].med)+" %").padStart(cw)).join("")}`);
  }
  console.log("\nSemaine par semaine (écart au bras sans outil, médiane) :");
  o.weekly[1].forEach(x=>console.log(`  semaine ${x.week} : retard ${x.late.med>0?"+":""}${f1(x.late.med)} min · confiance ${f2(x.T)} · usage ${f1(100*(x.adoption||0))} %`));
  console.log("\nConfiance par métier en fin de campagne :");
  const last = o.daily[1][o.C.days-1];
  for(const [r,l] of Object.entries(vm.runInContext("ROLE_LABEL",E))) console.log(`  ${l.padEnd(14)} ${f2(last.TR[r].med)}  (fourchette ${f2(last.TR[r].p10)} à ${f2(last.TR[r].p90)})`);
  console.log(`\nConclusion : ${o.report.conclusion}`);
  o.report.lines.forEach(l=>console.log(`  - ${l}`));
  console.log("\nSignaux de risque :");
  o.report.risks.forEach(r=>console.log(`  [${r.level}] ${r.txt}`));
  console.log("\nHypothèses :");
  o.report.hypotheses.forEach(h=>console.log(`  - ${h}`));
  console.log("");
}

function writeCsv(o, dir){
  fs.mkdirSync(dir,{recursive:true});
  const stamp = new Date().toISOString().replace(/[-:]/g,"").replace("T","-").slice(0,15);
  const slug = (o.norm.name+"-scenario-"+o.scenario.id).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-");
  const roles = ["CHIR","MAR","IADE","IBODE"];
  const head = ["Bras","Jour","Date","Retard moyen (min)","Débordement (min)","Déprogrammées","Réalisées","Occupation (%)","Confiance moyenne","Usage de l'outil (%)","Erreurs attendues","Soignants en surcharge","Usages contournés","Panne (min)",
    ...roles.map(r=>`Confiance ${r}`), ...roles.map(r=>`Charge ${r}`), ...roles.map(r=>`Fatigue ${r}`)];
  const rows = [];
  o.daily.forEach((D,i)=>D.forEach(x=>rows.push([o.arms[i].label, x.d+1, x.date, x.late.med, x.overMin.med, x.deprog.med, x.done.med, x.occ.med, x.T.med, x.adoption.med==null?"":100*x.adoption.med, x.err.med, x.overload.med, x.gaps.med, x.outMin.med,
    ...roles.map(r=>x.TR[r].med), ...roles.map(r=>x.TLX[r].med), ...roles.map(r=>x.F[r].med)])));
  const fmt = v => v==null||v==="" ? "" : typeof v==="number" ? String(Math.round(v*1000)/1000).replace(".",",") : String(v);
  const file = path.join(dir, `${stamp}-campagne-${slug}.csv`);
  fs.writeFileSync(file, "﻿"+[head, ...rows].map(r=>r.map(fmt).join(";")).join("\r\n")+"\r\n", "utf8");
  return path.relative(ROOT, file);
}

/* ---------- main ---------- */
const a = parseArgs(process.argv.slice(2));
if(a.aide || a.help){ console.log(HELP); process.exit(0); }
const E = loadEngine();
if(a.verifier || (!a.fiche && a._.length)){
  const fiche = readFiche(a.fiche || a._[0]);
  E.__f = fiche;
  const c = vm.runInContext("checkFiche(__f)", E);
  if(a.json){ console.log(JSON.stringify(c,null,2)); process.exit(0); }
  printCheck(c, path.basename(a.fiche || a._[0]));
  process.exit(c.verdict==="NON_ANALYSABLE" ? 2 : 0);
}
const fiche = readFiche(a.fiche);
const opts = {
  fiche, scenario:(a.scenario||"A").toUpperCase(),
  days: a.jours ? num(a.jours,"jours",5,260) : undefined,
  reps: a.repetitions ? num(a.repetitions,"repetitions",1,500) : 20,
  seed: a.graine ? num(a.graine,"graine",1,1e9) : 42,
  start: a.debut || "2026-11-16",
  human: {}
};
if(!["A","B","C"].includes(opts.scenario)) fail("--scenario A, B ou C");
if(a.lambda) opts.human.lambda = num(a.lambda,"lambda",1,3);
if(a.alpha) opts.human.alpha = num(a.alpha,"alpha",0.001,1);
if(a.kappa) opts.human.kappaScale = num(a.kappa,"kappa",0,5);
E.__o = opts;
if(a.sensibilite){
  const t0 = Date.now();
  const S = vm.runInContext("runSensitivity({...__o, reps: Math.min(__o.reps, 10)})", E);
  if(S.blocked){ console.error("Campagne non lancée : la fiche est incomplète."); process.exit(2); }
  if(a.json){ console.log(JSON.stringify(S,null,1)); process.exit(0); }
  const f = x => x==null? "-" : ((Math.round(x*100)/100)||0).toString().replace(".",",");
  console.log(`\nSensibilité - scénario ${S.scenario.id}, ${S.total} variantes, ${((Date.now()-t0)/1000).toFixed(0)} s\n`);
  console.log(`${"Paramètre".padEnd(32)}${"bornes".padEnd(14)}${"conclusion".padEnd(18)}${"retard ajouté".padEnd(16)}${"confiance".padEnd(14)}usage (%)`);
  console.log(`${"Référence".padEnd(32)}${"-".padEnd(14)}${S.ref.level.padEnd(18)}${f(S.ref.out.late).padEnd(16)}${f(S.ref.out.T).padEnd(14)}${f(S.ref.out.adoption)}`);
  for(const r of S.rows) console.log(`${r.label.padEnd(32)}${(f(r.lo)+" / "+f(r.hi)).padEnd(14)}${(r.low.level+" / "+r.high.level).padEnd(18)}${(f(r.low.out.late)+" / "+f(r.high.out.late)).padEnd(16)}${(f(r.low.out.T)+" / "+f(r.high.out.T)).padEnd(14)}${f(r.low.out.adoption)} / ${f(r.high.out.adoption)}`);
  console.log(`\n${S.summary}\n`);
  process.exit(0);
}
const o = vm.runInContext("runCampaign(__o)", E);
if(o.blocked){
  printCheck(o.check, path.basename(a.fiche));
  console.error("Campagne non lancée : la fiche est incomplète.");
  process.exit(2);
}
if(a.json){ console.log(JSON.stringify(o,null,1)); process.exit(0); }
printCampaign(o);
if(!a["sans-csv"]) console.log(`Courbes jour par jour : ${writeCsv(o, path.resolve(ROOT, a.sortie||"logs"))}\n`);
