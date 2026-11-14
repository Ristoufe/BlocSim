#!/usr/bin/env node
// Analyse de journées BlocSim par un modèle LOCAL (Ollama). Lecture seule sur le dépôt.
//
// Principe : le CODE calcule des faits vérifiables (numérotés F1, F2…), le MODÈLE les interprète.
// Le modèle ne calcule rien, ne voit pas le CSV brut, et chaque affirmation doit citer un fait.
// Le script vérifie ensuite les citations et signale les désaccords modèle / règles.
//
// Usage :
//   node tests-coherence/analyse-llm.js --model=NOM --scenario=afflux --graines=1-5
//   node tests-coherence/analyse-llm.js --model=NOM --fuzz=10 --graine=7
//   node tests-coherence/analyse-llm.js --dry-run --scenario=type --graines=1-3      (aucun modèle : écrit seulement les prompts)
// Options : --repo=CHEMIN  --out=DOSSIER (défaut tests-coherence/sorties-llm, ignoré par git)  --ollama=http://localhost:11434
//           --timeout=300 (secondes par journée)  --afflux=N@HH:MM  --ctx=8192 (fenêtre de contexte, en tokens)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const arg = k => (process.argv.find(a => a.startsWith("--" + k + "=")) || "").split("=").slice(1).join("=");
const flag = k => process.argv.includes("--" + k);
const isRepo = d => d && fs.existsSync(path.join(d, "js", "engine.js"));
const ROOT = path.resolve([arg("repo"), process.cwd(), path.join(__dirname, "..")].find(isRepo) || (console.error("Dépôt BlocSim introuvable : --repo=CHEMIN"), process.exit(1)));
const OUT = path.resolve(arg("out") || path.join(__dirname, "sorties-llm"));
const OLLAMA = (arg("ollama") || "http://localhost:11434").replace(/\/$/, "");
const MODEL = arg("model"), DRY = flag("dry-run"), TIMEOUT = +(arg("timeout") || 300) * 1000, CTX = +(arg("ctx") || 8192);
if (!MODEL && !DRY) { console.error("Indiquez --model=NOM (voir `ollama list`) ou --dry-run."); process.exit(1); }

const ctx = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"].filter(f => fs.existsSync(path.join(ROOT, f)))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
vm.runInContext("STATS=" + fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8"), ctx);

/* ---------- 1. liste des journées à analyser ---------- */
const range = (s, d) => { const m = /^(\d+)-(\d+)$/.exec(s || ""); return m ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i) : s ? [+s] : d; };
let jobs = [];
if (arg("fuzz")) {
  ctx.__n = +arg("fuzz"); ctx.__s0 = +(arg("graine") || 7);
  jobs = vm.runInContext(`(()=>{let s=__s0>>>0||1;const rr=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%1e6)/1e6;};const ri=(a,b)=>a+Math.floor(rr()*(b-a+1));const out=[];
    for(let i=0;i<__n;i++){const c=defaultConfig();c.seed=ri(1,99999);c.load=ri(8,28)*0.05;c.urgCount=ri(0,30);c.sspiBeds=ri(2,8);c.bran=ri(1,5);c.ash=ri(1,5);
    c.burst={at:ri(0,1439),n:rr()<0.4?ri(1,12):0};c.name="Réglages aléatoires #"+(i+1);out.push(c);}return out;})()`, ctx);
} else {
  const sc = arg("scenario") || "type";
  for (const g of range(arg("graines"), [1])) {
    ctx.__sc = sc; ctx.__g = g; ctx.__af = arg("afflux") || "";
    jobs.push(vm.runInContext(`(()=>{const p=PRESETS.find(p=>p.id===__sc);if(!p)throw new Error("scénario inconnu : "+__sc);const c=p.apply(defaultConfig());c.seed=__g;
      const m=/^(\\d+)@(\\d\\d):(\\d\\d)$/.exec(__af);if(m){c.burst={n:+m[1],at:+m[2]*60+ +m[3]};c.name="Afflux de "+m[1]+" à "+m[2]+":"+m[3];}return c;})()`, ctx));
  }
}

