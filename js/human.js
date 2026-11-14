/* Blocapta BlocSim - modèle humain : agents soignants persistants sur plusieurs jours
 *
 * Chaque soignant (chirurgien, anesthésiste, IADE, IBODE) est un agent avec :
 *   - un corps   : fatigue F (0 à 1), qui monte avec le travail et récupère la nuit
 *   - une tête   : charge de travail ressentie (indice 0 à 100, inspiré du NASA-TLX / SURG-TLX)
 *                  et risque d'erreur (modèle de Reason : plus de fatigue, de charge, de mode dégradé = plus de risque)
 *   - un état d'esprit : confiance dans l'outil T (0 à 1), mise à jour avec aversion à la perte
 *   - des relations : la confiance diffuse entre collègues qui travaillent ensemble (réseau pondéré)
 *
 * Chaque paramètre porte sa source ou la mention « à calibrer » (HUMAN_PARAMS_DOC).
 */

const HUMAN_DEFAULTS = {
  lambda: 1.955,      // aversion à la perte (méta-analyse Brown et al. 2024 ; plage 1,8 - 2,25)
  alpha: 0.08,        // vitesse d'apprentissage de la confiance - à calibrer
  kappaScale: 1,      // multiplie la sensibilité aux collègues de chaque profil - à calibrer
  learnB: 0.5,        // exposant de la loi puissance de l'apprentissage (Newell et Rosenbloom 1981) - à calibrer
  useLow: 0.2,        // en dessous de cette confiance, l'agent contourne l'outil (TAM / UTAUT) - à calibrer
  useHigh: 0.55,      // au-dessus, il l'utilise toujours - à calibrer
  tlxAlert: 70,       // charge ressentie au-dessus de laquelle on signale une surcharge - à calibrer
  errBase: 0.002,     // probabilité d'erreur de saisie par usage, hors fatigue et surcharge - à calibrer
  paperErr: 1.5,      // l'ancienne méthode (papier, recopie) se trompe 1,5 fois plus qu'une saisie outillée - à calibrer
  scarHit: 0.5,       // mémoire d'une panne subie (0 à 1) - à calibrer
  scarHalfLife: 15    // jours ouvrés pour que cette mémoire diminue de moitié - à calibrer
};

const HUMAN_PARAMS_DOC = [
  {k:"lambda", label:"Aversion à la perte λ", src:"Tversky et Kahneman 1992 (2,25) ; méta-analyse Brown, Imai, Vieider, Camerer 2024 (1,955, IC 1,82-2,10)", calib:false},
  {k:"alpha", label:"Vitesse d'apprentissage α", src:"À calibrer : aucune mesure au bloc", calib:true},
  {k:"kappaScale", label:"Sensibilité aux collègues κ", src:"Profils de Rogers (1962), modèle de Bass multi-agents (Dilucchio et al. 2024). Valeurs à calibrer", calib:true},
  {k:"learnB", label:"Courbe d'apprentissage", src:"Loi puissance de la pratique (Newell et Rosenbloom 1981). Exposant à calibrer", calib:true},
  {k:"useLow", label:"Seuil de contournement", src:"TAM (Davis 1989), UTAUT (Venkatesh 2003). Seuil à calibrer", calib:true},
  {k:"tlxAlert", label:"Seuil de surcharge", src:"Indice inspiré du NASA-TLX / SURG-TLX. Seuil à calibrer", calib:true},
  {k:"errBase", label:"Risque d'erreur de base", src:"Modèle de Reason (1990). Valeur à calibrer", calib:true},
  {k:"paperErr", label:"Erreurs de l'ancienne méthode", src:"Recopie papier : à calibrer avec les audits de traçabilité du bloc", calib:true},
  {k:"scarHalfLife", label:"Mémoire d'une panne (demi-vie, jours)", src:"La confiance perdue après une défaillance se reconstruit lentement (Lee et See 2004, confiance envers l'automatisation). Durée à calibrer", calib:true}
];

// profils de Rogers : part de la population, confiance de départ, sensibilité aux collègues
const ROGERS = [
  {id:"innovateur",      share:0.025, t0:0.75, kappa:0.05},
  {id:"adopteur précoce",share:0.135, t0:0.65, kappa:0.12},
  {id:"majorité précoce",share:0.34,  t0:0.50, kappa:0.25},
  {id:"majorité tardive",share:0.34,  t0:0.40, kappa:0.30},
  {id:"retardataire",    share:0.16,  t0:0.25, kappa:0.08}
];

