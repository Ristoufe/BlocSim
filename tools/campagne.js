#!/usr/bin/env node
// BlocSim - mode campagne.
// Tire un grand nombre de journées de bloc dans des contextes réalistes et variés (date, saison,
// épidémie, vacances, salles ouvertes, effectifs, absences, lits, brancards, pannes, afflux rares),
// simule chacune avec le moteur de l'interface, vérifie sa cohérence et écrit un rapport.
// But : disposer d'un banc d'essai pour tester la fiche technique d'un logiciel dans énormément
// de situations différentes, toutes plausibles.
//
//   npm run campagne -- --aide
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HELP = `
BlocSim - mode campagne : beaucoup de journées réalistes et variées, puis un rapport

Usage : npm run campagne -- [options]      ou      node tools/campagne.js [options]

  --n <nombre>          nombre de journées à simuler (défaut : 500, max 20000)
  --profil <nom>        realiste   : situations tirées à leur fréquence réelle (défaut)
                        contrastes : chaque famille de situations a le même poids
                                     (meilleure couverture des cas rares, toujours plausibles)
  --annee <AAAA>        année des dates tirées (défaut : 2026)
  --sans-weekend        ne tirer que des jours ouvrés
  --graine <n>          graine de la campagne (défaut : 1), même graine = même campagne
  --csv                 écrire aussi un CSV OPROOM détaillé par journée (volumineux)
  --sortie <dossier>    dossier de sortie (défaut : campagnes/<date-heure>)
  --aide                cette aide

Sorties
  contextes.csv    une ligne par journée : contexte tiré, réglages, indicateurs, contrôles
  configs.jsonl    la configuration complète de chaque journée (rejouable dans l'interface
                   via « Modifier ce scénario » ou avec npm run sim -- --config)
  RAPPORT.md       couverture des situations, distribution des indicateurs, comparaison
                   par situation, sensibilité aux paramètres, pires journées, contrôles
  journees/        (avec --csv) les CSV OPROOM détaillés

Exemples
  npm run campagne -- --n 2000
  npm run campagne -- --n 1000 --profil contrastes --sans-weekend
`;

/* ---------- arguments ---------- */
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    if (["csv", "aide", "help", "h", "sans-weekend"].includes(key)) { a[key] = true; continue; }
    if (!["n", "profil", "annee", "graine", "sortie"].includes(key)) fail(`option inconnue : --${key}`);
    if (argv[i + 1] === undefined) fail(`valeur manquante pour --${key}`);
    a[key] = argv[++i];
  }
  return a;
}
function fail(msg) { console.error(`Erreur : ${msg}\nVoir : node tools/campagne.js --aide`); process.exit(1); }
function intArg(v, name, lo, hi, def) {
  if (v == null) return def;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < lo || n > hi) fail(`--${name} attend un nombre entre ${lo} et ${hi}`);
  return n;
}

/* ---------- moteur ---------- */
function loadEngine() {
  const ctx = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat });
  for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/export.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  vm.runInContext(`STATS = ${fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8")};`, ctx);
  return ctx;
}

/* ---------- aléatoire de la campagne (indépendant de celui des journées) ---------- */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pickW = (r, obj) => { const e = Object.entries(obj); let x = r() * e.reduce((s, [, w]) => s + w, 0); for (const [k, w] of e) { x -= w; if (x <= 0) return k; } return e[e.length - 1][0]; };
const uni = (r, a, b) => a + (b - a) * r();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, s) => Math.round(v / s) * s;
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---------- calendrier ---------- */
// Vacances scolaires (approximation, toutes zones confondues) : les périodes où l'ORL pédiatrique
// et l'absentéisme pour congés augmentent. Les fêtes et ponts ne sont pas modélisés.
function isVacances(m, d) {
  return (m === 2 && d >= 7) || (m === 3 && d <= 8) || (m === 4 && d >= 4) || (m === 5 && d <= 4) ||
         m === 7 || m === 8 || (m === 10 && d >= 17) || (m === 11 && d <= 2) || (m === 12 && d >= 19) || (m === 1 && d <= 4);
}
// Épidémie hivernale (grippe, bronchiolite, Covid) : probabilité d'être en pleine vague selon le mois.
const EPID_P = { 12: 0.35, 1: 0.5, 2: 0.3, 11: 0.08, 3: 0.08 };
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function drawDate(r, year, noWeekend) {
  for (;;) {
    const start = Date.UTC(year, 0, 1), days = (Date.UTC(year + 1, 0, 1) - start) / 864e5;
    const d = new Date(start + Math.floor(r() * days) * 864e5);
    const wd = d.getUTCDay();
    if (noWeekend && (wd === 0 || wd === 6)) continue;
    return d.toISOString().slice(0, 10);
  }
}