/* ---------- 2. faits vérifiables calculés par le code (aucun LLM) ---------- */
vm.runInContext("var __cap=null; (()=>{const pp=planProgram, mu=makeUrgences; planProgram=function(c,r){const x=pp(c,r); if(__cap&&__cap.plan===null)__cap.plan=x.length; return x;}; makeUrgences=function(c,r){const x=mu(c,r); if(__cap&&__cap.urg===null)__cap.urg=x.length; return x;};})();", ctx);
function facts(cfg) {
  ctx.__cfg = cfg;
  return vm.runInContext(`(()=>{
    __cap={plan:null,urg:null}; const d=generateDay(__cfg), cap=__cap; __cap=null; const sim=buildDay(d), C=d.cases, R=d.report, B=d.baseline, F=[];
    const f=(sev,txt)=>F.push({id:"F"+(F.length+1),sev,txt}); const hm=m=>fmt(m);
    f("info",\`Journée « \${d.label} » (\${d.jour||d.date}), graine \${__cfg.seed} : \${d.cfg.rooms.length} salles disponibles (urgences : \${__cfg.urgRoom}), programme \${Math.round(__cfg.load*100)} %, \${__cfg.urgCount<0?"urgences selon la distribution réelle du jour":__cfg.urgCount+" urgences en moyenne"}\${__cfg.burst.n?\` + afflux de \${__cfg.burst.n} à \${hm(__cfg.burst.at)}\`:""}, \${__cfg.sspiBeds} lits de SSPI, \${__cfg.bran} brancardier(s), \${__cfg.ash} agent(s) de bionettoyage.\`);
    f("info",\`Bilan : \${R.done} interventions réalisées (\${R.prog} programmées, \${R.urg} urgences), \${R.deprog} déprogrammées, \${R.annul} annulées avant le jour J, \${R.absents} patient(s) absent(s).\`);
    f("info",\`Urgences : \${R.urgInTime} % opérées dans leur délai maximal ; attente moyenne \${R.urgWait} min (hors urgences sous 24 h), maximale \${R.urgWaitMax} min ; urgences immédiates : \${R.vitWait} min en moyenne.\`);
    f("info",\`Programme : retard moyen \${R.late} min (\${B.late} min dans la référence sans aléas) ; débordement après 18 h 30 : \${R.overMin} min sur \${R.overRooms} salle(s) ; blocage en salle faute de lit SSPI : \${R.bedBlock} min ; pic SSPI : \${R.sspiPeak}/\${__cfg.sspiBeds}.\`);
    // règles et cohérences contrôlées par le code
    const lost=cap.plan+cap.urg-(C.length+d.cancelled.length);
    if(lost>0) f("regle",\`\${lost} patient(s) généré(s) absent(s) de la sortie : ni réalisés, ni annulés (simulation arrêtée à 7 h le lendemain avec un patient encore en salle).\`);
    const rows=oproomRows(sim,true), closed=rows.filter(r=>r[5]==="fermé").length;
    if(R.done!==closed) f("regle",\`Le bilan annonce \${R.done} interventions réalisées, le CSV exporté en contient \${closed}.\`);
    if(d.validation.violations>0) f("regle",\`La validation interne du simulateur signale \${d.validation.violations} violation(s), par exemple : \${d.validation.issues.slice(0,2).join(" ; ")}.\`);
    const mid=C.filter(c=>Math.max(c.s+c.dur+c.waitBed,c.recOut||0,c.cleanEnd||0)>=1440); if(mid.length) f("regle",\`\${mid.length} cas finissent après minuit : le CSV écrit l'heure sans changer la date (ex. entrée \${hm(mid[0].s)}, sortie du bloc \${hm(mid[0].recOut||0)}).\`);
    const isG=l=>/garde|astreinte/i.test(l||""), night=C.filter(c=>(c.s>=1170||c.s<420)&&c.team); let mxT=0,tT=0;
    for(let t=1170;t<1860;t+=5){const n=new Set(night.filter(c=>c.s<=t&&t<c.s+c.dur+c.waitBed&&isG(c.team.ibode)).map(c=>c.team.ibode)).size; if(n>mxT){mxT=n;tT=t;}}
    const okT=__cfg.nightTeams+(__cfg.burst.n>=3?2:0); if(mxT>okT) f("regle",\`\${mxT} équipes de garde ou d'astreinte simultanées vers \${hm(tT)}, la règle en autorise \${okT}.\`);
    const cat=a=>a.role+(/garde/.test(a.code)?"-garde":""), ov={};
    sim.agents.forEach(a=>{if(a.role==="PAT")return;const vs=[...a.visits].sort((x,y)=>x.a-y.a);let me=-1e9,l=null,m=0;for(const v of vs){if(l&&v.a<me-2&&(v.p.z!==l.p.z||Math.hypot(v.p.x-l.p.x,v.p.y-l.p.y)>5))m+=Math.min(me,v.b)-v.a;if(v.b>me){me=v.b;l=v;}}if(m>0)ov[cat(a)]=(ov[cat(a)]||0)+Math.round(m);});
    Object.entries(ov).filter(([k,v])=>v>=10).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>f("regle",\`Personnel « \${k} » présent à deux endroits en même temps : \${v} min cumulées d'après l'animation.\`));
    // faits à interpréter par le modèle
    C.filter(c=>c.cls==="imm"&&c.deadline!=null&&c.s>c.deadline).sort((a,b)=>(b.s-b.arr)-(a.s-a.arr)).slice(0,3).forEach(c=>f("clinique",\`Urgence immédiate (\${c.spec}, « \${c.proc} ») arrivée à \${hm(c.arr)}, opérée à \${hm(c.s)} en \${c.room} : \${Math.round(c.s-c.arr)} min d'attente pour un délai maximal de \${Math.round(c.deadline-c.arr)} min.\`));
    C.filter(c=>c.type==="P"&&c.s-c.planned>=90).sort((a,b)=>(b.s-b.planned)-(a.s-a.planned)).slice(0,2).forEach(c=>f("clinique",\`Programmé en \${c.room} (« \${c.proc} ») prévu à \${hm(c.planned)}, démarré à \${hm(c.s)} : \${Math.round(c.s-c.planned)} min de retard.\`));
    C.filter(c=>c.waitBed>=20).sort((a,b)=>b.waitBed-a.waitBed).slice(0,2).forEach(c=>f("clinique",\`Patient bloqué \${Math.round(c.waitBed)} min en salle \${c.room} à \${hm(c.s+c.dur)} faute de lit SSPI libre.\`));
    return {label:d.label,facts:F};
  })()`, ctx);
}

