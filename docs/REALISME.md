# BlocSim : règles de réalisme à intégrer

Version 0.2 du 14 novembre 2026. Document de travail, à relire avec les équipes du bloc (chirurgien, MAR, IADE, IBODE, cadre, brancardier, ASH).

Le principe : **chaque règle est une contrainte que le moteur doit respecter, jamais une décoration**. Une personne ne peut pas être à deux endroits, un brancard occupé n'est pas disponible, un MAR ne peut pas induire dans deux salles en même temps. Quand une contrainte bloque, la simulation doit produire de l'attente, comme dans la réalité, et l'indicateur correspondant doit la mesurer.

Chaque idée est classée :

- **P1** : faux aujourd'hui ou indispensable à la crédibilité, à faire en premier ;
- **P2** : apporte beaucoup de réalisme pour un effort raisonnable ;
- **P3** : finesse, à faire si le temps le permet.

## État d'avancement (version 0.2)

La plupart des règles P1 et P2 de ce document sont en place dans le moteur (`js/generator.js`, paramètres dans `js/params.js`). Chaque journée simulée est contrôlée automatiquement : sur une campagne de 3 000 journées, 5,6 millions de vérifications et aucune incohérence.

| Section | En place |
| --- | --- |
| 0. Ce qui était faux | Corrigé : chirurgien dans une seule salle, induction impossible sans MAR, deux patients au plus par MAR, pré-anesthésie, brancards limités, pauses et absences, patients en retard ou non prêts, sortie de SSPI décidée par un MAR et dépendante de l'aval |
| 1. Pré-anesthésie | Salle de pré-anesthésie devant chaque salle d'opération (organisation du bloc), zone d'accueil commune avec postes assis et couchés, IDE d'accueil, appel du patient, ALR faite en pré-anesthésie, attente mesurée |
| 2. Debout, fauteuil, couché | Mode d'arrivée selon l'âge, l'ambulatoire et la spécialité, dessiné sur le plan |
| 3. Brancards et lits | Brancards comptés, retour et nettoyage, hospitalisés amenés dans leur lit ou non |
| 4. Une personne, un endroit | Toutes les personnes sont des ressources uniques ; validateur en fin de journée |
| 5. Équipes | Horaires, pauses repas (en SSPI, seulement si l'effectif restant le permet), absences, remplacements, redéploiement, rappel, fermeture de salle |
| 6. Patients | Absents, retards, annulations le jour même, dossiers incomplets, enfants, allergie au latex, patients septiques |
| 7. Programme | Vacations matin, après-midi ou journée, double salle, ordre (latex, enfants, septiques), régulation de fin de journée (déprogrammation si fin prévue après 18 h 30) |
| 8. Équipements | Amplificateurs, colonnes de coelioscopie, robot, échographes, pannes |
| 9. Urgences et garde | Classes immédiate, moins de 1 h, moins de 6 h, moins de 24 h avec délai mesuré ; garde la nuit et le week-end ; astreinte ; plan blanc avec rappel d'équipes lors d'un afflux |
| 10. Affluence | Jour de la semaine et mois tirés des vraies données, épidémie hivernale, vacances scolaires, salles ouvertes selon le jour |
| 11. SSPI et aval | Lits, IDE, règle D6124-101, décision de sortie par un MAR, lits d'aval, réanimation, conversion d'ambulatoire en hospitalisation |
| 13. Aléas | Complications peropératoires et en SSPI, pannes |

Audit `ameliorations_simulations.md` (Drive, 14 novembre 2026), traité :

| Point de l'audit | État |
| --- | --- |
| A1-A2. MAR et chirurgiens bloquants | En place dans le nouveau moteur (le document visait l'ancien `schedule()`) : chaque MAR et chirurgien est une ressource unique, contrôlée en fin de journée |
| A3. Équipe de garde partagée, IADE en transmission pendant le cas suivant | Corrigé aussi dans le rejeu des journées réelles : une équipe de garde par salle simultanée ; une personne n'est jamais à deux endroits (la présence précédente s'arrête quand la suivante commence) |
| A4. Brancardiers sur les trois trajets, plus de tâches superposées | Trois trajets réservés ; si personne n'est libre, un renfort est appelé au lieu de superposer deux tâches |
| A5. Horaires de garde différents | Alignés : jour de 7 h à 19 h 30 partout |
| B1. Salles ouvertes par seuil fixe | Remplacé : nombre de salles autour de la moyenne réelle du jour, salles tirées selon leur taux d'ouverture réel (OP 6 et OP 8 apparaissent), sélection manuelle respectée |
| B2. Délai entre deux cas « 7 min » et occupation « 47 % » | Vérifié sur l'export : 7 min est le délai entre la fin du bionettoyage et l'entrée suivante ; de la sortie de salle à l'entrée suivante, c'est 12 min. L'occupation par salle ouverte est de 64 %. Le simulé est à 12 min et 61 %, et le bionettoyage est calibré sur la colonne « Fin bio » |
| B3. Journées réelles : bionettoyage qui déborde, actes simultanés en SSPI, journée vide | Bionettoyage réel, borné avant le patient suivant ; second acte simultané du box SSPI pris en charge sur un lit de SSPI ; journée sans intervention gérée |
| C1. Flux aléatoires séparés | En place : programme par salle, un flux par patient, urgences, absences par soignant, pannes |
| C2. Référence avec la même graine | En place : mêmes patients et mêmes urgences habituelles, sans absences, pannes, retards, complications ni afflux |
| 3. Étiquette « à calibrer » | Sur les réglages concernés, dans le bilan et dans les rapports de campagne |
| 4. Critères d'acceptation | `npm test` : zéro violation, reproductibilité octet par octet, nombres aléatoires communs, référence dans les cibles |

Ajouts du 14 novembre 2026, à partir du tri de `docs/ELEMENTS_JOURNEE.md` : vérifications avant l'anesthésie (visite du MAR, jeûne, anticoagulant, consentement, marquage, examens, identité, préparation), stérilisation (parc de boîtes, délai, boîtes non conformes, panne d'autoclave), implants et dispositifs manquants, manipulateurs radio, extemporanés, transfusions, intubation difficile, internes, check-list HAS, transfert en SSPI avec brancardier, bionettoyage de fin de programme, patients BMR, panne informatique.