/* ---------- familles de situations ---------- */
// Chaque famille ne fait que déplacer les réglages à l'intérieur de leurs bornes réalistes.
// En profil « realiste », le poids est la fréquence estimée d'une telle journée dans l'année.
const FAMILIES = [
  { id: "ordinaire",   label: "Journée ordinaire",                w: 0.53 },
  { id: "sous_effectif", label: "Sous-effectif paramédical",      w: 0.10 },
  { id: "sspi_tendue", label: "SSPI ou aval sous tension",        w: 0.08 },
  { id: "programme_charge", label: "Programme surchargé",         w: 0.07 },
  { id: "panne",       label: "Panne de salle ou d'équipement",   w: 0.05 },
  { id: "brancards",   label: "Brancardage limité",               w: 0.05 },
  { id: "patients_aleas", label: "Patients en retard ou non prêts", w: 0.025 },
  { id: "verifs", label: "Vérifications avant l'anesthésie défaillantes", w: 0.03 },
  { id: "sterilisation", label: "Stérilisation ou matériel en tension", w: 0.03 },
  { id: "informatique", label: "Panne informatique (mode dégradé)", w: 0.01 },
  { id: "enseignement", label: "Forte activité d'enseignement", w: 0.02 },
  { id: "afflux",      label: "Afflux de victimes",               w: 0.005 },
];

