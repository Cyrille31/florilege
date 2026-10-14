# Florilège — Spécifications

*Sélection collective de photos — logiciel CGExcel — document de référence pour le développement avec Claude Code.*
*Nom : **Florilège** (dépôt GitHub : `florilege`). Icône : `florilege-icone.svg` (fournie).*

L'outil est pensé pour être **réutilisable dans d'autres contextes** (famille, association, événement…) : aucun nom, nombre ou libellé propre à une sélection donnée ne doit être codé en dur ; tout passe par la configuration.

---

## Fonctionnement simplifié (version actuelle, depuis la v0.9.0)

Décidé pour une première utilisation ; la suite du document décrit la cible complète.

- **Pas de lien personnel** : le testeur donne son prénom ; en le redonnant (majuscules et espaces ignorés), il retrouve son avancement sur n'importe quel appareil.
- **Mot de passe commun** (facultatif), défini depuis le menu du classeur et gardé dans les propriétés privées du script ; demandé une fois aux testeurs, puis mémorisé sur l'appareil. Sans lui, le serveur refuse toute requête, images comprises.
- **Pas d'étiquetage des visages** ni d'équilibrage des personnes pour l'instant.
- **Google Sheet à une seule feuille « Choix »** : `Photo | Dossier | Choix | Testeur | Horodatage`, une ligne par photo et par testeur, mise à jour quand le choix change (`cœur`, `étoile`, `x`, `non classé`). « Photo » est le nom du fichier original, « Dossier » son chemin relatif.
- **Photos** : dans le dossier Google Drive du classeur, un dossier par année (sous-dossiers possibles) ; le script `prep/reduire_photos.py`, relançable, crée à côté le jumeau `<année>-allégé` (même arborescence, photos réduites à 1 080 px, sans métadonnées). Un ensemble = un dossier d'année.
- **Liste des photos** : menu du classeur « Mettre à jour la liste des photos », qui recense les dossiers `-allégé` dans un fichier `florilege-photos.json`.

---

## 0. Consignes pour Claude Code

- Langue : interface, commentaires du code, README et messages en **français**.
- Cyrille **dépose les fichiers sur GitHub par le navigateur** : les fichiers et dossiers cachés (`.github/…`, `.gitignore`, etc.) sont ignorés lors de ce dépôt. **Signale explicitement chaque fichier caché créé ou modifié**, pour qu'il le place manuellement. Évite d'en créer quand ce n'est pas indispensable.
- **Pas d'étape de compilation** (pas de bundler, pas de npm côté front) : HTML, CSS et JavaScript « vanilla » (modules ES), déposables tels quels sur GitHub Pages.
- Avant de coder, **pose les questions de la section 14** (points ouverts) et propose un plan par jalons (section 13).
- Livre par petits jalons testables, à commencer par un prototype de la manche 1 avec des photos factices, à tester sur téléphone.

---

## 1. Contexte et objectif

