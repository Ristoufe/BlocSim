/* Blocapta BlocSim - moteur : plannings, trajets, phases, constantes */
/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt = m => { const mm=((Math.floor(m)%1440)+1440)%1440; return String(Math.floor(mm/60)).padStart(2,"0")+":"+String(mm%60).padStart(2,"0"); };
const dur = m => { m=Math.max(0,Math.round(m)); return m>=60 ? Math.floor(m/60)+" h "+String(m%60).padStart(2,"0") : m+" min"; };
function rng(seed){ let s = seed>>>0 || 1; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)%100000)/100000; }; }
function plen(p){ let L=0; for(let i=1;i<p.length;i++) L+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y); return L; }
function mkPath(a,b,lane){
  if(a.z===b.z) return [a,b];
  const da=doorOf(a.z), db=doorOf(b.z), y=CY+lane;
  const ia={x:da.x, y:da.y + (da.y<CY? -14:14)}, ib={x:db.x, y:db.y + (db.y<CY? -14:14)};
  return [a, ia, {x:da.x,y:da.y}, {x:da.x,y}, {x:db.x,y}, {x:db.x,y:db.y}, ib, b];
}
const SPEC_SHORT = s => s.replace("Chirurgie ","").replace("Gynécologie Obstétrique","Gynéco-obstétrique").replace("Générale et Digestive","Viscérale").replace("UROLOGIE ROBOT","Urologie robot").replace("VISCERAL ROBOT","Viscéral robot");

/* ------------------------------------------------------------------ */
/* Construction d'une journée                                          */
/* ------------------------------------------------------------------ */
function inferAn(c){
  if(c.an!=="NR") return {an:c.an, inferred:false};
  if(/Ophtalmo/.test(c.spec)) return {an:"AL+S", inferred:true};
  if(/Endoscopie/.test(c.spec)) return {an:"AL+S", inferred:true};
  if(/Cardio/.test(c.spec)) return {an:"AL+S", inferred:true};
  return {an:"AG", inferred:true};
}
function phasesOf(c){
  if(c.phT) return {t:c.phT};
  const d=c.dur, an=c.an2;
  let acc=Math.min(4,d*0.08);
  let ind= an==="AG"? clamp(d*0.12,6,20) : an==="ALR"? clamp(d*0.12,5,15) : an==="AL+S"? clamp(d*0.07,2,6) : 1.5;
  let ins=clamp(d*0.1,2,15), fer=clamp(d*0.1,2,15);
  let rev= an==="AG"? clamp(d*0.08,4,12) : an==="ALR"?3 : an==="AL+S"?2 : 1;
  let other=acc+ind+ins+fer+rev, maxOther=d*0.62;
  if(other>maxOther){ const f=maxOther/other; acc*=f; ind*=f; ins*=f; fer*=f; rev*=f; other=maxOther; }
  const chir=d-other, s=c.s;
  const t=[s, s+acc, s+acc+ind, s+acc+ind+ins, s+acc+ind+ins+chir, s+acc+ind+ins+chir+fer, s+d];
  return {t, acc, ind, ins, chir, fer, rev};
}
function sspiDur(c){
  let m = c.an2==="AG" ? 55+Math.min(30,c.dur/10) : c.an2==="ALR" ? 45 : c.an2==="AL+S" ? 25 : 12;
  if(c.adm==="AMB") m*=0.8;
  return m;
}

