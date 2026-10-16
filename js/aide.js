// Florilège — menu « ? » : mode d'emploi, tutoriel animé, à propos (licence BAL, CGExcel).
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { CONFIG, modeDemo } from './config.js?v=0.15.2';
import { el } from './ludique.js?v=0.15.2';

const PHRASE_BAL = 'En échange de l\'usage libre et gratuit de ce logiciel, une seule chose vous est demandée, sur l\'honneur : '
  + 'faire une bonne action chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c\'est vous qui voyez.';

// Bouton « ? », en haut à droite de chaque écran.
export function boutonAide() {
  return el('button', { class: 'btn-aide', 'aria-label': 'Aide et informations', title: 'Aide : mode d\'emploi, tutoriel, à propos',
    onclick: () => ouvrirAide() }, '?');
}

// ---------------------------------------------------------------- mode d'emploi

function modeEmploi() {
  const rubrique = (titre, ...lignes) => el('section', { class: 'aide-rubrique' }, el('h3', {}, titre), el('ul', {}, lignes.map(l => el('li', {}, l))));
  return el('div', { class: 'aide-texte' },
    el('p', {}, 'Florilège sert à choisir, à plusieurs, les plus belles photos de chaque année. Chacun trie de son côté ; '
      + 'les choix de tous sont ensuite réunis.'),
    rubrique('Les choix possibles',
      '⊙ à trier : pas encore de choix.',
      '✖️ je passe : la photo n\'est pas retenue.',
      '❤️ je garde : la photo mérite d\'être retenue.',
      '⭐ coup de cœur : vos préférées, 4 au plus par année.'),
    rubrique('Trier une à une',
      'Glisser la photo vers le haut (ou flèche ↑) : ❤️ ; encore vers le haut sur un ❤️ : ⭐.',
      'Glisser vers le bas (ou flèche ↓) : ✖️.',
      'Glisser à gauche ou à droite (ou flèches ← →, boutons ‹ ›, réglette) : photo suivante ou précédente, sans rien choisir. '
        + 'Un geste fait passer une seule photo ; pour aller plus vite, faites glisser la réglette.',
      'Boutons du bas, toujours dans le même ordre : ⊙ effacer, ✖️, ❤️, ⭐.',
      'La pastille en haut à gauche de la photo montre le choix ; la toucher fait passer au choix suivant.',
      'Case « Suivante après choix » : la photo suivante s\'affiche dès qu\'on a choisi.'),
    rubrique('Voir en grand',
      'Toucher ou cliquer sur la photo : elle s\'affiche en plein écran ; toucher à nouveau pour revenir.',
      'Zoomer : pincer avec deux doigts, ou molette de la souris.',
      'En plein écran, mêmes gestes et mêmes boutons ; le nombre de photos restant à trier est affiché en haut.'),
    rubrique('Imagettes',
      'Toutes les photos de l\'année en miniatures.',
      'Un toucher ou un clic sélectionne une photo (ou la désélectionne) ; on peut en sélectionner plusieurs.',
      'Appui long (ou Maj+clic) : sélectionne toute la plage depuis la photo précédente.',
      'Boutons du bas : appliquer ⊙ ✖️ ❤️ ⭐ à toute la sélection.',
      'Double toucher ou double clic : ouvrir la photo en mode « une à une ».'),
    rubrique('Retenues',
      'Cochez « Retenues ❤️ » pour ne voir que les photos gardées (❤️ et ⭐), dans tous les modes, plein écran compris.'),
    rubrique('Reprendre plus tard',
      'Chaque choix est enregistré aussitôt. Sans connexion, il est gardé sur l\'appareil et envoyé plus tard.',
      'Pour continuer sur un autre appareil, ouvrez le même lien et donnez le même prénom.'),
    rubrique('Clavier (ordinateur)',
      '← → défiler · ↑ je garde · ↓ je passe · E coup de cœur · Suppr effacer · Entrée voir en grand · G imagettes · R retenues · Échap accueil.'));
}

// ---------------------------------------------------------------- tutoriel animé

// Chaque étape : un petit dessin animé (photo factice, doigt, symbole) et une explication.
const ETAPES = [
  { anim: 'gauche', titre: 'Défiler', texte: 'Glissez la photo vers la gauche pour voir la suivante (vers la droite pour la précédente). Rien n\'est choisi.' },
  { anim: 'haut', titre: 'Je garde ❤️', texte: 'Glissez la photo vers le haut, ou touchez ❤️, ou flèche ↑.', symbole: '❤️' },
  { anim: 'bas', titre: 'Je passe ✖️', texte: 'Glissez la photo vers le bas, ou touchez ✖️, ou flèche ↓.', symbole: '✖️' },
  { anim: 'etoile', titre: 'Coup de cœur ⭐', texte: 'Touchez ⭐ (ou glissez encore vers le haut une photo déjà ❤️). Quatre au plus par année.', symbole: '⭐' },
  { anim: 'pastille', titre: 'Changer d\'avis', texte: 'Touchez la pastille en haut à gauche : ⊙ → ❤️ → ⭐ → ✖️. Le bouton ⊙ efface le choix.', symbole: '⊙' },
  { anim: 'grand', titre: 'Voir en grand', texte: 'Touchez la photo : plein écran. Pincez ou utilisez la molette pour zoomer. Touchez à nouveau pour revenir.' },
  { anim: 'imagettes', titre: 'Imagettes', texte: 'Touchez des miniatures pour les sélectionner, puis un bouton du bas pour toutes. Double toucher : ouvrir la photo.' },
  { anim: 'retenues', titre: 'Retenues', texte: 'Cochez « Retenues ❤️ » pour ne revoir que les photos gardées, et affiner vos coups de cœur.' },
  { anim: 'fin', titre: 'Et voilà !', texte: 'Tout est enregistré au fil de l\'eau. Vous pouvez vous arrêter et reprendre quand vous voulez.' },
];

