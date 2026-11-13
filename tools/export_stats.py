"""Calcule data/stats.json : distributions réelles qui servent à générer des journées.

Usage : python3 tools/export_stats.py [chemin/vers/OPROOM.xls]
Rien de nominatif n'est exporté : spécialités, actes, durées, horaires, salles.
"""
import pandas as pd, numpy as np, json, re, sys, os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'data','raw','OPROOM.xls')
d=pd.read_excel(SRC); d.columns=[c.strip() for c in d.columns]
d['dt']=pd.to_datetime(d['Date'],format='%d/%m/%y')
def mins(t):
    try: h,m=str(t).split(':')[:2]; return int(h)*60+int(m)
    except: return None
d['s']=d['Heure'].map(mins)
def anes(a):
    a=str(a) if isinstance(a,str) else ''
    if 'générale' in a: return 'AG'
    if 'rachi' in a or 'péridurale' in a or 'plexique' in a or 'locorégionale' in a: return 'ALR'
    if 'sédation' in a: return 'AL+S'
    if 'locale' in a: return 'AL'
    return 'NR'
d['an']=d['Anesth réalisée'].map(anes)
d['proc']=d['Procédure'].astype(str).str.replace(r'\s+',' ',regex=True).str.strip()
c=d[(d.Statut=='fermé')&(d['Durée'].between(3,600))&d.s.notna()].copy()
c['wd']=c.dt.dt.dayofweek<5
c['ld']=np.log(c['Durée'])
P=c[(c.Type=='programmé')&c.wd]
U=c[c.Type.isin(['urgence','Urg différé'])]
def ln(s): return dict(mu=round(float(s.mean()),4), sigma=round(float(max(0.15,s.std() if len(s)>1 else 0.4)),4))
def anmix(df):
    v=df.an.value_counts(normalize=True); return {k:round(float(x),3) for k,x in v.items()}
specs={}
for sp,g in P.groupby('Spécialité'):
    if len(g)<20: continue
    procs=[]
    for pr,h in g.groupby('proc'):
        if len(h)<4 or pr=='nan': continue
        procs.append(dict(name=pr, n=int(len(h)), **ln(h.ld)))
    procs=sorted(procs,key=lambda x:-x['n'])[:14]
    specs[sp.strip()]=dict(n=int(len(g)), **ln(g.ld), an=anmix(g), amb=round(float((g.Admission=='Ambulatoire').mean()),3), procs=procs)
rooms={}
days=P.dt.nunique()
for r,g in P.groupby('Salle'):
    r=r.strip()
    if not r.startswith('OP'): continue
    perday=g.groupby('dt')['Spécialité'].agg(lambda s:s.value_counts().index[0])
    mix=perday.value_counts(normalize=True)
    rooms[r]=dict(open=round(float(g.dt.nunique()/days),3), mix={k.strip():round(float(v),3) for k,v in mix.items() if k.strip() in specs})
urg={}
for sp,g in U.groupby('Spécialité'):
    if len(g)<5: continue
    urg[sp.strip()]=dict(n=int(len(g)), **ln(g.ld), an=anmix(g), procs=[p for p,_ in g.proc.value_counts().head(8).items() if p!='nan'])
hours=U.s.floordiv(60).value_counts().reindex(range(24),fill_value=0)
uroom=U[U.Salle.str.startswith('OP')].Salle.str.strip().value_counts()
canc=d[d.Statut!='fermé']['Raison Annulation'].dropna().str.strip().value_counts(normalize=True).head(8)
out=dict(source="Export OPROOM, janvier à octobre 2026", specs=specs, rooms=rooms, urg=urg,
    urgHours=[int(x) for x in hours.values], urgRoom=uroom.index[0],
    urgPerWeekday=round(float(U[U.dt.dt.dayofweek<5].groupby('dt').size().mean()),2),
    progPerRoomDay=round(float(P.groupby(['dt','Salle']).size().mean()),2),
    cancelReasons={k:round(float(v),3) for k,v in canc.items()})
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
for col in ['Chirurgien','Anesthésiste']:
    for n in d[col].dropna().astype(str).str.strip().unique():
        if len(n)>3 and n in s: sys.exit('Fuite de nom détectée : export annulé')
open(os.path.join(ROOT,'data','stats.json'),'w').write(s)
print('data/stats.json :',len(s),'octets |',len(specs),'spécialités |',len(rooms),'salles | salle urgences',out['urgRoom'],'| urg/jour',out['urgPerWeekday'],'| prog/salle/jour',out['progPerRoomDay'])
print({r:(v['open'],list(v['mix'])[:2]) for r,v in rooms.items()})
print(list(urg))
