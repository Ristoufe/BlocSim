# Guide : générer des journées de bloc avec BlocSim

Ce guide explique comment produire des journées simulées, les régler, récupérer les CSV et vérifier qu'elles ressemblent aux vraies données. Pour une présentation générale du projet, voir le [README](README.md).

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Générer avec l'interface](#2-générer-avec-linterface)
3. [Générer dans le terminal](#3-générer-dans-le-terminal), dont le [mode campagne](#31-mode-campagne--des-milliers-de-journées-variées)
4. [Les paramètres](#4-les-paramètres)
5. [Ce qui est produit](#5-ce-qui-est-produit)
6. [Recettes](#6-recettes)
7. [Vérifier le réalisme](#7-vérifier-le-réalisme) : tests automatiques, comparaison aux données, hypothèses à calibrer
8. [Recalculer les données de base](#8-recalculer-les-données-de-base)
9. [En cas de problème](#9-en-cas-de-problème)

## 1. Prérequis

| Pour | Il faut |
| --- | --- |
| Lancer l'interface et générer des journées | Node.js 18 ou plus récent (`node -v`) |
| Comparer aux vraies données, recalculer les statistiques | Python 3 avec `pandas` et `xlrd` (`pip install pandas xlrd`) et le fichier OPROOM dans `data/raw/OPROOM.xls` |

Toutes les commandes se lancent depuis le dossier `BlocSim`.

## 2. Générer avec l'interface

C'est l'usage principal.

```bash
npm start
```

Puis ouvrir http://localhost:8080.

1. Cliquer sur **+ Créer une journée**, dans la barre des journées en haut.
2. Choisir un **scénario de départ** : journée type, jeudi chargé, accident collectif, épidémie hivernale, mi-août, dimanche de garde, panne de salle, SSPI sous tension, sous-effectif, pénurie de brancards, programme surchargé.
3. Choisir la **date** : le jour de la semaine et le mois règlent le volume du programme et des urgences, comme dans les vraies données. Le bouton « Tirer les salles selon le jour » ouvre un nombre de salles réaliste pour ce jour.
4. Ajuster les **réglages détaillés** (65 paramètres rangés par groupe, chacun borné à des valeurs plausibles) et ajouter des **événements** si besoin (voir la [partie 4](#4-les-paramètres)).
5. Cliquer sur **Lancer la simulation**.

La journée apparaît en tête de la barre des journées et se joue sur le plan. Le panneau de droite affiche le **bilan** : activité, délais, minutes perdues par cause (MAR, chirurgien, brancard, SSPI, pré-anesthésie, équipement, aval), comparés à la même journée sans aléas, et le résultat des **contrôles de réalisme** (personne à deux endroits, MAR à plus de deux patients, SSPI sans personnel, brancards et lits). Un clic sur une salle montre l'intervention en cours, le mode d'arrivée du patient, son passage en pré-anesthésie, le délai maximal d'une urgence, les attentes et l'équipe.

Les deux CSV de la journée sont enregistrés automatiquement dans `logs/` (le chemin s'affiche dans la rubrique « Exporter la journée »). Les boutons « CSV format OPROOM » et « CSV détaillé » les téléchargent aussi, pour une journée simulée comme pour une journée réelle.

Pour itérer : **Modifier ce scénario** rouvre l'écran avec les mêmes réglages, **Relancer avec un autre tirage** rejoue le scénario avec une autre graine.

## 3. Générer dans le terminal

Option secondaire, pratique pour produire beaucoup de journées d'un coup. Même moteur et mêmes réglages que l'interface, sans navigateur.

```bash
npm run sim -- --aide
```

Les options se placent après `--`. Sans option, la commande simule une journée type avec la graine 42.

```bash
npm run sim                                         # une journée type
npm run sim -- --scenario afflux                    # un scénario prêt
npm run sim -- --scenario type --tirages 100        # 100 journées types
npm run sim -- --scenario sspi --tirages 50 --sans-csv   # bilan seulement, aucun fichier
```

Équivalent sans npm : `node tools/simulate.js [options]`.

### 3.1 Mode campagne : des milliers de journées variées

Pour tester une fiche technique dans énormément de contextes, le mode campagne tire lui-même des journées plausibles et différentes, les simule, vérifie chacune et écrit un rapport.

```bash
npm run campagne -- --aide
npm run campagne -- --n 3000                                   # fréquences réelles
npm run campagne -- --n 2000 --profil contrastes --sans-weekend  # couverture des cas rares
```

Pour chaque journée, la campagne tire :

- une **date** de l'année (les jours de la semaine et les mois arrivent donc à leur fréquence réelle) ;
- la **période** : épidémie hivernale (jusqu'à une chance sur deux en janvier), vacances scolaires, ou période normale ;
- les **salles ouvertes** selon le jour et le mois (5,3 salles le lundi, 6,2 le jeudi, moins en août) ;
- les **effectifs et capacités** autour des valeurs habituelles : brancardiers, ASH, IDE de SSPI, lits de SSPI, brancards, postes de pré-anesthésie, MAR supplémentaires, double salle ;
- les **aléas** : absences et remplacements, retards et annulations de patients, lits d'aval, places de réanimation ;
- une **famille de situation** qui pousse certains réglages, toujours dans leurs bornes : journée ordinaire, sous-effectif, SSPI ou aval sous tension, programme surchargé, panne de salle ou d'équipement, brancardage limité, patients en retard ou non prêts, vérifications avant l'anesthésie défaillantes, stérilisation ou matériel en tension, panne informatique, forte activité d'enseignement, afflux de victimes.

Le profil `realiste` tire ces familles à leur fréquence estimée (53 % de journées ordinaires, 0,5 % d'afflux). Le profil `contrastes` leur donne le même poids, pour avoir assez de cas rares.

Sorties, dans `campagnes/<date-heure>/` (non versionné) :

| Fichier | Contenu |
| --- | --- |
| `RAPPORT.md` | Couverture des situations, distribution des indicateurs (moyenne, P5, médiane, P95, max), comparaison par famille, période et jour, sensibilité de chaque indicateur à chaque réglage, 15 journées les plus difficiles, contrôles de cohérence, méthode pour tester une fiche technique |
| `contextes.csv` | Une ligne par journée : contexte, réglages tirés, 25 indicateurs, nombre de contrôles et d'incohérences |
| `configs.jsonl` | La configuration complète de chaque journée, pour la rejouer à l'identique |
| `journees/` | Avec `--csv` : le CSV OPROOM détaillé de chaque journée |

Rejouer une journée du rapport : copier le champ `cfg` de sa ligne dans `configs.jsonl` vers un fichier, puis `npm run sim -- --config journee.json`.

Une campagne de 3 000 journées prend environ 20 secondes. Deux exemples sont commentés dans `docs/campagne-exemple-realiste.md` et `docs/campagne-exemple-contrastes.md`.

## 4. Les paramètres

### 4.1 Ceux que tu règles

Les 65 paramètres sont décrits au même endroit, `js/params.js` : libellé, valeur par défaut, bornes, unité, source (données, réglementation ou hypothèse) et explication. L'écran « Créer une journée » en construit ses « Réglages détaillés », et la simulation ramène toute valeur hors bornes à la borne la plus proche. Il est donc impossible de créer une situation qui ne pourrait pas arriver.

| Groupe | Paramètres (défaut) |
| --- | --- |
| Calendrier | Date (le jour et le mois règlent le volume), contexte : normale, épidémie hivernale, vacances scolaires |
| Organisation du bloc | Remplissage du programme (1), heure du premier patient (8 h), heure limite de démarrage d'un cas programmé (18 h), part de chirurgiens en double salle (0) |
| Pré-anesthésie | Salle de pré-anesthésie devant chaque salle (oui, 1 place) : le patient y est vérifié et préparé puis entre en salle en une minute ; zone d'accueil commune avec postes assis (4) et couchés (4) pour attendre ; IDE d'accueil (1), délai d'appel du patient (25 min), ALR faite en pré-anesthésie (oui) |
| Patients | Absents (2 %), en retard (10 %, 20 min en moyenne), autres annulations le jour même (1,5 %), dossier administratif incomplet (4 %), porteurs de BMR (3 %), patients ambulatoires qui viennent à pied (oui) |
| Vérifications avant l'anesthésie | Ambulatoires vus par le MAR le jour même (70 %), jeûne non respecté (1,2 %), anticoagulant non arrêté (0,5 %), consentement manquant (1 %), marquage du côté absent (3 %), examen manquant (3 %), discordance d'identité (0,3 %), patient non préparé (5 %) |
| Brancards et transports | Brancards (10), hospitalisés amenés dans leur lit (oui), brancardiers (3) |
| Personnel | ASH (3), IDE de SSPI (3), MAR en plus des MAR de salle (1), absences de dernière minute (3 %), absences remplacées (80 %), pauses repas (oui) |
| Équipements partagés | Amplificateurs (2), colonnes de coelioscopie (3), robot (1), échographes (2), pannes |
| Stérilisation, matériel et implants | Parc de boîtes d'instruments (1 = parc habituel par spécialité), délai de stérilisation (4 h), boîtes non conformes (2 %), panne d'autoclave (1 % par jour), implant ou ancillaire manquant (1,5 %), dispositif stérile manquant (3 %) |
| Pendant l'intervention | Manipulateurs radio (1), intubations difficiles (2 %), extemporanés et transfusions (fréquence habituelle), délai de l'EFS (40 min), interventions avec un interne (15 %), check-list HAS, brancardier pour le transfert en SSPI, bionettoyage de fin de programme |
| SSPI et aval | Lits de SSPI (10), patients bloqués faute de lit en service (4 %), places de réanimation (2), fermeture de l'ambulatoire (19 h) |
| Urgences et garde | Nombre d'urgences (auto : tiré selon le jour), équipes de garde la nuit (1), délai de venue de l'astreinte (25 min) |
| Aléas | Pannes de salle et d'équipement (1 % par jour), complications peropératoires (4 %) et en SSPI, panne informatique (2 % par jour, mode dégradé de 1 à 4 h) |

Dans le terminal, les options courantes :

| Option | Rôle |
| --- | --- |
| `--scenario` | `type`, `jeudi`, `afflux`, `epidemie`, `aout`, `weekend`, `panne`, `sspi`, `effectif`, `brancards`, `surcharge` |
| `--config fichier.json` | Tous les paramètres ci-dessus, avec leurs noms de `js/params.js` (voir [6.6](#66-enregistrer-des-réglages-dans-un-fichier)) |
| `--date 2026-12-01` | Date simulée |
| `--salles "OP 2,OP 3"`, `--salle-urgence "OP 5"` | Salles ouvertes |
| `--programme 1.2` | Remplissage, de 0,7 à 1,25 |
| `--urgences 12`, `--afflux 6@14:00` | Demande imprévue |
| `--lits 6`, `--brancardiers 2`, `--bionettoyage 2` | Capacités |
| `--urgence vitale@10:30@"Chirurgie Orthopédique"`, `--panne "OP 3@10:00-14:30"` | Événements à la main, répétables |
| `--graine 7`, `--tirages 50` | Tirage aléatoire, nombre de journées |
| `--sortie`, `--sans-csv`, `--json` | Sorties |

Spécialités acceptées pour une urgence : `Anesthésie`, `Cardiologie`, `Chirurgie Générale et Digestive`, `Chirurgie ORL`, `Chirurgie Orthopédique`, `Chirurgie Urologique`, `Endoscopie Digestive`, `Gynécologie Obstétrique`, `Stomatologie`, `VISCERAL ROBOT`.

Le choix des éléments du bloc pris en compte, et de ceux qui sont écartés, est expliqué dans `docs/ELEMENTS_JOURNEE.md`.

### 4.2 Ceux qui viennent des vraies données

Calculés une fois pour toutes dans `data/stats.json` à partir de l'export OPROOM (voir [partie 8](#8-recalculer-les-données-de-base)) :

- actes les plus fréquents de chaque spécialité et leur distribution de durée ;
- spécialités pratiquées dans chaque salle et taux d'ouverture des salles ;
- vacations : 26 % de matins seuls, 3 % d'après-midi seuls ;
- heure du premier cas (vers 8 h 40) et délai arrivée au bloc → entrée en salle (35 min en médiane) ;
- annulations avant le jour J (15 %) et leurs motifs ;
- urgences : nombre par jour, heure d'arrivée, spécialité ;
- type d'anesthésie et part d'ambulatoire par spécialité.

### 4.3 Les règles du modèle

Fixées dans `js/generator.js`. Les règles réglementaires ne sont pas réglables ; les autres sont à faire valider par les équipes du bloc.

| Règle | Valeur |
| --- | --- |
| Une personne, un seul endroit | Chaque soignant, brancard, lit, poste de pré-anesthésie et équipement est une ressource unique, occupée sur des intervalles |
| MAR | Deux patients au plus en même temps hors anesthésie locale (SFAR, CNP ARMPO 2024), présent à l'induction et au réveil ; il décide de la sortie de SSPI |
| SSPI | Au moins un IDE, et deux agents dès six patients (CSP D6124-101). Une pause n'est prise que si l'effectif restant le permet, sinon elle est décalée ou sautée |
| Chirurgien | Une salle à la fois, sauf double salle explicite ; l'astreinte arrive en 25 min ; un collègue de la même spécialité libre peut le relayer pour une urgence vitale |
| Classes d'urgence | Immédiate (15 min, 8 %), moins de 1 h (17 %), moins de 6 h (45 %), moins de 24 h (30 %) |
| Programmé | Jamais avant l'heure prévue pour le premier cas, avancé de 30 min au plus ensuite ; déprogrammé s'il finirait après 18 h 30 ou s'il n'a pas démarré à 18 h |
| Ordre du programme | Allergie au latex puis enfants en premier, patients septiques en dernier |
| Garde | Une équipe et un MAR de garde la nuit et le week-end. Afflux de victimes : rappel des astreintes (plan blanc), jusqu'à deux équipes et un MAR en 30 min |
| Absences | Remplacées, sinon redéploiement (ouverture retardée) ou fermeture de salle ; une équipe n'est jamais vide (rappel) |
| Volume | Salles ouvertes et programme selon le jour et le mois des vraies données (jeudi 132 %, vendredi 80 %, août 51 %) |

## 5. Ce qui est produit

Pour chaque journée générée, deux fichiers dans `logs/` (ou le dossier choisi), préfixés par la date et l'heure de génération :

```
logs/20261114-001500-simulation-accident-collectif-a-14-h-graine42.csv
logs/20261114-001500-simulation-accident-collectif-a-14-h-graine42-detail.csv
```

**CSV format OPROOM** : exactement les 24 colonnes de l'export d'entrée, dans le même ordre. Une ligne « fermé » par intervention réalisée, une ligne « éliminé » par annulation ou déprogrammation.

| Colonne | Contenu dans une journée simulée |
| --- | --- |
| Jour, Date | Date choisie avec `--date` ou dans l'écran de scénario |
| Heure, Entrée salle | Heure d'entrée en salle simulée |
| Salle, Statut, Type, Admission | Comme dans l'export réel |
| Arrivée bloc | Arrivée du patient (pour une urgence : son heure d'arrivée) |
| Sortie salle | Sortie de salle, attente d'un lit de SSPI comprise |
| Fin bio | Fin du bionettoyage |
| Arr SSPI, Box SSPI, Sortie bloc | Arrivée en SSPI, numéro du lit, sortie de SSPI |
| Durée | Minutes en salle |
| Spécialité, Procédure | Tirées des actes réels |
| Chirurgien, Anesthésiste | Codes (CHIR-xx, MAR-xx, CHIR-G-ORTH pour la garde) |
| Anesth réalisée | Type d'anesthésie |
| Raison Annulation, Date Annulation | Pour les lignes « éliminé » |

**CSV détaillé** : les mêmes colonnes, plus Heure prévue, Priorité, Arrivée urgence, Attente urgence (min), Retard (min), Attente lit SSPI (min), Début bionettoyage, Anesthésie déduite, Patient.

**Bilan** (terminal seulement, sauf avec `--sans-csv`) : un fichier `…-bilan-N-tirages.csv` avec une ligne d'indicateurs par tirage.

Format commun : séparateur point-virgule, UTF-8 avec BOM. Les fichiers s'ouvrent directement dans Excel et se lisent en Python avec :

```python
import pandas as pd
df = pd.read_csv("logs/....csv", sep=";", encoding="utf-8-sig")
```

**Les indicateurs du bilan**

| Indicateur | Ce qu'il mesure |
| --- | --- |
| Interventions réalisées, dont urgences | Volume de la journée |
| Annulées avant le jour J | Annulations tirées au taux réel |
| Déprogrammées faute de temps | Cas programmés qui n'ont pas pu démarrer avant 18 h |
| Attente des urgences (moyenne, maximum), des vitales | Délai arrivée → entrée en salle |
| Retard moyen du programmé | Écart entre l'heure prévue et l'heure réelle d'entrée |
| Débordement après 18 h 30 | Minutes de programmé au-delà de 18 h 30, toutes salles |
| Blocage faute de lit SSPI | Minutes passées en salle à attendre un lit |
| Pic d'occupation de la SSPI | Nombre maximal de lits occupés en même temps |

## 6. Recettes

### 6.1 Un jeu de données de 100 journées types

```bash
npm run sim -- --tirages 100 --sortie logs/jeu-100-types
```

200 CSV (format OPROOM et détaillé) et un bilan. Pour fusionner les fichiers au format OPROOM en un seul :

```python
import pandas as pd, glob
files = [f for f in glob.glob("logs/jeu-100-types/*.csv") if "-detail" not in f and "-bilan-" not in f]
pd.concat([pd.read_csv(f, sep=";", encoding="utf-8-sig") for f in files]).to_csv("jeu-100-types.csv", sep=";", index=False)
```

### 6.2 Comparer deux organisations

Même série de tirages (mêmes graines), un seul paramètre qui change :

```bash
npm run sim -- --lits 8 --tirages 50 --sans-csv
npm run sim -- --lits 5 --tirages 50 --sans-csv
```

Comme les graines sont identiques, la différence entre les deux bilans vient seulement du nombre de lits.

### 6.3 Un afflux massif l'après-midi

```bash
npm run sim -- --afflux 10@15:30 --nom "Afflux de 10 victimes" --tirages 20
```

### 6.4 Une journée écrite à la main

```bash
npm run sim -- --nom "Mardi difficile" --date 2026-12-08 --urgences 4 \
  --urgence vitale@09:15@"Chirurgie Générale et Digestive" \
  --urgence urgente@11:40@"Chirurgie Orthopédique"@120 \
  --panne "OP 2@13:00-15:00" --brancardiers 2
```

### 6.5 Une semaine de dates successives

```bash
for d in 16 17 18 19 20; do
  npm run sim --silent -- --date 2026-11-$d --graine $d --sortie logs/semaine
done
```

### 6.6 Enregistrer des réglages dans un fichier

`scenarios/sous-effectif-soir.json` :

```json
{
  "name": "Sous-effectif et urgences du soir",
  "rooms": ["OP 2", "OP 3", "OP 4", "OP 5", "OP 9"],
  "urgRoom": "OP 5",
  "load": 1.1,
  "urgCount": 10,
  "burst": { "at": 1080, "n": 3 },
  "sspiBeds": 6,
  "bran": 2,
  "ash": 2,
  "events": [
    { "kind": "urgence", "prio": "vitale", "at": 1140, "spec": "Chirurgie Orthopédique", "dur": null },
    { "kind": "panne", "room": "OP 3", "at": 600, "until": 720, "label": "Panne" }
  ]
}
```

Dans ce fichier, les heures sont en minutes depuis minuit (1080 = 18 h, 1140 = 19 h). Les options de la ligne de commande s'appliquent par-dessus :

```bash
npm run sim -- --config scenarios/sous-effectif-soir.json --tirages 30
```

### 6.7 Récupérer les résultats dans un script

```bash
npm run sim --silent -- --scenario surcharge --tirages 10 --sans-csv --json > resultats.json
```

## 7. Vérifier le réalisme

### 7.1 Tests automatiques

```bash
npm test                      # 50 tirages par scénario
node tools/test.js --tirages=200
```

Quatre familles de tests, à lancer après toute modification du moteur :

| Test | Ce qui est vérifié |
| --- | --- |
| Zéro violation physique | Sur les 11 scénarios × 50 tirages (environ un million de contrôles) et sur les journées réelles rejouées : aucun soignant à deux endroits, aucun chevauchement de patients ou de bionettoyage en salle, MAR à deux patients au plus, SSPI jamais sans IDE, brancards et lits jamais utilisés deux fois |
| Reproductibilité | Même graine et mêmes réglages : CSV détaillé identique octet par octet |
| Nombres aléatoires communs | Changer une capacité (lits de SSPI, IDE de SSPI, brancardiers, brancards) garde exactement les mêmes patients, durées, urgences, annulations et absences. La référence « sans aléas » garde les mêmes patients et les mêmes urgences habituelles |
| Référence calibrée | 50 jours ouvrés, salles tirées selon le jour, comparés aux mesures de l'export : salles par jour, interventions par salle, délai entre deux cas, première entrée, dernière sortie, salles finissant après 18 h 30, occupation |

Les nombres aléatoires communs reposent sur des flux séparés : un par salle pour le programme, un par patient (annulation, retard, absence, complication, durée de bionettoyage...), un pour les urgences, un par soignant pour les absences, un pour les pannes. Comparer deux organisations sur la même graine compare donc vraiment la même journée.

### 7.2 Comparaison détaillée aux données réelles

`tools/compare_logs.py` compare des journées générées à l'export réel : volume, salles, durées, horaires, délais, annulations, urgences, spécialités, anesthésie, occupation.

```bash
npm run sim -- --tirages 30 --sortie logs/verif
python3 tools/compare_logs.py data/raw/OPROOM.xls logs/verif/*graine*[0-9].csv
```

Sans liste de fichiers, le script prend tous les CSV de `logs/` (hors versions détaillées et bilans). Il compare de préférence des **journées types** : un scénario d'afflux ou de panne n'a pas vocation à ressembler à un jour moyen.

Dernière vérification (50 jours ouvrés contre 208 jours ouvrés réels) :

| Mesure | Réel | Simulé |
| --- | --- | --- |
| Salles ouvertes par jour | 5,5 | 5,5 |
| Interventions programmées par salle et par jour | 4,53 | 4,21 |
| Délai sortie de salle → entrée suivante (médiane) | 12 min (dont 7 min entre fin du bionettoyage et entrée) | 12 min |
| Première entrée en salle (médiane) | 8 h 41 | 8 h 40 |
| Dernière sortie de salle (moyenne) | 15 h 24 | 15 h 28 |
| Salles qui finissent après 18 h 30 | 7,8 % | 8,9 % |
| Occupation 8 h - 18 h 30 par salle ouverte | 64 % | 61 % |

Tous les indicateurs de référence sont dans les mesures réelles. La salle de pré-anesthésie de chaque salle raccourcit l'entrée en salle ; la préparation de la salle par l'IBODE après le bionettoyage ramène le délai entre deux patients aux 12 min réelles.

### 7.3 Ce qui reste à calibrer

Toute valeur non mesurable dans l'export est signalée **à calibrer** : étiquette sur chaque réglage concerné dans l'écran « Créer une journée », liste dans le bilan (« Hypothèses à calibrer ») et dans chaque rapport de campagne. Les principales : durée de séjour en SSPI (l'heure de sortie de SSPI n'est remplie que pour 0,2 % des lignes), découpage des phases en salle, classes et délais des urgences, transferts, arrivée des chirurgiens, effectifs et capacités par défaut. Le bionettoyage, lui, est maintenant calibré sur la colonne « Fin bio » de l'export (remplie à 96 %).

## 8. Recalculer les données de base

À faire seulement si l'export OPROOM change ou pour rejouer d'autres journées réelles. Le fichier brut va dans `data/raw/`, un dossier ignoré par Git (il contient des noms de soignants).

```bash
pip install pandas xlrd
cp ~/Downloads/"OPROOM M1-M10 Anonyme.xls" data/raw/OPROOM.xls

python3 tools/export_stats.py data/raw/OPROOM.xls                         # distributions du générateur -> data/stats.json
python3 tools/export_days.py data/raw/OPROOM.xls                          # les 6 journées de démonstration -> data/days.json
python3 tools/export_days.py data/raw/OPROOM.xls 2026-03-19 2026-09-17    # d'autres journées réelles
```

Les deux scripts remplacent les soignants par des codes et s'arrêtent si un nom apparaît dans leur sortie. Recharger ensuite l'interface (ou relancer `npm run sim`) pour utiliser les nouvelles données.

## 9. En cas de problème

| Symptôme | Cause et solution |
| --- | --- |
| « Impossible de charger les journées » dans l'interface | Le fichier a été ouvert directement depuis le disque. Lancer `npm start` et ouvrir http://localhost:8080 |
| Aucun fichier dans `logs/` après une simulation dans l'interface | L'appli tourne avec un autre serveur (par exemple `python3 -m http.server`). Utiliser `npm start`, ou les boutons de téléchargement |
| `logs/` n'apparaît pas dans `git status` | Normal : le dossier est ignoré par Git |
| `Error: listen EADDRINUSE` au lancement | Le port 8080 est déjà pris : `node server.js 8090`, puis http://localhost:8090 |
| `Erreur : spécialité inconnue` | Écrire la spécialité exactement comme dans la liste de [4.1](#41-ceux-que-tu-règles), entre guillemets |
| `ModuleNotFoundError: pandas` | `pip install pandas xlrd` |
| `compare_logs.py` ne trouve pas de CSV | Lancer d'abord une simulation, ou passer les fichiers en arguments |
| Deux lancements donnent la même journée | C'est voulu : même graine, même résultat. Changer `--graine`, ou utiliser « Relancer avec un autre tirage » |
