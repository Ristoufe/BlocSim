# Exemple de rapport de campagne BlocSim (3 000 journées, profil réaliste)

Produit par `npm run campagne -- --n 3000 --graine 2026`. Les fichiers contextes.csv et configs.jsonl se régénèrent à l'identique avec la même commande (dossier campagnes/, non versionné).

- Journées simulées : 3000
- Profil : réaliste (situations à leur fréquence estimée)
- Année : 2026 - graine de campagne 2026
- Contrôles de cohérence : 5 785 011 vérifications, 0 incohérence (personne à deux endroits, MAR à plus de deux patients, SSPI sans IDE, brancards, lits)

Chaque journée est rejouable : sa configuration complète est dans configs.jsonl (champ cfg), à charger avec `npm run sim -- --config`.

## 1. Couverture des situations

| Famille de situation | Journées | Part |
| --- | ---: | ---: |
| Journée ordinaire | 1583 | 52,8 % |
| Sous-effectif paramédical | 290 | 9,7 % |
| SSPI ou aval sous tension | 244 | 8,1 % |
| Programme surchargé | 198 | 6,6 % |
| Panne de salle ou d'équipement | 138 | 4,6 % |
| Brancardage limité | 163 | 5,4 % |
| Patients en retard ou non prêts | 77 | 2,6 % |
| Vérifications avant l'anesthésie défaillantes | 103 | 3,4 % |
| Stérilisation ou matériel en tension | 90 | 3,0 % |
| Panne informatique (mode dégradé) | 34 | 1,1 % |
| Forte activité d'enseignement | 66 | 2,2 % |
| Afflux de victimes | 14 | 0,5 % |

| Jour | Journées | Part |
| --- | ---: | ---: |
| lundi | 396 | 13,2 % |
| mardi | 452 | 15,1 % |
| mercredi | 445 | 14,8 % |
| jeudi | 451 | 15,0 % |
| vendredi | 409 | 13,6 % |
| samedi | 439 | 14,6 % |
| dimanche | 408 | 13,6 % |

| Période | Journées | Part |
| --- | ---: | ---: |
| normale | 1546 | 51,5 % |
| vacances | 1131 | 37,7 % |
| epidemie | 323 | 10,8 % |

| Mois | Journées | Part |
| --- | ---: | ---: |
| janvier | 266 | 8,9 % |
| février | 208 | 6,9 % |
| mars | 255 | 8,5 % |
| avril | 233 | 7,8 % |
| mai | 269 | 9,0 % |
| juin | 225 | 7,5 % |
| juillet | 263 | 8,8 % |
| août | 247 | 8,2 % |
| septembre | 257 | 8,6 % |
| octobre | 274 | 9,1 % |
| novembre | 251 | 8,4 % |
| décembre | 252 | 8,4 % |

Salles ouvertes : de 1 à 8 (médiane 5). Afflux de victimes : 14 journées. Pannes de salle programmées : 62 journées.

## 2. Distribution des indicateurs (toutes journées)

