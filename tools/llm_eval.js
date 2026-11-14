#!/usr/bin/env node
// Compare des modèles locaux sur les agents 1 (contrôle de complétude) et 2 (texte libre -> fiche).
//   node tools/llm_eval.js [modèle ...]        défaut : qwen2.5:14b qwen3.6:35b
// Réponses attendues écrites à la main ci-dessous ; résultat détaillé dans logs/llm-eval-*.json
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ollamaChat } = require("./ollama");

const ROOT = path.join(__dirname, "..");
const E = vm.createContext({ console, Math, JSON, Date, Number, String, Object, Array, Set, Map, Promise, setTimeout });
for (const f of ["js/params.js", "js/config.js", "js/engine.js", "js/generator.js", "js/human.js", "js/fiche.js", "js/campaign.js", "js/llm.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), E, { filename: f });
vm.runInContext("STATS=" + fs.readFileSync(path.join(ROOT, "data/stats.json"), "utf8"), E);
E.__chat = ollamaChat;
vm.runInContext("LLM_TRANSPORT = (b) => __chat(b);", E);

const fiche = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "data/fiches", n + ".json"), "utf8"));
const notice = (n) => fs.readFileSync(path.join(ROOT, "data/notices", n + ".txt"), "utf8");

/* ---------- réponses attendues ---------- */
const A1 = [
  { id: "scantrace-v2", verdict: "ANALYSABLE_AVEC_RESERVES", mustFlag: [] },
  { id: "scantrace-incomplete", verdict: "NON_ANALYSABLE", mustFlag: ["B6.mode_degrade", "B2.acteurs"] },
  { id: "checklist-tablette", verdict: "ANALYSABLE", mustFlag: [] },
  // la fiche piège : remplie partout, mais critiques creux
  { id: "piege-vague", verdict: "NON_ANALYSABLE", mustFlag: ["B6.mode_degrade", "B8.risques_patient", "B2.acteurs"] },
];
const has = (v, re) => re.test(typeof v === "string" ? v : JSON.stringify(v ?? ""));
const unknown = (v) => v == null || /^\s*inconnu\s*$/i.test(String(v)) || (Array.isArray(v) && !v.length);
const step = (C, role, sans, avec) => (C["B4.etapes"] || []).some((e) => e.qui === role && e.sans === sans && Math.abs((e.avec ?? -1) - avec) < 1e-9);
const A2 = [
  {
    id: "scantrace-notice",
    checks: [
      ["étape IBODE 2 -> 0,5 min", (C) => step(C, "IBODE", 2, 0.5)],
      ["source de la durée = essai de l'éditeur", (C) => (C["B4.etapes"] || []).some((e) => /essai|éditeur|editeur|nos équipes/i.test(e.source || ""))],
      ["disponibilité 99,5 %", (C) => has(C["B6.disponibilite"], /99[.,]5/)],
      ["support 4 h + présence sur site", (C) => has(C["B6.support"], /4/) && has(C["B6.support"], /site/i)],
      ["formation 2 h", (C) => has(C["B7.formation_initiale"], /2/)],
      ["pharmacien acteur", (C) => (C["B2.acteurs"] || []).some((a) => /pharmac/i.test(a.role))],
      ["fonctions exclues : stock, facturation", (C) => has(C["B3.fonctions_exclues"], /stock/i)],
      ["promesse « zéro erreur » non transformée en fait", (C) => !has(C["B1.resultat_attendu"], /^(?!.*(zéro|zero)).*garanti/i)],
    ],
    // absents du texte : doivent rester « Inconnu »
    mustBeUnknown: ["B6.mode_degrade", "B8.risques_patient", "B9.etudes", "B9.retours_soignants"],
    verdict: "NON_ANALYSABLE",
  },
  {
    id: "checkbloc-note-cadre",
    checks: [
      ["étape IADE 1 -> 1,2 min", (C) => step(C, "IADE", 1, 1.2)],
      ["étape Chirurgien 0,5 -> 0,8 min", (C) => step(C, "Chirurgien", 0.5, 0.8)],
      ["étape IBODE 2 -> 1,5 min", (C) => step(C, "IBODE", 2, 1.5)],
      ["source des 3 durées = chronométrage", (C) => (C["B4.etapes"] || []).filter((e) => ["IADE", "Chirurgien", "IBODE"].includes(e.qui) && e.sans != null).every((e) => /chrono|mesur|essai/i.test(e.source || ""))],
      ["disponibilité 99 % mesurée", (C) => has(C["B6.disponibilite"], /99/)],
      ["mode dégradé : papier + ressaisie", (C) => has(C["B6.mode_degrade"], /papier/i)],
      ["support 30 min sur place", (C) => has(C["B6.support"], /30/)],
      ["formation 1 h", (C) => has(C["B7.formation_initiale"], /1/)],
      ["salles OP 3 et OP 4", (C) => has(C["B3.salles_specialites"], /OP ?3/) && has(C["B3.salles_specialites"], /OP ?4/)],
      ["risque patient : time-out coché par habitude", (C) => has(C["B8.risques_patient"], /habitude|time.?out/i)],
      ["référents dans l'équipe", (C) => has(C["B7.accompagnement"], /référent|referent/i)],
    ],
    mustBeUnknown: ["B9.etudes", "B0.classe_reglementaire"],
    verdict: null, // dépend des champs recommandés : non noté
  },
];

