"""Exporte des journées de l'export OPROOM vers data/days.json, en pseudonymisant les soignants.

Usage : python3 tools/export_days.py [chemin/vers/OPROOM.xls] [AAAA-MM-JJ ...]
Par défaut : data/raw/OPROOM.xls et les 6 journées de démonstration.
Dépendances : pandas, xlrd.
"""
import pandas as pd, json, re, sys, os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'data','raw','OPROOM.xls')
d=pd.read_excel(SRC); d.columns=[c.strip() for c in d.columns]
d['dt']=pd.to_datetime(d['Date'],format='%d/%m/%y')
def codes(col,prefix):
    vc=d[col].dropna().str.strip().value_counts()
    return {n:f"{prefix}-{i+1:02d}" for i,n in enumerate(vc.index)}
CH=codes('Chirurgien','CHIR'); MAR=codes('Anesthésiste','MAR')
def m(t):
    if not isinstance(t,str) or ':' not in t: return None
    h,mi=t.strip().split(':')[:2]; return int(h)*60+int(mi)
def anes(a):
    a=str(a) if isinstance(a,str) else ''
    if 'générale' in a: return 'AG'
    if 'rachi' in a or 'péridurale' in a or 'plexique' in a or 'locorégionale' in a: return 'ALR'
    if 'sédation' in a: return 'AL+S'
    if 'locale' in a: return 'AL'
    return 'NR'
days=sys.argv[2:] or ['2026-06-04','2026-10-29','2026-05-11','2026-02-17','2026-08-27','2026-01-25']
J={'Monday':'Lundi','Tuesday':'Mardi','Wednesday':'Mercredi','Thursday':'Jeudi','Friday':'Vendredi','Saturday':'Samedi','Sunday':'Dimanche'}
M=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
out=[]
for ds in days:
    day=d[d.dt==ds]; c=day[(day.Statut=='fermé')&(day['Durée']<=600)].copy()
    c['s']=c['Heure'].map(m); c=c.sort_values('s')
    cases=[]
    for i,r in enumerate(c.itertuples()):
        cases.append(dict(id=i, room=r.Salle.strip(), s=int(r.s), dur=int(r.Durée),
            spec=r.Spécialité.strip(), proc=re.sub(r'\s+',' ',str(r.Procédure)).strip(),
            type={'programmé':'P','urgence':'U','Urg différé':'UD'}.get(r.Type,'P'),
            adm={'Ambulatoire':'AMB','Hospitalisation':'HOSP'}.get(r.Admission,'EXT'),
            an=anes(getattr(r,'_20')), anl=str(getattr(r,'_20')) if isinstance(getattr(r,'_20'),str) else 'Non renseignée',
            ch=CH.get(str(r.Chirurgien).strip(),'CHIR-??'), mar=MAR.get(str(r.Anesthésiste).strip(),'MAR-??'),
            arr=m(r._9) if isinstance(r._9,str) else None,
            bio=(lambda so,fb: fb-so if so is not None and fb is not None and 0<=fb-so<=120 else None)(m(r._11) if isinstance(r._11,str) else None, m(r._12) if isinstance(r._12,str) else None)))
    an=day[day.Statut!='fermé']
    canc=[dict(spec=r.Spécialité.strip(),proc=re.sub(r'\s+',' ',str(r.Procédure)).strip(),reason=(r._23 if isinstance(r._23,str) else 'Non renseigné').strip()) for r in an.itertuples()]
    dt=pd.Timestamp(ds)
    out.append(dict(date=ds,label=f"{J[dt.day_name()]} {dt.day} {M[dt.month-1]} 2026",cases=cases,cancelled=canc))
    print(ds,len(cases),len(canc),sorted(set(x['room'] for x in cases)), sum(1 for x in cases if x['arr'] is not None))
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
bad=[n for n in list(CH)+list(MAR) if len(n)>3 and n in s]
if bad: sys.exit("Fuite de nom détectée, export annulé")
open(os.path.join(ROOT,'data','days.json'),'w').write(s); print('data/days.json :',len(s),'octets')