| Indicateur | Moyenne | P5 | Médiane | P95 | Max | Unité |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Interventions réalisées | 19,4 | 3,0 | 20,0 | 39,0 | 60 |  |
| Urgences opérées | 5,7 | 2,0 | 6,0 | 10,0 | 15 |  |
| Déprogrammations faute de temps | 2,1 | 0,0 | 1,0 | 9,0 | 30 |  |
| Annulations le jour même (accueil) | 0,7 | 0,0 | 0,0 | 3,0 | 8 |  |
| Patients absents | 0,3 | 0,0 | 0,0 | 2,0 | 5 |  |
| Cas perdus (salle fermée) | 0,6 | 0,0 | 0,0 | 4,0 | 22 |  |
| Urgences reportées au lendemain | 0,0 | 0,0 | 0,0 | 0,0 | 4 |  |
| Retard moyen du programmé | 27,9 | 0,0 | 23,0 | 78,0 | 248 | min |
| Attente moyenne des urgences | 83,0 | 23,0 | 72,0 | 173,0 | 452 | min |
| Attente maximale d'une urgence | 264,3 | 80,0 | 229,0 | 580,0 | 1298 | min |
| Urgences dans leur délai | 93,6 | 67,0 | 100,0 | 100,0 | 100 | % |
| Débordement après 18 h 30 | 7,5 | 0,0 | 0,0 | 46,0 | 446 | min |
| Salle prête, patient absent | 49,7 | 0,0 | 13,0 | 205,0 | 1481 | min |
| Attente MAR | 15,3 | 0,0 | 12,0 | 47,0 | 94 | min |
| Attente chirurgien | 34,7 | 0,0 | 11,0 | 163,0 | 692 | min |
| Blocage en salle faute de place en SSPI | 1,2 | 0,0 | 0,0 | 9,0 | 142 | min |
| Attente brancard ou brancardier | 55,7 | 0,0 | 9,0 | 247,0 | 2746 | min |
| Attente en pré-anesthésie | 73,5 | 0,0 | 43,0 | 255,0 | 1120 | min |
| Attente équipement | 5,6 | 0,0 | 0,0 | 19,0 | 740 | min |
| Sortie de SSPI retardée | 66,1 | 0,0 | 1,0 | 287,0 | 983 | min |
| Pic de la SSPI | 3,6 | 1,0 | 4,0 | 6,0 | 10 | lits |
| Pic de la SSPI / lits ouverts | 38,4 | 10,0 | 40,0 | 75,0 | 100 | % |
| Ambulatoires convertis en hospitalisation | 0,2 | 0,0 | 0,0 | 1,0 | 4 |  |
| Complications peropératoires | 0,8 | 0,0 | 1,0 | 3,0 | 7 |  |
| Soignants absents | 0,3 | 0,0 | 0,0 | 2,0 | 6 |  |
| Vérifications avant l'anesthésie | 27,7 | 0,0 | 0,0 | 111,0 | 324 | min |
| Annulations (jeûne, anticoagulant, examen, implant) | 0,3 | 0,0 | 0,0 | 1,0 | 4 |  |
| Reports en fin de programme (jeûne) | 0,1 | 0,0 | 0,0 | 0,0 | 2 |  |
| Attente de boîtes d'instruments | 20,3 | 0,0 | 0,0 | 87,0 | 2282 | min |
| Attente de matériel (implant, dispositif, chariot) | 8,7 | 0,0 | 0,0 | 35,0 | 113 | min |
| Attente du manipulateur radio | 20,5 | 0,0 | 22,0 | 58,0 | 150 | min |
| Attente d'examens extemporanés | 15,9 | 0,0 | 0,0 | 69,0 | 443 | min |
| Attente de produits sanguins | 12,1 | 0,0 | 0,0 | 57,0 | 144 | min |
| Attente d'un brancardier pour la SSPI | 7,3 | 0,0 | 1,0 | 34,0 | 123 | min |
| Interventions avec un interne | 2,6 | 0,0 | 2,0 | 8,0 | 21 |  |
| Intubations difficiles | 0,2 | 0,0 | 0,0 | 1,0 | 3 |  |
| Mode dégradé informatique | 3,6 | 0,0 | 0,0 | 0,0 | 239 | min |

Jours ouvrés seulement : 2153 journées, 25,3 interventions en moyenne dont 6,2 urgences, 3,0 déprogrammations.

## 3. Comparaison par famille de situation (moyennes)

