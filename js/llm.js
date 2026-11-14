/* Blocapta BlocSim - agents LLM (modèle local via Ollama, ou toute API compatible)
 *
 * Agent 1 hybride : les règles de js/fiche.js restent le garde-fou (un champ obligatoire vide bloque
 * toujours) ; le LLM ajoute un jugement sur les champs flous, les promesses commerciales et les
 * incohérences. Il peut rendre le verdict plus sévère, jamais plus indulgent.
 *
 * Agent 2 : le LLM lit une notice ou une note en texte libre et remplit la fiche du template.
 * Tout chiffre extrait doit apparaître dans le texte source, sinon il est signalé et retiré.
 *
 * Transport : dans le navigateur, POST /api/llm (server.js relaie vers Ollama) ;
 * en ligne de commande, tools/ affecte LLM_TRANSPORT à un appel direct.
 */

let LLM_TRANSPORT = async (body) => {
  const r = await fetch("api/llm", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  const j = await r.json().catch(()=>({error:"Réponse illisible du serveur"}));
  if(!r.ok || j.error) throw new Error(j.error || ("HTTP "+r.status));
  return j;
};

const STATUTS = ["Complet","Partiel","Vide","Inconnu","Incohérent"];
const ALERT_TYPES = ["rgpd","incoherence","affirmation_non_etayee","unite_manquante","source_manquante"];

// appel au modèle : messages + schéma JSON de la réponse
async function llmJSON(messages, schema, opts={}){
  const t0 = Date.now();
  const res = await LLM_TRANSPORT({model:opts.model, messages, schema, temperature:0, seed:42});
  let data = null, error = null;
  try { data = typeof res.content==="string" ? JSON.parse(res.content) : res.content; }
  catch(e){ error = "JSON invalide renvoyé par le modèle"; }
  return {data, error, ms:Date.now()-t0, model:res.model||opts.model, tokens:res.tokens||null};
}

/* ------------------------------------------------------------------ */
/* Agent 1 : contrôle de complétude, jugement du LLM                   */
/* ------------------------------------------------------------------ */
const AGENT1_SYSTEM = `Tu relis la fiche d'un logiciel avant qu'il soit simulé dans un bloc opératoire.
Pour chaque champ qu'on te donne, réponds à UNE question fermée : « ce texte répond-il concrètement à l'attendu, sans qu'on ait à deviner ? »
- concret = true : le texte donne une information précise et utilisable (un chiffre, un délai, une action, un acteur, une procédure, un risque décrit), même courte.
- concret = false : le texte est creux ou commercial (« procédure habituelle », « support réactif », « formation courte », « selon les besoins », « haute disponibilité », « conforme à la réglementation », « aucun risque, la solution a fait ses preuves », « interfaçable avec tous les logiciels »).
Exemples concret = true : « Hotline 8 h - 18 h, réponse sous 4 h », « 1 h par soignant, sur site », « Retour au papier, resaisie par l'IBODE en 3 min », « Time-out validé sans être fait si l'équipe coche par habitude », « 99 % mesuré sur 6 mois », « Environ 40 interventions par jour », « Toutes les salles, toutes spécialités », « Non dispositif médical, hébergement HDS ».
Juge seulement par rapport à l'attendu indiqué, n'exige rien de plus. Ne commente ni les dates ni la forme.

Ensuite, liste les alertes :
- "affirmation_non_etayee" : promesse commerciale sans mesure (« révolutionnaire », « zéro erreur », « gain de X % », « aucun risque »).
- "incoherence" : deux champs qui se contredisent vraiment (un rôle du processus absent des acteurs, une étape hors du périmètre).
- "rgpd" : seulement si tu vois un nom de personne, un numéro de dossier patient ou une date de naissance. Ne recopie jamais la donnée.
Puis pose une question courte à l'auteur pour les champs non concrets les plus importants (5 au plus), avec un exemple de réponse. Français simple, pas de tiret long.
Sois bref : "manque" est une chaîne vide quand concret = true, et une phrase de 15 mots au plus sinon. Résumé : 2 lignes.`;

const AGENT1_SCHEMA = {
  type:"object",
  properties:{
    champs:{type:"array", items:{type:"object", properties:{
      id:{type:"string"}, concret:{type:"boolean"}, manque:{type:"string"}
    }, required:["id","concret","manque"]}},
    alertes:{type:"array", items:{type:"object", properties:{
      type:{type:"string", enum:ALERT_TYPES}, champ_id:{type:"string"}, detail:{type:"string"}
    }, required:["type","champ_id","detail"]}},
    questions_a_l_auteur:{type:"array", items:{type:"object", properties:{
      champ_id:{type:"string"}, question:{type:"string"}, exemple_reponse:{type:"string"}
    }, required:["champ_id","question","exemple_reponse"]}},
    resume:{type:"string"}
  },
  required:["champs","alertes","questions_a_l_auteur","resume"]
};

// on ne soumet au LLM que les champs remplis que les règles jugent « Complet » : c'est là qu'il peut apporter quelque chose
function agent1Messages(fiche, det){
  const C = fiche.champs || {};
  const todo = FICHE_GRID.filter(g=>g.statut!=="F" && !det.champs.some(c=>c.id===g.id));
  const items = todo.map(g=>`- id: ${g.id}\n  champ: ${g.label}${CRITICAL.includes(g.id)?" (critique)":""}\n  attendu: ${g.attendu}\n  texte: ${JSON.stringify(C[g.id])}`).join("\n");
  return [
    {role:"system", content:AGENT1_SYSTEM},
    {role:"user", content:`Champs à juger (${todo.length}) :\n${items}\n\nRéponds pour chacun de ces ${todo.length} champs, puis donne les alertes, au plus 5 questions et un résumé de 2 lignes.`}
  ];
}

const RANK = {Complet:0, Partiel:1, Inconnu:2, Vide:2, "Incohérent":3};
// fusion : le LLM peut seulement durcir le statut d'un champ rempli (Complet -> Partiel ou Incohérent)
function mergeAgent1(fiche, det, llm){
  const overrides = {}, notes = [];
  const llmById = Object.fromEntries((llm.champs||[]).filter(c=>FICHE_GRID.some(g=>g.id===c.id))
    .map(c=>[c.id, {statut_champ: c.concret===false ? "Partiel" : "Complet", raison: c.manque || "Information jugée trop vague par le relecteur IA."}]));
  const detAll = Object.fromEntries(FICHE_GRID.map(g=>[g.id, (det.champs.find(c=>c.id===g.id)||{statut_champ:"Complet"}).statut_champ]));
  for(const g of FICHE_GRID){
    const d = detAll[g.id], l = llmById[g.id];
    if(!l || d==="Vide" || d==="Inconnu") continue;
    let s = l.statut_champ;
    if(s==="Vide" || s==="Inconnu" || s==="Incohérent") s = "Partiel";   // le champ est rempli : au pire flou ; une incohérence vue par le LLM seul ne bloque pas
    if(RANK[s] > RANK[d]){ overrides[g.id] = {statut_champ:s, raison:l.raison, par:"llm"}; notes.push(g.id); }
  }
  const known = new Set(det.alertes.map(a=>a.type+"|"+a.champ_id));
  // une alerte RGPD du LLM seul est à vérifier par un humain, elle ne bloque pas (le blocage RGPD reste aux règles)
  const alertes = (llm.alertes||[]).filter(a=>ALERT_TYPES.includes(a.type) && !known.has(a.type+"|"+a.champ_id))
    .map(a=>a.type==="rgpd" ? {...a, type:"rgpd_a_verifier", par:"llm"} : {...a, par:"llm"});
  const questions = (llm.questions_a_l_auteur||[]).filter(q=>FICHE_GRID.some(g=>g.id===q.champ_id));
  const out = checkFiche(fiche, {overrides, alertes, questions});
  out.version_agent = "0.1-hybride";
  out.llm = {durcis:notes, alertes_ajoutees:alertes.length, resume:llm.resume||""};
  return out;
}

async function agent1(fiche, opts={}){
  const det = checkFiche(fiche);
  const r = await llmJSON(agent1Messages(fiche, det), AGENT1_SCHEMA, opts);
  if(!r.data) return {...det, llm:{erreur:r.error, ms:r.ms}};
  const out = mergeAgent1(fiche, det, r.data);
  out.llm.ms = r.ms; out.llm.model = r.model; out.llm.brut = r.data;
  return out;
}

/* ------------------------------------------------------------------ */
/* Agent 2 : texte libre -> fiche du template                          */
/* ------------------------------------------------------------------ */
const AGENT2_SYSTEM_HEAD = `Tu remplis la fiche logiciel Blocapta (template v0.1) à partir d'un texte libre : notice d'éditeur, compte rendu de démonstration, note d'un cadre.
Règles strictes :
1. N'écris que ce qui est dans le texte. Si une information manque, écris exactement "Inconnu". Ne complète jamais avec tes connaissances.
2. Chaque chiffre que tu écris doit figurer dans le texte, avec son unité.
3. Pour chaque étape du processus (B4.etapes), donne : qui (métier exact : IBODE, IADE, Chirurgien, Anesthésiste, Cadre, Pharmacien...), l'action, le moment (avant, en salle, SSPI, après, hors bloc), la durée sans et avec le logiciel en minutes (nombre, ou null si absente), et la source de la durée recopiée du texte (« essai de l'éditeur », « chronométrage sur site »...). Ajoute une citation du texte de 15 mots au plus qui justifie l'étape.
   Sois bref dans tous les champs : une phrase courte suffit.
4. Recopie les affirmations commerciales telles quelles : ne les reformule pas en faits.
5. Aucune donnée personnelle : remplace tout nom de personne par sa fonction.
6. Une étape = une ligne avec les DEUX durées (sans et avec le logiciel) : ne sépare pas l'ancienne et la nouvelle méthode en deux étapes. Convertis les secondes en minutes (30 secondes = 0.5).
7. Respecte le sens de chaque champ : le support de l'éditeur (B6.support) décrit l'assistance humaine (délai, horaires, présence), pas le matériel.
8. Français simple. Pas de tiret long.`;
const AGENT2_SYSTEM = () => AGENT2_SYSTEM_HEAD + "\n\nChamps de la fiche (id | champ | attendu) :\n" + FICHE_GRID.map(g=>`${g.id} | ${g.label} | ${g.attendu}`).join("\n");

const TEXT_FIELDS = FICHE_GRID.filter(g=>!["B2.acteurs","B4.etapes","B10.indicateurs"].includes(g.id)).map(g=>g.id);
const AGENT2_SCHEMA = {
  type:"object",
  properties:{
    champs:{type:"object", properties:{
      ...Object.fromEntries(TEXT_FIELDS.map(id=>[id,{type:"string"}])),
      "B2.acteurs":{type:"array", items:{type:"object", properties:{
        role:{type:"string"}, utilise:{type:"boolean"}, actions:{type:"string"}, moment:{type:"string"}, frequence:{type:"string"}, formation:{type:"string"}
      }, required:["role","utilise","actions","moment","frequence","formation"]}},
      "B4.etapes":{type:"array", items:{type:"object", properties:{
        etape:{type:"string"}, qui:{type:"string"}, action:{type:"string"}, moment:{type:"string"},
        sans:{type:["number","null"]}, avec:{type:["number","null"]}, unite:{type:"string"}, source:{type:"string"}, citation:{type:"string"}
      }, required:["etape","qui","action","moment","sans","avec","unite","source","citation"]}},
      "B10.indicateurs":{type:"array", items:{type:"object", properties:{
        indicateur:{type:"string"}, actuel:{type:"string"}, cible:{type:"string"}
      }, required:["indicateur","actuel","cible"]}}
    }, required:[...TEXT_FIELDS, "B2.acteurs","B4.etapes","B10.indicateurs"]}
  },
  required:["champs"]
};

const ROLE_CANON = [[/ibode|infirmi[eè]re? de bloc/i,"IBODE"],[/iade|infirmi[eè]re? anesth/i,"IADE"],[/chirurg/i,"Chirurgien"],[/anesth[eé]siste|\bmar\b/i,"Anesthésiste"]];
const numsIn = s => (String(s).match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>+x.replace(",","."));

// garde-fou : tout chiffre de B4 doit apparaître dans le texte source
function guardAgent2(fiche, text){
  const src = numsIn(text);
  // un chiffre est accepté s'il est dans le texte, tel quel ou converti (secondes, heures -> minutes)
  const has = v => v==null || src.some(x=>[x, x/60, x*60].some(y=>Math.abs(y-v)<1e-6));
  const alertes = [];
  const C = fiche.champs || {};
  for(const e of (C["B4.etapes"]||[])){
    for(const k of ["sans","avec"]){
      if(e[k]!=null && !has(e[k])){ alertes.push({type:"affirmation_non_etayee", champ_id:"B4.etapes", detail:`Durée « ${k} » de ${e[k]} min pour « ${e.etape} » absente du texte source : retirée.`, par:"garde-fou"}); e[k]=null; }
    }
    for(const [re,r] of ROLE_CANON) if(re.test(e.qui||"")){ e.qui=r; break; }
  }
  for(const a of (C["B2.acteurs"]||[])) for(const [re,r] of ROLE_CANON) if(re.test(a.role||"")){ a.role=r; break; }
  const disp = C["B6.disponibilite"];
  if(disp && !/inconnu/i.test(disp) && numsIn(disp).some(v=>!has(v))){ alertes.push({type:"affirmation_non_etayee", champ_id:"B6.disponibilite", detail:"La disponibilité extraite ne figure pas dans le texte : remplacée par « Inconnu ».", par:"garde-fou"}); C["B6.disponibilite"]="Inconnu"; }
  return alertes;
}

async function agent2(text, opts={}){
  const r = await llmJSON([
    {role:"system", content:AGENT2_SYSTEM()},
    {role:"user", content:`Texte à transformer en fiche :\n"""\n${text}\n"""\nRemplis tous les champs de la fiche.`}
  ], AGENT2_SCHEMA, opts);
  if(!r.data) return {erreur:r.error, ms:r.ms};
  const fiche = {version_template:"0.1", genere_par:`agent 2 (${r.model})`, champs:r.data.champs||{}};
  const garde = guardAgent2(fiche, text);
  return {fiche, garde, ms:r.ms, model:r.model};
}

/* ------------------------------------------------------------------ */
/* Agent 5 : rapport rédigé, à partir des seuls chiffres de la campagne */
/* ------------------------------------------------------------------ */
// Les faits sont calculés ici (pas par le LLM) ; le LLM ne fait que les mettre en mots.
// Garde-fou : tout chiffre du texte doit figurer dans les faits, sinon il est signalé.
const frn = (x,d=1) => x==null||!Number.isFinite(x) ? null : ((Math.round(x*10**d)/10**d)||0).toLocaleString("fr-FR");
function reportFacts(o, sens){
  const T=o.totals, A=T[o.mainArm], base=T[0], days=o.C.days, W=o.weekly[o.mainArm];
  const last=o.daily[o.mainArm][days-1];
  const F=[];
  const add=(id, texte)=>F.push({id, texte});
  add("contexte", `Outil : ${o.norm.name}. Scénario ${o.scenario.id} : ${o.scenario.name}. ${days} jours ouvrés simulés (${Math.round(days/5)} semaines), ${o.C.reps} répétitions. Bras comparés : ${o.arms.map(a=>a.label).join(" ; ")}.`);
  add("confiance_analyse", `Niveau de confiance de l'analyse : ${o.report.confidence} (selon la complétude de la fiche et la qualité des sources).`);
  add("conclusion_calculee", `Conclusion calculée : ${o.report.conclusion} Niveau : ${o.report.level}.`);
  add("retard", `Retard moyen du programmé : ${frn(A.late.dMed)} min par intervention de plus qu'en l'absence de l'outil (fourchette ${frn(A.late.dP10)} à ${frn(A.late.dP90)} min).`);
  if(W.length>1) add("apprentissage", `Retard ajouté la semaine 1 : ${frn(W[0].late.med)} min par intervention ; la semaine ${W.length} : ${frn(W[W.length-1].late.med)} min.`);
  add("debordement", `Débordement après 18 h 30 : ${frn(A.overMin.dMed)} min par jour de plus.`);
  add("deprogrammations", `Déprogrammations sur la campagne : ${frn(A.deprog.dMed)} de plus (total ${frn(A.deprog.med)} avec l'outil, ${frn(base.deprog.med)} sans).`);
  add("surcharge", `Journées-soignant au-dessus du seuil de charge : ${frn(A.overload.dMed)} de plus sur la campagne.`);
  add("erreurs", `Erreurs de saisie attendues : ${frn(A.err.med)} avec l'outil contre ${frn(base.err.med)} avec l'ancienne méthode, soit ${frn(A.err.dMed)}.`);
  add("usage", `Usage de l'outil la dernière semaine : ${frn(A.adoption.med)} % des cas ; usages contournés sur la campagne : ${frn(A.gaps.med)}.`);
  add("confiance_metiers", `Confiance dans l'outil en fin de campagne (0 à 1) : ${Object.entries(ROLE_LABEL).map(([r,l])=>`${l} ${frn(last.TR[r].med,2)}`).join(", ")} ; moyenne ${frn(A.T.med,2)}.`);
  if(o.scenario.id==="B" && o.cohort && o.cohort.n>0){
    const K=o.cohort, L=days-1;
    add("panne", `${frn(K.n,0)} soignants touchés par la panne du jour 2. Le soir de la panne, leur confiance est de ${frn(K.arms[2][1].med,2)} sans support, ${frn(K.arms[1][1].med,2)} avec support sur place, ${frn(K.arms[3][1].med,2)} pour les mêmes soignants sans panne. En fin de campagne : ${frn(K.arms[2][L].med,2)} sans support, ${frn(K.arms[1][L].med,2)} avec support, ${frn(K.arms[3][L].med,2)} sans panne.`);
  }
  if(o.scenario.id==="C" && o.rooms){
    const rc=o.rooms.find(r=>r.arm==="reticent"), ctl=o.rooms.find(r=>r.arm==="avec");
    add("reticent", `Confiance de l'équipe paramédicale en fin de campagne : ${frn(rc.skeptic,2)} dans la salle du chirurgien réticent (${rc.skepticRoom}), ${frn(ctl.skeptic,2)} dans la même salle sans lui, ${frn(rc.champion,2)} dans la salle de l'IBODE championne (${rc.championRoom}).`);
  }
  o.report.risks.forEach((r,i)=>add("risque_"+(i+1), `Signal de risque ${r.level} : ${r.txt}`));
  o.report.hypotheses.forEach((h,i)=>add("hypothese_"+(i+1), `Hypothèse : ${h}`));
  if(sens) add("sensibilite", `Sensibilité aux paramètres à calibrer : ${sens.summary}`);
  return F;
}

const AGENT5_SYSTEM = `Tu rédiges le rapport Blocapta destiné à un cadre de santé et à la direction d'un bloc opératoire, qui doivent décider de déployer ou non un logiciel.
Règles strictes :
1. Tu n'utilises QUE les faits fournis. Tu n'ajoutes aucun chiffre, aucune étude, aucun nom de logiciel ou d'établissement.
2. Chaque chiffre que tu écris est recopié d'un fait, avec la même valeur et la même unité. Pas d'arrondi nouveau, pas de calcul.
3. Tu cites entre crochets l'identifiant du fait utilisé à la fin de chaque point, par exemple [retard].
4. Langage simple, lisible sans formation technique. Phrases courtes. Pas de tiret long. Pas de jargon statistique (dis « dans 8 simulations sur 10 » plutôt que « P10-P90 » si besoin).
5. Tu restes prudent : ce sont des résultats de simulation, avec des paramètres humains encore à calibrer. Tu ne présentes rien comme une certitude.
6. Les recommandations découlent des faits (par exemple : support sur place si le scénario de panne le montre, référents si la réticence freine l'équipe, formation si l'apprentissage coûte du temps).`;

const AGENT5_SCHEMA = {
  type:"object",
  properties:{
    titre:{type:"string"},
    en_bref:{type:"string"},
    sections:{type:"array", items:{type:"object", properties:{
      titre:{type:"string"}, points:{type:"array", items:{type:"string"}}
    }, required:["titre","points"]}},
    recommandations:{type:"array", items:{type:"string"}},
    limites:{type:"array", items:{type:"string"}}
  },
  required:["titre","en_bref","sections","recommandations","limites"]
};

// garde-fou : chiffres du texte absents des faits
function guardReport(rep, facts){
  const pool = facts.flatMap(f=>numsIn(f.texte));
  const ok = v => pool.some(x=>Math.abs(x-v) < 1e-9 || Math.abs(Math.abs(x)-Math.abs(v)) < 1e-9);
  const texts = [rep.en_bref, ...rep.sections.flatMap(s=>[s.titre, ...s.points]), ...rep.recommandations, ...rep.limites];
  const bad = [];
  for(const t of texts){
    const clean = String(t).replace(/\[[^\]]*\]/g,"").replace(/\b(OP|op)\s*\d+/g,"");   // identifiants de faits et noms de salles
    for(const v of numsIn(clean)) if(!ok(v)) bad.push({valeur:v, texte:t});
  }
  return bad;
}

