# Exemple de rapport de campagne BlocSim (2 000 jours ouvrés, profil contrastes)

Produit par `npm run campagne -- --n 2000 --profil contrastes --sans-weekend --graine 2026`. Les fichiers contextes.csv et configs.jsonl se régénèrent à l'identique avec la même commande (dossier campagnes/, non versionné).

- Journées simulées : 2000
- Profil : contrastes (familles de situations à poids égal)
- Année : 2026, jours ouvrés seulement - graine de campagne 2026
- Contrôles de cohérence : 4 106 467 vérifications, 0 incohérence (personne à deux endroits, MAR à plus de deux patients, SSPI sans IDE, brancards, lits)

Chaque journée est rejouable : sa configuration complète est dans configs.jsonl (champ cfg), à charger avec `npm run sim -- --config`.

## 1. Couverture des situations

| Famille de situation | Journées | Part |
| --- | ---: | ---: |
| Journée ordinaire | 166 | 8,3 % |
| Sous-effectif paramédical | 179 | 8,9 % |
| SSPI ou aval sous tension | 149 | 7,5 % |
| Programme surchargé | 172 | 8,6 % |
| Panne de salle ou d'équipement | 157 | 7,8 % |
| Brancardage limité | 191 | 9,6 % |
| Patients en retard ou non prêts | 186 | 9,3 % |
| Vérifications avant l'anesthésie défaillantes | 145 | 7,3 % |
| Stérilisation ou matériel en tension | 163 | 8,2 % |
| Panne informatique (mode dégradé) | 162 | 8,1 % |
| Forte activité d'enseignement | 146 | 7,3 % |
| Afflux de victimes | 184 | 9,2 % |

| Jour | Journées | Part |
| --- | ---: | ---: |
| lundi | 413 | 20,6 % |
| mardi | 393 | 19,6 % |
| mercredi | 405 | 20,3 % |
| jeudi | 427 | 21,4 % |
| vendredi | 362 | 18,1 % |

| Période | Journées | Part |
| --- | ---: | ---: |
| normale | 1045 | 52,3 % |
| vacances | 714 | 35,7 % |
| epidemie | 241 | 12,1 % |

| Mois | Journées | Part |
| --- | ---: | ---: |
| janvier | 162 | 8,1 % |
| février | 127 | 6,3 % |
| mars | 192 | 9,6 % |
| avril | 164 | 8,2 % |
| mai | 126 | 6,3 % |
| juin | 180 | 9,0 % |
| juillet | 183 | 9,2 % |
| août | 145 | 7,3 % |
| septembre | 180 | 9,0 % |
| octobre | 176 | 8,8 % |
| novembre | 170 | 8,5 % |
| décembre | 195 | 9,8 % |

Salles ouvertes : de 2 à 8 (médiane 5). Afflux de victimes : 184 journées. Pannes de salle programmées : 120 journées.

## 2. Distribution des indicateurs (toutes journées)

