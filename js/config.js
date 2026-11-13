/* Blocapta BlocSim - géométrie du bloc, rôles, états */
/* ------------------------------------------------------------------ */
/* Géométrie du bloc                                                   */
/* ------------------------------------------------------------------ */
const W = 1840, H = 960, CY = 485;
const ROLE = {
  CHIR:{label:"Chirurgien", color:"#2f6b4f", cap:"#1d4532"},
  MAR:{label:"Anesthésiste (MAR)", color:"#2952a3", cap:"#17336e"},
  IADE:{label:"IADE", color:"#5b9be0", cap:"#2f6fb8"},
  IBODE:{label:"IBODE instrumentiste", color:"#139c8b", cap:"#0b6b5f"},
  CIRC:{label:"IBODE / IDE circulante", color:"#8bbd3c", cap:"#5f8a1f"},
  ASH:{label:"Agent de bionettoyage", color:"#e3a21a", cap:"#a8740a"},
  BRAN:{label:"Brancardier", color:"#9a7259", cap:"#6b4b37"},
  IDESSPI:{label:"IDE de SSPI", color:"#c2386f", cap:"#8a1f4b"},
  PAT:{label:"Patient", color:"#ffffff", cap:"#9fb4c4"}
};
const STATE = {
  ferme:{label:"Fermée", color:"#9aa6ab"},
  libre:{label:"Libre", color:"#b9c3c6"},
  prepa:{label:"Préparation", color:"#6f8fa6"},
  accueil:{label:"Accueil", color:"#c77700"},
  induc:{label:"Induction", color:"#d4880f"},
  instal:{label:"Installation", color:"#3d8f86"},
  chir:{label:"Opératoire", color:"#0b7a6e"},
  ferm:{label:"Fermeture", color:"#1f6a8a"},
  reveil:{label:"Réveil", color:"#6d5bb5"},
  bio:{label:"Bionettoyage", color:"#3a9ad9"},
  attente:{label:"Attente lit SSPI", color:"#c2412d"},
  panne:{label:"Panne", color:"#5b3a3a"}
};
const PHASES = [
  {k:"accueil", n:"Accueil et check-list"},
  {k:"induc", n:"Induction"},
  {k:"instal", n:"Installation et badigeon"},
  {k:"chir", n:"Temps opératoire"},
  {k:"ferm", n:"Fermeture et pansement"},
  {k:"reveil", n:"Réveil en salle"},
  {k:"bio", n:"Bionettoyage"}
];

const ROOMS = {};
const ORDER = ["OP 2","OP 3","OP 4","OP 5","OP 6","OP 7","OP 8","OP 9","OP 10","OP 11"];
ORDER.forEach((n,i)=>{
  const col = i%5, top = i<5, x = 270+col*254, y = top?40:530, w = 238, h = 400;
  ROOMS[n] = {name:n, label:n, x, y, w, h, top, sign: top?1:-1, k:1,
    door:{x:x+w/2, y: top? y+h : y}, cx:x+w/2, cy: top? y+h*0.44 : y+h*0.56};
});
ROOMS["SSPI"] = {name:"SSPI", label:"Box actes", x:1690, y:300, w:130, h:140, top:true, sign:1, k:0.55,
  door:{x:1755, y:440}, cx:1755, cy:372, small:true};
const ZONES = {
  ACC:{x:20,y:40,w:230,h:400, door:{x:135,y:440}, label:"Accueil patients"},
  OFF:{x:20,y:530,w:230,h:400, door:{x:135,y:530}, label:"Office et salle de pause"},
  REC:{x:1550,y:40,w:270,h:400, door:{x:1615,y:440}, label:"SSPI"},
  ARS:{x:1550,y:530,w:270,h:400, door:{x:1685,y:530}, label:"Arsenal et régulation"}
};
function doorOf(z){ return ROOMS[z] ? ROOMS[z].door : ZONES[z].door; }

/* positions de poste autour de la table */
function spot(room, role, idx){
  const R = ROOMS[room], s = R.sign, k = R.k, cx = R.cx, cy = R.cy;
  const P = (dx,dy)=>({x:cx+dx*k, y:cy+dy*k*s, z:room});
  switch(role){
    case "TABLE": return P(0,0);
    case "MAR": return P(-24,-72);
    case "IADE": return P(24,-68);
    case "CHIR": return P(40,6);
    case "CONSOLE": return {x:R.x+R.w-34, y: R.top? R.y+R.h-62 : R.y+62, z:room};
    case "IBODE": return P(-40,18);
    case "CIRC": return P(-78,-30);
    case "BRAN": return P(30,96);
    case "ASH": return P(-60,60);
    case "PREP": return P(-70,30);
    default: return P(0,0);
  }
}
const ACC_SLOTS = []; for(let r=0;r<5;r++) for(let c=0;c<2;c++) ACC_SLOTS.push({x:70+c*95, y:95+r*68, z:"ACC"});
const REC_BEDS = []; for(let r=0;r<4;r++) for(let c=0;c<2;c++) REC_BEDS.push({x:1600+c*110, y:85+r*52, z:"REC", c, r});
const OFF_SLOTS = []; for(let r=0;r<7;r++) for(let c=0;c<4;c++) OFF_SLOTS.push({x:48+c*52, y:590+r*46, z:"OFF"});
const ARS_SLOTS = []; for(let r=0;r<4;r++) for(let c=0;c<3;c++) ARS_SLOTS.push({x:1610+c*70, y:640+r*58, z:"ARS"});
const EXIT = {x:24, y:250, z:"ACC"};