// gradient d'autorité (Edmondson 2003) : poids de l'influence de j sur i selon les rôles
const AUTHORITY = {
  CHIR: {CHIR:0.5, MAR:0.6, IADE:1.0, IBODE:1.2},
  MAR:  {CHIR:0.4, MAR:0.5, IADE:1.0, IBODE:0.6},
  IADE: {CHIR:0.2, MAR:0.3, IADE:0.6, IBODE:0.6},
  IBODE:{CHIR:0.2, MAR:0.2, IADE:0.6, IBODE:0.6}
};
// charge de base ressentie par métier (ordre de grandeur des scores SURG-TLX publiés, à calibrer)
const TLX_BASE = {CHIR:52, MAR:48, IADE:50, IBODE:52};
const ROLE_LABEL = {CHIR:"Chirurgiens", MAR:"Anesthésistes", IADE:"IADE", IBODE:"IBODE"};

/* ------------------------------------------------------------------ */
/* Population                                                          */
/* ------------------------------------------------------------------ */
function makeTeam(params, seed, profiles){
  const P = {...HUMAN_DEFAULTS, ...(params||{})};
  const r = rng(seed*104729+17);
  return { P, r, seed, agents:{}, ties:{}, profiles:profiles||[], day:0, log:[] };
}

// tirage propre à chaque soignant (graine + code) : son profil ne dépend pas de l'ordre des rencontres
// ni des tirages d'usage de l'outil, donc il est le même dans tous les bras d'une campagne
function codeRng(H, code){ let h=H.seed>>>0; for(const ch of code) h=Math.imul(h^ch.charCodeAt(0), 2654435761)>>>0; const r=rng(h); r(); r(); return r; }
function pickRogers(r){ let x=r(); for(const g of ROGERS){ x-=g.share; if(x<=0) return g; } return ROGERS[ROGERS.length-1]; }

// un agent est identifié par son code (CHIR-24, MAR-03, IBODE OP4...)
function agentOf(H, role, code, room){
  let a = H.agents[code];
  if(a) return a;
  const ar = codeRng(H, code);
  const g = pickRogers(ar);
  const exp = role==="CHIR"||role==="MAR" ? 4+Math.floor(ar()*2) : 2+Math.floor(ar()*4);   // Dreyfus 1 (novice) à 5 (expert)
  a = H.agents[code] = {
    code, role, room, profile:g.id, exp,
    T:g.t0, T0:g.t0, kappa:g.kappa, influence:1,
    F:0.15, uses:0, fails:0, gaps:0, scar:0,
    // compteurs de la journée
    dWork:0, dTool:0, dExtra:0, dSaved:0, dOut:0, dErr:0, dEnd:0, dUses:0, dGaps:0,
    hist:[]
  };
  // profils imposés par le scénario (chirurgien senior réticent, champion...)
  for(const p of H.profiles){
    if(p.role===role && (!p.room || p.room===room) && !p.taken){
      p.taken = code;
      if(p.T!=null){ a.T=a.T0=p.T; }
      if(p.kappa!=null) a.kappa=p.kappa;
      if(p.influence!=null) a.influence=p.influence;
      a.profile = p.label || a.profile; a.forced = true;
    }
  }
  return a;
}

// les agents qui travaillent sur une intervention : chirurgien, anesthésiste, IADE et IBODE de la salle
function caseTeam(H, c){
  const night = c.s<450 || c.s>=1110;
  const tag = night ? "garde" : c.room.replace("OP ","OP");
  return {
    CHIR: agentOf(H,"CHIR",c.ch,c.room),
    MAR: agentOf(H,"MAR",c.mar,c.room),
    IADE: agentOf(H,"IADE","IADE "+tag,c.room),
    IBODE: agentOf(H,"IBODE","IBODE "+tag,c.room)
  };
}