function drawContext(E, r, opts) {
  const fam = opts.profil === "contrastes"
    ? FAMILIES[Math.floor(r() * FAMILIES.length)]
    : (() => { const id = pickW(r, Object.fromEntries(FAMILIES.map((x) => [x.id, x.w]))); return FAMILIES.find((f) => f.id === id); })();
  const date = drawDate(r, opts.year, opts.noWeekend);
  const [, mm, dd] = date.split("-").map(Number);
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  const weekend = wd === 0 || wd === 6;
  const epid = r() < (EPID_P[mm] || 0);
  const vac = isVacances(mm, dd);
  const periode = epid ? "epidemie" : vac ? "vacances" : "normale";
  const seed = 1 + Math.floor(r() * 999998);

  const c = vm.runInContext("defaultConfig()", E);
  c.seed = seed;
  c.date = date;
  c.periode = periode;
  c.name = `${fam.label} - ${JOURS[wd]} ${date}`;
  c.rooms = vm.runInContext(`roomsFor(${JSON.stringify(date)}, ${seed})`, E);

  // Variabilité ordinaire d'un jour à l'autre (toutes familles)
  c.load = round(clamp(1 + 0.07 * gauss(r), 0.8, 1.15), 0.05);
  c.bran = pickW(r, { 2: 0.15, 3: 0.7, 4: 0.15 }) * 1;
  c.ash = pickW(r, { 2: 0.15, 3: 0.7, 4: 0.15 }) * 1;
  c.sspiStaff = pickW(r, { 2: 0.1, 3: 0.75, 4: 0.15 }) * 1;
  c.sspiBeds = pickW(r, { 8: 0.15, 9: 0.15, 10: 0.5, 11: 0.1, 12: 0.1 }) * 1;
  c.brancards = pickW(r, { 8: 0.15, 10: 0.6, 12: 0.25 }) * 1;
  c.preSeats = pickW(r, { 3: 0.2, 4: 0.6, 5: 0.2 }) * 1;
  c.preBeds = pickW(r, { 3: 0.2, 4: 0.6, 5: 0.2 }) * 1;
  c.marExtra = pickW(r, { 0: 0.2, 1: 0.65, 2: 0.15 }) * 1;
  c.doubleSalle = pickW(r, { 0: 0.7, 0.1: 0.2, 0.2: 0.1 }) * 1;
  c.absent = round(clamp(0.03 + 0.012 * gauss(r), 0.01, 0.06), 0.01);
  c.replaceRate = round(uni(r, 0.65, 0.95), 0.05);
  c.latePatient = round(uni(r, 0.06, 0.14), 0.01);
  c.sameDayCancel = round(uni(r, 0.015, 0.035), 0.005);
  c.wardBlock = round(uni(r, 0.02, 0.06), 0.01);
  c.reaBeds = pickW(r, { 0: 0.1, 1: 0.3, 2: 0.4, 3: 0.2 }) * 1;
  c.astreinteDelay = round(uni(r, 20, 35), 5);
  // vérifications avant l'anesthésie, stérilisation, imprévus de l'intervention : variabilité ordinaire
  c.vpaJour = round(uni(r, 0.5, 0.9), 0.05);
  c.jeune = round(uni(r, 0.006, 0.02), 0.002); c.anticoag = round(uni(r, 0.002, 0.008), 0.001);
  c.consentement = round(uni(r, 0.005, 0.015), 0.005); c.marquage = round(uni(r, 0.01, 0.05), 0.01);
  c.examens = round(uni(r, 0.02, 0.05), 0.01); c.identite = round(uni(r, 0.001, 0.005), 0.001); c.preparation = round(uni(r, 0.03, 0.08), 0.01);
  c.boites = round(clamp(1 + 0.1 * gauss(r), 0.8, 1.2), 0.1); c.steriDelay = round(uni(r, 210, 270), 10);
  c.boiteNC = round(uni(r, 0.01, 0.03), 0.005); c.implant = round(uni(r, 0.005, 0.025), 0.005); c.dmManquant = round(uni(r, 0.015, 0.045), 0.005);
  c.manip = pickW(r, { 1: 0.8, 2: 0.2 }) * 1; c.intubDiff = round(uni(r, 0.01, 0.03), 0.005);
  c.extempo = round(uni(r, 0.75, 1.25), 0.25); c.transfusion = round(uni(r, 0.75, 1.25), 0.25); c.efsDelay = round(uni(r, 30, 55), 5);
  c.interne = round(uni(r, 0.05, 0.25), 0.05); c.bmr = round(uni(r, 0.01, 0.05), 0.01);

  // Saison
  if (periode === "epidemie") {
    c.absent = round(uni(r, 0.06, 0.12), 0.01);
    c.replaceRate = round(uni(r, 0.4, 0.75), 0.05);
    c.sameDayCancel = round(uni(r, 0.035, 0.06), 0.005);
    c.wardBlock = round(uni(r, 0.08, 0.15), 0.01);
    c.reaBeds = pickW(r, { 0: 0.4, 1: 0.4, 2: 0.2 }) * 1;
  }
  if (mm === 7 || mm === 8) { // congés d'été : équipes réduites
    c.bran = Math.min(c.bran, 3); c.ash = Math.min(c.ash, 3); c.sspiStaff = Math.min(c.sspiStaff, 3);
    c.replaceRate = round(Math.min(c.replaceRate, uni(r, 0.4, 0.7)), 0.05);
  }

  // Famille de situation
  switch (fam.id) {
    case "sous_effectif":
      c.bran = pickW(r, { 1: 0.4, 2: 0.6 }) * 1;
      c.ash = pickW(r, { 1: 0.4, 2: 0.6 }) * 1;
      c.absent = round(uni(r, 0.07, 0.13), 0.01);
      c.replaceRate = round(uni(r, 0.2, 0.5), 0.05);
      c.marExtra = 0;
      break;
    case "sspi_tendue":
      c.sspiBeds = pickW(r, { 5: 0.2, 6: 0.4, 7: 0.4 }) * 1;
      c.sspiStaff = pickW(r, { 2: 0.7, 3: 0.3 }) * 1;
      c.wardBlock = round(uni(r, 0.08, 0.18), 0.01);
      c.reaBeds = pickW(r, { 0: 0.6, 1: 0.4 }) * 1;
      break;
    case "programme_charge":
      c.load = round(uni(r, 1.1, 1.25), 0.05);
      c.doubleSalle = pickW(r, { 0.1: 0.5, 0.2: 0.5 }) * 1;
      break;
    case "panne": {
      const room = c.rooms.filter((x) => x !== c.urgRoom);
      if (room.length && r() < 0.7) {
        const at = round(uni(r, 480, 900), 15);
        c.events = [{ kind: "panne", room: room[Math.floor(r() * room.length)], at, until: at + round(uni(r, 60, 300), 15), label: "Panne" }];
      }
      c.equipPanne = round(uni(r, 0.02, 0.05), 0.005);
      break;
    }
    case "brancards":
      c.brancards = pickW(r, { 5: 0.2, 6: 0.4, 7: 0.4 }) * 1;
      c.litHosp = r() < 0.5;
      c.bran = Math.min(c.bran, 2);
      break;
    case "patients_aleas":
      c.latePatient = round(uni(r, 0.18, 0.28), 0.01);
      c.dossierIncomplet = round(uni(r, 0.1, 0.18), 0.01);
      c.sameDayCancel = round(uni(r, 0.04, 0.07), 0.005);
      c.noShow = round(uni(r, 0.03, 0.06), 0.005);
      break;
    case "verifs":
      c.vpaJour = round(uni(r, 0.8, 1), 0.05);
      c.jeune = round(uni(r, 0.025, 0.045), 0.002); c.anticoag = round(uni(r, 0.01, 0.025), 0.001);
      c.consentement = round(uni(r, 0.02, 0.045), 0.005); c.marquage = round(uni(r, 0.06, 0.12), 0.01);
      c.examens = round(uni(r, 0.06, 0.12), 0.01); c.identite = round(uni(r, 0.008, 0.02), 0.001); c.preparation = round(uni(r, 0.1, 0.2), 0.01);
      break;
    case "sterilisation":
      c.boites = round(uni(r, 0.5, 0.8), 0.1); c.steriDelay = round(uni(r, 300, 420), 10);
      c.autoclavePanne = r() < 0.4 ? 1 : 0.05; c.boiteNC = round(uni(r, 0.04, 0.08), 0.005);
      c.implant = round(uni(r, 0.03, 0.06), 0.005); c.dmManquant = round(uni(r, 0.06, 0.12), 0.01);
      break;
    case "informatique":
      c.siPanne = 1;
      break;
    case "enseignement":
      c.interne = round(uni(r, 0.3, 0.5), 0.05); c.extempo = round(uni(r, 1.25, 2), 0.25); c.transfusion = round(uni(r, 1, 1.5), 0.25);
      break;
    case "afflux":
      c.burst = { n: 3 + Math.floor(r() * 6), at: round(uni(r, weekend ? 0 : 480, 1320), 15) % 1440 };
      break;
  }
  const norm = vm.runInContext(`normalizeConfig(${JSON.stringify(c)})`, E);
  return { fam, cfg: norm, weekend, jour: JOURS[wd], mois: mm, periode };
}