const DAY_START=420, DAY_END=1170;   // 7 h - 19 h 30, comme le générateur : équipes de jour, ensuite garde
function buildDay(day){
  if(day.v===2) return buildDayV2(day);
  const cases = day.cases.map(c=>{ const a=inferAn(c); return {...c, an2:a.an, anInf:a.inferred, proc: c.proc==="nan"?"Acte non renseigné":c.proc}; });
  const rooms = [...new Set(cases.map(c=>c.room))].filter(r=>ROOMS[r]);
  const byRoom = {}; rooms.forEach(r=>byRoom[r]=cases.filter(c=>c.room===r).sort((a,b)=>a.s-b.s));
  cases.forEach(c=>{ c.ph=phasesOf(c); c.waitBed=c.waitBed||0; c.end=c.s+c.dur+c.waitBed; c.robot=/ROBOT/.test(c.spec); c.night = c.s<DAY_START || c.s>=DAY_END; c.pid="P-"+String(1000+c.id*7+day.date.slice(-2)*13).slice(-4); });
  // bionettoyage
  rooms.forEach(r=>{ const L=byRoom[r]; L.forEach((c,i)=>{ const nx=L[i+1]; const gap = nx? nx.s-c.end : 99;
    if(c.cleanStart!=null){ c.clean=c.cleanEnd-c.cleanStart; }
    else { const want = c.bio!=null ? Math.max(1, c.bio) : clamp(gap-1, 4, 12); c.clean = gap<2 ? 0 : Math.min(want, gap-1.3); c.cleanStart=c.end+(c.clean>0?0.8:0); c.cleanEnd=c.cleanStart+c.clean; }
    c.next=nx||null; c.prev=L[i-1]||null; }); });

  const agents=[]; const events=[];
  const ev=(t,room,txt,kind)=>events.push({t,room,txt,kind});
  let laneSeed=0; const lane=()=>{ laneSeed++; return ((laneSeed*7)%9-4)*4.2; };
  const mkAgent=(role,code,home,speed,extra={})=>{ const a={role,code,home,speed,visits:[],lane:lane(),...extra}; agents.push(a); return a; };
  let offI=0, arsI=0;
  const offSlot=()=>OFF_SLOTS[(offI++)%OFF_SLOTS.length];
  const arsSlot=()=>ARS_SLOTS[(arsI++)%ARS_SLOTS.length];

  // pools
  const pool=(n,role,prefix,homeFn)=>Array.from({length:n},(_,i)=>mkAgent(role,prefix+" "+(i+1),homeFn(),900,{busy:[]}));
  const STAFF = day.staff || {bran:3, ash:3};
  const brans = pool(STAFF.bran,"BRAN","BRA",arsSlot);
  const ashs = pool(STAFF.ash,"ASH","ASH",arsSlot);
  const NBEDS = day.sspiBeds || REC_BEDS.length;
  const take=(P,a,b)=>{ // agent libre sur [a,b] ; si personne n'est libre, un renfort est appelé (jamais deux tâches à la fois)
    let best=P.find(x=>x.busy.every(([u,v])=> b<=u || a>=v));
    if(!best){ const r0=P[0]; best=mkAgent(r0.role, `${r0.code.split(" ")[0]} renfort ${P.filter(x=>x.renfort).length+1}`, arsSlot(), r0.speed, {busy:[], renfort:true}); P.push(best); }
    best.busy.push([a,b]); return best;
  };

  // équipes : une par salle le jour, une équipe de garde la nuit
  const team={}; const garde={};
  const gardeBusy=[];   // intervalles occupés de chaque équipe de garde
  const getTeam=(room,night,a,b)=>{
    let gi=0;
    if(night){ gi=gardeBusy.findIndex(L=>L.every(([u,v])=> b<=u || a>=v)); if(gi<0){ gi=gardeBusy.length; gardeBusy.push([]); } gardeBusy[gi].push([a,b]); }
    const key = night ? "G"+gi : room;
    const store = night ? garde : team;
    if(!store[key]){
      const tag = night ? "garde"+(gi?" "+(gi+1):"") : room.replace("OP ","OP");
      store[key]={
        IADE: mkAgent("IADE","IADE "+tag, offSlot(), 900),
        IBODE: mkAgent("IBODE","IBODE "+tag, offSlot(), 900),
        CIRC: mkAgent("CIRC","CIRC "+tag, offSlot(), 900)
      };
    }
    return store[key];
  };
  const chirs={}, mars={};
  const getChir=c=>chirs[c]||(chirs[c]=mkAgent("CHIR",c,offSlot(),950));
  const getMar=c=>mars[c]||(mars[c]=mkAgent("MAR",c,offSlot(),1000));

  // SSPI : lits
  const bedFree = REC_BEDS.map(()=>-1e9);
  const accFree = ACC_SLOTS.map(()=>-1e9);
  const BED_SPEED=600;

  // actes simultanés dans le box de la SSPI (données réelles) : le second patient est pris en charge sur un lit de SSPI
  { const L=cases.filter(c=>c.room==="SSPI").sort((a,b)=>a.s-b.s); let k=0; L.forEach((c,i)=>{ if(L.slice(0,i).some(p=>p.end>c.s)) c.atBed=REC_BEDS[Math.max(0,(day.sspiBeds||REC_BEDS.length)-1-(k++))]; }); }
  cases.sort((a,b)=>a.s-b.s).forEach(c=>{
    const R = ROOMS[c.room]; if(!R) return;
    const tablePos = c.atBed || spot(c.room,"TABLE");
    const P=c.ph.t, T=getTeam(c.room,c.night,P[0]-12,c.end+8);
    // patient
    const arr = c.arr!=null && c.arr<c.s && (day.generated || c.s-c.arr<150) ? c.arr : c.s - (c.type==="U"?14:32);
    c.arr2=arr;
    let ai=accFree.findIndex(v=>v<=arr); if(ai<0) ai=accFree.indexOf(Math.min(...accFree));
    const accSpot = ACC_SLOTS[ai];
    const pat = mkAgent("PAT", c.pid, null, BED_SPEED, {caseId:c.id});
    const tdIn = plen(mkPath(accSpot, tablePos, 0))/BED_SPEED;
    accFree[ai]=c.s-tdIn+0.5;
    const sd=sspiDur(c);
    let bi; if(c.bed!=null) bi=c.bed; else { const fr=bedFree.slice(0,NBEDS); bi=fr.findIndex(v=>v<=c.end+1); if(bi<0) bi=fr.indexOf(Math.min(...fr)); }
    const bed=REC_BEDS[bi];
    const tdOut = plen(mkPath(tablePos, bed, 0))/BED_SPEED;
    const inRec = c.end+tdOut, outRec= c.recOut!=null ? Math.max(inRec+5, c.recOut) : inRec+sd;
    bedFree[bi]=outRec+3;
    const tdExit = plen(mkPath(bed, EXIT, 0))/BED_SPEED;
    c.bed=bi; c.inRec=inRec; c.outRec=outRec;
    pat.visits.push({a:arr, b:c.s-tdIn, p:accSpot, act:"wait", appear:true});
    pat.visits.push({a:c.s, b:c.end, p:tablePos, act:"table"});
    pat.visits.push({a:inRec, b:outRec, p:bed, act:"sspi"});
    pat.visits.push({a:outRec+tdExit, b:outRec+tdExit+0.2, p:EXIT, act:"exit", vanish:true});
    // brancardage : accueil vers salle, salle vers SSPI, SSPI vers service
    const b1 = take(brans, c.s-tdIn-4, c.s+1);
    b1.visits.push({a:c.s-tdIn-1.5, b:c.s-tdIn, p:{x:accSpot.x+26,y:accSpot.y+4,z:"ACC"}, act:"pick"});
    b1.visits.push({a:c.s, b:c.s+1.5, p:spot(c.room,"BRAN"), act:"drop"});
    const b2 = take(brans, c.end-3, inRec+2);
    b2.visits.push({a:c.end-1.2, b:c.end, p:spot(c.room,"BRAN"), act:"pick"});
    b2.visits.push({a:inRec, b:inRec+1.5, p:{x:bed.x+30,y:bed.y,z:"REC"}, act:"drop"});
    const b3 = take(brans, outRec-3, outRec+tdExit+1);
    b3.visits.push({a:outRec-1, b:outRec, p:{x:bed.x+30,y:bed.y,z:"REC"}, act:"pick"});
    b3.visits.push({a:outRec+tdExit, b:outRec+tdExit+1, p:{x:EXIT.x+30,y:EXIT.y,z:"ACC"}, act:"drop"});

    // anesthésie
    const mar = getMar(c.mar), iade=T.IADE;
    if(c.an2!=="AL"){
      iade.visits.push({a:P[0]-4, b:c.end, p:spot(c.room,"IADE"), act:"anesth"});
      iade.visits.push({a:inRec, b:inRec+5, p:{x:bed.x-30,y:bed.y,z:"REC"}, act:"transmission"});
      mar.visits.push({a:P[1], b:P[2]+2, p:spot(c.room,"MAR"), act:"induction"});
      if(c.an2==="AG") mar.visits.push({a:P[5]-1, b:P[6], p:spot(c.room,"MAR"), act:"reveil"});
    } else {
      iade.visits.push({a:P[0]-2, b:P[0]+3, p:spot(c.room,"IADE"), act:"anesth"});
    }
    // chirurgie
    const ch = getChir(c.ch);
    if(c.robot){
      ch.visits.push({a:P[2]-4, b:P[3]+6, p:spot(c.room,"CHIR"), act:"install"});
      ch.visits.push({a:P[3]+6, b:P[4]-6, p:spot(c.room,"CONSOLE"), act:"console"});
      ch.visits.push({a:P[4]-6, b:P[5]+2, p:spot(c.room,"CHIR"), act:"close"});
    } else {
      ch.visits.push({a:P[3]-3, b:P[5]+2, p:spot(c.room,"CHIR"), act:"operate"});
    }
    T.IBODE.visits.push({a:P[2]-12, b:P[2], p:spot(c.room,"PREP"), act:"prep"});
    T.IBODE.visits.push({a:P[2], b:P[5], p:spot(c.room,"IBODE"), act:"instrument"});
    T.CIRC.visits.push({a:P[0]-6, b:c.end+2, p:spot(c.room,"CIRC"), act:"circulate"});
    // bionettoyage
    if(c.clean>0){ const ash = take(ashs, c.cleanStart-2, c.cleanEnd+1);
      ash.visits.push({a:c.cleanStart, b:c.cleanEnd, p:spot(c.room,"ASH"), act:"clean", room:c.room}); }

    // événements
    const tag = c.type==="U"?"Urgence":c.type==="UD"?"Urgence différée":"";
    if(c.type!=="P" && !day.generated) ev(arr-12, c.room, `${tag} annoncée : ${c.proc}`, "u");
    if(c.type!=="P" && day.generated) ev(arr, c.room, `${c.prio==="vitale"?"Urgence vitale":tag} arrive : ${c.proc}${c.s-arr>=10?` (prise en charge à ${fmt(c.s)}, ${Math.round(c.s-arr)} min d'attente)`:""}`, "u");
    if(day.generated && c.type==="P" && c.planned!=null && c.s-c.planned>=20) ev(c.planned, c.room, `Retard : ${c.proc} prévu à ${fmt(c.planned)}, démarre à ${fmt(c.s)}`, "late");
    if(c.waitBed>=3) ev(P[6], c.room, `Pas de lit libre en SSPI : patient ${c.pid} reste en salle ${Math.round(c.waitBed)} min`, "late");
    ev(arr, c.room, `Patient ${c.pid} à l'accueil (${SPEC_SHORT(c.spec)})`, "acc");
    ev(P[0], c.room, `Entrée en salle : ${c.proc}`, "in");
    if(c.an2!=="AL") ev(P[1], c.room, `Induction (${c.an2==="AG"?"anesthésie générale":c.an2==="ALR"?"anesthésie locorégionale":"sédation"}) par ${c.mar}`, "an");
    ev(P[3], c.room, c.robot?`Incision et amarrage du robot, ${c.ch} en console`:`Incision par ${c.ch}`, "op");
    ev(P[4], c.room, "Fermeture et pansement", "op");
    ev(c.end, c.room, `Sortie de salle, patient ${c.pid} vers la SSPI`, "out");
    ev(inRec, "SSPI", `Patient ${c.pid} en SSPI, lit ${bi+1}`, "rec");
    ev(outRec, "SSPI", `Patient ${c.pid} sort de SSPI vers ${c.adm==="AMB"?"l'ambulatoire":"son service"}`, "rec");
    ev(c.cleanEnd, c.room, `Bionettoyage terminé, salle prête`, "bio");
  });
  // actes en box SSPI : pas d'équipe IBODE
  agents.forEach(a=>{ if(a.role==="IBODE"||a.role==="CIRC") a.visits=a.visits.filter(v=>v.p.z!=="SSPI"); });
  // une personne n'est qu'à un seul endroit : quand deux présences se chevauchent (données réelles :
  // MAR référent de plusieurs salles, chirurgien qui délègue la fermeture), la première s'arrête quand la suivante commence
  const overlaps={};
  agents.forEach(a=>{ if(a.role==="PAT") return; a.visits.sort((x,y)=>x.a-y.a); const kept=[];
    a.visits.forEach(v=>{ const pv=kept[kept.length-1]; if(pv && v.a<pv.b-0.01){ overlaps[a.role]=(overlaps[a.role]||0)+1; pv.b=v.a; if(pv.b-pv.a<0.3) kept.pop(); } kept.push(v); });
    a.visits=kept; });

  (day.extraEvents||[]).forEach(e=>ev(e.t,e.room,e.txt,e.kind||"late"));
  agents.forEach(buildTrack);
  events.sort((a,b)=>a.t-b.t);
  const t0 = cases.length ? Math.floor((Math.min(...cases.map(c=>c.arr2))-40)/60)*60 : 420;
  const t1 = cases.length ? Math.ceil((Math.max(...cases.map(c=>c.outRec))+30)/60)*60 : 1200;
  return {day, cases, rooms, byRoom, agents, events, t0, t1, chirs, mars, sspiBeds:NBEDS, closures:day.closures||[], dataOverlaps:overlaps};
}


/* ------------------------------------------------------------------ */
/* Journées du moteur réaliste (v2) : l'animation suit exactement les  */
/* décisions de l'ordonnanceur, personne par personne                  */
/* ------------------------------------------------------------------ */
const WAIT_LABEL = {
  "MAR pour l'induction":"attend le MAR pour l'induction", "MAR pour le réveil":"attend le MAR pour le réveil",
  "chirurgien":"attend le chirurgien", "équipement":"attend un équipement partagé", "lit de SSPI":"attend un lit de SSPI",
  "personnel de SSPI":"attend une IDE de SSPI disponible", "brancard":"attend un brancard", "agent de bionettoyage":"attend un agent de bionettoyage",
  "MAR pour la sortie de SSPI":"attend la décision de sortie d'un MAR", "lit en service":"attend un lit dans le service", "place en réanimation":"attend une place en réanimation",
  "brancardier pour le retour":"attend un brancardier pour le retour", "poste de pré-anesthésie":"attend un poste libre en pré-anesthésie",
  "brancardier":"attend un brancardier", "IDE d'accueil":"attend l'IDE d'accueil", "MAR pour l'ALR":"attend un MAR pour son ALR",
  "MAR pour la visite pré-anesthésique":"attend la visite pré-anesthésique du MAR", "chirurgien (consentement, marquage)":"attend le chirurgien (consentement ou marquage)",
  "boîte d'instruments":"attend une boîte d'instruments stérile", "implant ou ancillaire":"attend un implant ou un ancillaire", "chariot d'intubation difficile":"attend le chariot d'intubation difficile",
  "IBODE habilitée robot":"attend une IBODE habilitée au robot", "manipulateur radio":"attend le manipulateur radio", "examen extemporané":"attend le résultat de l'examen extemporané",
  "produits sanguins":"attend les produits sanguins de l'EFS", "dispositif stérile manquant":"attend un dispositif stérile manquant", "brancardier pour le transfert":"attend un brancardier pour le transfert en SSPI"
};
function buildDayV2(day){
  const cases = day.cases.map(c=>({...c, an2:inferAn(c).an, anInf:false}));
  const rooms = [...new Set(cases.map(c=>c.room))].filter(r=>ROOMS[r]);
  const byRoom = {}; rooms.forEach(r=>byRoom[r]=cases.filter(c=>c.room===r).sort((a,b)=>a.s-b.s));
  cases.forEach(c=>{
    c.ph={t:c.phT}; c.waitBed=c.waitBed||0; c.end=c.s+c.dur+c.waitBed; c.robot=/ROBOT/.test(c.spec);
    c.pid="P-"+String(1000+c.id*7+(+day.date.slice(-2))*13).slice(-4);
    c.arr2 = c.type==="P" ? (c.called ?? c.preIn ?? c.s-30) : (c.called ?? c.arr);
    c.clean = (c.cleanEnd??c.end)-(c.cleanStart??c.end);
  });
  const agents=[], events=[];
  const ev=(t,room,txt,kind)=>events.push({t,room,txt,kind});
  let laneSeed=0; const lane=()=>{ laneSeed++; return ((laneSeed*7)%9-4)*4.2; };
  const mkAgent=(role,code,home,speed,extra={})=>{ const a={role,code,home,speed,visits:[],lane:lane(),...extra}; agents.push(a); return a; };
  let offI=0, arsI=0;
  const offSlot=()=>OFF_SLOTS[(offI++)%OFF_SLOTS.length];
  const arsSlot=()=>ARS_SLOTS[(arsI++)%ARS_SLOTS.length];
  const named={};
  const person=(role,label)=> named[label] || (named[label]=mkAgent(role,label, (role==="BRAN"||role==="ASH")? arsSlot() : offSlot(), role==="MAR"?1000:900));
  const chirs={}, mars={};

  cases.sort((a,b)=>a.s-b.s).forEach(c=>{
    if(!ROOMS[c.room]) return;
    const P=c.phT, table=spot(c.room,"TABLE");
    const pat=mkAgent("PAT", c.pid, null, 520, {caseId:c.id, kase:c});
    const slotSpot=(sl)=> sl.kind==="sas" ? sasSpot(sl.room||c.room, sl.i) : sl.kind==="couche" ? PRE_BEDS[sl.i] : PRE_SEATS[sl.i];
    const preSpot = c.type==="P" && c.preSlot ? slotSpot(c.preSlot) : null;
    const firstSpot = c.type==="P" && c.preC ? slotSpot(c.preC) : preSpot;   // attente dans la zone commune avant la salle de pré-anesthésie
    const lying = c.mode==="couche";
    pat.visits.push({a:c.arr2, b:c.arr2+0.1, p:SERV, act:"arrive", appear:true});
    if(c.type==="P" && c.preC) pat.visits.push({a:c.preIn, b:Math.max(c.preIn+0.5, c.sasIn-1), p:firstSpot, act: c.preC.kind==="couche"?"pre":"preSeat"});
    if(preSpot) pat.visits.push({a:c.preC? c.sasIn : c.preIn, b:Math.max((c.preC? c.sasIn : c.preIn)+0.5, c.s-1), p:preSpot, act: c.preSlot.kind==="sas" ? (lying?"pre":"preSeat") : c.preSlot.kind==="couche"?"pre":"preSeat"});
    pat.visits.push({a:c.s, b:c.end, p:table, act:"table"});
    const bi = c.bed ?? 0, bed=REC_BEDS[bi] || REC_BEDS[0];
    const inRec = c.sspiIn ?? c.end+2, outRec = Math.max(inRec+3, c.recOut ?? inRec+30);
    c.bed=bi; c.inRec=inRec; c.outRec=outRec;
    pat.visits.push({a:inRec, b:outRec, p:bed, act:"sspi"});
    const tdExit = plen(mkPath(bed, SERV, 0))/520;
    pat.visits.push({a:outRec+tdExit, b:outRec+tdExit+0.2, p:SERV, act:"exit", vanish:true});

    // brancardage : service vers pré-anesthésie (ou vers la salle pour une urgence), puis retour
    if(c.transportBy && /^BRA/.test(c.transportBy)){
      const b=person("BRAN",c.transportBy);
      b.visits.push({a:c.arr2-0.5, b:c.arr2+0.1, p:{x:SERV.x+24,y:SERV.y+6,z:"ACC"}, act:"pick"});
      const tTo = preSpot ? c.preIn : c.s;
      b.visits.push({a:tTo, b:tTo+1, p: firstSpot ? {x:firstSpot.x+22,y:firstSpot.y+6,z:firstSpot.z} : spot(c.room,"BRAN"), act:"drop"});
    }
    if(c.returnBy){
      const b=person("BRAN",c.returnBy);
      b.visits.push({a:outRec-1, b:outRec, p:{x:bed.x+30,y:bed.y,z:"REC"}, act:"pick"});
      b.visits.push({a:outRec+tdExit, b:outRec+tdExit+1, p:{x:SERV.x+28,y:SERV.y+8,z:"ACC"}, act:"drop"});
    }
    // équipe de salle
    const iade=person("IADE",c.team.iade), ibode=person("IBODE",c.team.ibode), circ=person("CIRC",c.team.circ);
    if(preSpot) circ.visits.push({a:c.s-2.2, b:c.s-1.8, p:{x:preSpot.x+20,y:preSpot.y-8,z:preSpot.z}, act:"pick"});
    circ.visits.push({a:c.s, b:c.end, p:spot(c.room,"CIRC"), act:"circulate"});
    if(c.an2!=="AL" || c.type!=="P") iade.visits.push({a:c.s, b:c.end, p:spot(c.room,"IADE"), act:"anesth"});
    if(c.iadeTr) iade.visits.push({a:inRec, b:Math.max(inRec+2,c.iadeTr[1]), p:{x:bed.x-28,y:bed.y,z:"REC"}, act:"transmission"});
    ibode.visits.push({a:P[2]-10, b:P[2], p:spot(c.room,"PREP"), act:"prep"});
    ibode.visits.push({a:P[2], b:P[5], p:spot(c.room,"IBODE"), act:"instrument"});
    // MAR
    if(c.marInd){ const m=person("MAR",c.mar); mars[c.mar]=m; m.visits.push({a:c.marInd[0], b:c.marInd[1], p:spot(c.room,"MAR"), act:"induction"}); }
    if(c.marRev){ const m=person("MAR",c.mar); m.visits.push({a:c.marRev[0], b:c.marRev[1], p:spot(c.room,"MAR"), act:"reveil"}); }
    const spotAt=(tt)=> (c.preC && tt<c.sasIn) ? firstSpot : preSpot;
    if(c.marAlr && preSpot){ const sp=spotAt(c.marAlr[0]), m=person("MAR",c.alrBy||c.mar); m.visits.push({a:c.marAlr[0], b:c.marAlr[1], p:{x:sp.x+20,y:sp.y+10,z:sp.z}, act:"alr"}); }
    if(c.vpaMar && preSpot){ const sp=spotAt(c.vpaMar[0]), m=person("MAR",c.vpaMar[2]); m.visits.push({a:c.vpaMar[0], b:c.vpaMar[1], p:{x:sp.x+20,y:sp.y-10,z:sp.z}, act:"vpa"}); }
    if(c.chirVisit && preSpot){ const sp=spotAt(c.chirVisit[0]), ch=person("CHIR",c.chirVisit[2]); ch.visits.push({a:c.chirVisit[0], b:Math.min(c.chirVisit[1], c.chirVisit[0]+8), p:{x:sp.x-20,y:sp.y-10,z:sp.z}, act:"visite"}); }
    if(c.marSortie){ const m=person("MAR",c.marSortie[2]); m.visits.push({a:c.marSortie[0], b:c.marSortie[1]+0.5, p:{x:bed.x,y:bed.y+20,z:"REC"}, act:"sortie"}); }
    // chirurgien
    if(c.chirIn){
      const ch=person("CHIR",c.ch); chirs[c.ch]=ch;
      if(c.robot){ ch.visits.push({a:c.chirIn[0], b:c.chirIn[0]+6, p:spot(c.room,"CHIR"), act:"install"}); ch.visits.push({a:c.chirIn[0]+6, b:Math.max(c.chirIn[0]+7,c.chirIn[1]-4), p:spot(c.room,"CONSOLE"), act:"console"}); }
      else ch.visits.push({a:c.chirIn[0], b:c.chirIn[1], p:spot(c.room,"CHIR"), act:"operate"});
    }
    // bionettoyage
    if(c.cleanBy){ const a=person("ASH",c.cleanBy); a.visits.push({a:c.cleanStart, b:c.cleanEnd, p:spot(c.room,"ASH"), act:"clean", room:c.room}); }

    // événements
    const tag = c.type==="P" ? "" : (c.clsLabel ? `Urgence (${c.clsLabel.toLowerCase()})` : "Urgence");
    if(c.type!=="P"){
      ev(c.arr, c.room, `${tag} déclarée : ${c.proc}`, "u");
      if(c.surgeonCalled>=15) ev(c.called, c.room, `${c.ch} appelé, arrivée dans ${c.surgeonCalled} min`, "late");
      if(c.deadline!=null && c.s>c.deadline) ev(c.s, c.room, `Délai dépassé : prise en charge ${Math.round(c.s-c.deadline)} min après le délai maximal`, "late");
    } else if(c.planned!=null && c.s-c.planned>=20) ev(c.planned, c.room, `Retard : ${c.proc} prévu à ${fmt(c.planned)}, démarre à ${fmt(c.s)}`, "late");
    if(c.preC) ev(c.sasIn, c.room, `Patient ${c.pid} passe dans la salle de pré-anesthésie de ${c.room}`, "acc");
    if(preSpot) ev(c.preIn, c.room, `Patient ${c.pid} ${c.preC? "attend en zone d'accueil" : c.preSlot.kind==="sas" ? "en salle de pré-anesthésie de "+c.room : "en pré-anesthésie"} (${c.mode==="debout"?"venu à pied":c.mode==="fauteuil"?"en fauteuil":c.adm==="HOSP"&&day.cfg?.litHosp?"dans son lit":"sur brancard"})`, "acc");
    if(c.marAlr) ev(c.marAlr[0], c.room, `ALR en pré-anesthésie par ${c.alrBy}`, "an");
    ev(c.s, c.room, `Entrée en salle : ${c.proc}`, "in");
    if(c.marInd) ev(c.marInd[0], c.room, `Induction (${c.an2==="AG"?"anesthésie générale":c.an2==="ALR"?"anesthésie locorégionale":"sédation"}) par ${c.mar}`, "an");
    if(c.chirIn) ev(c.chirIn[0], c.room, c.robot?`Incision et amarrage du robot, ${c.ch} en console`:`Incision par ${c.ch}`, "op");
    if(c.complic) ev(P[3]+10, c.room, "Complication peropératoire : intervention prolongée", "late");
    ev(P[4], c.room, "Fermeture et pansement", "op");
    (c.waits||[]).forEach(w=>{ if(w.b-w.a>=5) ev(w.a, /SSPI|service|réanimation|retour/.test(w.kind) && w.a>=c.end ? "SSPI" : c.room, `Patient ${c.pid} ${WAIT_LABEL[w.kind]||"attend : "+w.kind} (${Math.round(w.b-w.a)} min)`, "late"); });
    ev(c.end, c.room, `Sortie de salle, patient ${c.pid} vers la SSPI`, "out");
    ev(inRec, "SSPI", `Patient ${c.pid} en SSPI, lit ${bi+1}`, "rec");
    ev(outRec, "SSPI", `Patient ${c.pid} sort de SSPI vers ${c.convHosp?"une hospitalisation (ambulatoire converti)":c.rea?"la réanimation":c.adm==="AMB"?"l'ambulatoire":"son service"}`, "rec");
    if(c.cleanEnd!=null) ev(c.cleanEnd, c.room, `Bionettoyage terminé${c.septic?" (renforcé)":""}, salle prête`, "bio");
  });
  (day.extraEvents||[]).forEach(e=>ev(e.t,e.room,e.txt,e.kind||"late"));
  agents.forEach(buildTrack);
  events.sort((a,b)=>a.t-b.t);
  const t0 = Math.floor((Math.min(...cases.map(c=>c.arr2), 1440)-40)/60)*60;
  const t1 = Math.ceil((Math.max(...cases.map(c=>c.outRec), 480)+30)/60)*60;
  return {day, cases, rooms, byRoom, agents, events, t0:Math.max(0,t0), t1, chirs, mars,
    sspiBeds:day.sspiBeds||10, closures:day.closures||[], roomWaits:day.roomWaits||{}, v:2};
}

/* trajectoire d'un agent : suite de séjours et de déplacements */
function buildTrack(ag){
  const vs = ag.visits.sort((a,b)=>a.a-b.a);
  const segs=[];
  if(ag.role==="PAT"){
    const first=vs[0];
    segs.push({k:"hide", t0:-1e9, t1:first.a});
    let pos=first.p, t=first.a, act=first.act;
    segs.push({k:"stay", t0:first.a, t1:first.b, p:pos, act});
    t=first.b;
    for(let i=1;i<vs.length;i++){
      const v=vs[i], path=mkPath(pos,v.p,ag.lane*0.3), td=plen(path)/ag.speed;
      const dep=Math.max(t, v.a-td);
      if(dep>t) segs.push({k:"stay",t0:t,t1:dep,p:pos,act});
      segs.push({k:"move",t0:dep,t1:dep+td,path,len:plen(path)});
      pos=v.p; act=v.act; t=Math.max(dep+td, v.a);
      if(v.vanish){ segs.push({k:"hide",t0:t,t1:1e9}); ag.segs=segs; return; }
      segs.push({k:"stay",t0:t,t1:Math.max(t,v.b),p:pos,act}); t=Math.max(t,v.b);
    }
    segs.push({k:"hide",t0:t,t1:1e9}); ag.segs=segs; return;
  }
  let pos=ag.home, t=-1e9, act="idle", room=null;
  const travel=(from,to)=>{ const p=mkPath(from,to,ag.lane); return {p, td:plen(p)/ag.speed}; };
  for(const v of vs){
    if(pos!==ag.home){
      const back=travel(pos,ag.home), go=travel(ag.home,v.p);
      if(v.a - t > back.td + go.td + 25){
        segs.push({k:"move",t0:t,t1:t+back.td,path:back.p,len:plen(back.p)});
        t+=back.td; pos=ag.home; act="idle"; room=null;
      }
    }
    const tr=travel(pos,v.p);
    const dep=Math.max(t, v.a-tr.td);
    if(dep>t) segs.push({k:"stay",t0:t,t1:dep,p:pos,act:act==="clean"?"wait":act,room});
    if(tr.td>0.01) segs.push({k:"move",t0:dep,t1:dep+tr.td,path:tr.p,len:plen(tr.p)});
    const arrive=dep+tr.td;
    pos=v.p; act=v.act; room=v.room||null;
    const end=Math.max(arrive, v.b);
    segs.push({k:"stay",t0:arrive,t1:end,p:pos,act,room:v.room});
    t=end;
  }
  if(pos!==ag.home){ const back=travel(pos,ag.home); segs.push({k:"move",t0:t,t1:t+back.td,path:back.p,len:plen(back.p)}); t+=back.td; }
  segs.push({k:"stay",t0:t,t1:1e9,p:ag.home,act:"idle"});
  ag.segs=segs;
}

function segAt(ag,t){
  const S=ag.segs; let lo=0, hi=S.length-1;
  while(lo<hi){ const m=(lo+hi+1)>>1; if(S[m].t0<=t) lo=m; else hi=m-1; }
  return S[lo];
}
function posAt(ag,t){
  const s=segAt(ag,t);
  if(s.k==="hide") return null;
  if(s.k==="stay"){
    let x=s.p.x, y=s.p.y;
    if(s.act==="clean" && ROOMS[s.room]){ const R=ROOMS[s.room]; const a=t*0.9+ag.lane; x=R.cx+Math.cos(a)*52*R.k; y=R.cy+Math.sin(a*1.3)*80*R.k; }
    return {x,y,moving:s.k==="move",act:s.act,dir:null};
  }
  const f=clamp((t-s.t0)/(s.t1-s.t0),0,1); let d=f*s.len; const p=s.path;
  for(let i=1;i<p.length;i++){ const L=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y); if(d<=L||i===p.length-1){ const u=L?d/L:0; return {x:p[i-1].x+(p[i].x-p[i-1].x)*u, y:p[i-1].y+(p[i].y-p[i-1].y)*u, moving:true, act:"walk", dir:Math.atan2(p[i].y-p[i-1].y,p[i].x-p[i-1].x)}; } d-=L; }
  return {x:p[p.length-1].x,y:p[p.length-1].y,moving:false};
}

/* état d'une salle à un instant */
function roomState(sim, room, t){
  const L=sim.byRoom[room]; if(!L) return {st:"ferme"};
  for(const c of L){
    if(t>=c.ph.t[6] && t<c.end){ const w=(c.waits||[]).find(w=>t>=w.a&&t<w.b); return {st:"attente", c, i:5, why: w? w.kind : "lit de SSPI"}; }
    if(c.waits && t>=c.s && t<c.ph.t[6]){ const w=c.waits.find(w=>t>=w.a&&t<w.b);
      if(w){ const k=/^MAR/.test(w.kind)?"attMar":w.kind==="chirurgien"?"attChir":w.kind==="équipement"?"attEquip":null; if(k){ const P=c.ph.t; let i=0; while(i<5 && t>=P[i+1]) i++; return {st:k, c, i, why:w.kind}; } } }
    if(t>=c.s && t<c.end){ const P=c.ph.t; let i=0; while(i<5 && t>=P[i+1]) i++; return {st:PHASES[i].k, c, i, frac:(t-c.s)/c.dur}; }
    if(t>=c.end && t<c.cleanEnd) return {st:"bio", c, i:6};
  }
  const pan=(sim.closures||[]).find(z=>z.room===room && t>=z.from && t<z.to);
  if(pan) return {st:"panne", pan, next:L.find(c=>c.s>t)};
  const nx=L.find(c=>c.s>t);
  const rw=(sim.roomWaits&&sim.roomWaits[room]||[]).find(w=>w.kind==="patient" && t>=w.a && t<w.b);
  if(rw) return {st:"attPat", c:nx, next:true};
  if(nx && nx.s-t<25) return {st:"prepa", c:nx, next:true};
  return {st:"libre", next:nx};
}

/* constantes vitales simulées, plausibles et déterministes */
function vitals(c,t){
  const r=rng(c.id*97+31), base=62+r()*22, sys0=118+r()*24;
  const P=c.ph.t; let hr=base, sys=sys0, sp=98, co=null, bis=null;
  const n=Math.sin(t*2.1+c.id)*1.5+Math.sin(t*0.37)*2;
  if(t<P[1]){ hr=base+8; sys=sys0+8; }
  else if(t<P[2]){ const f=(t-P[1])/(P[2]-P[1]); hr=base+8-f*14; sys=sys0+8-f*(c.an2==="AG"?30:16); if(c.an2==="AG"&&f>0.4){co=33+f*3;} }
  else if(t<P[5]){ hr=base-4+(t>P[3]&&t<P[3]+6?9:0); sys=sys0-16+(t>P[3]&&t<P[3]+6?12:0); if(c.an2==="AG"){co=35.5; bis=45;} }
  else { hr=base+6; sys=sys0; if(c.an2==="AG"){ co=38; bis=72; } }
  sp = c.an2==="AG" && t>P[1] && t<P[5] ? 99 : 97+(r()*2|0);
  return {hr:Math.round(hr+n), sys:Math.round(sys+n*1.5), dia:Math.round((sys+n)*0.58), sp, co:co?Math.round(co+n*0.2):null, bis};
}
