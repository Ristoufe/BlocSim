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
# temps opéré par salle et par jour, selon la spécialité principale de la salle ce jour-là
# (une salle de gynécologie fait souvent 1 à 3 cas courts, une salle d'orthopédie remplit sa vacation),
# et part de ce temps prise par la spécialité principale (le reste : cas d'autres spécialités dans la même salle)
main=P.groupby(['dt','Salle'])['Spécialité'].agg(lambda s:s.value_counts().index[0]).rename('main')
Pm=P.join(main,on=['dt','Salle'])
rd=Pm.groupby(['dt','Salle']).agg(spec=('main','first'),mins=('Durée','sum'),
    mainMins=('Durée',lambda x:x[Pm.loc[x.index,'Spécialité']==Pm.loc[x.index,'main']].sum()))
for sp,g in rd.groupby('spec'):
    if sp.strip() in specs and len(g)>=5:
        specs[sp.strip()]['day']=ln(np.log(g.mins))
        specs[sp.strip()]['mainShare']=round(float((g.mainMins/g.mins).mean()),3)
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
canc=d[(d.Statut!='fermé')]['Raison Annulation'].dropna().str.strip()
canc=canc[~canc.str.contains('aisie')].value_counts(normalize=True).head(8)
# forme des journées : demi-journées, premier cas, arrivée au bloc, annulations
d['e']=d['Sortie salle'].map(mins); d['a']=d['Arrivée bloc'].map(mins)
wd=d[d.dt.dt.dayofweek<5]
cp=wd[(wd.Statut=='fermé')&(wd.Type=='programmé')&wd.Salle.astype(str).str.startswith('OP')]
g=cp.groupby(['dt','Salle']).agg(f=('s','min'),l=('e','max'))
full=g[(g.l>840)&(g.f<750)]
ad=(cp.s-cp.a); ad=ad[(ad>0)&(ad<300)]
canc_mask=(wd.Statut!='fermé')&~wd['Raison Annulation'].fillna('').str.contains('aisie')
session=dict(am=round(float((g.l<=840).mean()),3), pm=round(float((g.f>=750).mean()),3),
    amEnd=round(float(g[g.l<=840].l.median())), pmStart=round(float(g[g.f>=750].f.median())),
    firstMu=round(float(full.f.mean()),1), firstSd=round(float(full.f.std()),1))
arrival=dict(mu=round(float(np.log(ad).mean()),3), sigma=round(float(np.log(ad).std()),3))
cancelRate=round(float(canc_mask.mean()),3)
# calendrier : volume, salles ouvertes et urgences par jour de semaine et par mois
allc=d[(d.Statut=='fermé')&d.s.notna()].copy()
allc['wd']=allc.dt.dt.dayofweek; allc['mo']=allc.dt.dt.month
alld=allc.groupby('dt').agg(n=('s','size'), wd=('wd','first'), mo=('mo','first'),
    urg=('Type', lambda x: x.isin(['urgence','Urg différé']).sum()),
    prog=('Type', lambda x: (x=='programmé').sum()),
    rooms=('Salle', lambda x: x[(allc.loc[x.index,'Type']=='programmé') & x.astype(str).str.startswith('OP')].nunique()))
wdays=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]
calendar=dict(
  weekday={wdays[k]:dict(days=int(len(g)), prog=round(float(g.prog.mean()),1), rooms=round(float(g.rooms.mean()),2),
        urg=[int(x) for x in g.urg.values]) for k,g in alld.groupby('wd')},
  month={int(k):dict(days=int(len(g)), progWeekday=round(float(g[g.wd<5].prog.mean()),1)) for k,g in alld.groupby('mo')})
wkMean=float(alld[alld.wd<5].prog.mean())
for k,v in calendar['month'].items(): v['factor']=round(v['progWeekday']/wkMean,3)
for k,v in calendar['weekday'].items(): v['factor']=round(v['prog']/wkMean,3)
# bionettoyage réel : Fin bio - Sortie salle, quantiles 0 à 100 % par pas de 5 %
d['fb']=d['Fin bio'].map(mins)
bc=d[(d.Statut=='fermé')&d.Salle.astype(str).str.startswith('OP')&d['Durée'].between(3,600)].copy()
bc['bio']=bc.fb-bc.e; bc=bc[bc.bio.between(0,120)]
qs=[i/20 for i in range(21)]
bq=lambda x:[round(float(v),1) for v in x.bio.quantile(qs).values]
bio=dict(court=bq(bc[(bc.Type=='programmé')&(bc['Durée']<40)]), long=bq(bc[(bc.Type=='programmé')&(bc['Durée']>=40)]), urgence=bq(bc[bc.Type!='programmé']), n=int(len(bc)))
out=dict(calendar=calendar, bio=bio, session=session, arrival=arrival, cancelRate=cancelRate, source="Export OPROOM, janvier à octobre 2026", specs=specs, rooms=rooms, urg=urg,
    urgHours=[int(x) for x in hours.values], urgRoom=uroom.index[0],
    urgPerWeekday=round(float(U[U.dt.dt.dayofweek<5].groupby('dt').size().mean()),2),
    progPerRoomDay=round(float(P.groupby(['dt','Salle']).size().mean()),2),
    cancelReasons={k:round(float(v),3) for k,v in canc.items()})
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
for col in ['Chirurgien','Anesthésiste']:
    for n in d[col].dropna().astype(str).str.strip().unique():
        if len(n)>3 and n in s: sys.exit('Fuite de nom détectée : export annulé')
# la calibration du moteur (tools/calibrer.js) n'est pas tirée de l'export : on la conserve
try:
    old=json.load(open(os.path.join(ROOT,'data','stats.json'),encoding='utf-8'))
    if 'calib' in old:
        out['calib']=old['calib']; s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
except Exception: pass
open(os.path.join(ROOT,'data','stats.json'),'w').write(s)
print('data/stats.json :',len(s),'octets |',len(specs),'spécialités |',len(rooms),'salles | salle urgences',out['urgRoom'],'| urg/jour',out['urgPerWeekday'],'| prog/salle/jour',out['progPerRoomDay'])
print({r:(v['open'],list(v['mix'])[:2]) for r,v in rooms.items()})
print(list(urg))