| Indicateur | Moyenne | P5 | Médiane | P95 | Max | Unité |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Interventions réalisées | 25,7 | 13,0 | 25,0 | 39,0 | 54 |  |
| Urgences opérées | 6,7 | 3,0 | 6,0 | 12,0 | 19 |  |
| Déprogrammations faute de temps | 3,5 | 0,0 | 2,0 | 12,0 | 27 |  |
| Annulations le jour même (accueil) | 1,0 | 0,0 | 1,0 | 3,0 | 10 |  |
| Patients absents | 0,5 | 0,0 | 0,0 | 2,0 | 6 |  |
| Cas perdus (salle fermée) | 0,8 | 0,0 | 0,0 | 6,0 | 27 |  |
| Urgences reportées au lendemain | 0,0 | 0,0 | 0,0 | 0,0 | 3 |  |
| Retard moyen du programmé | 41,8 | 9,0 | 37,0 | 90,0 | 292 | min |
| Attente moyenne des urgences | 78,8 | 29,0 | 71,5 | 150,0 | 461 | min |
| Attente maximale d'une urgence | 250,7 | 85,0 | 229,0 | 505,0 | 1020 | min |
| Urgences dans leur délai | 93,8 | 67,0 | 100,0 | 100,0 | 100 | % |
| Débordement après 18 h 30 | 12,8 | 0,0 | 0,0 | 64,0 | 598 | min |
| Salle prête, patient absent | 75,6 | 0,0 | 45,0 | 246,3 | 1189 | min |
| Attente MAR | 22,3 | 1,0 | 20,0 | 51,0 | 100 | min |
| Attente chirurgien | 48,5 | 0,0 | 17,0 | 206,0 | 754 | min |
| Blocage en salle faute de place en SSPI | 1,2 | 0,0 | 0,0 | 8,0 | 63 | min |
| Attente brancard ou brancardier | 84,9 | 0,0 | 26,5 | 379,0 | 2166 | min |
| Attente en pré-anesthésie | 108,3 | 6,0 | 77,5 | 318,0 | 1489 | min |
| Attente équipement | 7,9 | 0,0 | 0,0 | 46,0 | 479 | min |
| Sortie de SSPI retardée | 87,3 | 0,0 | 39,0 | 344,1 | 913 | min |
| Pic de la SSPI | 4,6 | 3,0 | 5,0 | 7,0 | 9 | lits |
| Pic de la SSPI / lits ouverts | 49,2 | 27,0 | 50,0 | 80,0 | 100 | % |
| Ambulatoires convertis en hospitalisation | 0,4 | 0,0 | 0,0 | 1,0 | 4 |  |
| Complications peropératoires | 1,0 | 0,0 | 1,0 | 3,0 | 6 |  |
| Soignants absents | 0,4 | 0,0 | 0,0 | 2,0 | 5 |  |
| Vérifications avant l'anesthésie | 40,4 | 0,0 | 31,5 | 145,0 | 313 | min |
| Annulations (jeûne, anticoagulant, examen, implant) | 0,4 | 0,0 | 0,0 | 2,0 | 4 |  |
| Reports en fin de programme (jeûne) | 0,1 | 0,0 | 0,0 | 1,0 | 2 |  |
| Attente de boîtes d'instruments | 46,7 | 0,0 | 0,0 | 257,2 | 1991 | min |
| Attente de matériel (implant, dispositif, chariot) | 12,3 | 0,0 | 7,0 | 52,0 | 167 | min |
| Attente du manipulateur radio | 19,4 | 0,0 | 21,0 | 58,0 | 132 | min |
| Attente d'examens extemporanés | 23,2 | 0,0 | 0,0 | 75,0 | 405 | min |
| Attente de produits sanguins | 16,3 | 0,0 | 0,0 | 64,0 | 149 | min |
| Attente d'un brancardier pour la SSPI | 11,1 | 0,0 | 6,0 | 42,0 | 111 | min |
| Interventions avec un interne | 3,8 | 0,0 | 3,0 | 10,0 | 24 |  |
| Intubations difficiles | 0,3 | 0,0 | 0,0 | 1,0 | 3 |  |
| Mode dégradé informatique | 4,2 | 0,0 | 0,0 | 0,0 | 239 | min |

Jours ouvrés seulement : 2000 journées, 25,7 interventions en moyenne dont 6,7 urgences, 3,5 déprogrammations.

## 3. Comparaison par famille de situation (moyennes)

| Famille | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journée ordinaire | 166 | 25,8 | 2,5 | 0,3 | 35,8 | 96,4 | 80,9 | 7,3 | 1,2 | 35,6 | 22,3 | 18,9 | 38,8 |
| Sous-effectif paramédical | 179 | 23,0 | 4,2 | 0,2 | 52,9 | 93,8 | 86,9 | 13,7 | 1,4 | 305,1 | 17,9 | 19,5 | 36,6 |
| SSPI ou aval sous tension | 149 | 25,5 | 2,3 | 0,2 | 34,6 | 96,8 | 71,4 | 6,3 | 3,0 | 41,9 | 22,4 | 13,8 | 42,3 |
| Programme surchargé | 172 | 27,8 | 5,8 | 0,4 | 33,8 | 95,3 | 72,9 | 13,2 | 0,8 | 52,1 | 23,7 | 23,8 | 42,7 |
| Panne de salle ou d'équipement | 157 | 24,8 | 2,7 | 0,4 | 41,7 | 96,4 | 79,3 | 8,2 | 1,0 | 42,6 | 20,6 | 12,5 | 39,0 |
| Brancardage limité | 191 | 25,2 | 3,6 | 0,4 | 47,1 | 96,6 | 73,9 | 9,5 | 1,0 | 237,4 | 22,1 | 14,6 | 36,0 |
| Patients en retard ou non prêts | 186 | 25,2 | 2,2 | 0,4 | 38,3 | 96,1 | 73,4 | 7,4 | 0,8 | 36,7 | 20,4 | 16,2 | 37,2 |
| Vérifications avant l'anesthésie défaillantes | 145 | 24,7 | 2,7 | 0,7 | 37,6 | 96,4 | 72,7 | 8,6 | 1,2 | 32,3 | 22,8 | 22,9 | 89,8 |
| Stérilisation ou matériel en tension | 163 | 25,1 | 4,7 | 0,4 | 42,1 | 94,2 | 85,5 | 53,5 | 1,4 | 40,0 | 18,3 | 362,8 | 28,2 |
| Panne informatique (mode dégradé) | 162 | 25,4 | 2,3 | 0,3 | 38,0 | 97,5 | 71,4 | 9,8 | 0,7 | 38,3 | 24,3 | 22,5 | 32,8 |
| Forte activité d'enseignement | 146 | 26,2 | 3,0 | 0,3 | 41,6 | 94,4 | 81,8 | 5,5 | 1,0 | 53,3 | 22,2 | 15,2 | 38,3 |
| Afflux de victimes | 184 | 29,6 | 4,8 | 0,4 | 53,8 | 73,8 | 93,3 | 9,7 | 0,8 | 54,5 | 30,0 | 24,3 | 30,6 |

