/* Blocapta BlocSim - export CSV au format de l'export OPROOM */

const OPROOM_COLS = ["Jour","Date","Heure","Site","Salle","Statut","Type","Admission","Arrivée bloc","Entrée salle","Sortie salle","Fin bio","Arr SSPI","Box SSPI","Sortie bloc","Durée","Spécialité","Procédure","Chirurgien","Anesth réalisée","Anesth prévue","Anesthésiste","Raison Annulation","Date Annulation"];
const DETAIL_COLS = ["Heure prévue","Priorité","Arrivée urgence","Attente urgence (min)","Retard (min)","Attente lit SSPI (min)","Début bionettoyage","Anesthésie déduite","Patient",
  "Mode d'arrivée","Appel du patient","Entrée pré-anesthésie","Poste de pré-anesthésie","ALR en pré-anesthésie","Classe d'urgence","Délai maximal","Délai respecté",
  "Attente pré-anesthésie (min)","Attente MAR (min)","Attente chirurgien (min)","Attente équipement (min)","Attente brancard (min)","Attente sortie SSPI (min)","Attente aval (min)",
  "Sortie SSPI","Équipe IADE","Équipe IBODE","Brancardier aller","Brancardier retour","Agent de bionettoyage","Équipements","Complication","Ambulatoire converti","Réanimation","Enfant","Allergie latex","Septique",
  "Visite pré-anesthésique (MAR)","Discordances avant l'anesthésie","Reporté (jeûne)","Attente examen (min)","Boîte d'instruments","Boîte non conforme","Attente boîte (min)",
  "Interruptions peropératoires","Attente manipulateur radio (min)","Intubation difficile","Interne","BMR","Mode dégradé","Brancardier transfert SSPI"];
const JOURS = ["DIMANCHE","LUNDI","MARDI","MERCREDI","JEUDI","VENDREDI","SAMEDI"];

