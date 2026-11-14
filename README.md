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

## Tester un outil avant de le déployer

C'est le cœur de Blocapta (cahier des charges v2, objectifs 2 à 5). Le bouton **Tester un outil**, dans la barre du haut, ouvre le labo :

1. **Fiche du logiciel.** On choisit une fiche (trois exemples fictifs dans `data/fiches/`) ou on importe la sienne, au format JSON du *Template fiche logiciel v0.1*. Le contrôle de complétude applique la grille de l'agent 1 (40 champs, dont 4 critiques). Une fiche incomplète est refusée, sans aucun chiffre : la page liste les champs manquants et les questions à poser à son auteur. Sinon, la fiche reçoit un niveau de confiance (élevée, moyenne ou faible) et est traduite en paramètres de simulation : étapes, durées sans et avec l'outil, périmètre, disponibilité, support, formation, référents.
2. **Scénario fil rouge.** A : déploiement un lundi à 8 h. B : panne le mardi de la première semaine, avec ou sans support sur place. C : chirurgien senior réticent, comparé à une salle menée par une IBODE championne.
3. **Comparaison.** Le bloc est simulé plusieurs semaines sans l'outil puis avec, sur exactement les mêmes journées (mêmes patients, mêmes durées, mêmes urgences). La campagne est répétée 5 à 50 fois pour donner des fourchettes.

Le rapport donne une conclusion en une phrase, les signaux de risque (retard, déprogrammations, surcharge, adoption faible, perte de confiance, erreurs de saisie), la confiance jour après jour et par métier, le retard ajouté semaine par semaine, un tableau comparatif et la liste des hypothèses. Le bouton « Rejouer cette journée » envoie un jour de la campagne sur le plan animé, avec les pannes et les contournements de l'outil dans le fil des événements.

### Le modèle humain (`js/human.js`)

Chaque chirurgien, anesthésiste, IADE et IBODE est un agent qui garde son état d'un jour à l'autre :

| Brique | Ce qui est simulé | Source |
| --- | --- | --- |
| Confiance | `ΔT = α·δ` après un usage réussi, `α·λ·δ` après une panne (δ = résultat - attente) | Kahneman et Tversky ; λ = 1,955 (méta-analyse 2024), réglable de 1,8 à 2,25 |
| Mémoire d'une panne | une panne subie laisse une trace qui s'efface lentement (demi-vie de 15 jours ouvrés) ; tant qu'elle dure, un usage réussi rassure moins | Lee et See 2004, durée à calibrer |
| Diffusion | `ΔT_i = κ_i · Σ w_ij · (T_j - T_i)`, liens créés en opérant ensemble, pondérés par le gradient d'autorité | Rogers, Bass multi-agents (Dilucchio 2024), Edmondson 2003 |
| Profils | innovateurs, adopteurs précoces, majorités, retardataires : confiance de départ et sensibilité aux collègues | Rogers 1962 |
| Usage | sous un seuil de confiance, l'agent contourne l'outil (ancienne méthode, traçabilité manquante) | TAM, UTAUT |
| Apprentissage | le surcoût de l'outil décroît en loi puissance, la formation réduit le surcoût de départ | Newell et Rosenbloom 1981 |
| Fatigue, charge | la fatigue monte avec le temps de travail et récupère la nuit ; un indice de charge 0-100 inspiré du NASA-TLX / SURG-TLX | à calibrer |
| Erreurs | le risque d'erreur augmente avec la fatigue, le mode dégradé, le statut de novice (Dreyfus) | Reason 1990, à calibrer |

Chaque paramètre affiche sa source ou l'étiquette « à calibrer », dans le rapport comme dans `HUMAN_PARAMS_DOC`.

### En ligne de commande

```bash
npm run fiche -- data/fiches/scantrace-incomplete.json            # contrôle de complétude seul
npm run outil -- --fiche data/fiches/scantrace-v2.json --scenario B
npm run outil -- --fiche data/fiches/checklist-tablette.json --scenario C --repetitions 50 --lambda 2.25
```

### Contrôles

