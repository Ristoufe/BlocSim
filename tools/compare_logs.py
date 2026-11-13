"""Compare des journées simulées (CSV au format OPROOM) aux données réelles.

Usage : python3 tools/compare_logs.py [data/raw/OPROOM.xls] [fichiers CSV ...]
Par défaut : tous les CSV de logs/ (hors versions détaillées).
"""
import pandas as pd, numpy as np, sys, os, glob, warnings
warnings.filterwarnings("ignore")
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'data','raw','OPROOM.xls')
files=sys.argv[2:] or [f for f in glob.glob(os.path.join(ROOT,'logs','*.csv')) if not f.endswith('-detail.csv') and '-bilan-' not in f]
if not files: sys.exit("Aucun CSV de simulation trouvé dans logs/ : lancez une simulation avec npm start.")
R=pd.read_excel(raw,dtype=str); R.columns=[c.strip() for c in R.columns]
S=pd.concat([pd.read_csv(f,sep=';',dtype=str,encoding='utf-8-sig').assign(_f=f) for f in files],ignore_index=True)
S['Date']=S['Date']+'#'+S['_f'].astype('category').cat.codes.astype(str)
def prep(d):
    d=d.copy(); d['day']=d['Date'].astype(str); d['dt']=pd.to_datetime(d['Date'].astype(str).str.split('#').str[0].str.slice(0,10),format='mixed',dayfirst=True)
    if d['day'].str.contains('#').any(): d['dt']=d['day']
    m=lambda t: (int(t[:2])*60+int(t[3:5])) if isinstance(t,str) and ':' in t else np.nan
    for c in ['Heure','Arrivée bloc','Sortie salle']: d[c+'_m']=d[c].map(m)
    d['Durée']=pd.to_numeric(d['Durée'],errors='coerce'); return d
R=prep(R); S=prep(S)
R=R[R.dt.dt.dayofweek<5]  # jours de semaine
R['dt']=R['dt'].astype(str)
# garder jours "pleins" réels (>=10 interventions) pour comparer à une journée type
rc=R[R.Statut=='fermé']; full=rc.groupby('dt').size(); fd=full[full>=10].index
R=R[R.dt.isin(fd)]; rc=R[R.Statut=='fermé']; sc=S[S.Statut=='fermé']
def qh(s,qs=(.25,.5,.75)): s=s.dropna(); return " / ".join(f"{int(s.quantile(x))//60:02d}:{int(s.quantile(x))%60:02d}" for x in qs)
def q(s,qs=(.25,.5,.75)): s=s.dropna(); return " / ".join(f"{s.quantile(x):.0f}" for x in qs)
rows=[]
def add(name,r,s): rows.append((name,r,s))
add('Jours comparés', f"{len(fd)} jours de semaine réels", f"{S.dt.nunique()} journées simulées")
add('Interventions réalisées / jour (Q1/méd/Q3)', q(rc.groupby('dt').size()), q(sc.groupby('dt').size()))
add('Salles utilisées / jour', q(rc[rc.Salle.str.startswith('OP')].groupby('dt').Salle.nunique()), q(sc.groupby('dt').Salle.nunique()))
add('Interventions par salle et par jour', q(rc[rc.Salle.str.startswith('OP')].groupby(['dt','Salle']).size()), q(sc.groupby(['dt','Salle']).size()))
add('Urgences / jour (U + UD)', q(rc[rc.Type.isin(['urgence','Urg différé'])].groupby('dt').size().reindex(fd,fill_value=0)), q(sc[sc.Type.isin(['urgence','Urg différé'])].groupby('dt').size()))
add('Part ambulatoire', f"{(rc.Admission=='Ambulatoire').mean():.0%}", f"{(sc.Admission=='Ambulatoire').mean():.0%}")
add('Durée en salle, min (Q1/méd/Q3)', q(rc['Durée'][rc['Durée']<=600]), q(sc['Durée']))
fc=lambda d: d[d.Type=='programmé'].groupby(['dt','Salle']).Heure_m.min()
add('1re entrée en salle du programmé', qh(fc(rc)), qh(fc(sc)))
le=lambda d: d[d.Type=='programmé'].groupby(['dt','Salle']).Sortie_salle_m.max() if 'Sortie_salle_m' in d else None
R['Sortie_salle_m']=R['Sortie salle_m']; S['Sortie_salle_m']=S['Sortie salle_m']; rc=R[R.Statut=='fermé']; sc=S[S.Statut=='fermé']
add('Dernière sortie de salle du programmé', qh(le(rc)), qh(le(sc)))
def gaps(d):
    d=d[d.Type=='programmé'].sort_values(['dt','Salle','Heure_m']); g=d.Heure_m-d.groupby(['dt','Salle']).Sortie_salle_m.shift(); return g[(g>=0)&(g<180)]