/* ------------------------------------------------------------------ */
/* Confiance : aversion à la perte                                     */
/* ------------------------------------------------------------------ */
// o : résultat perçu de l'usage (1 = réussi et utile, 0 = panne). L'attente est la confiance actuelle.
// ΔT = α·δ si δ ≥ 0 ; α·λ·δ si δ < 0   (Kahneman et Tversky 1979)
function trustEvent(H, a, o){
  const d = o - a.T;
  const dT = d>=0 ? H.P.alpha*d : H.P.alpha*H.P.lambda*d;
  a.T = clamp(a.T + dT, 0, 1);
  return dT;
}

// probabilité d'utiliser l'outil plutôt que de le contourner (intention d'usage du TAM)
function useProb(H, a){ return clamp((a.T-H.P.useLow)/(H.P.useHigh-H.P.useLow), 0, 1); }

/* ------------------------------------------------------------------ */
/* Une intervention : temps passé sur l'outil, confiance, risque       */
/* ------------------------------------------------------------------ */
// tool : paramètres de l'outil (voir js/tool.js) ou null pour le bras « sans outil »
// day  : { outages:[{from,to}] } pannes de l'outil ce jour-là
// renvoie les minutes ajoutées au temps en salle
function humanCase(H, c, s, tool, day){
  const team = caseTeam(H, c);
  const members = Object.values(team);
  // liens de travail : ceux qui opèrent ensemble se connaissent
  for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++){
    const k = members[i].code<members[j].code ? members[i].code+"|"+members[j].code : members[j].code+"|"+members[i].code;
    H.ties[k] = (H.ties[k]||0) + 1;
  }
  let roomDelta = 0;
  const rec = [];
  const inScope = tool && (!tool.rooms || tool.rooms.includes(c.room)) && (!tool.specs || tool.specs.includes(c.spec));
  if(inScope && !tool.active){
    // bras « sans outil » : les mêmes étapes sont faites à l'ancienne (papier, recopie)
    for(const st of tool.steps){
      const a = team[st.role]; if(!a) continue;
      a.dTool += st.without;
      a.dErr += H.P.errBase*H.P.paperErr*(1+2*a.F);
    }
  } else if(inScope){
    const out = (day.outages||[]).find(z=>s>=z.from && s<z.to);
    for(const st of tool.steps){
      const a = team[st.role]; if(!a) continue;
      let t, kind;
      if(out){
        // mode dégradé : retour à l'ancienne procédure, plus la resaisie après la panne
        t = st.without + (tool.degradedExtra||0);
        kind = "panne";
        a.dOut++; a.fails++;
        if(a.firstOut==null) a.firstOut = H.day;       // jour de la première panne subie
        const o = tool.supportOnSite ? 0.25 : 0;      // un support présent rend la panne moins frustrante
        trustEvent(H, a, o);
        if(!a.scarToday){ a.scar += H.P.scarHit*(tool.supportOnSite?0.5:1)*(1-a.scar); a.scarToday=true; }
        a.dErr += H.P.errBase*3*(1+2*a.F);
      } else if(H.r() < useProb(H, a)){
        // usage : courbe d'apprentissage, ralentie par la fatigue
        const n = a.uses++;
        const learn = 1 + tool.learn0*Math.pow(n+1, -H.P.learnB);
        t = st.with*learn*(1+0.2*a.F);
        const micro = H.r() < tool.microFail;        // échec ponctuel (scan illisible, écran figé)
        // réussi mais plus lent que l'ancienne méthode : frustrant ; le souvenir d'une panne rend un succès moins rassurant
        let o = micro ? 0 : (t<=st.without ? 1 : 0.6)*(1-0.5*a.scar);
        if(micro){ t += st.without; a.fails++; }
        trustEvent(H, a, o);
        a.dUses++;
        kind = micro ? "echec" : "usage";
        const expF = a.exp>=4 ? 0.8 : a.exp<=2 ? 1.3 : 1;  // Dreyfus : un novice se trompe plus
        a.dErr += H.P.errBase*expF*(1+2*a.F)*(n<10?1.5:1);
      } else {
        // contournement : l'agent garde l'ancienne méthode, l'outil n'est pas renseigné
        t = st.without; kind = "contournement";
        a.gaps++; a.dGaps++;
        a.dErr += H.P.errBase*H.P.paperErr*(1+2*a.F);
      }
      a.dTool += t; a.dExtra += Math.max(0, t-st.without); a.dSaved += Math.max(0, st.without-t);
      if(st.inRoom) roomDelta += t - st.without;
      rec.push({role:st.role, kind, min:Math.round(t*10)/10});
    }
  }
  const total = c.dur + roomDelta;
  for(const a of members){ a.dWork += total; a.dEnd = Math.max(a.dEnd, s+total); }
  c.tool = rec.length ? rec : null;
  return roomDelta;
}

