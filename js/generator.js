/* Blocapta BlocSim - générateur de journées réalistes et ordonnanceur minute par minute

   Principe : chaque personne, chaque poste, chaque brancard, chaque lit et chaque équipement est une
   ressource unique. Une tâche ne démarre que si toutes ses ressources sont libres à cet instant ; sinon
   elle attend, et l'attente est mesurée. Rien n'est réservé dans le futur. Les règles réglementaires
   (MAR : deux patients au plus, une induction à la fois ; SSPI : deux agents dès six patients) sont
   imposées par construction, puis revérifiées à la fin par validateDay(). */

let STATS = null;

const ALL_ROOMS = ["OP 2","OP 3","OP 4","OP 5","OP 6","OP 7","OP 8","OP 9","OP 10","OP 11"];
const JOURS_FR = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
/* Parc de boîtes d'instruments par famille, délai propre (endoscopes : désinfection) et familles concernées */
const BOX_GROUP = {"Ophtalmologie":"ophtalmo","Endoscopie Digestive":"endoscope","Chirurgie Orthopédique":"ortho","Chirurgie Générale et Digestive":"visceral",
  "VISCERAL ROBOT":"robot","UROLOGIE ROBOT":"robot","Chirurgie Urologique":"uro","Gynécologie Obstétrique":"gyneco","Chirurgie ORL":"orl","Stomatologie":"stomato","Cardiologie":"cardio","PMO":"pmo"};
const BOX_PARK = {ophtalmo:14, endoscope:10, ortho:8, visceral:8, robot:3, uro:8, gyneco:8, orl:6, stomato:4, cardio:3, pmo:2, autre:4};
const BOX_LABEL = {ophtalmo:"ophtalmologie", endoscope:"endoscopes", ortho:"orthopédie", visceral:"viscéral", robot:"robot", uro:"urologie", gyneco:"gynécologie", orl:"ORL", stomato:"stomatologie", cardio:"cardiologie", pmo:"prélèvement d'organes", autre:"divers"};
const LATERAL = /Orthop|Ophtalmo|ORL|Urolog/;            // chirurgies avec un côté à marquer
const IMPLANT = /Orthop|Urolog/;                         // implants, prothèses, ancillaires prêtés
const EXTEMPO_P = {"Chirurgie ORL":0.08,"Gynécologie Obstétrique":0.05,"Chirurgie Générale et Digestive":0.05,"VISCERAL ROBOT":0.06,"Chirurgie Urologique":0.03,"UROLOGIE ROBOT":0.04};
const transfuP = (c)=> (c.dur>=240 ? 0.12 : c.dur>=150 ? 0.05 : 0.005) * (/Orthop|Générale|ROBOT|Urolog/.test(c.spec) ? 1 : 0.4);
const PARAM_DEFAULTS = paramDefaults();
const SPEC_SHORT_LABEL = (s)=> (typeof SPEC_SHORT==='function' ? SPEC_SHORT(s) : s);
const SHORT_SPEC = {
  "Chirurgie Orthopédique":"ORTH","Chirurgie Générale et Digestive":"VISC","Chirurgie Urologique":"URO","Chirurgie ORL":"ORL",
  "Gynécologie Obstétrique":"GYN","Endoscopie Digestive":"ENDO","Ophtalmologie":"OPH","Stomatologie":"STOM","Cardiologie":"CARD",
  "Anesthésie":"ANES","VISCERAL ROBOT":"VROB","UROLOGIE ROBOT":"UROB"
};
const AN_LABEL={AG:"Anesthésie générale",ALR:"Anesthésie locorégionale","AL+S":"Anesthésie locale avec sédation",AL:"Anesthésie locale",NR:"Non renseignée"};

/* urgences classées par délai maximal de prise en charge (répartition : hypothèse à calibrer) */
const URG_CLASSES = {
  imm:{label:"Immédiate", delay:15, share:0.08, prep:[0,8], type:"U"},
  h1:{label:"Moins de 1 h", delay:60, share:0.17, prep:[10,25], type:"U"},
  h6:{label:"Moins de 6 h", delay:360, share:0.45, prep:[30,90], type:"U"},
  h24:{label:"Moins de 24 h", delay:1440, share:0.30, prep:[60,240], type:"UD"}
};
const PRIO_TO_CLASS = {vitale:"imm", urgente:"h1", differee:"h24"};
const SAME_DAY_REASONS = {"Patient non à jeun":3,"Fièvre ou infection en cours":2,"Bilan ou examen manquant":2,"Tension artérielle trop élevée":1,"Anticoagulant non arrêté":1,"Refus du patient":1};
const EQUIP_NEED = {
  "Chirurgie Orthopédique":{ampli:0.6}, "Chirurgie Urologique":{ampli:0.3, coelio:0.25},
  "Chirurgie Générale et Digestive":{coelio:0.6}, "Gynécologie Obstétrique":{coelio:0.35},
  "VISCERAL ROBOT":{robot:1}, "UROLOGIE ROBOT":{robot:1}
};
const EQUIP_LABEL = {ampli:"amplificateur de brillance", coelio:"colonne de coelioscopie", robot:"robot", echoPre:"échographe"};

/* ------------------------------------------------------------------ */
/* Tirages                                                             */
/* ------------------------------------------------------------------ */
function gauss(r){ const u=Math.max(1e-9,r()), v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function logn(r,mu,sigma,lo,hi){ return clamp(Math.round(Math.exp(mu+sigma*gauss(r))), lo, hi); }
function pickW(r,obj){ const e=Object.entries(obj); const tot=e.reduce((a,[,w])=>a+w,0); let x=r()*tot; for(const [k,w] of e){ x-=w; if(x<=0) return k; } return e[e.length-1][0]; }
const uni=(r,a,b)=>a+(b-a)*r();
function poisson(r,lambda){ let k=0, p=r(); const L=Math.exp(-lambda); while(p>L && k<200){ k++; p*=r(); } return k; }
const chance=(r,p)=>r()<p;

/* Hypothèses internes du modèle, non mesurables dans l'export OPROOM : affichées « à calibrer » dans le bilan et les rapports */
const MODEL_HYPOTHESES = [
  {label:"Durée de séjour en SSPI", value:"anesthésie générale 55 à 85 min selon la durée de l'acte, locorégionale 45 min, sédation 25 min, locale 12 min ; × 0,8 en ambulatoire ; × 1,5 en cas de complication (l'heure de sortie de SSPI n'est remplie que pour 0,2 % des lignes)"},
  {label:"Découpage des phases en salle", value:"accueil 8 % (4 min au plus), induction 12 % en anesthésie générale (6 à 18 min), installation 10 %, fermeture 10 %, réveil 8 % ; le reste est le temps opératoire"},
  {label:"Classes d'urgence", value:"immédiate 8 % (délai 15 min), moins de 1 h 17 %, moins de 6 h 45 %, moins de 24 h 30 % ; préparation avant le bloc selon la classe"},
  {label:"Régulation du programme", value:"premier cas jamais avant l'heure prévue, avancé de 30 min au plus ensuite ; déprogrammé s'il finirait après 18 h 30 ou n'a pas démarré à 18 h"},
  {label:"Transferts", value:"brancardier : 3 à 6 min (ambulatoire) ou 6 à 11 min (hospitalisé) ; salle vers SSPI par l'IADE en 6 min ; urgence immédiate en 3 min"},
  {label:"Arrivée du chirurgien", value:"20 % des chirurgiens en retard au premier cas (10 à 35 min) ; astreinte en 25 min la nuit ; 5 à 15 min de jour s'il n'est pas au bloc"},
  {label:"Préparation de la salle", value:"2 à 6 min par l'IBODE après le bionettoyage avant le patient suivant (1 à 4 min pour une urgence), calé sur les 12 min réelles entre deux patients"},
  {label:"Bionettoyage", value:"quantiles réels (Fin bio - Sortie salle) avec un plancher de 2 min après un cas court et 4 min après un cas long ; 20 à 30 min après un patient septique (hypothèse)"},
  {label:"Plan blanc", value:"lors d'un afflux d'au moins 3 victimes, rappel de 1 à 2 équipes d'astreinte et d'un MAR, disponibles 30 min après l'alerte"},
];

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */
function dayInfo(dateISO){
  const d=new Date(dateISO+"T12:00:00"); const jour=JOURS_FR[d.getDay()], mois=d.getMonth()+1;
  const W=STATS.calendar.weekday[jour]||{factor:1,urg:[6]};
  const M=STATS.calendar.month[String(mois)]||{factor:1};
  return {jour, mois, weekend: jour==="samedi"||jour==="dimanche", wf:W.factor, mf:M.factor||1, urgDist:W.urg};
}
function autoRooms(dateISO, r){
  const di=dayInfo(dateISO);
  if(di.weekend) return [STATS.urgRoom];
  // nombre de salles autour de la moyenne réelle du jour (réduite les mois creux), puis tirage pondéré par le taux d'ouverture de chaque salle
  const W=STATS.calendar.weekday[di.jour]||{rooms:5.5};
  const target=Math.max(2, W.rooms*Math.min(1, Math.sqrt(di.mf)));
  // la salle d'urgence est toujours ouverte, mais n'a un programme qu'à sa fréquence réelle (planProgram) :
  // on tire les autres salles pour que le nombre moyen de salles avec du programme reste celui du jour
  const pUrg=STATS.rooms[STATS.urgRoom]?.open ?? 1;
  const n=1+clamp(Math.round(target-pUrg+gauss(r)), Math.max(1,Math.round(target-pUrg)-2), Math.round(target-pUrg)+2);
  const pool=ALL_ROOMS.filter(x=>x!==STATS.urgRoom).map(x=>[x, STATS.rooms[x]?.open||0.01]);
  const rooms=[STATS.urgRoom];
  while(rooms.length<n && pool.length){ const tot=pool.reduce((a,[,w])=>a+w,0); let x=r()*tot, i=0; for(;i<pool.length-1;i++){ x-=pool[i][1]; if(x<=0) break; } rooms.push(pool[i][0]); pool.splice(i,1); }
  return ALL_ROOMS.filter(x=>rooms.includes(x));
}
function roomsFor(dateISO, seed){ return autoRooms(dateISO, rng(seedOf(seed,"salles",dateISO))); }
function defaultConfig(){
  return {
    name:"Journée type", seed:42, date:"2026-11-17",
    rooms: roomsFor("2026-11-17", 42),
    urgRoom: STATS.urgRoom, burst:{at:840, n:0}, events:[],
    ...paramDefaults()
  };
}
function normalizeConfig(c){
  const o={...defaultConfig(), ...c};
  PARAMS.forEach(p=>{ o[p.key]=clampParam(p.key, o[p.key]); });
  o.rooms=[...new Set((o.rooms||[]).filter(x=>ALL_ROOMS.includes(x)))];
  if(!ALL_ROOMS.includes(o.urgRoom)) o.urgRoom=STATS.urgRoom;
  if(!o.rooms.includes(o.urgRoom)) o.rooms.push(o.urgRoom);
  o.burst={n:clamp(+(o.burst?.n||0),0,15), at:clamp(+(o.burst?.at??840),0,1439)};
  o.events=(o.events||[]).filter(e=>e && (e.kind==="panne"||e.kind==="urgence"));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(o.date||"")) o.date="2026-11-17";
  o.seed=Math.max(1,Math.round(+o.seed||42));
  return o;
}

