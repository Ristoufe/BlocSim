# BlocSim

Simulateur de journée de bloc opératoire du projet **Blocapta**. Il rejoue des journées réelles d'un bloc de 10 salles, vues du dessus : patients, chirurgiens, anesthésistes, IADE, IBODE, brancardiers et agents de bionettoyage se déplacent entre l'accueil, les salles et la SSPI.

Le guide pas à pas pour générer des journées, régler les paramètres et exploiter les CSV est dans [GUIDE.md](GUIDE.md). Les règles de réalisme à intégrer ensuite sont listées dans [docs/REALISME.md](docs/REALISME.md).

## Lancer en local

Prérequis : Node.js 18 ou plus récent. Aucune dépendance à installer.

```bash
git clone https://github.com/Ristoufe/BlocSim.git
cd BlocSim
npm start
```

Ouvrir ensuite http://localhost:8080.

Sans Node, un serveur Python fait aussi l'affaire :

```bash
python3 -m http.server 8080
```

L'application doit être servie par un serveur local : ouverte directement depuis le disque (`file://`), elle ne peut pas charger `data/days.json`.

## Ce qu'on peut faire

### Créer une journée et la simuler

Le bouton **+ Créer une journée** ouvre l'écran de scénario :

- **Scénarios prêts à l'emploi** : journée type, accident collectif (afflux de victimes à 14 h), urgences en continu, panne de salle, SSPI réduite à 4 lits, sous-effectif de brancardiers et d'agents de bionettoyage, programme surchargé.
- **Réglages** : salles ouvertes, salle d'urgence, remplissage du programme (40 à 140 %), nombre d'urgences, afflux de victimes et son heure, lits de SSPI, brancardiers, agents de bionettoyage, tirage aléatoire.
- **Événements à la main** : urgence vitale, urgence ou urgence différée à une heure et dans une spécialité données, panne d'une salle sur un créneau.

Le programme opératoire et les urgences sont tirés des distributions réelles (`data/stats.json`). Le bloc est ensuite simulé minute par minute :

- une urgence vitale prend la première salle libre ;
- une urgence va en salle d'urgence, ou dans une autre salle après 45 minutes d'attente ;
- une urgence différée comble les trous du programme ;
- un patient ne quitte la salle que s'il y a un lit libre en SSPI, sinon la salle reste bloquée ;
- le bionettoyage attend un agent libre, et le patient attend un brancardier ;
- aucun cas programmé ne démarre après 18 h : il est déprogrammé ;
- après 19 h 30, seule la salle d'urgence tourne, plus une seconde salle pour une urgence vitale.

Le bilan affiche les interventions réalisées et déprogrammées, l'attente des urgences, le retard du programme, le débordement après 18 h 30, les minutes de blocage faute de lit en SSPI et le pic d'occupation de la SSPI. Chaque chiffre est comparé à la même journée sans urgences ni pannes. Les boutons « Modifier ce scénario » et « Relancer avec un autre tirage » permettent d'itérer.

### Exporter en CSV

Chaque journée, réelle ou simulée, s'exporte depuis le panneau de droite (« Exporter la journée ») :

- **CSV format OPROOM** : exactement les 24 colonnes de l'export d'entrée (Jour, Date, Heure, Site, Salle, Statut, Type, Admission, Arrivée bloc, Entrée salle, Sortie salle, Fin bio, Arr SSPI, Box SSPI, Sortie bloc, Durée, Spécialité, Procédure, Chirurgien, Anesth réalisée, Anesth prévue, Anesthésiste, Raison Annulation, Date Annulation). Une ligne par intervention réalisée, puis une ligne « éliminé » par annulation ou déprogrammation. Le fichier se relit donc avec les mêmes outils que les vraies données.
- **CSV détaillé** : les mêmes colonnes, plus l'heure prévue, la priorité, l'arrivée et l'attente des urgences, le retard, l'attente de lit en SSPI, le début du bionettoyage et l'identifiant patient.

Séparateur point-virgule, encodage UTF-8 avec BOM : le fichier s'ouvre directement dans Excel. « Fin bio » contient la fin du bionettoyage simulé et « Box SSPI » le numéro de lit.

Avec `npm start`, chaque simulation lancée est aussi enregistrée automatiquement dans `logs/` (les deux fichiers, horodatés). Ce dossier n'est pas versionné.

### Vérifier le réalisme

