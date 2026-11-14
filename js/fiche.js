/* Blocapta BlocSim - fiche logiciel : contrôle de complétude (agent 1) et normalisation (agent 2)
 *
 * Version déterministe des règles de « agent-01-controle-completude.md » (v0.1) :
 * la même grille de 40 champs, les mêmes statuts, verdicts et niveaux de confiance.
 * Un LLM peut ensuite affiner le jugement (champs « Partiel », promesses commerciales),
 * mais ce contrôle suffit à bloquer une fiche incomplète.
 */

const FICHE_GRID = [
  ["B0.nom",0,"Nom et version","O","Nom exact et version ou module","Quel est le nom exact du logiciel et sa version ?","ScanTrace v2.3, module bloc"],
  ["B0.editeur",0,"Éditeur ou fabricant","O","Nom de la société","Quelle société édite le logiciel ?","Société X"],
  ["B0.type_outil",0,"Type d'outil","O","Une catégorie précise","Dans quelle catégorie entre l'outil ?","Traçabilité des dispositifs médicaux"],
  ["B0.statut_projet",0,"Statut du projet","O","À l'étude, en essai, déployé ailleurs ou ici","Où en est le projet ?","En essai dans un autre établissement"],
  ["B0.auteur_date",0,"Auteur et date","O","Fonction de l'auteur et date","Qui a rempli la fiche (fonction) et quand ?","Cadre de bloc, 13/11/2026"],
  ["B0.sources",0,"Sources utilisées","O","Au moins une source nommée","Sur quelles sources repose la fiche ?","Notice éditeur, démonstration du 10/11"],
  ["B0.classe_reglementaire",0,"Classe réglementaire","R","Classe I, IIa, IIb, III ou non DM","Le logiciel est-il un dispositif médical, de quelle classe ?","Non dispositif médical"],
  ["B1.probleme",1,"Problème à résoudre","O","2 à 5 phrases concrètes","Quelle difficulté concrète le logiciel doit-il régler au bloc ?","Les implants sont tracés sur papier puis recopiés, avec des oublis."],
  ["B1.situation_actuelle",1,"Situation actuelle","O","Comment on fait aujourd'hui","Comment fait-on aujourd'hui, sans le logiciel ?","Étiquettes collées sur une feuille, saisie le soir"],
  ["B1.resultat_attendu",1,"Résultat attendu","O","Un changement attendu, idéalement mesurable","Quel changement mesurable attend-on ?","Zéro implant non tracé, 1 min gagnée par cas"],
  ["B1.pourquoi_maintenant",1,"Pourquoi maintenant","F","Raison du projet","Pourquoi ce projet maintenant ?","Obligation de traçabilité UDI"],
  ["B2.acteurs",2,"Tableau des acteurs","O","Chaque rôle utilisateur a ses actions, son moment et sa fréquence","Pour chaque métier qui utilise le logiciel : que fait-il, à quel moment, à quelle fréquence ?","IBODE : scanne chaque implant, en salle, à chaque cas"],
  ["B3.fonctions_incluses",3,"Ce que le logiciel fait","O","Liste des fonctions utilisées au bloc","Quelles fonctions seront réellement utilisées au bloc ?","Scan UDI, édition de la traçabilité"],
  ["B3.fonctions_exclues",3,"Ce que le logiciel ne fait pas","O","Au moins une limite explicite","Que ne fait pas le logiciel (ou qu'est-ce qui ne sera pas activé) ?","Pas de gestion de stock"],
  ["B3.salles_specialites",3,"Salles, spécialités, sites","O","Salles ou spécialités nommées","Quelles salles et spécialités sont concernées ?","OP 3 à OP 8, orthopédie et viscéral"],
  ["B3.etapes_parcours",3,"Étapes du parcours","O","Avant, en salle, SSPI, après, hors bloc","À quelles étapes du parcours le logiciel intervient-il ?","En salle"],
  ["B3.volume",3,"Volume prévu","R","Utilisateurs et cas par jour","Combien d'utilisateurs et de cas par jour ?","12 IBODE, 25 cas par jour"],
  ["B4.etapes",4,"Étapes avant et après","O","Qui, action, durée sans, durée avec, source","Pour chaque étape qui change : qui, quelle action, combien de minutes sans et avec le logiciel, et d'où vient la durée ?","Tracer un implant : IBODE, 2 min sans, 0,5 min avec (essai de 20 cas)"],
  ["B5.donnees_saisies",5,"Données saisies","O","Quoi, et comment","Que saisissent les soignants, et comment (clavier, scan) ?","Code UDI par scan"],
  ["B5.donnees_produites",5,"Données produites","O","Alertes, rapports, étiquettes","Que produit le logiciel ?","Feuille de traçabilité, alertes de rappel"],
  ["B5.liens_logiciels",5,"Liens avec d'autres logiciels","O","Logiciels nommés ou « aucun lien »","Avec quels logiciels échange-t-il (ou « aucun lien ») ?","Logiciel de bloc, pharmacie"],
  ["B5.mode_echange",5,"Mode d'échange","R","Temps réel ou différé","Les échanges sont-ils en temps réel ou différés ?","Temps réel, automatique"],
  ["B5.materiel",5,"Matériel nécessaire","R","Types et quantités","Quel matériel faut-il, en quelle quantité ?","1 scanner par salle"],
  ["B6.disponibilite",6,"Disponibilité annoncée","O","Pourcentage avec source","Quelle disponibilité est annoncée, et par qui ?","99,5 % (contrat éditeur)"],
  ["B6.mode_degrade",6,"Mode dégradé","O","Ce qu'on fait en cas de panne","Que font les soignants si le logiciel est indisponible pendant une intervention ?","Retour au registre papier, resaisie par l'IBODE dans l'heure"],
  ["B6.support",6,"Support de l'éditeur","O","Délai, horaires, présence sur site","Quel support : délai de réponse, horaires, présence au démarrage ?","Hotline 8 h - 18 h sous 4 h, présence sur site la 1re semaine"],
  ["B6.pannes_connues",6,"Pannes ou défauts connus","R","Incidents observés ou « aucun connu »","Quelles pannes ont déjà été observées ?","Scanner qui ne lit pas les petits codes"],
  ["B6.mises_a_jour",6,"Mises à jour","F","Fréquence et interruption","À quelle fréquence, avec quelle interruption ?","Mensuelle, la nuit"],
  ["B7.formation_initiale",7,"Formation initiale","O","Durée, format, qui est formé","Quelle formation, combien de temps, pour qui ?","2 h sur site pour toutes les IBODE"],
  ["B7.calendrier",7,"Calendrier de déploiement","R","Étapes et durée","Le déploiement se fait-il d'un coup ou par étapes ?","2 salles pilotes puis tout le bloc"],
  ["B7.accompagnement",7,"Accompagnement","R","Référents, aide sur place","Y a-t-il des référents (champions) dans l'équipe ?","1 IBODE référente par équipe"],
  ["B7.double_saisie",7,"Période de double saisie","F","Durée","Combien de temps garde-t-on l'ancien système ?","2 semaines"],
  ["B8.reglementaire",8,"Contraintes réglementaires","O","DM, RGPD, HDS, traçabilité","Quelle est la situation sur le dispositif médical, le RGPD, l'hébergement HDS ?","Non DM, hébergement HDS, analyse RGPD faite"],
  ["B8.risques_patient",8,"Risques pour le patient","O","Au moins un risque, ou « aucun » justifié","Que pourrait-il arriver au patient si le logiciel se trompe ou tombe en panne ?","Implant rappelé non retrouvé si la traçabilité est perdue"],
  ["B8.risques_organisation",8,"Risques pour l'organisation","R","Retards, surcharge, dépendances","Quels risques pour l'organisation ?","Retard si le scan échoue"],
  ["B9.niveau_preuve",9,"Niveau de preuve","O","Site, étude publiée, retour oral ou éditeur seul","D'où viennent les durées et les gains annoncés ?","Essai de l'éditeur sur 20 cas"],
  ["B9.sites_utilisateurs",9,"Sites déjà utilisateurs","R","Type, taille, ancienneté","Quels sites l'utilisent déjà ?","CHU, 20 salles, 2 ans"],
  ["B9.etudes",9,"Études ou chiffres publiés","R","Références ou liens","Existe-t-il des études publiées ?","Auteur, année, revue"],
  ["B9.retours_soignants",9,"Retour des soignants","R","Avis positifs et négatifs","Qu'en disent les soignants qui l'utilisent ?","Rapide une fois appris, lent au début"],
  ["B10.indicateurs",10,"Indicateurs à suivre","R","Au moins un indicateur avec valeur et cible","Quel indicateur suivre, avec sa valeur actuelle et sa cible ?","Implants non tracés : 4 % → 0 %"]
].map(([id,bloc,label,statut,attendu,question,exemple])=>({id,bloc,label,statut,attendu,question,exemple}));