Restent à faire : les conversions de coelioscopie et les reprises (section 13), les aides-soignants et les salles d'induction, et surtout la validation des hypothèses avec les équipes du bloc (section 15).

Calibrage contrôlé avec `tools/compare_logs.py` (30 journées types contre 208 jours ouvrés réels) : interventions par jour, durées, première entrée en salle (8 h 40 contre 8 h 41), dernière sortie, occupation des salles et part de salles finissant après 18 h 30 (8 % contre 7 %) sont dans les intervalles réels.

Le **mode campagne** (`npm run campagne`) tire des milliers de journées plausibles et variées pour tester une fiche technique dans de nombreux contextes ; voir le GUIDE et les exemples `docs/campagne-exemple-*.md`.

## Sommaire

0. [Ce qui est faux aujourd'hui](#0-ce-qui-est-faux-aujourdhui)
1. [Salle de pré-anesthésie](#1-salle-de-pré-anesthésie)
2. [Patients debout et patients couchés](#2-patients-debout-et-patients-couchés)
3. [Brancards, lits et transferts](#3-brancards-lits-et-transferts)
4. [Une personne, un seul endroit à la fois](#4-une-personne-un-seul-endroit-à-la-fois)
5. [Équipes, horaires, pauses et absences](#5-équipes-horaires-pauses-et-absences)
6. [Patients : absents, retards, dossiers, profils](#6-patients--absents-retards-dossiers-profils)
7. [Chirurgiens et programme](#7-chirurgiens-et-programme)
8. [Matériel, stérilisation, équipements partagés](#8-matériel-stérilisation-équipements-partagés)
9. [Urgences et garde](#9-urgences-et-garde)
10. [Variations d'affluence](#10-variations-daffluence)
11. [SSPI et aval](#11-sspi-et-aval)
12. [Protocoles et temps incompressibles](#12-protocoles-et-temps-incompressibles)
13. [Aléas pendant l'intervention](#13-aléas-pendant-lintervention)
14. [Nouveaux paramètres et indicateurs](#14-nouveaux-paramètres-et-indicateurs)
15. [Données à recueillir pour calibrer](#15-données-à-recueillir-pour-calibrer)
16. [Ordre de réalisation proposé](#16-ordre-de-réalisation-proposé)
17. [Sources](#17-sources)

## 0. Ce qui est faux aujourd'hui

Mesures faites sur 30 journées simulées et sur l'export OPROOM (janvier à octobre 2026).

| Problème | Mesure | Priorité |
| --- | --- | --- |
| **Le chirurgien de garde opère dans deux salles en même temps** | 21 chevauchements sur 30 jours simulés, de 96 min en médiane. Dans les vraies données : 55 sur 7 722 interventions, de 22 min en médiane (fermeture déléguée ou horodatage) | P1 |
| **Une induction démarre sans MAR** | Le MAR est affecté à deux salles qui démarrent à la même heure. Il arrive en retard dans la seconde, mais la phase d'induction démarre quand même | P1 |
| **Aucune limite au nombre de patients par MAR** | Rien n'empêche un MAR d'avoir trois patients endormis en même temps, alors que la règle est de deux au maximum (voir [4.2](#42-le-médecin-anesthésiste-réanimateur)) | P1 |
| **Le patient passe directement de l'accueil à la salle** | Aucune salle de pré-anesthésie, aucune ALR faite en dehors de la salle, aucun patient debout | P1 |
| **Brancards illimités** | Tout patient trouve toujours un brancard | P2 |
| **Personne ne fait de pause, personne n'est absent** | Équipes complètes et présentes de l'ouverture à la fermeture | P2 |
| **Les patients arrivent toujours à l'heure et prêts** | Pas de retard, pas de dossier incomplet, pas d'absent le jour même | P2 |
| **La sortie de SSPI ne dépend que du temps** | Elle devrait attendre la décision d'un MAR et une place dans le service d'aval | P2 |

Point à noter dans les vraies données : la moitié des journées de MAR (49 %) couvrent plusieurs salles. Dans 135 journées, un même MAR apparaît sur trois salles ou plus en même temps. C'est contraire à la règle des deux patients. C'est sans doute le MAR « référent » du dossier plutôt que le MAR physiquement présent : à vérifier avec l'équipe d'anesthésie avant de calibrer.

## 1. Salle de pré-anesthésie

Aussi appelée salle de pré-induction, salle d'accueil du bloc ou SAS patients selon les établissements.

### Pourquoi c'est essentiel

Elle **découple l'arrivée du patient de la disponibilité de la salle**. Elle sert de tampon : le patient suivant est prêt, perfusé et vérifié quand la salle se libère. Certains gestes sont faits en temps masqué, comme l'ALR (bloc nerveux) faite pendant que l'intervention précédente se termine. Sans elle, la salle attend le patient. Avec elle, mais trop petite, ce sont les patients qui attendent dans les services ou dans le couloir.

### Ce qu'il faut modéliser

| Élément | Règle | Priorité |
| --- | --- | --- |
| Capacité | Nombre de postes, séparés en **postes assis** (fauteuils, patients debout) et **postes couchés** (brancards ou lits). Paramètre réglable | P1 |
| Personnel | Une IDE ou une IADE d'accueil, qui ne peut s'occuper que d'un nombre limité de patients à la fois. Un MAR doit être présent pour toute ALR faite en pré-anesthésie | P1 |
| Accueil | Vérification de l'identité, du dossier, du jeûne, du consentement, du site opératoire, des allergies. Premier temps de la check-list. Durée de quelques minutes, plus longue si un élément manque | P1 |
| Préparation | Pose de la voie veineuse, prémédication éventuelle, monitorage de base | P1 |
| ALR en temps masqué | Pour les patients d'orthopédie ou de chirurgie de la main, bloc fait en pré-anesthésie par le MAR, avec un délai d'installation du bloc avant l'incision. Le MAR est alors occupé et ne peut pas induire ailleurs | P1 |
| Appel du patient | Le bloc appelle le service X minutes avant l'heure prévue. Trop tôt, la pré-anesthésie se remplit. Trop tard, la salle attend. Paramètre « délai d'appel » | P1 |
| Saturation | Pré-anesthésie pleine, donc les appels sont suspendus et les patients restent dans le service. Indicateur « salle en attente de patient » | P1 |
| Patients exclus | Urgences vitales (directement en salle), enfants selon l'organisation (avec un parent jusqu'à l'induction), patients isolés (BMR, contagieux) qui ne passent pas par une salle commune | P2 |
| Visuel | Une nouvelle zone sur le plan, entre l'accueil et le couloir, avec ses fauteuils et ses brancards, et l'état de chaque patient : en attente, en préparation, ALR en cours, prêt | P1 |

### Indicateurs associés

- attente en pré-anesthésie (de l'arrivée à l'entrée en salle) ;
- minutes de salle vides en attendant un patient prêt ;
- taux d'occupation de la pré-anesthésie et pic par heure ;
- nombre de patients prêts avant que leur salle soit libre (le tampon).

## 2. Patients debout et patients couchés

### La réalité

Le « patient debout » est une pratique de chirurgie ambulatoire : le patient va **à pied** au bloc, accompagné, jusqu'à la table, sans prémédication. Les retours d'expérience la décrivent surtout en **ophtalmologie** (intervention sur fauteuil) et en **endoscopie** (patient opéré sur son brancard). Les soignants signalent aussi deux effets de bord : le **manque de brancard pour le retour** du bloc et l'**encombrement des couloirs**. Ce sont précisément deux choses que BlocSim doit faire apparaître.

### Ce qu'il faut modéliser

| Élément | Règle | Priorité |
| --- | --- | --- |
| Mode d'arrivée | Pour chaque patient : debout (à pied), fauteuil roulant, couché (lit ou brancard). Tiré selon la spécialité, l'admission (ambulatoire ou hospitalisé) et l'âge. Exemple de départ, à calibrer : majorité debout en ophtalmologie et en endoscopie ambulatoire, couché pour l'hospitalisé et pour l'orthopédie des membres inférieurs | P1 |
| Accompagnement | Un patient debout est accompagné par un brancardier ou un aide, qui peut **en accompagner plusieurs à la fois** (groupe). Un patient couché mobilise un brancardier, deux pour un lit lourd ou un patient obèse | P1 |
| Vitesse | Patient debout plus lent qu'un brancard dans les couloirs, mais pas d'attente de brancard. Couché : transfert lit-brancard au départ du service | P2 |
| Installation sur la table | Debout : le patient s'installe lui-même (plus rapide). Couché : transfert brancard-table à plusieurs (plus long, plus pour un patient obèse ou douloureux) | P1 |
| Retour | **Un patient venu debout repart couché** après une AG ou une ALR : il faut alors un brancard en SSPI. Après une anesthésie locale, il peut repartir assis ou à pied | P1 |
| Postes en pré-anesthésie | Debout : poste assis. Couché : poste couché. Les deux capacités sont séparées | P1 |
| Exclusions | Patient âgé dépendant, troubles cognitifs, prémédication lourde, refus du patient : couché | P2 |

### Visuel

Distinguer à l'écran le patient qui marche (personnage en tenue de patient), le fauteuil et le lit ou brancard.

## 3. Brancards, lits et transferts

| Élément | Règle | Priorité |
| --- | --- | --- |
| Stock fini | Nombre de brancards du bloc (paramètre). Un brancard est soit libre et propre, soit occupé par un patient, soit sale et en attente de nettoyage | P1 |
| Cycle d'un brancard | Service, puis pré-anesthésie, puis reste à la porte de la salle ou repart, puis SSPI, puis service, puis nettoyage. Le brancard ne revient pas tout seul : un brancardier doit le ramener | P1 |
| Lit du patient | En hospitalisation, beaucoup d'établissements font venir le patient dans **son lit**, qui reste en SSPI. Choix de l'organisation, en paramètre : lit ou brancard | P2 |
| Transfert lit-brancard | Dans le service ou dans un sas de transfert. Durée de quelques minutes et deux personnes | P2 |
| Pénurie | Pas de brancard propre : le patient attend dans le service, ou le patient opéré attend en salle qu'un brancard arrive. Indicateur « attente de brancard » | P1 |
| Nettoyage | Durée de nettoyage d'un brancard, par l'ASH ou le brancardier | P2 |
| Ascenseurs et distances | Si le service est à un autre étage : temps d'ascenseur variable, et plus long aux heures de pointe (relève, repas) | P3 |
| Encombrement du couloir | Nombre maximal de brancards garés dans le couloir. Au-delà, gêne et ralentissement (signalé par les soignants avec le patient debout) | P3 |

## 4. Une personne, un seul endroit à la fois

C'est la règle la plus importante : **le moteur doit refuser de placer une personne à deux endroits**. Quand elle est occupée, la tâche attend, ou elle est confiée à une autre personne habilitée.

### 4.1 Le chirurgien

| Règle | Détail | Priorité |
| --- | --- | --- |
| Une salle à la fois | Le chirurgien est présent du début du temps opératoire (incision) à la fin du geste principal. Il ne peut pas inciser ailleurs pendant ce temps | P1 |
| Double salle (salle en tiroir), en option | Pratique de certaines équipes : le chirurgien alterne entre deux salles. L'installation et la fermeture sont faites par un interne ou un assistant. **Seul le temps principal exige sa présence.** Paramètre par chirurgien ou par spécialité, désactivé par défaut. Une salle attend s'il est encore occupé dans l'autre | P1 |
| Garde | **Un chirurgien de garde par spécialité** : deux urgences de la même spécialité ne peuvent pas être opérées en même temps, sauf si un second chirurgien est appelé (astreinte, délai de venue) | P1 |
| Hors bloc | Le chirurgien n'est pas au bloc toute la journée : consultation, visite, staff, avis aux urgences. Il peut arriver en retard pour son premier patient (voir [7](#7-chirurgiens-et-programme)) | P2 |
| Aide opératoire | Certaines interventions demandent un aide (interne, assistant, second chirurgien) : sans aide disponible, l'intervention ne démarre pas | P3 |

### 4.2 Le médecin anesthésiste-réanimateur

| Règle | Détail | Priorité |
| --- | --- | --- |
| Deux patients au plus | Un MAR ne peut pas prendre en charge simultanément plus de deux patients en salle d'intervention, sauf anesthésie locale. Organisation type : un MAR supervise deux salles, avec une IADE dans chaque salle | P1 |
| Présent au bloc | Quand une IADE réalise ou surveille l'anesthésie, le MAR qui la supervise doit être physiquement présent au bloc. Une jurisprudence de 2025 l'a rappelé : il ne peut pas être en consultation pendant ce temps | P1 |
| Induction et réveil | Le MAR est présent à l'induction et au réveil. **Une seule induction à la fois** : si les deux salles sont prêtes en même temps, la seconde attend | P1 |
| ALR en pré-anesthésie | Pendant qu'il fait un bloc en pré-anesthésie, il n'est pas disponible pour une induction en salle | P1 |
| SSPI | Un MAR dirige la SSPI et **décide seul de la sortie** des patients. S'il est occupé, la sortie attend : lien direct avec la saturation de la SSPI | P2 |
| Consultation d'anesthésie | Certains MAR font des consultations : ils ne sont alors plus disponibles pour le bloc | P3 |
| Urgence vitale | Un MAR appelé en urgence quitte sa supervision : les salles qu'il couvrait ne peuvent plus endormir de nouveau patient tant qu'il n'est pas revenu ou remplacé | P2 |

### 4.3 Les infirmiers

| Règle | Détail | Priorité |
| --- | --- | --- |
| IADE | Une IADE par salle pour une AG ou une ALR. Elle accompagne le patient en SSPI et fait les transmissions : pendant ce temps, sa salle ne peut pas recevoir de nouveau patient endormi | P1 |
| Transfert en SSPI | Le patient est accompagné par le médecin qui a fait l'anesthésie ou par l'IADE, avec une transmission orale et écrite à l'arrivée | P1 |
| IBODE | Instrumentiste et circulante par salle. Sans instrumentiste, pas d'incision. Certaines spécialités demandent des IBODE formées (robot, orthopédie, neurochirurgie) : affectation par compétence | P2 |
| SSPI | Pendant toute l'ouverture, au moins une IDE formée en permanence, si possible IADE. **À partir de six postes occupés, au moins deux agents**, dont une IDE formée. Au-delà de ces seuils, les nouveaux patients attendent | P1 |

### 4.4 Brancardiers et ASH

| Règle | Détail | Priorité |
| --- | --- | --- |
| Un patient couché à la fois | Un brancardier transporte un seul patient couché. Il peut accompagner plusieurs patients debout | P1 |
| Tâches concurrentes | Le brancardier fait aussi les retours de brancards, les prélèvements, la pharmacie. Paramètre « temps hors patients » | P2 |
| Bionettoyage | Un ASH nettoie une salle à la fois. Bionettoyage renforcé (plus long) après un patient septique ou porteur de BMR | P2 |

## 5. Équipes, horaires, pauses et absences

| Élément | Règle | Priorité |
| --- | --- | --- |
| Horaires de poste | Chaque personne a un horaire : 7 h 30 - 15 h 30, 8 h - 18 h, 12 h, nuit. Elle n'existe pas dans la simulation hors de son poste. Relève avec transmissions à heure fixe | P2 |
| Pauses repas | 30 à 45 minutes, décalées entre 11 h 30 et 14 h, organisées pour ne pas arrêter les salles. Si personne ne peut remplacer, la salle ralentit | P2 |
| Absences | Arrêt maladie, absence de dernière minute. Taux à mesurer (paramètre « absentéisme »). Effet : salle fermée, ou programme réduit, ou équipe incomplète | P1 |
| Remplacement | Intérimaire ou personnel d'un autre secteur : présent, mais plus lent au début (ne connaît pas les lieux ni le matériel). Facteur de durée réglable | P2 |
| Heures supplémentaires | Au-delà de la fin de poste, une personne peut rester (débordement) dans une limite. Indicateur : heures supplémentaires | P2 |
| Fatigue | En fin de journée et après une garde, durées un peu plus longues et risque d'erreur plus élevé. Lien avec le modèle humain MOBO | P3 |
| Expérience | Novice ou expert (modèle de Dreyfus) : un novice est plus lent, un expert plus stable | P3 |

## 6. Patients : absents, retards, dossiers, profils

### 6.1 Ce qui arrive avant l'entrée en salle

| Événement | Effet | Priorité |
| --- | --- | --- |
| **Absent** (ne se présente pas) | Créneau vide. L'équipe peut avancer le patient suivant s'il est déjà là, sinon la salle attend | P1 |
| **Retard d'arrivée** | Le patient arrive après l'heure de convocation : son passage glisse, ou on fait passer le suivant avant lui (inversion d'ordre) | P1 |
| Annulation le jour même | Patient non à jeun, fièvre, tension trop haute, bilan anormal, arrêt d'un anticoagulant oublié : annulation après l'arrivée, parfois en pré-anesthésie | P1 |
| Dossier incomplet | Consentement non signé, consultation d'anesthésie absente, examen manquant, site non marqué : attente de régularisation ou annulation | P1 |
| Patient non prêt | Douche, dépilation ou prémédication non faites dans le service : retard | P2 |
| Anxiété, refus | Patient qui demande à parler au chirurgien, ou qui refuse : retard, rarement annulation | P3 |

Dans les vraies données, les annulations enregistrées viennent surtout des patients : 767 « annulé par le patient et/ou la famille » sur environ 1 300 annulations motivées. Viennent ensuite 147 reports et 69 récusations par le chirurgien, et 69 récusations par l'anesthésiste. On ne sait pas encore lesquelles ont lieu le jour même : c'est une donnée à recueillir.

### 6.2 Profils de patients

| Profil | Effet sur la journée | Priorité |
| --- | --- | --- |
| Âge, ASA, obésité | Durées d'installation, d'induction et de SSPI plus longues, transfert à plusieurs | P2 |
| Enfant | Parent présent jusqu'à l'induction, passage de préférence en début de programme, induction au masque | P2 |
| Allergie au latex | **Premier de la journée**, dans une salle préparée | P2 |
| Diabétique | De préférence en début de programme (jeûne) | P3 |
| Septique ou porteur de BMR | **Dernier du programme**, bionettoyage renforcé ensuite, pas de passage par une salle commune | P2 |
| Patient d'ambulatoire | Doit sortir avant la fermeture de l'unité ambulatoire. Sinon, conversion en hospitalisation (indicateur) | P2 |

L'ordre des patients dans le programme doit respecter ces règles : latex et enfants en premier, septiques en dernier.

## 7. Chirurgiens et programme

| Élément | Règle | Priorité |
| --- | --- | --- |
| Vacations | Planning hebdomadaire réel : tel chirurgien a telle salle le mardi matin. À tirer du planning plutôt que d'un chirurgien fictif par salle | P2 |
| Retard du premier cas | Chirurgien en visite ou en consultation, patient pas prêt, salle pas ouverte. Le premier cas démarre en retard une partie des jours. Taux à mesurer : l'heure réelle du premier cas (vers 8 h 40) est déjà calibrée | P1 |
| Staff et réunions | RCP ou staff certains matins : début de programme décalé ces jours-là | P3 |
| Durée propre au chirurgien | Certains chirurgiens sont systématiquement plus rapides ou plus lents pour un même acte. Facteur par chirurgien, mesurable dans l'export (codes pseudonymisés) | P2 |
| Formation | Un interne qui opère allonge la durée | P3 |
| Programme qui bouge | Cas ajoutés la veille ou le matin, cas retirés, ordre modifié | P2 |
| Règle de fin | Heure au-delà de laquelle on ne démarre plus un cas programmé (aujourd'hui 18 h), et tolérance de débordement selon la durée prévue du cas | P1 |

## 8. Matériel, stérilisation, équipements partagés

| Élément | Règle | Priorité |
| --- | --- | --- |
| Boîtes d'instruments | Stock fini par type. Une boîte utilisée part en stérilisation et revient après un cycle de plusieurs heures. Deux interventions qui demandent la même boîte rare ne peuvent pas s'enchaîner trop vite | P2 |
| Ancillaires de prêt | En orthopédie, matériel prêté par le fournisseur : arrivée en retard possible, donc intervention décalée ou annulée | P3 |
| Équipements partagés | Amplificateur de brillance (radioscopie), colonne de coelioscopie, échographe pour l'ALR, robot, microscope : nombre limité, partagés entre salles. Une intervention qui en a besoin attend qu'il soit libre | P1 |
| Pannes | Déjà présentes (panne de salle). À étendre à un équipement précis : robot, colonne, table | P2 |
| Dispositifs médicaux | Implant ou DM manquant, traçabilité par scan du code UDI (temps de scan par dispositif). Lien avec la base des dispositifs médicaux du projet | P3 |
| Temps de radioprotection | Port du tablier plombé et contraintes de scopie : un peu plus de temps d'installation | P3 |

## 9. Urgences et garde

| Élément | Règle | Priorité |
| --- | --- | --- |
| Classification par délai | Remplacer « vitale, urgente, différée » par la classification locale par délai maximal (par exemple : immédiate, moins de 1 h, moins de 6 h, moins de 24 h). Indicateur : part des urgences prises en charge dans leur délai | P1 |
| Venue de l'astreinte | La nuit et le week-end, le chirurgien d'astreinte est souvent à domicile : délai de venue avant de pouvoir opérer | P1 |
| Une équipe de garde | Une seule équipe la nuit (chirurgien par spécialité, MAR, IADE, IBODE). Deux urgences simultanées : la seconde attend, sauf appel d'une seconde équipe d'astreinte | P1 |
| Urgence qui interrompt le programme | Une urgence immédiate prend la prochaine salle libre et **décale tout le programme de cette salle** (déjà en partie), avec risque de déprogrammation en fin de journée | P1 |
| Bilan avant le bloc | L'urgence arrive des urgences ou d'un service : bilan, imagerie, consentement, ce qui prend du temps avant d'être opérable | P2 |
| Césarienne en urgence | En obstétrique, codes couleur de césarienne avec des délais très courts, souvent dans une salle dédiée au bloc obstétrical | P3 |
| Arrêt cardiaque, urgence vitale au bloc | Mobilise le MAR et des IADE d'autres salles : ralentit tout le bloc | P2 |

## 10. Variations d'affluence

Mesurées dans l'export OPROOM : **volume moyen par jour selon le jour de semaine et le mois**.

| Jour | Lundi | Mardi | Mercredi | Jeudi | Vendredi | Samedi | Dimanche |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Interventions par jour | 32 | 30 | 35 | 43 | 29 | 5 | 5 |

| Mois (jours de semaine) | Janv. | Févr. | Mars | Avril | Mai | Juin | Juil. | Août | Sept. | Oct. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Interventions par jour | 34 | 36 | 36 | 39 | 30 | 38 | 31 | 20 | 37 | 36 |

| Élément | Règle | Priorité |
| --- | --- | --- |
| Jour de semaine | Choisir un jour (lundi à dimanche) dans l'écran de scénario : volume, salles ouvertes, spécialités et urgences tirés pour ce jour. Le jeudi est le plus chargé, le vendredi le moins chargé en semaine | P1 |
| Mois et saison | Août à environ 55 % de l'activité, mai et juillet plus bas (ponts, congés). Paramètre « période » | P1 |
| Épidémies | En période de grippe ou d'épidémie : plus d'annulations (patients malades), plus d'absences de personnel, lits d'aval saturés | P2 |
| Lendemain de week-end et de jour férié | Urgences différées accumulées le lundi matin | P2 |
| Vacances scolaires | Plus d'enfants (ORL, chirurgie pédiatrique) | P3 |
| Variabilité des urgences | Le nombre d'urgences varie d'un jour à l'autre (aujourd'hui toujours le même). Tirage selon la distribution réelle | P1 |

## 11. SSPI et aval

| Élément | Règle | Priorité |
| --- | --- | --- |
| Personnel de SSPI | Une IDE formée en permanence, deux agents dès six postes occupés (voir [4.3](#43-les-infirmiers)). La capacité réelle dépend des lits **et** du personnel présent | P1 |
| Sortie décidée par un MAR | Pas de sortie sans décision d'un MAR (score de sortie validé). MAR occupé, donc sortie retardée | P2 |
| Lits d'aval | Sortie vers un service seulement s'il a un lit. Réanimation ou soins continus pleins : le patient reste en SSPI (boarding) et bloque un poste. Paramètre « lits disponibles par service » | P1 |
| Sortie de l'ambulatoire | Retour en unité ambulatoire, collation, sortie avec un accompagnant avant l'heure de fermeture. Sinon, nuit à l'hôpital | P2 |
| Complications en SSPI | Douleur, nausées et vomissements, réveil lent, désaturation : séjour prolongé pour une partie des patients | P2 |
| Retour au service | Brancardier et brancard nécessaires (voir [3](#3-brancards-lits-et-transferts)). Pas de brancardier, donc le patient attend en SSPI | P1 |

## 12. Protocoles et temps incompressibles

| Élément | Règle | Priorité |
| --- | --- | --- |
| Check-list « Sécurité du patient au bloc opératoire » | Trois temps : avant l'induction, avant l'incision (pause « time-out »), avant la sortie de salle. Chacun avec une durée et les personnes qui doivent être présentes. Pas d'incision sans le deuxième temps | P1 |
| Ouverture de salle | Le matin : vérification du respirateur et du matériel d'anesthésie, bionettoyage de début de journée, préparation des tables. La salle n'est pas prête à 7 h 30 pile | P2 |
| Comptage | Comptage des compresses et instruments avant la fermeture | P3 |
| Fin de journée | Bionettoyage approfondi, rangement, inventaire | P3 |
| Traçabilité | Saisie dans le logiciel du bloc, traçabilité des dispositifs implantés. Temps à intégrer, utile pour évaluer un outil numérique (c'est l'objet de Blocapta) | P2 |

## 13. Aléas pendant l'intervention

| Aléa | Effet | Priorité |
| --- | --- | --- |
| Complication peropératoire | Hémorragie, difficulté technique : durée prolongée, appel d'un second chirurgien ou d'un MAR | P2 |
| Conversion | Coelioscopie convertie en chirurgie ouverte : durée plus longue, matériel différent | P3 |
| Intubation difficile | Induction plus longue, MAR mobilisé plus longtemps | P2 |
| Reprise chirurgicale | Patient qui revient au bloc dans la journée : urgence supplémentaire | P3 |
| Arrêt de la salle | Problème d'hygiène, fuite, incident : salle arrêtée | P3 |

## 14. Nouveaux paramètres et indicateurs

### Paramètres à ajouter à l'écran « Créer une journée » et à `npm run sim`

| Groupe | Paramètre |
| --- | --- |
| Pré-anesthésie | Postes assis, postes couchés, IDE d'accueil, délai d'appel du patient, ALR en pré-anesthésie (oui ou non) |
| Patients | Part de patients debout par spécialité, taux d'absents, taux de retards et retard moyen, taux d'annulation le jour même, taux de dossiers incomplets |
| Brancards | Nombre de brancards, patient dans son lit ou sur brancard, durée de nettoyage |
| Équipes | Taux d'absentéisme, pauses repas, horaires de poste, double salle autorisée par spécialité, nombre d'équipes d'astreinte la nuit, délai de venue de l'astreinte |
| Équipements | Nombre d'amplificateurs, de colonnes de coelioscopie, d'échographes, de robots |
| Aval | Lits disponibles par service, heure de fermeture de l'ambulatoire |
| Calendrier | Jour de la semaine, mois ou période (épidémie, vacances, août) |

### Indicateurs à ajouter au bilan et au CSV détaillé

- attente en pré-anesthésie, salle en attente de patient, attente de brancard ;
- minutes d'attente d'un MAR (induction, réveil, sortie de SSPI) ;
- respect de la règle des deux patients par MAR, contrôle qui doit toujours être à 100 % ;
- urgences prises en charge dans leur délai, par classe ;
- patients bloqués en SSPI faute de lit d'aval ;
- conversions d'ambulatoire en hospitalisation ;
- heures supplémentaires par métier ;
- **contrôle d'ubiquité** : nombre de fois où une personne serait à deux endroits, qui doit toujours être à 0.

## 15. Données à recueillir pour calibrer

L'export OPROOM ne suffit pas pour la plupart de ces règles. À demander, si possible pseudonymisé :

| Donnée | Pour calibrer | Où la trouver |
| --- | --- | --- |
| Horodatages complets : arrivée en pré-anesthésie, entrée en salle, incision, fin d'intervention, sortie de salle, arrivée et sortie de SSPI | Pré-anesthésie, phases, SSPI | Logiciel du bloc (les champs existent mais sont presque vides dans l'export actuel) |
| Mode d'arrivée du patient (debout, fauteuil, couché) | Section 2 | Unité ambulatoire, logiciel du bloc |
| Nombre de brancards et de postes de pré-anesthésie | Sections 1 et 3 | Cadre du bloc |
| Planning des équipes (horaires, absences, intérim) | Section 5 | Planning du personnel |
| Planning des vacations chirurgicales | Section 7 | Cadre ou régulation du bloc |
| Annulations du jour même, avec le moment (veille, arrivée, pré-anesthésie) | Section 6 | Logiciel du bloc, unité ambulatoire |
| Classes d'urgence et délais réels | Section 9 | Logiciel du bloc, régulation |
| Lits disponibles en aval par jour | Section 11 | Gestion des lits |
| Équipements partagés et leur planning | Section 8 | Biomédical, cadre du bloc |
| Affectation réelle des MAR (qui est présent en salle, et non seulement le référent du dossier) | Section 4.2 | Équipe d'anesthésie |

À défaut de données, chaque paramètre garde une valeur proposée **et marquée « à calibrer »**, comme le prévoit le cahier des charges.

## 16. Ordre de réalisation proposé

1. **Contrainte d'ubiquité dans le moteur** : une personne, un lieu. Chirurgien de garde par spécialité, MAR limité à deux patients, une induction à la fois, IADE absente pendant le transfert. Ajouter le contrôle « 0 conflit » aux tests.
2. **Salle de pré-anesthésie** avec postes assis et couchés, IDE d'accueil, délai d'appel, ALR en temps masqué, et sa zone sur le plan.
3. **Patients debout ou couchés** et **stock de brancards**, avec leur cycle.
4. **Absents, retards, annulations du jour même, dossiers incomplets.**
5. **Calendrier** : jour de semaine, mois, variabilité des urgences.
6. **Personnel de SSPI, sortie décidée par le MAR, lits d'aval.**
7. **Équipes** : horaires, pauses, absentéisme, astreinte et délai de venue.
8. **Équipements partagés** et boîtes d'instruments.
9. **Profils de patients** et règles d'ordre du programme (latex, enfants, septiques).
10. Le reste (P3), selon les retours des équipes.

Après chaque étape : relancer `tools/compare_logs.py` pour vérifier que le réalisme mesuré ne se dégrade pas, et faire relire le comportement par un soignant du bloc.

## 17. Sources

- Code de la santé publique, article D6124-101 (personnel de SSPI) : présence d'au moins une IDE formée, et au moins deux agents dès six postes occupés. Repris dans la [présentation de la SSPI de la clinique Pasteur](https://talents.clinique-pasteur.com/wp-content/uploads/2022/09/E-WELCOME-SSPI-ATRIUM-v2.pdf) et dans une [réponse ministérielle à l'Assemblée nationale](https://questions.assemblee-nationale.fr/dyn/12/questions/QANR5L12QE11694.pdf).
- CNP ARMPO et SFAR, [communiqué de décembre 2024 sur les ressources humaines en anesthésie](https://snarf.org/wp-content/uploads/2024/12/CNPARMPO_CP_RH_241223.pdf) : un MAR ne prend pas en charge simultanément plus de deux patients en salle d'intervention, sauf anesthésie locale. [Recommandations SFAR correspondantes](https://snarf.org/wp-content/uploads/2024/12/RPP-RH-AR-validee-CA-SFAR-191224.pdf).
- [Question écrite au Sénat, 2005](https://www.senat.fr/questions/base/2005/qSEQ050618117.html) : schéma SFAR d'un MAR supervisant deux salles avec une IADE par salle.
- [Infirmiers.com, octobre 2025](https://www.infirmiers.com/droit-et-pratique/quand-un-iade-pratique-en-bloc-le-medecin-superviseur-doit-etre-present) : la Cour de cassation exige la présence au bloc du MAR qui supervise une IADE.
- [MACSF, le transfert en SSPI](https://www.macsf.fr/responsabilite-professionnelle/actes-de-soins-et-technique-medicale/qui-fait-quoi-en-salle-de-reveil-anesthesie) : accompagnement par le médecin ou l'IADE, transmission à l'arrivée, sortie décidée par le MAR.
- [Pourquoi Docteur, le patient debout à l'Institut Mutualiste Montsouris](https://www.pourquoidocteur.fr/Chirurgie-ambulatoire---quand-les-patients-entrent-au-bloc-debout-9568.html) : surtout en ophtalmologie (sur fauteuil) et en endoscopie (sur brancard).
- [EM-Consulte, « Le patient debout », CHU de Nice](https://www.em-consulte.com/article/920675/tableaux/le-patient-debout) : vécu des soignants, manque de brancard pour le retour, couloirs encombrés.
- Export OPROOM, janvier à octobre 2026 : chevauchements de chirurgiens et de MAR, volumes par jour et par mois, motifs d'annulation, délai d'arrivée au bloc.