add('Délai entre 2 cas, même salle (min)', q(gaps(rc)), q(gaps(sc)))
ar=lambda d: (d.Heure_m-d['Arrivée bloc_m'])[d.Type=='programmé']
add('Arrivée au bloc → entrée en salle (min)', q(ar(rc)[(ar(rc)>=0)&(ar(rc)<300)]), q(ar(sc)))
ann=lambda d: (d.Statut!='fermé').groupby(d.dt).mean()
add('Part de lignes annulées / déprogrammées', f"{(R.Statut!='fermé').mean():.0%}", f"{(S.Statut!='fermé').mean():.0%}")
for name,a,b in rows: print(f"{name:50s} | {a:30s} | {b}")
# spécialités
print()
rs=rc[rc.Type=='programmé']['Spécialité'].value_counts(normalize=True); ss=sc[sc.Type=='programmé']['Spécialité'].value_counts(normalize=True)
t=pd.DataFrame({'réel':rs,'simulé':ss}).fillna(0).sort_values('réel',ascending=False)
t['réel_dur']=rc[rc.Type=='programmé'].groupby('Spécialité')['Durée'].median(); t['sim_dur']=sc[sc.Type=='programmé'].groupby('Spécialité')['Durée'].median()
print((t.assign(**{'réel':t['réel'].map('{:.0%}'.format),'simulé':t['simulé'].map('{:.0%}'.format)})).to_string())
# heures urgences
uh=lambda d: (d[d.Type.isin(['urgence','Urg différé'])].Heure_m//60).value_counts(normalize=True).sort_index()
u=pd.DataFrame({'réel':uh(rc),'simulé':uh(sc)}).fillna(0)
print('\nUrgences : part entre 8h et 18h  réel %.0f%%  simulé %.0f%%' % (u.loc[8:17,'réel'].sum()*100, u.loc[8:17,'simulé'].sum()*100))
print('Urgences : part de nuit (avant 8h ou après 20h) réel %.0f%% simulé %.0f%%' % ((u.loc[:7,'réel'].sum()+u.loc[20:,'réel'].sum())*100,(u.loc[:7,'simulé'].sum()+u.loc[20:,'simulé'].sum())*100))
an=lambda d: d['Anesth réalisée'].fillna('NR').str.extract(r'(générale|locorégionale|sédation|locale)')[0].fillna('non renseignée').value_counts(normalize=True)
print('\nAnesthésie réel', an(rc).round(2).to_dict()); print('Anesthésie sim ', an(sc).round(2).to_dict())
# occupation : somme durées / (salles ouvertes * 630)
occ=lambda d: (d[d.Heure_m.between(480,1110)].groupby(['dt','Salle'])['Durée'].sum()/630)
print('\nOccupation 8h-18h30 par salle ouverte, médiane : réel %.0f%%  simulé %.0f%%' % (occ(rc[rc.Salle.str.startswith('OP')]).median()*100, occ(sc).median()*100))
# fin de journée > 18h30
print('Salles qui finissent après 18h30 : réel %.0f%%  simulé %.0f%%' % ((le(rc)>1110).mean()*100,(le(sc)>1110).mean()*100))