const CRITICAL = ["B2.acteurs","B4.etapes","B6.mode_degrade","B8.risques_patient"];
const VAGUE = /\b(quelques|plusieurs|variable|rapide(ment)?|divers|etc\.?|à définir|a definir|tbd|nc)\b/i;
const HYPE = /(révolutionnaire|revolutionnaire|zéro erreur|zero erreur|100 ?% (fiable|sûr|sur)|sans aucun risque|gain de \d+ ?%)/i;
const STRONG_PROOF = /(site|mesur|étude|etude|publi|chronométr|chronometr)/i;
const PROOF_LEVELS = {site:"Mesure sur site", etude:"Étude publiée", oral:"Retour oral", editeur:"Déclaration de l'éditeur"};

const ficheVal = (f,id)=>{ const v=f.champs ? f.champs[id] : undefined; return v && typeof v==="object" && !Array.isArray(v) && "valeur" in v ? v.valeur : v; };
const isEmpty = v => v==null || (typeof v==="string" && !v.trim()) || (Array.isArray(v) && !v.length);
const isUnknown = v => typeof v==="string" && /^\s*inconnu\s*$/i.test(v);
const asText = v => Array.isArray(v) ? v.map(x=>typeof x==="object"? Object.values(x).join(" ") : x).join(" ") : typeof v==="object" && v ? Object.values(v).join(" ") : String(v??"");
const num = v => { if(typeof v==="number") return v; const m=/(-?\d+(?:[.,]\d+)?)/.exec(String(v??"")); return m? +m[1].replace(",",".") : NaN; };
const proofLevel = s => { s=String(s||"").toLowerCase(); return /site|chronom|mesur/.test(s)? "site" : /étude|etude|publi/.test(s)? "etude" : /oral|utilisateur|retour/.test(s)? "oral" : "editeur"; };