`npm run check` vérifie les règles physiques, puis 17 contrôles du modèle et des fiches :
- occupation des vacations à moins de 10 % du réel ;
- refus des fiches incomplètes ;
- nombres aléatoires communs entre les deux bras, et reproductibilité ;
- bornes de la confiance, de la fatigue et de la charge ;
- rapport λ entre une panne et un succès ;
- chute de confiance des soignants touchés par une panne précoce, comparés aux mêmes soignants sans panne, trace encore visible après 4 semaines, et limitée par le support ;
- réticence d'un chirurgien qui freine son équipe ;
- courbe d'apprentissage ;
- une année de bloc simulée en moins de 60 s.

### Relecteur IA local (agents 1 et 2)

Les soignants simulés n'utilisent aucun LLM : ce sont des formules, ce qui rend chaque campagne rapide, gratuite et reproductible. Un modèle de langage sert seulement à lire les fiches, environ deux appels par fiche. Il tourne en local avec [Ollama](https://ollama.com), donc sans coût et sans que la fiche quitte la machine.

```bash
ollama serve                 # dans un autre terminal
ollama pull qwen2.5:14b      # ou un autre modèle
npm start                    # le serveur relaie /api/llm vers Ollama
LLM_MODEL=qwen3.6:35b npm start                  # changer le modèle par défaut
LLM_URL=http://autre-machine:11434 npm start     # Ollama sur une autre machine
```

- **Agent 1 hybride** (bouton « Relire la fiche avec l'IA ») : les règles restent le garde-fou, et un champ obligatoire vide bloque toujours. Le LLM répond, champ par champ, à une question fermée : « ce texte répond-il concrètement à l'attendu ? ». Il peut seulement durcir le verdict, jamais l'assouplir. Une incohérence ou une alerte RGPD qu'il est seul à voir reste « à vérifier » et ne bloque pas.
- **Agent 2** (« Créer la fiche à partir d'un texte ») : le LLM remplit le template à partir d'une notice ou d'une note de cadre. Ce qui manque reste « Inconnu ». Tout chiffre absent du texte, tel quel ou converti en minutes, est retiré par un garde-fou.
- Sans Ollama, l'application fonctionne avec les règles seules et l'indique.

Pour comparer des modèles sur des fiches et des textes dont on connaît la bonne réponse (4 fiches, dont une fiche piège remplie mais creuse, et 2 textes libres) :

```bash
node tools/llm_eval.js qwen2.5:14b qwen3.6:35b
```

### Fidélité au bloc réel

Le moteur est calibré sur l'export OPROOM et vérifié par `npm test` : salles ouvertes, volume, délai entre deux cas, horaires, occupation. La comparaison avec / sans outil utilise ce moteur tel quel : chaque jour de campagne tire ses salles selon le jour de la semaine et le mois, comme une journée créée dans l'interface. `npm run check` vérifie en plus l'occupation des vacations au sens du classeur *Ratios v2* (heures opérées pendant la vacation de 8 h 30 à 17 h 30, rapportées aux heures offertes) : environ **54 %** simulés sur 120 jours ouvrés, comme dans le réel.

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
js/human.js           agents soignants : confiance, diffusion en réseau, fatigue, charge, erreurs
js/fiche.js           fiche logiciel : contrôle de complétude (agent 1) et normalisation (agent 2)
js/campaign.js        comparaison avec / sans outil, scénarios fil rouge, rapport
js/llm.js             agents LLM : relecture hybride de la fiche, texte libre -> fiche
js/lab.js             écran « Tester un outil » et graphiques
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
tools/outil.js        Blocapta : fiche logiciel et comparaison avec / sans outil (npm run fiche, npm run outil)
tools/check_humain.js contrôles du modèle humain et des fiches (lancés par npm run check)
tools/ollama.js       appel au modèle local (Ollama) ; tools/llm_eval.js : comparaison de modèles
server.js             serveur local sans dépendance (fichiers, enregistrement des logs, relais /api/llm)
data/fiches/          fiches logiciel d'exemple, fictives (dont une fiche piège)
data/notices/         textes libres d'exemple pour l'agent 2, fictifs
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