function hhmm(m){ return m==null || isNaN(m) ? "" : fmt(m); }
function ddmmyy(iso){ const [y,mo,d]=iso.split("-"); return `${d}/${mo}/${y.slice(2)}`; }
function csvCell(v){ v = v==null ? "" : String(v); return /[;"\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; }

/* une ligne par intervention réalisée, puis une par annulation ou déprogrammation */
function oproomRows(sim, detailed){
  const d=sim.day, date=ddmmyy(d.date), jour=JOURS[new Date(d.date+"T12:00:00").getDay()];
  const TYPE={P:"programmé",U:"urgence",UD:"Urg différé"}, ADM={AMB:"Ambulatoire",HOSP:"Hospitalisation",EXT:"Externe"};
  const rows=[];
  [...sim.cases].sort((a,b)=>a.s-b.s).forEach(c=>{
    const anl = c.anInf ? (AN_LABEL[c.an2]||"") : (c.anl==="Non renseignée" ? "" : c.anl);
    const r=[jour, date, hhmm(c.s), "Bloc opératoire", c.room, "fermé", TYPE[c.type]||"programmé", ADM[c.adm]||"",
      hhmm(c.phT && c.type==="P" ? (c.preIn ?? c.arr2) : c.phT ? c.arr : c.arr2), hhmm(c.s), hhmm(c.end), hhmm(c.cleanEnd), hhmm(c.inRec), c.bed!=null? c.bed+1 : "", hhmm(c.outRec),
      Math.round(c.end-c.s), c.spec, c.proc, c.ch, anl, "", c.mar, "", "-"];
    if(detailed){
      const ws=re=>Math.round((c.waits||[]).filter(w=>re.test(w.kind)).reduce((a,w)=>a+(w.b-w.a),0));
      const v2=!!c.phT;
      r.push(hhmm(c.planned), c.cls ? (c.clsLabel||c.cls) : c.prio==="vitale"?"vitale":c.type==="P"?"":c.type==="U"?"urgente":"différée",
        c.type!=="P"? hhmm(c.arr):"", c.type!=="P"? Math.round(c.s-(c.arr??c.arr2)):"", c.planned!=null? Math.max(0,Math.round(c.s-c.planned)):"",
        Math.round(c.waitBed||0), hhmm(c.cleanStart), c.anInf?"oui":"non", c.pid,
        v2? ({debout:"debout",fauteuil:"fauteuil",couche:"couché"})[c.mode]||"" : "", hhmm(c.called), hhmm(c.preIn), c.preSlot? (c.preSlot.kind==="sas" ? `salle de pré-anesthésie ${c.room}${c.preC? " (après attente en zone d'accueil)":""}` : (c.preSlot.kind==="couche"?"couché ":"assis ")+(c.preSlot.i+1)) : "",
        c.marAlr? "oui":"", c.clsLabel||"", c.deadline!=null? hhmm(c.deadline):"", c.deadline!=null? (c.s<=c.deadline?"oui":"non"):"",
        v2? ws(/pré-anesthésie|IDE d'accueil/):"", v2? ws(/^MAR pour l'(induction|ALR)|^MAR pour le réveil/):"", v2? ws(/^chirurgien$/):"", v2? ws(/^équipement$/):"", v2? ws(/^brancard$/):"",
        v2? ws(/sortie de SSPI|brancardier pour le retour/):"", v2? ws(/lit en service|réanimation/):"",
        hhmm(c.outRec), c.team?.iade||"", c.team?.ibode||"", c.transportBy||"", c.returnBy||"", c.cleanBy||"", (c.equip||[]).join(" + "),
        c.complic?"oui":"", c.convHosp?"oui":"", c.rea?"oui":"", c.child?"oui":"", c.latex?"oui":"", c.septic?"oui":"",
        c.vpaMar? `${c.vpaMar[2]} à ${hhmm(c.vpaMar[0])}`:"", [c.ident&&"identité",c.prep&&"préparation",c.consent&&"consentement",c.marq&&"marquage",c.labo&&"examen manquant",c.dossier&&"dossier"].filter(Boolean).join(" + "),
        c.jeuneReport?"oui":"", c.labo? Math.round(c.labo[1]-c.labo[0]):"", c.boxGroup||"", c.boxRefused?"oui":"", v2? ws(/boîte d'instruments/):"",
        [c.radio&&"scopie",c.extempoAt&&"extemporané",c.transfuAt&&"transfusion",c.dmMiss&&"dispositif manquant",c.implantAt!=null&&"implant",c.comptage&&"comptage discordant"].filter(Boolean).join(" + "),
        v2? ws(/manipulateur radio/):"", c.intub?"oui":"", c.interne?"oui":"", c.bmr?"oui":"", c.degrade?"oui":"", c.trBy||"");
    }
    rows.push(r);
  });
  d.cancelled.forEach(c=>{
    const r=[jour, date, "", "Bloc opératoire", "", "éliminé", "rendez-vous", "", "", "", "", "", "", "", "", "", c.spec, c.proc==="nan"?"":c.proc, "", "", "", "", c.reason, date];
    if(detailed) r.push(...Array(DETAIL_COLS.length).fill(""));
    rows.push(r);
  });
  return rows;
}
function oproomCSV(sim, detailed){
  const head = detailed ? [...OPROOM_COLS, ...DETAIL_COLS] : OPROOM_COLS;
  return "﻿" + [head, ...oproomRows(sim,detailed)].map(r=>r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
function csvName(sim, detailed){
  const slug = sim.day.label.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase();
  return `${sim.day.generated?"simulation":"journee"}-${slug}-graine${sim.day.cfg?.seed ?? "reelle"}${detailed?"-detail":""}.csv`;
}
function downloadCSV(sim, detailed){
  const blob=new Blob([oproomCSV(sim,detailed)],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=csvName(sim,detailed);
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/* enregistrement automatique dans logs/ quand l'appli tourne avec npm start */
function saveLog(sim){
  const body=JSON.stringify({files:[{name:csvName(sim,false), csv:oproomCSV(sim,false)},{name:csvName(sim,true), csv:oproomCSV(sim,true)}]});
  return fetch("api/log",{method:"POST",headers:{"Content-Type":"application/json"},body})
    .then(r=>r.ok? r.json() : null).catch(()=>null);
}