- Environ **30 ensembles** de **20 à 200 photos** chacun (≈ 3 000 photos au total), stockés sur **OneDrive** (dossier synchronisé sur le PC de Cyrille, accès en lecture).
- Il faut retenir **4 photos par ensemble** (moins si l'ensemble en contient moins de 4).
- La sélection est faite par **une dizaine de sélectionneurs** à distance, sur téléphone ou PC (Android, iPhone/iPad, Windows, Mac). Il faut **tenir compte un peu de chacun**.
- Une **liste de personnes** donnée doit apparaître **à parts à peu près égales** sur l'ensemble des photos finalement retenues (≈ 120 photos).
- Les sélectionneurs ne veulent **ni apprendre un outil, ni y passer beaucoup de temps**. L'outil doit être **un peu ludique**, utilisable **en plusieurs fois**, et permettre de **commencer sur un appareil et finir sur un autre**.

### Objectifs mesurables

- Temps total demandé à un sélectionneur : **≤ 30 minutes**, fractionnables en sessions de 2 à 5 minutes.
- Aucune installation, aucune création de compte : **un lien personnel suffit**.
- Prise en main sans mode d'emploi : un écran d'accueil de trois lignes au maximum.

---

## 2. Acteurs

| Acteur | Rôle |
|---|---|
| **Administrateur** (Cyrille) | Prépare les photos, configure, lance et clôt les manches, arbitre les étiquettes, lance l'optimisation finale, ajuste et publie le résultat. |
| **Sélectionneur** (~10) | Trie, vote, confirme ou corrige les personnes présentes sur les photos. |
| **Personnes à équilibrer** | Liste fermée de personnes dont les apparitions doivent être équilibrées. Peuvent recouper les sélectionneurs (voir 14). |

---

## 3. Architecture générale

```
PC de Cyrille                              Internet
─────────────                              ────────
OneDrive : originaux (lecture seule)       GitHub Pages (dépôt « florilege »)
        │                                   index.html, admin.html, css/, js/
        ▼                                   (code seul, aucune photo)
prep/prepare_photos.py                             │ fetch (JSON)
        │ écrit dans                               ▼
        ▼                                   Google Apps Script
Google Drive pour ordinateur  ═══ synchro ══► (API web : votes + images)
  (G:\Mon Drive\Florilège\…)                       │
                                                   ▼
                              Google Drive : dossier de la sélection (privé)
                              images, Google Sheet, config, exports, résultat
```

**GitHub ne contient que le logiciel** (code, documentation, icône). Aucune photo ni aucune donnée de sélection n'y est jamais déposée.

### 3.1 Front-end

- Application monopage statique hébergée sur **GitHub Pages**.
- `index.html` : interface des sélectionneurs. `admin.html` : interface d'administration.
- JavaScript en modules ES, sans dépendance obligatoire. Une petite bibliothèque chargée depuis un CDN est tolérée si elle apporte beaucoup (par exemple pour les gestes tactiles), mais une implémentation maison des gestes (pointer events) est préférée.
- Responsive : conçu d'abord pour téléphone en mode portrait, puis adapté au PC (clavier et souris).

### 3.2 Back-end : Google Sheet + Apps Script

- Un **Google Sheet** contient toutes les données (structure en section 5).
- Un **script Apps Script** lié à ce classeur est déployé comme **application web** : « Exécuter en tant que : moi », « Accès : tout le monde ». Le classeur lui-même **n'est pas partagé publiquement**.
- Le code Apps Script est livré dans le dépôt (`apps-script/Code.gs`, plus éventuellement `appsscript.json`), pour être collé dans l'éditeur Apps Script. Le README doit expliquer le déploiement pas à pas, captures de menus comprises si possible.
- **Points techniques à respecter :**
  - Requêtes POST envoyées en `Content-Type: text/plain` (corps JSON) pour éviter la requête CORS préalable ; réponses en JSON via `ContentService`.
  - **LockService** pour toutes les écritures.
  - **Ajout seul** pour les votes et les étiquettes (on n'écrase jamais une ligne ; c'est la dernière valeur qui fait foi).
  - **Idempotence** : chaque événement client porte un identifiant unique (`event_id`) ; les doublons sont ignorés.
  - **Envoi groupé** côté client (voir 7.4) pour rester loin des quotas Apps Script.
  - L'URL de l'application web est inscrite dans un fichier `js/config.js`, facile à modifier.

### 3.3 Hébergement des images : Google Drive servi par l'Apps Script (décidé)

- Les copies réduites et les miniatures sont placées dans un **dossier Google Drive privé**, appartenant au même compte que le Google Sheet. Ce dossier **n'est partagé avec personne**.
- Les images sont servies **uniquement par l'Apps Script**, qui vérifie le jeton du demandeur avant de lire le fichier (DriveApp) et le renvoie encodé en base64 dans une réponse JSON. Le client reconstruit l'image (Blob, puis `URL.createObjectURL`).
- **Dépôt des images sur Drive** : le script de préparation écrit directement dans le dossier de la sélection sous **Google Drive pour ordinateur** (3.5), qui les synchronise ; aucune manipulation manuelle. À défaut de cette application, glisser-déposer du dossier `images/` dans Google Drive par le navigateur (décrit dans le README). L'admin déclenche ensuite l'**indexation** : l'Apps Script parcourt le dossier et associe chaque nom de fichier à son identifiant Drive (colonnes `drive_id` de l'onglet `Photos`).
- **Données EXIF supprimées** (notamment la position GPS) lors de la réduction ; l'orientation est appliquée aux pixels. Noms de fichiers en empreinte non parlante.

**Performance — point de vigilance majeur.** Une requête Apps Script coûte typiquement 0,5 à 2 s. Le tri doit pourtant paraître instantané. Exigences :

- **Miniatures par lots** : une seule requête renvoie les miniatures de 10 à 20 photos (≈ 15 Ko chacune).
- **Copies réduites allégées** : 1 080 px de grand côté, JPEG qualité 78 (≈ 120 à 180 Ko), une par requête.
- **Préchargement agressif** : pendant que l'on regarde la photo n, les photos n+1 à n+5 sont déjà demandées (requêtes parallèles, 3 à 4 à la fois au maximum).
- **Cache côté client** : Cache Storage (sous try/catch) pour ne jamais retélécharger une image déjà vue, y compris d'une session à l'autre sur le même appareil.
- **Cache côté serveur** : CacheService pour les miniatures (valeurs < 100 Ko).
- Au jalon 2, **mesurer** les temps réels sur téléphone en 4G et les rapporter à Cyrille. Si l'expérience n'est pas fluide, proposer une solution de repli (par exemple Cloudflare R2 avec un petit relais à jeton) **sans la mettre en œuvre sans accord**.
- Le README précise les **quotas** Apps Script des comptes Google gratuits pertinents (exécutions simultanées, durée d'exécution) et l'estimation de consommation pour ~10 sélectionneurs.

### 3.4 Identité et reprise multi-appareils

- Chaque sélectionneur reçoit un **lien personnel** : `https://…/index.html?v=<jeton>`. Le jeton est aléatoire, d'au moins 12 caractères, et généré par l'admin.
- Le jeton est la seule identité. Toute la progression est stockée côté serveur : en rouvrant le même lien sur un autre appareil, on retrouve exactement où on en était.
- Le jeton est aussi mémorisé localement (`localStorage`, protégé par try/catch) pour qu'une réouverture de la page sans paramètre fonctionne sur le même appareil.
- L'admin a un jeton distinct, qui donne accès à `admin.html` et aux actions d'administration (toutes vérifiées côté Apps Script).

### 3.5 Dossier de la sélection sur Google Drive (privé, tout au même endroit)

Tout ce qui concerne une sélection vit dans **un seul dossier Google Drive privé**, non partagé, par exemple `Mon Drive/Florilège/<nom de la sélection>/`. Sur le PC de Cyrille, ce dossier est accessible via **Google Drive pour ordinateur** (lecteur `G:` par défaut, chemin en paramètre). Seuls les **originaux** restent sur OneDrive, en lecture seule.

```
<nom de la sélection>/
├── Florilège — <nom de la sélection>   le Google Sheet (onglets de la section 5)
├── config/          personnes.csv, correspondance_noms.csv, paramètres du script
├── secret/          clé HMAC, table empreinte → fichier d'origine
├── images/          copies réduites et miniatures (servies par l'Apps Script)
├── prep/            CSV d'import, rapport_preparation.txt
├── exports/         exports CSV écrits directement par l'Apps Script
└── Selection_finale/<ensemble>/   originaux retenus, copiés par le script de copie
```

Avantages attendus :

- le script de préparation écrit **directement** dans ce dossier (images, CSV, rapport) ; la synchronisation fait le reste ;
- l'Apps Script **écrit lui-même les exports et le résultat** dans `exports/`, sans téléchargement manuel ;
- l'Apps Script peut lire `prep/` pour **importer les CSV** dans le Sheet (action « Importer » de l'admin), ce qui supprime l'import manuel de la section 4.3 ;
- une sélection = un dossier : archivage, copie ou suppression d'un seul geste.