/* ---------- statistiques ---------- */
const q = (arr, p) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }
function spearman(x, y) { const rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; } return dx && dy ? n / Math.sqrt(dx * dy) : 0; }
const fr = (v, d = 1) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(d).replace(".", ","));
const pct = (n, t) => (t ? fr((100 * n) / t, 1) + " %" : "-");

/* ---------- indicateurs suivis ---------- */
const KPIS = [
  ["done", "Interventions réalisées", ""],
  ["urg", "Urgences opérées", ""],
  ["deprog", "Déprogrammations faute de temps", ""],
  ["annulJ", "Annulations le jour même (accueil)", ""],
  ["absents", "Patients absents", ""],
  ["sallesFermees", "Cas perdus (salle fermée)", ""],
  ["urgReport", "Urgences reportées au lendemain", ""],
  ["late", "Retard moyen du programmé", "min"],
  ["urgWait", "Attente moyenne des urgences", "min"],
  ["urgWaitMax", "Attente maximale d'une urgence", "min"],
  ["urgInTime", "Urgences dans leur délai", "%"],
  ["overMin", "Débordement après 18 h 30", "min"],
  ["roomWaitPatient", "Salle prête, patient absent", "min"],
  ["waitMar", "Attente MAR", "min"],
  ["waitChir", "Attente chirurgien", "min"],
  ["bedBlock", "Blocage en salle faute de place en SSPI", "min"],
  ["waitBrancardTot", "Attente brancard ou brancardier", "min"],
  ["waitPre", "Attente en pré-anesthésie", "min"],
  ["waitEquip", "Attente équipement", "min"],
  ["waitSortieTot", "Sortie de SSPI retardée", "min"],
  ["sspiPeak", "Pic de la SSPI", "lits"],
  ["sspiPeakRatio", "Pic de la SSPI / lits ouverts", "%"],
  ["convHosp", "Ambulatoires convertis en hospitalisation", ""],
  ["complic", "Complications peropératoires", ""],
  ["absentStaff", "Soignants absents", ""],
  ["waitVerif", "Vérifications avant l'anesthésie", "min"],
  ["annulVerif", "Annulations (jeûne, anticoagulant, examen, implant)", ""],
  ["jeuneReport", "Reports en fin de programme (jeûne)", ""],
  ["waitSteri", "Attente de boîtes d'instruments", "min"],
  ["waitMateriel", "Attente de matériel (implant, dispositif, chariot)", "min"],
  ["waitRadio", "Attente du manipulateur radio", "min"],
  ["waitExtempo", "Attente d'examens extemporanés", "min"],
  ["waitTransfu", "Attente de produits sanguins", "min"],
  ["waitTransfert", "Attente d'un brancardier pour la SSPI", "min"],
  ["interne", "Interventions avec un interne", ""],
  ["intubDiff", "Intubations difficiles", ""],
  ["siPanne", "Mode dégradé informatique", "min"],
];
const PARAM_COLS = ["load", "rooms_n", "bran", "ash", "sspiStaff", "sspiBeds", "brancards", "preSeats", "preBeds", "marExtra", "doubleSalle", "absent", "replaceRate", "latePatient", "sameDayCancel", "wardBlock", "reaBeds", "litHosp", "burst_n", "pannes_salle",
  "vpaJour", "jeune", "anticoag", "consentement", "marquage", "examens", "identite", "preparation", "boites", "steriDelay", "boiteNC", "autoclavePanne", "implant", "dmManquant", "manip", "intubDiff", "extempo", "transfusion", "efsDelay", "interne", "bmr", "siPanne"];