async function agent5(o, opts={}){
  const facts = reportFacts(o, opts.sens);
  const r = await llmJSON([
    {role:"system", content:AGENT5_SYSTEM},
    {role:"user", content:`Faits (identifiant : texte) :\n${facts.map(f=>`- ${f.id} : ${f.texte}`).join("\n")}\n\nRédige le rapport : un titre, « en bref » en 2 ou 3 phrases, 3 ou 4 sections (ce qui change pour le bloc ; ce qui change pour les équipes ; risques pour les patients ; ${o.scenario.id==="B"?"pannes et support ; ":o.scenario.id==="C"?"adoption par l'équipe ; ":""}), 2 à 4 recommandations, et les limites. Les recommandations et les limites vont uniquement dans leurs champs dédiés, pas dans les sections.`}
  ], AGENT5_SCHEMA, opts);
  if(!r.data) return {erreur:r.error, ms:r.ms};
  // le modèle répète parfois recommandations et limites dans les sections : on les retire
  r.data.sections = (r.data.sections||[]).filter(s=>!/recommand|limite/i.test(s.titre||""));
  const bad = guardReport(r.data, facts);
  return {rapport:r.data, facts, chiffresNonTrouves:bad, ms:r.ms, model:r.model};
}

// version texte (Markdown) du rapport, pour copier ou télécharger
function reportMarkdown(res, o){
  const R=res.rapport;
  const lines=[`# ${R.titre}`, "", `*${o.norm.name} · scénario ${o.scenario.id} · confiance de l'analyse : ${o.report.confidence} · rédigé par ${res.model} à partir des chiffres de la simulation*`, "", R.en_bref, ""];
  R.sections.forEach(s=>{ lines.push(`## ${s.titre}`, ""); s.points.forEach(p=>lines.push(`- ${p}`)); lines.push(""); });
  lines.push("## Recommandations", ""); R.recommandations.forEach(p=>lines.push(`- ${p}`)); lines.push("");
  lines.push("## Limites", ""); R.limites.forEach(p=>lines.push(`- ${p}`));
  if(res.chiffresNonTrouves.length){ lines.push("", `> Attention : ${res.chiffresNonTrouves.length} chiffre(s) du texte ne figurent pas dans les résultats de la simulation : ${res.chiffresNonTrouves.map(b=>b.valeur).join(", ")}.`); }
  return lines.join("\n");
}
