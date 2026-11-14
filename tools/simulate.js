#!/usr/bin/env node
// BlocSim en ligne de commande : option secondaire, l'usage principal reste l'interface (npm start).
// Lance une ou plusieurs journées simulées sans navigateur, avec le même moteur que l'interface,
// écrit les CSV au format OPROOM dans logs/ et affiche le bilan.
//
//   node tools/simulate.js --aide
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HELP = `
BlocSim en ligne de commande (l'usage principal reste l'interface : npm start)

Usage : npm run sim -- [options]      ou      node tools/simulate.js [options]

Scénario
  --scenario <id>       type | jeudi | afflux | epidemie | aout | weekend | panne | sspi |
                        effectif | brancards | surcharge   (défaut : type)
  --config <fichier>    réglages en JSON (mêmes champs que l'écran « Créer une journée »)
  --nom <texte>         nom de la journée
  --date <AAAA-MM-JJ>   date simulée : le jour et le mois règlent le volume (défaut : 2026-11-17)

Réglages (remplacent ceux du scénario)
  --salles "OP 2,OP 3,..."   salles ouvertes
  --salle-urgence "OP 5"     salle d'urgence
  --programme <0.7-1.25>     remplissage du programme (1 = habituel)
  --urgences <n>             nombre moyen d'urgences, loi de Poisson (défaut : distribution réelle du jour)
  --afflux <n>@<HH:MM>       afflux de victimes, ex. 6@14:00
  --lits <4-12>              lits de SSPI ouverts
  --brancardiers <n>         --bionettoyage <n>
  --urgence <prio>@<HH:MM>@<spécialité>[@durée]   urgence ajoutée à la main (prio : vitale | urgente | differee), répétable
  --panne "<salle>@<HH:MM>-<HH:MM>"                panne de salle, répétable

Tirages
  --graine <n>          première graine aléatoire (défaut : 42)
  --tirages <n>         nombre de journées à simuler, graines successives (défaut : 1)

Sorties
  --sortie <dossier>    dossier des CSV (défaut : logs)
  --sans-csv            ne pas écrire les CSV, seulement le bilan
  --json                bilan au format JSON
  --aide                cette aide

Pour des centaines de journées dans des contextes variés : npm run campagne -- --aide

Exemples
  npm run sim -- --scenario afflux
  npm run sim -- --scenario sspi --tirages 50 --sans-csv
  npm run sim -- --lits 5 --brancardiers 2 --urgence vitale@10:30@"Chirurgie Orthopédique" --panne "OP 3@10:00-14:30"
`;

/* ---------- arguments ---------- */
function parseArgs(argv) {
  const a = { multi: { urgence: [], panne: [] } };
  for (let i = 0; i < argv.length; i++) {
    let k = argv[i];
    if (!k.startsWith("--")) continue;
    k = k.slice(2);
    const flags = ["sans-csv", "json", "aide", "help", "h"];
    if (flags.includes(k)) { a[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) fail(`Valeur manquante pour --${k}`);
    if (k in a.multi) a.multi[k].push(v); else a[k] = v;
  }
  return a;
}
function fail(msg) { console.error(`Erreur : ${msg}\nVoir : node tools/simulate.js --aide`); process.exit(1); }
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim()); if (!m) fail(`heure invalide : ${s} (format HH:MM)`); return +m[1] * 60 + +m[2]; };
const num = (v, name, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) fail(`--${name} doit être entre ${lo} et ${hi}`); return n; };

/* ---------- chargement du moteur de l'interface ---------- */
function loadEngine() {
  const ctx = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
  for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  const stats = fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8");
  vm.runInContext(`STATS = ${stats};`, ctx);
  return ctx;
}