/* ---------- 3. prompt et schéma ---------- */
const SYSTEM = `Tu relis le résultat d'UNE journée simulée d'un bloc opératoire (simulateur BlocSim). Tu reçois une liste de FAITS numérotés (F1, F2…) calculés par un programme. Règles strictes :
- Utilise UNIQUEMENT ces faits. N'invente aucun chiffre, aucune heure, aucune salle. Ne fais aucun calcul.
- Chaque problème que tu signales doit citer au moins un identifiant de fait (champ "faits").
- Distingue : (a) incohérence de la simulation (règle violée, bilan contradictoire, personne à deux endroits), (b) invraisemblance clinique ou organisationnelle (délai irréaliste pour une urgence vitale, etc.).
- Si les faits ne permettent pas de conclure, écris "indéterminé" plutôt que de deviner.
- Réponds en français, en JSON conforme au schéma demandé, de façon brève.`;
const SCHEMA = { type: "object", required: ["verdict", "problemes", "questions_equipe"], properties: {
  verdict: { type: "string", enum: ["coherent", "suspect", "incoherent", "indetermine"] },
  problemes: { type: "array", items: { type: "object", required: ["type", "faits", "explication", "gravite"], properties: {
    type: { type: "string", enum: ["incoherence_simulation", "invraisemblance_clinique", "autre"] },
    faits: { type: "array", items: { type: "string" } }, explication: { type: "string" }, gravite: { type: "string", enum: ["faible", "moyenne", "elevee"] } } } },
  questions_equipe: { type: "array", items: { type: "string" } } } };
const userPrompt = F => "FAITS :\n" + F.map(x => `${x.id} [${x.sev}] ${x.txt}`).join("\n") + "\n\nAnalyse cette journée.";

