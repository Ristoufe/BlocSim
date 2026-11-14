// Contrôle des règles physiques sur des journées simulées (grille d'audit, point 3).
// Usage : npm run check     (s'arrête avec un code d'erreur si une règle est violée)
// Complète npm test : ici, contrôles indépendants du moteur, faits sur les journées exportées.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ctx = { console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isNaN, parseInt, parseFloat };
vm.createContext(ctx);
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
vm.runInContext("STATS=" + fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8"), ctx);
const gen = (id, seed) =>
  vm.runInContext(`(()=>{const c=PRESETS.find(p=>p.id==="${id}").apply({...defaultConfig(), seed:${seed}, rooms:roomsFor(defaultConfig().date, ${seed})});return generateDay(c)})()`, ctx);

const bad = {};
const fail = (k) => (bad[k] = (bad[k] || 0) + 1);
const ids = vm.runInContext("PRESETS.map(p=>p.id)", ctx);
const SEEDS = 40;

for (const id of ids)
  for (let seed = 1; seed <= SEEDS; seed++) {
    const d = gen(id, seed);
    if (JSON.stringify(d) !== JSON.stringify(gen(id, seed))) fail("même graine, résultat différent");
    if (d.validation && d.validation.violations) fail("contrôles internes du moteur en échec");
    for (const c of d.cases) {
      for (const k of ["s", "dur", "cleanStart", "cleanEnd", "recOut"]) if (!Number.isFinite(c[k])) fail(`valeur manquante : ${k}`);
      if (c.dur <= 0) fail("durée nulle ou négative");
      // règle du simulateur : jamais avant l'heure prévue pour le premier cas, avancé de 30 min au plus ensuite
      if (c.type === "P" && c.s < c.planned - 30) fail("programmé démarré plus de 30 min avant l'heure prévue");
      if (c.type !== "P" && c.s < c.arr) fail("urgence opérée avant son arrivée");
      if (!(c.s + c.dur + c.waitBed <= c.cleanStart + 0.01 && c.cleanStart <= c.cleanEnd)) fail("ordre fin d'opération / bionettoyage");
      if (d.closures.some((z) => z.room === c.room && c.s >= z.from && c.s < z.to)) fail("cas démarré dans une salle en panne");
    }
    const groups = (key) => Object.values(d.cases.reduce((g, c) => ((g[c[key]] = g[c[key]] || []).push(c), g), {}));
    for (const L of groups("room")) {
      L.sort((a, b) => a.s - b.s);
      for (let i = 1; i < L.length; i++) if (L[i].s < L[i - 1].cleanEnd) fail("deux patients en même temps dans une salle");
    }
    // le chirurgien est compté sur son temps opératoire réel (de l'incision à la fin de son geste)
    for (const L of groups("ch")) {
      const iv = L.filter((c) => c.chirIn).map((c) => c.chirIn).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < iv.length; i++) if (iv[i][0] < iv[i - 1][1] - 0.01) fail("chirurgien dans deux salles en même temps");
    }
  }

const n = ids.length * SEEDS;
if (Object.keys(bad).length) {
  console.error(`${n} journées simulées, règles violées :`);
  for (const [k, v] of Object.entries(bad)) console.error(`  ${k} : ${v}`);
  process.exit(1);
}
console.log(`${n} journées simulées (${ids.length} scénarios x ${SEEDS} graines) : aucune règle violée.`);
