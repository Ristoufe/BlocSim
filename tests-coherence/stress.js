#!/usr/bin/env node
// Batterie de tests de cohérence pour BlocSim, modèle v2 (js/params.js, ordonnanceur à personnes).
// AUCUNE modification du dépôt : lecture seule, résultats écrits dans un dossier séparé.
//
// Principe : le dépôt a déjà ses propres tests (npm test, npm run check, validateDay). Cette batterie
// ne les refait pas : elle contrôle ce qu'ils ne couvrent pas, en recalculant à partir de la SORTIE
// (cases, cancelled, report, CSV) et non des structures internes de l'ordonnanceur.
//
// Usage (depuis la racine du dépôt) :
//   node tests-coherence/stress.js [N=200] [--repo=CHEMIN] [--out=DOSSIER] [--graine=N]
//        [--sans-experiences] [--experiences-seulement] [--rapide]
// Sorties : rapport.txt, resultats_par_journee.csv, anomalies.json, repro/<code>.json
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const arg = k => (process.argv.find(a => a.startsWith("--" + k + "=")) || "").split("=").slice(1).join("=");
const flag = k => process.argv.includes("--" + k);
const isRepo = d => d && fs.existsSync(path.join(d, "js", "engine.js"));
const ROOT = path.resolve([arg("repo"), process.cwd(), path.join(__dirname, "..")].find(isRepo) || (console.error("Dépôt BlocSim introuvable : --repo=CHEMIN"), process.exit(1)));
const OUT = path.resolve(arg("out") || path.join(__dirname, "sorties"));
const SEED0 = +(arg("graine") || 987654321);
const N = +(process.argv.find(a => /^\d+$/.test(a)) || 200);
const OPTS = { exp: !flag("sans-experiences"), fuzz: !flag("experiences-seulement"), fast: flag("rapide") };