Précautions :

- le dossier `secret/` ne doit **jamais** être lu par l'Apps Script ni servi par l'API ; l'API ne sert que des fichiers de `images/` dont l'identifiant figure dans l'onglet `Photos` ;
- la synchronisation des ~6 000 images prend du temps : le script de préparation indique en fin de traitement d'attendre la fin de la synchronisation avant l'indexation, et l'indexation signale les images manquantes.

Une nouvelle sélection, dans un autre contexte, = un nouveau dossier (avec son Sheet et son Apps Script, créés à partir d'un modèle documenté dans le README), sans toucher au code de GitHub.

---

## 4. Préparation des photos (script local)

Le script est en Python 3, dans `prep/prepare_photos.py`, avec un lanceur Windows `prep/lancer_preparation.bat`. Il s'exécute sur le PC de Cyrille.

### 4.1 Entrées

- Le chemin du dossier OneDrive racine. Par défaut, **un sous-dossier = un ensemble** (à confirmer, voir 14), et le nom affiché de l'ensemble est le nom du dossier.
- Le chemin de la sortie de **picasa_export** : personnes présentes et rectangles de visages par photo. Le format est à fournir par Cyrille (voir 14).
- Un fichier `correspondance_noms.csv`, édité par Cyrille, qui fait correspondre un nom Picasa à une personne de la liste à équilibrer (ou « ignorer »). Le script en génère un premier brouillon avec tous les noms Picasa rencontrés.
- Un fichier `personnes.csv` : la liste des personnes à équilibrer (identifiant, nom affiché, ordre).

### 4.2 Traitements

1. **Parcours des photos** : JPEG, PNG et HEIC (bibliothèque `pillow-heif` pour les photos d'iPhone). Les vidéos et autres fichiers sont ignorés et listés dans le rapport.
2. **Génération** pour chaque photo :
   - une **copie réduite** de 1 080 px de grand côté, JPEG qualité 78, progressif ;
   - une **miniature** de 320 px de grand côté ;
   - l'orientation EXIF est appliquée, puis **toutes les métadonnées sont supprimées** ;
   - le nom de sortie est une empreinte non devinable (par exemple les 20 premiers caractères d'un HMAC-SHA256 du contenu, avec une clé secrète locale).
3. **Rapprochement avec picasa_export** :
   - par **empreinte perceptuelle** de l'image (dHash ou pHash, bibliothèque `imagehash`) ;
   - en repli, par nom de fichier et date de prise de vue EXIF ;
   - les cas ambigus ou non trouvés sont listés dans le rapport.
   - **Attention aux recadrages Picasa** : les rectangles de visages doivent être exprimés dans le repère de l'image **réellement affichée**. Le script convertit les rectangles en coordonnées relatives (0 à 1) de la copie réduite et signale les incohérences.
4. **Application de la correspondance des noms** : seules les personnes de la liste à équilibrer sont retenues pour l'équilibrage. Les autres visages sont conservés comme « autre personne », sans nom affiché.
5. **Production** :
   - le dossier `images/` (copies réduites et miniatures) à déposer dans le dossier Google Drive ;
   - les fichiers CSV d'import pour le Google Sheet : `Ensembles`, `Photos`, `VisagesPicasa`, `Personnes` ;
   - un fichier `rapport_preparation.txt`, lisible par un humain : comptes par ensemble, photos ignorées, rapprochements ratés, noms Picasa non mappés.
6. **Relance sans risque** : relancer le script ne régénère que ce qui a changé et ne modifie jamais les originaux (lecture seule).

### 4.3 Import dans le Google Sheet

Action « Importer » dans `admin.html` : l'Apps Script lit les CSV dans `prep/` du dossier de la sélection (3.5) et remplit les onglets, après contrôle de cohérence. L'import manuel des CSV, onglet par onglet, reste documenté dans le README en secours.

---

## 5. Structure du Google Sheet

Chaque onglet a une ligne d'en-tête. Les identifiants sont des chaînes courtes et stables.

| Onglet | Colonnes | Remarques |
|---|---|---|
| `Config` | `cle`, `valeur` | Phase en cours, paramètres (section 9), dossier Drive des images, jeton admin (haché). |
| `Selectionneurs` | `id`, `nom`, `jeton`, `actif`, `personne_id` | `personne_id` est rempli si le sélectionneur fait partie des personnes à équilibrer. |
| `Personnes` | `id`, `nom`, `ordre` | Liste à équilibrer. |
| `Ensembles` | `id`, `nom`, `ordre`, `nb_photos` | |
| `Photos` | `id`, `ensemble_id`, `fichier`, `miniature`, `drive_id`, `drive_id_mini`, `largeur`, `hauteur`, `date_prise`, `ordre` | `fichier` et `miniature` : noms produits par le script ; `drive_id*` : remplis par l'indexation du dossier Drive. |
| `VisagesPicasa` | `photo_id`, `visage_id`, `personne_id`, `x`, `y`, `l`, `h` | Coordonnées relatives (0 à 1). `personne_id` vide = autre personne. |
| `Attributions` | `selectionneur_id`, `ensemble_id`, `manche` | Généré par l'admin. |
| `Votes` | `horodatage`, `event_id`, `selectionneur_id`, `manche`, `type`, `photo_id`, `photo_b_id`, `valeur` | Ajout seul. `type` : `tri` (manche 1) ou `duel` (manche 2). |
| `Etiquettes` | `horodatage`, `event_id`, `selectionneur_id`, `photo_id`, `action`, `visage_id`, `personne_id`, `x`, `y`, `l`, `h` | Ajout seul. `action` : `valider`, `renommer`, `retirer`, `ajouter`. |
| `ShortList` | `ensemble_id`, `photo_id`, `score_m1`, `rang` | Calculé par l'admin à la fin de la manche 1. |
| `EtiquettesFinales` | `photo_id`, `personne_id`, `origine` | Origine : `picasa`, `consensus` ou `arbitrage`. |
| `Resultat` | `ensemble_id`, `photo_id`, `rang`, `force_par_admin` | Sélection finale. |
| `Journal` | `horodatage`, `selectionneur_id`, `evenement`, `detail` | Connexions, erreurs remontées par le client, actions d'administration. |

L'Apps Script écrit à la demande de l'admin des **exports CSV** des principaux onglets dans `exports/` (3.5), pour les analyses en Excel.

---

## 6. Phases du processus

| Phase | Qui | Contenu |
|---|---|---|
| **0. Préparation** | Admin | Script local, dépôt des images sur Drive et indexation, import, création des jetons, envoi des liens. |
| **1. Tri éclair** | Sélectionneurs | Chaque sélectionneur trie les ensembles qui lui sont attribués (section 7.2). |
| **Calcul de la short-list** | Admin | 10 à 12 photos par ensemble (paramètre). |
| **2. Finale** | Tous les sélectionneurs | Duels sur la short-list, avec étiquetage intégré (sections 7.3 et 7.5). |
| **Arbitrage des étiquettes** | Admin | Résolution des désaccords. |
| **3. Optimisation** | Admin | Calcul de la sélection finale avec équilibrage (section 8.4), puis ajustement manuel. |
| **4. Révélation** | Tous | Affichage ludique du résultat final. |

L'admin ouvre et ferme chaque phase. Quand une phase est fermée, l'interface des sélectionneurs affiche un message d'attente sympathique et la progression collective.

---

## 7. Interface des sélectionneurs (`index.html`)

### 7.1 Accueil

- « Bonjour Marie ! » suivi d'une phrase expliquant la phase en cours, en une ligne.
- La **carte des ensembles** : une mosaïque de tuiles, une par ensemble attribué, avec la miniature d'une photo. Chaque tuile se **colorie au fil de la progression** (vide, en cours, terminée).
- Un gros bouton **« Continuer »** qui reprend exactement là où on s'était arrêté.
- Une **jauge collective** : « Ensemble, nous avons trié 62 % des photos ». Elle montre la progression du groupe, jamais les votes des autres.
- Un indicateur de synchronisation discret (tout est enregistré / en attente / hors ligne).

### 7.2 Manche 1 — Tri éclair

- Trois modes d'affichage, au choix à tout moment (que l'ensemble ait été examiné en entier ou non) : **une à une**, **retenues** (comme « une à une », mais seules les photos gardées ❤️ ou ⭐ restent affichées) et **imagettes**.
- **Une à une** : la photo courante en grand ; les 3 photos précédentes et les 3 suivantes sont visibles de part et d'autre, de plus en plus petites et à moitié cachées. On peut **défiler en avant et en arrière sans rien valider**. Le défilement dépend de la longueur du geste, pas de sa vitesse : jusqu'à 4 cm, une photo ; au-delà, 2 photos ; plusieurs grands gestes de suite dans le même sens, 5 photos (avec un ralentissement progressif).
- Un **pourtour de couleur** indique le choix (rouge : gardée, doré : coup de cœur, gris : écartée), en mode photo comme en imagettes.
- Gestes et commandes :

| Action | Téléphone | PC | Valeur |
|---|---|---|---|
| Photo précédente / suivante (sans valider) | glisser à droite / à gauche, ou boutons ‹ › | ← / → | — |
| ❤️ Je garde | glisser vers le haut, ou bouton | ↑ | 1 |
| ✖️ Je passe | glisser vers le bas, ou bouton | ↓ | 0 |
| ⭐ Coup de cœur | étoile dans le coin de la photo (grise si non choisie, dorée si choisie) | E, ou clic sur l'étoile | 2 |
| Changer le choix | pastille dans l'autre coin de la photo : · → ❤️ → ⭐ → ✖️ → · | clic sur la pastille | — |
| Effacer le choix (la photo redevient « à trier »), même longtemps après | bouton ⌫ | Suppr ou Retour arrière | vide |
| Voir en grand | toucher deux fois, pincer, ou 🔍 | clic sur la photo, Entrée ou 🔍 (plein écran si possible) | — |

- **Visionneuse plein écran** : les mêmes commandes y restent disponibles (sans zoom : glisser gauche / droite / haut / bas ; flèches du clavier ; barre de boutons ✖️ ‹ ⭐ › ❤️), avec en haut le choix de la photo et un petit compteur ⭐ x/4 · ❤️+⭐ ; la photo y garde son pourtour de couleur.

- Flèches et gestes haut / bas font monter ou descendre d'un cran sur l'échelle ✖️ ↔ ❤️ ↔ ⭐ : haut sur un ❤️ donne ⭐, bas sur un ⭐ redonne ❤️ ; les boutons ❤️ et ✖️ donnent directement leur valeur. Une photo écartée est grisée, y compris en plein écran.
- Par défaut, la photo reste affichée après un choix ; une case « Passer à la photo suivante après ❤️ ou ✖️ » (mémorisée sur l'appareil) permet d'avancer automatiquement.
- Le nombre de **coups de cœur est limité par ensemble** (paramètre, 4 par défaut) pour qu'ils gardent leur valeur. Des compteurs affichent : ⭐ utilisés / limite, ❤️+⭐ (photos gardées), ✖️, et le nombre de photos restant à trier.
- **Préchargement** des 5 photos suivantes (voir 3.3) ; la miniature s'affiche instantanément, puis la version 1 080 px.
- En fin d'ensemble (dernière photo triée) : une courte animation de félicitations et un bandeau (résumé, bouton « ensemble suivant ») qui s'estompe de lui-même, sans empêcher de continuer à retoucher les choix.
- **Imagettes** : grille de miniatures avec un badge par photo ; toucher une imagette l'ouvre en grand, toucher son badge change le choix (· → ❤️ → ⭐ → ✖️ → ·).
- **Sélection multiple en imagettes** : un appui long sur une imagette la sélectionne ; ensuite, un appui court ajoute ou retire une imagette, un appui long sélectionne toutes celles comprises entre la précédente et celle-ci. Une barre permet d'appliquer ❤️, ⭐, ✖️ ou · (à trier) à toute la sélection (la limite de coups de cœur est vérifiée). Sur PC : Ctrl+clic (ajouter / retirer) et Maj+clic (plage).
- Un bouton **« 🏠 Accueil »** bien visible ramène à l'accueil.
- Les choix sont acceptés à tout moment, même sans réseau (voir 7.4).

### 7.3 Manche 2 — Finale par duels

- Deux photos de la short-list d'un même ensemble s'affichent : côte à côte sur PC, l'une au-dessus de l'autre sur téléphone. **On touche la préférée.**
- Bouton « Difficile à dire » (passe, sans vote).
- Pour chaque sélectionneur et chaque ensemble, environ **8 duels** (paramètre), choisis par l'algorithme de la section 8.3.
- **Mode alternatif** « Choisis tes 4 », proposé surtout sur PC : la grille de la short-list, où l'on touche ses 4 préférées par ordre de préférence. Ce classement est converti en duels implicites (la 1re bat la 2e, etc., et les 4 choisies battent les non choisies). Le sélectionneur choisit librement son mode, ensemble par ensemble.
- Barre de progression et carte des ensembles, comme en manche 1.

### 7.4 Enregistrement, hors-ligne et reprise

- Chaque action produit un **événement** (`event_id` unique, horodatage client) placé dans une **file locale**. Cette file est conservée dans `localStorage`, sous try/catch ; en cas d'échec, elle reste en mémoire.
- La file est envoyée **par lots** : toutes les 10 actions, toutes les 15 s, au passage en arrière-plan (`visibilitychange`) et à la fermeture. En cas d'échec, nouvel essai avec délai croissant.
- Au chargement, le client récupère auprès du serveur **l'état complet** du sélectionneur (dernières valeurs par photo et par duel, progression), puis rejoue les événements locaux pas encore confirmés.
- Règle de résolution : pour un même couple (sélectionneur, photo, manche), **le dernier événement fait foi**.

### 7.5 Étiquetage des personnes (« Qui est sur la photo ? »)

- Il porte **uniquement sur la short-list**.
- C'est un mini-jeu proposé en interlude pendant la manche 2, par exemple après chaque série de duels d'un ensemble : 3 à 5 photos à vérifier, puis on reprend. Il est aussi accessible depuis l'accueil.
- La photo s'affiche avec les **cadres de visages issus de Picasa** et les **noms proposés** sous forme de pastilles. Le sélectionneur peut :
  - **valider** l'ensemble d'un geste (« C'est bon ! ») ;
  - **renommer** un visage : toucher le cadre, puis choisir un nom dans la liste des personnes ;
  - **retirer** un cadre erroné ;
  - **ajouter** une personne oubliée en touchant son nom dans la liste ; tracer un cadre est facultatif.
- Seules les personnes de la liste à équilibrer sont proposées. Un visage « autre personne » s'affiche sans nom.
- **Règle de consensus** : la valeur Picasa fait foi par défaut. Une correction (renommer, retirer, ajouter) est adoptée dès que **deux sélectionneurs** la confirment (paramètre). Les désaccords restants remontent à l'arbitrage de l'admin.
- Chaque photo de la short-list doit recevoir au moins **2 vérifications** (paramètre). Le jeu propose en priorité les photos les moins vérifiées.

### 7.6 Aspects ludiques

- Carte des ensembles qui se colorie, barres de progression et jauge collective.
- **Badges** simples, avec une animation légère à l'obtention :
  - premier ensemble trié ;
  - la moitié des ensembles triés ;
  - tout trié ;
  - 50 duels ;
  - 20 photos vérifiées ;
  - « Œil de lynx » : une correction d'étiquette adoptée par consensus.
- Messages d'encouragement variés et brefs, sans infantiliser.
- **Aucun classement compétitif entre sélectionneurs**, et aucune exposition des votes des autres avant la révélation, pour garder les votes indépendants.
- **Révélation finale** (phase 4) : les 4 photos retenues de chaque ensemble apparaissent l'une après l'autre ; chacun voit lesquelles faisaient partie de ses coups de cœur. Un récapitulatif montre la répartition des personnes dans la sélection finale.

### 7.7 Accessibilité et confort

- Tous les gestes ont un **équivalent en bouton**.
- Contrastes suffisants, mode sombre automatique, cibles tactiles d'au moins 44 px.
- Aucune donnée personnelle collectée au-delà des votes et des étiquettes.

---

## 8. Algorithmes

### 8.1 Attribution des ensembles (manche 1)

- Chaque ensemble est attribué à **k sélectionneurs** (paramètre, 3 par défaut).
- Le but est d'**équilibrer la charge** en nombre de photos. Algorithme glouton : traiter les ensembles du plus grand au plus petit et attribuer chacun aux k sélectionneurs les moins chargés, avec un tirage aléatoire à égalité.
- **Option** : éviter d'attribuer à un sélectionneur un ensemble où il apparaît beaucoup, s'il fait partie des personnes à équilibrer (voir 14).
- L'admin peut régénérer l'attribution avant l'ouverture de la manche, et la modifier à la main ensuite, par exemple pour remplacer un sélectionneur défaillant.

### 8.2 Short-list (fin de la manche 1)

- Score d'une photo :
  - on part de la valeur des votes (0, 1 ou 2) ;
  - on **normalise par sélectionneur**, pour que les votants généreux et sévères pèsent autant : centrage et réduction des valeurs de chaque sélectionneur, ensemble par ensemble ;
  - on fait la moyenne sur les sélectionneurs qui ont vu la photo.
- On retient les **N meilleures** photos par ensemble (paramètre, 12 par défaut, ou tout l'ensemble s'il est plus petit).
- **Garanties** :
  - toute photo ayant reçu au moins un coup de cœur entre dans la short-list si elle est dans les 2N premières (paramètre activable) ;
  - les photos vues par moins de 2 sélectionneurs sont signalées à l'admin.
- L'admin voit la short-list proposée et peut ajouter ou retirer des photos avant d'ouvrir la manche 2.

### 8.3 Duels (manche 2)

- **Choix des paires**, de façon adaptative, au sein d'un ensemble. On privilégie :
  - les paires dont les scores estimés sont **proches** (ce sont les plus informatives) ;
  - les photos les **moins comparées** jusqu'ici.

  On ne propose jamais deux fois la même paire au même sélectionneur. Le calcul se fait côté client à partir de l'état reçu ; un calcul serveur est acceptable s'il est plus simple.
- **Modèle** : Bradley-Terry, ajusté par l'algorithme MM (Hunter, 2004), avec une **régularisation** par pseudo-victoires (par exemple 0,5 victoire fictive contre une photo virtuelle de force moyenne), pour gérer les photos peu comparées.
- **Scores** :
  - un **score collectif** par photo : force estimée sur l'ensemble des duels ;
  - des **préférences individuelles** : pour chaque sélectionneur, sa propre estimation (ou sa proportion de victoires), utilisée pour le terme d'équité de la section 8.4.
- Les classements du mode « Choisis tes 4 » sont convertis en duels implicites (section 7.3).

### 8.4 Sélection finale avec équilibrage

Pour chaque ensemble e, on choisit exactement min(4, |short-list de e|) photos.

**Notations**

- x_p ∈ {0, 1} : la photo p est retenue.
- s_p : score collectif normalisé (centré et réduit par ensemble).
- n_k = Σ_p x_p · a_{p,k} : nombre d'apparitions de la personne k, où a_{p,k} = 1 si k figure sur p (d'après `EtiquettesFinales`).
- n̄ : moyenne des n_k sur les personnes de la liste.
- u_v = Σ_p x_p · r_{v,p} : satisfaction du sélectionneur v, où r_{v,p} est sa préférence individuelle normalisée.

**Objectif à maximiser**

```
J(x) = Σ_p s_p·x_p  −  λ · Σ_k (n_k − n̄)²  −  μ · Var_v(u_v)  +  ν · min_v(u_v)
```

- λ (équilibre des personnes), μ et ν (équité entre sélectionneurs) sont des paramètres réglables par l'admin.
- **Contraintes facultatives** : bornes dures n_k ∈ [min_k, max_k], par exemple ± 30 % autour de la moyenne ; photos imposées ou exclues par l'admin.

**Résolution**

- Point de départ : les 4 meilleures photos de chaque ensemble selon s_p.
- **Recherche locale par échanges** : remplacer, dans un ensemble, une photo retenue par une photo non retenue. Accepter les échanges qui améliorent J, avec un **recuit simulé** léger et quelques redémarrages aléatoires.
- La taille du problème (30 ensembles, C(12, 4) = 495 combinaisons chacun) permet un calcul **dans le navigateur de l'admin** en quelques secondes.
- La fonction est écrite dans un module JavaScript pur, sans accès au réseau, pour être testable.

**Affichage dans l'admin**

- La sélection proposée, ensemble par ensemble.
- Un **graphique en barres** des apparitions par personne, avec la cible n̄.
- Les indicateurs : score total, écart-type des n_k, satisfaction minimale et moyenne des sélectionneurs.
- Des curseurs λ, μ et ν avec **recalcul immédiat**, pour que Cyrille voie le compromis entre qualité et équilibre.
- La possibilité de **forcer** une photo (cadenas) ou d'en **exclure** une, puis de recalculer le reste.

---

## 9. Paramètres (onglet `Config`)

| Clé | Défaut | Rôle |
|---|---|---|
| `phase` | `preparation` | Phase en cours. |
| `photos_par_ensemble` | 4 | Nombre de photos retenues par ensemble. |
| `k_selectionneurs_m1` | 3 | Nombre de sélectionneurs par ensemble en manche 1. |
| `max_coups_de_coeur` | 4 | Coups de cœur autorisés par ensemble. |
| `taille_shortlist` | 12 | Taille de la short-list par ensemble. |
| `duels_par_ensemble` | 8 | Duels par sélectionneur et par ensemble. |
| `verifs_par_photo` | 2 | Vérifications d'étiquettes visées par photo. |
| `seuil_consensus` | 2 | Confirmations nécessaires pour adopter une correction. |
| `lambda`, `mu`, `nu` | 1 ; 0,5 ; 0,5 | Poids de l'optimisation (à calibrer). |
| `dossier_images_drive` | — | Identifiant du dossier Google Drive des images. |
| `titre_selection` | — | Nom de la sélection affiché aux sélectionneurs. |

---

## 10. Interface d'administration (`admin.html`)

- **Accès** par jeton admin, vérifié côté serveur.
- **Tableau de bord** : participation par sélectionneur (pourcentage fait, dernière activité), progression par ensemble, alertes (ensemble peu couvert, sélectionneur inactif depuis X jours).
- **Préparation** :
  - import des données et **indexation du dossier Drive des images** (avec contrôle : photos sans image, images sans photo) ;
  - création des sélectionneurs et des jetons ;
  - génération des **liens personnels** à copier, avec un message type à envoyer par mail ou WhatsApp.
- **Pilotage des phases** : ouvrir et fermer les manches ; générer et ajuster les attributions.
- **Short-list** : calcul, revue, ajustements manuels.
- **Arbitrage des étiquettes** : liste des photos en désaccord, avec la photo, les propositions et le choix de l'admin.
- **Optimisation** : le module de la section 8.4.
- **Résultat** :
  - publication, qui déclenche la phase de révélation ;
  - **export** de la sélection en CSV (ensemble, nom du fichier d'origine, personnes présentes) ;
  - un **script de copie** local (Python, avec lanceur `.bat`) qui lit le résultat dans `exports/` et la correspondance dans `secret/`, puis copie les originaux retenus depuis OneDrive vers `Selection_finale/<ensemble>/` du dossier de la sélection (3.5).
- **Exports CSV** des onglets bruts dans `exports/`, pour analyse en Excel.

---

## 11. Exigences non fonctionnelles

- **Performances** :
  - premier affichage en moins de 3 s sur une 4G moyenne ;
  - passage d'une photo à la suivante perçu comme instantané (préchargement, miniatures) ;
  - images en chargement différé dans les grilles.
- **Compatibilité** : versions récentes de Chrome Android, Safari iOS, Edge et Chrome Windows, Safari et Chrome Mac.
- **Robustesse** :
  - aucune perte de vote en cas de coupure réseau, de fermeture d'onglet ou de changement d'appareil ;
  - erreurs remontées dans l'onglet `Journal`.
- **Quotas** : envoi groupé ; pas plus d'une requête de lecture d'état au chargement, puis des requêtes d'écriture groupées. Le README précise les quotas Apps Script concernés.
- **Confidentialité** : voir 3.3 et 3.5. Pas d'outil de mesure d'audience, pas de traceur, pas de police de caractères chargée depuis un service tiers non indispensable.
- **Maintenabilité** :
  - code commenté en français ;
  - modules courts ;
  - algorithmes (sections 8.1 à 8.4) dans des modules **purs et testés** ;
  - tests JavaScript exécutables dans un navigateur (page `tests.html`) ou avec Node, sans dépendance lourde ;
  - tests Python avec `pytest` pour le script de préparation.

---

## 12. Structure du dépôt (appli)

```
florilege/
├── index.html              Interface sélectionneurs
├── manifest.json           Pour l'ajout à l'écran d'accueil du téléphone
├── admin.html              Interface administration
├── tests.html              Tests des modules algorithmiques
├── css/
│   └── style.css
├── img/
│   ├── florilege-icone.svg        Icône (fournie)
│   ├── florilege-icone-512.png    Icône pour l'écran d'accueil
│   ├── florilege-icone-192.png
│   └── florilege-icone-32.png     Favicon
├── js/
│   ├── config.js           URL de l'Apps Script
│   ├── api.js              Échanges avec Apps Script, file d'événements
│   ├── etat.js             État local, reprise
│   ├── tri.js              Manche 1
│   ├── duels.js            Manche 2
│   ├── etiquetage.js       « Qui est sur la photo ? »
│   ├── ludique.js          Badges, carte, animations
│   ├── admin.js
│   └── algo/
│       ├── attribution.js
│       ├── shortlist.js
│       ├── bradley_terry.js
│       └── optimisation.js
├── apps-script/
│   ├── Code.gs             À coller dans l'éditeur Apps Script
│   └── appsscript.json
├── prep/
│   ├── prepare_photos.py
│   ├── lancer_preparation.bat
│   ├── requirements.txt
│   └── tests/
├── robots.txt
├── README.md
├── LICENSE
└── SPECIFICATIONS.md       Ce document
```

**Aucun fichier caché n'est nécessaire a priori.** Si un `.gitignore` paraît utile, le signaler explicitement. Les fichiers sensibles (clé, table de correspondance, photos, exports) vivent **hors du dépôt**, dans le dossier de la sélection sur Google Drive (3.5).

**Identité visuelle** : l'icône fournie (une fleur dont les huit pétales sont des photos et le cœur un ❤️) donne la palette de l'interface : vert profond `#155e4d` à `#2a9d7f`, jaune `#ffc94a`, rouge cœur `#e8434f`, et les huit teintes des pétales (corail, orange, jaune, vert, turquoise, bleu, violet, rose), utilisables pour la carte des ensembles et les badges. Le nom « Florilège » et l'icône figurent sur l'écran d'accueil et l'écran « À propos ».

---

## 13. Jalons de réalisation

1. **Prototype de la manche 1**, avec 3 ensembles de photos factices et un back-end simulé localement : gestes, boutons, clavier, annulation, zoom, carte des ensembles. *À tester sur téléphone et sur PC.*
2. **Apps Script, Google Sheet et images sur Drive** : API, service des images, file d'événements, reprise multi-appareils, mode hors-ligne. *Tests : commencer sur PC, finir sur téléphone ; mesurer la fluidité du tri en 4G (voir 3.3).*
3. **Script de préparation** : réduction des images, empreintes, CSV d'import, rapport. Le rapprochement Picasa vient ensuite, dès qu'un échantillon réel de sortie de picasa_export est disponible.
4. **Admin, partie 1** : jetons et liens, attributions, pilotage des phases, tableau de bord, short-list.
5. **Manche 2** : duels, mode « Choisis tes 4 », Bradley-Terry.
6. **Étiquetage** : mini-jeu, consensus, arbitrage.
7. **Optimisation finale** et son interface, graphique, curseurs, exports, script de copie.
8. **Révélation finale**, badges, finitions et README complet.

Chaque jalon se termine par une liste de vérifications à faire par Cyrille.

---

## 14. Points ouverts — à poser à Cyrille avant de coder

1. **Sélectionneurs et personnes à équilibrer** : les sélectionneurs font-ils partie des personnes photographiées ? Si oui, faut-il des garde-fous contre le biais (attribution, pondération) ?
2. **Format de sortie de picasa_export** : fournir un échantillon réel (un dossier) avec les personnes et les rectangles de visages, et préciser si les rectangles se rapportent à l'image originale ou retouchée.
3. **Structure du OneDrive** : un sous-dossier correspond-il exactement à un ensemble ? Y a-t-il des sous-sous-dossiers ? Google Drive pour ordinateur est-il installé sur le PC, et à quel chemin (3.5) ?
4. **Nombre exact** de sélectionneurs, et **échéance** souhaitée.
5. **Contraintes particulières** : photos à imposer ou à exclure d'office, minimum d'apparitions pour une personne, etc.

Décisions déjà prises : nom **Florilège** ; votes dans un **Google Sheet** ; images sur **Google Drive** servies par l'Apps Script ; **GitHub uniquement pour le logiciel** ; fichiers de travail et résultats dans le même dossier **Google Drive** privé, originaux sur **OneDrive** en lecture seule ; étiquetage à partir des données de **picasa_export**.

---

## 15. Licence

Le logiciel est publié sous **licence MIT + « BAL 1.0 — Bonne Action License »** (fichier `LICENSE`).

Partout où la licence est mentionnée hors du fichier `LICENSE` (README, écran « À propos » des interfaces, en-têtes de fichiers le cas échéant), ajouter la phrase suivante :

> En échange, une seule chose vous est demandée, sur l'honneur : faire une bonne action chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c'est vous qui voyez.

L'écran « À propos » est accessible depuis le pied de page des deux interfaces et mentionne la marque **CGExcel** (cgexcel.wordpress.com).