const PRESETS = [
  {id:"type", name:"Journée type", text:"Un mardi de novembre ordinaire : programme, urgences, absences et aléas aux niveaux habituels.", apply:c=>c},
  {id:"jeudi", name:"Jeudi chargé", text:"Le jour le plus chargé de la semaine dans les données (environ 130 % d'un jour moyen).",
    apply:c=>({...c, name:"Jeudi chargé", date:"2026-11-19", rooms:roomsFor("2026-11-19", c.seed)})},
  {id:"afflux", name:"Accident collectif", text:"Six victimes vers 14 h, dont plusieurs urgences immédiates, en plus des urgences habituelles.",
    apply:c=>({...c, name:"Accident collectif à 14 h", burst:{at:840,n:6}})},
  {id:"epidemie", name:"Épidémie hivernale", text:"Janvier en pleine épidémie : absences du personnel, annulations, lits d'aval saturés.",
    apply:c=>({...c, name:"Épidémie hivernale", date:"2026-01-20", rooms:roomsFor("2026-01-20", c.seed), periode:"epidemie", absent:0.1, sameDayCancel:0.05, wardBlock:0.12})},
  {id:"aout", name:"Mi-août", text:"Activité réduite de moitié, moins de salles ouvertes, équipes en congés.",
    apply:c=>({...c, name:"Mi-août", date:"2026-08-18", rooms:roomsFor("2026-08-18", c.seed), bran:2, ash:2, sspiStaff:2})},
  {id:"weekend", name:"Dimanche de garde", text:"Pas de programme : seulement les urgences, une équipe de garde et un chirurgien d'astreinte par spécialité.",
    apply:c=>({...c, name:"Dimanche de garde", date:"2026-11-22", rooms:roomsFor("2026-11-22", c.seed)})},
  {id:"panne", name:"Panne de salle", text:"Une salle ouverte tombe en panne de 10 h à 14 h 30, son programme doit attendre.",
    apply:c=>{ const room=c.rooms.find(x=>x!==c.urgRoom)||"OP 3"; return {...c, name:`Panne de la salle ${room}`, events:[{kind:"panne", room, at:600, until:870, label:"Panne de table d'opération"}]}; }},
  {id:"sspi", name:"SSPI sous tension", text:"Cinq lits et deux IDE en SSPI, lits d'aval saturés : les patients attendent en salle et bloquent le programme.",
    apply:c=>({...c, name:"SSPI sous tension", sspiBeds:5, sspiStaff:2, wardBlock:0.12})},
  {id:"effectif", name:"Sous-effectif", text:"Un brancardier, un agent de bionettoyage et 10 % d'absentéisme peu remplacé.",
    apply:c=>({...c, name:"Sous-effectif", bran:1, ash:1, absent:0.1, replaceRate:0.3})},
  {id:"brancards", name:"Pénurie de brancards", text:"Six brancards, et les patients hospitalisés transférés sur brancard au lieu de leur lit.",
    apply:c=>({...c, name:"Pénurie de brancards", brancards:6, litHosp:false})},
  {id:"surcharge", name:"Programme surchargé", text:"Programme rempli à 125 % : retards, débordements et déprogrammations.",
    apply:c=>({...c, name:"Programme surchargé", load:1.25})}
];

/* ------------------------------------------------------------------ */
/* 1. Programme prévisionnel                                           */
/* ------------------------------------------------------------------ */
function patientProfile(r, cfg, spec, adm){
  let mode="couche";
  if(adm==="AMB" && cfg.patientDebout){
    const pDebout = /Ophtalmo/.test(spec)?0.75 : /Endoscopie/.test(spec)?0.6 : /Orthop/.test(spec)?0.25 : 0.4;
    const x=r(); mode = x<pDebout ? "debout" : x<pDebout+0.1 ? "fauteuil" : "couche";
  } else if(adm==="HOSP"){ const x=r(); mode = x<0.05 ? "debout" : x<0.1 ? "fauteuil" : "couche"; }
  const childP = /ORL/.test(spec) ? (cfg.periode==="vacances"?0.4:0.22) : /Stomato|Ophtalmo/.test(spec) ? 0.04 : 0.02;
  const child = adm==="AMB" && chance(r,childP);
  if(child) mode="couche";
  const latex=chance(r,0.015), septic=adm==="HOSP" && chance(r,0.05), bmr=adm==="HOSP" && chance(r,cfg.bmr||0);
  return {mode, child, latex, septic, bmr};
}
function seedOf(...parts){ let h=2166136261; for(const ch of parts.join("|")){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619); } h^=h>>>13; h=Math.imul(h,0x5bd1e995); h^=h>>>15; return ((h>>>0)%2147483646)+1; }
/* Bionettoyage : quantiles réels (Fin bio - Sortie salle), avec un plancher réaliste
   (les durées nulles correspondent à une Fin bio saisie à la sortie) et sans la valeur extrême. */
function bioDur(r, cls){
  const Q=(STATS.bio&&STATS.bio[cls]) || null, floor = cls==="court" ? 2 : 4;
  if(!Q) return cls==="court" ? uni(r,4,9) : uni(r,8,15);
  const x=r()*0.95*(Q.length-1), i=Math.floor(x), v=Q[i]+(Q[i+1]-Q[i])*(x-i);
  return Math.max(floor, v);
}
function planProgram(cfg, r0){
  const di=cfg.__di, planned=[], SS=STATS.session;
  if(di.weekend) return planned;
  const f = clamp(Math.sqrt(di.wf*di.mf),0.8,1.15);     // jeudi plus long, août plus court
  cfg.rooms.forEach(room=>{
    const r=rng(seedOf(cfg.seed,"programme",room));   // un flux par salle : ouvrir une salle de plus ne change pas les autres
    // salle d'urgence : un programme seulement à sa fréquence réelle (environ un jour ouvré sur deux)
    if(room===cfg.urgRoom && rng(seedOf(cfg.seed,"programme-urgence",cfg.date))() >= (STATS.rooms[room]?.open ?? 1)) return;
    const mix = STATS.rooms[room]?.mix || {"Chirurgie Générale et Digestive":1};
    const spec = pickW(r, Object.keys(mix).length? mix : {"Chirurgie Générale et Digestive":1});
    const S = STATS.specs[spec]; if(!S) return;
    const x=r(), mode = room===cfg.urgRoom ? "full" : x<SS.am ? "am" : x<SS.am+SS.pm ? "pm" : "full";
    const start = mode==="pm" ? Math.round(SS.pmStart+gauss(r)*20) : cfg.firstPlanned + Math.round(r()*10);
    const progEnd = start + (1110-start)*0.95*cfg.load*f;
    // temps opéré du jour : tiré de la distribution réelle de la spécialité principale de la salle (une salle de
    // gynécologie fait souvent 1 à 3 cas courts, une salle d'orthopédie remplit sa vacation ; matinées seules comprises),
    // ajusté au jour et au mois, et majoré des cas qui seront annulés avant le jour J
    const booked = S.day ? Math.exp(S.day.mu + S.day.sigma*gauss(r))*cfg.load*f/(1-STATS.cancelRate) : Infinity;
    const roomEnd = room===cfg.urgRoom ? start+(progEnd-start)*0.55 : (mode==="am" && !S.day) ? clamp(SS.amEnd+gauss(r)*40, 600, 780) : progEnd;
    // autres spécialités de la salle (cas secondaires du même jour), à leur part réelle
    const others = Object.fromEntries(Object.entries(mix).filter(([k])=>k!==spec && STATS.specs[k]));
    let bookedSum = 0;
    const ri = ALL_ROOMS.indexOf(room);   // code lié à la salle : même titulaire d'un jour à l'autre, quelles que soient les salles ouvertes
    const chir="CHIR-"+String(10+((ri+1)*7)%60).padStart(2,"0");
    const list=[]; let t=start;
    while(t < roomEnd-10){
      const sp = (list.length>0 && S.mainShare!=null && Object.keys(others).length && r() > S.mainShare) ? pickW(r, others) : spec;
      const S2 = STATS.specs[sp];
      // actes fréquents tirés à leur fréquence ; les actes rares (hors des 14 plus fréquents) suivent
      // la distribution globale de la spécialité, à leur part réelle
      const procs = S2.procs.length? S2.procs : [{name:sp, n:1, mu:S2.mu, sigma:S2.sigma}];
      const covered = procs.reduce((x,q)=>x+q.n,0)/Math.max(1,S2.n||1);
      const pw={}; procs.forEach((p,i)=>pw[i]=p.n);
      const p = (S2.n && r() > covered) ? {name:"Autre acte ("+SPEC_SHORT_LABEL(sp)+")", mu:S2.mu, sigma:S2.sigma} : procs[+pickW(r,pw)];
      const est = Math.round(Math.exp(p.mu));
      const d = logn(r, p.mu, Math.min(p.sigma,0.6), 8, 420);
      if(list.length>0 && (t+est > roomEnd+15 || bookedSum+est/2 > booked)) break;   // on garde le cas qui rapproche le plus du temps visé
      bookedSum += Math.exp(p.mu + Math.min(p.sigma,0.6)**2/2);   // temps opéré attendu : durée moyenne de l'acte (loi log-normale)
      const an=pickW(r,S2.an||{AG:1}), adm= r()<S2.amb?"AMB":"HOSP";
      const need={}; Object.entries(EQUIP_NEED[sp]||{}).forEach(([k,pp])=>{ if(chance(r,pp)) need[k]=1; });
      const alrPre = cfg.alrInPre && /Orthop/.test(sp) && (an==="ALR" || chance(r,0.25));
      list.push({room, spec:sp, proc:p.name, dur:d, est, type:"P", prio:"prog", an, adm, ch:chir, need, alrPre, ...patientProfile(r,cfg,sp,adm)});
      t += est + Math.round(est<40? 4+r()*10 : 6+r()*18);
    }
    // ordre réaliste : allergie au latex puis enfants en premier, patients septiques en dernier
    const rank=c=> c.latex?0 : c.child?1 : (c.septic||c.bmr)?3 : 2;
    list.sort((a,b)=>rank(a)-rank(b));
    let tt=start; list.forEach(c=>{ c.planned=tt; tt += c.est + (c.est<40? 8 : 15); });
    planned.push(...list);
  });
  return planned;
}

/* ------------------------------------------------------------------ */
/* 2. Urgences                                                         */
/* ------------------------------------------------------------------ */
function makeUrgences(cfg, r){
  let k=0;
  const list=[];
  const specs = Object.fromEntries(Object.entries(STATS.urg).map(([k,v])=>[k,v.n]));
  const hours = {}; STATS.urgHours.forEach((n,h)=>{ hours[h]=n+1; });
  const classes = Object.fromEntries(Object.entries(URG_CLASSES).map(([k,v])=>[k,v.share]));
  const mk=(at,spec,cls,durFix)=>{
    const U = STATS.urg[spec] || STATS.urg["Chirurgie Générale et Digestive"];
    const d = durFix || logn(r, U.mu, Math.min(U.sigma,0.55), 15, 300);
    const proc = U.procs.length? U.procs[Math.floor(r()*U.procs.length)] : spec;
    const C=URG_CLASSES[cls]||URG_CLASSES.h1;
    const prep=Math.round(uni(r,C.prep[0],C.prep[1]));
    const need={}; Object.entries(EQUIP_NEED[spec]||{}).forEach(([k,pp])=>{ if(k!=="robot" && chance(r,pp)) need[k]=1; });
    list.push({room:null, spec, proc, dur:d, est:d, arr:at, readyAt:at+prep, cls, deadline:at+C.delay, type:C.type, prio:cls,
      an:pickW(r,U.an||{AG:1}), adm:"HOSP", mode:"couche", child:false, latex:false, septic:chance(r,0.1), need, alrPre:false, rr:rng(seedOf(cfg.seed,"urgence",k++))});
  };
  const di=cfg.__di;
  // réglé à la main : nombre moyen, tiré selon une loi de Poisson ; automatique : distribution réelle de ce jour de la semaine
  let n = cfg.urgCount>=0 ? poisson(r,cfg.urgCount) : di.urgDist[Math.floor(r()*di.urgDist.length)];
  if(cfg.periode==="epidemie") n=Math.round(n*1.1);
  for(let i=0;i<n;i++){ const h=+pickW(r,hours), at=h*60+Math.floor(r()*60); mk(at, pickW(r,specs), pickW(r,classes)); }
  if(cfg.burst && cfg.burst.n>0){
    const trauma={"Chirurgie Orthopédique":5,"Chirurgie Générale et Digestive":3,"Chirurgie Urologique":1};
    for(let i=0;i<cfg.burst.n;i++){
      const cls = i<Math.ceil(cfg.burst.n*0.35)? "imm" : i<Math.ceil(cfg.burst.n*0.7) ? "h1" : "h6";
      mk(cfg.burst.at + Math.floor(r()*25), pickW(r,trauma), cls);
    }
  }
  cfg.events.filter(e=>e.kind==="urgence").forEach(e=>mk(e.at, e.spec, PRIO_TO_CLASS[e.prio]||e.prio||"h1", e.dur||null));
  return list.sort((a,b)=>a.arr-b.arr);
}