`tools/compare_logs.py` compare les CSV de `logs/` aux données réelles (volume, salles, durées, horaires, délais, annulations, urgences, spécialités) :

```bash
python3 tools/compare_logs.py data/raw/OPROOM.xls
```

### Calibration du moteur

Le moteur ajoute en salle des attentes et des aléas (MAR, chirurgien, équipement, complications, interne) et des annulations le jour même (absents, jeûne, examens, déprogrammations). Les durées et le taux d'annulation de l'export les contiennent déjà : sans correction, ils seraient comptés deux fois. `npm run calibrer` fait tourner le moteur avec ses réglages par défaut sur 150 jours ouvrés de janvier à octobre 2026, puis mesure :
- un facteur par spécialité appliqué à la durée de base d'un cas programmé, pour que la durée en salle simulée retrouve celle de l'export (ophtalmologie 0,75, endoscopie 0,82, stomatologie 0,89, viscéral 0,91, gynécologie 0,93, orthopédie 0,93, ORL 0,95, urologie 0,97) ;
- le taux d'annulation tiré avant le jour J (6,8 %), pour que le total des annulations retrouve le taux réel (14,9 % des lignes, urgences comprises).

Le résultat est écrit dans `data/stats.json` (clé `calib`) et conservé par `tools/export_stats.py`. À relancer après un changement du moteur ou des réglages par défaut ; `node tools/calibrer.js --verifier` mesure sans rien écrire.

