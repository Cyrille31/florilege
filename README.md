# Florilège — CGExcel

<img src="img/florilege-icone.svg" alt="" width="96" align="right">

**Sélection collective de photos**, sur téléphone ou PC, sans installation ni compte : un lien personnel suffit.
Chaque sélectionneur trie des ensembles de photos en quelques minutes, de façon un peu ludique ; l'outil combine
ensuite les avis de tous et équilibre la présence des personnes dans la sélection finale.

L'outil est réutilisable dans d'autres contextes (famille, association, événement…) : tout ce qui est propre à une
sélection passe par la configuration. Le détail est dans [`SPECIFICATIONS.md`](SPECIFICATIONS.md).

© 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (Bonne Action License), voir [`LICENSE`](LICENSE).

En échange, une seule chose vous est demandée, sur l'honneur : faire une bonne action chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c'est vous qui voyez.

---

## État d'avancement

| Jalon | Contenu | État |
|---|---|---|
| 1 | Prototype de la manche 1 (photos factices, back-end simulé) | livré |
| 2 | Apps Script, Google Sheet, images sur Drive | livré, puis simplifié (v0.9.0) |
| 3 | Script de préparation des photos | **réduction des photos livrée (v0.9.0)** ; rapprochement Picasa plus tard |
| 4 | Administration, partie 1 | à venir |
| 5 | Manche 2 (duels) | à venir |
| 6 | Étiquetage des personnes | à venir |
| 7 | Optimisation finale | à venir |
| 8 | Révélation, badges, finitions | à venir |

## Essayer le prototype (jalon 1)

Tant que `js/config.js` ne contient pas d'URL d'Apps Script, ou si l'on ajoute `?demo=1` à l'adresse
(`https://cyrille31.github.io/florilege/?demo=1`), l'application fonctionne en **mode démonstration** :
4 ensembles de photos factices, dessinées dans le navigateur ; rien n'est envoyé sur Internet, les choix sont
gardés dans le navigateur.

### Mise en ligne sur GitHub Pages