/* ------------------------------------------------------------------ */
/* 3. Ressources                                                       */
/* ------------------------------------------------------------------ */
function mkPerson(role, label, shift, extra={}){ return {role, label, shift, iv:[], freeAt:-1e9, breaks:[], absent:false, interim:false, ...extra}; }
const onShift=(p,t)=> t>=p.shift[0] && t<p.shift[1];
const inBreak=(p,t)=> p.breaks.some(([a,b])=>t>=a&&t<b);
/* libre pour une nouvelle tâche (dans son horaire) */
function isFree(p,t){ return !!p && !p.absent && t>=p.freeAt && onShift(p,t) && !inBreak(p,t); }
/* libre pour finir une tâche déjà commencée (heures supplémentaires possibles) */
function isFreeOT(p,t){ return !!p && !p.absent && t>=p.freeAt && t>=p.shift[0] && !inBreak(p,t); }
function occupy(p,a,b,what,caseId){ p.iv.push({a,b,what,caseId}); p.freeAt=Math.max(p.freeAt,b); }

/* ------------------------------------------------------------------ */
/* 4. Ordonnanceur                                                     */
/* ------------------------------------------------------------------ */
// hook (facultatif) : appelé à l'entrée en salle de chaque patient, dans l'ordre chronologique.
// Il renvoie les minutes ajoutées (ou retirées) au temps en salle par un outil numérique ; elles
// s'ajoutent à la phase opératoire. Il ne consomme aucun tirage du moteur : les journées « avec » et
// « sans » outil gardent les mêmes patients, durées, urgences et aléas (nombres aléatoires communs).
function simulate(cfg, planned, urg, r, hook){
  const di=cfg.__di;
  const DAY0=420, DAY1=1170;                  // 7 h - 19 h 30 : équipes de jour, ensuite garde
  const events=[], cancelled=[], done=[];
  const ev=(t,room,txt,kind="info")=>events.push({t:Math.round(t),room,txt,kind});
  const ALL=[];
  const P=(role,label,shift,extra)=>{ const p=mkPerson(role,label,shift,extra); ALL.push(p); return p; };
  const pendingEquip=[];
  const epid = cfg.periode==="epidemie";
  // flux aléatoires indépendants (nombres aléatoires communs) : changer une capacité ne change ni les absences, ni les pannes, ni les patients
  const rStaff=rng(seedOf(cfg.seed,"personnel")), rRoomP=rng(seedOf(cfg.seed,"pannes-salles")), rEq=rng(seedOf(cfg.seed,"pannes-equipements")), rSurg=rng(seedOf(cfg.seed,"chirurgiens"));

  /* --- absences du jour --- */
  const staffDraw=(p)=>{
    const rp=rng(seedOf(cfg.seed,"absence",p.label));   // un tirage par personne : ajouter un brancardier ne change pas les autres absences
    if(!chance(rp, cfg.absent*(epid?1.3:1))) return p;
    if(chance(rp, cfg.replaceRate)){ p.interim=true; p.label+=" (remplaçant)"; return p; }
    p.absent=true; return p;
  };
  const cancelCase=(c,reason)=>{ if(c.status==="annule"||c.status==="ferme"||c.status==="deprog") return; c.status="ferme"; cancelled.push({...c, reason}); };

  /* --- salles, pannes, équipes de jour --- */
  const closures = cfg.events.filter(e=>e.kind==="panne").map(e=>({room:e.room, from:e.at, to:e.until, label:e.label||"Panne"}));
  if(!di.weekend) cfg.rooms.forEach(room=>{ if(chance(rRoomP,cfg.roomPanne)){ const a=Math.round(uni(rRoomP,500,960)); closures.push({room, from:a, to:a+Math.round(uni(rRoomP,60,240)), label:"Panne technique"}); } });
  const closed=(room,t)=>closures.some(z=>z.room===room && t>=z.from && t<z.to);
  const rooms = cfg.rooms.map(n=>({n, q:planned.filter(c=>c.room===n).sort((a,b)=>a.planned-b.planned), phase:"idle", cur:null, until:0, waits:[], open:true, called:[]}));
  const byName=Object.fromEntries(rooms.map(R=>[R.n,R]));
  rooms.forEach(R=>{
    const tag=R.n.replace("OP ","OP");
    R.team={ iade:staffDraw(P("IADE","IADE "+tag,[DAY0,DAY1+90])), ibode:staffDraw(P("IBODE","IBODE "+tag,[DAY0,DAY1+90])), circ:staffDraw(P("CIRC","CIRC "+tag,[DAY0,DAY1+90])) };
    R.idleSince = R.q.length ? R.q[0].planned : null;
    const missing=Object.values(R.team).filter(p=>p.absent);
    if(missing.length && !di.weekend && R.q.length){
      const who=missing.map(p=>p.role).join(" et ");
      if(missing.length===1 && chance(rStaff,0.5)){
        // redéploiement par le cadre : la salle ouvre en retard avec une personne venue d'un autre secteur
        const late=Math.round(uni(rStaff,60,90)); missing[0].absent=false; missing[0].interim=true; missing[0].label+=" (redéployé)"; missing[0].shift=[DAY0+late, missing[0].shift[1]];
        closures.push({room:R.n, from:0, to:(R.q[0]?.planned||480)+late-20, label:"Ouverture retardée : "+who+" absent, redéploiement"});
        ev((R.q[0]?.planned||480), R.n, `Ouverture retardée d'environ ${late} min : ${who} absent, remplacé par redéploiement`, "late");
      } else {
        R.open=false;
        R.q.forEach(c=>cancelCase(c, `Salle fermée : ${who} absent, non remplacé`));
        ev(DAY0+30, R.n, `Salle fermée pour la journée : ${who} absent, non remplacé`, "u");
        R.q=[];
      }
    }
  });
  /* --- MAR : un MAR de salle pour deux salles au plus (règle des deux patients) --- */
  const dayMars=[];
  const openRooms=rooms.filter(R=>R.open);
  for(let i=0;i<openRooms.length;i+=2){
    const pair=openRooms.slice(i,i+2);
    let m=staffDraw(P("MAR","MAR-"+String(dayMars.length+1).padStart(2,"0"),[DAY0+30,DAY1]));
    dayMars.push(m);
    if(m.absent){
      // MAR absent non remplacé : la salle la moins chargée de la paire ferme
      const victim = pair.length>1 ? pair.reduce((a,b)=>a.q.length<=b.q.length?a:b) : pair[0];
      if(!di.weekend){ victim.q.forEach(c=>cancelCase(c,"Salle fermée : MAR absent, non remplacé")); if(victim.q.length) ev(DAY0+30, victim.n, "Salle fermée : MAR absent, non remplacé", "u"); victim.q=[]; victim.open=false; }
      const sub=P("MAR","MAR-"+String(dayMars.length).padStart(2,"0")+" (renfort)",[DAY0+30,DAY1]);
      dayMars.push(sub); pair.forEach(x=>x.mar=sub);
    } else pair.forEach(x=>x.mar=m);
  }
  const extraMars=[]; for(let i=0;i<cfg.marExtra;i++){ const m=staffDraw(P("MAR","MAR-R"+(i+1),[DAY0+30,DAY1])); if(!m.absent) extraMars.push(m); }
  const gShift = [0, 1440+DAY0];
  const gardeMar=P("MAR","MAR-garde",gShift);
  const gardeTeams=Array.from({length:cfg.nightTeams},(_,i)=>({ iade:P("IADE","IADE garde "+(i+1),gShift), ibode:P("IBODE","IBODE garde "+(i+1),gShift), circ:P("CIRC","CIRC garde "+(i+1),gShift) }));
  // Afflux de victimes : rappel des astreintes (plan blanc), équipes complètes et un MAR, disponibles 30 min après l'alerte
  const recallMar=[];
  if(cfg.burst && cfg.burst.n>=3){
    const extra=Math.min(2, Math.ceil((cfg.burst.n-2)/3)), a0=cfg.burst.at+30, rs=[a0, Math.min(a0+720, 1440+DAY0)];
    for(let i=0;i<extra;i++){ const k=gardeTeams.length+1; gardeTeams.push({ iade:P("IADE",`IADE astreinte ${k} (rappelé)`,rs), ibode:P("IBODE",`IBODE astreinte ${k} (rappelé)`,rs), circ:P("CIRC",`CIRC astreinte ${k} (rappelé)`,rs) }); }
    recallMar.push(P("MAR","MAR-astreinte (rappelé)",rs));
    ev(cfg.burst.at, "BLOC", `Afflux de ${cfg.burst.n} victimes : plan blanc, rappel de ${extra} équipe${extra>1?"s":""} d'astreinte et d'un MAR`, "u");
  }
  const marForTeam=k=> k<2 || !recallMar.length ? gardeMar : recallMar[0];
  const nightRooms=[cfg.urgRoom, ...cfg.rooms.filter(x=>x!==cfg.urgRoom), "OP 6", "OP 7", "OP 9", "OP 10"].filter((x,i,a)=>a.indexOf(x)===i).slice(0,gardeTeams.length);
  nightRooms.forEach(n=>{ if(!byName[n]){ const R={n, q:[], phase:"idle", cur:null, until:0, waits:[], open:false, called:[], nightOnly:true}; rooms.push(R); byName[n]=R; } });
  const isNight=t=> di.weekend || t>=DAY1 || t<DAY0;

  /* --- pools --- */
  const breakFor=(arr)=>{ if(!cfg.pauses) return; arr.forEach((p,i)=>{ const a=690+((i*37)%150); p.breaks.push([a,a+30]); }); };
  const mkPool=(n,role,lab,shift)=>Array.from({length:n},(_,i)=>staffDraw(P(role,`${lab} ${i+1}`,shift)));
  const wk = di.weekend;
  const brans=[...mkPool(wk?Math.min(2,cfg.bran):cfg.bran,"BRAN","BRA",[DAY0,1260]), P("BRAN","BRA nuit",[1260,1440+DAY0]), P("BRAN","BRA nuit (fin)",[0,DAY0])];
  const ashs=[...mkPool(wk?1:cfg.ash,"ASH","ASH",[DAY0,1260]), P("ASH","ASH nuit",[1260,1440+DAY0]), P("ASH","ASH nuit (fin)",[0,DAY0])];
  const sspiDay=mkPool(wk?Math.min(2,cfg.sspiStaff):cfg.sspiStaff,"IDESSPI","IDE SSPI",[DAY0,1290]);
  const sspiIde=[...sspiDay, P("IDESSPI","IDE SSPI nuit",[1290,1440+DAY0]), P("IDESSPI","IDE SSPI nuit (fin)",[0,DAY0])];
  const preNurses=mkPool(cfg.preNurses,"IDEPRE","IDE accueil",[DAY0-30,1110]);
  // jamais de pool vide : une personne est rappelée ou redéployée
  const recall=(pool,lab)=>{ const day=pool.filter(p=>p.shift[0]<=DAY0+60 && p.shift[1]>DAY1-200); if(day.length && day.every(p=>p.absent)){ day[0].absent=false; day[0].interim=true; day[0].label+=" (rappelé)"; ev(DAY0, "BLOC", `${lab} absent : une personne est rappelée`, "late"); } };
  recall(brans,"Brancardiers"); recall(ashs,"Agents de bionettoyage"); recall(sspiDay,"IDE de SSPI"); recall(preNurses,"IDE d'accueil");
  [brans.slice(0,-2), ashs.slice(0,-2), preNurses].forEach(breakFor);
  // SSPI : la pause n'est prise que si l'effectif restant respecte D6124-101, sinon elle est décalée (au plus tard 15 h)
  sspiDay.forEach((p,i)=>{ p.breakFrom=690+((i*37)%150); p.breakDone=!cfg.pauses; });
  const free1=(pool,t)=>pool.find(p=>isFree(p,t));
  const urgSurgeons={};
  const surgeonFor=(c,t)=>{
    const key=(isNight(t)?"A-":"U-")+(SHORT_SPEC[c.spec]||"CHIR");
    if(!urgSurgeons[key]) urgSurgeons[key]=P("CHIR","CHIR-"+key,[0,3000],{onsiteUntil:-1e9});
    return urgSurgeons[key];
  };
  /* chirurgiens programmés : un par salle, retard possible au premier cas ; double salle en option */
  const progSurgeons={};
  const openList=rooms.filter(R=>R.open && R.q.length);
  openList.forEach((R,i)=>{
    const c0=R.q[0]; let id=c0.ch;
    if(cfg.doubleSalle>0 && i>0){ const prev=openList[i-1]; if(!prev.double && prev.q[0]?.spec===c0.spec && chance(rSurg,Math.min(1,cfg.doubleSalle*3))){ id=prev.q[0].ch; R.double=true; prev.double=true; } }
    if(!progSurgeons[id]){ const late=chance(rSurg,0.2); progSurgeons[id]=P("CHIR",id,[0,3000]); progSurgeons[id].freeAt = c0.planned + 10 + (late? uni(rSurg,10,35) : uni(rSurg,-10,5)); if(late) progSurgeons[id].late=true; }
    R.q.forEach(c=>{ c.ch=id; c.chirP=progSurgeons[id]; });
  });

  /* --- brancards, postes, lits, équipements --- */
  let brancardsFree=cfg.brancards; const brancardLog=[];
  const takeBrancard=(t)=>{ if(brancardsFree<=0) return false; brancardsFree--; brancardLog.push([t,1]); return true; };
  const returnBrancardAt=[];
  const seats=Array(cfg.preSeats).fill(null), pbeds=Array(cfg.preBeds).fill(null);
  const sas={}; ALL_ROOMS.forEach(n=>sas[n]=Array(cfg.preSas? cfg.sasPlaces : 0).fill(null));   // salle de pré-anesthésie de chaque salle
  const beds=Array(cfg.sspiBeds).fill(null);
  const equip={ampli:cfg.ampli, coelio:cfg.coelio, robot:cfg.robot, echoPre:cfg.echo};
  const equipDown=[];
  if(!di.weekend) Object.entries(equip).forEach(([k,n])=>{ for(let i=0;i<n;i++) if(chance(rEq,cfg.equipPanne)){ const a=Math.round(uni(rEq,480,1000)); equipDown.push({k,a,b:a+Math.round(uni(rEq,60,240))}); } });
  const equipUsed={ampli:0,coelio:0,robot:0,echoPre:0};
  const equipAvail=(k,t)=> equip[k] - equipUsed[k] - equipDown.filter(z=>z.k===k && t>=z.a && t<z.b).length;
  equipDown.forEach(z=>ev(z.a,"BLOC",`Panne : ${EQUIP_LABEL[z.k]} indisponible jusqu'à ${fmt(z.b)}`,"u"));

  /* --- stérilisation : boîtes d'instruments --- */
  const rSteri=rng(seedOf(cfg.seed,"sterilisation")), rSI=rng(seedOf(cfg.seed,"informatique"));
  const autoclave = !di.weekend && chance(rSteri,cfg.autoclavePanne) ? (()=>{ const a=Math.round(uni(rSteri,540,900)); return {a, b:a+Math.round(uni(rSteri,120,240))}; })() : null;
  if(autoclave) ev(autoclave.a,"BLOC",`Panne d'autoclave en stérilisation jusqu'à ${fmt(autoclave.b)} : retours de boîtes retardés de 2 h`,"u");
  const boxes={}; Object.entries(BOX_PARK).forEach(([g,n])=>boxes[g]={n:Math.max(1,Math.round(n*cfg.boites)), used:0, back:[]});
  const boxGroup=c=>BOX_GROUP[c.spec] || (c.spec==="Anesthésie" ? null : "autre");
  const boxAvail=(g,t)=>{ const B=boxes[g]; B.back=B.back.filter(x=>x>t); return B.n-B.used-B.back.length; };
  const boxReturn=(g,t)=>{ const d = g==="endoscope" ? 40 : cfg.steriDelay; let back=t+d; if(autoclave && back>autoclave.a && t<autoclave.b) back+=120; boxes[g].back.push(back); };
  /* --- panne informatique : mode dégradé --- */
  const siWin = chance(rSI,cfg.siPanne) ? (()=>{ const a=Math.round(uni(rSI, di.weekend?0:450, 1020)); return {a, b:a+Math.round(uni(rSI,60,240))}; })() : null;
  const degrade=t=> siWin && t>=siWin.a && t<siWin.b;
  if(siWin){ ev(siWin.a,"BLOC","Panne informatique : passage en mode dégradé (dossiers et traçabilité sur papier)","u"); ev(siWin.b,"BLOC","Fin de la panne informatique, ressaisie des données","info"); }
  /* --- manipulateurs radio, anatomopathologiste, chariot d'intubation difficile --- */
  const manips=[...Array.from({length:wk?0:cfg.manip},(_,i)=>staffDraw(P("MANIP",`MANIP ${i+1}`,[DAY0+30,1110]))), P("MANIP","MANIP astreinte",[0,3000],{onsiteUntil:-1e9, astreinte:true})];
  const anapath = wk ? null : P("ANAPATH","Anatomopathologiste",[480,1080]);
  let intubCartFree=0;

  /* --- patients programmés : arrivée, absents, retards --- */
  planned.forEach((c,i)=>{
    c.uid="P"+i; if(c.status!=="ferme") c.status="attendu"; c.waits=[];
    const conv = c.adm==="AMB" ? c.planned-75 : c.planned-60;
    c.noShow = chance(c.rr,cfg.noShow);
    c.late = chance(c.rr,cfg.latePatient) ? Math.round(clamp(cfg.lateMean*(0.4+c.rr()*1.4),5,120)) : 0;
    c.availAt = conv + c.late + (c.adm==="AMB" ? Math.round(uni(c.rr,-10,10)) : 0);
    c.dossier = chance(c.rr,cfg.dossierIncomplet);
    c.sdCancel = chance(c.rr, cfg.sameDayCancel*(epid?1.6:1));
    // vérifications avant l'anesthésie : tirées pour tous les patients (même nombre de tirages, quelle que soit la configuration)
    const U=Array.from({length:16},()=>c.rr());
    c.vpa = c.adm==="AMB" && U[0]<cfg.vpaJour;
    c.jeune = U[1]<cfg.jeune; c.anticoag = U[2]<cfg.anticoag; c.consent = U[3]<cfg.consentement;
    c.marq = LATERAL.test(c.spec) && U[4]<cfg.marquage; c.exam = U[5]<cfg.examens; c.ident = U[6]<cfg.identite; c.prep = U[7]<cfg.preparation;
    c.implantMiss = IMPLANT.test(c.spec) && U[8]<cfg.implant; c.interne = U[9]<cfg.interne;
    c.U2=[U[10],U[11]]; c.Ud=U.slice(12);
    if(c.noShow && c.status==="attendu") ev(c.planned-30, c.room, `Patient absent : ${c.proc} (prévu à ${fmt(c.planned)})`, "late");
    if(c.late>=15 && c.status==="attendu" && !c.noShow) ev(c.availAt, c.room, `Patient arrivé avec ${c.late} min de retard : ${c.proc}`, "late");
  });
  urg.forEach((c,i)=>{ c.uid="U"+i; c.status="attente"; c.waits=[]; c.interne = c.rr()<cfg.interne*0.5; });

  /* --- SSPI --- */
  const sspiOcc=()=>beds.filter(Boolean).length;
  // à la relève, une IDE de SSPI ne part pas en laissant la salle sous l'effectif réglementaire
  // (deux agents dès six patients) : elle reste en heures supplémentaires tant que c'est nécessaire
  const sspiStaffAt=t=>{
    const on=sspiIde.filter(p=>!p.absent && onShift(p,t) && !inBreak(p,t));
    const o=sspiOcc(), need = o>=6 ? 2 : o>0 ? 1 : 0;
    if(on.length>=need) return on.length;
    const ot=sspiIde.filter(p=>!p.absent && !on.includes(p) && t>=p.shift[1] && t<p.shift[1]+240 && !inBreak(p,t)).slice(0, need-on.length);
    ot.forEach(p=>{ p.otSSPI=Math.max(p.otSSPI||0, t); });
    return on.length+ot.length;
  };
  const sspiCanTake=t=>{ const o=sspiOcc(), s=sspiStaffAt(t); if(o>=beds.length || s<1) return false; if(o+1>=6 && s<2) return false; return true; };
  const sspiLog=[];
  let reaUsed=0;

  /* --- outils --- */
  const wait=(c,kind,t)=>{ const w=c.waits[c.waits.length-1]; if(w && w.kind===kind && w.b===t) w.b=t+1; else c.waits.push({kind,a:t,b:t+1}); };
  const phases=(c)=>{ const d=c.dur, an=c.an2; const f=(lo,hi,x)=>clamp(x,lo,hi);
    let acc=Math.min(4,d*0.08), ind= an==="AG"? f(6,18,d*0.12) : an==="ALR"? (c.alrDone?2:f(5,14,d*0.12)) : an==="AL+S"? f(2,6,d*0.07) : 1.5;
    let ins=f(2,15,d*0.1), fer=f(2,15,d*0.1), rev= an==="AG"? f(4,12,d*0.08) : an==="ALR"?3 : an==="AL+S"?2 : 1;
    let other=acc+ind+ins+fer+rev; const mx=d*0.6; if(other>mx){ const k=mx/other; acc*=k; ind*=k; ins*=k; fer*=k; rev*=k; other=mx; }
    const R=x=>Math.max(1,Math.round(x));
    return {acc:R(acc), ind:R(ind), ins:R(ins), chir:Math.max(3,Math.round(d-other)), fer:R(fer), rev:R(rev)}; };

  /* --- pré-anesthésie --- */
  const prePatients=[];
  const preSlot=(mode)=>{ const arr = mode==="couche" ? pbeds : (seats.length? seats : pbeds); const i=arr.indexOf(null); return i<0? null : {arr, i, kind: arr===pbeds?"couche":"assis"}; };
  const freePre=(c)=>{ if(!c.preSlot) return; const arr=c.preSlot.kind==="sas"? sas[c.preSlot.room] : c.preSlot.kind==="couche"?pbeds:seats; if(arr && arr[c.preSlot.i]===c.uid) arr[c.preSlot.i]=null; };
  const callPatient=(R,c,t)=>{
    let slot=null;
    if(cfg.preSas){ const i=sas[R.n].indexOf(null); if(i>=0) slot={arr:sas[R.n], i, kind:"sas"}; }
    if(!slot) slot=preSlot(c.mode);
    if(!slot){ wait(c,"poste de pré-anesthésie",t); return false; }
    const b=free1(brans,t); if(!b){ wait(c,"brancardier",t); return false; }
    const needBr = c.mode==="couche" && !(c.adm==="HOSP" && cfg.litHosp);
    if(needBr && !takeBrancard(t)){ wait(c,"brancard",t); return false; }
    c.brancard=needBr;
    const travel = (c.adm==="AMB"? uni(c.rr,3,6) : uni(c.rr,6,11)) * (b.interim?1.2:1);
    occupy(b, t, t+travel*(c.mode==="couche"?1:0.6), "transport vers le bloc", c.uid);
    slot.arr[slot.i]=c.uid; c.preSlot={kind:slot.kind, i:slot.i, room:R.n};
    c.called=t; c.preIn=Math.round(t+travel); c.status="transit"; c.transportBy=b.label;
    R.called.push(c); prePatients.push(c);
    return true;
  };

  /* --- choix d'une urgence pour une salle libre --- */
  const waitingUrg=[]; let ui=0;
  const pickUrg=(R,t,night)=>{
    const ready=waitingUrg.filter(c=>c.readyAt<=t);
    if(!ready.length) return null;
    ready.sort((a,b)=>a.deadline-b.deadline);
    const isU = R.n===cfg.urgRoom || night;
    const progReady = R.called.some(c=>c.status==="pret");
    for(const c of ready){
      if(c.cls==="imm") return c;
      if(c.cls==="h1" && (isU || t-c.readyAt>=20 || !progReady)) return c;
      if(c.cls==="h6" && (isU || c.deadline-t < c.est+60 || (!progReady && !R.q.length))) return c;
      // une urgence « moins de 24 h » n'est pas démarrée si elle ne peut plus finir (salle, SSPI, bionettoyage)
      // avant la fin de la journée simulée : elle est reportée, comme le ferait la régulation
      if(c.cls==="h24" && t+c.est+180<=END && (isU ? !ready.some(x=>x.cls!=="h24") : !R.q.length)) return c;
    }
    return null;
  };

  const startCase=(R,c,t,team,mar,tr)=>{
    c.room=R.n; c.team=team; c.mar=mar; c.an2=inferAn({...c}).an;
    c.ph=phases(c);
    if(c.type!=="P"){
      c.chirP=surgeonFor(c,t); c.ch=c.chirP.label;
      const s=c.chirP; if(t>s.onsiteUntil){ const delay = isNight(t) ? cfg.astreinteDelay+uni(c.rr,-6,10) : uni(c.rr,5,15); s.freeAt=Math.max(s.freeAt, t+delay); c.surgeonCalled=Math.round(delay); }
    }
    c.complic=chance(c.rr,cfg.complication); if(c.complic) c.ph.chir += Math.round(uni(c.rr,20,60));
    // tirages peropératoires (toujours le même nombre)
    const V=Array.from({length:12},()=>c.rr());
    // Les durées réelles (export OPROOM) contiennent déjà, en moyenne, la check-list, les internes, les extemporanés,
    // les transfusions, le matériel manquant et les intubations difficiles aux fréquences habituelles : on retire cette
    // part moyenne, puis on ajoute ce qui arrive vraiment à ce patient. Aux réglages par défaut, la moyenne reste la réelle.
    const D0=PARAM_DEFAULTS;
    const eChir = (c.type==="P" ? c.ph.chir*(1-1/(1+0.2*D0.interne)) : 0) + (EXTEMPO_P[c.spec]||0)*D0.extempo*32 + transfuP(c)*D0.transfusion*0.5*D0.efsDelay + D0.dmManquant*10;
    c.ph.chir=Math.max(3, Math.round(c.ph.chir - eChir));
    if(c.an2==="AG") c.ph.ind=Math.max(2, Math.round(c.ph.ind - D0.intubDiff*17.5));
    if(!cfg.checklist){ c.ph.acc=Math.max(1,c.ph.acc-1); c.ph.chir=Math.max(3,c.ph.chir-2); c.ph.fer=Math.max(1,c.ph.fer-2); }   // la check-list fait partie des durées réelles
    else if(V[0]<0.003){ c.ph.fer+=Math.round(10+10*V[1]); c.comptage=true; }
    if(c.interne && c.type==="P") c.ph.chir=Math.round(c.ph.chir*1.2);
    if(degrade(t)){ c.ph.acc+=3; c.ph.ins+=2; c.ph.fer+=3; c.degrade=true; }
    c.intub = c.an2==="AG" && V[2]<cfg.intubDiff; if(c.intub) c.ph.ind+=Math.round(10+15*V[3]);
    c.dmMiss = V[4]<cfg.dmManquant; c.boxNC = V[5]<cfg.boiteNC;
    c.extempo = anapath && V[6] < (EXTEMPO_P[c.spec]||0)*cfg.extempo;
    c.transfu = V[7] < Math.min(0.9, (transfuP(c) + (c.complic?0.3:0))*cfg.transfusion);
    c.Vd=V.slice(8);
    if(team.ibode.interim){ c.ph.ins=Math.round(c.ph.ins*1.2); c.ph.fer=Math.round(c.ph.fer*1.15); }
    if(team.iade.interim) c.ph.ind=Math.round(c.ph.ind*1.15);
    if(hook){
      const v={room:R.n, spec:c.spec, proc:c.proc, type:c.type, dur:c.dur, s:t+tr, ch:c.ch, mar:mar? mar.label : "MAR-garde"};
      const extra=Math.round(hook(v, t+tr)||0);
      c.tool=v.tool||null; c.toolMin=extra;
      if(extra) c.ph.chir=Math.max(3, c.ph.chir+extra);
    }
    c.status="salle"; R.cur=c;
    if(c.type==="P"){
      freePre(c); R.called=R.called.filter(x=>x!==c); R.q=R.q.filter(x=>x!==c);
      occupy(team.circ, t, t+tr, "va chercher le patient", c.uid);
      if(R.idleSince!=null){ const a=Math.max(R.idleSince, c.planned); if(t-a>=3) R.waits.push({kind:"patient", a, b:t}); }
    }
    R.idleSince=null;
    c.s=t+tr; c.phT=[c.s]; R.phase="entry"; R.until=c.s+c.ph.acc; c.equip=[];
    done.push(c);
  };

  const cancelInRoom=(R,c,t,reason)=>{
    const i=done.indexOf(c); if(i>=0) done.splice(i,1);
    c.status="annule"; cancelled.push({...c, reason:"Annulé le jour même : "+reason});
    if(c.brancard){ returnBrancardAt.push(t+10); c.brancard=false; }
    R.cur=null; R.phase="idle"; R.idleSince=t;
  };
  const advanceRoom=(R,t)=>{
    if(R.phase==="endClean"){ if(t>=R.until) R.phase="idle"; return; }
    const c=R.cur; if(!c) return;
    const T=c.team, M=c.mar;
    switch(R.phase){
      case "entry": if(t>=R.until) R.phase="needMar"; break;
      case "needMar":
        // matériel contrôlé avec l'IBODE avant l'induction (sign-in) : implant ou ancillaire manquant
        if(c.implantMiss && c.implantAt==null){
          if(c.U2[0]<0.25){ ev(t,R.n,`Implant ou ancillaire indisponible : ${c.proc} annulé avant l'induction`,"late"); cancelInRoom(R,c,t,"Implant ou ancillaire indisponible"); break; }
          c.implantAt=t+Math.round(30+60*c.U2[1]); ev(t,R.n,`Implant ou ancillaire manquant pour ${c.proc} : livraison attendue à ${fmt(c.implantAt)}`,"late");
        }
        if(c.implantAt!=null && t<c.implantAt){ wait(c,"implant ou ancillaire",t); break; }
        if(c.an2==="AL" || (c.alrDone && c.an2==="ALR")){ c.phT[1]=t; R.phase="induc"; R.until=t+c.ph.ind; break; }
        if(c.intub && t<intubCartFree){ wait(c,"chariot d'intubation difficile",t); break; }
        if(isFreeOT(M,t)){ occupy(M,t,t+c.ph.ind,"induction",c.uid); c.marInd=[t,t+c.ph.ind]; c.phT[1]=t; R.phase="induc"; R.until=t+c.ph.ind;
          if(c.intub){ intubCartFree=t+c.ph.ind; ev(t,R.n,`Intubation difficile : ${M.label} mobilisé ${c.ph.ind} min, chariot d'intubation difficile`,"late"); } }
        else wait(c,"MAR pour l'induction",t);
        break;
      case "induc": if(t>=R.until) R.phase="needEquip"; break;
      case "needEquip": {
        const g=boxGroup(c);
        if(g && !c.box){
          if(boxAvail(g,t)<=0){ wait(c,"boîte d'instruments",t); break; }
          boxes[g].used++; c.box=g;
          if(c.boxNC){ // boîte non conforme à l'ouverture : retour en stérilisation, une autre boîte
            boxes[g].used--; boxReturn(g,t); c.box=null; c.boxNC=false; c.boxRefused=true; c.boxDelay=t+Math.round(8+8*c.Vd[0]);
            ev(t,R.n,`Boîte d'instruments non conforme (${BOX_LABEL[g]}) : renvoyée en stérilisation, une autre est demandée`,"late"); wait(c,"boîte d'instruments",t); break; }
        }
        if(c.boxDelay && t<c.boxDelay){ wait(c,"boîte d'instruments",t); break; }
        if(/ROBOT/.test(c.spec) && T.ibode.interim && !c.robotSwap){ c.robotSwap=t+Math.round(15+15*c.Vd[1]); ev(t,R.n,`IBODE remplaçante non habilitée au robot : échange avec une IBODE habilitée`,"late"); }
        if(c.robotSwap && t<c.robotSwap){ wait(c,"IBODE habilitée robot",t); break; }
        const ks=Object.keys(c.need||{}).filter(k=>k!=="echoPre");
        if(ks.every(k=>equipAvail(k,t)>0)){ ks.forEach(k=>equipUsed[k]++); c.equip=ks; c.phT[2]=t; R.phase="install"; R.until=t+c.ph.ins; }
        else wait(c,"équipement",t);
        break; }
      case "install": if(t>=R.until) R.phase="needChir"; break;
      case "needChir": {
        let S=c.chirP;
        if(c.type!=="P" && !isFreeOT(S,t) && (c.cls==="imm"||c.cls==="h1") && !isNight(t)){
          const alt=Object.values(progSurgeons).find(x=>isFreeOT(x,t) && done.concat(planned).some(k=>k.chirP===x && k.spec===c.spec));
          if(alt){ c.chirP=alt; c.ch=alt.label; S=alt; c.relais=true; }
        }
        // plan blanc : un chirurgien de renfort par spécialité est rappelé, présent 30 min après l'alerte
        if(c.type!=="P" && !isFreeOT(S,t) && cfg.burst && cfg.burst.n>=3 && t>=cfg.burst.at+30 && t<cfg.burst.at+720){
          const key="R-"+(SHORT_SPEC[c.spec]||"CHIR");
          if(!urgSurgeons[key]){ urgSurgeons[key]=P("CHIR",`CHIR-${SHORT_SPEC[c.spec]||"CHIR"} renfort (rappelé)`,[cfg.burst.at+30,3000],{onsiteUntil:3000}); ev(t,R.n,`Plan blanc : chirurgien de renfort rappelé (${SPEC_SHORT_LABEL(c.spec)})`,"u"); }
          const alt=urgSurgeons[key]; if(isFreeOT(alt,t)){ c.chirP=alt; c.ch=alt.label; S=alt; c.relais=true; }
        }
        if(isFreeOT(S,t)){ const core = R.double ? c.ph.chir : c.ph.chir+c.ph.fer; occupy(S,t,t+core,"opère",c.uid); c.chirIn=[t,t+core]; S.onsiteUntil=t+core+120; c.phT[3]=t; R.phase="chir"; R.until=t+c.ph.chir;
          // interruptions pendant l'intervention, placées dans le temps opératoire
          const d=c.ph.chir, v=c.Vd; c.inter=[];
          if(c.equip.includes("ampli")) c.inter.push({kind:"radio", at:t+Math.round(d*(0.4+0.3*v[2]))});
          if(c.extempo) c.inter.push({kind:"extempo", at:t+Math.round(d*(0.45+0.2*v[3])), dur:Math.round(25+15*v[3])});
          if(c.transfu) c.inter.push({kind:"transfu", at:t+Math.round(d*(0.3+0.4*v[1]))});
          if(c.dmMiss) c.inter.push({kind:"dm", at:t+Math.round(d*(0.1+0.6*v[0])), dur:Math.round(5+10*v[2])});
        }
        else wait(c,"chirurgien",t);
        break; }
      case "chir": {
        const S=c.chirP, ext=(n)=>{ R.until+=n; const a=c.chirIn[1]; c.chirIn[1]+=n; occupy(S,a,c.chirIn[1],"opère",c.uid); };
        for(const it of (c.inter||[])){
          if(it.done || t<it.at) continue;
          if(it.kind==="radio"){
            const dayM=manips.filter(x=>!x.astreinte && !x.absent && onShift(x,t)), a=manips[manips.length-1];
            let m=null;
            if(dayM.length){ m=dayM.find(x=>isFree(x,t)); if(!m){ wait(c,"manipulateur radio",t); ext(1); break; } }
            else {
              if(t>a.onsiteUntil && !it.called){ a.freeAt=Math.max(a.freeAt, t+Math.round(20+10*c.Vd[3])); it.called=true; ev(t,R.n,"Manipulateur radio d'astreinte appelé","info"); }
              if(isFreeOT(a,t)) m=a; else { wait(c,"manipulateur radio",t); ext(1); break; }
            }
            const dd=Math.round(8+7*c.Vd[0]); occupy(m,t,t+dd,"scopie peropératoire",c.uid); if(m.astreinte) m.onsiteUntil=t+dd+90; c.radio=[t,t+dd,m.label]; it.done=true;
          } else if(it.kind==="extempo"){
            if(!isFreeOT(anapath,t)){ wait(c,"examen extemporané",t); ext(1); break; }
            occupy(anapath,t,t+15,"examen extemporané",c.uid); c.waits.push({kind:"examen extemporané", a:t, b:t+it.dur}); ext(it.dur); it.done=true; c.extempoAt=[t,t+it.dur];
            ev(t,R.n,`Examen extemporané : l'équipe attend le résultat (${it.dur} min)`,"op");
          } else if(it.kind==="transfu"){
            const w = c.complic ? Math.round(15+5*c.Vd[1]) : Math.round(cfg.efsDelay*(0.8+0.4*c.Vd[1]));
            c.waits.push({kind:"produits sanguins", a:t, b:t+w}); ext(Math.round(w*0.5)); it.done=true; c.transfuAt=[t,t+w];
            ev(t,R.n,`Commande de produits sanguins à l'EFS : livraison dans ${w} min${c.complic?" (urgence vitale)":""}`,"late");
          } else if(it.kind==="dm"){
            c.waits.push({kind:"dispositif stérile manquant", a:t, b:t+it.dur}); ext(it.dur); it.done=true;
            ev(t,R.n,`Dispositif stérile manquant : la circulante va le chercher (${it.dur} min)`,"late");
          }
        }
        if(t>=R.until){ c.phT[4]=t; R.phase="ferm"; R.until=t+c.ph.fer; }
        break; }
      case "ferm":
        if(t>=R.until){
          c.equip.forEach(k=>equipUsed[k]--); c.equipUsed=c.equip; c.equip=[];
          if(c.box){ boxes[c.box].used--; boxReturn(c.box,t); c.boxBack=t; }
          occupy(T.ibode, c.phT[2], t, "instrumente", c.uid);
          if(c.an2==="AG"){ R.phase="needMarRev"; } else { c.phT[5]=t; R.phase="reveil"; R.until=t+c.ph.rev; }
        }
        break;
      case "needMarRev":
        if(isFreeOT(M,t)){ occupy(M,t,t+c.ph.rev,"réveil",c.uid); c.marRev=[t,t+c.ph.rev]; c.phT[5]=t; R.phase="reveil"; R.until=t+c.ph.rev; }
        else wait(c,"MAR pour le réveil",t);
        break;
      case "reveil": if(t>=R.until){ c.phT[6]=t; R.phase="needExit"; } break;
      case "needExit": {
        if(!sspiCanTake(t)){ wait(c, sspiOcc()>=beds.length ? "lit de SSPI" : "personnel de SSPI", t); break; }
        const ownBed = c.adm==="HOSP" && cfg.litHosp && c.mode==="couche" && c.type==="P";
        const walkOut = c.an2==="AL" && c.adm==="AMB";
        if(!c.brancard && !ownBed && !walkOut){ if(!takeBrancard(t)){ wait(c,"brancard",t); break; } c.brancard=true; }
        if(cfg.transfertBran && !walkOut && !c.trBy){
          const b=free1(brans,t);
          if(b){ occupy(b,t,t+6,"transfert en SSPI",c.uid); c.trBy=b.label; }
          else { c.trWait=(c.trWait||0)+1; if(c.trWait<=5){ wait(c,"brancardier pour le transfert",t); break; } c.trBy="circulante"; }
        }
        const j=beds.indexOf(null); beds[j]=c.uid; c.bed=j; c.exit=t; c.sspiIn=t+2;
        occupy(T.iade, c.phT[0], t, "en salle", c.uid);
        occupy(T.iade, t, t+6, "transfert en SSPI", c.uid);
        occupy(T.circ, c.phT[0], t, "circule", c.uid);
        c.iadeTr=[t,t+6];
        c.sspiReadyAt = c.sspiIn + Math.round(sspiDur(c) * (chance(c.rr,cfg.sspiComplication) ? 1.5 : 1));
        c.status="sspi";
        R.phase="needClean"; break; }
      case "needClean": {
        const a=free1(ashs,t)||ashs.find(x=>isFreeOT(x,t) && t<x.shift[1]+30);
        if(a){ const cd=Math.round((c.septic? uni(c.rr,20,30) : (c.bmr? uni(c.rr,20,30) : bioDur(c.rr, c.type==='P' ? (c.dur<40?'court':'long') : 'urgence'))) * (a.interim?1.2:1)); occupy(a,t,t+cd,"bionettoyage",c.uid); c.cleanStart=t; c.cleanEnd=t+cd; c.cleanBy=a.label; R.phase="clean"; R.until=t+cd; }
        else wait(c,"agent de bionettoyage",t);
        break; }
      // préparation de la salle par l'IBODE après le bionettoyage (ouverture des boîtes, table) : 7 min en médiane entre
      // la fin du bionettoyage et l'entrée suivante dans l'export réel
      case "clean": if(t>=R.until){ R.phase="prepSalle"; R.until=t+Math.round(c.type==="P" ? 2+4*c.rr() : 1+3*c.rr()); } break;
      case "prepSalle": if(t>=R.until){ R.phase="idle"; R.cur=null; R.idleSince=t; } break;
    }
  };

  /* --- vérifications avant l'anesthésie : enchaînement --- */
  const preCancel=(c,t,reason)=>{
    const R=byName[c.room]; c.status="annule"; freePre(c); R.called=R.called.filter(x=>x!==c); R.q=R.q.filter(x=>x!==c);
    cancelled.push({...c, reason:"Annulé le jour même : "+reason});
    if(c.brancard){ returnBrancardAt.push(t+10); c.brancard=false; }
  };
  const preNext=(c,t)=>{
    if(!c.vpaDone && (c.vpa||c.jeune||c.anticoag)){ c.status="vpa"; return; }
    if(!c.chirvDone && (c.consent||c.marq)){ c.status="chirv"; return; }
    if(!c.laboDone && c.exam){ c.laboDone=true; const d=Math.round(30+30*c.Ud[0]); c.labo=[t,t+d]; c.until=t+d; c.status="labo";
      ev(t,c.room,`Examen manquant pour ${c.proc} (bilan, ECG ou groupe et RAI) : résultat attendu à ${fmt(t+d)}`,"late"); return; }
    c.status = c.alrPre && !c.alrDone ? "alr" : "pret";
  };

  /* --- boucle minute par minute --- */
  const END=1440+DAY0;
  const firstCall = Math.min(1e9, ...planned.map(c=>c.planned)) - cfg.callLead - 20;
  for(let t=0; t<END; t++){
    if(t>=690 && t<=900) sspiDay.forEach(p=>{
      if(p.breakDone || p.absent || t<p.breakFrom || !onShift(p,t) || inBreak(p,t)) return;
      const o=sspiOcc(), s2=sspiStaffAt(t)-1;
      if((o===0 || s2>=1) && (o<6 || s2>=2)){ p.breaks.push([t,t+30]); p.breakDone=true; if(t>p.breakFrom+30) p.breakLate=true; }
      else if(t===900){ p.breakDone=true; p.breakSkipped=true; ev(t,"SSPI",`${p.label} : pause repas non prise, SSPI trop chargée`,"late"); }
    });
    while(ui<urg.length && urg[ui].arr<=t){ waitingUrg.push(urg[ui++]); }
    for(let i=returnBrancardAt.length-1;i>=0;i--) if(returnBrancardAt[i]<=t){ brancardsFree++; brancardLog.push([t,-1]); returnBrancardAt.splice(i,1); }
    for(let i=pendingEquip.length-1;i>=0;i--) if(pendingEquip[i][0]<=t){ equipUsed[pendingEquip[i][1]]--; pendingEquip.splice(i,1); }
    rooms.forEach(R=>advanceRoom(R,t));
    /* pré-anesthésie : arrivée, accueil, ALR */
    prePatients.forEach(c=>{
      if(c.status==="transit" && t>=c.preIn) c.status="arrive";
      if(cfg.preSas && c.preSlot && c.preSlot.kind!=="sas" && ["arrive","pret","labo","alr"].includes(c.status)){
        const i=sas[c.room].indexOf(null);
        if(i>=0){ const from=c.preSlot; freePre(c); sas[c.room][i]=c.uid; c.preC={kind:from.kind, i:from.i, a:c.preIn, b:t}; c.preSlot={kind:"sas", i, room:c.room}; c.sasIn=t+1; }
      }
      if(c.status==="arrive"){
        const n=free1(preNurses,t);
        if(n){ const d=Math.round(uni(c.rr,5,8) + (c.dossier? uni(c.rr,10,35):0) + (c.ident? 10+10*c.Ud[0]:0) + (c.prep? 5+5*c.Ud[1]:0) + (degrade(t)?5:0));
          occupy(n,t,t+d,"accueil en pré-anesthésie",c.uid); c.accueil=[t,t+d]; c.status="accueil"; c.until=t+d;
          if(c.dossier) ev(t, c.room, `Dossier incomplet pour ${c.proc} : régularisation en pré-anesthésie`, "late");
          if(c.ident) ev(t, c.room, `Discordance d'identité (bracelet, dossier, patient) : vérification avant toute suite pour ${c.proc}`, "late");
          if(c.prep) ev(t, c.room, `Patient non préparé (bijoux, vernis, prothèse) : préparation en pré-anesthésie`, "info"); }
        else wait(c,"IDE d'accueil",t);
      } else if(c.status==="accueil" && t>=c.until){
        if(c.sdCancel){
          const reason=pickW(c.rr,SAME_DAY_REASONS); preCancel(c,t,reason); ev(t,c.room,`Annulation à l'accueil : ${c.proc} (${reason.toLowerCase()})`,"late");
        } else preNext(c,t);
      } else if(c.status==="vpa"){
        const R=byName[c.room]; const m=[R.mar,...extraMars].find(x=>x && isFree(x,t));
        if(!m){ wait(c,"MAR pour la visite pré-anesthésique",t); return; }
        const d=c.jeune||c.anticoag ? 6 : Math.round(3+2*c.Ud[2]); occupy(m,t,t+d,"visite pré-anesthésique",c.uid); c.vpaMar=[t,t+d,m.label]; c.vpaDone=true;
        if(c.anticoag){ preCancel(c,t,"Anticoagulant ou antiagrégant non arrêté"); ev(t,c.room,`Annulation : anticoagulant non arrêté découvert par ${m.label} (${c.proc})`,"late"); return; }
        if(c.jeune){
          if(t+360+c.est<=1125){ // le patient remonte et repasse en fin de programme après 6 h de jeûne
            freePre(c); R.called=R.called.filter(x=>x!==c); R.q=[...R.q.filter(x=>x!==c), c];
            if(c.brancard){ returnBrancardAt.push(t+10); c.brancard=false; }
            c.status="attendu"; c.availAt=t+360; c.jeune=false; c.jeuneReport=true;
            ev(t,c.room,`Jeûne non respecté : ${c.proc} reporté en fin de programme (après ${fmt(t+360)})`,"late"); return; }
          preCancel(c,t,"Jeûne non respecté"); ev(t,c.room,`Annulation : jeûne non respecté (${c.proc})`,"late"); return;
        }
        c.status="vpaFin"; c.until=t+d;
      } else if(c.status==="vpaFin" && t>=c.until){ preNext(c,t);
      } else if(c.status==="chirv"){
        const S=c.chirP;
        if(!S || !isFree(S,t)){ wait(c,"chirurgien (consentement, marquage)",t); return; }
        const d=Math.round((c.consent?10:5) + (c.consent?10:10)*c.Ud[3]); occupy(S,t,t+Math.min(d,8),c.consent?"consentement":"marquage du côté",c.uid);
        c.chirVisit=[t,t+d,S.label]; c.chirvDone=true; c.status="chirvFin"; c.until=t+d;
        ev(t,c.room,`${S.label} vient ${c.consent?"faire signer le consentement":""}${c.consent&&c.marq?" et ":""}${c.marq?"marquer le côté opératoire":""} (${c.proc})`,"late");
      } else if(c.status==="chirvFin" && t>=c.until){ preNext(c,t);
      } else if(c.status==="labo" && t>=c.until){
        if(c.until>cfg.lastProgStart){ preCancel(c,t,"Examen manquant, résultat trop tardif"); ev(t,c.room,`Annulation : résultat d'examen trop tardif (${c.proc})`,"late"); return; }
        preNext(c,t);
      } else if(c.status==="alr"){
        const R=byName[c.room]; const m=[R.mar,...extraMars].find(x=>isFree(x,t));
        if(m && equipAvail("echoPre",t)>0){ equipUsed.echoPre++; pendingEquip.push([t+12,"echoPre"]); occupy(m,t,t+12,"ALR en pré-anesthésie",c.uid); c.marAlr=[t,t+12]; c.alrBy=m.label; c.status="alrLat"; c.until=t+27; c.alrDone=true; }
        else wait(c,"MAR pour l'ALR",t);
      } else if(c.status==="alrLat" && t>=c.until) c.status="pret";
    });
    /* SSPI : durée, décision de sortie par un MAR, lit d'aval, transport */
    done.forEach(c=>{
      if(c.status!=="sspi" || t<c.sspiReadyAt) return;
      if(!c.marOk){
        const m=[...extraMars, ...dayMars, gardeMar, ...recallMar].find(x=>isFree(x,t));
        if(m){ occupy(m,t,t+2,"sortie de SSPI",c.uid); c.marOk=t; c.marSortie=[t,t+2,m.label]; }
        else { wait(c,"MAR pour la sortie de SSPI",t); return; }
      }
      if(c.avalReadyAt==null){
        let w=0;
        if(c.adm==="AMB" && t>cfg.ucaClose) c.convHosp=true;
        if(c.adm==="HOSP" && chance(c.rr,cfg.wardBlock*(epid?1.5:1))) w=Math.round(uni(c.rr,30,120));
        if((c.dur>=240 || /ROBOT/.test(c.spec) || c.complic) && chance(c.rr,0.3)){ if(reaUsed<cfg.reaBeds){ reaUsed++; c.rea=true; } else { w=Math.max(w,Math.round(uni(c.rr,120,240))); c.reaWait=true; } }
        c.avalReadyAt=t+w; if(w) c.waits.push({kind: c.reaWait? "place en réanimation":"lit en service", a:t, b:t+w});
        if(c.convHosp) ev(t,"SSPI",`Ambulatoire converti en hospitalisation (sortie après la fermeture) : ${c.proc}`,"late");
        if(c.reaWait) ev(t,"SSPI",`Pas de place en réanimation : patient gardé en SSPI (${c.proc})`,"late");
      }
      if(t<c.avalReadyAt) return;
      const walk = c.an2==="AL" && c.adm==="AMB" && c.mode!=="couche";
      if(walk){ c.sspiOut=t; c.status="sorti"; }
      else {
        const b=free1(brans,t); if(!b){ wait(c,"brancardier pour le retour",t); return; }
        const tr=(c.adm==="AMB"? uni(c.rr,3,6) : uni(c.rr,6,11))*(b.interim?1.2:1);
        occupy(b,t,t+2*tr,"retour en service",c.uid); c.sspiOut=t; c.returnBy=b.label; c.status="sorti";
        if(c.brancard) returnBrancardAt.push(Math.round(t+2*tr+5));
      }
      beds[c.bed]=null;
    });
    sspiLog.push([t, sspiOcc(), sspiStaffAt(t)]);
    /* appels des patients programmés */
    if(t>=firstCall && t<cfg.lastProgStart) rooms.forEach(R=>{
      if(!R.open || !R.q.length || closed(R.n,t)) return;
      const ahead = R.called.filter(x=>x.status!=="labo" && x.status!=="chirv").length;
      const short = R.q[0] && R.q[0].est<40;
      if(ahead >= (short?2:1)) return;
      const c=R.q.find(x=>x.status==="attendu" && !x.noShow); if(!c) return;
      if(t<c.availAt) return;
      const cur=R.cur; const estFree = cur ? cur.phT[0] + (cur.est||cur.dur) + 12 : t;
      const lead = ahead ? cfg.callLead + (R.called[0]?.est||20) : cfg.callLead;
      if(estFree - t <= lead && t >= c.planned - lead - 25) callPatient(R,c,t);
    });
    /* déprogrammation à l'heure limite */
    if(t===cfg.lastProgStart){
      rooms.forEach(R=>{ R.q.filter(c=>c.status!=="salle").forEach(c=>{
        if(c.noShow || c.status==="annule") return;
        if(c.brancard){ returnBrancardAt.push(t+10); c.brancard=false; }
        freePre(c); c.status="deprog"; cancelled.push({...c, reason:"Déprogrammé faute de temps"});
        ev(t,R.n,`Déprogrammé faute de temps : ${c.proc} (prévu à ${fmt(c.planned)})`,"late"); });
        R.q=[]; R.called=[]; });
    }
    /* salles libres : choisir le cas suivant */
    rooms.forEach(R=>{
      // une salle qui tombe en panne pendant l'arrivée du patient (12 min au plus) ne démarre pas de cas
      if(R.phase!=="idle" || closures.some(z=>z.room===R.n && z.from<t+13 && z.to>t)) return;
      if(cfg.finProgramme && R.started && !R.endClean && R.open && !R.nightOnly && R.n!==cfg.urgRoom && !R.q.length && !R.called.length && !isNight(t)){
        const a=free1(ashs,t)||ashs.find(x=>isFreeOT(x,t) && t<x.shift[1]+30);
        if(a){ const d=Math.round(30+15*rSteri()); occupy(a,t,t+d,"bionettoyage de fin de programme",R.n); R.endClean=[t,t+d,a.label]; R.phase="endClean"; R.until=t+d;
          ev(t,R.n,`Bionettoyage de fin de programme par ${a.label} (${d} min)`,"bio"); return; }
      }
      const night=isNight(t);
      let team, mar;
      if(night){
        const k=nightRooms.indexOf(R.n); if(k<0) return; team=gardeTeams[k]; mar=marForTeam(k);
        if(!team || !Object.values(team).every(p=>isFree(p,t))) return;
      } else {
        if(!R.open || R.nightOnly) return;
        team=R.team; mar=R.mar;
        if(!Object.values(team).every(p=>isFree(p,t))) return;
      }
      // premier patient : jamais avant l'heure prévue ; ensuite, avancé de 30 min au plus si la salle se libère tôt
      let prog = !night ? R.called.find(c=>c.status==="pret" && t >= Math.max(c.planned - (R.started?30:0), cfg.firstPlanned-5)) : null;
      // régulation de fin de journée : un cas programmé qui finirait après 18 h 30 est déprogrammé
      if(prog && t+prog.est > 1110){
        const c=prog; R.q=R.q.filter(x=>x!==c); R.called=R.called.filter(x=>x!==c);
        if(c.brancard){ returnBrancardAt.push(t+10); c.brancard=false; }
        freePre(c); c.status="deprog"; cancelled.push({...c, reason:"Déprogrammé faute de temps"});
        ev(t,R.n,`Déprogrammé par le régulateur, fin prévue après 18 h 30 : ${c.proc} (prévu à ${fmt(c.planned)})`,"late");
        prog=null;
      }
      const u = pickUrg(R,t,night);
      if(u && (u.cls==="imm" || u.cls==="h1" || !prog || (u.cls==="h6" && u.deadline-t<u.est+60))){
        waitingUrg.splice(waitingUrg.indexOf(u),1);
        const b=free1(brans,t); const tr = u.cls==="imm" ? 3 : (b? Math.round(uni(u.rr,5,9)) : 12);
        if(b && u.cls!=="imm") occupy(b,t,t+tr,"transport d'une urgence",u.uid);
        u.called=t; u.transportBy= b && u.cls!=="imm" ? b.label : "équipe de salle";
        startCase(R,u,t,team,mar,tr);
        return;
      }
      if(prog){ R.started=true; startCase(R,prog,t,team,mar, prog.preSlot && prog.preSlot.kind==="sas" ? 1 : prog.mode==="debout"?2:3); }
    });
    if(t>DAY1 && ui>=urg.length && !waitingUrg.length && rooms.every(R=>R.phase==="idle") && done.every(c=>c.status==="sorti")) break;
  }
  waitingUrg.forEach(c=>{ cancelled.push({...c, reason:"Urgence reportée au lendemain"}); ev(1439,cfg.urgRoom,`Urgence reportée au lendemain : ${c.proc}`,"late"); });
  rooms.forEach(R=>R.q.forEach(c=>{ if(c.status==="attendu" && !c.noShow) cancelled.push({...c, reason:"Déprogrammé faute de temps"}); }));
  planned.filter(c=>c.noShow && c.status==="attendu").forEach(c=>cancelled.push({...c, reason:"Patient absent"}));
  return {done, cancelled, events, closures, ALL, rooms, sspiLog, brancardLog, beds:cfg.sspiBeds, dayMars, extraMars, gardeMar, equipDown, siWin, autoclave, boxes};
}

