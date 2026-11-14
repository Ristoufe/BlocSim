/* Blocapta BlocSim - schéma unique des paramètres
   Lu par l'interface (écran « Créer une journée »), le terminal (npm run sim, npm run campagne)
   et la documentation. Chaque paramètre a des bornes réalistes : on ne peut pas sortir du possible.
   source : "données" (mesuré dans l'export OPROOM), "réglementation", "hypothèse" (à calibrer). */

const PARAM_GROUPS = [
  {id:"calendrier", label:"Calendrier"},
  {id:"bloc", label:"Organisation du bloc"},
  {id:"pre", label:"Pré-anesthésie"},
  {id:"patients", label:"Patients"},
  {id:"verifs", label:"Vérifications avant l'anesthésie"},
  {id:"brancards", label:"Brancards et transports"},
  {id:"personnel", label:"Personnel"},
  {id:"equipements", label:"Équipements partagés"},
  {id:"steri", label:"Stérilisation, matériel et implants"},
  {id:"perop", label:"Pendant l'intervention"},
  {id:"sspi", label:"SSPI et aval"},
  {id:"urgences", label:"Urgences et garde"},
  {id:"aleas", label:"Aléas"}
];

const PARAMS = [
  // Calendrier
  {key:"periode", group:"calendrier", label:"Contexte", type:"enum", def:"normale",
    options:[["normale","Période normale"],["epidemie","Épidémie hivernale"],["vacances","Vacances scolaires"]], source:"hypothèse",
    help:"Une épidémie augmente les annulations, les absences et la saturation des lits d'aval. Les vacances scolaires amènent plus d'enfants en ORL."},

  // Bloc
  {key:"load", group:"bloc", label:"Remplissage du programme", type:"range", def:1, min:0.7, max:1.25, step:0.05, unit:"x", source:"données",
    help:"1 = programme habituel pour ce jour de la semaine et ce mois. Au-dessus, le bloc est surbooké."},
  {key:"firstPlanned", group:"bloc", label:"Heure prévue du premier patient", type:"time", def:510, min:450, max:540, source:"données", help:"Premier patient prévu à 8 h 30 : la première entrée réelle en salle est à 8 h 41 en médiane."},
  {key:"lastProgStart", group:"bloc", label:"Dernier démarrage d'un cas programmé", type:"time", def:1080, min:1020, max:1140, source:"hypothèse"},
  {key:"doubleSalle", group:"bloc", label:"Part des chirurgiens en double salle", type:"range", def:0, min:0, max:0.3, step:0.05, unit:"%", source:"hypothèse",
    help:"Un chirurgien alterne entre deux salles : seul le temps principal exige sa présence, l'installation et la fermeture sont faites par un assistant."},

  // Pré-anesthésie
  {key:"preSeats", group:"pre", label:"Postes assis", type:"int", def:4, min:0, max:10, source:"hypothèse", help:"Fauteuils pour les patients venus debout ou en fauteuil."},
  {key:"preBeds", group:"pre", label:"Postes couchés", type:"int", def:4, min:1, max:10, source:"hypothèse"},
  {key:"preNurses", group:"pre", label:"IDE d'accueil", type:"int", def:1, min:1, max:3, source:"hypothèse"},
  {key:"callLead", group:"pre", label:"Délai d'appel du patient", type:"int", def:25, min:15, max:75, unit:"min", source:"hypothèse",
    help:"Le bloc appelle le patient suivant quand la salle doit se libérer dans ce délai."},
  {key:"alrInPre", group:"pre", label:"ALR faites en pré-anesthésie", type:"bool", def:true, source:"hypothèse"},
  {key:"preSas", group:"pre", label:"Salle de pré-anesthésie devant chaque salle", type:"bool", def:true, source:"établissement",
    help:"Chaque salle d'opération est précédée de sa salle de pré-anesthésie : le patient y est vérifié et préparé, puis entre en salle en une minute. La zone d'accueil commune sert d'attente si elle est occupée."},
  {key:"sasPlaces", group:"pre", label:"Places par salle de pré-anesthésie", type:"int", def:1, min:1, max:2, source:"établissement"},

  // Patients
  {key:"noShow", group:"patients", label:"Patients absents", type:"range", def:0.02, min:0, max:0.08, step:0.005, unit:"%", source:"hypothèse"},
  {key:"latePatient", group:"patients", label:"Patients en retard", type:"range", def:0.10, min:0, max:0.3, step:0.01, unit:"%", source:"hypothèse"},
  {key:"lateMean", group:"patients", label:"Retard moyen d'un patient", type:"int", def:20, min:5, max:60, unit:"min", source:"hypothèse"},
  {key:"sameDayCancel", group:"patients", label:"Autres annulations le jour même", type:"range", def:0.015, min:0, max:0.06, step:0.005, unit:"%", source:"hypothèse",
    help:"Fièvre, infection récente, tension trop haute, refus du patient. Le jeûne et les anticoagulants sont réglés à part."},
  {key:"dossierIncomplet", group:"patients", label:"Dossiers administratifs incomplets", type:"range", def:0.04, min:0, max:0.2, step:0.01, unit:"%", source:"hypothèse",
    help:"Régularisation par l'IDE d'accueil : 10 à 35 min de plus."},
  {key:"bmr", group:"patients", label:"Patients porteurs de BMR ou BHRe", type:"range", def:0.03, min:0, max:0.1, step:0.01, unit:"%", source:"hypothèse",
    help:"Patients hospitalisés : placés en fin de programme, bionettoyage renforcé."},

  // Vérifications avant l'anesthésie (identitovigilance, jeûne, traitements, consentement, marquage, examens)
  {key:"vpaJour", group:"verifs", label:"Ambulatoires vus par le MAR le jour même", type:"range", def:0.7, min:0, max:1, step:0.05, unit:"%", source:"hypothèse",
    help:"Visite pré-anesthésique en pré-anesthésie (3 à 5 min de MAR). Les hospitalisés sont vus la veille."},
  {key:"jeune", group:"verifs", label:"Jeûne non respecté", type:"range", def:0.012, min:0, max:0.05, step:0.002, unit:"%", source:"hypothèse",
    help:"Le patient passe en fin de programme (6 h de jeûne) ou l'intervention est annulée."},
  {key:"anticoag", group:"verifs", label:"Anticoagulant ou antiagrégant non arrêté", type:"range", def:0.005, min:0, max:0.03, step:0.001, unit:"%", source:"hypothèse",
    help:"Découvert par le MAR ou l'IADE : intervention annulée."},
  {key:"consentement", group:"verifs", label:"Consentement manquant ou non signé", type:"range", def:0.01, min:0, max:0.05, step:0.005, unit:"%", source:"hypothèse",
    help:"Le chirurgien doit venir le faire signer : 10 à 20 min."},
  {key:"marquage", group:"verifs", label:"Marquage du côté absent", type:"range", def:0.03, min:0, max:0.12, step:0.01, unit:"%", source:"hypothèse",
    help:"Chirurgies avec un côté (orthopédie, ophtalmologie, ORL, urologie) : le chirurgien vient marquer, 5 à 15 min."},
  {key:"examens", group:"verifs", label:"Examen manquant (bilan, ECG, groupe et RAI)", type:"range", def:0.03, min:0, max:0.12, step:0.01, unit:"%", source:"hypothèse",
    help:"Prélèvement ou examen en urgence : 30 à 60 min, annulation si le résultat arrive trop tard."},
  {key:"identite", group:"verifs", label:"Discordance d'identité", type:"range", def:0.003, min:0, max:0.02, step:0.001, unit:"%", source:"hypothèse",
    help:"Bracelet, dossier et déclaration du patient ne concordent pas : 10 à 20 min de vérification."},
  {key:"preparation", group:"verifs", label:"Patient non préparé", type:"range", def:0.05, min:0, max:0.2, step:0.01, unit:"%", source:"hypothèse",
    help:"Bijoux, vernis, prothèse dentaire, douche non faite : 5 à 10 min de plus."},
  {key:"patientDebout", group:"patients", label:"Patients debout (ambulatoire)", type:"bool", def:true, source:"hypothèse"},

  // Brancards
  {key:"brancards", group:"brancards", label:"Brancards disponibles", type:"int", def:10, min:3, max:25, source:"hypothèse"},
  {key:"litHosp", group:"brancards", label:"Patients hospitalisés amenés dans leur lit", type:"bool", def:true, source:"hypothèse"},
  {key:"bran", group:"brancards", label:"Brancardiers (jour)", type:"int", def:3, min:1, max:6, source:"hypothèse"},

  // Personnel
  {key:"ash", group:"personnel", label:"Agents de bionettoyage (jour)", type:"int", def:3, min:1, max:6, source:"hypothèse"},
  {key:"sspiStaff", group:"personnel", label:"IDE de SSPI (jour)", type:"int", def:3, min:1, max:6, source:"réglementation",
    help:"Au moins une IDE formée en permanence, au moins deux agents dès six patients."},
  {key:"marExtra", group:"personnel", label:"MAR en plus des MAR de salle", type:"int", def:1, min:0, max:3, source:"hypothèse",
    help:"Chaque MAR de salle couvre au plus deux salles (deux patients). Les MAR en plus font les ALR, les sorties de SSPI et les renforts."},
  {key:"absent", group:"personnel", label:"Absences de dernière minute", type:"range", def:0.03, min:0, max:0.15, step:0.01, unit:"%", source:"hypothèse"},
  {key:"replaceRate", group:"personnel", label:"Absences remplacées", type:"range", def:0.8, min:0, max:1, step:0.05, unit:"%", source:"hypothèse",
    help:"Sans remplaçant, le cadre redéploie une personne : la salle ouvre avec 1 h à 1 h 30 de retard, ou ferme une fois sur deux. Dans les données, les fermetures de plage sont rares."},
  {key:"pauses", group:"personnel", label:"Pauses repas", type:"bool", def:true, source:"hypothèse"},

  // Équipements
  {key:"ampli", group:"equipements", label:"Amplificateurs de brillance", type:"int", def:2, min:1, max:4, source:"hypothèse"},
  {key:"coelio", group:"equipements", label:"Colonnes de coelioscopie", type:"int", def:3, min:1, max:6, source:"hypothèse"},
  {key:"robot", group:"equipements", label:"Robots chirurgicaux", type:"int", def:1, min:0, max:2, source:"données"},
  {key:"echo", group:"equipements", label:"Échographes pour l'ALR", type:"int", def:2, min:1, max:4, source:"hypothèse"},

  // SSPI et aval
  {key:"sspiBeds", group:"sspi", label:"Lits de SSPI", type:"int", def:10, min:4, max:12, source:"hypothèse"},
  {key:"wardBlock", group:"sspi", label:"Patients bloqués faute de lit en service", type:"range", def:0.04, min:0, max:0.2, step:0.01, unit:"%", source:"hypothèse"},
  {key:"reaBeds", group:"sspi", label:"Places de réanimation libres", type:"int", def:2, min:0, max:5, source:"hypothèse"},
  {key:"ucaClose", group:"sspi", label:"Fermeture de l'ambulatoire", type:"time", def:1140, min:1080, max:1260, source:"hypothèse"},

  // Urgences et garde
  {key:"urgCount", group:"urgences", label:"Urgences dans la journée", type:"int", def:-1, min:-1, max:25, source:"données",
    help:"-1 : nombre tiré dans la distribution réelle de ce jour de la semaine."},
  {key:"nightTeams", group:"urgences", label:"Équipes de garde la nuit", type:"int", def:1, min:1, max:2, source:"hypothèse"},
  {key:"astreinteDelay", group:"urgences", label:"Délai de venue de l'astreinte", type:"int", def:25, min:10, max:45, unit:"min", source:"hypothèse"},

  // Stérilisation, matériel et implants
  {key:"boites", group:"steri", label:"Parc de boîtes d'instruments", type:"range", def:1, min:0.5, max:1.5, step:0.1, unit:"x", source:"hypothèse",
    help:"1 = parc habituel par spécialité (14 pour l'ophtalmologie, 8 pour l'orthopédie ou le viscéral, 10 endoscopes...)."},
  {key:"steriDelay", group:"steri", label:"Délai de retour de stérilisation", type:"int", def:240, min:150, max:420, unit:"min", source:"hypothèse",
    help:"Lavage, recomposition, autoclave et retour d'une boîte. Les endoscopes sont désinfectés en 40 min."},
  {key:"boiteNC", group:"steri", label:"Boîtes non conformes à l'ouverture", type:"range", def:0.02, min:0, max:0.08, step:0.005, unit:"%", source:"hypothèse",
    help:"Instrument manquant, emballage abîmé, indicateur non viré : il faut une autre boîte."},
  {key:"autoclavePanne", group:"steri", label:"Risque de panne d'autoclave par jour", type:"range", def:0.01, min:0, max:0.1, step:0.01, unit:"%", source:"hypothèse",
    help:"Les retours de stérilisation prennent 2 h de plus pendant la panne."},
  {key:"implant", group:"steri", label:"Implant ou ancillaire manquant", type:"range", def:0.015, min:0, max:0.06, step:0.005, unit:"%", source:"hypothèse",
    help:"Orthopédie et urologie : livraison en 30 à 90 min, parfois annulation."},
  {key:"dmManquant", group:"steri", label:"Dispositif stérile manquant en salle", type:"range", def:0.03, min:0, max:0.12, step:0.01, unit:"%", source:"hypothèse",
    help:"Agrafeuse, trocart, fil : la circulante va le chercher, 5 à 15 min."},

  // Pendant l'intervention
  {key:"manip", group:"perop", label:"Manipulateurs radio (jour)", type:"int", def:1, min:0, max:3, source:"hypothèse",
    help:"Nécessaires dès qu'on utilise l'amplificateur. La nuit, le manipulateur d'astreinte vient en 20 à 30 min."},
  {key:"intubDiff", group:"perop", label:"Intubations difficiles", type:"range", def:0.02, min:0, max:0.06, step:0.005, unit:"%", source:"hypothèse",
    help:"Anesthésie générale : induction plus longue de 10 à 25 min, chariot d'intubation difficile."},
  {key:"extempo", group:"perop", label:"Examens extemporanés", type:"range", def:1, min:0, max:2, step:0.25, unit:"x", source:"hypothèse",
    help:"1 = fréquence habituelle par spécialité (thyroïde, sein, digestif). Attente de l'anatomopathologiste, 25 à 40 min."},
  {key:"transfusion", group:"perop", label:"Transfusions peropératoires", type:"range", def:1, min:0, max:2, step:0.25, unit:"x", source:"hypothèse",
    help:"1 = fréquence habituelle (grosses chirurgies, hémorragies). Délai de l'EFS réglé ci-dessous."},
  {key:"efsDelay", group:"perop", label:"Délai de livraison des produits sanguins", type:"int", def:40, min:15, max:90, unit:"min", source:"hypothèse"},
  {key:"interne", group:"perop", label:"Interventions avec un interne qui opère", type:"range", def:0.15, min:0, max:0.5, step:0.05, unit:"%", source:"hypothèse",
    help:"Temps opératoire allongé d'environ 20 % (compagnonnage)."},
  {key:"checklist", group:"perop", label:"Check-list HAS en trois temps", type:"bool", def:true, source:"réglementation",
    help:"Avant l'induction, avant l'incision (toute l'équipe, chirurgien présent), avant la sortie (comptage)."},
  {key:"transfertBran", group:"perop", label:"Brancardier pour le transfert en SSPI", type:"bool", def:true, source:"hypothèse",
    help:"Le patient couché part en SSPI avec le brancardier et l'IADE ; sinon la circulante aide."},
  {key:"finProgramme", group:"perop", label:"Bionettoyage de fin de programme", type:"bool", def:true, source:"réglementation",
    help:"Nettoyage approfondi de 30 à 45 min quand la salle termine son programme."},

  // Aléas
  {key:"siPanne", group:"aleas", label:"Risque de panne informatique par jour", type:"range", def:0.02, min:0, max:0.1, step:0.01, unit:"%", source:"hypothèse",
    help:"Passage en mode dégradé (dossiers et traçabilité sur papier) pendant 1 à 4 h : chaque étape prend plus de temps."},
  {key:"roomPanne", group:"aleas", label:"Risque de panne par salle et par jour", type:"range", def:0.01, min:0, max:0.05, step:0.005, unit:"%", source:"hypothèse"},
  {key:"equipPanne", group:"aleas", label:"Risque de panne par équipement et par jour", type:"range", def:0.01, min:0, max:0.05, step:0.005, unit:"%", source:"hypothèse"},
  {key:"complication", group:"aleas", label:"Complications peropératoires", type:"range", def:0.04, min:0, max:0.12, step:0.01, unit:"%", source:"hypothèse"},
  {key:"sspiComplication", group:"aleas", label:"Séjours prolongés en SSPI", type:"range", def:0.10, min:0, max:0.25, step:0.01, unit:"%", source:"hypothèse"}
];