1. Déposer le contenu du dépôt sur la branche `main` (aucun fichier caché n'est nécessaire).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : « Deploy from a branch »**,
   branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une à deux minutes, l'application est disponible à l'adresse
   `https://<compte>.github.io/florilege/`.

### Paramètres utiles dans l'adresse (mode démonstration)

| Paramètre | Effet |
|---|---|
| `?reinit=1` | Remet la démonstration à zéro (comme le bouton « Remettre la démo à zéro » de l'accueil). |
| `?latence=1500` | Simule un réseau lent (en millisecondes par requête ; 400 par défaut). |
| `?horsligne=1` | Simule l'absence de réseau : les choix restent en attente sur l'appareil. |
| `?phase=preparation` | Affiche l'écran d'attente d'une phase fermée. |

Les paramètres se combinent : `index.html?reinit=1&latence=1500`.

### En local sur le PC

Les modules JavaScript ne fonctionnent pas en ouvrant `index.html` par double-clic (`file://`). Il faut un petit
serveur, par exemple avec Python : `python -m http.server 8000` dans le dossier, puis ouvrir
`http://localhost:8000/`.

### Vérifications à faire (jalon 1)

Sur **téléphone** (Android et iPhone si possible) :

- [ ] Après avoir donné son prénom, l'accueil dit « Bonjour … ! » ; les ronds 🌱 🌿 🌸 sont les badges (les toucher affiche leur signification).
- [ ] « Commencer » ouvre le premier ensemble en mode « Une à une » ; les photos voisines sont visibles de part et d'autre.
- [ ] Glisser à **gauche / droite** fait défiler sans rien valider (ou boutons ‹ ›) : jusqu'à 4 cm (rapide ou lent),
      une seule photo ; au-delà, 2 photos ; plusieurs grands gestes de suite, 5 photos.
- [ ] Glisser vers le **haut** = ❤️ je garde (et sur un ❤️ : ⭐), vers le **bas** = ✖️ je passe (et sur un ⭐ : ❤️) (un tampon apparaît pendant le geste) ;
      la photo reste affichée, sauf si la case « Passer à la photo suivante… » est cochée.
- [ ] Le **pourtour** de la photo prend la couleur du choix (rouge, doré, gris).
- [ ] L'**étoile** dans le coin : grise → dorée (coup de cœur) → grise ; au-delà de 4 dans un ensemble,
      la photo tremble et un message l'explique.
- [ ] La **pastille** de l'autre coin change le choix : · → ❤️ → ⭐ → ✖️ → ·.
- [ ] ⌫ efface le choix de la photo affichée, même ancienne : elle redevient « à trier ».
- [ ] Les compteurs ⭐ x/4, ❤️+⭐, ✖️ et « à trier » suivent les choix.
- [ ] Imagettes : un appui long sélectionne une photo ; ensuite un appui court ajoute ou retire une photo,
      un appui long sélectionne toute la plage depuis la précédente ; la barre en bas applique ❤️ ⭐ ✖️ ou ·
      à toute la sélection (✕ ou Échap pour annuler). Sur PC : Ctrl+clic et Maj+clic.
- [ ] Les modes « Une à une » et « Imagettes » se choisissent à tout moment ; la case « Retenues ❤️ » (aussi dans la
      visionneuse, touche R) ne montre que les photos gardées : une photo passée à ✖️ ou effacée disparaît.
- [ ] Un clic (ou un toucher) sur la photo, ou 🔍 : visionneuse plein écran ; un nouveau clic revient à « Une à une » ;
      zoom à la molette ou en pinçant ; le nombre de photos à trier y est affiché.
- [ ] « C'est la dernière photo » s'affiche au milieu de la photo seulement si l'on tente d'aller plus loin.
- [ ] Dans la visionneuse (sans zoom) : glisser gauche / droite pour défiler, haut pour ❤️, bas pour ✖️ ;
      la barre de boutons ✖️ ‹ ⭐ › ❤️ fait de même ; en haut, le choix et le compteur ⭐ x/4 · ❤️+⭐.
- [ ] Le bouton « 🏠 Accueil » ramène à l'accueil.
- [ ] En fin d'ensemble : un bandeau (résumé, bouton « Suivant ») apparaît puis s'estompe ; on peut continuer à retoucher les choix.
- [ ] La carte des ensembles se colorie (gris → bordure colorée → coche).
- [ ] Le bouton « retour » du téléphone ramène à l'accueil sans quitter l'application.
- [ ] Fermer l'onglet en plein tri puis rouvrir : « Continuer » reprend au bon endroit.
- [ ] En mode avion : on peut continuer à trier ; le pied de page indique « Hors ligne » ; au retour du réseau,
      il repasse à « Tout est enregistré ».
- [ ] Le mode sombre du téléphone est respecté.
- [ ] « Remettre la démo à zéro » (en bas de l'accueil) efface tout et relance la démonstration.

Sur **PC** :

- [ ] ← → pour défiler, ↑ je garde, ↓ je passe, E coup de cœur, Suppr effacer, R retenues, G imagettes, Échap accueil.
- [ ] Clic sur la photo (ou Entrée, ou 🔍) : visionneuse en plein écran ; les touches restent actives ;
      clic pour zoomer (la photo suit la souris), molette pour régler ; Échap pour fermer.

Avec `?latence=1500` : la photo suivante doit tout de même apparaître immédiatement (préchargement).

## Mise en service (fonctionnement simplifié)

Version actuelle, volontairement simple : pas de lien personnel ni d'étiquetage des visages. Chaque testeur
**donne son prénom** en ouvrant l'application ; ses choix sont enregistrés dans **une seule feuille** du Google Sheet.
En redonnant le même prénom (majuscules et espaces en trop ignorés), sur n'importe quel appareil, il retrouve
son avancement.

### Organisation du dossier Google Drive

Tout se trouve dans un même dossier Google Drive (synchronisé sur le PC par Google Drive pour ordinateur) :

```
Photos famille/                       (exemple de nom)
├── Florilège — choix                 le Google Sheet, une seule feuille « Choix »
├── 2001/  2002/  …                   photos originales, un dossier par année (sous-dossiers possibles)
├── 2001-allégé/  2002-allégé/  …     copies réduites, même arborescence (créées par le script ci-dessous)
├── florilege-photos.json             liste des photos (créée par le menu du Google Sheet)
└── rapport_reduction.txt             compte rendu du dernier passage du script de réduction
```

- Un **ensemble** = un dossier d'année (nom commençant par un chiffre) ; ses sous-dossiers sont regroupés.
- La feuille **Choix** contient une ligne par photo et par testeur :
  `Photo | Dossier | Choix | Testeur | Horodatage`. « Photo » est le nom du fichier **original**, « Dossier » son
  chemin relatif (par exemple `2001/Vacances`), « Choix » vaut `cœur`, `étoile`, `x` ou `non classé`.
  Quand un testeur change d'avis, sa ligne est mise à jour (pas de doublon).

> **Mot de passe commun** : à définir dans le Google Sheet par **Florilège → Définir le mot de passe commun…**
> (il est gardé dans les propriétés privées du script, jamais dans le dépôt GitHub, qui est public). Les testeurs le
> saisissent une fois avec leur prénom ; il est ensuite mémorisé sur leur appareil. Majuscules et espaces en trop ne
> comptent pas. Sans mot de passe défini, toute personne qui connaît l'adresse de l'application peut voir les photos.

### 1. Créer les photos allégées

Deux possibilités, au choix (on peut aussi les mélanger : chacune laisse intactes les copies de l'autre) :

- **Directement dans Google Drive (rien à installer)** : dans le Google Sheet, **Florilège → Créer les photos
  allégées**. Pour chaque dossier d'année, le dossier `-allégé` est créé avec la même arborescence ; chaque photo y est
  remplacée par la version réduite (1 080 px) que Google Drive fabrique pour ses aperçus (sans métadonnées, orientation
  corrigée, photos HEIC comprises). Le travail se fait **en tâche de fond**, par tranches de quelques minutes (environ
  une heure pour 3 000 photos) ; on peut fermer le classeur. **Florilège → État de la création des photos allégées**
  indique l'avancement. À la fin, la liste des photos est mise à jour automatiquement. Relance sans risque : seules les
  photos nouvelles ou modifiées sont traitées. Une photo tout juste envoyée dont Google n'a pas encore préparé
  l'aperçu est signalée : relancer un peu plus tard.
- **Sur le PC, avec l'outil ci-dessous** : meilleure qualité, mais il faut Python.

#### Outil PC

Le script [`prep/reduire_photos.py`](prep/reduire_photos.py) crée, à côté de chaque dossier d'année, son jumeau
`-allégé` : même arborescence, photos réduites à 1 080 pixels (JPEG qualité 78), orientation corrigée, **données GPS
et autres métadonnées supprimées**. Les originaux ne sont jamais modifiés.

**Installation (une seule fois)**

1. **Python** : sur [python.org/downloads](https://www.python.org/downloads/), télécharger la dernière version pour
   Windows et l'installer en **cochant « Add python.exe to PATH »** en bas de la première fenêtre.
2. **L'outil** : sur la page GitHub du dépôt, bouton vert **Code → Download ZIP**. Ouvrir le ZIP et copier le dossier
   **`prep`** sur le PC, par exemple dans `Documents\Florilège` (pas dans le dossier Google Drive, inutile de le
   synchroniser). Les deux fichiers utiles sont `reduire_photos.py` et `lancer_reduction.bat`.

**Lancement**

- **Le plus simple** : faire glisser le dossier Google Drive de la sélection (celui qui contient le Google Sheet et
  les dossiers d'année) **sur le fichier `lancer_reduction.bat`**.
- Ou double-cliquer sur `lancer_reduction.bat`, puis coller le chemin du dossier (dans l'Explorateur, cliquer dans la
  barre d'adresse du dossier, copier, puis clic droit dans la fenêtre noire pour coller) et appuyer sur Entrée.

Au premier lancement, l'outil installe Pillow et pillow-heif (connexion Internet nécessaire). Si Windows affiche
« Windows a protégé votre ordinateur », cliquer sur **Informations complémentaires → Exécuter quand même**.
La fenêtre indique l'avancement (environ 10 à 20 minutes pour 3 000 photos la première fois, quelques secondes ensuite)
et se termine par un résumé ; le détail est dans `rapport_reduction.txt`, dans le dossier Google Drive.
Si Google Drive pour ordinateur est en mode « streaming », les originaux sont téléchargés au fur et à mesure : c'est
plus lent mais cela fonctionne.

**Sans Google Drive pour ordinateur** (photos préparées sur le PC puis envoyées par le navigateur) :

1. Sur le PC, un dossier de travail (par exemple `D:\Photos famille`) contenant les dossiers d'année `2001`, `2002`…
2. Faire glisser ce dossier sur `lancer_reduction.bat` : les dossiers `2001-allégé`… sont créés à côté.
3. Dans Chrome, ouvrir le dossier Google Drive du Google Sheet et y **faire glisser les dossiers d'année et les
   dossiers `-allégé`** (le fichier `rapport_reduction.txt` n'est pas utile à Google Drive).
4. Dans le Google Sheet : **Florilège → Mettre à jour la liste des photos**.

Pour **ajouter des photos plus tard**, le plus simple est de ne garder sur le PC que les nouveautés : par exemple
`D:\Photos famille\2001\Noël` ; l'outil crée `2001-allégé\Noël`, qu'il suffit de faire glisser **dans** le dossier
`2001-allégé` déjà présent sur Google Drive (et `Noël` dans `2001`). Si un dossier est renvoyé en entier, Google Drive
crée un second dossier du même nom : ce n'est pas gênant, la mise à jour de la liste réunit les dossiers de même nom
et ignore les photos en double.

**À relancer chaque fois que des photos ou des dossiers sont ajoutés** : seules les photos nouvelles ou modifiées sont
traitées. Les photos HEIC (iPhone) et PNG reçoivent « .jpg » en plus de leur nom (`IMG_1.HEIC.jpg`) ; le nom
d'origine est restitué dans la feuille. Les vidéos et documents sont ignorés (listés dans le rapport), ainsi que les
dossiers `_Originaux_Picasa` et `_Catalogue_Picasa` de picasa-export. Une copie dont l'original a disparu est
signalée ; l'option `--nettoyer` la supprime (`lancer_reduction.bat --nettoyer`).

### 2. Le Google Sheet et son script (une seule fois)

> **Avec le classeur modèle** (quand il est disponible) : la page d'accueil du site, sans lien d'invitation, propose
> « Vous organisez une sélection ? Créer la vôtre » ; le bouton « Copier le modèle Florilège » crée dans votre Google
> Drive un classeur qui contient déjà le script. **Google range cette copie à la racine de « Mon Drive »** : lancer
> ensuite **Florilège → Installer / configurer…** : une fenêtre permet de parcourir « Mon Drive » dossier par dossier
> (les dossiers d'année sont signalés par 📅) ou de coller le lien du dossier des photos
> (exemple : `https://drive.google.com/drive/folders/1AbCdEfGh…`) ; le classeur y est déplacé automatiquement (on peut aussi le déplacer soi-même : clic droit → Organiser → Déplacer). Le même menu demande le mot
> de passe et guide pour la publication. Les étapes ci-dessous sont celles de
> l'installation manuelle.

1. Dans le dossier Google Drive : **Nouveau → Google Sheets**, par exemple `Florilège — choix`.
2. **Extensions → Apps Script**. (Facultatif : renommer « Projet sans titre » en « Florilège ».)
3. Dans `Code.gs`, tout effacer et coller [`apps-script/Code.gs`](apps-script/Code.gs).
4. Roue dentée **Paramètres du projet** → cocher **« Afficher le fichier manifeste "appsscript.json" »** ; ouvrir
   `appsscript.json` et le remplacer par [`apps-script/appsscript.json`](apps-script/appsscript.json) (il active le
   service avancé « Drive », qui accélère le recensement des photos et donne leurs dimensions). Enregistrer.
5. **Déployer → Nouveau déploiement → Application Web** ; **Exécuter en tant que : Moi** ; **Qui a accès : Tout le
   monde** → **Déployer**. Lors de l'autorisation : **Paramètres avancés → Accéder à … (non sécurisé)**, puis cocher
   **« Tout sélectionner »** et **Continuer**.
6. Rien à modifier dans GitHub : l'adresse du serveur est transmise par le **lien d'invitation** (étape 4).

> **Plus tard, quand une nouvelle version de `Code.gs` sera livrée** : coller le nouveau code, enregistrer, puis
> **Déployer → Gérer les déploiements → crayon (Modifier) → Version : Nouvelle version → Déployer**. L'URL ne change
> pas (ne pas faire « Nouveau déploiement »).

### 3. Mettre à jour la liste des photos

Après chaque passage du script de réduction, **une fois la synchronisation de Google Drive terminée** : dans le
Google Sheet, recharger la page puis **Florilège → Mettre à jour la liste des photos**. Le script recense les dossiers
`-allégé` et affiche le nombre de photos par année. Pour un très grand nombre de photos, si Google interrompt le
recensement (limite de 6 minutes), relancer : il reprend là où il s'était arrêté.

La feuille **Choix** est créée automatiquement. Les réglages (titre, nombre de coups de cœur par année) sont en tête
de `Code.gs` (`REGLAGES`).

### 4. Inviter les testeurs

1. **Florilège → Définir le mot de passe commun…** (recommandé).
2. **Florilège → Lien d'invitation pour les testeurs** : la fenêtre donne le lien (de la forme
   `https://cyrille31.github.io/florilege/?s=AKfycb…`) et un message prêt à envoyer, mot de passe compris.
3. Chacun ouvre le lien, donne son prénom (et le mot de passe la première fois) et commence ; le lien est mémorisé
   sur l'appareil, les visites suivantes peuvent se faire depuis l'adresse simple ; « Ce n'est pas moi », à côté du « Bonjour … ! », permet de changer de nom sur un appareil partagé.

### Utiliser Florilège pour une autre sélection, ou sur un autre compte Google

Le site (GitHub Pages) est commun à tous : **chaque organisateur a seulement besoin de son propre Google Sheet et de
son script**, dans son propre Google Drive. Il refait les étapes 1 à 4 ci-dessus dans un nouveau dossier (photos
d'année + Google Sheet + `Code.gs` et `appsscript.json` collés + déploiement) et envoie **son** lien d'invitation,
qui contient l'identifiant de **son** serveur. Rien n'est à modifier dans GitHub, et l'adresse du serveur de chacun
n'y figure pas. Sur un même appareil, les données de deux sélections restent séparées.

Pour une installation entièrement indépendante (son propre site), il suffit de copier le dépôt (« Fork » sur GitHub),
d'activer GitHub Pages et de changer `application` dans les `REGLAGES` de `Code.gs`.

### Préparer le classeur modèle (pour Cyrille, une fois)

1. Dans votre Google Drive (ou celui d'un compte dédié), créer un Google Sheet nommé « Florilège — modèle ».
2. Y coller `Code.gs` et `appsscript.json` comme à l'étape 2 (inutile de le déployer ou de définir un mot de passe :
   le modèle ne contient aucune donnée).
3. **Partager → Accès général : « Tous les utilisateurs disposant du lien » – Lecteur**.
4. Copier l'identifiant du classeur (la partie entre `/d/` et `/edit` de son adresse) dans `modele` de
   [`js/config.js`](js/config.js), ou me le transmettre.
5. À chaque nouvelle version de `Code.gs`, la recoller aussi dans le modèle (sinon les copies auront l'ancien menu :
   vérifier que le menu Florilège du modèle commence bien par « Installer / configurer… »).

### Onglets et dossiers inutiles

Seule la feuille **Choix** sert. Les onglets d'une ancienne installation (Config, Selectionneurs, Personnes,
Ensembles, Photos, VisagesPicasa, Attributions, Votes, Etiquettes, ShortList, EtiquettesFinales, Resultat, Journal)
et les dossiers `images`, `prep`, `exports`, `config`, `secret` qu'elle avait créés peuvent être supprimés.

### Essais à faire

- [ ] Lancer `lancer_reduction.bat` sur le dossier Google Drive ; vérifier les dossiers `-allégé` et le rapport ;
      le relancer : « déjà à jour » pour toutes les photos.
- [ ] Ajouter une photo et un sous-dossier dans une année, relancer : seules les nouvelles photos sont traitées.
- [ ] Florilège → Mettre à jour la liste des photos : le nombre de photos par année est juste ; les fichiers non
      reconnus comme images sont listés dans le message.
- [ ] En mode photo : le compteur 📷 n/N et l'ascenseur horizontal indiquent la position ; un seul toucher ou clic
      sur la photo l'affiche en grand (ascenseur et compteurs aussi en plein écran) ; « Chargement… » s'affiche
      tant que la photo n'est pas arrivée.
- [ ] Ouvrir le lien d'invitation sur le PC, donner son prénom, trier quelques photos : les lignes apparaissent dans la
      feuille Choix (envoi toutes les 10 actions, toutes les 15 secondes, ou en quittant la page).
- [ ] Ouvrir l'application sur le téléphone avec le même prénom : on retrouve ses choix.
- [ ] Après avoir défini le mot de passe : un mauvais mot de passe est refusé, le bon est mémorisé sur l'appareil.
- [ ] Changer d'avis sur une photo : sa ligne est mise à jour, pas dupliquée ; ⌫ la passe à « non classé ».
- [ ] **Fluidité en 4G** : ajouter `?diag=1` à l'adresse, trier une vingtaine de photos et me transmettre les chiffres
      du panneau vert (moyenne, médiane, maximum pour `etat`, `miniatures`, `image`).

### Quotas d'Apps Script (compte Google gratuit)

Voir la page officielle [Quotas des services Google](https://developers.google.com/apps-script/guides/services/quotas).
Chaque requête dure de l'ordre d'une seconde (limite : 6 minutes) ; chaque appareil limite à 3 ses requêtes
simultanées (limite du script : une trentaine) ; les miniatures sont gardées 6 heures dans le cache. Pour une
dizaine de testeurs et quelques milliers de photos, on reste très en deçà des limites.

## Versions

Le numéro de version est affiché en bas de l'accueil (par exemple « v0.5.0 ») et dans « À propos ».
Pour en changer : `python outils/version.py 0.6.0`. Le script met à jour le numéro affiché et ajoute
`?v=0.6.0` aux chemins des fichiers JavaScript et CSS, ce qui force les navigateurs à recharger les fichiers.

Après un dépôt sur GitHub, la mise en ligne prend une à deux minutes. GitHub Pages autorise ensuite les navigateurs
à garder l'ancienne page jusqu'à 10 minutes : si le numéro affiché n'a pas changé, recharger la page un peu plus tard.

| Version | Contenu |
|---|---|
| 0.13.0 | Interface : photos plus grandes sur PC ; un clic dans la visionneuse revient à « Une à une » (zoom à la molette ou aux doigts) ; « Retenues » devient une case à cocher valable dans tous les modes, visionneuse comprise ; cases « Retenues » et « Suivante après choix » sur la ligne des modes ; nombre de photos à trier dans la visionneuse ; bandeau de fin d'ensemble visible aussi en grand ; bouton « effacer le choix » ⊙ ; « C'est la dernière photo » au milieu de la photo ; ligne d'aide clavier et compteur en double supprimés. |
| 0.12.6 | Copie du modèle : l'installation et l'invitation indiquent clairement que le script de la copie doit être publié (Nouveau déploiement) puis son URL collée une fois. |
| 0.12.5 | « Lien d'invitation » : un lien qui ne fonctionne pas n'est plus affiché ; explication sur l'adresse de test renvoyée par Google. |
| 0.12.4 | Bouton « Oublier ce serveur » (et adresse `?s=oublier`) pour sortir d'un lien d'invitation périmé mémorisé sur l'appareil. |
| 0.12.3 | Bouton « Tester le serveur » correctement centré. |
| 0.12.2 | « Lien d'invitation » : le script vérifie que son adresse répond vraiment (déploiement actif, accès à tous) et permet de coller l'URL exacte de l'application Web si l'adresse détectée est mauvaise. |
| 0.12.1 | Écran « Le serveur ne répond pas » : bouton « Tester le serveur » et causes habituelles (déploiement, accès, autorisation) au lieu de « Connexion impossible ». |
| 0.12.0 | Installation : explorateur de dossiers Google Drive (fil d'Ariane, dossiers d'année repérés, bilan) ou lien collé avec exemple, puis mot de passe, le tout dans une seule fenêtre. |
| 0.11.2 | Page « Organiser une sélection » : la copie du modèle arrive à la racine du Drive, le menu Installer la range dans le dossier des photos. |
| 0.11.1 | Classeur modèle configuré : la page « Organiser une sélection » propose « Copier le modèle Florilège ». |
| 0.11.0 | Création des photos allégées directement dans Google Drive (en tâche de fond, relançable, liste mise à jour à la fin) ; menu « Installer / configurer… » (dossier des photos, mot de passe, publication guidée) ; page « Organiser une sélection » sur le site, prête pour le classeur modèle. |
| 0.10.0 | Lien d'invitation (l'adresse du serveur n'est plus dans GitHub ; le même site sert à plusieurs sélections et comptes Google) ; ascenseur horizontal et compteur 📷 n/N, aussi en plein écran ; un seul toucher pour agrandir ; « Chargement… » / « Image indisponible » ; images reconnues aussi d'après leur extension ; fichiers ignorés signalés par la mise à jour de la liste. |
| 0.9.3 | Message explicite si le script Apps Script publié est une ancienne version (redéploiement oublié). |
| 0.9.2 | Mise à jour de la liste : les dossiers envoyés deux fois dans Google Drive sont réunis et les photos en double ignorées ; README : préparation des photos sur le PC puis envoi par le navigateur. |
| 0.9.1 | Mot de passe commun, défini depuis le menu du Google Sheet et demandé une fois aux testeurs. |
| 0.9.0 | Fonctionnement simplifié : identification par le prénom, une seule feuille « Choix » (une ligne par photo et par testeur), ensembles = dossiers d'année, liste des photos tirée des dossiers `-allégé` ; script `prep/reduire_photos.py` de création des photos allégées, relançable. |
| 0.8.1 | Création des photos de test relançable (les images déjà créées sont réutilisées) ; rappel d'ouvrir la manche 1. |
| 0.8.0 | Jalon 2 : script Apps Script (API, images servies depuis Drive, menu Florilège), connexion de l'application au serveur, reprise multi-appareils, journal des erreurs, diagnostic `?diag=1`, nouvel essai automatique en cas d'échec réseau. |
| 0.7.0 | Imagettes : sélection multiple (appui long pour commencer, appui court pour ajouter ou retirer, appui long pour toute une plage ; Ctrl+clic et Maj+clic sur PC), puis ❤️ ⭐ ✖️ ou · pour toute la sélection. |
| 0.6.3 | Fin d'ensemble : un bandeau apparaît puis s'estompe, sans empêcher de continuer à retoucher les choix ; correction d'un « null » affiché dans les compteurs. |
| 0.6.2 | Flèches et gestes haut / bas : échelle ✖️ ↔ ❤️ ↔ ⭐ (haut sur ❤️ donne ⭐, bas sur ⭐ redonne ❤️) ; photo écartée grisée, aussi en plein écran. |
| 0.6.1 | Les flèches du clavier marchent de nouveau après avoir coché « Passer à la photo suivante » ; pourtour de couleur aussi dans la visionneuse plein écran. |
| 0.6.0 | Visionneuse plein écran : gestes, flèches, barre de boutons et compteur ⭐ / ❤️+⭐ ; défilement selon la longueur du geste (≤ 4 cm : 1 photo, plus : 2, plusieurs grands gestes de suite : 5). |
| 0.5.0 | Numéro de version affiché ; rechargement forcé des fichiers à chaque version. |
| 0.4.0 | Défilement : un geste court (1 à 2 cm) ne passe qu'une photo ; inertie plus douce. |
| 0.3.0 | Mode « Retenues », défilement avec inertie, pourtours colorés, pastille de choix sur la photo, bouton « 🏠 Accueil », plus d'avance automatique après un choix (option). |
| 0.2.0 | Défilement libre avec photos voisines, haut / bas pour garder / passer, étoile du coup de cœur, effacement d'un choix, visionneuse plein écran, remise à zéro de la démo. |
| 0.1.0 | Premier prototype de la manche 1 (photos factices, back-end simulé). |

## Structure du dépôt

```
index.html            interface des sélectionneurs
tests.html            tests des modules (dans le navigateur)
manifest.json         ajout à l'écran d'accueil du téléphone
css/style.css
img/                  icône (SVG et PNG)
js/
  config.js           URL de l'Apps Script et réglages
  app.js              démarrage, accueil, navigation
  api.js              échanges avec le serveur, file d'événements (hors-ligne, envois groupés)
  simulation.js       back-end simulé et photos factices (mode démonstration)
  images.js           miniatures par lots, préchargement, cache de l'appareil
  etat.js             calculs sur l'état du sélectionneur (fonctions pures, testées)
  tri.js              manche 1 : examen d'un ensemble (une à une, retenues, imagettes)
  zoom.js             visionneuse plein écran
  ludique.js          carte des ensembles, jauge, badges, confettis
  stockage.js         accès protégé à localStorage
  tests/              tests (navigateur et Node)
apps-script/
  Code.gs             script du Google Sheet : API web, images, menu Florilège
  appsscript.json     manifeste du script (active le service avancé Drive)
prep/
  reduire_photos.py   crée les dossiers de photos allégées (2001-allégé…)
  lancer_reduction.bat  lanceur Windows
  requirements.txt
  tests/              tests pytest
outils/version.py     change le numéro de version
```

## Tests

- Dans le navigateur : ouvrir `tests.html`.
- Avec Node (version 22 ou plus) : `node js/tests/lancer.js`.
- Script de réduction : `python -m pytest prep/tests`.

## Confidentialité

Le dépôt GitHub ne contient que le logiciel : aucune photo, aucune donnée de sélection. Pas de mesure d'audience,
pas de traceur, pas de police chargée depuis un service tiers. Les pages demandent aux moteurs de recherche de ne
pas les indexer (`robots.txt` et balise `noindex`).