const ctx = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"].filter(f => fs.existsSync(path.join(ROOT, f))))
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
vm.runInContext("STATS=" + fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8"), ctx);
vm.runInContext("REAL_DAYS=" + fs.readFileSync(path.join(ROOT, "data/days.json"), "utf8"), ctx);
if (vm.runInContext("typeof PARAMS==='undefined'||typeof simulate!=='function'", ctx)) {
  console.error("Ce script cible le modèle v2 (js/params.js et simulate()). Ce dépôt semble être une version antérieure."); process.exit(1);
}

function inner(NFUZZ, SEED0, OPTS) {
  /* ---------- instrumentation : ce que generateDay reçoit réellement (première simulation = celle avec aléas) ---------- */
  let CAP = null;
  const pick = (o, ks) => ks.map(k => (o[k] === undefined ? null : o[k]));
  const snap = (p, u) => JSON.stringify([p.map(c => pick(c, ["room", "proc", "spec", "type", "cls", "planned", "arr", "adm", "noShow", "mode", "child"])), u.map(c => pick(c, ["proc", "spec", "type", "cls", "arr", "adm"]))]);
  const _pp = planProgram, _mu = makeUrgences, _sim = simulate;
  planProgram = function (c, r) { const x = _pp(c, r); if (CAP && CAP.plan === null) CAP.plan = x.length; if (CAP && CAP.planList === null) CAP.planList = x; return x; };
  makeUrgences = function (c, r) { const x = _mu(c, r); if (CAP && CAP.urg === null) CAP.urg = x.length; return x; };
  simulate = function (c, p, u, r) { if (CAP && CAP.snap === null) CAP.snap = snap(p, u); return _sim(c, p, u, r); };
  const run = cfg => { CAP = { plan: null, urg: null, snap: null, planList: null }; const d = generateDay(cfg); const cap = CAP; CAP = null; return { d, cap }; };

  const R = {}, info = {};
  const add = (id, desc, n, ex) => {
    const o = R[id] || (R[id] = { desc, runs: 0, badRuns: 0, total: 0, examples: [] });
    o.runs++; if (n > 0) { o.badRuns++; o.total += n; if (o.examples.length < 2 && ex) o.examples.push(ex); }
  };
  const FAST = OPTS.fast ? 0.5 : 1, sc = n => Math.max(5, Math.round(n * FAST));
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0), r1 = x => Math.round(x * 10) / 10;
  const hm = x => { const m = /^(\d\d):(\d\d)$/.exec(x); return m ? +m[1] * 60 + +m[2] : null; };

  /* ---------- aléa du banc de test (indépendant de celui du moteur) ---------- */
  let s = SEED0 >>> 0 || 1;
  const rr = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
  const ri = (a, b) => a + Math.floor(rr() * (b - a + 1));
  const rpick = a => a[Math.floor(rr() * a.length)];
  const urgSpecs = Object.keys(STATS.urg);
  const randParam = p => {
    if (p.type === "enum") return rpick(p.options)[0];
    if (p.type === "bool") return rr() < 0.5;
    if (p.key === "urgCount") return rr() < 0.3 ? -1 : ri(0, 25);
    if (p.type === "range") { const n = Math.round((p.max - p.min) / p.step); return +(p.min + p.step * ri(0, n)).toFixed(4); }
    return ri(p.min, p.max);
  };
  const DATES = ["2026-01-20", "2026-02-17", "2026-03-19", "2026-05-11", "2026-06-04", "2026-08-18", "2026-09-17", "2026-10-29", "2026-11-17", "2026-11-21", "2026-11-22"];
  function fuzzCfg() {
    const c = defaultConfig(); c.seed = ri(1, 99999); c.date = rpick(DATES); c.rooms = roomsFor(c.date, c.seed);
    PARAMS.forEach(p => { if (rr() < 0.35) c[p.key] = randParam(p); });
    c.burst = { at: ri(0, 1439), n: rr() < 0.35 ? ri(1, 12) : 0 };
    c.events = [];
    for (let i = ri(0, 2); i > 0; i--) { const at = ri(360, 1000); c.events.push({ kind: "panne", room: rpick(c.rooms), at, until: at + ri(30, 300), label: "Panne" }); }
    for (let i = ri(0, 2); i > 0; i--) c.events.push({ kind: "urgence", prio: rpick(["vitale", "urgente", "differee"]), at: ri(0, 1439), spec: rpick(urgSpecs), dur: null });
    return c;
  }

  /* ---------- contrôles sur la sortie d'une journée ---------- */
  const overlapMinutes = ivs => { // ivs = [[a,b,idCas]], retourne les minutes qui se chevauchent entre cas différents
    const v = ivs.filter(x => x[0] != null && x[1] != null).sort((x, y) => x[0] - y[0]); let m = 0, maxEnd = -1e9, who = null;
    for (const x of v) { if (who !== null && x[2] !== who && x[0] < maxEnd - 0.01) m += Math.min(maxEnd, x[1]) - x[0]; if (x[1] > maxEnd) { maxEnd = x[1]; who = x[2]; } }
    return m;
  };
  const groupBy = (arr, f) => { const g = {}; arr.forEach(x => { const k = f(x); if (k != null && k !== "") (g[k] = g[k] || []).push(x); }); return g; };
  function checkDay(cfg, d, cap, ex) {
    const C = d.cases, rep = d.report, cn = d.cancelled;
    const urgRoom = cfg.urgRoom;
    // K : conservation et cohérence bilan / sortie
    const lost = cap.plan + cap.urg - (C.length + cn.length);
    add("K1", "Patients générés absents de la sortie (ni opérés, ni annulés)", lost > 0 ? lost : 0, ex);
    add("K1b", "Patients en trop dans la sortie (dupliqués)", lost < 0 ? -lost : 0, ex);
    const P = C.filter(c => c.type === "P").length, U = C.length - P;
    add("K2", "Le bilan (report) ne correspond pas aux cas exportés (réalisés, programmés, urgences)", (rep.done !== C.length) + (rep.prog !== P) + (rep.urg !== U), ex);
    const dep = cn.filter(c => c.when === "jour" && /Déprogrammé/.test(c.reason)).length, avant = cn.filter(c => c.when === "avant").length;
    add("K3", "Le bilan ne correspond pas aux annulations exportées (déprogrammées, annulées avant le jour J)", (rep.deprog !== dep) + (rep.annul !== avant), ex);
    add("V1", "Violations détectées par la validation interne de l'équipe (validateDay)", d.validation.violations, ex);
    // D : recalcul des contraintes physiques à partir de la sortie seule
    const byCh = groupBy(C, c => c.ch);
    add("D1", "Chirurgien en train d'opérer dans deux salles à la fois (minutes ; intervalle chirIn)", Object.values(byCh).reduce((m, L) => m + overlapMinutes(L.map(c => [c.chirIn && c.chirIn[0], c.chirIn && c.chirIn[1], c.id])), 0), ex);
    const marIv = {}; C.forEach(c => { if (c.mar) { (marIv[c.mar] = marIv[c.mar] || []).push([c.marInd && c.marInd[0], c.marInd && c.marInd[1], c.id], [c.marRev && c.marRev[0], c.marRev && c.marRev[1], c.id]); } });
    add("D2", "Anesthésiste (MAR) à une induction ou un réveil dans deux salles à la fois (minutes)", Object.values(marIv).reduce((m, L) => m + overlapMinutes(L), 0), ex);
    ["iade", "ibode", "circ"].forEach(role => {
      const g = groupBy(C, c => c.team && c.team[role]);
      add("D3_" + role.toUpperCase(), `Équipe ${role.toUpperCase()} dans deux salles à la fois, de l'entrée en salle à la fin du réveil (minutes)`, Object.values(g).reduce((m, L) => m + overlapMinutes(L.map(c => [c.phT && c.phT[0], c.phT && c.phT[5], c.id])), 0), ex);
    });
    const byAsh = groupBy(C, c => c.cleanBy);
    add("D4", "Agent de bionettoyage dans deux salles à la fois (minutes)", Object.values(byAsh).reduce((m, L) => m + overlapMinutes(L.map(c => [c.cleanStart, c.cleanEnd, c.id])), 0), ex);
    const byBed = groupBy(C.filter(c => c.bed != null), c => c.bed);
    add("D5", "Lit de SSPI occupé par deux patients à la fois (minutes ; sspiIn à recOut)", Object.values(byBed).reduce((m, L) => m + overlapMinutes(L.map(c => [c.sspiIn, c.recOut, c.id])), 0), ex);
    { const ev = []; C.forEach(c => { if (c.sspiIn != null && c.recOut != null) ev.push([c.sspiIn, 1], [c.recOut, -1]); }); ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let cur = 0, mx = 0; ev.forEach(e => { cur += e[1]; mx = Math.max(mx, cur); });
      add("D6", "Plus de patients en SSPI que de lits (pic observé moins nombre de lits)", mx > cfg.sspiBeds ? mx - cfg.sspiBeds : 0, ex); }
    { const byRoom = groupBy(C, c => c.room); let n = 0; Object.values(byRoom).forEach(L => { L.sort((a, b) => a.s - b.s); for (let i = 1; i < L.length; i++) if (L[i].s < (L[i - 1].cleanEnd ?? 0) - 0.01) n++; });
      add("D7", "Deux patients dans la même salle (entrée avant la fin du bionettoyage précédent)", n, ex); }
    // G : règles du modèle
    add("G2", "Cas programmé démarré plus de 15 min après l'heure limite (lastProgStart)", C.filter(c => c.type === "P" && c.s > cfg.lastProgStart + 15).length, ex);
    { let inv = 0; const L = C.filter(c => c.waitBed > 0); for (const a of L) for (const b of C) if (a !== b && a.s + a.dur < b.s + b.dur && a.s + a.dur + a.waitBed > b.s + b.dur + b.waitBed) inv++;
      add("G9", "Inversion d'ordre de sortie de salle (un patient qui finit après sort avant, alors que l'autre attend un lit)", inv, ex); }
    add("G10", "Panne démarrant pendant une opération qui continue normalement (choix de modèle)", d.closures.reduce((n, z) => n + C.filter(c => c.room === z.room && c.s < z.from && c.s + c.dur > z.from).length, 0), ex);
    add("G12", "Cas dont la fin de salle, de SSPI ou de bionettoyage dépasse minuit (heure CSV repliée)", C.filter(c => Math.max(c.s + c.dur + c.waitBed, c.recOut || 0, c.cleanEnd || 0) >= 1440).length, ex);
    add("G14", "Valeurs non finies (NaN) dans les cas", C.reduce((n, c) => n + ["s", "dur", "waitBed", "recOut", "cleanStart", "cleanEnd", "arr"].filter(k => !Number.isFinite(c[k])).length, 0), ex);
    // N : garde de nuit (GUIDE : une équipe et un MAR de garde ; afflux d'au moins 3 victimes : jusqu'à 2 équipes et 1 MAR rappelés)
    // On ne compte que les équipes de garde et d'astreinte : une équipe de jour peut finir un cas qui commence juste après 19 h 30.
    { const night = C.filter(c => (c.s >= 1170 || c.s < 420) && c.team); const planBlanc = cfg.burst && cfg.burst.n >= 3; const isG = l => /garde|astreinte/i.test(l || "");
      let mxT = 0, mxM = 0, tt = null;
      for (let t = 1170; t < 1860; t += 5) { const act = night.filter(c => c.s <= t && t < c.s + c.dur + c.waitBed);
        const teams = new Set(act.filter(c => isG(c.team.ibode)).map(c => c.team.ibode)).size, mars = new Set(act.filter(c => isG(c.mar)).map(c => c.mar)).size;
        if (teams > mxT) { mxT = teams; tt = t; } mxM = Math.max(mxM, mars); }
      const okT = cfg.nightTeams + (planBlanc ? 2 : 0), okM = 1 + (planBlanc ? 1 : 0);
      add("N1", "Plus d'équipes de garde ou d'astreinte simultanées la nuit que la règle du GUIDE (garde + 2 rappelées par le plan blanc)", mxT > okT ? mxT - okT : 0, { ...ex, equipesMax: mxT, autorisees: okT, vers: tt });
      add("N2", "Plus d'anesthésistes de garde ou d'astreinte simultanés la nuit que la règle (1 + 1 rappelé par le plan blanc)", mxM > okM ? mxM - okM : 0, { ...ex, marMax: mxM, autorises: okM }); }
    // I : indicateurs de qualité de service (pas des règles)
    add("I1", "Urgence immédiate (classe imm) opérée après son délai maximal", C.filter(c => c.cls === "imm" && c.deadline != null && c.s > c.deadline).length, ex);
    { const rank = { imm: 0, h1: 1, h6: 2, h24: 3 }; let inv = 0;
      C.filter(a => (a.cls === "imm" || a.cls === "h1") && a.deadline != null && a.s > a.deadline).forEach(a => { const ra = rank[a.cls];
        if (C.some(b => b !== a && b.room === a.room && b.s >= a.arr && b.s < a.s && (b.type === "P" || rank[b.cls] > ra))) inv++; });
      add("I2", "Urgence immédiate ou sous 1 h opérée hors délai alors qu'un cas moins prioritaire démarre dans la même salle pendant son attente (à expliquer : peut venir d'une indisponibilité de chirurgien)", inv, ex); }
  }

  function checkCsv(cfg, d, sim, ex) {
    const det = oproomRows(sim, true); let bad = 0, width = 0, arrGap = 0, closed = 0, elim = 0;
    const okPid = new Set(sim.cases.filter(x => Number.isFinite(x.outRec) && Math.max(x.end, x.outRec, x.cleanEnd) < 1440 && x.arr2 >= 0).map(x => x.pid));
    det.forEach(r => { if (r.length !== OPROOM_COLS.length + DETAIL_COLS.length) width++;
      if (r[5] === "éliminé") { elim++; return; } if (r[5] !== "fermé") return; closed++;
      if (r[6] !== "programmé") { const gen = d.cases.find(x => x.type !== "P" && x.s === hm(r[9]) && x.room === r[4]); if (gen && Math.round(gen.s - gen.arr) !== +r[27]) arrGap++; }
      if (!okPid.has(r[r.length - 1])) return;
      const ch = [hm(r[8]), hm(r[9]), hm(r[10]), hm(r[12]), hm(r[14])]; for (let i = 1; i < ch.length; i++) if (ch[i] != null && ch[i - 1] != null && ch[i] < ch[i - 1]) { bad++; break; }
      if (hm(r[11]) != null && hm(r[10]) != null && hm(r[11]) < hm(r[10])) bad++; });
    add("C1", "Ligne CSV (hors minuit) dont la chronologie arrivée→entrée→sortie→SSPI→sortie bloc n'est pas croissante", bad, ex);
    add("C2", "Ligne CSV dont le nombre de colonnes diffère de l'en-tête", width, ex);
    add("C3", "Urgence dont l'attente du CSV détaillé diffère de l'attente du bilan", arrGap, ex);
    add("C4", "Nombre de lignes du CSV différent du nombre de cas réalisés ou annulés", (closed !== d.cases.length) + (elim !== d.cancelled.length), ex);
  }

  function checkEngine(sim, ex, P) { // animation : personnel à deux endroits, retards, lits, visites négatives, seuils jour/nuit
    const cat = a => a.role + (/garde/.test(a.code) ? "-garde" : ""); const ov = {}, late = {};
    sim.agents.forEach(a => { if (a.role === "PAT") return;
      const vs = [...a.visits].sort((x, y) => x.a - y.a); let maxEnd = -1e9, last = null, m = 0;
      for (const v of vs) { if (last && v.a < maxEnd - 2 && (v.p.z !== last.p.z || Math.hypot(v.p.x - last.p.x, v.p.y - last.p.y) > 5)) m += Math.min(maxEnd, v.b) - v.a; if (v.b > maxEnd) { maxEnd = v.b; last = v; } }
      if (m > 0) ov[cat(a)] = (ov[cat(a)] || 0) + m; });
    sim.agents.forEach(a => { if (a.role === "PAT" || !a.home) return; const vs = [...a.visits].sort((x, y) => x.a - y.a); let pos = a.home, t = -1e9, n = 0; const tr = (f, to) => plen(mkPath(f, to, a.lane)) / a.speed;
      for (const v of vs) { if (pos !== a.home) { const back = tr(pos, a.home), go = tr(a.home, v.p); if (v.a - t > back + go + 25) { t += back; pos = a.home; } } const td = tr(pos, v.p), dep = Math.max(t, v.a - td), arrive = dep + td; if (arrive - v.a > 3) n++; pos = v.p; t = Math.max(arrive, v.b); }
      if (n) late[cat(a)] = (late[cat(a)] || 0) + n; });
    ["BRAN", "ASH", "IADE", "IADE-garde", "IBODE", "IBODE-garde", "CIRC", "CIRC-garde", "MAR", "MAR-garde", "CHIR"].forEach(k => add(P + "1_" + k, "Animation : personnel " + k + " à deux endroits en même temps (minutes)", ov[k] || 0, ex));
    ["BRAN", "ASH", "IADE", "IBODE", "MAR", "MAR-garde"].forEach(k => add(P + "2_" + k, "Animation : visites " + k + " atteintes avec plus de 3 min de retard sur le poste", late[k] || 0, ex));
    const byBed = {}; sim.cases.forEach(c => (byBed[c.bed] = byBed[c.bed] || []).push([c.inRec, c.outRec]));
    let e3 = sim.cases.filter(c => c.bed >= REC_BEDS.length).length; for (const b in byBed) { const L = byBed[b].sort((x, y) => x[0] - y[0]); for (let i = 1; i < L.length; i++) if (L[i][0] < L[i - 1][1] - 0.01) e3++; }
    add(P + "3", "Animation : lit de SSPI occupé par deux patients à la fois", e3, ex);
    add(P + "5", "Animation : visite de durée négative", sim.agents.reduce((n, a) => n + a.visits.filter(v => v.b < v.a - 0.01).length, 0), ex);
    add(P + "6", "Animation : seuils jour/nuit différents entre ordonnanceur (19 h 30 / 7 h) et animation (18 h 30 / 7 h 30)", sim.cases.filter(c => c.night && !(c.s >= 1170 || c.s < 420)).length, ex);
  }

  /* ---------- 1. réglages aléatoires (tous les paramètres perturbés) ---------- */
  const runs = [];
  if (OPTS.fuzz) {
    for (let i = 0; i < NFUZZ; i++) {
      const cfg = fuzzCfg(); let d, sim, cap;
      try { ({ d, cap } = run(cfg)); } catch (e) { add("X1", "generateDay lève une exception", 1, { cfg, err: e.message.slice(0, 120) }); continue; }
      try { sim = buildDay(d); } catch (e) { add("X2", "buildDay (animation) lève une exception", 1, { cfg, err: e.message.slice(0, 120) }); continue; }
      const ex = { cfg }; checkDay(cfg, d, cap, ex); checkEngine(sim, ex, "E");
      try { checkCsv(cfg, d, sim, ex); } catch (e) { add("X3", "Export CSV lève une exception", 1, { cfg, err: e.message.slice(0, 120) }); }
      runs.push({ seed: cfg.seed, date: cfg.date, load: cfg.load, urgCount: cfg.urgCount, afflux_n: cfg.burst.n, salles: cfg.rooms.length, lits_sspi: cfg.sspiBeds, bran: cfg.bran, ash: cfg.ash, ...Object.fromEntries(["done", "prog", "urg", "deprog", "urgWait", "vitWait", "urgInTime", "late", "overMin", "bedBlock", "sspiPeak"].map(k => [k, d.report[k]])), validation: d.validation.violations, config_json: JSON.stringify(cfg) });
    }
    REAL_DAYS.forEach(day => { try { checkEngine(buildDay(day), { date: day.date }, "R"); } catch (e) { add("RX", "buildDay lève une exception sur une vraie journée", 1, { date: day.date, err: e.message.slice(0, 120) }); } });
  }
  if (!OPTS.exp) return { R, info, nFuzz: NFUZZ, runs };

  /* ---------- 2. balayage des bornes de chaque paramètre (les autres restent par défaut) ---------- */
  { const bad = []; const sweepSeeds = [11, 12];
    PARAMS.forEach(p => {
      const vals = p.type === "enum" ? p.options.map(o => o[0]) : p.type === "bool" ? [true, false] : p.key === "urgCount" ? [0, 25] : [p.min, p.max];
      vals.forEach(v => sweepSeeds.slice(0, OPTS.fast ? 1 : 2).forEach(sd => {
        const cfg = defaultConfig(); cfg.seed = sd; cfg[p.key] = v; const why = [];
        try { const { d, cap } = run(cfg); const C = d.cases;
          if (d.validation.violations > 0) why.push("validation interne : " + d.validation.violations);
          if (cap.plan + cap.urg !== C.length + d.cancelled.length) why.push("patients perdus : " + (cap.plan + cap.urg - C.length - d.cancelled.length));
          if (C.some(c => !Number.isFinite(c.s) || !Number.isFinite(c.dur))) why.push("NaN");
          try { buildDay(d); } catch (e) { why.push("animation : " + e.message.slice(0, 50)); }
        } catch (e) { why.push("exception : " + e.message.slice(0, 60)); }
        add("P1", "Paramètre à une borne : exception, NaN, patient perdu ou violation de validation", why.length ? 1 : 0, why.length ? { cfg } : null);
        if (why.length) bad.push({ parametre: p.key, valeur: v, graine: sd, anomalies: why });
      }));
    });
    info.balayageDesBornes = { parametres: PARAMS.length, testsEnEchec: bad.length, details: bad.slice(0, 25) };
  }

  /* ---------- 3. tests métamorphiques ---------- */
  { // M1 : changer une capacité ne change ni les patients, ni les urgences, ni les annulations avant le jour J, ni les absents
    const changes = [["sspiBeds", c => c.sspiBeds === 4 ? 8 : 4], ["bran", c => c.bran === 1 ? 4 : 1], ["brancards", c => c.brancards === 3 ? 12 : 3], ["ash", c => c.ash === 1 ? 4 : 1], ["sspiStaff", c => c.sspiStaff === 1 ? 5 : 1]];
    let bad = 0, tot = 0, ex = null;
    for (let i = 0; i < sc(20); i++) { const cfg = fuzzCfg(); const base = run(cfg);
      changes.forEach(([k, f]) => { const c2 = { ...cfg, [k]: f(cfg) }; const o = run(c2); tot++;
        const same = o.cap.snap === base.cap.snap && o.d.report.annul === base.d.report.annul && o.d.report.absents === base.d.report.absents;
        add("M1", "Changer une capacité modifie les patients, les urgences, les annulations ou les absents (nombres aléatoires communs)", same ? 0 : 1, same ? null : { cfg, changement: k + " : " + cfg[k] + " → " + c2[k] });
        if (!same) { bad++; if (!ex) ex = { cfg, changement: k + " : " + cfg[k] + " → " + c2[k], patients: o.cap.snap === base.cap.snap ? "identiques" : "différents", annulAvant: [base.d.report.annul, o.d.report.annul], absents: [base.d.report.absents, o.d.report.absents] }; } }); }
    info.M1 = { changementsTestes: tot, ecarts: bad, exemple: ex };
    // M2 : plus de lits de SSPI ne doit pas augmenter le temps de blocage en salle
    let up = 0, n2 = 0, worst = 0; for (let i = 0; i < sc(30); i++) { const cfg = fuzzCfg(); cfg.sspiBeds = ri(4, 8); const a = run(cfg).d.report.bedBlock, b = run({ ...cfg, sspiBeds: cfg.sspiBeds + 3 }).d.report.bedBlock; n2++; add("M2", "Trois lits de SSPI de plus augmentent le blocage en salle (même journée)", b > a ? 1 : 0, b > a ? { cfg } : null); if (b > a) { up++; worst = Math.max(worst, b - a); } }
    info.M2 = { journeesTestees: n2, blocageAugmente: up, pireAugmentationMin: worst };
  }

  /* ---------- 4. expériences ciblées ---------- */
  { const keys = ["urgWait", "vitWait", "urgInTime", "late", "overMin", "bedBlock", "deprog"], res = {}, N2 = sc(25);
    for (const p of PRESETS) { const acc = {}; keys.forEach(k => acc[k] = 0); for (let i = 1; i <= N2; i++) { const c = p.apply(defaultConfig()); c.seed = i; const rp = generateDay(c).report; keys.forEach(k => acc[k] += rp[k] / N2); } keys.forEach(k => acc[k] = r1(acc[k])); res[p.id] = acc; }
    info.effetDesScenarios = res; }
  { const res = {}, N2 = sc(30); for (const [n, b, a] of [["3 bran / 3 bio", 3, 3], ["1 bran seul", 1, 3], ["1 bio seul", 3, 1]]) { let late = 0, wb = 0, wa = 0; for (let i = 1; i <= N2; i++) { const c = defaultConfig(); c.seed = i; c.bran = b; c.ash = a; const rp = generateDay(c).report; late += rp.late / N2; wb += rp.waitBrancard / N2; wa += rp.waitAsh / N2; }
      res[n] = { retardMoyenProgramme: r1(late), attenteBrancardMinParJour: r1(wb), attenteBionettoyageMinParJour: r1(wa) }; } info.effectifsIsoles = res; }
  { const by = {}; for (let i = 1; i <= sc(100); i++) { const c = PRESETS.find(p => p.id === "sspi").apply(defaultConfig()); c.seed = i; generateDay(c).cases.forEach(x => (by[x.room] = by[x.room] || []).push(x.waitBed)); }
    info.attenteLitSSPIparSalle = Object.fromEntries(Object.entries(by).sort(([x], [y]) => x.localeCompare(y, "fr", { numeric: true })).map(([k, v]) => [k, r1(avg(v))])); }
  { let n = 0, inTime = 0, w = [], mx = 0; for (let i = 1; i <= sc(60); i++) { const c = PRESETS.find(p => p.id === "afflux").apply(defaultConfig()); c.seed = i; generateDay(c).cases.filter(x => x.cls === "imm").forEach(x => { n++; const wt = x.s - x.arr; w.push(wt); if (x.s <= x.deadline) inTime++; mx = Math.max(mx, wt); }); }
    info.urgencesImmediatesAfflux14h = { cas: n, dansLeDelai: n ? Math.round(100 * inTime / n) + " %" : "-", attenteMoyenne: r1(avg(w)) + " min", attenteMax: Math.round(mx) + " min" }; }
  { const res = {}; for (const u of [6, 14, 22]) { let b = 0; const N2 = sc(40); for (let i = 1; i <= N2; i++) { const c = defaultConfig(); c.seed = i; c.urgCount = u; if (generateDay(c).cases.some(x => Math.max(x.s + x.dur + x.waitBed, x.recOut || 0, x.cleanEnd || 0) >= 1440)) b++; } res[u + " urgences en moyenne"] = Math.round(100 * b / N2) + " % des journées"; } info.passageDeMinuit = res; }
  { const res = {}, N2 = sc(40); for (const p of PRESETS) { let days = 0, lost = 0; for (let i = 1; i <= N2; i++) { const c = p.apply(defaultConfig()); c.seed = i; const { d, cap } = run(c); const l = cap.plan + cap.urg - d.cases.length - d.cancelled.length; if (l > 0) { days++; lost += l; } }
      res[p.id] = { journeesAvecPatientPerdu: Math.round(100 * days / N2) + " %", patientsPerdusParJournee: Math.round(100 * lost / N2) / 100 }; } info.patientsPerdusParScenario = res; }
  return { R, info, nFuzz: NFUZZ, runs };
}