/* ------------------------------------------------------------------ */
/* Agent 1 : contrôle de complétude                                    */
/* ------------------------------------------------------------------ */
// extra (facultatif) : jugement d'un LLM, déjà filtré par mergeAgent1 (js/llm.js)
//   {overrides:{id:{statut_champ,raison,par}}, alertes:[...], questions:[...]}
function checkFiche(f, extra={}){
  const champs = [], alertes = [];
  const statusOf = (g)=>{
    const v = ficheVal(f, g.id);
    if(isEmpty(v)) return ["Vide","Rien n'est écrit."];
    if(isUnknown(v)) return ["Inconnu","L'auteur a écrit « Inconnu »."];
    if(g.id==="B2.acteurs"){
      const users = v.filter(a=>a.utilise);
      if(!users.length) return ["Partiel","Aucun rôle n'est marqué comme utilisateur du logiciel."];
      const bad = users.filter(a=>[a.actions,a.moment,a.frequence].some(x=>isEmpty(x)||isUnknown(x)||VAGUE.test(String(x))));
      if(bad.length) return ["Partiel",`Actions, moment ou fréquence manquants ou flous pour : ${bad.map(a=>a.role).join(", ")}.`];
      return ["Complet",""];
    }
    if(g.id==="B4.etapes"){
      const bad = v.filter(e=>!e.qui || !e.action || !Number.isFinite(num(e.sans)) || !Number.isFinite(num(e.avec)) || isEmpty(e.source));
      if(bad.length) return ["Partiel",`${bad.length} étape(s) sans durée chiffrée, sans acteur ou sans source.`];
      return ["Complet",""];
    }
    if(g.id==="B10.indicateurs"){
      const ok = v.filter(i=>!isEmpty(i.actuel) && !isEmpty(i.cible));
      return ok.length? ["Complet",""] : ["Partiel","Aucun indicateur n'a à la fois une valeur actuelle et une cible."];
    }
    const t = asText(v);
    if(HYPE.test(t)) return ["Partiel","Affirmation commerciale non étayée."];
    if(VAGUE.test(t) || t.trim().length<3) return ["Partiel","L'information est présente mais floue."];
    return ["Complet",""];
  };
  for(const g of FICHE_GRID){
    let [st, raison] = statusOf(g), par = "regles";
    const ov = extra.overrides && extra.overrides[g.id];
    if(ov){ st = ov.statut_champ; raison = ov.raison; par = ov.par||"llm"; }
    champs.push({id:g.id, bloc:g.bloc, label:g.label, statut:g.statut, statut_champ:st, critique:CRITICAL.includes(g.id), raison, par});
  }
  const C = Object.fromEntries(champs.map(c=>[c.id,c]));

  // contrôles de cohérence
  const acteurs = ficheVal(f,"B2.acteurs"), etapes = ficheVal(f,"B4.etapes");
  if(Array.isArray(acteurs) && Array.isArray(etapes)){
    const roles = new Set(acteurs.map(a=>a.role));
    etapes.forEach(e=>{ if(e.qui && !roles.has(e.qui)) alertes.push({type:"incoherence", champ_id:"B4.etapes", detail:`L'étape « ${e.action||e.etape} » est faite par ${e.qui}, absent du tableau des acteurs.`}); });
    acteurs.filter(a=>a.utilise).forEach(a=>{ if(!etapes.some(e=>e.qui===a.role)) alertes.push({type:"incoherence", champ_id:"B2.acteurs", detail:`${a.role} utilise le logiciel mais n'apparaît dans aucune étape du processus.`}); });
  }
  if(Array.isArray(etapes)){
    etapes.forEach(e=>{
      const s=num(e.sans), a=num(e.avec);
      if(Number.isFinite(s)&&Number.isFinite(a)){
        if(!e.unite) alertes.push({type:"unite_manquante", champ_id:"B4.etapes", detail:`L'étape « ${e.action||e.etape} » n'a pas d'unité (minutes supposées).`});
        if(a < 0.5*s && !STRONG_PROOF.test(String(e.source||""))) alertes.push({type:"affirmation_non_etayee", champ_id:"B4.etapes", detail:`« ${e.action||e.etape} » : gain de ${Math.round(100*(1-a/s))} % annoncé sans mesure sur site ni étude publiée.`});
      }
      if(isEmpty(e.source)) alertes.push({type:"source_manquante", champ_id:"B4.etapes", detail:`L'étape « ${e.action||e.etape} » n'a pas de source pour sa durée.`});
    });
  }
  const dispo = num(ficheVal(f,"B6.disponibilite"));
  if(dispo>=100) alertes.push({type:"affirmation_non_etayee", champ_id:"B6.disponibilite", detail:"Disponibilité annoncée de 100 % : aucune panne n'est envisagée, c'est suspect."});
  const all = JSON.stringify(f.champs||{});
  // titre + nom propre (sensible à la casse), identifiant patient, date de naissance explicite
  const rgpd = /\b(Dr\.?|Docteur|Pr\.?|Professeur|Mme|M\.|Monsieur|Madame)\s+[A-ZÉÈ][a-zéèëï-]+/.test(all)
    || /\b(IPP|NIP|n° de dossier)\s*:?\s*\d{4,}/i.test(all)
    || /\b(née?|date de naissance)\s*(le|:)?\s*\d{1,2}\/\d{1,2}\/(19|20)\d{2}/i.test(all);
  if(rgpd) alertes.push({type:"rgpd", champ_id:"*", detail:"La fiche semble contenir une donnée personnelle (nom ou identifiant). Elle n'est pas recopiée ici."});
  (extra.alertes||[]).forEach(a=>alertes.push(a));
  const rgpdAll = rgpd || alertes.some(a=>a.type==="rgpd");

  // verdict
  const O = champs.filter(c=>c.statut==="O"), R = champs.filter(c=>c.statut==="R"), F = champs.filter(c=>c.statut==="F");
  const filled = L=>L.filter(c=>c.statut_champ==="Complet"||c.statut_champ==="Partiel").length;
  const oBlock = O.filter(c=>["Vide","Inconnu","Incohérent"].includes(c.statut_champ) || (c.critique && c.statut_champ==="Partiel"));
  const sources = Array.isArray(etapes)? etapes.map(e=>proofLevel(e.source)) : [];
  const editorOnly = sources.length && sources.every(s=>s==="editeur");
  const strong = sources.some(s=>s==="site"||s==="etude");
  const rRate = filled(R)/R.length;
  let verdict, confiance;
  if(oBlock.length || rgpdAll){ verdict="NON_ANALYSABLE"; confiance="aucune"; }
  else if(O.some(c=>c.statut_champ==="Partiel") || editorOnly || rRate<0.5 || alertes.length){
    verdict="ANALYSABLE_AVEC_RESERVES";
    confiance = rRate>=0.5 && !editorOnly ? "moyenne" : "faible";
  } else if(rRate>=0.75 && strong){ verdict="ANALYSABLE"; confiance="elevee"; }
  else { verdict="ANALYSABLE_AVEC_RESERVES"; confiance = rRate>=0.5 && !editorOnly ? "moyenne" : "faible"; }

  // questions : champs critiques d'abord, puis autres O, puis R
  const need = champs.filter(c=>c.statut_champ!=="Complet").sort((a,b)=>(b.critique-a.critique) || ("ORF".indexOf(a.statut)-"ORF".indexOf(b.statut)));
  // questions du LLM d'abord (mieux ciblées), complétées par celles de la grille pour les champs non couverts
  const llmQ = (extra.questions||[]).filter(q=>need.some(c=>c.id===q.champ_id));
  const rank = id => need.findIndex(c=>c.id===id);
  const qs = [...llmQ.sort((a,b)=>rank(a.champ_id)-rank(b.champ_id)).map(q=>({champ_id:q.champ_id, question:q.question, exemple_reponse:q.exemple_reponse, par:"llm"}))];
  for(const c of need){ if(qs.length>=10) break; if(!qs.some(q=>q.champ_id===c.id)){ const g=FICHE_GRID.find(x=>x.id===c.id); qs.push({champ_id:c.id, question:g.question, exemple_reponse:g.exemple, par:"regles"}); } }
  const questions = qs.slice(0,10).sort((a,b)=>rank(a.champ_id)-rank(b.champ_id)).map((q,i)=>({priorite:i+1, ...q}));
  const hypotheses = verdict==="ANALYSABLE_AVEC_RESERVES" ? buildHypotheses(f, champs, editorOnly) : [];

  return {
    version_agent:"0.1-deterministe", version_template:"0.1",
    verdict, confiance,
    score_completude:{ obligatoires:`${O.filter(c=>c.statut_champ==="Complet").length}/${O.length}`, recommandes:`${filled(R)}/${R.length}`, facultatifs:`${filled(F)}/${F.length}` },
    champs: champs.filter(c=>c.statut_champ!=="Complet"),
    alertes, questions_a_l_auteur:questions, hypotheses_necessaires:hypotheses,
    fiche_normalisee: verdict==="NON_ANALYSABLE" ? null : normalizeFiche(f)
  };
}