Le programme de chaque salle suit aussi les données réelles :
- temps opéré du jour selon la spécialité principale de la salle (une salle de gynécologie fait souvent 1 à 3 cas courts, une salle d'orthopédie environ 7 h), ajusté au jour et au mois ;
- cas d'autres spécialités dans la même salle, à leur part réelle ;
- actes rares (hors des 14 plus fréquents) tirés de la distribution de leur spécialité ;
- salle d'urgence : toujours ouverte, mais un programme seulement à sa fréquence réelle (environ un jour ouvré sur deux).

### Tests

```bash
npm test        # tests d'acceptation
npm run check   # contrôles des règles physiques sur 440 journées
```

Vérifie qu'aucune personne n'est à deux endroits (journées générées et journées réelles rejouées), que la même graine redonne la même journée, que changer une capacité garde les mêmes patients et les mêmes urgences, et que la journée de référence reste dans les mesures réelles. Détails dans [GUIDE.md](GUIDE.md#71-tests-automatiques).

### Rejouer une vraie journée

- Choisir une des 6 journées de démonstration (jeudi chargé, journée robot, lundi, journée d'urgences, août, dimanche de garde).
- Lire la journée en accéléré (x30 à x720), avancer ou reculer de 15 minutes, se déplacer dans la frise du bas.
- Zoomer et déplacer le plan, survoler une personne pour voir qui c'est.
- Cliquer sur une salle : vue rapprochée, moniteur (ECG, SpO2, PNI, EtCO2, BIS), phases de l'intervention, fiche du cas, équipe présente, programme et journal de la salle.

Raccourcis : espace pour lecture ou pause, flèches gauche et droite pour -15 / +15 minutes, Échap pour revenir à la vue d'ensemble.

## Option : lancer des simulations dans le terminal

L'usage principal reste l'interface. Pour enchaîner des simulations sans navigateur, par exemple pour comparer 50 tirages d'un même scénario, la même simulation tourne aussi en ligne de commande, avec le même moteur et les mêmes réglages que l'écran « Créer une journée » :

```bash
npm run sim -- --aide                                  # toutes les options
npm run sim -- --scenario afflux                       # une journée, CSV dans logs/
npm run sim -- --scenario sspi --tirages 50 --sans-csv # 50 tirages, bilan seulement
npm run sim -- --lits 5 --brancardiers 2 \
  --urgence vitale@10:30@"Chirurgie Orthopédique" --panne "OP 3@10:00-14:30"
```

Pour chaque tirage, la commande écrit les deux CSV (format OPROOM et détaillé) dans `logs/`, plus un fichier `bilan` avec une ligne d'indicateurs par tirage. Elle affiche ensuite le bilan : comparaison à la journée sans aléas pour un tirage, moyenne, minimum, médiane et maximum pour plusieurs tirages. `--json` sort le résultat complet en JSON, et `--config fichier.json` reprend des réglages enregistrés.

Pour tester une fiche technique dans beaucoup de situations, le **mode campagne** tire lui-même des milliers de journées plausibles et variées (date, saison, épidémie, vacances, salles, effectifs, absences, lits, brancards, pannes, afflux rares), les simule, vérifie leur cohérence et écrit un rapport complet :

```bash
npm run campagne -- --n 3000                                     # fréquences réelles
npm run campagne -- --n 2000 --profil contrastes --sans-weekend  # cas rares bien représentés
```

Résultats dans `campagnes/` : `RAPPORT.md`, `contextes.csv` (une ligne par journée) et `configs.jsonl` (chaque journée rejouable). Détails dans [GUIDE.md](GUIDE.md#31-mode-campagne--des-milliers-de-journées-variées).

## Structure

```
index.html            page de l'application
css/style.css         styles
js/params.js          les 65 paramètres : défaut, bornes, unité, source, explication
js/config.js          plan du bloc, postes autour de la table, rôles, états de salle
js/engine.js          moteur : phases, équipes, brancardage, SSPI, trajets, constantes
js/generator.js       scénarios, tirage du programme et des urgences, ordonnanceur minute par minute,
                      contrôles de réalisme de chaque journée
js/export.js          export CSV au format OPROOM et enregistrement dans logs/
js/render.js          dessin du plan, des salles, des personnes et de la frise
js/app.js             état, panneaux, boucle d'animation, interactions
data/days.json        journées exportées et pseudonymisées
data/stats.json       distributions réelles (durées par acte, spécialités par salle, urgences par heure)
tools/export_days.py  export des journées depuis le fichier OPROOM
tools/export_stats.py calcul des distributions depuis le fichier OPROOM
tools/compare_logs.py comparaison des simulations aux données réelles
tools/simulate.js     option en ligne de commande (npm run sim)
tools/test.js         tests d'acceptation (npm test)
tools/calibrer.js     calibration du moteur sur l'export : durées de base par spécialité, annulations avant le jour J (npm run calibrer)
tools/check.js        contrôles des règles physiques sur les journées exportées (npm run check)
tools/campagne.js     mode campagne : milliers de journées variées et rapport (npm run campagne)
server.js             serveur local sans dépendance (fichiers + enregistrement des logs)
```

## Données

`data/days.json` vient de l'export OPROOM (janvier à octobre 2026). Les chirurgiens et les anesthésistes y sont remplacés par des codes (`CHIR-07`, `MAR-02`) : aucun nom réel n'est dans le dépôt.

Le fichier brut n'est jamais versionné. Pour régénérer les journées, le placer dans `data/raw/` (dossier ignoré par git), puis :

```bash
pip install pandas xlrd
python3 tools/export_days.py data/raw/OPROOM.xls
# ou d'autres dates :
python3 tools/export_days.py data/raw/OPROOM.xls 2026-03-19 2026-09-17
```

Pour recalculer les distributions utilisées par les scénarios :

```bash
python3 tools/export_stats.py data/raw/OPROOM.xls
```

Les deux scripts s'arrêtent si un nom de soignant apparaît dans leur sortie.

## Éléments du bloc pris en compte

Le tri de tous les éléments d'un bloc (ressources, parcours patient, services, informatique, hygiène) entre ceux qui changent une journée et ceux qui sont écartés est dans [docs/ELEMENTS_JOURNEE.md](docs/ELEMENTS_JOURNEE.md).

## Ce qui est réel, ce qui est modélisé

| Réel (export OPROOM) | Modélisé |
| --- | --- |
| Heure d'entrée en salle, durée en salle | Découpage en phases (accueil, induction, installation, temps opératoire, fermeture, réveil) |
| Salle, spécialité, acte | Équipes paramédicales par salle et équipe de garde |
| Programmé, urgence, urgence différée | Brancardage, bionettoyage, séjour en SSPI |
| Type d'anesthésie quand il est saisi | Anesthésie déduite de la spécialité quand elle manque (signalé dans la fiche) |
| Heure d'arrivée au bloc quand elle est saisie | Trajets et constantes vitales |
| Annulations du jour et leur motif | |

Pour les journées simulées, le tirage des actes, des durées, des spécialités par salle et des heures d'arrivée des urgences suit les données réelles. Les règles de priorité, les durées de SSPI et de bionettoyage et la répartition des urgences par gravité (environ 12 % de vitales) sont des hypothèses.

Les durées de phases et de SSPI sont des hypothèses simples, à calibrer avec les équipes du bloc avant toute conclusion.