/* ------------------------------------------------------------------ */
/* 5. Contrôles de réalisme                                            */
/* ------------------------------------------------------------------ */
function validateDay(res, cfg){
  const issues=[]; let checks=0;
  const add=(m)=>{ if(issues.length<40) issues.push(m); else issues.n=(issues.n||0)+1; };
  // 1. personne à deux endroits
  res.ALL.forEach(p=>{
    const iv=[...p.iv].sort((a,b)=>a.a-b.a);
    for(let i=1;i<iv.length;i++){ checks++; if(iv[i].a < iv[i-1].b - 0.01) add(`${p.label} occupé deux fois à ${fmt(iv[i].a)} (${iv[i-1].what} et ${iv[i].what})`); }
  });
  // 2. MAR : deux patients endormis au plus en salle
  res.ALL.filter(p=>p.role==="MAR").forEach(m=>{
    const evs=[]; res.done.filter(c=>c.mar===m && c.an2!=="AL" && c.phT && c.phT[1]!=null && c.phT[6]!=null).forEach(c=>{ evs.push([c.phT[1],1]); evs.push([c.phT[6],-1]); });
    evs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); let k=0;
    evs.forEach(([t,d])=>{ k+=d; checks++; if(k>2) add(`${m.label} : ${k} patients endormis en même temps à ${fmt(t)}`); });
  });
  // 3. SSPI : lits et personnel
  res.sspiLog.forEach(([t,o,s])=>{ checks++; if(o>res.beds) add(`SSPI : ${o} patients pour ${res.beds} lits à ${fmt(t)}`); if(o>=6 && s<2) add(`SSPI : ${o} patients pour ${s} agent à ${fmt(t)}`); if(o>0 && s<1) add(`SSPI : patients sans IDE à ${fmt(t)}`); });
  // 4. brancards
  let used=0; [...res.brancardLog].sort((a,b)=>a[0]-b[0]).forEach(([t,d])=>{ used+=d; checks++; if(used>cfg.brancards) add(`Brancards : ${used} utilisés pour ${cfg.brancards} à ${fmt(t)}`); });
  // 5. incision avec chirurgien, induction générale avec MAR, salle libre avant le patient suivant
  res.done.forEach(c=>{ checks++; if(c.phT[3]!=null && !c.chirIn) add(`${c.proc} : incision sans chirurgien`); if(c.an2==="AG" && c.phT[1]!=null && !c.marInd) add(`${c.proc} : induction sans MAR`); });
  const byRoom={}; res.done.forEach(c=>{ (byRoom[c.room]=byRoom[c.room]||[]).push(c); });
  Object.values(byRoom).forEach(L=>{ L.sort((a,b)=>a.s-b.s); for(let i=1;i<L.length;i++){ checks++; if(L[i].s < (L[i-1].cleanEnd??L[i-1].exit) - 0.01) add(`${L[i].room} : deux patients en salle à ${fmt(L[i].s)}`); } });
  // 6. programmé démarré après l'heure limite
  res.done.forEach(c=>{ checks++; if(c.type==="P" && c.s > cfg.lastProgStart+15) add(`${c.proc} : cas programmé démarré à ${fmt(c.s)}`); });
  return {checks, violations:issues.length+(issues.n||0), issues};
}