/* ---------- 4. appel du modèle local ---------- */
async function ask(F) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(OLLAMA + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ model: MODEL, stream: false, format: SCHEMA, options: { temperature: 0, num_ctx: CTX }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt(F) }] }) });
    if (!r.ok) throw new Error(`HTTP ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(); return JSON.parse(j.message.content);
  } finally { clearTimeout(t); }
}

/* ---------- 5. boucle principale ---------- */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!DRY) { try { await fetch(OLLAMA + "/api/tags"); } catch { console.error(`Ollama ne répond pas sur ${OLLAMA}. Lancez l'application Ollama (ou « ollama serve »), puis vérifiez avec : ollama list`); process.exit(1); } }
  const summary = [["journee", "graine", "nb_faits_regle", "verdict_modele", "nb_problemes", "citations_inconnues", "alerte"].join(";")];
  for (const [i, cfg] of jobs.entries()) {
    const { label, facts: F } = facts(cfg), tag = `${String(i + 1).padStart(2, "0")}-graine${cfg.seed}`;
    const nRule = F.filter(x => x.sev === "regle").length;
    fs.writeFileSync(path.join(OUT, tag + "-faits.txt"), F.map(x => `${x.id} [${x.sev}] ${x.txt}`).join("\n") + "\n");
    if (DRY) { fs.writeFileSync(path.join(OUT, tag + "-prompt.txt"), SYSTEM + "\n\n" + userPrompt(F) + "\n"); console.log(`${tag} · ${label} · ${F.length} faits (${nRule} règles) → prompt écrit`); continue; }
    process.stdout.write(`${tag} · ${label} · ${F.length} faits… `); const t0 = Date.now();
    let A; try { A = await ask(F); } catch (e) { console.log("ÉCHEC : " + (e.name === "AbortError" ? "délai dépassé" : e.message)); summary.push([label, cfg.seed, nRule, "ERREUR", "", "", ""].join(";")); continue; }
    const ids = new Set(F.map(x => x.id)); const unknown = []; (A.problemes || []).forEach(p => (p.faits || []).forEach(id => { if (!ids.has(id)) unknown.push(id); }));
    const alerts = []; if (nRule > 0 && A.verdict === "coherent") alerts.push("le modèle dit « cohérent » alors que des règles sont violées"); if (nRule === 0 && A.verdict === "incoherent") alerts.push("le modèle dit « incohérent » sans règle violée");
    if (unknown.length) alerts.push("citations inventées : " + [...new Set(unknown)].join(","));
    const md = [`# ${label} — graine ${cfg.seed}`, `\n**Verdict du modèle (${MODEL}) : ${A.verdict}** · ${nRule} règle(s) violée(s) détectée(s) par le code`, alerts.length ? `\n> ⚠ À vérifier : ${alerts.join(" ; ")}` : "", "\n## Problèmes signalés par le modèle", ...(A.problemes || []).map(p => `- **${p.gravite}** · ${p.type} · faits ${(p.faits || []).join(", ")} : ${p.explication}`), "\n## Questions pour l'équipe du bloc", ...(A.questions_equipe || []).map(q => "- " + q), "\n## Faits fournis au modèle", ...F.map(x => `- ${x.id} [${x.sev}] ${x.txt}`)].join("\n");
    fs.writeFileSync(path.join(OUT, tag + ".md"), md + "\n"); fs.writeFileSync(path.join(OUT, tag + ".json"), JSON.stringify({ cfg, faits: F, analyse: A }, null, 1));
    summary.push([label, cfg.seed, nRule, A.verdict, (A.problemes || []).length, unknown.length, alerts.join(" | ")].map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(";"));
    console.log(`${A.verdict} · ${(A.problemes || []).length} problème(s) · ${((Date.now() - t0) / 1000).toFixed(0)} s${alerts.length ? " · ⚠ " + alerts[0] : ""}`);
  }
  fs.writeFileSync(path.join(OUT, "synthese.csv"), "\ufeff" + summary.join("\r\n") + "\r\n");
  console.log(`\nRésultats dans ${OUT} (synthese.csv + un .md par journée)`);
})();