### Par période

| Période | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| normale | 1045 | 26,5 | 3,9 | 0,4 | 42,8 | 94,4 | 76,6 | 13,7 | 1,2 | 92,1 | 23,0 | 50,2 | 43,0 |
| vacances | 714 | 24,7 | 2,9 | 0,3 | 39,8 | 93,0 | 80,0 | 10,7 | 1,2 | 77,5 | 22,1 | 43,3 | 38,0 |
| epidemie | 241 | 25,3 | 3,2 | 0,4 | 42,8 | 93,1 | 84,6 | 14,8 | 1,1 | 75,5 | 19,8 | 41,3 | 35,8 |

### Par jour

| Jour | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lundi | 413 | 24,2 | 2,9 | 0,3 | 42,7 | 93,6 | 77,4 | 10,4 | 0,6 | 75,5 | 21,5 | 34,5 | 38,5 |
| mardi | 393 | 24,8 | 2,3 | 0,4 | 41,1 | 93,4 | 72,9 | 13,6 | 0,8 | 81,4 | 20,9 | 39,2 | 38,1 |
| mercredi | 405 | 26,7 | 3,4 | 0,4 | 39,7 | 94,8 | 76,6 | 15,0 | 1,3 | 82,4 | 22,8 | 63,6 | 43,7 |
| jeudi | 427 | 29,3 | 6,5 | 0,4 | 41,7 | 95,0 | 79,3 | 16,7 | 1,6 | 112,2 | 26,0 | 63,4 | 45,1 |
| vendredi | 362 | 23,0 | 1,8 | 0,3 | 43,6 | 91,7 | 88,5 | 7,4 | 1,5 | 70,0 | 19,8 | 30,0 | 35,6 |

## 4. Sensibilité : quels réglages pèsent sur quels indicateurs

Corrélation de rang de Spearman entre chaque réglage tiré et chaque indicateur, calculée sur les jours ouvrés. Signe + : l'indicateur augmente avec le réglage. Seules les valeurs d'au moins 0,15 en valeur absolue sont affichées.

| Réglage | Déprog. | Retard | Débord. | Blocage SSPI | Att. brancard | Att. urg. | Salle sans patient | Att. MAR | Att. boîtes | Vérif. | Annul. vérif. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Remplissage du programme | +0,29 |  |  |  |  |  |  |  |  |  |  |
| Salles ouvertes | +0,37 |  | +0,22 |  | +0,40 | -0,15 | +0,40 | +0,30 | +0,17 | +0,16 | +0,18 |
| Brancardiers |  | -0,15 |  |  | -0,61 |  |  |  |  |  |  |
| Agents de bionettoyage |  |  |  |  | -0,20 |  |  |  |  |  |  |
| Brancards |  |  |  |  | -0,17 |  |  |  |  |  |  |
| Absences de dernière minute |  |  |  |  | +0,15 |  |  |  |  |  |  |
| Hospitalisés amenés dans leur lit |  |  |  |  | -0,24 |  |  |  |  |  |  |
| Victimes d'un afflux |  |  |  |  |  |  | -0,15 |  |  |  |  |
| Pannes de salle programmées |  |  |  |  |  |  | +0,16 |  |  |  |  |
| Examen manquant |  |  |  |  |  |  |  |  |  | +0,23 |  |
| Parc de boîtes d'instruments |  |  |  |  |  |  |  |  | -0,27 |  |  |
| Délai de stérilisation |  |  |  |  |  |  |  |  | +0,23 |  |  |
| Boîtes non conformes |  |  |  |  |  |  |  |  | +0,31 |  |  |
| Panne d'autoclave |  |  | +0,17 |  |  |  |  |  | +0,38 |  |  |
| Implant manquant |  |  |  |  |  |  |  |  | +0,17 |  |  |
| Dispositif stérile manquant |  |  |  |  |  |  |  |  | +0,20 |  |  |
| Part d'interventions avec interne | +0,21 |  |  |  | +0,20 |  |  | +0,16 |  |  |  |

