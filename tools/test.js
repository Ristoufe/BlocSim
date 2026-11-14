#!/usr/bin/env node
// Tests d'acceptation du moteur BlocSim (npm test).
// 1. Zéro violation physique : personne à deux endroits, deux patients en salle, MAR à plus de deux patients,
//    SSPI sans personnel, brancards et lits, sur des journées générées et sur les journées réelles rejouées.
// 2. Reproductibilité : même graine et mêmes réglages = même journée, à l'identique (CSV détaillé identique octet par octet).
// 3. Nombres aléatoires communs : changer une capacité (lits de SSPI, brancardiers, brancards) garde exactement
//    les mêmes patients, les mêmes urgences et les mêmes absences ; la référence « sans aléas » garde les mêmes patients.
// 4. Référence calibrée : 50 journées ouvrées avec les salles tirées selon le jour, comparées aux mesures OPROOM (±10 %).
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const N = Math.max(10, +(process.argv.find((a) => /^--tirages=/.test(a)) || "=50").split("=")[1]);

const E = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), E, { filename: f });
vm.runInContext(`STATS = ${fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8")};`, E);
const run = (code, vars = {}) => { Object.assign(E, vars); return vm.runInContext(code, E); };

let failed = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "OK  " : "ÉCHEC"}  ${label}${detail ? " - " + detail : ""}`); if (!ok) failed++; };

/* 1. zéro violation physique */
{
  const presets = run("PRESETS.map(p=>p.id)");
  let checks = 0, viol = 0; const issues = [];
  for (const id of presets) for (let s = 1; s <= N; s++) {
    const d = run("generateDay(PRESETS.find(p=>p.id===__id).apply({...defaultConfig(), seed:__s, rooms:roomsFor(defaultConfig().date,__s)}))", { __id: id, __s: s });
    checks += d.validation.checks; viol += d.validation.violations; if (d.validation.violations) issues.push(`${id}#${s}: ${d.validation.issues[0]}`);
  }
  check(viol === 0, `Journées générées : ${presets.length} scénarios × ${N} tirages`, `${checks.toLocaleString("fr-FR")} contrôles, ${viol} violation(s)${issues.length ? " ; " + issues.slice(0, 3).join(" ; ") : ""}`);

  const days = JSON.parse(fs.readFileSync(path.join(ROOT, "data/days.json"), "utf8"));
  let ov = 0, roomOv = 0;
  for (const d of days) {
    const sim = run("buildDay(__d)", { __d: d });
    sim.agents.forEach((a) => { if (a.role === "PAT") return; for (let i = 1; i < a.visits.length; i++) if (a.visits[i].a < a.visits[i - 1].b - 0.01) ov++; });
    Object.entries(sim.byRoom).forEach(([r, L]) => { if (r === "SSPI") return; for (let i = 1; i < L.length; i++) if (L[i].s < L[i - 1].end - 0.01 || L[i].s < L[i - 1].cleanEnd - 0.01) roomOv++; });
  }
  check(ov === 0 && roomOv === 0, `Journées réelles rejouées (${days.length})`, `${ov} soignant(s) à deux endroits, ${roomOv} chevauchement(s) de patients ou de bionettoyage en salle`);
}

/* 2. reproductibilité */
{
  let same = true;
  for (const s of [1, 7, 42]) {
    const a = run("oproomCSV(buildDay(generateDay({...defaultConfig(), seed:__s})), true)", { __s: s });
    const b = run("oproomCSV(buildDay(generateDay({...defaultConfig(), seed:__s})), true)", { __s: s });
    if (a !== b) same = false;
  }
  check(same, "Reproductibilité : même graine = CSV détaillé identique octet par octet (3 graines)");
}

/* 3. nombres aléatoires communs */
{
  const key = (o) => {
    const P = o.planned.map((c) => `${c.room}|${c.planned}|${c.proc}|${c.dur}|${c.late}|${c.noShow}|${c.sdCancel}`).join(";");
    const U = o.urg.filter((u) => !o.cfg.burst.n || true).map((u) => `${u.arr}|${u.spec}|${u.cls}|${u.dur}`).join(";");
    // absences, par personne (nom sans la mention « remplaçant ») : comparées seulement pour les personnes présentes dans les deux configurations
    const base = (l) => l.replace(/ \((remplaçant|rappelé|redéployé)\)/g, "");
    const S = Object.fromEntries(o.res.ALL.map((p) => [base(p.label), p.absent ? "absent" : p.interim ? "remplacé" : "présent"]));
    return { P, U, S, canc: o.canc.map((c) => c.proc).join(";") };
  };
  let okCap = true, okBase = true; const diffs = [];
  for (const s of [3, 11, 42, 99]) {
    const base = run("(()=>{ const c=normalizeConfig({...defaultConfig(), seed:__s}); c.__di=dayInfo(c.date); return runOnce(c,true); })()", { __s: s });
    const k0 = key(base);
    for (const change of [{ sspiBeds: 4 }, { bran: 1 }, { brancards: 5 }, { sspiStaff: 2 }]) {
      const o = run("(()=>{ const c=normalizeConfig({...defaultConfig(), seed:__s, ...__ch}); c.__di=dayInfo(c.date); return runOnce(c,true); })()", { __s: s, __ch: change });
      const k = key(o);
      for (const f of ["P", "U", "canc"]) if (k[f] !== k0[f]) { okCap = false; diffs.push(`graine ${s}, ${JSON.stringify(change)} : ${f}`); }
      for (const name in k.S) if (name in k0.S && !/rappelé|redéployé/.test(name) && k.S[name] !== k0.S[name]) { okCap = false; diffs.push(`graine ${s}, ${JSON.stringify(change)} : absence de ${name}`); }
    }
    const calm = run("(()=>{ const c=normalizeConfig({...defaultConfig(), seed:__s}); c.__di=dayInfo(c.date); return runOnce(c,false); })()", { __s: s });
    const pk = (o) => o.planned.map((c) => `${c.room}|${c.planned}|${c.proc}|${c.dur}`).join(";");
    if (pk(calm) !== pk(base) || calm.urg.map((u) => u.arr).join() !== base.urg.map((u) => u.arr).join()) okBase = false;
  }
  check(okCap, "Changer une capacité garde les mêmes patients, urgences, annulations et absences (4 graines × 4 changements)", diffs.slice(0, 3).join(" ; "));
  check(okBase, "La référence « sans aléas » garde les mêmes patients programmés et les mêmes urgences");
}

