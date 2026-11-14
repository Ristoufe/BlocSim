#!/usr/bin/env node
// Calibration du moteur sur l'export OPROOM (npm run calibrer).
//
// Le moteur ajoute en salle des attentes et des aléas (MAR, chirurgien, équipement, complications, interne...)
// et des annulations le jour même (absents, jeûne, examens, déprogrammations). Les données réelles les
// contiennent déjà : sans correction, ils seraient comptés deux fois. Ce script fait tourner le moteur avec
// ses paramètres par défaut sur des jours ouvrés variés et mesure :
//   - calib.dur[spécialité] : facteur appliqué à la durée de base d'un cas programmé, pour que la durée en
//     salle simulée (moyenne géométrique) retrouve celle de l'export (exp(mu) dans stats.json) ;
//   - calib.preCancel : taux d'annulation tiré avant le jour J, réglé pour que le total des annulations
//     (avant le jour J et le jour même) rapporté à toutes les lignes, urgences comprises, retrouve le taux réel
//     de l'export (même définition que cancelRate dans tools/export_stats.py).
// Le résultat est écrit dans data/stats.json (clé calib), conservé par tools/export_stats.py.
//
//   node tools/calibrer.js [--jours 150] [--passes 4] [--verifier]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? +process.argv[i + 1] : d; };
const DAYS = arg("jours", 150), PASSES = arg("passes", 4), CHECK = process.argv.includes("--verifier");
const STATS_FILE = path.join(ROOT, "data/stats.json");

const E = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), E, { filename: f });
const stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
E.__stats = stats;
vm.runInContext("STATS = __stats;", E);

// jours ouvrés de janvier à octobre 2026, répartis sur toute la période
function workdays(n) {
  const all = []; const d = new Date("2026-01-02T12:00:00Z");
  while (d.toISOString() < "2026-10-31") { const w = d.getUTCDay(); if (w && w !== 6) all.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return Array.from({ length: n }, (_, i) => all[Math.floor(i * all.length / n)]);
}
const DATES = workdays(DAYS);

function measure() {
  E.__dates = DATES;
  return vm.runInContext(`(()=>{
    const logs={}, pre={n:0}, day={n:0}; let prog=0, urg=0;
    __dates.forEach((date,i)=>{
      const seed=1000+i, d=generateDay({...defaultConfig(), seed, date, rooms:roomsFor(date, seed)});
      d.cases.filter(c=>c.type==="P").forEach(c=>{ (logs[c.spec]=logs[c.spec]||[]).push(Math.log(Math.max(1,c.dur))); prog++; });
      urg += d.cases.filter(c=>c.type!=="P").length;
      d.cancelled.forEach(c=>{ if(c.when==="avant") pre.n++; else day.n++; });
    });
    const lines = prog + urg + pre.n + day.n;   // toutes les lignes de l'export : réalisées et annulées, urgences comprises
    return { geo:Object.fromEntries(Object.entries(logs).map(([k,v])=>[k,{n:v.length, mu:v.reduce((a,b)=>a+b,0)/v.length}])),
             pre:pre.n/lines, day:day.n/lines, total:(pre.n+day.n)/lines, progShare:(prog+pre.n+day.n)/lines };
  })()`, E);
}

function report(m, title) {
  console.log(`\n${title}`);
  console.log(`  annulations : ${(100 * m.total).toFixed(1)} % des lignes (réel ${(100 * stats.cancelRate).toFixed(1)} %) : ${(100 * m.pre).toFixed(1)} % avant le jour J, ${(100 * m.day).toFixed(1)} % le jour même ; taux tiré avant le jour J ${(100 * (stats.calib?.preCancel ?? stats.cancelRate)).toFixed(1)} %`);
  for (const [k, v] of Object.entries(m.geo).filter(([, v]) => v.n >= 30).sort((a, b) => b[1].n - a[1].n)) {
    const real = Math.exp(stats.specs[k]?.mu ?? NaN), sim = Math.exp(v.mu);
    console.log(`  ${k.padEnd(34)} durée ${sim.toFixed(0).padStart(4)} min, réel ${real.toFixed(0).padStart(4)} (${((sim / real - 1) * 100).toFixed(0).padStart(3)} %)  facteur ${(stats.calib?.dur?.[k] ?? 1).toFixed(3)}  (${v.n} cas)`);
  }
}

if (CHECK) { report(measure(), `Mesure sur ${DAYS} jours ouvrés (calibration actuelle)`); process.exit(0); }

stats.calib = stats.calib || { dur: {} };
delete stats.calib.sameDay;
stats.calib.dur = stats.calib.dur || {};
report(measure(), `Avant calibration (${DAYS} jours ouvrés)`);
for (let p = 1; p <= PASSES; p++) {
  const m = measure();
  for (const [k, v] of Object.entries(m.geo)) {
    if (v.n < 30 || !stats.specs[k]) continue;
    const ratio = Math.exp(stats.specs[k].mu - v.mu);
    stats.calib.dur[k] = Math.round(Math.min(1.3, Math.max(0.6, (stats.calib.dur[k] ?? 1) * ratio)) * 1000) / 1000;
  }
  // le taux tiré avant le jour J porte sur les cas programmés : on corrige l'écart du total rapporté à ces cas
  const cur = stats.calib.preCancel ?? stats.cancelRate;
  stats.calib.preCancel = Math.round(Math.min(0.5, Math.max(0, cur + (stats.cancelRate - m.total) / m.progShare)) * 1000) / 1000;
}
stats.calib.note = `tools/calibrer.js, ${DAYS} jours ouvrés, ${PASSES} passes`;
const after = measure();
report(after, "Après calibration");
fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
console.log(`\nCalibration écrite dans data/stats.json (clé calib).\n`);