## 5. Journées les plus difficiles

Classement par un score de tension (déprogrammations, débordement, blocage SSPI, urgences hors délai ou reportées, salles fermées). Rejouer une journée : prendre sa ligne dans configs.jsonl.

| # | Famille | Date | Période | Salles | Réalisées | Déprog. | Débord. (min) | Blocage SSPI (min) | Urg. dans délai | Urg. reportées |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 927 | Stérilisation ou matériel en tension | jeudi 2026-11-12 | normale | 7 | 36 | 27 | 362 | 0 | 75 % | 0 |
| 1193 | Stérilisation ou matériel en tension | jeudi 2026-06-04 | normale | 7 | 39 | 24 | 324 | 0 | 88 % | 0 |
| 1160 | Stérilisation ou matériel en tension | jeudi 2026-12-24 | epidemie | 6 | 20 | 3 | 493 | 0 | 100 % | 0 |
| 1295 | Sous-effectif paramédical | jeudi 2026-12-31 | epidemie | 6 | 18 | 5 | 0 | 0 | 100 % | 0 |
| 1770 | Stérilisation ou matériel en tension | vendredi 2026-09-25 | normale | 6 | 27 | 8 | 579 | 0 | 75 % | 0 |
| 1293 | Programme surchargé | jeudi 2026-12-31 | vacances | 7 | 38 | 22 | 100 | 0 | 67 % | 0 |
| 1112 | Sous-effectif paramédical | jeudi 2026-12-17 | epidemie | 8 | 31 | 16 | 0 | 0 | 100 % | 0 |
| 1298 | Afflux de victimes | vendredi 2026-12-25 | epidemie | 4 | 20 | 8 | 0 | 0 | 18 % | 0 |
| 145 | Stérilisation ou matériel en tension | lundi 2026-03-30 | normale | 6 | 29 | 7 | 598 | 0 | 100 % | 0 |
| 1687 | Sous-effectif paramédical | jeudi 2026-09-03 | normale | 7 | 36 | 26 | 17 | 0 | 100 % | 0 |
| 1253 | Afflux de victimes | vendredi 2026-01-23 | epidemie | 4 | 17 | 5 | 0 | 6 | 0 % | 3 |
| 1873 | Sous-effectif paramédical | vendredi 2026-04-17 | vacances | 7 | 33 | 24 | 0 | 47 | 100 % | 0 |
| 751 | Sous-effectif paramédical | jeudi 2026-05-07 | normale | 6 | 23 | 9 | 0 | 0 | 100 % | 0 |
| 1045 | Stérilisation ou matériel en tension | mercredi 2026-09-23 | normale | 6 | 32 | 11 | 413 | 1 | 100 % | 0 |
| 1172 | Stérilisation ou matériel en tension | jeudi 2026-12-31 | epidemie | 6 | 34 | 15 | 144 | 62 | 92 % | 0 |

## 6. Contrôles de cohérence

Aucune incohérence sur 2000 journées : aucune personne à deux endroits, aucun MAR à plus de deux patients hors anesthésie locale, aucune SSPI sans IDE, aucun brancard ou lit utilisé deux fois.

## 7. Hypothèses à calibrer

Ces règles et réglages ne sont pas mesurables dans l'export OPROOM. Les indicateurs qui en dépendent (séjour en SSPI, blocage en salle, attentes de transfert, délais des urgences) sont des ordres de grandeur, à confirmer avec les équipes du bloc.

