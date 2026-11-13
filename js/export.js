/* Blocapta BlocSim - export CSV au format de l'export OPROOM */

const OPROOM_COLS = ["Jour","Date","Heure","Site","Salle","Statut","Type","Admission","Arrivée bloc","Entrée salle","Sortie salle","Fin bio","Arr SSPI","Box SSPI","Sortie bloc","Durée","Spécialité","Procédure","Chirurgien","Anesth réalisée","Anesth prévue","Anesthésiste","Raison Annulation","Date Annulation"];
const DETAIL_COLS = ["Heure prévue","Priorité","Arrivée urgence","Attente urgence (min)","Retard (min)","Attente lit SSPI (min)","Début bionettoyage","Anesthésie déduite","Patient"];
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
      hhmm(c.arr2), hhmm(c.s), hhmm(c.end), hhmm(c.cleanEnd), hhmm(c.inRec), c.bed!=null? c.bed+1 : "", hhmm(c.outRec),
      Math.round(c.end-c.s), c.spec, c.proc, c.ch, anl, "", c.mar, "", "-"];
    if(detailed) r.push(hhmm(c.planned), c.prio==="vitale"?"vitale":c.type==="P"?"":c.type==="U"?"urgente":"différée",
      c.type!=="P"? hhmm(c.arr2):"", c.type!=="P"? Math.round(c.s-c.arr2):"", c.planned!=null? Math.max(0,Math.round(c.s-c.planned)):"",
      Math.round(c.waitBed||0), hhmm(c.cleanStart), c.anInf?"oui":"non", c.pid);
    rows.push(r);
  });
  d.cancelled.forEach(c=>{
    const r=[jour, date, "", "Bloc opératoire", "", "éliminé", "rendez-vous", "", "", "", "", "", "", "", "", "", c.spec, c.proc==="nan"?"":c.proc, "", "", "", "", c.reason, date];
    if(detailed) r.push("", "", "", "", "", "", "", "", "");
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
