# Éléments d'un bloc opératoire utiles à l'analyse d'une journée

Version du 14 novembre 2026. Tri de la liste complète des ressources, du parcours patient et du cadrage du hackathon, pour ne garder que ce qui change le déroulement d'une journée de bloc, puis intégration dans BlocSim.

**Règle de tri.** Un élément est gardé s'il peut, un jour donné, modifier une heure, créer une attente, provoquer une annulation, consommer une ressource limitée ou demander une décision visible dans le journal de la journée. Ce qui est stable sur des mois (architecture, budget, gouvernance, textes) sert de cadre mais ne varie pas d'une journée à l'autre : il est écarté de la simulation.

Légende de l'état dans BlocSim : **intégré** (règle et paramètre en place), **partiel** (pris en compte de façon simplifiée), **plus tard** (pertinent mais demande des données ou un modèle qu'on n'a pas encore).

## Sommaire

1. [Parcours patient d'une journée](#1-parcours-patient-dune-journée)
2. [Ressources humaines](#2-ressources-humaines)
3. [Locaux](#3-locaux)
4. [Équipements](#4-équipements)
5. [Stérilisation, dispositifs et implants](#5-stérilisation-dispositifs-et-implants)
6. [Services autour du bloc](#6-services-autour-du-bloc)
7. [Informatique](#7-informatique)
8. [Hygiène et sécurité](#8-hygiène-et-sécurité)
9. [Organisation](#9-organisation)
10. [Cadrage du hackathon](#10-cadrage-du-hackathon)
11. [Éléments écartés](#11-éléments-écartés)
12. [Ce que la simulation fait varier](#12-ce-que-la-simulation-fait-varier)

## 1. Parcours patient d'une journée

| Étape | Ce qui peut se passer dans la journée | BlocSim |
| --- | --- | --- |
| Patient en ambulatoire ou en hospitalisation | Arrivée de l'UCA ou du service, retard, absence | Intégré : mode d'admission, retards, absents |
| Le brancardier va chercher le patient | Pas de brancardier libre, pas de brancard | Intégré : brancardiers et brancards comptés |
| Arrivée à pied, en fauteuil ou couché | Un patient debout ne prend ni brancard ni poste couché | Intégré : debout, fauteuil, couché |
| Salle de pré-anesthésie devant chaque salle d'opération (chaque salle est divisée en deux) | Le patient y est vérifié et préparé, puis entre en salle en une minute ; si elle est occupée, il attend dans la zone d'accueil commune | Intégré : une salle de pré-anesthésie par salle (1 ou 2 places), zone d'accueil commune en attente |
| Accueil par l'IDE ou l'IADE : identité, jeûne, traitements, allergies, préparation, examens | Discordance d'identité, patient non préparé, dossier incomplet | Intégré : temps d'accueil allongé selon la discordance |
| Visite pré-anesthésique (MAR, la veille ou le jour même) | Mobilise le MAR ; découvre un jeûne non respecté ou un anticoagulant non arrêté | Intégré : visite du MAR pour les ambulatoires ; report en fin de programme (jeûne) ou annulation (anticoagulant) |
| Vérifications de l'IBODE : site et côté, consentement, implants, matériel | Marquage absent, consentement non signé : le chirurgien doit venir | Intégré : passage du chirurgien, qui peut être en train d'opérer |
| Examens présents (bilan, ECG, groupe et RAI) | Examen manquant : prélèvement et résultat en urgence | Intégré : 30 à 60 min, annulation si le résultat arrive trop tard |
| Installation en salle, monitorage | Temps incompressible | Intégré : phase d'accueil en salle |
| Check-list HAS, temps 1 (avant l'induction) | Fait partie des durées réelles | Intégré : comprise dans les durées |
| Induction, intubation ou masque laryngé | Intubation difficile : MAR mobilisé plus longtemps, chariot dédié | Intégré |
| Check-list HAS, temps 2 (avant l'incision, toute l'équipe) | Le chirurgien doit être là | Intégré : l'incision attend le chirurgien |
| Incision, temps opératoire | Scopie, extemporané, transfusion, dispositif manquant, complication, interne | Intégré : interruptions pendant l'intervention |
| Fermeture, pansement, check-list temps 3 (comptage) | Comptage discordant (radiographie de contrôle) | Intégré (rare) |
| Transfert en SSPI avec brancardier, IADE et IBODE | Pas de brancardier : la circulante aide après quelques minutes | Intégré |
| Bionettoyage de la salle | Durée réelle (colonne « Fin bio ») ; renforcé après un patient septique ou BMR | Intégré |
| SSPI puis sortie décidée par le MAR | Lit, IDE, MAR, lit d'aval, réanimation | Intégré |

## 2. Ressources humaines

| Élément | Gardé pour la journée | BlocSim |
| --- | --- | --- |
| Chirurgiens par spécialité | Oui : retard au premier cas, double salle, astreinte, consentement et marquage | Intégré |
| Internes, aides opératoires | Oui : un interne qui opère allonge l'intervention | Intégré pour les internes (environ 20 % de temps opératoire en plus) ; aides opératoires plus tard |
| MAR, internes d'anesthésie | Oui : deux patients au plus, induction, réveil, ALR, visite pré-anesthésique, sortie de SSPI | Intégré |
| Médecin coordonnateur, président du conseil de bloc | Non : gouvernance | Écarté |
| Radiologues, cardiologues interventionnels, endoscopistes | Selon l'activité : endoscopies déjà dans les données | Partiel (endoscopie digestive) |
| Anatomopathologiste (extemporanés) | Oui : l'équipe attend le résultat ; un seul anatomopathologiste, en journée | Intégré |
| EFS, biologistes | Oui : délai des produits sanguins et des examens | Intégré |
| IADE | Oui | Intégré |
| IBODE (instrumentiste, circulante) | Oui ; habilitation robot | Intégré, avec l'habilitation robot |
| IDE de bloc, de SSPI, d'accueil | Oui | Intégré |
| Aides-soignants | Utile (transferts, SSPI) | Plus tard |
| Cadre de bloc, régulateur | Oui pour les décisions de régulation | Partiel : règles de régulation (déprogrammation, appel des patients) |
| Manipulateurs radio | Oui : indispensables dès qu'on utilise l'amplificateur | Intégré, avec l'astreinte de nuit |
| Perfusionnistes, coordination de prélèvements | Selon l'établissement | Plus tard (pas de chirurgie cardiaque dans les données) |
| Étudiants et stagiaires | Effet faible sur les durées | Plus tard |
| ASH, agents de bionettoyage | Oui | Intégré, avec le bionettoyage de fin de programme |
| Brancardiers | Oui : aller, transfert en SSPI, retour | Intégré |
| Secrétaires, assistantes de programmation | Indirect (qualité du programme) | Plus tard |
| Pharmacie, préparateurs | Indirect (implants, ruptures) | Partiel via les implants manquants |
| Techniciens biomédicaux, maintenance | Oui : durée de réparation d'une panne | Partiel : durée des pannes |
| Hygiène (EOH) | Indirect | Écarté pour la journée |
| Plannings, gardes et astreintes | Oui | Intégré |
| Remplacements, intérim, heures supplémentaires | Oui | Intégré : absences, remplaçants plus lents, rappel, heures supplémentaires pour finir un cas |
| Habilitations (robot, laser, radioprotection) | Oui pour le robot | Intégré (robot) |

## 3. Locaux

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Zone d'accueil commune, salle de pré-anesthésie de chaque salle | Oui : capacité, temps de passage en salle | Intégré : chaque salle d'opération a sa salle de pré-anesthésie côté couloir |
| Salles d'opération | Oui : nombre ouvert chaque jour | Intégré |
| Salles d'induction | Selon l'organisation | Plus tard |
| SSPI | Oui : lits | Intégré |
| Couloirs propre et sale, stockage, vestiaires, bureaux, locaux techniques | Non : fixes | Écarté |
| Traitement d'air, température, éclairage, radioprotection des murs | Non, sauf panne (salle arrêtée) | Pris en compte via la panne de salle |

## 4. Équipements

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Table, scialytiques, bras plafonniers, bistouris, aspirations | Seulement en cas de panne | Intégré : panne de salle |
| Colonnes de coelioscopie | Oui : partagées | Intégré |
| Amplificateur de brillance | Oui : partagé, demande un manipulateur | Intégré |
| Robot chirurgical | Oui | Intégré |
| Microscope, laser, scanner peropératoire, neuronavigation | Selon le site | Plus tard (absents des données) |
| Moteurs, ancillaires et implants d'orthopédie | Oui | Intégré : implant ou ancillaire manquant |
| Autotransfuseur | Rare | Plus tard |
| Échographe d'anesthésie | Oui : ALR | Intégré |
| Chariot d'intubation difficile | Oui : un seul | Intégré |
| Respirateurs, moniteurs, pompes | Seulement en cas de panne | Partiel via la panne de salle |
| Brancards, lits, lève-personne | Oui | Intégré (brancards, lits) |
| Matériel obstétrical, radioprotection individuelle | Non pour la journée | Écarté |

## 5. Stérilisation, dispositifs et implants

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Boîtes d'instruments par spécialité | Oui : parc limité, délai de retour | Intégré : parc par famille, délai de stérilisation, désinfection des endoscopes |
| Retard de stérilisation, panne d'autoclave | Oui | Intégré |
| Boîte non conforme à l'ouverture | Oui | Intégré |
| Dispositifs stériles (agrafeuses, trocarts, fils) | Oui : manquant en salle | Intégré |
| Implants et prothèses | Oui | Intégré |
| Compresses, champs, gants, consommables courants | Seulement en cas de rupture | Écarté (rare et peu documenté) |
| Produits sanguins | Oui : délai de l'EFS | Intégré |
| Gaz médicaux | Seulement en cas de panne | Pris en compte via la panne de salle |
| Médicaments (hypnotiques, curares, antibiotiques...) | Non pour la journée | Écarté |
| Stupéfiants, traçabilité | Temps de traçabilité | Plus tard |

## 6. Services autour du bloc

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Services d'hospitalisation, UCA | Oui : lits d'aval, fermeture de l'ambulatoire | Intégré |
| Réanimation, soins continus | Oui : places | Intégré |
| Urgences, SAMU | Oui : arrivée des urgences, afflux | Intégré |
| Maternité | Oui : césariennes en urgence (gynécologie-obstétrique) | Intégré via les urgences |
| Imagerie | Indirect | Écarté pour la journée |
| Laboratoire | Oui : examen manquant | Intégré |
| Anatomopathologie | Oui : extemporanés | Intégré |
| EFS, dépôt de sang | Oui | Intégré |
| Stérilisation centrale | Oui | Intégré |
| Pharmacie | Indirect | Partiel (implants) |
| Brancardage, bionettoyage | Oui | Intégré |
| Blanchisserie, déchets, restauration, magasin | Non | Écarté |
| Services administratifs | Non | Écarté |

## 7. Informatique

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Logiciel de bloc, dossier d'anesthésie, DPI | C'est l'objet testé par la fiche technique | Hors moteur : le simulateur produit les données et les situations sur lesquelles on teste ces logiciels |
| Panne informatique, mode dégradé | Oui | Intégré : chaque étape prend plus de temps pendant la panne |
| Tableaux de bord (occupation, retard de première intervention, annulations) | Oui : ce sont les indicateurs du bilan | Intégré : bilan, CSV, rapport de campagne |
| Traçabilité de la stérilisation, des implants | Temps de saisie | Plus tard |
| Communication (DECT, messagerie) | Délais d'appel | Plus tard |
| Interopérabilité HL7, FHIR, DICOM | Pour brancher les logiciels testés | Plus tard (export CSV au format OPROOM aujourd'hui) |
| Réseau, cybersécurité, PRA | Seulement la panne | Pris en compte via le mode dégradé |

## 8. Hygiène et sécurité

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Bionettoyage entre patients, de fin de programme | Oui | Intégré |
| Patients BMR, BHRe, septiques | Oui : fin de programme, bionettoyage renforcé | Intégré |
| Patients à risque prion (ATNC) | Rare | Plus tard |
| Check-list HAS, time-out | Oui | Intégré |
| Plan blanc | Oui | Intégré : rappel des astreintes lors d'un afflux |
| Hyperthermie maligne, allergie au latex, urgence vitale | Latex (premier de la liste) et urgence vitale oui ; hyperthermie maligne rare | Intégré (latex, urgence vitale) |
| Fluides, électricité de secours, incendie, évacuation | Seulement en cas de panne | Panne de salle ; évacuation écartée |
| AES, radioprotection, contrôles microbiologiques | Non pour la journée | Écarté |

## 9. Organisation

| Élément | Gardé | BlocSim |
| --- | --- | --- |
| Règles de programmation (urgences, ambulatoire, priorités) | Oui | Intégré : classes d'urgence, ordre du programme, salle d'urgence |
| Salle dédiée aux urgences | Oui | Intégré |
| Vacations et remplacements | Oui | Intégré : vacations matin, après-midi, journée ; remplacements |
| Gardes et astreintes | Oui | Intégré |
| Charte, conseil de bloc, contrats, QVT | Non | Écarté |
| Tarification, budget, investissements | Non | Écarté |

## 10. Cadrage du hackathon

| Point du cadrage | Ce qu'on en retient pour les simulations |
| --- | --- |
| Données de fonctionnement réel (durées, occupation, retards, annulations, effectifs, aléas) | Base du calibrage : durées, salles, horaires, annulations et bionettoyage viennent de l'export OPROOM ; le reste est signalé « à calibrer » |
| Modèle du bloc (salles, patients, équipes, matériel, boîtes, services) | C'est le moteur : chaque ressource est unique et limitée |
| Configurabilité d'un bloc | Paramètres bornés (`js/params.js`), fichiers de configuration, salles choisies |
| Bibliothèque de scénarios : urgence vitale, retard de stérilisation, rupture de matériel, absence, panne, allongement, annulation, panne informatique | Tous intégrés comme aléas ou familles de situations du mode campagne |
| Pour chaque scénario : déclencheur, fréquence, cascade, attendu du logiciel | Déclencheur et fréquence : paramètres ; cascade : simulée ; attendu du logiciel : à écrire dans la fiche technique |
| Intégration avec les logiciels testés (FHIR, HL7) | Plus tard : aujourd'hui export CSV |
| Données fictives uniquement | Respecté : soignants pseudonymisés, patients générés |
| Outil non clinique | Respecté : simulateur de test, pas d'aide à la décision pour de vrais patients |

## 11. Éléments écartés

Ils sont utiles au projet mais ne changent pas le déroulement d'une journée donnée :

- architecture et caractéristiques techniques des locaux (traitement d'air, sols, isolation, accès), sauf sous forme de panne de salle ;
- liste détaillée des médicaments, des consommables courants et des gaz ;
- contenu clinique des questions du MAR, de l'IADE et de l'IBODE : seules leurs conséquences sur la journée sont gardées (temps, report, annulation) ;
- gouvernance, charte, conseil de bloc, contrats, qualité de vie au travail ;
- cadre réglementaire et qualité, gardé comme source des règles (SSPI, check-list, deux patients par MAR) ;
- budget, tarification, achats ;
- services logistiques et administratifs sans effet direct sur les horaires (blanchisserie, déchets, restauration, admissions).

## 12. Ce que la simulation fait varier

Toutes les variations restent dans des bornes réalistes ; aucune situation impossible ne peut être tirée.

| Ce qui varie | Comment |
| --- | --- |
| Calendrier | Jour de la semaine, mois, épidémie hivernale, vacances scolaires |
| Activité | Salles ouvertes selon le jour, remplissage du programme, urgences selon le jour, afflux rares |
| Patients | Admission, mode d'arrivée, retards, absents, enfants, latex, septiques, BMR |
| Vérifications avant l'anesthésie | Visite du MAR, jeûne, anticoagulant, consentement, marquage, examens, identité, préparation |
| Personnel | Effectifs, absences, remplacements, pauses, double salle, internes, manipulateurs radio, MAR supplémentaires |
| Stérilisation et matériel | Parc de boîtes, délai de stérilisation, boîtes non conformes, panne d'autoclave, implants et dispositifs manquants |
| Pendant l'intervention | Intubation difficile, scopie, extemporané, transfusion, complication, comptage discordant |
| Capacités | Postes de pré-anesthésie, brancards, brancardiers, lits et IDE de SSPI, réanimation, lits d'aval |
| Aléas techniques | Pannes de salle, d'équipement, d'autoclave, panne informatique |

Le mode campagne (`npm run campagne`) tire ces variations journée par journée, avec douze familles de situations, dont quatre nouvelles : vérifications avant l'anesthésie défaillantes, stérilisation ou matériel en tension, panne informatique, forte activité d'enseignement.