const PARAM_LABEL = { load: "Remplissage du programme", rooms_n: "Salles ouvertes", bran: "Brancardiers", ash: "Agents de bionettoyage", sspiStaff: "IDE de SSPI", sspiBeds: "Lits de SSPI", brancards: "Brancards", preSeats: "Postes assis en pré-anesthésie", preBeds: "Postes couchés en pré-anesthésie", marExtra: "MAR supplémentaires", doubleSalle: "Chirurgiens en double salle", absent: "Absences de dernière minute", replaceRate: "Absences remplacées", latePatient: "Patients en retard", sameDayCancel: "Annulations le jour même", wardBlock: "Patients bloqués faute de lit d'aval", reaBeds: "Places de réanimation", litHosp: "Hospitalisés amenés dans leur lit", burst_n: "Victimes d'un afflux", pannes_salle: "Pannes de salle programmées",
  vpaJour: "Visites pré-anesthésiques le jour même", jeune: "Jeûne non respecté", anticoag: "Anticoagulant non arrêté", consentement: "Consentement manquant", marquage: "Marquage absent", examens: "Examen manquant", identite: "Discordance d'identité", preparation: "Patient non préparé",
  boites: "Parc de boîtes d'instruments", steriDelay: "Délai de stérilisation", boiteNC: "Boîtes non conformes", autoclavePanne: "Panne d'autoclave", implant: "Implant manquant", dmManquant: "Dispositif stérile manquant",
  manip: "Manipulateurs radio", intubDiff: "Intubations difficiles", extempo: "Extemporanés", transfusion: "Transfusions", efsDelay: "Délai de l'EFS", interne: "Part d'interventions avec interne", bmr: "Patients BMR", siPanne: "Panne informatique" };