function buildHypotheses(f, champs, editorOnly){
  const H = [];
  if(editorOnly) H.push({champ_id:"B4.etapes", hypothese:"Les durées « avec logiciel » viennent de l'éditeur seul : elles sont testées dans une fourchette de plus ou moins 50 %."});
  const st = id=>champs.find(c=>c.id===id)?.statut_champ;
  if(st("B6.pannes_connues")!=="Complet") H.push({champ_id:"B6.pannes_connues", hypothese:"Sans historique de pannes, on suppose 1 % d'échecs ponctuels par usage."});
  if(st("B7.accompagnement")!=="Complet") H.push({champ_id:"B7.accompagnement", hypothese:"Aucun référent désigné : pas de « champion » dans le réseau."});
  if(st("B3.volume")!=="Complet") H.push({champ_id:"B3.volume", hypothese:"Toutes les interventions du périmètre utilisent le logiciel."});
  return H;
}

/* ------------------------------------------------------------------ */
/* Agent 2 : fiche normalisée -> paramètres de simulation              */
/* ------------------------------------------------------------------ */
const ROLE_MAP = [[/ibode|infirmi.*bloc/i,"IBODE"],[/iade|infirmi.*anesth/i,"IADE"],[/chirurg/i,"CHIR"],[/anesth|mar\b/i,"MAR"]];
const mapRole = s => { for(const [re,r] of ROLE_MAP) if(re.test(s||"")) return r; return null; };
const SPEC_WORDS = [[/ortho/i,"Chirurgie Orthopédique"],[/visc|digest/i,"Chirurgie Générale et Digestive"],[/uro/i,"Chirurgie Urologique"],[/orl/i,"Chirurgie ORL"],[/gyn|obst/i,"Gynécologie Obstétrique"],[/endosc/i,"Endoscopie Digestive"],[/ophtal/i,"Ophtalmologie"],[/stomat/i,"Stomatologie"],[/cardio/i,"Cardiologie"]];

