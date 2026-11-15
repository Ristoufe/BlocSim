# Données à demander à un hôpital, et ce qu'on en tire

Ce document liste ce que Blocapta peut demander à un hôpital pour construire le jumeau numérique de son bloc, et ce que chaque donnée permet de calculer.

Il sert à trois choses : préparer une demande de données, expliquer à l'hôpital pourquoi on la fait, et savoir quels indicateurs on peut afficher avec ce qu'on a.

Règles communes à toutes les demandes :

- Aucun nom de patient, aucun nom de soignant. Des codes à la place (CHIR-07, MAR-02).
- Aucune donnée médicale au sens du dossier patient : ni diagnostic, ni résultat, ni compte rendu.
- On demande le minimum utile. Une colonne qui ne sert à aucun calcul n'est pas demandée.
- L'hôpital dépose les fichiers lui-même. L'éditeur du logiciel testé ne les voit pas.
- Les fichiers bruts ne sortent pas de `data/raw/`, qui n'est pas versionné.

## 1. Vue d'ensemble

| Niveau | Donnée | État pour le bloc pilote |
|---|---|---|
| Indispensable | Export du logiciel de bloc | Reçu : OPROOM, 9 182 interventions, janvier à octobre 2026 |
| Indispensable | Planning des vacations | Reçu : classeur Ratios v2 |
| Indispensable | Effectifs par rôle et par vacation | Partiel : hypothèse d'un IADE et d'un IBODE par salle |
| Indispensable | Plan du bloc | Schématique : 10 salles, SSPI, accueil, sans cotes |
| Indispensable | Accord écrit et pseudonymisation | À formaliser pour chaque hôpital |
| Utile | Horodatage détaillé des interventions | Non demandé |
| Utile | SSPI : lits, entrées, sorties | Non demandé |
| Utile | Brancardage | Non demandé |
| Utile | Motifs d'annulation et de retard | Partiel : motifs d'annulation dans l'export |
| Utile | Pannes du système d'information | Non demandé |
| Utile | Journaux d'usage des logiciels en place | Non demandé |
| Optionnel | Questionnaire aux équipes | Non fait |
| Optionnel | Qui travaille avec qui | Non demandé |
| Optionnel | Audits de traçabilité | Non demandé |
| Optionnel | Heures supplémentaires et absences | Non demandé |
| Optionnel | Coût de la minute de bloc | Non demandé |

Sans les données « indispensables », on ne construit pas de jumeau. Les données « utiles » améliorent la fidélité du flux. Les données « optionnelles » servent surtout à calibrer le comportement des soignants, qui est aujourd'hui la partie la moins fondée du modèle.

## 2. Données indispensables

### 2.1 Export du logiciel de bloc

Ce qu'on demande : une ligne par intervention, sur au moins 6 mois consécutifs et 2 000 interventions.

| Colonne | À quoi elle sert |
|---|---|
| Date | Saisonnalité, jours de la semaine |
| Salle | Programme par salle, salles ouvertes chaque jour |
| Spécialité | Durées par spécialité, répartition du programme |
| Acte, en code ou en libellé court | Durées plus fines, actes rares |
| Programmé ou urgence | Part des urgences, salle d'urgence |
| Heure d'entrée en salle, heure de sortie de salle | Durée en salle, occupation, enchaînements |
| Heure prévue au programme | Retard, démarrage à l'heure |
| Annulation, avec la date de l'annulation | Taux d'annulation, annulations le jour même |
| Code du chirurgien, code de l'anesthésiste | Nombre d'opérateurs, vacations partagées |

Ce qu'on en tire :

- la loi de durée de chaque spécialité (moyenne et dispersion) ;
- le nombre d'interventions par salle et par jour ;
- le taux d'annulation, avant le jour J et le jour même ;
- le rythme d'arrivée des urgences, par heure et par jour ;
- le délai entre deux interventions dans une même salle.

Seuils de suffisance : 6 mois, 2 000 interventions, au plus 5 % de lignes sans horaires.