/* ---------- exécution ---------- */
async function evalModel(model) {
  const out = { model, a1: [], a2: [], ms: [] };
  E.__m = model;
  for (const t of A1) {
    E.__f = fiche(t.id);
    const r = await vm.runInContext("agent1(__f, {model:__m})", E);
    const flagged = r.champs.filter((c) => c.statut_champ !== "Complet").map((c) => c.id);
    const caught = t.mustFlag.filter((id) => flagged.includes(id));
    // exact ; « prudent » = un cran plus sévère sans bloquer à tort ; « faux » sinon
    const LV = { ANALYSABLE: 0, ANALYSABLE_AVEC_RESERVES: 1, NON_ANALYSABLE: 2 };
    const grade = r.verdict === t.verdict ? "exact" : (LV[r.verdict] === LV[t.verdict] + 1 && r.verdict !== "NON_ANALYSABLE") ? "prudent" : "faux";
    out.a1.push({ id: t.id, attendu: t.verdict, verdict: r.verdict, ok: grade !== "faux", grade, caught: `${caught.length}/${t.mustFlag.length}`, durcis: r.llm?.durcis || [], erreur: r.llm?.erreur, ms: r.llm?.ms, resume: r.llm?.resume });
    out.ms.push(r.llm?.ms || 0);
  }
  for (const t of A2) {
    E.__t = notice(t.id);
    const r = await vm.runInContext("agent2(__t, {model:__m})", E);
    if (r.erreur) { out.a2.push({ id: t.id, erreur: r.erreur }); continue; }
    const C = r.fiche.champs;
    const res = t.checks.map(([label, fn]) => { let ok = false; try { ok = !!fn(C); } catch (e) {} return { label, ok }; });
    const invented = t.mustBeUnknown.filter((id) => !unknown(C[id]));
    E.__g = r.fiche;
    const chk = vm.runInContext("checkFiche(__g)", E);
    out.a2.push({ id: t.id, score: `${res.filter((x) => x.ok).length}/${res.length}`, rates: res.filter((x) => !x.ok).map((x) => x.label), inventes: invented, garde: r.garde.length, verdict: chk.verdict, verdictOk: t.verdict ? chk.verdict === t.verdict : null, ms: r.ms, fiche: r.fiche });
    out.ms.push(r.ms);
  }
  return out;
}

(async () => {
  const models = process.argv.slice(2).length ? process.argv.slice(2) : ["qwen2.5:14b", "qwen3.6:35b"];
  // référence : règles seules
  console.log("\nAgent 1 - règles seules (référence)");
  let rulesOk = 0;
  for (const t of A1) { E.__f = fiche(t.id); const r = vm.runInContext("checkFiche(__f)", E); rulesOk += r.verdict === t.verdict; console.log(`  ${t.id.padEnd(22)} ${r.verdict.padEnd(26)} ${r.verdict === t.verdict ? "exact" : "FAUX (attendu " + t.verdict + ")"}`); }
  const all = [];
  for (const m of models) {
    process.stdout.write(`\n== ${m} : `);
    // préchauffage (chargement du modèle en mémoire, non chronométré)
    const w0 = Date.now(); await ollamaChat({ model: m, messages: [{ role: "user", content: "ok" }] }); console.log(`chargé en ${((Date.now() - w0) / 1000).toFixed(1)} s`);
    const o = await evalModel(m);
    all.push(o);
    console.log("Agent 1 - hybride");
    for (const x of o.a1) console.log(`  ${x.id.padEnd(22)} ${String(x.verdict).padEnd(26)} ${x.grade.padEnd(8)} champs critiques repérés ${x.caught} · durcis par le LLM : ${x.durcis.join(", ") || "aucun"} · ${(x.ms / 1000).toFixed(1)} s${x.erreur ? " · " + x.erreur : ""}`);
    console.log("Agent 2 - texte libre -> fiche");
    for (const x of o.a2) {
      if (x.erreur) { console.log(`  ${x.id.padEnd(22)} ERREUR ${x.erreur}`); continue; }
      console.log(`  ${x.id.padEnd(22)} extraction ${x.score} · inventés ${x.inventes.length ? x.inventes.join(", ") : "aucun"} · chiffres retirés par le garde-fou ${x.garde} · verdict ${x.verdict}${x.verdictOk === false ? " (attendu NON_ANALYSABLE)" : ""} · ${(x.ms / 1000).toFixed(1)} s`);
      if (x.rates.length) console.log(`  ${"".padEnd(22)} manqués : ${x.rates.join(" ; ")}`);
    }
  }
  console.log("\nSynthèse");
  console.log(`  ${"règles seules".padEnd(14)} ${`${rulesOk} exacts`.padEnd(22)} ${"-".padEnd(20)} ${"-".padEnd(10)} 0 s`);
  console.log(`  ${"modèle".padEnd(14)} ${"verdicts agent 1 (/4)".padEnd(22)} ${"extraction agent 2".padEnd(20)} ${"inventés".padEnd(10)} temps total`);
  for (const o of all) {
    const v = `${o.a1.filter((x) => x.grade === "exact").length} exacts, ${o.a1.filter((x) => x.grade === "prudent").length} prudents`, ext = o.a2.reduce((a, x) => { const [p, q] = (x.score || "0/0").split("/").map(Number); return [a[0] + p, a[1] + q]; }, [0, 0]);
    const inv = o.a2.reduce((a, x) => a + (x.inventes ? x.inventes.length : 0), 0);
    console.log(`  ${o.model.padEnd(14)} ${v.padEnd(22)} ${`${ext[0]}/${ext[1]}`.padEnd(20)} ${String(inv).padEnd(10)} ${(o.ms.reduce((a, b) => a + b, 0) / 1000).toFixed(0)} s`);
  }
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  const f = path.join(ROOT, "logs", `llm-eval-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`);
  fs.writeFileSync(f, JSON.stringify(all, null, 1));
  console.log(`\nDétail : ${path.relative(ROOT, f)}\n`);
})().catch((e) => { console.error("Erreur :", e.message); process.exit(1); });