function dessinEtape(etape) {
  const photo = n => el('span', { class: `tuto-photo p${n}` });
  let contenu;
  if (etape.anim === 'imagettes') {
    contenu = el('span', { class: 'tuto-grille' }, [1, 2, 3, 4, 5, 6].map(n => el('span', { class: `tuto-mini p${n}` })),
      el('span', { class: 'tuto-doigt' }, '👆'));
  } else if (etape.anim === 'retenues') {
    contenu = el('span', { class: 'tuto-retenues' }, el('span', { class: 'tuto-case' }, '✓'), ' Retenues ❤️',
      el('span', { class: 'tuto-rangee' }, photo(1), photo(2), photo(3)));
  } else if (etape.anim === 'fin') {
    contenu = el('span', { class: 'tuto-fin' }, '🌸');
  } else {
    contenu = el('span', { class: 'tuto-scene' },
      etape.anim === 'gauche' ? photo(2) : null,
      el('span', { class: 'tuto-carte' }, photo(1), el('span', { class: 'tuto-pastille' }, etape.symbole || '·')),
      el('span', { class: 'tuto-doigt' }, '👆'),
      etape.symbole && etape.anim !== 'pastille' ? el('span', { class: 'tuto-symbole' }, etape.symbole) : null);
  }
  return el('div', { class: `tuto-dessin anim-${etape.anim}`, 'aria-hidden': 'true' }, contenu);
}

function tutoriel() {
  let n = 0;
  const zone = el('div', { class: 'tuto-zone' });
  const points = el('div', { class: 'tuto-points' });
  const precedent = el('button', { class: 'btn-secondaire tuto-btn', onclick: () => aller(n - 1) }, '‹ Précédent');
  const suivant = el('button', { class: 'btn-principal tuto-btn', onclick: () => aller(n + 1) }, 'Suivant ›');
  function aller(k) {
    n = Math.max(0, Math.min(ETAPES.length - 1, k));
    const e = ETAPES[n];
    zone.replaceChildren(dessinEtape(e), el('h3', {}, `${n + 1}. ${e.titre}`), el('p', {}, e.texte));
    points.replaceChildren(...ETAPES.map((x, i) => el('button', {
      class: `tuto-point${i === n ? ' actif' : ''}`, 'aria-label': `Étape ${i + 1} : ${x.titre}`, onclick: () => aller(i),
    })));
    precedent.disabled = n === 0;
    suivant.disabled = n === ETAPES.length - 1;
  }
  aller(0);
  return el('div', { class: 'tuto' }, zone, points, el('div', { class: 'tuto-nav' }, precedent, suivant));
}

// ---------------------------------------------------------------- à propos

function aPropos() {
  return el('div', { class: 'aide-apropos' },
    el('img', { src: 'img/florilege-icone.svg', alt: '', width: 88, height: 88 }),
    el('h3', {}, 'Florilège'),
    el('p', {}, `Sélection collective de photos — version ${CONFIG.version}`),
    el('p', {}, 'Un logiciel ', el('a', { href: 'https://cgexcel.wordpress.com', target: '_blank', rel: 'noopener' }, 'CGExcel'),
      ' — © 2026 Cyrille Gindre.'),
    el('p', {}, el('strong', {}, 'Licence : MIT + BAL 1.0 (Bonne Action License).')),
    el('p', { class: 'licence' }, 'La licence MIT permet d\'utiliser, copier, modifier et partager librement ce logiciel. ', PHRASE_BAL,
      ' Ce vœu n\'ajoute aucune condition juridique à la licence MIT.'),
    el('p', {}, el('a', { href: 'https://github.com/cyrille31/florilege', target: '_blank', rel: 'noopener' }, 'Code source et licence complète')),
    modeDemo() ? el('p', { class: 'demo' }, 'Mode démonstration : photos factices, rien n\'est envoyé sur Internet.') : null);
}

// ---------------------------------------------------------------- fenêtre

const ONGLETS = [
  { id: 'emploi', libelle: 'Mode d\'emploi', contenu: modeEmploi },
  { id: 'tuto', libelle: 'Tutoriel', contenu: tutoriel },
  { id: 'apropos', libelle: 'À propos', contenu: aPropos },
];

export function ouvrirAide(onglet = 'emploi') {
  const corps = el('div', { class: 'aide-corps' });
  const barre = el('div', { class: 'aide-onglets', role: 'tablist' });
  function choisir(id) {
    for (const b of barre.children) b.setAttribute('aria-selected', b.dataset.id === id ? 'true' : 'false');
    corps.replaceChildren(ONGLETS.find(o => o.id === id).contenu());
    corps.scrollTop = 0;
  }
  barre.append(...ONGLETS.map(o => el('button', { role: 'tab', 'data-id': o.id, onclick: () => choisir(o.id) }, o.libelle)));
  const fenetre = el('dialog', { class: 'aide' },
    el('div', { class: 'aide-haut' }, barre,
      el('form', { method: 'dialog' }, el('button', { class: 'btn-aide-fermer', 'aria-label': 'Fermer', title: 'Fermer (Échap)' }, '✕'))),
    corps);
  // Échap ferme la fenêtre sans déclencher les raccourcis de l'écran en dessous.
  fenetre.addEventListener('keydown', e => e.stopPropagation());
  fenetre.addEventListener('close', () => fenetre.remove());
  fenetre.addEventListener('click', e => { if (e.target === fenetre) fenetre.close(); });
  document.body.append(fenetre);
  choisir(onglet);
  fenetre.showModal();
}
