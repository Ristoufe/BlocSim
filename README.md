# BlocSim

Simulateur de journée de bloc opératoire du projet **Blocapta**. Il rejoue des journées réelles d'un bloc de 10 salles, vues du dessus : patients, chirurgiens, anesthésistes, IADE, IBODE, brancardiers et agents de bionettoyage se déplacent entre l'accueil, les salles et la SSPI.

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

- Choisir une des 6 journées de démonstration (jeudi chargé, journée robot, lundi, journée d'urgences, août, dimanche de garde).
- Lire la journée en accéléré (x30 à x720), avancer ou reculer de 15 minutes, se déplacer dans la frise du bas.
- Zoomer et déplacer le plan, survoler une personne pour voir qui c'est.
- Cliquer sur une salle : vue rapprochée, moniteur (ECG, SpO2, PNI, EtCO2, BIS), phases de l'intervention, fiche du cas, équipe présente, programme et journal de la salle.

Raccourcis : espace pour lecture ou pause, flèches gauche et droite pour -15 / +15 minutes, Échap pour revenir à la vue d'ensemble.

## Structure

```
index.html            page de l'application
css/style.css         styles
js/config.js          plan du bloc, postes autour de la table, rôles, états de salle
js/engine.js          moteur : phases, équipes, brancardage, SSPI, trajets, constantes
js/render.js          dessin du plan, des salles, des personnes et de la frise
js/app.js             état, panneaux, boucle d'animation, interactions
data/days.json        journées exportées et pseudonymisées
tools/export_days.py  export des journées depuis le fichier OPROOM
server.js             serveur statique local, sans dépendance
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

Le script s'arrête si un nom de soignant apparaît dans la sortie.

## Ce qui est réel, ce qui est modélisé

| Réel (export OPROOM) | Modélisé |
| --- | --- |
| Heure d'entrée en salle, durée en salle | Découpage en phases (accueil, induction, installation, temps opératoire, fermeture, réveil) |
| Salle, spécialité, acte | Équipes paramédicales par salle et équipe de garde |
| Programmé, urgence, urgence différée | Brancardage, bionettoyage, séjour en SSPI |
| Type d'anesthésie quand il est saisi | Anesthésie déduite de la spécialité quand elle manque (signalé dans la fiche) |
| Heure d'arrivée au bloc quand elle est saisie | Trajets et constantes vitales |
| Annulations du jour et leur motif | |

Les durées de phases et de SSPI sont des hypothèses simples, à calibrer avec les équipes du bloc avant toute conclusion.