const PARAM_BY_KEY = Object.fromEntries(PARAMS.map(p=>[p.key,p]));

function paramDefaults(){ const o={}; PARAMS.forEach(p=>o[p.key]=p.def); return o; }

/* ramène une valeur dans les bornes réalistes du paramètre */
function clampParam(key, v){
  const p=PARAM_BY_KEY[key]; if(!p) return v;
  if(p.type==="bool") return v===true || v==="true" || v==="oui" || v===1 || v==="1";
  if(p.type==="enum") return p.options.some(o=>o[0]===v) ? v : p.def;
  let x = typeof v==="string" && /^\d{1,2}:\d{2}$/.test(v) ? (+v.slice(0,v.indexOf(":"))*60 + +v.slice(v.indexOf(":")+1)) : Number(v);
  if(!Number.isFinite(x)) return p.def;
  x=Math.max(p.min, Math.min(p.max, x));
  if(p.type==="int" || p.type==="time") x=Math.round(x);
  return x;
}
function formatParam(key, v){
  const p=PARAM_BY_KEY[key]; if(!p) return String(v);
  if(p.type==="bool") return v? "oui":"non";
  if(p.type==="enum") return (p.options.find(o=>o[0]===v)||[v,v])[1];
  if(p.type==="time") return String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0");
  if(p.unit==="%") return Math.round(v*1000)/10+" %";
  if(p.key==="urgCount" && v<0) return "auto (selon le jour)";
  return v+(p.unit && p.unit!=="x" ? " "+p.unit : p.unit==="x" ? " x" : "");
}

// Les réglages marqués « hypothèse » ne sont pas mesurés dans l'export OPROOM : ils sont signalés « à calibrer »
const PARAMS_A_CALIBRER = PARAMS.filter(p=>p.source==="hypothèse");
const SOURCE_TAG = {"hypothèse":["cal","à calibrer"], "données":["data","données réelles"], "réglementation":["reg","réglementation"], "établissement":["data","organisation du bloc"]};
