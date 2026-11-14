#!/usr/bin/env node
// Diagnostic des « personnes à deux endroits en même temps » (E1) dans BlocSim.
// Lecture seule : ne modifie pas le dépôt.
//
// Usage (depuis la racine du dépôt BlocSim) :
//   node tests-coherence/diagnostic.js --scenario=afflux --graine=4
//   node tests-coherence/diagnostic.js --config=../resultats-tests/repro/E1_IADE-garde.json
// Options : --repo=CHEMIN  --afflux=N@HH:MM  --agent=texte (filtre, ex. garde, MAR)  --max=8 (agents affichés)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const arg = k => (process.argv.find(a => a.startsWith("--" + k + "=")) || "").split("=").slice(1).join("=");
const isRepo = d => d && fs.existsSync(path.join(d, "js", "engine.js"));
const ROOT = path.resolve([arg("repo"), process.cwd(), path.join(__dirname, "..")].find(isRepo) || (console.error("Dépôt introuvable : --repo=CHEMIN"), process.exit(1)));
const ctx = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"].filter(f => fs.existsSync(path.join(ROOT, f)))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
vm.runInContext("STATS=" + fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8"), ctx);

// 1. construire la configuration
let cfg = vm.runInContext("defaultConfig()", ctx);
const sc = arg("scenario");
if (sc) { ctx.__sc = sc; cfg = vm.runInContext("(()=>{const p=PRESETS.find(p=>p.id===__sc); if(!p) throw new Error('scénario inconnu : '+__sc); return p.apply(defaultConfig());})()", ctx); }
if (arg("config")) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(path.resolve(arg("config")), "utf8")) };
if (arg("graine")) cfg.seed = +arg("graine");
if (arg("afflux")) { const m = /^(\d+)@(\d\d):(\d\d)$/.exec(arg("afflux")); if (!m) { console.error("--afflux=N@HH:MM"); process.exit(1); } cfg.burst = { n: +m[1], at: +m[2] * 60 + +m[3] }; cfg.name = `Afflux de ${m[1]} à ${m[2]}:${m[3]}`; }
ctx.__cfg = cfg;

// 2. analyse dans le contexte du moteur
const res = vm.runInContext(`(() => {
  const d = generateDay(__cfg), sim = buildDay(d);
  const fmtT = t => fmt(t);
  const caseAt = (room, t) => { const c = sim.cases.find(c => c.room === room && c.s - 6 <= t && t < c.end + 2); return c ? { pid: c.pid, proc: c.proc, type: c.type, prio: c.prio } : null; };
  const where = p => p.z;
  const out = [];
  sim.agents.forEach(a => {
    if (a.role === "PAT") return;
    const vs = [...a.visits].sort((x, y) => x.a - y.a); const pairs = []; let maxEnd = -1e9, last = null, minutes = 0;
    for (const v of vs) {
      if (last && v.a < maxEnd - 2 && (v.p.z !== last.p.z || Math.hypot(v.p.x - last.p.x, v.p.y - last.p.y) > 5)) {
        const ov = Math.min(maxEnd, v.b) - v.a; minutes += ov;
        pairs.push({ de: fmtT(v.a), a: fmtT(Math.min(maxEnd, v.b)), minutes: Math.round(ov), lieuA: where(last.p) + " (" + last.act + ")", lieuB: where(v.p) + " (" + v.act + ")", casA: caseAt(last.p.z, v.a), casB: caseAt(v.p.z, v.a) });
      }
      if (v.b > maxEnd) { maxEnd = v.b; last = v; }
    }
    if (minutes > 0) out.push({ code: a.code, role: a.role, minutes: Math.round(minutes), n: pairs.length, pairs });
  });
  return { label: d.label, seed: __cfg.seed, nCases: sim.cases.length, out: out.sort((x, y) => y.minutes - x.minutes) };
})()`, ctx);

// 3. cause probable (règles lues dans engine.js / generator.js)
const cause = o => {
  if (/garde/.test(o.code) && o.role === "MAR") return "UN SEUL « MAR-garde » pour toutes les urgences (generator.js : mar:\"MAR-garde\" dans makeUrgences)";
  if (/garde/.test(o.code)) return "UNE SEULE équipe de garde pour toute la nuit (engine.js : getTeam → clé \"G\" quand c.night)";
  if (o.role === "MAR") return "un MAR partagé par 2 salles (engine.js : mar = MAR-0(1+ri/2)) — choix de conception, aussi présent dans les vraies données";
  if (o.role === "IADE") return "transmission en SSPI qui recouvre la préparation du cas suivant de la même salle — recouvrement de quelques minutes";
  return "à examiner";
};
const filt = arg("agent"), MAX = +(arg("max") || 8);
const list = res.out.filter(o => !filt || o.code.includes(filt) || o.role.includes(filt));
console.log(`\n${res.label} · graine ${res.seed} · ${res.nCases} cas · ${res.out.length} agents avec chevauchement`);
const byCause = {}; res.out.forEach(o => { const c = cause(o); byCause[c] = (byCause[c] || 0) + o.minutes; });
console.log("\nMinutes de chevauchement par CAUSE probable :");
Object.entries(byCause).sort((a, b) => b[1] - a[1]).forEach(([c, m]) => console.log("  " + String(m).padStart(5) + " min  " + c));
list.slice(0, MAX).forEach(o => {
  console.log(`\n── ${o.code} (${o.role}) : ${o.minutes} min cumulées, ${o.n} chevauchement(s)\n   cause : ${cause(o)}`);
  o.pairs.slice(0, 4).forEach(p => console.log(`   ${p.de}-${p.a} (${p.minutes} min) : à la fois ${p.lieuA} et ${p.lieuB}` + (p.casA && p.casB && p.casA.pid !== p.casB.pid ? `   [patients ${p.casA.pid} ${p.casA.type}/${p.casA.prio} et ${p.casB.pid} ${p.casB.type}/${p.casB.prio}]` : "")));
  if (o.pairs.length > 4) console.log(`   … ${o.pairs.length - 4} autre(s)`);
});
if (!list.length) console.log("\n(aucun agent ne correspond au filtre)");