- **Durée de séjour en SSPI** : anesthésie générale 55 à 85 min selon la durée de l'acte, locorégionale 45 min, sédation 25 min, locale 12 min ; × 0,8 en ambulatoire ; × 1,5 en cas de complication (l'heure de sortie de SSPI n'est remplie que pour 0,2 % des lignes)
- **Découpage des phases en salle** : accueil 8 % (4 min au plus), induction 12 % en anesthésie générale (6 à 18 min), installation 10 %, fermeture 10 %, réveil 8 % ; le reste est le temps opératoire
- **Classes d'urgence** : immédiate 8 % (délai 15 min), moins de 1 h 17 %, moins de 6 h 45 %, moins de 24 h 30 % ; préparation avant le bloc selon la classe
- **Régulation du programme** : premier cas jamais avant l'heure prévue, avancé de 30 min au plus ensuite ; déprogrammé s'il finirait après 18 h 30 ou n'a pas démarré à 18 h
- **Transferts** : brancardier : 3 à 6 min (ambulatoire) ou 6 à 11 min (hospitalisé) ; salle vers SSPI par l'IADE en 6 min ; urgence immédiate en 3 min
- **Arrivée du chirurgien** : 20 % des chirurgiens en retard au premier cas (10 à 35 min) ; astreinte en 25 min la nuit ; 5 à 15 min de jour s'il n'est pas au bloc
- **Préparation de la salle** : 2 à 6 min par l'IBODE après le bionettoyage avant le patient suivant (1 à 4 min pour une urgence), calé sur les 12 min réelles entre deux patients
- **Bionettoyage** : quantiles réels (Fin bio - Sortie salle) avec un plancher de 2 min après un cas court et 4 min après un cas long ; 20 à 30 min après un patient septique (hypothèse)
- **Plan blanc** : lors d'un afflux d'au moins 3 victimes, rappel de 1 à 2 équipes d'astreinte et d'un MAR, disponibles 30 min après l'alerte

Réglages marqués « à calibrer » (valeur par défaut) : Contexte (Période normale), Dernier démarrage d'un cas programmé (18:00), Part des chirurgiens en double salle (0 %), Postes assis (4), Postes couchés (4), IDE d'accueil (1), Délai d'appel du patient (25 min), ALR faites en pré-anesthésie (oui), Patients absents (2 %), Patients en retard (10 %), Retard moyen d'un patient (20 min), Autres annulations le jour même (1.5 %), Dossiers administratifs incomplets (4 %), Patients porteurs de BMR ou BHRe (3 %), Ambulatoires vus par le MAR le jour même (70 %), Jeûne non respecté (1.2 %), Anticoagulant ou antiagrégant non arrêté (0.5 %), Consentement manquant ou non signé (1 %), Marquage du côté absent (3 %), Examen manquant (bilan, ECG, groupe et RAI) (3 %), Discordance d'identité (0.3 %), Patient non préparé (5 %), Patients debout (ambulatoire) (oui), Brancards disponibles (10), Patients hospitalisés amenés dans leur lit (oui), Brancardiers (jour) (3), Agents de bionettoyage (jour) (3), MAR en plus des MAR de salle (1), Absences de dernière minute (3 %), Absences remplacées (80 %), Pauses repas (oui), Amplificateurs de brillance (2), Colonnes de coelioscopie (3), Échographes pour l'ALR (2), Lits de SSPI (10), Patients bloqués faute de lit en service (4 %), Places de réanimation libres (2), Fermeture de l'ambulatoire (19:00), Équipes de garde la nuit (1), Délai de venue de l'astreinte (25 min), Parc de boîtes d'instruments (1 x), Délai de retour de stérilisation (240 min), Boîtes non conformes à l'ouverture (2 %), Risque de panne d'autoclave par jour (1 %), Implant ou ancillaire manquant (1.5 %), Dispositif stérile manquant en salle (3 %), Manipulateurs radio (jour) (1), Intubations difficiles (2 %), Examens extemporanés (1 x), Transfusions peropératoires (1 x), Délai de livraison des produits sanguins (40 min), Interventions avec un interne qui opère (15 %), Brancardier pour le transfert en SSPI (oui), Risque de panne informatique par jour (2 %), Risque de panne par salle et par jour (1 %), Risque de panne par équipement et par jour (1 %), Complications peropératoires (4 %), Séjours prolongés en SSPI (10 %).

## 8. Utiliser cette campagne pour tester une fiche technique

1. Choisir les indicateurs que le logiciel promet d'améliorer (retard du programmé, déprogrammations, attente des urgences, blocage en SSPI, brancardage...).
2. Repérer dans les sections 3 et 4 les familles et les réglages où ces indicateurs se dégradent : c'est là que le logiciel doit faire ses preuves.
3. Rejouer les mêmes journées (mêmes graines, configs.jsonl) avec les réglages qui traduisent l'effet annoncé du logiciel (par exemple moins d'attente brancardier, moins de patients en retard), puis comparer contextes.csv avant et après.
4. Vérifier la robustesse sur les pires journées de la section 5, et pas seulement sur la moyenne.