/* ---------- configuration ---------- */
function buildConfig(E, a) {
  let cfg = vm.runInContext("defaultConfig()", E);
  const id = a.scenario || "type";
  const preset = vm.runInContext(`PRESETS.find(p=>p.id===${JSON.stringify(id)})`, E);
  if (!preset) fail(`scénario inconnu : ${id}. Choix : ${vm.runInContext("PRESETS.map(p=>p.id).join(', ')", E)}`);
  cfg = preset.apply(cfg);
  if (a.config) {
    const file = path.resolve(a.config);
    if (!fs.existsSync(file)) fail(`fichier introuvable : ${a.config}`);
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  const rooms = vm.runInContext("ALL_ROOMS", E);
  if (a.nom) cfg.name = a.nom;
  if (a.date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) fail("--date au format AAAA-MM-JJ"); cfg.date = a.date; }
  if (a.salles) {
    cfg.rooms = a.salles.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = cfg.rooms.filter((r) => !rooms.includes(r));
    if (bad.length) fail(`salle inconnue : ${bad.join(", ")}. Salles : ${rooms.join(", ")}`);
  }
  if (a["salle-urgence"]) { if (!rooms.includes(a["salle-urgence"])) fail(`salle inconnue : ${a["salle-urgence"]}`); cfg.urgRoom = a["salle-urgence"]; }
  if (!cfg.rooms.includes(cfg.urgRoom)) cfg.rooms.push(cfg.urgRoom);
  if (a.programme) cfg.load = num(a.programme, "programme", 0.7, 1.25);
  if (a.urgences) cfg.urgCount = num(a.urgences, "urgences", 0, 60);
  if (a.afflux) { const [n, h] = a.afflux.split("@"); cfg.burst = { n: num(n, "afflux", 0, 30), at: h ? toMin(h) : 840 }; }
  if (a.lits) cfg.sspiBeds = num(a.lits, "lits", 4, 12);
  if (a.brancardiers) cfg.bran = num(a.brancardiers, "brancardiers", 1, 6);
  if (a.bionettoyage) cfg.ash = num(a.bionettoyage, "bionettoyage", 1, 6);
  const specs = Object.keys(vm.runInContext("STATS.urg", E));
  cfg.events = [...(cfg.events || [])];
  for (const u of a.multi.urgence) {
    const [prio, h, spec, dur] = u.split("@");
    if (!["vitale", "urgente", "differee"].includes(prio)) fail(`priorité inconnue dans --urgence ${u} (vitale, urgente, differee)`);
    if (!specs.includes(spec)) fail(`spécialité inconnue : ${spec}. Choix : ${specs.join(" | ")}`);
    cfg.events.push({ kind: "urgence", prio, at: toMin(h), spec, dur: dur ? num(dur, "urgence (durée)", 10, 480) : null });
  }
  for (const p of a.multi.panne) {
    const m = /^(.+)@(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(p);
    if (!m) fail(`--panne attend "OP 3@10:00-14:30", reçu : ${p}`);
    if (!rooms.includes(m[1].trim())) fail(`salle inconnue : ${m[1]}`);
    cfg.events.push({ kind: "panne", room: m[1].trim(), at: toMin(m[2]), until: toMin(m[3]), label: "Panne" });
  }
  cfg.events.sort((x, y) => x.at - y.at);
  return cfg;
}

/* ---------- exécution ---------- */
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.aide || a.help || a.h) { console.log(HELP); return; }
  const E = loadEngine();
  const cfg = buildConfig(E, a);
  const runs = a.tirages ? num(a.tirages, "tirages", 1, 1000) : 1;
  const seed0 = a.graine ? num(a.graine, "graine", 1, 1e9) : cfg.seed;
  const outDir = path.resolve(ROOT, a.sortie || "logs");
  const writeCsv = !a["sans-csv"];
  if (writeCsv) fs.mkdirSync(outDir, { recursive: true });
  E.__cfg = cfg;

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const results = [];
  for (let i = 0; i < runs; i++) {
    E.__seed = seed0 + i;
    const out = vm.runInContext(`(()=>{
      const d = generateDay({...__cfg, seed: __seed});
      const sim = buildDay(d);
      return { report: d.report, baseline: d.baseline, csv: oproomCSV(sim,false), csvDetail: oproomCSV(sim,true), name: csvName(sim,false), nameDetail: csvName(sim,true) };
    })()`, E);
    const files = [];
    if (writeCsv) {
      for (const [n, c] of [[out.name, out.csv], [out.nameDetail, out.csvDetail]]) {
        const f = path.join(outDir, `${stamp}-${n}`);
        fs.writeFileSync(f, c, "utf8");
        files.push(path.relative(ROOT, f));
      }
    }
    results.push({ seed: seed0 + i, ...out.report, baseline: out.baseline, files });
  }
  if (a.json) { console.log(JSON.stringify({ config: cfg, runs: results }, null, 2)); return; }
  printSummary(cfg, results, writeCsv, outDir, stamp);
}