/* ---------- campagne ---------- */
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.aide || a.help || a.h) { console.log(HELP); return; }
  const N = intArg(a.n, "n", 1, 20000, 500);
  const profil = a.profil || "realiste";
  if (!["realiste", "contrastes"].includes(profil)) fail("--profil attend realiste ou contrastes");
  const year = intArg(a.annee, "annee", 2020, 2035, 2026);
  const seed = intArg(a.graine, "graine", 1, 1e9, 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const out = path.resolve(ROOT, a.sortie || path.join("campagnes", `${stamp}-${profil}-${N}`));
  fs.mkdirSync(out, { recursive: true });
  if (a.csv) fs.mkdirSync(path.join(out, "journees"), { recursive: true });

  const E = loadEngine();
  const r = mulberry(seed * 2654435761);
  const opts = { profil, year, noWeekend: !!a["sans-weekend"] };
  const rows = [];
  const cfgStream = fs.createWriteStream(path.join(out, "configs.jsonl"));
  const issuesAll = {};
  const t0 = Date.now();

  for (let i = 0; i < N; i++) {
    const ctx = drawContext(E, r, opts);
    E.__cfg = ctx.cfg;
    let d;
    try { d = vm.runInContext("generateDay(__cfg)", E); }
    catch (e) { rows.push({ id: i + 1, erreur: String(e && e.message || e), ctx }); continue; }
    const R = d.report, V = d.validation || { checks: 0, violations: 0, issues: [] };
    (V.issues || []).forEach((x) => { const k = String(x).split(":")[0].slice(0, 80); issuesAll[k] = (issuesAll[k] || 0) + 1; });
    const row = {
      id: i + 1, famille: ctx.fam.id, famille_label: ctx.fam.label, date: ctx.cfg.date, jour: ctx.jour, mois: ctx.mois,
      weekend: ctx.weekend ? 1 : 0, periode: ctx.periode, graine: ctx.cfg.seed,
      rooms_n: ctx.cfg.rooms.length, salles: ctx.cfg.rooms.join(" "),
      burst_n: ctx.cfg.burst.n, pannes_salle: ctx.cfg.events.filter((e) => e.kind === "panne").length,
      ...Object.fromEntries(PARAM_COLS.filter((k) => k in ctx.cfg).map((k) => [k, typeof ctx.cfg[k] === "boolean" ? (ctx.cfg[k] ? 1 : 0) : ctx.cfg[k]])),
      ...R,
      waitBrancardTot: (R.waitBrancard || 0) + (R.waitBran || 0),
      waitSortieTot: (R.waitSortie || 0) + (R.waitAval || 0),
      annulVerif: (R.annulJeune || 0) + (R.annulAnticoag || 0) + (R.annulExamen || 0) + (R.annulImplant || 0),
      sspiPeakRatio: Math.round((100 * (R.sspiPeak || 0)) / ctx.cfg.sspiBeds),
      urgInTime: R.urgInTime == null ? "" : R.urgInTime,
      controles: V.checks, incoherences: V.violations,
      prog_prevu: d.cases.filter((c) => c.type === "P").length + d.cancelled.filter((c) => c.when === "jour").length,
    };
    rows.push(row);
    cfgStream.write(JSON.stringify({ id: row.id, famille: row.famille, cfg: ctx.cfg }) + "\n");
    if (a.csv) {
      E.__d = d;
      const csv = vm.runInContext("oproomCSV(buildDay(__d), true)", E);
      fs.writeFileSync(path.join(out, "journees", `j${String(row.id).padStart(5, "0")}-${row.famille}-${row.date}.csv`), csv);
    }
    if ((i + 1) % 100 === 0 || i + 1 === N) process.stdout.write(`\r${i + 1}/${N} journées simulées`);
  }
  cfgStream.end();
  process.stdout.write("\n");
  const secs = (Date.now() - t0) / 1000;
  const ok = rows.filter((x) => !x.erreur);
  const errs = rows.filter((x) => x.erreur);

  /* contextes.csv */
  const cols = ["id", "famille", "date", "jour", "mois", "weekend", "periode", "graine", "salles", ...PARAM_COLS, ...KPIS.map((k) => k[0]), "prog_prevu", "annul", "deprog", "lastEnd", "controles", "incoherences"];
  const uniq = [...new Set(cols)];
  const cell = (v) => { v = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  fs.writeFileSync(path.join(out, "contextes.csv"), "﻿" + [uniq.join(";"), ...ok.map((x) => uniq.map((k) => cell(x[k])).join(";"))].join("\r\n") + "\r\n");

  /* RAPPORT.md */
  const L = [];
  const viol = ok.reduce((s, x) => s + (x.incoherences || 0), 0), checks = ok.reduce((s, x) => s + (x.controles || 0), 0);
  L.push(`# Rapport de campagne BlocSim`, ``);
  L.push(`- Journées simulées : ${ok.length}${errs.length ? ` (${errs.length} en erreur)` : ""}`);
  L.push(`- Profil : ${profil === "realiste" ? "réaliste (situations à leur fréquence estimée)" : "contrastes (familles de situations à poids égal)"}`);
  L.push(`- Année : ${year}${opts.noWeekend ? ", jours ouvrés seulement" : ""} - graine de campagne ${seed} - durée ${fr(secs, 1)} s`);
  L.push(`- Contrôles de cohérence : ${checks.toLocaleString("fr-FR")} vérifications, ${viol} incohérence${viol > 1 ? "s" : ""} (personne à deux endroits, MAR à plus de deux patients, SSPI sans IDE, brancards, lits)`);
  L.push(``, `Chaque journée est rejouable : sa configuration complète est dans configs.jsonl (champ cfg), à charger avec \`npm run sim -- --config\`.`, ``);

  L.push(`## 1. Couverture des situations`, ``);
  const tab = (title, key, labels) => {
    const m = {}; ok.forEach((x) => { m[x[key]] = (m[x[key]] || 0) + 1; });
    L.push(`| ${title} | Journées | Part |`, `| --- | ---: | ---: |`);
    Object.entries(m).sort((x, y) => (labels ? labels.indexOf(x[0]) - labels.indexOf(y[0]) : y[1] - x[1])).forEach(([k, v]) => L.push(`| ${k} | ${v} | ${pct(v, ok.length)} |`));
    L.push(``);
  };
  const famRows = FAMILIES.map((f) => [f.label, ok.filter((x) => x.famille === f.id).length]);
  L.push(`| Famille de situation | Journées | Part |`, `| --- | ---: | ---: |`); famRows.forEach(([l, v]) => L.push(`| ${l} | ${v} | ${pct(v, ok.length)} |`)); L.push(``);
  tab("Jour", "jour", JOURS.slice(1).concat("dimanche"));
  tab("Période", "periode");
  const moisN = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  ok.forEach((x) => (x.mois_label = moisN[x.mois]));
  tab("Mois", "mois_label", moisN);
  const roomsN = ok.map((x) => x.rooms_n);
  L.push(`Salles ouvertes : de ${Math.min(...roomsN)} à ${Math.max(...roomsN)} (médiane ${q(roomsN, 0.5)}). Afflux de victimes : ${ok.filter((x) => x.burst_n > 0).length} journées. Pannes de salle programmées : ${ok.filter((x) => x.pannes_salle > 0).length} journées.`, ``);

  L.push(`## 2. Distribution des indicateurs (toutes journées)`, ``);
  L.push(`| Indicateur | Moyenne | P5 | Médiane | P95 | Max | Unité |`, `| --- | ---: | ---: | ---: | ---: | ---: | --- |`);
  for (const [k, label, unit] of KPIS) {
    const v = ok.map((x) => x[k]).filter((x) => x !== "" && x != null && !Number.isNaN(+x)).map(Number);
    if (!v.length) continue;
    L.push(`| ${label} | ${fr(mean(v))} | ${fr(q(v, 0.05))} | ${fr(q(v, 0.5))} | ${fr(q(v, 0.95))} | ${fr(Math.max(...v), 0)} | ${unit} |`);
  }
  L.push(``, `Jours ouvrés seulement : ${(() => { const w = ok.filter((x) => !x.weekend); return `${w.length} journées, ${fr(mean(w.map((x) => x.done)))} interventions en moyenne dont ${fr(mean(w.map((x) => x.urg)))} urgences, ${fr(mean(w.map((x) => x.deprog)))} déprogrammations`; })()}.`, ``);

  L.push(`## 3. Comparaison par famille de situation (moyennes)`, ``);
  const famK = [["done", "Réalisées"], ["deprog", "Déprog."], ["annulVerif", "Annul. vérif."], ["late", "Retard (min)"], ["urgInTime", "Urg. dans délai (%)"], ["urgWait", "Attente urg. (min)"], ["overMin", "Débord. (min)"], ["bedBlock", "Blocage SSPI (min)"], ["waitBrancardTot", "Att. brancard (min)"], ["waitMar", "Att. MAR (min)"], ["waitSteri", "Att. boîtes (min)"], ["waitVerif", "Vérif. (min)"]];
  L.push(`| Famille | n | ${famK.map((k) => k[1]).join(" | ")} |`, `| --- | ---: | ${famK.map(() => "---:").join(" | ")} |`);
  for (const f of FAMILIES) {
    const g = ok.filter((x) => x.famille === f.id); if (!g.length) continue;
    L.push(`| ${f.label} | ${g.length} | ${famK.map(([k]) => fr(mean(g.map((x) => x[k]).filter((v) => v !== "").map(Number)))).join(" | ")} |`);
  }
  L.push(``);
  L.push(`### Par période`, ``, `| Période | n | ${famK.map((k) => k[1]).join(" | ")} |`, `| --- | ---: | ${famK.map(() => "---:").join(" | ")} |`);
  for (const p of ["normale", "vacances", "epidemie"]) {
    const g = ok.filter((x) => x.periode === p); if (!g.length) continue;
    L.push(`| ${p} | ${g.length} | ${famK.map(([k]) => fr(mean(g.map((x) => x[k]).filter((v) => v !== "").map(Number)))).join(" | ")} |`);
  }
  L.push(``);
  L.push(`### Par jour`, ``, `| Jour | n | ${famK.map((k) => k[1]).join(" | ")} |`, `| --- | ---: | ${famK.map(() => "---:").join(" | ")} |`);
  for (const j of JOURS.slice(1).concat("dimanche")) {
    const g = ok.filter((x) => x.jour === j); if (!g.length) continue;
    L.push(`| ${j} | ${g.length} | ${famK.map(([k]) => fr(mean(g.map((x) => x[k]).filter((v) => v !== "").map(Number)))).join(" | ")} |`);
  }
  L.push(``);

  L.push(`## 4. Sensibilité : quels réglages pèsent sur quels indicateurs`, ``);
  L.push(`Corrélation de rang de Spearman entre chaque réglage tiré et chaque indicateur, calculée sur les jours ouvrés. Signe + : l'indicateur augmente avec le réglage. Seules les valeurs d'au moins 0,15 en valeur absolue sont affichées.`, ``);
  const wk = ok.filter((x) => !x.weekend);
  const sensK = [["deprog", "Déprog."], ["late", "Retard"], ["overMin", "Débord."], ["bedBlock", "Blocage SSPI"], ["waitBrancardTot", "Att. brancard"], ["urgWait", "Att. urg."], ["roomWaitPatient", "Salle sans patient"], ["waitMar", "Att. MAR"], ["waitSteri", "Att. boîtes"], ["waitVerif", "Vérif."], ["annulVerif", "Annul. vérif."]];
  L.push(`| Réglage | ${sensK.map((k) => k[1]).join(" | ")} |`, `| --- | ${sensK.map(() => "---:").join(" | ")} |`);
  for (const p of PARAM_COLS) {
    const xs = wk.map((x) => +x[p]);
    if (new Set(xs).size < 2) continue;
    const cells = sensK.map(([k]) => { const rho = spearman(xs, wk.map((x) => +x[k] || 0)); return Math.abs(rho) >= 0.15 ? (rho > 0 ? "+" : "") + fr(rho, 2) : ""; });
    if (cells.some(Boolean)) L.push(`| ${PARAM_LABEL[p] || p} | ${cells.join(" | ")} |`);
  }
  L.push(``);

  L.push(`## 5. Journées les plus difficiles`, ``);
  const score = (x) => (x.deprog || 0) * 30 + (x.overMin || 0) + (x.bedBlock || 0) + (x.urgReport || 0) * 60 + (x.sallesFermees || 0) * 30 + (x.urgInTime === "" ? 0 : (100 - x.urgInTime) * 3);
  const worst = [...ok].sort((x, y) => score(y) - score(x)).slice(0, 15);
  L.push(`Classement par un score de tension (déprogrammations, débordement, blocage SSPI, urgences hors délai ou reportées, salles fermées). Rejouer une journée : prendre sa ligne dans configs.jsonl.`, ``);
  L.push(`| # | Famille | Date | Période | Salles | Réalisées | Déprog. | Débord. (min) | Blocage SSPI (min) | Urg. dans délai | Urg. reportées |`, `| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  worst.forEach((x) => L.push(`| ${x.id} | ${x.famille_label} | ${x.jour} ${x.date} | ${x.periode} | ${x.rooms_n} | ${x.done} | ${x.deprog} | ${x.overMin} | ${x.bedBlock} | ${x.urgInTime === "" ? "-" : x.urgInTime + " %"} | ${x.urgReport || 0} |`));
  L.push(``);

  L.push(`## 6. Contrôles de cohérence`, ``);
  if (!viol) L.push(`Aucune incohérence sur ${ok.length} journées : aucune personne à deux endroits, aucun MAR à plus de deux patients hors anesthésie locale, aucune SSPI sans IDE, aucun brancard ou lit utilisé deux fois.`);
  else { L.push(`${viol} incohérence(s) dans ${ok.filter((x) => x.incoherences).length} journée(s) :`, ``); Object.entries(issuesAll).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => L.push(`- ${k} (${v})`)); }
  if (errs.length) { L.push(``, `Journées en erreur :`); errs.slice(0, 20).forEach((x) => L.push(`- n°${x.id} (${x.ctx.fam.id}, ${x.ctx.cfg.date}) : ${x.erreur}`)); }
  L.push(``, `## 7. Hypothèses à calibrer`, ``);
  L.push(`Ces règles et réglages ne sont pas mesurables dans l'export OPROOM. Les indicateurs qui en dépendent (séjour en SSPI, blocage en salle, attentes de transfert, délais des urgences) sont des ordres de grandeur, à confirmer avec les équipes du bloc.`, ``);
  vm.runInContext("MODEL_HYPOTHESES", E).forEach((h) => L.push(`- **${h.label}** : ${h.value}`));
  L.push(``, `Réglages marqués « à calibrer » (valeur par défaut) : ${vm.runInContext("PARAMS_A_CALIBRER.map(p=>p.label+' ('+formatParam(p.key,p.def)+')').join(', ')", E)}.`);
  L.push(``, `## 8. Utiliser cette campagne pour tester une fiche technique`, ``);
  L.push(`1. Choisir les indicateurs que le logiciel promet d'améliorer (retard du programmé, déprogrammations, attente des urgences, blocage en SSPI, brancardage...).`);
  L.push(`2. Repérer dans les sections 3 et 4 les familles et les réglages où ces indicateurs se dégradent : c'est là que le logiciel doit faire ses preuves.`);
  L.push(`3. Rejouer les mêmes journées (mêmes graines, configs.jsonl) avec les réglages qui traduisent l'effet annoncé du logiciel (par exemple moins d'attente brancardier, moins de patients en retard), puis comparer contextes.csv avant et après.`);
  L.push(`4. Vérifier la robustesse sur les pires journées de la section 5, et pas seulement sur la moyenne.`);
  L.push(``);
  fs.writeFileSync(path.join(out, "RAPPORT.md"), L.join("\n"));

  console.log(`${ok.length} journées en ${fr(secs, 1)} s - ${checks} contrôles, ${viol} incohérence(s)${errs.length ? ` - ${errs.length} erreur(s)` : ""}`);
  console.log(`Résultats : ${path.relative(ROOT, out) || out}/ (RAPPORT.md, contextes.csv, configs.jsonl${a.csv ? ", journees/" : ""})`);
  if (errs.length || viol) process.exitCode = 1;
}
main();
