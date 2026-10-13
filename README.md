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
| 1 | Prototype de la manche 1 (photos factices, back-end simulé) | **livré, à tester** |
| 2 | Apps Script, Google Sheet, images sur Drive | à venir |
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
- [ ] Glisser à **gauche / droite** fait défiler sans rien valider (ou boutons ‹ ›) ; un geste court (1 à 2 cm) passe une seule photo ; un geste **long et vif** fait
      défiler plusieurs photos avec un ralentissement, d'autant plus loin que le geste est vif.
- [ ] Glisser vers le **haut** = ❤️ je garde, vers le **bas** = ✖️ je passe (un tampon apparaît pendant le geste) ;
      la photo reste affichée, sauf si la case « Passer à la photo suivante… » est cochée.
- [ ] Le **pourtour** de la photo prend la couleur du choix (rouge, doré, gris).
- [ ] L'**étoile** dans le coin : grise → dorée (coup de cœur) → grise ; au-delà de 4 dans un ensemble,
      la photo tremble et un message l'explique.
- [ ] La **pastille** de l'autre coin change le choix : · → ❤️ → ⭐ → ✖️ → ·.
- [ ] ⌫ efface le choix de la photo affichée, même ancienne : elle redevient « à trier ».
- [ ] Les compteurs ⭐ x/4, ❤️+⭐, ✖️ et « à trier » suivent les choix.
- [ ] Les trois modes « Une à une », « Retenues », « Imagettes » se choisissent à tout moment ; en « Retenues »,
      une photo passée à ✖️ ou effacée disparaît.
- [ ] Toucher deux fois la photo, pincer ou 🔍 : visionneuse ; on peut pincer et se déplacer ; ✕ pour fermer.
- [ ] Le bouton « 🏠 Accueil » ramène à l'accueil.
- [ ] En fin d'ensemble : animation, résumé, « Ensemble suivant » / « Pause ».
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

## Versions

Le numéro de version est affiché en bas de l'accueil (par exemple « v0.5.0 ») et dans « À propos ».
Pour en changer : `python outils/version.py 0.6.0`. Le script met à jour le numéro affiché et ajoute
`?v=0.6.0` aux chemins des fichiers JavaScript et CSS, ce qui force les navigateurs à recharger les fichiers.

Après un dépôt sur GitHub, la mise en ligne prend une à deux minutes. GitHub Pages autorise ensuite les navigateurs
à garder l'ancienne page jusqu'à 10 minutes : si le numéro affiché n'a pas changé, recharger la page un peu plus tard.

| Version | Contenu |
|---|---|
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
outils/version.py     change le numéro de version
```

## Tests

- Dans le navigateur : ouvrir `tests.html`.
- Avec Node (version 22 ou plus) : `node js/tests/lancer.js`.

## Confidentialité

Le dépôt GitHub ne contient que le logiciel : aucune photo, aucune donnée de sélection. Pas de mesure d'audience,
pas de traceur, pas de police chargée depuis un service tiers. Les pages demandent aux moteurs de recherche de ne
pas les indexer (`robots.txt` et balise `noindex`).