const out = vm.runInContext("(" + inner.toString() + ")(" + N + "," + SEED0 + "," + JSON.stringify(OPTS) + ")", ctx);
const rows = Object.entries(out.R).sort(([a], [b]) => a.localeCompare(b, "fr", { numeric: true }));
const L = []; const log = (...a) => { const t = a.join(" "); console.log(t); L.push(t); };
log(`\n=== ${out.nFuzz} journées aléatoires (tous paramètres perturbés) + 6 vraies journées — dépôt : ${ROOT} ===\n`);
log("id".padEnd(14) + "journées en échec".padEnd(20) + "moy./journée".padEnd(14) + "description");
for (const [id, o] of rows) log(id.padEnd(14) + `${o.badRuns}/${o.runs}`.padEnd(20) + (o.total / o.runs).toFixed(1).padEnd(14) + o.desc);
log("\n=== Expériences et tests ciblés ==="); log(JSON.stringify(out.info, null, 1));
fs.mkdirSync(path.join(OUT, "repro"), { recursive: true });
fs.writeFileSync(path.join(OUT, "rapport.txt"), L.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "anomalies.json"), JSON.stringify(Object.fromEntries(rows.map(([id, o]) => [id, { description: o.desc, journeesEnEchec: o.badRuns, journeesTestees: o.runs, total: o.total, exemples: o.examples }])), null, 1));
rows.forEach(([id, o]) => { if (o.examples[0] && o.examples[0].cfg) fs.writeFileSync(path.join(OUT, "repro", id + ".json"), JSON.stringify(o.examples[0].cfg, null, 1)); });
if (out.runs.length) { const cols = Object.keys(out.runs[0]); const cell = v => { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  fs.writeFileSync(path.join(OUT, "resultats_par_journee.csv"), "\ufeff" + [cols, ...out.runs.map(r => cols.map(c => r[c]))].map(r => r.map(cell).join(";")).join("\r\n") + "\r\n"); }
console.log(`\nSorties écrites dans ${OUT}\n  rapport.txt · resultats_par_journee.csv · anomalies.json · repro/<code>.json`);
