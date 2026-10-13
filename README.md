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
| 2 | Apps Script, Google Sheet, images sur Drive | **livré, à tester** |
| 3 | Script de préparation des photos | à venir |
| 4 | Administration, partie 1 | à venir |
| 5 | Manche 2 (duels) | à venir |
| 6 | Étiquetage des personnes | à venir |
| 7 | Optimisation finale | à venir |
| 8 | Révélation, badges, finitions | à venir |

## Essayer le prototype (jalon 1)

Tant que `js/config.js` ne contient pas d'URL d'Apps Script, l'application fonctionne en **mode démonstration** :
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
| `?nom=Paul` | Change le prénom affiché. |
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

- [ ] L'accueil dit « Bonjour Marie ! » ; les ronds 🌱 🌿 🌸 sont les badges (les toucher affiche leur signification).
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
- [ ] Les trois modes « Une à une », « Retenues », « Imagettes » se choisissent à tout moment ; en « Retenues »,
      une photo passée à ✖️ ou effacée disparaît.
- [ ] Toucher deux fois la photo, pincer ou 🔍 : visionneuse plein écran ; on peut pincer et se déplacer ; ✕ pour fermer.
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

## Mise en service avec Google (jalon 2)

Tout se passe dans **un seul dossier Google Drive privé** par sélection, qui contient le Google Sheet, son script et
les images. Rien n'est partagé : le script, qui s'exécute avec votre compte, sert les images uniquement aux personnes
qui ont un lien personnel valide.

### 1. Créer le classeur et coller le script