function parseRooms(s){
  s = String(s||"");
  if(/toutes les salles|tout le bloc/i.test(s)) return null;
  const out = new Set();
  const range = /OP\s*(\d+)\s*(?:à|a|-)\s*(?:OP\s*)?(\d+)/gi; let m;
  while((m=range.exec(s))) for(let i=+m[1];i<=+m[2];i++) out.add("OP "+i);
  const single = /OP\s*(\d+)/gi; while((m=single.exec(s))) out.add("OP "+m[1]);
  return out.size ? [...out].sort((a,b)=>num(a)-num(b)) : null;
}
function parseSpecs(s){
  s = String(s||"");
  if(/toutes (les )?spécialités|toutes specialites/i.test(s)) return null;
  const L = SPEC_WORDS.filter(([re])=>re.test(s)).map(([,n])=>n);
  if(L.includes("Chirurgie Générale et Digestive")) L.push("VISCERAL ROBOT");
  if(L.includes("Chirurgie Urologique")) L.push("UROLOGIE ROBOT");
  return L.length ? L : null;
}

function normalizeFiche(f){
  const v = id=>ficheVal(f,id);
  const etapes = (v("B4.etapes")||[]).map(e=>{
    const role = mapRole(e.qui);
    const lvl = proofLevel(e.source);
    return {
      etape:e.etape||e.action, role, qui:e.qui,
      without:num(e.sans), with:num(e.avec),
      inRoom: !/avant|apr[eè]s|hors|sspi|réveil|reveil|veille|consultation/i.test(e.moment||"salle"),
      source:e.source||"", preuve:lvl, preuveLabel:PROOF_LEVELS[lvl],
      // incertitude : ± 50 % sur une déclaration de l'éditeur, ± 25 % sur un retour oral, ± 10 % sinon
      spread: lvl==="editeur"? 0.5 : lvl==="oral"? 0.25 : 0.1
    };
  }).filter(e=>e.role && Number.isFinite(e.without) && Number.isFinite(e.with));
  const support = String(v("B6.support")||"");
  // délai d'intervention (« sous 4 h », « en 30 min ») ; une plage horaire (« de 8 h à 18 h ») n'en est pas un
  const delay = /(?:sous|en moins de|en|d[ée]lai(?: de)?|dans les)\s+(\d+(?:[.,]\d+)?)\s*(min|h)\b/i.exec(support);
  const supportMin = /(\d+)\s*min/.exec(support);
  const formation = String(v("B7.formation_initiale")||"");
  const fH = /(\d+(?:[.,]\d+)?)\s*h/.exec(formation);
  const acc = String(v("B7.accompagnement")||"");
  const pannes = String(v("B6.pannes_connues")||"");
  const deg = String(v("B6.mode_degrade")||"");
  const degMin = /(\d+)\s*min/.exec(deg);
  return {
    name: String(v("B0.nom")||"Outil"),
    editor: String(v("B0.editeur")||""),
    type: String(v("B0.type_outil")||""),
    rooms: parseRooms(v("B3.salles_specialites")),
    specs: parseSpecs(v("B3.salles_specialites")),
    steps: etapes,
    availability: (num(v("B6.disponibilite"))||99)/100,
    supportOnSite: /sur site|sur place|présence|presence/i.test(support),
    restoreMin: delay ? +delay[1].replace(",",".")*(/h/i.test(delay[2])?60:1) : supportMin ? +supportMin[1] : 240,
    trainingH: fH ? +fH[1].replace(",",".") : 0,
    champions: /référent|referent|champion/i.test(acc),
    microFail: /aucun/i.test(pannes) ? 0.005 : pannes.trim() ? 0.02 : 0.01,
    degradedExtra: degMin ? +degMin[1] : 2,
    sources: String(v("B0.sources")||""),
    proof: String(v("B9.niveau_preuve")||"")
  };
}