/* ------------------------------------------------------------------ */
/* 6. Bilan                                                            */
/* ------------------------------------------------------------------ */
function report(res, cfg, annulAvant){
  const D=res.done, U=D.filter(c=>c.type!=="P"), P=D.filter(c=>c.type==="P");
  const avg=a=>a.length? a.reduce((x,y)=>x+y,0)/a.length : 0, sum=a=>a.reduce((x,y)=>x+y,0);
  const wsum=(re)=>Math.round(sum(D.map(c=>c.waits.filter(w=>re.test(w.kind)).reduce((s,w)=>s+(w.b-w.a),0))));
  const uw=c=>c.s-c.arr;
  const over = cfg.rooms.map(r=>{ const L=P.filter(c=>c.room===r); const e=L.length? Math.max(...L.map(c=>c.exit||0)) : 0; return Math.max(0,e-1110); });
  const C=res.cancelled;
  // taux d'occupation des vacations, même définition que le classeur « Ratios v2 » : heures opérées
  // pendant la vacation 8 h 30 - 17 h 30 / heures offertes, sur les salles qui ont du programmé
  // (les urgences ne sont pas rattachées à une vacation)
  const VAC0=510, VAC1=1050, endOf=c=>(c.phT&&c.phT[6]!=null)? c.phT[6] : c.s+c.dur;
  const vacRooms=[...new Set(D.filter(c=>c.type!=="U").map(c=>c.room))];
  const opMin=sum(D.filter(c=>c.type!=="U").map(c=>Math.max(0,Math.min(VAC1,endOf(c))-Math.max(VAC0,c.s))));
  return {
    occ: vacRooms.length? Math.round(1000*opMin/(vacRooms.length*(VAC1-VAC0)))/10 : 0,
    done:D.length, prog:P.length, urg:U.length,
    annul: annulAvant||0,
    deprog:C.filter(c=>/Déprogrammé/.test(c.reason)).length,
    annulJ:C.filter(c=>/jour même/.test(c.reason)).length,
    absents:C.filter(c=>c.reason==="Patient absent").length,
    sallesFermees:C.filter(c=>/Salle fermée/.test(c.reason)).length,
    urgReport:C.filter(c=>/reportée/.test(c.reason)).length,
    urgWait:Math.round(avg(U.filter(c=>c.cls!=="h24").map(uw))), urgWaitMax:Math.round(Math.max(0,...U.map(uw))),
    vitWait:Math.round(avg(U.filter(c=>c.cls==="imm").map(uw))),
    urgInTime: U.length? Math.round(100*U.filter(c=>c.s<=c.deadline).length/U.length) : 100,
    late:Math.round(avg(P.map(c=>Math.max(0,c.s-c.planned)))), lateN:P.filter(c=>c.s-c.planned>=20).length,
    overMin:Math.round(sum(over)), overRooms:over.filter(x=>x>0).length,
    waitMar:wsum(/^MAR pour l'(induction|ALR)|^MAR pour le réveil/), waitChir:wsum(/^chirurgien$/), waitEquip:wsum(/^équipement$/),
    waitPre:wsum(/pré-anesthésie|IDE d'accueil/), waitBrancard:wsum(/^brancard$/), waitBran:wsum(/^brancardier/),
    bedBlock:wsum(/de SSPI$/), bedBlockN:D.filter(c=>c.waits.some(w=>/de SSPI$/.test(w.kind) && w.b-w.a>=3)).length,
    waitSortie:wsum(/sortie de SSPI/), waitAval:wsum(/lit en service|réanimation/), waitAsh:wsum(/bionettoyage/),
    roomWaitPatient: Math.round(sum(res.rooms.flatMap(R=>R.waits.filter(w=>w.kind==="patient").map(w=>w.b-w.a)))),
    convHosp:D.filter(c=>c.convHosp).length,
    sspiPeak: Math.max(0,...res.sspiLog.map(x=>x[1])),
    absentStaff: res.ALL.filter(p=>p.absent).length, interim: res.ALL.filter(p=>p.interim).length,
    complic: D.filter(c=>c.complic).length,
    lastEnd: D.length? Math.max(...D.map(c=>c.exit||0)) : 0,
    // vérifications avant l'anesthésie
    waitVerif:wsum(/visite pré-anesthésique|consentement, marquage/) + Math.round(sum(D.map(c=>c.labo? c.labo[1]-c.labo[0] : 0))),
    vpa:D.filter(c=>c.vpaMar).length, labo:D.filter(c=>c.labo).length, chirVisit:D.filter(c=>c.chirVisit).length,
    jeuneReport:D.filter(c=>c.jeuneReport).length,
    annulJeune:C.filter(c=>/Jeûne/.test(c.reason)).length, annulAnticoag:C.filter(c=>/Anticoagulant/.test(c.reason)).length,
    annulExamen:C.filter(c=>/Examen manquant/.test(c.reason)).length, annulImplant:C.filter(c=>/Implant/.test(c.reason)).length,
    // stérilisation, matériel, pendant l'intervention
    waitSteri:wsum(/boîte d'instruments/), boxNC:D.filter(c=>c.boxRefused).length,
    waitMateriel:wsum(/implant|dispositif stérile manquant|IBODE habilitée|chariot d'intubation/),
    waitRadio:wsum(/manipulateur radio/), extempo:D.filter(c=>c.extempoAt).length, waitExtempo:wsum(/examen extemporané/),
    transfu:D.filter(c=>c.transfuAt).length, waitTransfu:wsum(/produits sanguins/),
    intubDiff:D.filter(c=>c.intub).length, interne:D.filter(c=>c.interne).length, bmr:D.filter(c=>c.bmr).length,
    waitTransfert:wsum(/brancardier pour le transfert/), comptage:D.filter(c=>c.comptage).length,
    siPanne: res.siWin? res.siWin.b-res.siWin.a : 0, autoclave: res.autoclave? res.autoclave.b-res.autoclave.a : 0,
    finProgramme: res.rooms.filter(R=>R.endClean).length
  };
}

/* ------------------------------------------------------------------ */
/* 7. Journée complète au format du moteur d'animation                 */
/* ------------------------------------------------------------------ */
const CALM = {roomPanne:0, equipPanne:0, absent:0, noShow:0, latePatient:0, sameDayCancel:0, dossierIncomplet:0, complication:0, sspiComplication:0, wardBlock:0,
  jeune:0, anticoag:0, consentement:0, marquage:0, examens:0, identite:0, preparation:0, implant:0, dmManquant:0, boiteNC:0, autoclavePanne:0, siPanne:0, intubDiff:0};
let GEN_COUNT=0;
// La référence « sans aléas » garde la même graine, les mêmes patients programmés, les mêmes annulations
// et les mêmes urgences habituelles ; elle retire absences, pannes, retards, complications, afflux et événements ajoutés.
function runOnce(cfg, withAleas, hook){
  const all=planProgram(cfg);
  const canc=[], planned=[], idx={};
  all.forEach(c=>{ const k=idx[c.room]=(idx[c.room]||0)+1; c.rr=rng(seedOf(cfg.seed,"patient",c.room,k));
    if(c.rr()<STATS.cancelRate) canc.push({...c, reason:pickW(c.rr,STATS.cancelReasons)}); else planned.push(c); });
  const c2 = withAleas ? cfg : {...cfg, ...CALM, events:[], burst:{at:cfg.burst.at, n:0}};
  const urg=makeUrgences(c2, rng(seedOf(cfg.seed,"urgences")));
  return {res:simulate(c2, planned, urg, rng(seedOf(cfg.seed,"divers")), hook), canc, cfg:c2, planned, urg};
}
function generateDay(cfgIn, hook){
  const cfg=normalizeConfig(cfgIn);
  cfg.__di=dayInfo(cfg.date);
  const main=runOnce(cfg,true,hook), res=main.res;
  const val=validateDay(res,cfg);
  const rep=report(res,cfg,main.canc.length);
  const base=runOnce(cfg,false); const repBase=report(base.res,base.cfg,base.canc.length);
  GEN_COUNT++;
  const D=res.done.filter(c=>c.phT && c.phT[6]!=null).sort((a,b)=>a.s-b.s);
  const cases=D.map((c,i)=>{
    const ph=[...c.phT]; for(let k=1;k<7;k++) if(ph[k]==null) ph[k]=ph[k-1];
    return {
      id:i, room:c.room, s:c.s, dur:ph[6]-c.s, phT:ph, spec:c.spec, proc:c.proc, type:c.type, prio:c.prio, cls:c.cls||null,
      clsLabel: c.cls? URG_CLASSES[c.cls].label : null, deadline:c.deadline??null,
      adm:c.adm, an:c.an, anl:AN_LABEL[c.an]||"Non renseignée", ch:c.ch, mar:c.mar? c.mar.label : "MAR-garde",
      arr: c.type==="P" ? (c.preIn ?? c.s-30) : c.arr, planned: c.type==="P" ? c.planned : null,
      waitBed:(c.exit||ph[6])-ph[6], bed:c.bed, recOut:c.sspiOut ?? ((c.sspiReadyAt||ph[6])+5), cleanStart:c.cleanStart, cleanEnd:c.cleanEnd,
      mode:c.mode, child:!!c.child, latex:!!c.latex, septic:!!c.septic, preIn:c.preIn??null, preSlot:c.preSlot||null, preC:c.preC||null, sasIn:c.sasIn??null, called:c.called??null,
      accueil:c.accueil||null, marInd:c.marInd||null, marRev:c.marRev||null, marAlr:c.marAlr||null, alrBy:c.alrBy||null, marSortie:c.marSortie||null,
      chirIn:c.chirIn||null, iadeTr:c.iadeTr||null, sspiIn:c.sspiIn??null, sspiReady:c.sspiReadyAt??null,
      team:{iade:c.team.iade.label, ibode:c.team.ibode.label, circ:c.team.circ.label}, transportBy:c.transportBy||null, returnBy:c.returnBy||null, cleanBy:c.cleanBy||null,
      waits:c.waits.filter(w=>w.b-w.a>=2), complic:!!c.complic, convHosp:!!c.convHosp, rea:!!c.rea, late:c.late||0, dossier:!!c.dossier,
      equip:c.equipUsed||[], surgeonCalled:c.surgeonCalled||0,
      vpaMar:c.vpaMar||null, chirVisit:c.chirVisit||null, labo:c.labo||null, jeuneReport:!!c.jeuneReport, ident:!!c.ident, prep:!!c.prep,
      consent:!!c.consent, marq:!!c.marq, box:c.box||c.boxBack? (BOX_LABEL[c.box]||"") : "", boxGroup: BOX_LABEL[BOX_GROUP[c.spec]]||"", boxRefused:!!c.boxRefused,
      radio:c.radio||null, extempoAt:c.extempoAt||null, transfuAt:c.transfuAt||null, intub:!!c.intub, interne:!!c.interne, bmr:!!c.bmr,
      dmMiss:!!c.dmMiss, implantAt:c.implantAt??null, comptage:!!c.comptage, degrade:!!c.degrade, trBy:c.trBy||null,
      tool:c.tool||null, toolMin:c.toolMin||0
    };
  });
  const allCanc=[...main.canc.map(c=>({spec:c.spec, proc:c.proc, reason:c.reason, when:"avant"})), ...res.cancelled.map(c=>({spec:c.spec, proc:c.proc, reason:c.reason, when:"jour", planned:c.planned??null, room:c.room||null}))];
  const extra=[...res.events];
  res.closures.forEach(z=>{ extra.push({t:z.from, room:z.room, txt:`${z.label} : salle indisponible jusqu'à ${fmt(z.to)}`, kind:"u"}); extra.push({t:z.to, room:z.room, txt:"Salle de nouveau disponible", kind:"bio"}); });
  const roomWaits={}; res.rooms.forEach(R=>{ roomWaits[R.n]=R.waits; });
  return {
    date:cfg.date, label: cfg.name || ("Simulation "+GEN_COUNT), jour:cfg.__di.jour,
    generated:true, v:2, cfg:JSON.parse(JSON.stringify({...cfg, __di:undefined})), cases, cancelled:allCanc,
    staff:{bran:cfg.bran, ash:cfg.ash, sspi:cfg.sspiStaff}, sspiBeds:cfg.sspiBeds, preSeats:cfg.preSeats, preBeds:cfg.preBeds, preSas:!!cfg.preSas, sasPlaces:cfg.sasPlaces,
    closures:res.closures, extraEvents:extra, roomWaits,
    endCleans:Object.fromEntries(res.rooms.filter(R=>R.endClean).map(R=>[R.n,R.endClean])), siWin:res.siWin||null, autoclave:res.autoclave||null,
    staffChanges:res.ALL.filter(p=>p.absent||p.interim).map(p=>({label:p.label, role:p.role, absent:p.absent, interim:p.interim})),
    report:rep, baseline:repBase, validation:val
  };
}
