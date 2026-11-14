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
Puis pose une question courte à l'auteur pour chaque champ non concret, avec un exemple de réponse. Français simple, pas de tiret long.`;

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
    {role:"user", content:`Champs à juger (${todo.length}) :\n${items}\n\nRéponds pour chacun de ces ${todo.length} champs, puis donne les alertes, les questions et un résumé de 3 lignes.`}
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
3. Pour chaque étape du processus (B4.etapes), donne : qui (métier exact : IBODE, IADE, Chirurgien, Anesthésiste, Cadre, Pharmacien...), l'action, le moment (avant, en salle, SSPI, après, hors bloc), la durée sans et avec le logiciel en minutes (nombre, ou null si absente), et la source de la durée recopiée du texte (« essai de l'éditeur », « chronométrage sur site »...). Ajoute une citation courte du texte qui justifie l'étape.
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