/* 4. référence calibrée sur les jours ouvrés réels (mesures OPROOM, janvier à octobre 2026) */
{
  // Valeurs mesurées sur l'export (tools/compare_logs.py et calculs de contrôle) ; tolérance ±10 % ou ±15 min.
  const TARGET = { rooms: 5.5, progPerRoom: run("STATS.progPerRoomDay"), turnover: 12, first: 521, last: 924,   // première entrée : médiane ; dernière sortie : moyenne
    over1830: 0.078, occupancy: 0.64 };
  const dates = []; for (let d = new Date("2026-03-02T12:00:00Z"); dates.length < N; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w > 0 && w < 6) dates.push(d.toISOString().slice(0, 10)); }
  const A = { rooms: [], perRoom: [], gaps: [], first: [], last: [], occ: [] };
  dates.forEach((date, i) => {
    const d = run("generateDay({...defaultConfig(), date:__d, seed:__s, rooms:roomsFor(__d,__s)})", { __d: date, __s: 1000 + i });
    A.rooms.push(d.cfg.rooms.length);
    const by = {}; d.cases.filter((c) => c.type === "P").forEach((c) => (by[c.room] = by[c.room] || []).push(c));
    Object.values(by).forEach((L) => { L.sort((a, b) => a.s - b.s); A.perRoom.push(L.length); A.first.push(L[0].s); const end = (c) => c.s + c.dur + (c.waitBed || 0); A.last.push(Math.max(...L.map(end))); for (let k = 1; k < L.length; k++) { const g = L[k].s - end(L[k - 1]); if (g >= 0 && g < 180) A.gaps.push(g); } });
    // occupation : toutes les interventions de la salle (programmées et urgences), comme dans compare_logs.py
    const all = {}; d.cases.forEach((c) => (all[c.room] = all[c.room] || []).push(c));
    Object.entries(all).forEach(([room, L]) => { if (by[room]) A.occ.push(L.filter((c) => c.s >= 480 && c.s <= 1110).reduce((t, c) => t + c.dur, 0) / 630); });
  });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const hh = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
  const within = (v, t, tol = 0.1) => Math.abs(v - t) <= Math.abs(t) * tol;
  const r = { rooms: mean(A.rooms), perRoom: mean(A.perRoom), turnover: med(A.gaps), first: med(A.first), last: mean(A.last), over: A.last.filter((x) => x > 1110).length / A.last.length, occ: mean(A.occ) };
  check(within(r.rooms, TARGET.rooms), "Salles ouvertes par jour ouvré", `${r.rooms.toFixed(1)} (réel ${TARGET.rooms})`);
  check(within(r.perRoom, TARGET.progPerRoom, 0.15), "Interventions programmées par salle et par jour (±15 %)", `${r.perRoom.toFixed(2)} (réel ${TARGET.progPerRoom})`);
  check(Math.abs(r.turnover - TARGET.turnover) <= 3, "Délai médian sortie de salle → entrée suivante (±3 min)", `${r.turnover} min (réel ${TARGET.turnover} min, dont 7 min entre fin du bionettoyage et entrée)`);
  check(Math.abs(r.first - TARGET.first) <= 15, "Première entrée en salle (±15 min)", `${hh(r.first)} (réel ${hh(TARGET.first)})`);
  check(Math.abs(r.last - TARGET.last) <= 15, "Dernière sortie de salle (±15 min)", `${hh(r.last)} (réel ${hh(TARGET.last)})`);
  check(r.over <= TARGET.over1830 + 0.05, "Salles qui finissent après 18 h 30 (au plus +5 points)", `${(100 * r.over).toFixed(1)} % (réel ${(100 * TARGET.over1830).toFixed(1)} %)`);
  check(within(r.occ, TARGET.occupancy, 0.15), "Occupation 8 h - 18 h 30 par salle ouverte (±15 %)", `${(100 * r.occ).toFixed(0)} % (réel ${(100 * TARGET.occupancy).toFixed(0)} %)`);
}

console.log(failed ? `\n${failed} test(s) en échec` : "\nTous les tests passent");
process.exitCode = failed ? 1 : 0;