### 2.2 Planning des vacations

Ce qu'on demande : pour chaque salle et chaque jour de la semaine, les vacations offertes (heure de début, heure de fin, spécialité), et les fermetures prévues.

Ce qu'on en tire : les heures offertes, donc l'occupation des vacations, le débordement après la fin de vacation, et les salles ouvertes un jour donné.

### 2.3 Effectifs par rôle et par vacation

Ce qu'on demande : le nombre de chirurgiens, anesthésistes, IADE, IBODE, agents de bionettoyage, brancardiers et IDE de SSPI présents par vacation ; l'organisation de la garde ; la part d'intérimaires.

Ce qu'on en tire : la composition de l'équipe de chaque salle, le partage d'un anesthésiste entre plusieurs salles, les attentes dues au personnel, la charge de travail et les journées en surcharge.

### 2.4 Plan du bloc

Ce qu'on demande : le plan des salles, de la SSPI, de l'accueil et des circulations, avec le nombre de lits de SSPI et de places d'accueil.

Ce qu'on en tire : le plan animé en 3D, les temps de trajet, la capacité de la SSPI.

### 2.5 Accord et pseudonymisation

Ce qu'on demande : l'autorisation écrite de l'établissement pour cet usage, et la confirmation que les fichiers ne contiennent que des codes.

Ce qu'on vérifie à la réception : aucune colonne de nom, aucun identifiant patient, aucune date de naissance.

## 3. Données utiles

| Donnée | Ce qu'on demande | Ce qu'on en tire |
|---|---|---|
| Horodatage détaillé | Heures d'induction, d'incision, de fermeture, de sortie de salle | Durée de chaque phase, moment exact où le logiciel testé est utilisé |
| SSPI | Heure d'entrée et de sortie de chaque patient, nombre d'IDE par vacation | Salle bloquée en attente d'un lit, durée de réveil, saturation de la SSPI |
| Brancardage | Heure de la demande, heure de prise en charge | Attente de transport, retard de la première intervention |
| Motifs d'annulation et de retard | Un motif codé par événement | Causes simulées séparément : patient absent, dossier incomplet, matériel, personnel |
| Pannes du système d'information | Tickets d'indisponibilité des logiciels du bloc : date, durée, logiciel | Fréquence et durée réalistes des pannes, au lieu d'une valeur déclarée par l'éditeur |
| Journaux d'usage des logiciels en place | Nombre de connexions et de saisies par rôle et par semaine, sans contenu | Vitesse à laquelle un outil déjà déployé a été adopté, part des saisies faites après coup |

## 4. Données optionnelles, pour calibrer le comportement des soignants

Le modèle humain repose sur six paramètres « à calibrer ». Voici ce qui permettrait de les mesurer.

| Paramètre du modèle | Donnée qui le calibre | Comment |
|---|---|---|
| Confiance de départ, profils d'adoption | Questionnaire aux équipes, 10 questions, anonyme | Répartition des réponses par rôle |
| Vitesse d'apprentissage α | Journaux d'usage d'un déploiement passé | Courbe d'usage semaine après semaine |
| Influence des collègues κ | Plannings réalisés, pseudonymisés | Qui travaille avec qui, et à quelle fréquence |
| Seuil de contournement | Journaux d'usage et saisies faites après coup | Part des saisies hors de l'outil selon l'ancienneté d'usage |
| Mémoire d'une panne | Pannes passées et usage dans les semaines suivantes | Temps de retour au niveau d'usage d'avant la panne |
| Seuil de surcharge | Questionnaire de charge ressentie, heures supplémentaires | Niveau de charge à partir duquel les équipes se disent débordées |
| Erreurs de la méthode actuelle | Audits de traçabilité, complétude des check-lists | Taux d'erreur sur papier, par type de saisie |

Autres données optionnelles :

- Heures supplémentaires et absences, par rôle et par mois : fatigue, tension sur les équipes.
- Coût de la minute de bloc retenu par l'hôpital : valorisation des minutes gagnées ou perdues. Blocapta ne fixe pas ce coût.

