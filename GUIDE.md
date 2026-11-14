# Guide : générer des journées de bloc avec BlocSim

Ce guide explique comment produire des journées simulées, les régler, récupérer les CSV et vérifier qu'elles ressemblent aux vraies données. Pour une présentation générale du projet, voir le [README](README.md).

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Générer avec l'interface](#2-générer-avec-linterface)
3. [Générer dans le terminal](#3-générer-dans-le-terminal)
4. [Les paramètres](#4-les-paramètres)
5. [Ce qui est produit](#5-ce-qui-est-produit)
6. [Recettes](#6-recettes)
7. [Vérifier le réalisme](#7-vérifier-le-réalisme)
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
2. Choisir un **scénario de départ** : journée type, accident collectif, urgences en continu, panne de salle, SSPI réduite, sous-effectif, programme surchargé.
3. Ajuster les **réglages** et ajouter des **événements** si besoin (voir la [partie 4](#4-les-paramètres)).
4. Cliquer sur **Lancer la simulation**.

La journée apparaît en tête de la barre des journées et se joue sur le plan. Le panneau de droite affiche le **bilan**, comparé à la même journée sans urgences ni pannes.

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

## 4. Les paramètres

### 4.1 Ceux que tu règles

Ils sont disponibles dans l'interface et dans le terminal.

**Point de départ**

| Paramètre | Terminal | Valeurs | Rôle |
| --- | --- | --- | --- |
| Scénario | `--scenario` | `type`, `afflux`, `urg`, `panne`, `sspi`, `effectif`, `surcharge` | Réglages prêts à l'emploi, que les autres options modifient |
| Fichier de réglages | `--config` | chemin d'un JSON | Reprend des réglages enregistrés (voir [6.6](#66-enregistrer-des-réglages-dans-un-fichier)) |
| Nom | `--nom` | texte | Nom affiché et utilisé dans les noms de fichiers |

**Organisation du bloc**

| Paramètre | Terminal | Défaut | Rôle |
| --- | --- | --- | --- |
| Salles disponibles | `--salles "OP 2,OP 3,OP 4"` | les 10 salles | Chaque salle ouvre selon sa fréquence réelle ; la salle d'urgence et les salles en panne sont toujours ouvertes |
| Salle d'urgence | `--salle-urgence "OP 5"` | OP 5 | Prend les urgences en priorité, a un demi-programme, seule salle ouverte la nuit |
| Remplissage du programme | `--programme 1.2` | 1 | 1 = habituel, de 0,4 à 1,4. Au-dessus de 1 : retards, débordements, déprogrammations |

**Demande imprévue**

| Paramètre | Terminal | Défaut | Rôle |
| --- | --- | --- | --- |
| Urgences | `--urgences 12` | 6 | Nombre moyen par jour (loi de Poisson), heures et spécialités réelles |
| Afflux de victimes | `--afflux 6@14:00` | aucun | Groupe de patients arrivant en 25 minutes, un tiers d'urgences vitales |

**Capacités** (les goulots d'étranglement)

| Paramètre | Terminal | Défaut | Ce qui se passe quand il manque |
| --- | --- | --- | --- |
| Lits de SSPI | `--lits 4` | 8 | Le patient reste en salle, la salle est bloquée |
| Brancardiers | `--brancardiers 1` | 3 | Le patient arrive en retard en salle |
| Agents de bionettoyage | `--bionettoyage 1` | 3 | La salle attend d'être nettoyée avant le cas suivant |

**Événements à la main** (options répétables)

| Paramètre | Terminal | Format |
| --- | --- | --- |
| Urgence précise | `--urgence` | `priorité@HH:MM@spécialité[@durée]`, priorité parmi `vitale`, `urgente`, `differee` |
| Panne de salle | `--panne` | `"salle@HH:MM-HH:MM"` |

Spécialités acceptées pour une urgence : `Anesthésie`, `Cardiologie`, `Chirurgie Générale et Digestive`, `Chirurgie ORL`, `Chirurgie Orthopédique`, `Chirurgie Urologique`, `Endoscopie Digestive`, `Gynécologie Obstétrique`, `Stomatologie`, `VISCERAL ROBOT`.

**Tirage et sorties**

| Paramètre | Terminal | Défaut | Rôle |
| --- | --- | --- | --- |
| Graine | `--graine 7` | 42 | Même graine et mêmes réglages = même journée, à l'identique |
| Tirages | `--tirages 50` | 1 | Nombre de journées, graines successives (7, 8, 9, etc.) |
| Date | `--date 2026-12-01` | 2026-11-16 | Remplit les colonnes Jour et Date du CSV |
| Dossier de sortie | `--sortie logs/essai` | `logs` | Où écrire les CSV |
| Sans fichiers | `--sans-csv` | non | Affiche le bilan sans écrire de CSV |
| Sortie JSON | `--json` | non | Réglages et bilan complets en JSON, pour un script |

### 4.2 Ceux qui viennent des vraies données

Calculés une fois pour toutes dans `data/stats.json` à partir de l'export OPROOM (voir [partie 8](#8-recalculer-les-données-de-base)) :

- actes les plus fréquents de chaque spécialité et leur distribution de durée ;
- spécialités pratiquées dans chaque salle et taux d'ouverture des salles ;
- vacations : 26 % de matins seuls, 3 % d'après-midi seuls ;
- heure du premier cas (vers 8 h 40) et délai arrivée au bloc → entrée en salle (35 min en médiane) ;
- annulations avant le jour J (15 %) et leurs motifs ;
- urgences : nombre par jour, heure d'arrivée, spécialité ;
- type d'anesthésie et part d'ambulatoire par spécialité.

### 4.3 Les hypothèses du modèle

Fixées dans `js/generator.js` et `js/engine.js`, faute de données pour les mesurer. Ce sont les points à faire valider par les équipes du bloc.

| Hypothèse | Valeur actuelle |
| --- | --- |
| Priorité des urgences | Vitale : première salle libre. Urgente : salle d'urgence, ou toute salle après 45 min d'attente. Différée : comble les trous |
| Heure limite du programmé | Aucun cas programmé ne démarre après 18 h (il est déprogrammé) |
| Garde de nuit | Après 19 h 30, seule la salle d'urgence tourne, plus une seconde salle pour une urgence vitale |
| Répartition des urgences | 12 % vitales, 58 % urgentes, 30 % différées |
| Durée en SSPI | Anesthésie générale 55 à 85 min, locorégionale 45, sédation 25, locale 12, un peu moins en ambulatoire |
| Bionettoyage | 4 à 10 min après un cas court, 7 à 17 min après un cas long |
| Phases d'une intervention | Parts fixes de la durée en salle (induction, installation, fermeture, réveil), pour l'animation |

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

`tools/compare_logs.py` compare des journées générées à l'export réel : volume, salles, durées, horaires, délais, annulations, urgences, spécialités, anesthésie, occupation.

```bash
npm run sim -- --tirages 30 --sortie logs/verif
python3 tools/compare_logs.py data/raw/OPROOM.xls logs/verif/*graine*[0-9].csv
```

Sans liste de fichiers, le script prend tous les CSV de `logs/` (hors versions détaillées et bilans). Il compare de préférence des **journées types** : un scénario d'afflux ou de panne n'a pas vocation à ressembler à un jour moyen.

Dernière vérification (30 journées types contre 208 jours de semaine réels) : volume, salles, durées, heures de début et de fin, délais d'arrivée, annulations et heures des urgences sont proches du réel. Deux écarts restent connus : la gynécologie est trop représentée et l'orthopédie pas assez, et l'occupation des salles est un peu basse (53 % contre 67 %).

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