/* ---------- bilan ---------- */
function printSummary(cfg, R, writeCsv, outDir, stamp) {
  const METRICS = [
    ["done", "Interventions réalisées", ""],
    ["urg", "dont urgences", ""],
    ["annul", "Annulées avant le jour J", ""],
    ["deprog", "Déprogrammées faute de temps", ""],
    ["urgWait", "Attente moyenne des urgences", " min"],
    ["urgWaitMax", "Attente maximale d'une urgence", " min"],
    ["vitWait", "Attente moyenne des urgences vitales", " min"],
    ["late", "Retard moyen du programmé", " min"],
    ["overMin", "Débordement après 18 h 30 (total)", " min"],
    ["bedBlock", "Blocage en salle faute de lit SSPI", " min"],
    ["sspiPeak", "Pic d'occupation de la SSPI", ` / ${cfg.sspiBeds}`],
  ];
  const fmtN = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  console.log(`\nBlocSim - ${cfg.name}`);
  console.log(`${cfg.rooms.length} salles (urgences : ${cfg.urgRoom}) · programme ${Math.round(cfg.load * 100)} % · ${cfg.urgCount < 0 ? "urgences selon le jour" : cfg.urgCount + " urgences"}` +
    `${cfg.burst && cfg.burst.n ? ` + afflux de ${cfg.burst.n}` : ""} · ${cfg.sspiBeds} lits SSPI · ${cfg.bran} brancardier(s) · ${cfg.ash} agent(s) de bionettoyage` +
    `${cfg.events.length ? ` · ${cfg.events.length} événement(s) ajouté(s)` : ""}`);
  console.log(`${R.length} tirage(s), graine${R.length > 1 ? `s ${R[0].seed} à ${R[R.length - 1].seed}` : ` ${R[0].seed}`}\n`);
  const w = 40;
  if (R.length === 1) {
    const r = R[0];
    console.log(`${"".padEnd(w)} ${"Simulé".padStart(10)}  ${"Sans aléas".padStart(10)}`);
    for (const [k, l, u] of METRICS) {
      const b = r.baseline[k];
      console.log(`${l.padEnd(w)} ${(fmtN(r[k]) + u).padStart(10)}  ${b === undefined ? "" : (fmtN(b) + u).padStart(10)}`);
    }
  } else {
    console.log(`${"".padEnd(w)} ${"moyenne".padStart(9)} ${"min".padStart(7)} ${"médiane".padStart(8)} ${"max".padStart(7)}`);
    for (const [k, l, u] of METRICS) {
      const v = R.map((r) => r[k]).sort((x, y) => x - y);
      const mean = v.reduce((s, x) => s + x, 0) / v.length, med = v[Math.floor(v.length / 2)];
      console.log(`${l.padEnd(w)} ${fmtN(mean).padStart(9)} ${fmtN(v[0]).padStart(7)} ${fmtN(med).padStart(8)} ${fmtN(v[v.length - 1]).padStart(7)}${u.startsWith(" /") ? u : u ? "  (min)" : ""}`);
    }
  }
  if (writeCsv) {
    const sumFile = path.join(outDir, `${stamp}-bilan-${R.length}-tirages.csv`);
    const cols = ["seed", ...METRICS.map((m) => m[0])];
    const head = ["Graine", ...METRICS.map((m) => m[1])];
    fs.writeFileSync(sumFile, "﻿" + [head, ...R.map((r) => cols.map((c) => r[c]))].map((x) => x.join(";")).join("\r\n") + "\r\n", "utf8");
    console.log(`\nCSV au format OPROOM : ${R.length * 2} fichier(s) dans ${path.relative(ROOT, outDir) || "."}/`);
    console.log(`Bilan par tirage : ${path.relative(ROOT, sumFile)}`);
  }
  console.log("");
}

main();