1. Sur [drive.google.com](https://drive.google.com), créer un dossier, par exemple `Florilège/Essai`.
2. Dans ce dossier : **Nouveau → Google Sheets**. Le nommer, par exemple `Florilège — Essai`.
3. Dans le classeur : menu **Extensions → Apps Script**. Un éditeur s'ouvre dans un nouvel onglet.
4. Dans le fichier `Code.gs` de l'éditeur, tout effacer puis coller le contenu de
   [`apps-script/Code.gs`](apps-script/Code.gs) (sur GitHub, bouton « Copy raw file »).
5. Toujours dans l'éditeur : roue dentée **Paramètres du projet** (à gauche) → cocher **« Afficher le fichier manifeste
   "appsscript.json" dans l'éditeur »**. Revenir à l'éditeur (icône `< >`), ouvrir `appsscript.json`, tout remplacer
   par le contenu de [`apps-script/appsscript.json`](apps-script/appsscript.json).
6. Enregistrer (icône disquette ou Ctrl+S).

### 2. Installer le classeur

1. Revenir à l'onglet du classeur et **recharger la page** : un menu **Florilège** apparaît (après quelques secondes).
2. **Florilège → 1. Installer / vérifier le classeur**.
3. Google demande une autorisation : choisir votre compte, puis **Paramètres avancés → Accéder à … (non sécurisé)**
   → **Autoriser**. (L'avertissement apparaît parce que le script est le vôtre et n'a pas été « vérifié » par Google ;
   il n'accède qu'à ce classeur et à votre Drive, sous votre contrôle.) Si l'installation s'est arrêtée pendant
   l'autorisation, la relancer.
4. Le message final affiche un **jeton administrateur** : le noter (il servira à l'interface d'administration, jalon 4).
   Les onglets sont créés, ainsi que les dossiers `images`, `prep`, `exports`, `config`, `secret` à côté du classeur.

### 3. Publier l'application web

1. Dans l'éditeur Apps Script : **Déployer → Nouveau déploiement**.
2. Roue dentée « Sélectionner le type » → **Application Web**.
3. **Exécuter en tant que : Moi** ; **Qui a accès : Tout le monde**. → **Déployer** (autoriser si demandé).
4. Copier l'**URL de l'application Web** (elle se termine par `/exec`).
5. Sur GitHub, ouvrir [`js/config.js`](js/config.js), cliquer sur le crayon (modifier) et coller l'URL :
   `urlApi: 'https://script.google.com/macros/s/…/exec',` puis **Commit changes**.
   Tant que `urlApi` est vide, l'application reste en mode démonstration.

> Après une modification de `Code.gs` : **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version →
> Déployer**. L'URL ne change pas.

### 4. Des photos pour essayer

Au choix, depuis le menu **Florilège** :

- **Créer des photos de test** : 72 dessins (3 ensembles) dans `images/_test`, pour vérifier que tout fonctionne ;
- **Utiliser mes photos (sous-dossiers de images/)** : créer dans le dossier `images` un sous-dossier par ensemble et
  y déposer quelques photos (de préférence pas trop lourdes : le script de préparation du jalon 3 produira des images
  allégées ; ici, les photos sont servies telles quelles).

### 5. Sélectionneurs, liens et ouverture

1. **Florilège → Ajouter des sélectionneurs…** : saisir des prénoms séparés par des virgules. Une fenêtre affiche
   pour chacun un message prêt à copier (mail, WhatsApp) avec son lien personnel. **Afficher les liens personnels**
   la rouvre à tout moment.
2. **Florilège → Ouvrir la manche 1**.
3. L'onglet **Config** permet d'ajuster les paramètres (titre de la sélection, nombre de coups de cœur…) ; les
   changements sont pris en compte en une minute environ.

Pour désactiver un lien : mettre `non` dans la colonne `actif` de l'onglet `Selectionneurs` (effet sous 10 minutes).

### 6. Essais à faire (jalon 2)

- [ ] Ouvrir son lien sur le PC, trier quelques photos ; vérifier que des lignes apparaissent dans l'onglet `Votes`
      (l'envoi se fait toutes les 10 actions, toutes les 15 secondes, ou en quittant la page).
- [ ] Ouvrir **le même lien sur le téléphone** : « Continuer » reprend au même endroit, avec les mêmes choix.
- [ ] Mode avion sur le téléphone, trier, revenir au réseau : le pied de page de l'accueil repasse à
      « Tout est enregistré » et les choix arrivent dans `Votes`.
- [ ] Un lien modifié (une lettre changée) affiche « Lien non reconnu ».
- [ ] **Mesurer la fluidité en 4G** : ouvrir son lien en ajoutant `&diag=1` à la fin, trier une vingtaine de photos,
      puis me communiquer les chiffres du panneau vert (moyenne, médiane, maximum pour `etat`, `miniatures`, `image`).
      Si le passage d'une photo à l'autre n'est pas fluide, je proposerai une solution de repli (section 3.3 des
      spécifications), sans la mettre en œuvre sans votre accord.
- [ ] Les erreurs éventuelles de l'application apparaissent dans l'onglet `Journal`, avec les connexions.

### Quotas d'Apps Script (compte Google gratuit)

Les limites officielles sont sur la page
[Quotas des services Google](https://developers.google.com/apps-script/guides/services/quotas) ; celles qui
concernent Florilège :

- **Durée d'une exécution : 6 minutes** au plus. Chaque requête de Florilège dure de l'ordre d'une seconde.
- **Exécutions simultanées : environ 30** pour un même script. Chaque appareil limite à 3 ses requêtes parallèles
  et refait une fois une requête échouée ; même avec une dizaine de personnes triant au même instant, on reste en deçà.
- **Cache (CacheService) : 100 Ko par valeur** ; les miniatures (≈ 15 à 25 Ko) y sont gardées 6 heures.
- **Estimation** : un sélectionneur qui examine environ 900 photos (3 000 photos vues chacune par 3 personnes sur 10)
  déclenche à peu près 900 requêtes d'images, 60 de miniatures et une centaine d'envois de choix, soit environ
  1 100 requêtes ; pour 10 sélectionneurs, environ 11 000 requêtes réparties sur plusieurs jours, ce qui reste modeste.

## Versions

Le numéro de version est affiché en bas de l'accueil (par exemple « v0.5.0 ») et dans « À propos ».
Pour en changer : `python outils/version.py 0.6.0`. Le script met à jour le numéro affiché et ajoute
`?v=0.6.0` aux chemins des fichiers JavaScript et CSS, ce qui force les navigateurs à recharger les fichiers.

Après un dépôt sur GitHub, la mise en ligne prend une à deux minutes. GitHub Pages autorise ensuite les navigateurs
à garder l'ancienne page jusqu'à 10 minutes : si le numéro affiché n'a pas changé, recharger la page un peu plus tard.

| Version | Contenu |
|---|---|
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
  appsscript.json     manifeste du script
outils/version.py     change le numéro de version
```

## Tests

- Dans le navigateur : ouvrir `tests.html`.
- Avec Node (version 22 ou plus) : `node js/tests/lancer.js`.

## Confidentialité

Le dépôt GitHub ne contient que le logiciel : aucune photo, aucune donnée de sélection. Pas de mesure d'audience,
pas de traceur, pas de police chargée depuis un service tiers. Les pages demandent aux moteurs de recherche de ne
pas les indexer (`robots.txt` et balise `noindex`).
