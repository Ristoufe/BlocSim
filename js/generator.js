/* Blocapta BlocSim - générateur de journées et ordonnanceur à événements discrets */

let STATS = null;

const ALL_ROOMS = ["OP 2","OP 3","OP 4","OP 5","OP 6","OP 7","OP 8","OP 9","OP 10","OP 11"];
const PRIO = {
  vitale:{label:"Urgence vitale", type:"U"},
  urgente:{label:"Urgence", type:"U"},
  differee:{label:"Urgence différée", type:"UD"}
};
const SHORT_SPEC = {
  "Chirurgie Orthopédique":"ORTH","Chirurgie Générale et Digestive":"VISC","Chirurgie Urologique":"URO","Chirurgie ORL":"ORL",
  "Gynécologie Obstétrique":"GYN","Endoscopie Digestive":"ENDO","Ophtalmologie":"OPH","Stomatologie":"STOM","Cardiologie":"CARD",
  "Anesthésie":"ANES","VISCERAL ROBOT":"VROB","UROLOGIE ROBOT":"UROB"
};

function defaultConfig(){
  return {
    name:"Journée type", seed:42, date:"2026-11-16",
    rooms: ALL_ROOMS.filter(r=>(STATS.rooms[r]?.open||0)>0.35),
    urgRoom: STATS.urgRoom,
    load:1.0,
    urgCount: Math.round(STATS.urgPerWeekday),
    burst:{at:840, n:0},
    sspiBeds:8, bran:3, ash:3,
    events:[]
  };
}

const PRESETS = [
  {id:"type", name:"Journée type", text:"Activité programmée habituelle et le nombre moyen d'urgences d'un jour de semaine.", apply:c=>c},
  {id:"afflux", name:"Accident collectif", text:"Six victimes arrivent vers 14 h, dont plusieurs urgences vitales, en plus des urgences habituelles.",
    apply:c=>({...c, name:"Accident collectif à 14 h", burst:{at:840,n:6}})},
  {id:"urg", name:"Urgences en continu", text:"Seize urgences réparties sur la journée, trois fois plus qu'un jour moyen.",
    apply:c=>({...c, name:"Urgences en continu", urgCount:16})},
  {id:"panne", name:"Panne de salle", text:"La salle OP 3 tombe en panne de 10 h à 14 h 30, son programme doit attendre.",
    apply:c=>({...c, name:"Panne de la salle OP 3", events:[{kind:"panne", room:"OP 3", at:600, until:870, label:"Panne d'ascenseur de table"}]})},
  {id:"sspi", name:"SSPI réduite", text:"Seulement 4 lits de SSPI ouverts : les patients attendent en salle et bloquent le programme.",
    apply:c=>({...c, name:"SSPI réduite à 4 lits", sspiBeds:4})},
  {id:"effectif", name:"Sous-effectif", text:"Un seul brancardier et un seul agent de bionettoyage pour tout le bloc.",
    apply:c=>({...c, name:"Sous-effectif brancardage et bionettoyage", bran:1, ash:1})},
  {id:"surcharge", name:"Programme surchargé", text:"Programme rempli à 140 % de l'habitude, avec les urgences habituelles : débordements et déprogrammations attendus.",
    apply:c=>({...c, name:"Programme surchargé", load:1.4})}
];

