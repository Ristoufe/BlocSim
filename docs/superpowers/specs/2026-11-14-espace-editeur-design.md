# Espace éditeur Blocapta : spec de conception

Date : 14/11/2026. Branche : `feat/ux-test-outil`.
Prototype cliquable de référence : `docs/superpowers/specs/2026-11-14-espace-editeur-prototype.html` (données d'exemple, à ouvrir dans un navigateur).

## 1. Objectif

Refaire le frontend pour l'utilisateur principal : l'éditeur de logiciel qui veut montrer à un hôpital que son produit sera adopté sans perturber le bloc.

L'écran actuel « Tester un outil » (`js/lab.js`) est une fenêtre unique qui mélange réglages, résultats et paramètres du modèle. Il est remplacé par une application en plusieurs écrans, sobre et dense, lisible projetée en réunion.

Critères de réussite :

- Un éditeur qui découvre l'outil va de la fiche au résultat sans aide.
- Une fiche incomplète ne produit aucun chiffre et dit quoi corriger.
- L'acheteur hôpital vérifie un numéro de certification sans compte, et voit pour quel hôpital le certificat vaut.
- Chaque chiffre affiché sort du moteur ; chaque paramètre porte sa source ou « à calibrer ».

## 2. Utilisateurs

| Qui | Ce qu'il fait | Où |
|---|---|---|
| Éditeur, seul | Importe la fiche, choisit le bloc et les scénarios, lance, lit, émet le certificat | Application |
| Éditeur, en réunion | Projette la conclusion et les chiffres clés | Mode Présenter |
| Acheteur hôpital | Vérifie un numéro reçu dans une proposition | Page publique |
| Équipe Blocapta | Règle les paramètres de chaque bloc, traite les demandes de jumeau | Hors application (fichiers), voir lot 3 |

## 3. Deux offres

| | Offre Test | Offre Certification |
|---|---|---|
| Bloc simulé | Bloc générique | Jumeau numérique d'un hôpital |
| But | Confronter le logiciel aux situations courantes d'un bloc | Montrer l'adoption dans un hôpital précis |
| Certificat | Non | Oui |
| Scénarios inclus | 2 au choix | 2 au choix |

Décisions :

- Les prix ne sont pas affichés. L'interface écrit « Inclus », « Supplément » et « sur devis », sans montant.
- Aucun paiement dans l'application. Un supplément ou un devis est une mention, traitée hors ligne par Blocapta.
- L'offre se déduit du bloc choisi. L'éditeur ne choisit pas une offre dans un menu.

## 4. Écrans

Navigation : barre d'application sombre avec deux entrées, « Tests » et « Hôpitaux », et un lien « Vérifier un certificat ».

### 4.1 Tests (accueil)

Tableau des tests : logiciel et version, bloc, offre, scénarios, état, conclusion, certificat, date. Bouton « Nouveau test ». Un clic ouvre le test.

### 4.2 Un test

En-tête de page : fil d'Ariane, nom et version du logiciel, étiquette de statut, ligne de métadonnées (bloc, scénarios, campagne, version du modèle, date). Actions à droite : « Présenter », « Exporter ».

Colonne de gauche : quatre étapes avec leur état, puis une rubrique « Explorer ».

1. **Fiche logiciel**
   - Import d'un fichier, formulaire, ou texte libre (agent 2, si le LLM local répond).
   - Fiche analysable : bandeau vert, niveau de confiance, tableau par rubrique (champs renseignés, champs critiques).
   - Fiche non analysable : bandeau rouge, tableau des champs critiques manquants avec le constat et la question à poser à l'auteur, lien « Copier les questions ». Le bouton « Continuer » est désactivé, les étapes suivantes aussi.
2. **Configuration**
   - Bloc simulé : liste avec recherche (nom, ville, numéro FINESS). Première ligne : bloc générique. Ensuite les jumeaux d'hôpitaux. Lien « Demander un jumeau numérique ».
   - Scénarios : catalogue en tableau (case à cocher, famille, ce qui est comparé, facturation).
   - Campagne : 4 semaines × 20 répétitions par défaut. Durée et répétitions sous « Paramètres avancés ». λ, α et κ ne sont plus réglables par l'éditeur : leur effet se lit dans l'onglet Sensibilité.
   - Bouton « Lancer la simulation », avec barre de progression.
3. **Résultats**
   - Sélecteur de scénario : il liste les scénarios de la dernière simulation, ceux cochés dans Configuration, et rien d'autre.
   - Vue d'ensemble (dès deux scénarios) : conclusion du test, puis un tableau avec une ligne par scénario (conclusion, chiffre clé, condition principale). Un clic ouvre le scénario.
   - Si la sélection change après une simulation, Configuration l'indique et les résultats restent ceux de la dernière simulation jusqu'à la relance.
   - Par scénario : conclusion en une phrase, avec étiquette (Sans réserve, Avec réserves, À risque), suivie de la conclusion du moteur telle quelle.
   - Quatre chiffres clés avec leur intervalle P10 à P90.
   - Onglets : Synthèse (courbe de confiance, signaux de risque, conditions de déploiement), Comparaison (tableau sans outil / avec outil, écart, intervalle, effet relatif), Sensibilité, Hypothèses, Versions de la fiche.
   - Un scénario non simulé n'affiche aucun chiffre.
4. **Certificat**
   - Avant émission : ce qui sera publié, puis confirmation.
   - Après émission : numéro, lien, badge avec QR code, rapport, chiffres figés.
   - Bloc générique : pas de certificat, et les trois étapes pour en obtenir un.

Explorer : **Plan du bloc** (voir 9).

### 4.3 Mode Présenter (démo guidée)

Plein écran, texte agrandi, aucun réglage visible. Une suite d'écrans que l'éditeur déroule en réunion, avec une phrase de commentaire en bas de chaque écran et la mention « Résultat d'une simulation, pas d'une mesure dans le bloc ». Flèches du clavier pour avancer et reculer, Échap pour quitter.

1. La réponse : la conclusion du scénario le plus parlant (celui de la panne s'il est simulé), deux chiffres clés, le retard ajouté en semaine 1, le nombre de journées simulées.
2. Le jumeau : le plan 3D en lecture, avec deux raccourcis (le jour de la panne, le lendemain) et le choix du bras (avec ou sans support). C'est là que se voit l'effet principal : le lendemain, l'outil fonctionne et une partie de l'équipe continue sur papier.
3. La comparaison : la courbe du scénario, quatre chiffres, le retard et les déprogrammations sans outil et avec outil.
4. Les limites : ce qui est mesuré, déclaré, supposé, non fait ; la part des variations de sensibilité où la conclusion tient.
5. À prévoir : la conclusion du test, les conditions avec qui les porte et leur effet, l'indice d'adoption en petit.
6. Côté hôpital : le numéro, le QR code, et la phrase « Ce numéro atteste qu'une simulation a eu lieu. Il n'atteste pas que le logiciel sera adopté. »

Un bouton « Démo guidée » dans la barre d'application ouvre cette suite sur le test principal.

### 4.3 bis Simulation en cours

Pendant le calcul, l'écran montre : la progression par scénario, quatre compteurs (journées de bloc simulées, interventions, soignants, saisies) et un extrait du plan 3D en lecture rapide. Les compteurs affichent des quantités réellement calculées par la campagne.

### 4.4 Hôpitaux

- Catalogue : bloc générique et jumeaux, avec région, salles, spécialités, données de calibration, version du jumeau, offre.
- Détail d'un jumeau : tableau de fidélité (réel, simulé, lecture « Fidèle » ou « Écart à réduire »). Les écarts sont publiés, y compris les mauvais.
- « Vos demandes » : demandes de jumeau en cours et leur état.

### 4.5 Demander un jumeau numérique

1. Hôpital concerné : établissement (nom ou FINESS), nom du bloc, nombre de salles.
2. Collecte des données, deux possibilités présentées dans un tableau comparatif :

| | Blocapta s'en charge | Vous organisez la collecte |
|---|---|---|
| Qui organise la collecte | Blocapta, auprès du contact à l'hôpital | L'éditeur, auprès de l'hôpital |
| Ce que l'éditeur fournit | Un contact : nom, fonction, e-mail | Tout le dossier : export du bloc, effectifs, plan, accord de l'hôpital |
| Dépôt des données | Par Blocapta | Par l'hôpital, avec un lien direct. L'éditeur ne voit pas les données |
| Tarif | Payant, sur devis, option prioritaire | Gratuit |
| Contrôle | Blocapta vérifie, pseudonymise, calibre | Contrôle automatique de suffisance, puis calibration |

3. Selon le choix : formulaire de contact et case « Traitement prioritaire », ou liste des données à fournir avec dépôt de fichiers et bouton « Vérifier les données ».

### 4.6 Page publique de vérification

Adresse : `/verifier/<numéro>`. Aucun compte. Le champ est vide à l'ouverture ; Entrée lance la vérification.

- Statut : « Numéro authentique. Chiffres inchangés depuis l'émission. », expiré, remplacé, ou inconnu. Le mot « valide » n'est pas employé seul : il se lirait comme « logiciel validé ».
- Phrase fixe : « Ce numéro atteste qu'une simulation a eu lieu. Il n'atteste pas que le logiciel sera adopté. »
- Quatre blocs mis en avant : logiciel testé, **hôpital simulé** (nom, type, salles), jumeau numérique (version, données de calibration), conclusion du test.
- Mention « Ce certificat vaut pour cet hôpital uniquement ».
- Résultats par scénario : conclusion, chiffres clés avec intervalle, condition principale.
- « Ce que vous devriez observer si le modèle a raison » : part des saisies dans l'outil et retard ajouté, semaine par semaine. L'hôpital peut comparer après le démarrage.
- « Déclaré par l'éditeur, non vérifié par Blocapta » : temps par étape, formation, support, rétablissement, avec la fiabilité de l'analyse de la fiche.
- « Périmètre du test » : scénarios simulés et non simulés, versions de la fiche (y compris une version refusée), et la phrase d'indépendance : « Blocapta est payé par l'éditeur. L'éditeur choisit les scénarios. Il ne peut modifier ni le bloc, ni le modèle, ni les chiffres. »
- « Ce que ce certificat ne dit pas » : mesuré, déclaré, supposé, non fait.
- Repliés : indice d'adoption avec ses composantes, fidélité du jumeau, paramètres du modèle et sources.
- Empreinte des chiffres, calculée à l'émission.

## 5. Règles de l'interface

- Aucun chiffre pour une fiche non analysable ni pour un scénario non simulé.
- Conclusion d'un scénario, d'après le moteur : vert = Sans réserve, orange = Avec réserves, rouge = À risque. Les mots « conforme » et « non conforme » ne sont pas employés : le test ne vérifie la conformité à aucune norme.
- Conclusion d'un test : celle de son scénario le moins favorable.
- Un certificat émis s'affiche par une seconde étiquette, « Certificat émis », à côté de la conclusion. Il ne la remplace pas. Le certificat s'appelle partout « certificat de simulation ».
- Une seule unité de retard : minutes par intervention programmée.
- Chaque écran de résultat distingue ce qui est simulé de ce qui est déclaré dans la fiche.
- Un statut est toujours une étiquette avec du texte, jamais une couleur seule.
- Indice d'adoption, de 0 à 100, par scénario, provisoire. Quatre composantes de 0 à 100 : confiance (100 × confiance finale), fluidité (100 − 10 par minute de retard ajoutée − 2 par déprogrammation ajoutée), charge (100 − 2 par journée-soignant en surcharge ajoutée), robustesse (part des variations de sensibilité où la conclusion tient). Pondérations : 40 %, 25 %, 20 %, 15 %. Calcul sur le bras principal du scénario. L'indice d'un test est calculé sur la moyenne des composantes de ses scénarios.
- L'indice accompagne la conclusion, il ne la remplace pas. Il est toujours affiché avec ses composantes et la mention « provisoire, pondérations à valider ». Il ne figure ni sur le badge, ni dans la liste des tests.
- Une seule action principale par écran, en bas à droite.
- Les écarts se lisent « avec outil moins sans outil ».
- Résultat d'un modèle : la mention figure sur les résultats, le mode Présenter et la page publique.
- Vocabulaire : celui du brief produit (fiche logiciel, éditeur, bloc, salle OP n, SSPI, scénario, campagne, bras, confiance, usage, à calibrer, certificat).

## 6. Hôpitaux et jumeaux

### 6.1 Profil d'un bloc

Un fichier par bloc : `data/hopitaux/<id>.json`.

```json
{
  "id": "pilote",
  "nom": "Bloc pilote",
  "type": "Centre hospitalier",
  "region": null,
  "salles": ["OP 2", "OP 3", "…", "OP 11"],
  "version": "1.4",
  "certifiable": true,
  "calibration": { "interventions": 9182, "periode": "2026-01 / 2026-10" },
  "stats": { },
  "fidelite": [ { "indicateur": "Taux d'annulation", "reel": 0.16, "simule": 0.15 } ]
}
```

`stats` reprend le contenu actuel de `data/stats.json`. Le moteur reçoit le profil choisi à la place de la variable globale `STATS`.

### 6.2 Bloc générique

- `data/hopitaux/generique.json`, `certifiable: false`.
- Valeurs : moyennes des jumeaux existants. Aujourd'hui, celles du bloc pilote, arrondies. L'interface le dit.
- Sert à l'offre Test. Résultats marqués « Offre Test, sans certificat ».

### 6.3 Seuils de suffisance (éditeur qui fournit les données)

Valeurs de départ, à ajuster après le deuxième hôpital :

| Élément | Exigence |
|---|---|
| Export des interventions | Au moins 6 mois consécutifs et 2 000 interventions, une ligne par intervention |
| Colonnes | Salle, spécialité, programmé ou urgence, heures d'entrée et de sortie de salle, annulations |
| Qualité | Au plus 5 % de lignes sans horaires |
| Effectifs | Nombre de soignants par rôle et par vacation |
| Plan | Nombre de salles, SSPI |
| Pseudonymisation | Aucun nom de patient ni de soignant, des codes uniquement |
| Accord | Autorisation écrite de l'hôpital pour cet usage |

Le jumeau n'est créé que si tous les éléments sont suffisants. Sinon l'écran liste ce qui manque et propose la collecte par Blocapta.

La calibration reste faite par l'équipe Blocapta (`tools/export_stats.py`, `tools/calibrer.js`). L'application enregistre la demande et son état ; elle ne calibre pas.

## 7. Scénarios

Catalogue décrit par des données (`SCENARIOS` dans `js/campaign.js`), pas par l'interface.

| Id | Famille | Scénario | État dans le moteur |
|---|---|---|---|
| A | Déploiement | Déploiement un lundi à 8 h | Existe |
| B | Incident | Panne le mardi de la semaine 1 | Existe |
| C | Équipe | Chirurgien senior réticent | Existe |
| D | Déploiement | Déploiement progressif, deux salles d'abord | À développer |
| E | Équipe | Arrivée de soignants non formés en semaine 3 | À développer |
| F | Activité | Semaine de forte activité | À développer |
| G | Incident | Mise à jour de l'outil en semaine 3 | À développer |
| H | Incident | Panne d'une journée entière | À développer |

Décisions :

- 2 scénarios au choix sont inclus par test. Au-delà, chaque scénario porte la mention « Supplément ». Avec trois scénarios dans le moteur, le troisième est donc un supplément dès le premier lot.
- Un scénario « à développer » apparaît dans le catalogue, grisé, avec la mention « Bientôt ». Il n'est pas sélectionnable tant que le moteur ne le calcule pas.
- Tout scénario simulé dans un test est publié dans son certificat. L'éditeur ne peut pas retirer un scénario défavorable.

## 8. Certificat

- Numéro : `BLC-AAAA-XXXX-CC`. `XXXX` : 4 caractères tirés d'un alphabet sans 0, O, 1, I. `CC` : clé de contrôle sur deux chiffres (modulo 97).
- **Les chiffres sont recalculés par le serveur à l'émission.** Le navigateur envoie la fiche, l'identifiant du bloc, les scénarios et les paramètres de campagne. Le serveur rejoue la campagne avec le moteur (chargé par `vm`, comme `tools/outil.js`) et des graines fixes. Les chiffres calculés dans le navigateur ne sont jamais certifiés.
- Contenu figé : logiciel, version, éditeur, version de la fiche, bloc, version du jumeau, données de calibration, indice d'adoption et ses composantes, scénarios avec conclusion et chiffres clés, conditions de déploiement, hypothèses avec source ou « à calibrer », sensibilité, version du modèle, graines, date.
- Stockage : `data/certificats/<numéro>.json`, écrit une fois. Empreinte : SHA-256 du JSON canonique, affichée sur la page publique.
- Validité : 12 mois. Statuts calculés à la lecture : valide, expiré, remplacé (un certificat plus récent existe pour le même logiciel et le même bloc). Si le jumeau a changé de version majeure, la page l'indique.
- Émission possible quelle que soit la conclusion, après confirmation. Impossible avec le bloc générique.
- Badge : SVG portant « Simulé par Blocapta », le numéro, le bloc, la date de fin de validité et un QR code vers la page publique.
- Rapport : page imprimable (feuille de style d'impression), exportée en PDF par le navigateur.

## 9. Plan du bloc

But : voir la simulation dans le temps. C'est un bonus de preuve, pas une étape.

- Calendrier des 4 semaines, une case par jour ouvré, colorée par le retard ajouté ce jour-là (une seule teinte, du clair au foncé). Un clic ouvre le jour.
- Sélecteurs : scénario, bras (sans outil, avec outil).
- Vue 3D du bloc, sur la géométrie du plan 2D actuel (`js/config.js`) : accueil patients, office, dix salles avec leur pré-anesthésie, couloir, SSPI, arsenal.
- Chaque personne est un personnage : chirurgien, MAR, IADE, IBODE instrumentiste, IBODE circulante, agent de bionettoyage, brancardier, IDE de SSPI, IDE d'accueil, patient. Couleurs des rôles : celles de `ROLE` dans `js/config.js`.
- Les personnes se déplacent : le patient passe de l'accueil à la salle puis à la SSPI avec un brancardier, le MAR va d'une salle à l'autre, le chirurgien entre pour l'installation et sort après la fermeture, l'agent de bionettoyage entre entre deux interventions.
- Chaque salle montre sa phase (accueil, induction, installation, opératoire, fermeture, réveil, bionettoyage, préparation) avec le temps écoulé, le scialytique allumé pendant l'opération et le moniteur d'anesthésie.
- L'usage de l'outil se lit personne par personne : un point au-dessus du soignant (dans l'outil, contourne sur papier, outil en panne), et l'écran du poste de saisie de la salle (bleu, gris, rouge).
- Survol d'une personne : code, rôle, activité. Clic : fiche de la personne (activité, lieu, confiance, mode de saisie, fatigue, charge ressentie). Clic sur une salle : état, intervention en cours, équipe avec l'activité de chacun, et zoom sur la salle.
- Curseur horaire de 7 h à 20 h, bouton Lecture, trois vitesses, raccourcis vers les moments clés (début du programme, début de la panne, fin de vacation), mode agrandi.
- Compteur en direct : salles en activité, lits de SSPI occupés, saisies dans l'outil et sur papier.
- Journal de la journée : les événements marquants jusqu'à l'heure affichée (début du programme, panne, outil rétabli, soignant qui contourne l'outil, intervention allongée, intervention en cours après 17 h 30). Un clic sur un événement place le curseur à cette heure et sélectionne la salle ou la personne.
- Frise de la journée : une ligne par salle, temps ajouté par l'outil en rouge, fin de vacation à 17 h 30.

Décisions :

- Rendu avec three.js. Le bloc est un modèle glTF fourni par l'équipe, dont les objets portent le nom des salles (`OP_2` … `OP_11`, `SSPI`). Sans modèle, la scène est construite par le code à partir de la liste des salles du profil (c'est ce que fait le prototype).
- Données : `campaignDay(out, bras, jour)` rejoue un jour de la campagne. La vue 3D lit les mêmes événements et les mêmes positions (`spot`, `roomState`) que le plan 2D actuel ; la confiance, l'usage, la fatigue et la charge de chaque agent viennent de `js/human.js`.
- Les déplacements sont animés à l'écran entre deux positions du moteur ; ils ne changent aucun chiffre.
- Sans WebGL : lien vers le plan 2D existant.

## 10. Stack technique

| Sujet | Choix | Raison |
|---|---|---|
| Interface | HTML, CSS, JavaScript en modules ES, sans framework ni étape de build | Zéro installation, toute l'équipe peut contribuer, `node server.js` suffit |
| Moteur | Scripts classiques inchangés (`js/params.js` à `js/campaign.js`) | Ils sont aussi chargés par les outils Node via `vm` |
| Simulation dans le navigateur | Web Worker qui charge le moteur avec `importScripts` | L'interface reste fluide, la progression remonte par messages |
| Serveur | `server.js`, Node, sans dépendance | Existant ; on ajoute des routes |
| Stockage | Fichiers JSON côté serveur (certificats, demandes, profils de bloc) ; `localStorage` pour les tests de l'éditeur | Pas de base de données à installer |
| Comptes | Aucun au premier lot. Nom de l'éditeur saisi une fois | Hors périmètre du hackathon |
| 3D | three.js, copié dans `js/vendor/`, chargé seulement sur l'écran Plan | Fonctionne hors ligne en démonstration |
| QR code | `qrcode-generator` (MIT), copié dans `js/vendor/` | Un seul fichier, pas de service externe |
| PDF | Feuille de style d'impression | Pas de bibliothèque |
| Polices | IBM Plex Sans et IBM Plex Mono, servies en local | Démonstration sans réseau |
| LLM | Ollama local par `/api/llm`, facultatif | Existant ; sans lui, règles seules, et l'interface le dit |

Routes ajoutées à `server.js` :

| Route | Rôle |
|---|---|
| `GET /api/hopitaux` | Liste des profils (sans `stats`) |
| `GET /api/hopitaux/:id` | Profil complet |
| `POST /api/certificats` | Recalcule, fige, renvoie le numéro |
| `GET /api/certificats/:numero` | Chiffres figés et statut |
| `GET /verifier/:numero` | Page publique |
| `POST /api/demandes`, `GET /api/demandes` | Demandes de jumeau |
| `POST /api/demandes/:id/controle` | Contrôle de suffisance des fichiers déposés |

Les fichiers déposés pour un jumeau vont dans `data/raw/demandes/<id>/`, ignoré par git, comme les données OPROOM.

## 11. Organisation du code

```
index.html              nouvelle application (remplace l'écran actuel comme page d'accueil)
simulateur.html         l'écran actuel, déplacé sans changement (plan 2D)
verifier.html           page publique
css/tokens.css          couleurs, tailles, espacements
css/app.css             composants
js/ui/app.js            routeur (#/tests, #/tests/:id/:etape, #/hopitaux, #/hopitaux/demande)
js/ui/store.js          tests de l'éditeur (localStorage), état courant
js/ui/api.js            appels serveur
js/ui/composants.js     étiquette, bandeau, tableau, onglets, sélecteur, champ
js/ui/graphiques.js     courbe, effet relatif, sensibilité, calendrier, frise
js/ui/ecrans/*.js       tests, fiche, configuration, resultats, certificat, hopitaux, demande, plan
js/ui/plan3d.js         scène three.js
js/ui/worker.js         campagne en arrière-plan
js/vendor/              three, qrcode-generator
tools/certificat.js     recalcul et écriture d'un certificat (appelé par le serveur)
tools/suffisance.js     contrôle des données d'un jumeau
```

`js/lab.js` est supprimé quand tous ses contenus ont un écran. Chaque écran exporte une fonction `rendre(conteneur, etat)` et ne connaît ni le routeur ni les autres écrans.

## 12. Système visuel

- Référence : IBM Carbon (en-tête d'application, tableaux, étiquettes, bandeaux). Coins droits, bordures de 1 px, pas d'ombre, pas d'icône décorative.
- Couleurs : encre `#161616`, texte secondaire `#525252`, fond `#f4f4f4`, panneaux blancs, accent `#0f62fe`. Statuts réservés : vert, jaune, rouge, toujours avec un libellé.
- Séries de graphiques : `#6929c4`, `#1192e8`, `#005d5d`, dans cet ordre, une couleur par entité et non par rang.
- Typographie : 15 px de base, tailles en `rem`. La taille racine grandit avec la largeur de l'écran, jusqu'à +20 % à partir de 1 900 px. Chiffres en IBM Plex Mono, alignés à droite dans les tableaux.
- Graphiques : étiquettes directes en bout de courbe, légende, survol avec valeurs, un seul axe.
- Largeur utile : 1 464 px au plus.

## 13. États et erreurs

| Situation | Comportement |
|---|---|
| Fiche non analysable | Étapes suivantes verrouillées, champs manquants listés |
| LLM local absent | Bandeau d'information : analyse par règles seules |
| Simulation interrompue | Les résultats précédents restent ; bouton « Relancer » |
| Serveur injoignable à l'émission | Message d'erreur, rien n'est figé, on peut réessayer |
| Numéro inconnu | « Aucun certificat ne porte ce numéro », rappel du format |
| Certificat expiré ou remplacé | Statut affiché, chiffres toujours consultables |
| Données de jumeau insuffisantes | Liste des éléments à corriger, jumeau non créé |
| WebGL indisponible | Lien vers le plan 2D |

## 14. Vérification

- `npm test` et `npm run check` continuent de passer : le moteur ne change pas, sauf le passage du profil de bloc en paramètre.
- `tools/certificat.js` : même entrée, mêmes chiffres, même empreinte (test de reproductibilité).
- Numéro : test de la clé de contrôle et du refus d'un numéro mal formé.
- `tools/suffisance.js` : un jeu suffisant, un jeu par motif de refus.
- Parcours vérifiés dans le navigateur : fiche incomplète bloquée, test complet sur le bloc pilote, bloc générique sans certificat, émission puis vérification publique, plan 3D avec lecture.

## 15. Lots

Chaque lot a son plan d'implémentation et peut être livré seul.

1. **Socle et parcours de test** : jetons CSS, composants, routeur, écrans Tests, Fiche, Configuration (bloc pilote et bloc générique, scénarios A, B, C), Résultats, mode Présenter. Branché sur le moteur par le worker.
2. **Certificat** : recalcul serveur, stockage, écran Certificat, badge, page publique.
3. **Hôpitaux** : profils par fichier, catalogue, fidélité, demande de jumeau, contrôle de suffisance.
4. **Plan du bloc en 3D**.
5. **Compléments** : scénarios D à H dans le moteur, onglet Versions de la fiche.

## 16. Hors périmètre

- Comptes, connexion, droits.
- Paiement et affichage des prix.
- Console d'administration Blocapta (les profils se règlent par fichiers et outils en ligne de commande).
- Calibration automatique d'un jumeau à partir des fichiers déposés.

## 17. Prototype : d'où viennent les chiffres

Le prototype n'est pas relié au moteur, mais ses chiffres n'en sont pas moins des sorties du moteur, copiées telles quelles.

| Élément du prototype | Origine |
|---|---|
| Tests « CheckBloc tablette v1.4 » (scénarios A, B, C) et « ScanTrace v2 » (A, B) | `node tools/outil.js --fiche data/fiches/<fiche>.json --scenario <X> --json`, exécution du 15/11/2026. Logiciels fictifs, bloc pilote réel |
| Sensibilité | même commande avec `--sensibilite` (10 répétitions) |
| Fiche non analysable « ScanTrace v1 » | `npm run fiche -- data/fiches/scantrace-incomplete.json` |
| Rapport du scénario B | `--rapport-ia`, modèle local qwen2.5:14b, texte non retouché, 0 chiffre non vérifié |
| Fidélité du jumeau | `node tools/calibrer.js --verifier --jours 80` ; occupation : README |
| Confiance et usage de chaque soignant dans le plan 3D | historique de confiance des agents du moteur (une répétition) ; règle d'usage du moteur |

Ce qui reste fabriqué pour la maquette, et qui est signalé à l'écran :

- les horaires et les déplacements du plan 3D (« animation d'illustration ») ;
- la progression de l'écran « Simulation en cours » (les totaux, eux, sont ceux de l'exécution réelle) ;
- le bloc générique, qui reprend les chiffres du bloc pilote ;
- les trois hôpitaux d'exemple et la demande « CH exemple D » ;
- les numéros de certification, et l'empreinte, qui n'est pas calculée.

Constats tirés de ces exécutions, utiles pour le pitch :

- Scénario B : usage en semaine 4 de 97,3 % avec un support sur place, 72,1 % sans. Le support est la condition qui change le résultat.
- La conclusion tient dans 9 variations de paramètres sur 14 pour les trois scénarios. C'est une limite à dire, pas à cacher.
- À 10 répétitions, la conclusion de référence du scénario A est « sans réserve » ; à 20, « avec réserves ». Le seuil est proche.
- Aucune des fiches d'exemple ne donne un scénario « à risque ».

## 18. Points ouverts

- Nom public du bloc pilote et des futurs hôpitaux.
- Fichier du modèle 3D : format, nommage des salles, qui le fournit.
- Hébergement de la page publique (elle doit être joignable par l'hôpital).