| Famille | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journée ordinaire | 1583 | 19,7 | 1,7 | 0,2 | 25,1 | 93,7 | 82,4 | 6,7 | 1,0 | 29,6 | 15,3 | 14,2 | 27,3 |
| Sous-effectif paramédical | 290 | 17,7 | 3,0 | 0,2 | 40,4 | 92,0 | 86,9 | 6,1 | 1,7 | 229,7 | 13,8 | 7,1 | 25,0 |
| SSPI ou aval sous tension | 244 | 19,5 | 1,7 | 0,2 | 26,9 | 94,4 | 83,8 | 5,1 | 2,6 | 29,1 | 15,9 | 10,5 | 26,4 |
| Programme surchargé | 198 | 20,2 | 4,2 | 0,3 | 25,4 | 93,3 | 89,9 | 8,0 | 0,8 | 30,0 | 16,0 | 16,6 | 28,4 |
| Panne de salle ou d'équipement | 138 | 18,5 | 1,8 | 0,2 | 29,1 | 94,5 | 77,8 | 7,9 | 0,7 | 20,9 | 15,5 | 19,5 | 23,7 |
| Brancardage limité | 163 | 18,9 | 2,6 | 0,2 | 30,8 | 93,2 | 79,7 | 5,1 | 1,4 | 173,0 | 14,9 | 5,8 | 21,8 |
| Patients en retard ou non prêts | 77 | 18,8 | 1,6 | 0,2 | 27,0 | 94,4 | 86,6 | 6,6 | 1,4 | 21,8 | 13,9 | 23,7 | 25,7 |
| Vérifications avant l'anesthésie défaillantes | 103 | 20,1 | 2,0 | 0,7 | 33,1 | 95,2 | 75,9 | 7,6 | 1,4 | 20,2 | 17,0 | 6,9 | 62,6 |
| Stérilisation ou matériel en tension | 90 | 18,4 | 3,0 | 0,3 | 31,7 | 93,2 | 88,9 | 35,3 | 0,8 | 20,3 | 14,8 | 251,7 | 28,9 |
| Panne informatique (mode dégradé) | 34 | 18,8 | 1,1 | 0,2 | 22,0 | 91,3 | 73,1 | 6,4 | 0,6 | 15,9 | 13,3 | 11,4 | 22,1 |
| Forte activité d'enseignement | 66 | 19,0 | 2,1 | 0,3 | 26,0 | 94,7 | 78,5 | 7,0 | 1,1 | 22,5 | 15,3 | 15,7 | 20,9 |
| Afflux de victimes | 14 | 31,9 | 4,9 | 0,4 | 57,7 | 79,2 | 88,4 | 11,9 | 0,0 | 136,9 | 33,7 | 21,8 | 42,9 |

### Par période

| Période | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| normale | 1546 | 20,3 | 2,4 | 0,3 | 28,5 | 94,0 | 80,2 | 8,7 | 1,1 | 65,7 | 16,4 | 24,0 | 29,6 |
| vacances | 1131 | 18,3 | 1,8 | 0,2 | 26,4 | 93,3 | 83,8 | 6,0 | 1,2 | 46,0 | 14,4 | 16,5 | 26,2 |
| epidemie | 323 | 18,7 | 2,2 | 0,3 | 30,3 | 92,4 | 93,9 | 7,0 | 2,0 | 41,7 | 13,5 | 16,1 | 24,2 |

### Par jour

| Jour | n | Réalisées | Déprog. | Annul. vérif. | Retard (min) | Urg. dans délai (%) | Attente urg. (min) | Débord. (min) | Blocage SSPI (min) | Att. brancard (min) | Att. MAR (min) | Att. boîtes (min) | Vérif. (min) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lundi | 396 | 23,8 | 2,3 | 0,4 | 37,3 | 95,6 | 72,8 | 9,6 | 1,0 | 69,3 | 19,6 | 22,4 | 36,8 |
| mardi | 452 | 24,9 | 2,1 | 0,3 | 38,7 | 95,6 | 69,6 | 9,2 | 1,3 | 73,1 | 20,6 | 36,6 | 40,9 |
| mercredi | 445 | 26,0 | 3,2 | 0,4 | 39,6 | 96,4 | 75,3 | 10,6 | 1,4 | 88,0 | 22,7 | 25,6 | 37,1 |
| jeudi | 451 | 28,7 | 5,4 | 0,4 | 37,9 | 96,2 | 75,5 | 16,5 | 1,7 | 110,5 | 24,8 | 32,2 | 46,4 |
| vendredi | 409 | 22,5 | 1,6 | 0,3 | 40,8 | 93,5 | 84,7 | 5,8 | 1,6 | 41,2 | 18,5 | 21,4 | 30,8 |
| samedi | 439 | 4,4 | 0,0 | 0,0 | 0,0 | 89,5 | 103,4 | 0,0 | 0,7 | 0,8 | 0,0 | 0,9 | 0,0 |
| dimanche | 408 | 4,6 | 0,0 | 0,0 | 0,0 | 87,8 | 100,7 | 0,0 | 0,7 | 0,8 | 0,0 | 1,2 | 0,0 |

## 4. Sensibilité : quels réglages pèsent sur quels indicateurs

Corrélation de rang de Spearman entre chaque réglage tiré et chaque indicateur, calculée sur les jours ouvrés. Signe + : l'indicateur augmente avec le réglage. Seules les valeurs d'au moins 0,15 en valeur absolue sont affichées.

