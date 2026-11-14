# Tests de cohérence de BlocSim

Ce dossier ajoute des tests **autour** du simulateur. Il ne modifie aucun fichier existant du dépôt : les scripts lisent le code de BlocSim et écrivent leurs résultats ailleurs.

Il complète `npm test`, `npm run check` et la validation interne (`validateDay`), sans les refaire. Il recalcule les contraintes à partir de la **sortie** du simulateur (cas, annulations, bilan, CSV), et cherche ce que ces tests ne couvrent pas. Analyse faite sur `main` au commit `3664855`. Les résultats sont déterministes : mêmes graines, mêmes chiffres.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `stress.js` | Génère des journées en perturbant au hasard les 67 paramètres du modèle, balaie les bornes de chaque paramètre, lance des tests métamorphiques et des expériences ciblées. |
| `analyse-llm.js` | Optionnel. Fait relire une journée par un modèle local (Ollama). Le code calcule des faits numérotés, le modèle les interprète, et le script vérifie ses citations. |
| `diagnostic.js` | Pour un réglage donné, liste les personnes présentes à deux endroits en même temps (animation), avec l'heure, les salles et la cause probable. Utile en cas de régression : il ne trouve plus rien aujourd'hui. |
| `exemple-resultats/rapport-3664855.txt` | Sortie réelle de `stress.js` (300 journées, graine par défaut). |

## Lancer

Depuis la racine du dépôt. Node 18 ou plus, rien à installer. Compter environ une minute.

```bash
node tests-coherence/stress.js 300 --out=../resultats-tests
node tests-coherence/stress.js 300 --rapide --out=../resultats-tests   # moitié moins d'expériences
node tests-coherence/stress.js 300 --sans-experiences                   # seulement les journées aléatoires

# Optionnel : analyse par un modèle local (Ollama doit tourner)
node tests-coherence/analyse-llm.js --dry-run --scenario=afflux --graines=1-3
```

`stress.js` écrit dans le dossier `--out` (par défaut `tests-coherence/sorties/`, ignoré par git) : `rapport.txt`, `resultats_par_journee.csv` (une ligne par journée, ouvrable dans Excel), `anomalies.json` et `repro/<code>.json`. Chaque fichier `repro/` se rejoue avec la CLI du dépôt :

```bash
node tools/simulate.js --config ../resultats-tests/repro/K1.json --sans-csv
```

## Lire le rapport

- **journées en échec** : nombre de journées où la règle est violée au moins une fois, sur le nombre testé (par exemple `65/300`). Pour M1, M2 et P1, c'est le nombre de **tests**, pas de journées.
- **moy./journée** : total des violations divisé par le nombre testé, en minutes cumulées ou en nombre d'occurrences.
- **Une règle violée n'est pas forcément un bug.** Les codes `G10`, `I1` et `I2` décrivent des choix de modélisation ou des indicateurs à discuter avec les équipes du bloc.

## Légende des codes

| Préfixe | Ce qui est contrôlé |
| --- | --- |
| **K** | Conservation des patients et cohérence entre le bilan et la sortie. |
| **V** | La validation interne de l'équipe (`validateDay`) : on compte les journées où elle signale quelque chose. |
| **D** | Les contraintes physiques, **recalculées à partir de la sortie seule** (sans passer par `validateDay`). |
| **G** | Des règles de l'ordonnanceur. |
| **N** | La règle de garde de nuit du GUIDE. |
| **I** | Des indicateurs de qualité de service, pas des règles. |
| **M** | Des tests métamorphiques : on change une entrée et on vérifie ce qui doit rester identique. |
| **P** | Le balayage des bornes de chaque paramètre. |
| **C** | Le CSV exporté. |
| **E** | L'animation (`js/engine.js`) sur les journées simulées. |
| **R** | Les mêmes contrôles que **E** sur les 6 vraies journées de `data/days.json` (R1 = E1, etc.). |
| **X** | Une exception levée par le code. N'apparaît que si le simulateur plante. |