## 5. Indicateurs : ce qu'on peut afficher, et avec quoi

« Calculé » : le moteur le sort aujourd'hui. « À calculer » : la donnée est déjà dans l'export, le moteur ne le sort pas encore. « À demander » : il faut une donnée de plus.

### Flux du bloc

| Indicateur | Définition | Données | État |
|---|---|---|---|
| Occupation des vacations | Heures opérées pendant la vacation, divisées par les heures offertes | Export, planning | Calculé |
| Retard moyen du programme | Écart entre l'heure prévue et l'heure réelle de début, en minutes par intervention | Export | Calculé |
| Débordement | Minutes opérées après la fin de vacation, par jour | Export, planning | Calculé |
| Déprogrammations | Interventions programmées non réalisées le jour prévu | Export | Calculé |
| Interventions réalisées | Nombre sur la période | Export | Calculé |
| Attente d'une urgence | Délai entre l'arrivée d'une urgence et son entrée en salle | Export | Calculé |
| Première intervention à l'heure | Part des salles dont la première intervention démarre à l'heure prévue | Export | À calculer |
| Temps de rotation | Délai entre la sortie d'un patient et l'entrée du suivant | Export | À calculer |
| Salle bloquée par la SSPI | Minutes d'attente d'un lit de SSPI, patient encore en salle | SSPI | À demander |
| Attente du brancardage | Minutes entre la demande et la prise en charge | Brancardage | À demander |

### Équipes

| Indicateur | Définition | Données | État |
|---|---|---|---|
| Journées-soignant en surcharge | Nombre de journées où un soignant dépasse le seuil de charge | Effectifs, modèle | Calculé |
| Charge ressentie par métier | Indice de 0 à 100, inspiré du NASA-TLX | Effectifs, modèle | Calculé |
| Fatigue par métier | Indice de 0 à 1 en fin de journée | Effectifs, modèle | Calculé |
| Heures supplémentaires | Heures travaillées au-delà de la vacation | Pointages | À demander |

### Logiciel testé

| Indicateur | Définition | Données | État |
|---|---|---|---|
| Usage de l'outil | Part des saisies faites dans l'outil, par semaine | Fiche, modèle | Calculé |
| Saisies contournées | Nombre de saisies faites hors de l'outil | Fiche, modèle | Calculé |
| Confiance | Indice de 0 à 1, par métier et par jour | Modèle | Calculé |
| Erreurs de saisie attendues | Nombre sur la période, comparé à la méthode actuelle | Fiche, modèle | Calculé |
| Minutes de panne subies | Durée d'indisponibilité vécue par les équipes | Fiche, scénario | Calculé |
| Check-lists complètes | Part des check-lists entièrement renseignées | Audits qualité | À demander |

### Valorisation

| Indicateur | Définition | Données | État |
|---|---|---|---|
| Coût des minutes perdues ou gagnées | Minutes de retard et de débordement, multipliées par le coût de la minute | Coût fourni par l'hôpital | À demander |

## 6. Ce qu'on ne demande pas

- L'identité des patients et des soignants.
- Le contenu médical : diagnostic, antécédents, résultats, comptes rendus opératoires.
- Les évaluations individuelles des soignants.
- Les données d'un autre service que le bloc et la SSPI.

## 7. Dans le prototype

- L'écran « Demander un jumeau numérique » reprend la liste des sections 2 à 4, avec ce que le jumeau tire de chaque donnée et le contrôle de suffisance des données indispensables.
- L'onglet « Indicateurs » des résultats reprend la section 5 : les indicateurs calculés affichent les valeurs du moteur, les autres indiquent la donnée qui manque.
- Le plan du bloc affiche six indicateurs de la journée animée : interventions terminées, occupation des salles, temps ajouté par l'outil, lits de SSPI occupés, saisies faites dans l'outil, salles finissant après 17 h 30. La journée animée est une illustration : ces six valeurs ne sont pas des résultats.