/* ------------------------------------------------------------------ */
/* Fin de journée : fatigue, charge ressentie, diffusion en réseau     */
/* ------------------------------------------------------------------ */
function humanEndDay(H, gapDays){
  const P = H.P, list = Object.values(H.agents);
  for(const a of list){
    const worked = a.dWork>0;
    const over = Math.max(0, a.dEnd-1110);            // minutes après 18 h 30
    // charge ressentie (0 - 100), inspirée du NASA-TLX : temps de travail, surcoût de l'outil, pannes, fatigue
    const tlx = worked ? clamp(TLX_BASE[a.role] + 22*(a.dWork/420-1) + 120*(a.dExtra-a.dSaved)/Math.max(60,a.dWork) + 6*a.dOut + 0.1*over + 12*a.F, 0, 100) : null;
    // fatigue : monte avec le temps de travail et les heures supplémentaires, récupère pendant le repos
    if(worked) a.F = clamp(a.F + (1-a.F)*0.35*(a.dWork/480) + over/600, 0, 1);
    a.F = a.F*Math.pow(0.55, gapDays);                 // récupération : une nuit, ou plus après un week-end
    a.scar *= Math.pow(0.5, 1/P.scarHalfLife); a.scarToday = false;
    a.hist.push({day:H.day, T:a.T, F:a.F, tlx, uses:a.dUses, gaps:a.dGaps, out:a.dOut, err:a.dErr, worked});
  }
  // diffusion : ΔT_i = κ_i · Σ_j w_ij · (T_j - T_i)   (Bass / Rogers sur réseau, poids normalisés)
  const dT = {};
  for(const a of list){
    let sw=0, s=0;
    for(const b of list){
      if(a===b) continue;
      const k = a.code<b.code ? a.code+"|"+b.code : b.code+"|"+a.code;
      const tie = H.ties[k]; if(!tie) continue;
      const w = (AUTHORITY[b.role]?.[a.role]||0.5) * b.influence * Math.log1p(tie);
      sw += Math.abs(w); s += w*(b.T-a.T);
    }
    dT[a.code] = sw>0 ? a.kappa*P.kappaScale*s/sw : 0;
  }
  for(const a of list){ a.T = clamp(a.T + dT[a.code], 0, 1); a.dWork=a.dTool=a.dExtra=a.dSaved=a.dOut=a.dErr=a.dEnd=a.dUses=a.dGaps=0; }
  H.day++;
}

/* ------------------------------------------------------------------ */
/* Indicateurs humains d'une journée                                   */
/* ------------------------------------------------------------------ */
function humanDaySummary(H){
  const list = Object.values(H.agents);
  const byRole = {};
  for(const role of Object.keys(ROLE_LABEL)){
    const L = list.filter(a=>a.role===role && a.hist.length);
    const last = L.map(a=>a.hist[a.hist.length-1]);
    const w = last.filter(h=>h.worked);
    byRole[role] = {
      T: L.length ? L.reduce((x,a)=>x+a.T,0)/L.length : null,
      F: w.length ? w.reduce((x,h)=>x+h.F,0)/w.length : null,
      tlx: w.length ? w.reduce((x,h)=>x+h.tlx,0)/w.length : null,
      over: w.filter(h=>h.tlx>H.P.tlxAlert).length
    };
  }
  const last = list.map(a=>a.hist[a.hist.length-1]).filter(Boolean);
  const uses = last.reduce((x,h)=>x+h.uses,0), gaps = last.reduce((x,h)=>x+h.gaps,0);
  return {
    byRole,
    T: list.length ? list.reduce((x,a)=>x+a.T,0)/list.length : null,
    adoption: uses+gaps ? uses/(uses+gaps) : null,
    gaps, uses,
    err: last.reduce((x,h)=>x+h.err,0),
    overload: last.filter(h=>h.worked && h.tlx>H.P.tlxAlert).length,
    lowTrust: list.filter(a=>a.T<0.3).length,

    agents: list.length
  };
}