### K, V, D (cohérence et contraintes)

| Code | Règle vérifiée |
| --- | --- |
| K1 | Chaque patient généré est réalisé ou annulé (aucun n'est absent de la sortie). |
| K1b | Aucun patient n'est en trop (dupliqué). |
| K2 | Le bilan (`report`) annonce les mêmes nombres de cas réalisés, programmés et urgences que la sortie. |
| K3 | Le bilan annonce les mêmes nombres de déprogrammations et d'annulations avant le jour J que la sortie. |
| V1 | `validateDay` ne signale aucune violation. |
| D1 | Un chirurgien n'opère pas dans deux salles à la fois. |
| D2 | Un anesthésiste n'est pas à une induction ou un réveil dans deux salles à la fois. |
| D3_IADE, D3_IBODE, D3_CIRC | Une équipe n'est pas dans deux salles à la fois. |
| D4 | Un agent de bionettoyage n'est pas dans deux salles à la fois. |
| D5 | Un lit de SSPI n'a pas deux patients à la fois. |
| D6 | Jamais plus de patients en SSPI que de lits. |
| D7 | Deux patients ne sont jamais dans la même salle. |

### G, N, I (règles et indicateurs)

| Code | Ce qui est vérifié |
| --- | --- |
| G2 | Aucun cas programmé ne démarre plus de 15 min après l'heure limite. |
| G9 | Un patient qui finit plus tard ne sort pas de salle avant un autre qui attend un lit. |
| G10 | Une panne qui démarre pendant une opération la laisse continuer. Choix de modèle. |
| G12 | Aucun cas ne finit après minuit (le CSV replierait l'heure sans changer la date). |
| G14 | Aucune valeur non finie (NaN) dans les cas. |
| N1 | De nuit, au plus le nombre d'équipes de garde et d'astreinte prévu par le GUIDE (garde + 2 rappelées en cas d'afflux). |
| N2 | De nuit, au plus un anesthésiste de garde, plus un rappelé en cas d'afflux. |
| I1 | Indicateur : urgence immédiate opérée après son délai maximal (15 min). |
| I2 | Indicateur : urgence immédiate ou sous 1 h opérée hors délai alors qu'un cas moins prioritaire démarre dans la même salle pendant son attente. À expliquer. |

### C, E, M, P

| Code | Règle vérifiée |
| --- | --- |
| C1 | Dans le CSV, arrivée ≤ entrée en salle ≤ sortie de salle ≤ arrivée SSPI ≤ sortie du bloc (hors cas passant minuit). |
| C2 | Chaque ligne a le même nombre de colonnes que l'en-tête. |
| C3 | Pour une urgence, l'attente écrite dans le CSV détaillé est celle du bilan. |
| C4 | Le CSV contient autant de lignes réalisées et annulées que la sortie. |
| E1_`rôle` | Animation : personne présente à deux endroits en même temps (minutes cumulées). |
| E2_`rôle` | Animation : personne qui arrive à son poste avec plus de 3 min de retard. |
| E3, E5, E6 | Animation : lit de SSPI double, visite de durée négative, seuils jour/nuit différents entre ordonnanceur et animation. |
| M1 | Changer une capacité (lits, brancardiers, brancards, agents, IDE de SSPI) ne change ni les patients, ni les urgences, ni les annulations, ni les absents. |
| M2 | Trois lits de SSPI de plus n'augmentent jamais le blocage en salle. |
| P1 | Chaque paramètre à ses deux bornes ne provoque ni exception, ni NaN, ni patient perdu, ni violation de validation. |

Les rôles : `CHIR` chirurgien, `MAR` anesthésiste, `IADE` infirmier anesthésiste, `IBODE` infirmier de bloc opératoire, `CIRC` circulante, `BRAN` brancardier, `ASH` agent de bionettoyage. Le suffixe `-garde` désigne l'équipe ou l'anesthésiste de garde.

### Expériences ciblées (bas du rapport)

| Bloc | Ce qu'il mesure |
| --- | --- |
| `balayageDesBornes` | Les paramètres à leurs bornes qui posent problème. |
| `M1`, `M2` | Détail des tests métamorphiques. |
| `effetDesScenarios` | Pour chaque scénario prêt à l'emploi, moyenne de l'attente des urgences, du retard, du débordement, du blocage SSPI et des déprogrammations. |
| `effectifsIsoles` | Effet d'un seul brancardier, puis d'un seul agent de bionettoyage. |
| `attenteLitSSPIparSalle` | Attente moyenne d'un lit de SSPI selon la salle (scénario « SSPI sous tension »). |
| `urgencesImmediatesAfflux14h` | Urgences immédiates dans le délai, et attente, dans l'afflux de 14 h. |
| `passageDeMinuit` | Part des journées avec un cas après minuit, selon le nombre d'urgences. |
| `patientsPerdusParScenario` | Part des journées avec un patient perdu (K1), par scénario. |

## Résultats principaux (commit `3664855`)

Sur 300 journées aléatoires, 42 des 50 contrôles ne trouvent rien, dont toutes les contraintes physiques recalculées (D1 à D7), le CSV (C1 à C4), la règle de garde de nuit (N1, N2), la validation interne (V1) et les nombres aléatoires communs (M1 : 100 changements de capacité, 0 écart).

1. **K1 et K2 : des patients disparaissent de la sortie.** La simulation s'arrête à 7 h le lendemain (`END = 1440 + DAY0`, `generator.js` ligne 697) et `generateDay` retire les cas dont la dernière phase n'est pas terminée (ligne 975), sans les compter comme annulés. 39 journées sur 300 avec des réglages aléatoires ; 0 à 3 % des journées sur les scénarios prêts à l'emploi (100 tirages), 0 % pour l'afflux. Le bilan compte le patient, pas le CSV.
2. **G12 : le CSV replie l'heure après minuit** sans changer la date. 223 journées sur 300 ; 70 % des journées avec 6 urgences en moyenne.
3. **I1 et I2 : des urgences immédiates dépassent leur délai de 15 min.** 2 % en journée type, 27 % en afflux, 29 % en dimanche de garde (jusqu'à 501 min). Dans 15 à 36 % des urgences immédiates ou sous 1 h hors délai, un cas moins prioritaire démarre dans la même salle pendant l'attente (36 % sur seulement 11 cas en journée type). La cause est à expliquer.
4. **Mineurs** : G9 (42 journées sur 300), G10 (113, choix de modèle), E2_BRAN (38 journées avec un brancardier en retard dans l'animation).

## Ce que l'équipe a déjà corrigé

Une première version de ces tests, sur le commit `df26b93`, avait trouvé des problèmes que `main` ne présente plus : l'attente des urgences contradictoire entre bilan et CSV, les équipes de garde présentes dans plusieurs salles à la fois, le débordement de l'horizon de 36 h, la baseline « sans aléas » faussée, l'attribution des lits de SSPI selon l'ordre des salles, et un brancardage qui n'avait aucun effet sur le programme.

Entre `9f955b3` et `3664855`, deux autres points ont disparu : les violations de `validateDay` (« 6 patients pour 1 agent » en SSPI la nuit, après un afflux de 11 victimes) et la perte d'un patient avec `urgCount` à 25. La perte de patients globale passe de 65 à 39 journées sur 300.

## Limites

- Les règles ont été choisies en lisant le code : un problème qui ne correspond à aucune règle n'apparaît pas.
- Les tests portent sur le moteur et les exports, pas sur le rendu visuel.
- Les résultats dépendent de la version du dépôt : comparer toujours à version égale.
- `I1` et `I2` sont des indicateurs. Ils décrivent des choix de modélisation (disponibilité des chirurgiens, délai de rappel du plan blanc) à valider avec les équipes du bloc.