| Réglage | Déprog. | Retard | Débord. | Blocage SSPI | Att. brancard | Att. urg. | Salle sans patient | Att. MAR | Att. boîtes | Vérif. | Annul. vérif. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Remplissage du programme | +0,35 |  |  |  |  |  |  |  |  |  |  |
| Salles ouvertes | +0,35 |  | +0,21 |  | +0,44 |  | +0,35 | +0,34 | +0,20 | +0,21 |  |
| Brancardiers |  |  |  |  | -0,60 |  |  |  |  |  |  |
| Agents de bionettoyage |  |  |  |  | -0,15 |  |  |  |  |  |  |
| MAR supplémentaires |  |  |  |  | -0,17 |  |  |  |  |  |  |
| Hospitalisés amenés dans leur lit |  |  |  |  | -0,20 |  |  |  |  |  |  |
| Examen manquant |  |  |  |  |  |  |  |  |  | +0,20 |  |
| Parc de boîtes d'instruments |  |  |  |  |  |  |  |  | -0,17 |  |  |
| Boîtes non conformes |  |  |  |  |  |  |  |  | +0,20 |  |  |
| Panne d'autoclave |  |  |  |  |  |  |  |  | +0,27 |  |  |
| Intubations difficiles |  |  |  |  |  |  |  | +0,15 |  |  |  |
| Part d'interventions avec interne | +0,25 |  |  |  | +0,18 |  |  | +0,16 |  |  |  |

## 5. Journées les plus difficiles

Classement par un score de tension (déprogrammations, débordement, blocage SSPI, urgences hors délai ou reportées, salles fermées). Rejouer une journée : prendre sa ligne dans configs.jsonl.

| # | Famille | Date | Période | Salles | Réalisées | Déprog. | Débord. (min) | Blocage SSPI (min) | Urg. dans délai | Urg. reportées |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 197 | Sous-effectif paramédical | jeudi 2026-12-10 | normale | 7 | 30 | 19 | 0 | 14 | 89 % | 0 |
| 631 | Programme surchargé | vendredi 2026-04-17 | vacances | 4 | 26 | 30 | 27 | 0 | 89 % | 0 |
| 2624 | Sous-effectif paramédical | jeudi 2026-04-30 | vacances | 7 | 25 | 29 | 0 | 0 | 100 % | 0 |
| 2312 | Journée ordinaire | jeudi 2026-02-19 | epidemie | 5 | 29 | 7 | 0 | 1 | 83 % | 1 |
| 1910 | Sous-effectif paramédical | jeudi 2026-03-12 | normale | 7 | 32 | 21 | 0 | 14 | 90 % | 0 |
| 46 | Sous-effectif paramédical | jeudi 2026-05-14 | normale | 7 | 24 | 4 | 175 | 0 | 100 % | 0 |
| 1312 | Afflux de victimes | mercredi 2026-02-18 | epidemie | 7 | 20 | 11 | 21 | 0 | 62 % | 0 |
| 1724 | Sous-effectif paramédical | jeudi 2026-09-17 | normale | 8 | 43 | 19 | 14 | 0 | 100 % | 0 |
| 1580 | Vérifications avant l'anesthésie défaillantes | jeudi 2026-04-16 | vacances | 7 | 32 | 13 | 0 | 0 | 80 % | 0 |
| 117 | Sous-effectif paramédical | mardi 2026-02-17 | vacances | 5 | 15 | 3 | 0 | 0 | 83 % | 0 |
| 2426 | Sous-effectif paramédical | mardi 2026-11-17 | normale | 7 | 22 | 6 | 7 | 9 | 100 % | 0 |
| 2283 | Stérilisation ou matériel en tension | jeudi 2026-10-01 | normale | 5 | 23 | 6 | 186 | 9 | 43 % | 4 |
| 945 | Sous-effectif paramédical | jeudi 2026-12-03 | normale | 8 | 32 | 24 | 54 | 0 | 100 % | 0 |
| 2455 | Journée ordinaire | mardi 2026-01-27 | epidemie | 4 | 13 | 5 | 0 | 0 | 22 % | 3 |
| 1970 | Programme surchargé | jeudi 2026-11-12 | normale | 7 | 49 | 25 | 0 | 0 | 100 % | 0 |

## 6. Contrôles de cohérence

Aucune incohérence sur 3000 journées : aucune personne à deux endroits, aucun MAR à plus de deux patients hors anesthésie locale, aucune SSPI sans IDE, aucun brancard ou lit utilisé deux fois.

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