/* tirages */
function gauss(r){ const u=Math.max(1e-9,r()), v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function logn(r,mu,sigma,lo,hi){ return clamp(Math.round(Math.exp(mu+sigma*gauss(r))), lo, hi); }
function pickW(r,obj){ const e=Object.entries(obj); const tot=e.reduce((a,[,w])=>a+w,0); let x=r()*tot; for(const [k,w] of e){ x-=w; if(x<=0) return k; } return e[e.length-1][0]; }
function pickAn(r,mix){ const a=pickW(r,mix||{AG:1}); return a; }
const AN_LABEL={AG:"Anesthésie générale",ALR:"Anesthésie locorégionale","AL+S":"Anesthésie locale avec sédation",AL:"Anesthésie locale",NR:"Non renseignée"};

/* ------------------------------------------------------------------ */
/* 1. Programme prévisionnel                                           */
/* ------------------------------------------------------------------ */
function planProgram(cfg, r){
  const planned=[]; let surg=1;
  const progEnd = 480 + (1110-480)*0.8*cfg.load;   // un bloc réel planifie environ 80 % de la plage
  cfg.rooms.forEach((room,ri)=>{
    const mix = STATS.rooms[room]?.mix || {"Chirurgie Générale et Digestive":1};
    const spec = pickW(r, Object.keys(mix).length? mix : {"Chirurgie Générale et Digestive":1});
    const S = STATS.specs[spec]; if(!S) return;
    const chir = "CHIR-"+String(10+((surg++)*7)%60).padStart(2,"0");
    const mar = "MAR-"+String(1+Math.floor(ri/2)).padStart(2,"0");
    let t = 480 + Math.round(r()*10), n=0;
    const roomEnd = room===cfg.urgRoom ? 480+(progEnd-480)*0.55 : progEnd;
    while(t < roomEnd-10){
      const procs = S.procs.length? S.procs : [{name:spec, n:1, mu:S.mu, sigma:S.sigma}];
      const pw={}; procs.forEach((p,i)=>pw[i]=p.n);
      const p = procs[+pickW(r,pw)];
      const d = logn(r, p.mu, Math.min(p.sigma,0.6), 8, 420);
      if(n>0 && t+d > roomEnd+15) break;
      planned.push({room, spec, proc:p.name, dur:d, planned:t, type:"P", prio:"prog", an:pickAn(r,S.an), adm: r()<S.amb?"AMB":"HOSP", ch:chir, mar});
      n++; t += d + (d<40? 8 : 15);
    }
  });
  return planned;
}

/* ------------------------------------------------------------------ */
/* 2. Urgences                                                         */
/* ------------------------------------------------------------------ */
function makeUrgences(cfg, r){
  const list=[];
  const specs = Object.fromEntries(Object.entries(STATS.urg).map(([k,v])=>[k,v.n]));
  const hours = {}; STATS.urgHours.forEach((n,h)=>{ if(h>=7 && h<=22) hours[h]=n+1; });
  const mk=(at,spec,prio,durFix,procName)=>{
    const U = STATS.urg[spec] || STATS.urg["Chirurgie Générale et Digestive"];
    const d = durFix || logn(r, U.mu, Math.min(U.sigma,0.55), 15, 300);
    const proc = procName || (U.procs.length? U.procs[Math.floor(r()*U.procs.length)] : spec);
    list.push({room:null, spec, proc, dur:d, arr:at, type:PRIO[prio].type, prio, an:pickAn(r,U.an), adm:"HOSP", ch:"CHIR-G-"+(SHORT_SPEC[spec]||"CHIR"), mar:"MAR-garde"});
  };
  for(let i=0;i<cfg.urgCount;i++){
    const h=+pickW(r,hours), at=h*60+Math.floor(r()*60);
    const x=r(), prio = x<0.12? "vitale" : x<0.7? "urgente" : "differee";
    mk(at, pickW(r,specs), prio);
  }
  if(cfg.burst && cfg.burst.n>0){
    const trauma={"Chirurgie Orthopédique":5,"Chirurgie Générale et Digestive":3,"Chirurgie Urologique":1};
    for(let i=0;i<cfg.burst.n;i++){
      const prio = i<Math.ceil(cfg.burst.n*0.35)? "vitale" : "urgente";
      mk(cfg.burst.at + Math.floor(r()*25), pickW(r,trauma), prio);
    }
  }
  cfg.events.filter(e=>e.kind==="urgence").forEach(e=>mk(e.at, e.spec, e.prio, e.dur||null));
  return list.sort((a,b)=>a.arr-b.arr);
}

/* ------------------------------------------------------------------ */
/* 3. Ordonnanceur : minute par minute                                 */
/* ------------------------------------------------------------------ */
function schedule(cfg, planned, urg, r){
  const rooms = cfg.rooms.map(n=>({n, freeAt:0, phase:"idle", cur:null, q:planned.filter(c=>c.room===n).sort((a,b)=>a.planned-b.planned)}));
  const urgRoom = cfg.rooms.includes(cfg.urgRoom) ? cfg.urgRoom : cfg.rooms[0];
  const closures = cfg.events.filter(e=>e.kind==="panne").map(e=>({room:e.room, from:e.at, to:e.until, label:e.label||"Panne"}));
  const closed=(room,t)=>closures.some(z=>z.room===room && t>=z.from && t<z.to);
  const beds = Array(cfg.sspiBeds).fill(0), bran = Array(cfg.bran).fill(0), ash = Array(cfg.ash).fill(0);
  const done=[], deprog=[], waiting=[]; let ui=0;
  const extra=[];
  const LAST_PROG_START = 1080;      // pas de programmé démarré après 18 h
  const NIGHT = 1170;                // après 19 h 30, garde réduite

  const firstFree=(arr,t)=>{ let k=-1; for(let i=0;i<arr.length;i++) if(arr[i]<=t && (k<0 || arr[i]<arr[k])) k=i; return k; };
  const start=(R,c,t)=>{
    // un brancardier amène le patient ; s'il n'y en a pas, la salle attend
    let bi=0; for(let i=1;i<bran.length;i++) if(bran[i]<bran[bi]) bi=i;
    const s = Math.max(t, bran[bi]);
    bran[bi] = s+3;
    c.an2 = inferAn({...c}).an;
    Object.assign(c, {room:R.n, s, waitBed:0});
    R.cur=c; R.phase="op"; R.opEnd=s+c.dur; R.freeAt=1e9;
    done.push(c);
  };
  const advance=(R,t)=>{
    if(R.phase==="op" && t>=R.opEnd) R.phase="lit";
    if(R.phase==="lit"){                      // sortie seulement si un lit de SSPI est libre
      const j=firstFree(beds,t); if(j<0) return;
      const c=R.cur, sd=sspiDur(c);
      c.waitBed=t-R.opEnd; c.bed=j; c.recOut=t+3+sd; beds[j]=t+3+sd+3;
      R.phase="ash";
    }
    if(R.phase==="ash"){                      // bionettoyage dès qu'un agent est libre
      const k=firstFree(ash,t+1); if(k<0) return;
      const c=R.cur, cs=t+1, ce=cs+(c.dur<40? 6 : 11);
      c.cleanStart=cs; c.cleanEnd=ce; ash[k]=ce+1;
      R.phase="clean"; R.freeAt=ce;
    }
    if(R.phase==="clean" && t>=R.freeAt){ R.phase="idle"; R.cur=null; }
  };

  for(let t=420; t<1440+720; t++){
    while(ui<urg.length && urg[ui].arr<=t) waiting.push(urg[ui++]);
    if(t===LAST_PROG_START){
      rooms.forEach(R=>{ R.q.forEach(c=>{ deprog.push(c); extra.push({t, room:R.n, txt:`Déprogrammé faute de temps : ${c.proc} (prévu à ${fmt(c.planned)})`, kind:"late"}); }); R.q=[]; });
    }
    const order = [...rooms].sort((a,b)=> (a.n===urgRoom?-1:0)-(b.n===urgRoom?-1:0));
    rooms.forEach(R=>advance(R,t));
    for(const R of order){
      if(R.phase!=="idle" || closed(R.n,t)) continue;
      const night = t>=NIGHT, isU = R.n===urgRoom;
      const vit = waiting.find(c=>c.prio==="vitale");
      const urgFree = rooms.some(x=>x.n===urgRoom && x.phase==="idle" && !closed(x.n,t));
      const urgt = waiting.find(c=>c.prio==="urgente");
      const diff = waiting.find(c=>c.prio==="differee");
      const next = R.q[0];
      let pick=null;
      if(vit && (!night || isU || !urgFree)) pick=vit;
      else if(night && !isU) pick=null;
      else if(urgt && (isU || t-urgt.arr>=45 || !next || next.planned>t+urgt.dur)) pick=urgt;
      else if(next && next.planned<=t && t<LAST_PROG_START){ pick=next; R.q.shift(); }
      else if(diff && (isU ? true : (!next || next.planned>t+diff.dur+15)) && (isU || t-diff.arr>=90 || !next)) pick=diff;
      if(!pick) continue;
      if(pick!==next){ waiting.splice(waiting.indexOf(pick),1); }
      start(R,pick,t);
    }
    if(ui>=urg.length && !waiting.length && rooms.every(R=>!R.q.length && R.phase==="idle")) break;
  }
  waiting.forEach(c=>{ deprog.push(c); });
  return {done, deprog, closures, extra};
}

/* ------------------------------------------------------------------ */
/* 4. Bilan                                                            */
/* ------------------------------------------------------------------ */
function report(res, cfg){
  const D=res.done, U=D.filter(c=>c.type!=="P"), P=D.filter(c=>c.type==="P");
  const wait=c=>c.s-c.arr, avg=a=>a.length? a.reduce((x,y)=>x+y,0)/a.length : 0;
  const vit=U.filter(c=>c.prio==="vitale"), urgt=U.filter(c=>c.prio!=="differee"), dif=U.filter(c=>c.prio==="differee");
  const over = cfg.rooms.map(r=>{ const L=D.filter(c=>c.room===r && c.type==="P"); const e=L.length? Math.max(...L.map(c=>c.s+c.dur+c.waitBed)) : 0; return Math.max(0,e-1110); });
  const sspiPeak = (()=>{ let m=0; for(let t=420;t<1440+300;t+=5){ const n=D.filter(c=>t>=c.s+c.dur+c.waitBed && t<c.recOut).length; m=Math.max(m,n); } return m; })();
  return {
    done:D.length, prog:P.length, urg:U.length,
    deprog:res.deprog.length,
    urgWait:Math.round(avg(urgt.map(wait))), urgWaitMax:Math.round(Math.max(0,...urgt.map(wait))),
    difWait:Math.round(avg(dif.map(wait))), difN:dif.length,
    vitWait:Math.round(avg(vit.map(wait))),
    late:Math.round(avg(P.map(c=>Math.max(0,c.s-c.planned)))),
    lateN:P.filter(c=>c.s-c.planned>=20).length,
    overMin:Math.round(over.reduce((a,b)=>a+b,0)), overRooms:over.filter(x=>x>0).length,
    bedBlock:Math.round(D.reduce((a,c)=>a+c.waitBed,0)), bedBlockN:D.filter(c=>c.waitBed>=3).length,
    sspiPeak, lastEnd: D.length? Math.max(...D.map(c=>c.s+c.dur+c.waitBed)) : 0
  };
}

/* ------------------------------------------------------------------ */
/* 5. Journée complète au format du moteur                             */
/* ------------------------------------------------------------------ */
let GEN_COUNT=0;
function generateDay(cfg){
  const r=rng(cfg.seed*7919+13);
  const planned=planProgram(cfg,r);
  const plannedCopy=planned.map(c=>({...c}));
  const urg=makeUrgences(cfg,r);
  const res=schedule(cfg,planned,urg,r);
  // même programme, sans aléas : pour comparer
  const base=schedule({...cfg, events:[]}, plannedCopy, [], rng(1));
  const rep=report(res,cfg), repBase=report(base,cfg);
  GEN_COUNT++;
  const cases=res.done.sort((a,b)=>a.s-b.s).map((c,i)=>({
    id:i, room:c.room, s:c.s, dur:c.dur, spec:c.spec, proc:c.proc, type:c.type, prio:c.prio, adm:c.adm,
    an:c.an, anl:AN_LABEL[c.an]||"Non renseignée", ch:c.ch, mar:c.mar,
    arr: c.type==="P" ? null : c.arr, planned: c.type==="P" ? c.planned : null,
    waitBed:c.waitBed, bed:c.bed, recOut:c.recOut, cleanStart:c.cleanStart, cleanEnd:c.cleanEnd
  }));
  const cancelled=res.deprog.map(c=>({spec:c.spec, proc:c.proc, reason: c.type==="P"? "Déprogrammé faute de temps" : "Urgence non prise en charge dans la journée"}));
  const extra=[...res.extra];
  res.closures.forEach(z=>{ extra.push({t:z.from, room:z.room, txt:`${z.label} : salle indisponible jusqu'à ${fmt(z.to)}`, kind:"u"}); extra.push({t:z.to, room:z.room, txt:"Salle de nouveau disponible", kind:"bio"}); });
  return {
    date: cfg.date || "2026-11-16", label: cfg.name || ("Simulation "+GEN_COUNT),
    generated:true, cfg:JSON.parse(JSON.stringify(cfg)), cases, cancelled,
    staff:{bran:cfg.bran, ash:cfg.ash}, sspiBeds:cfg.sspiBeds, closures:res.closures, extraEvents:extra,
    report:rep, baseline:repBase
  };
}
