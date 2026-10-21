// Florilège — manche 1 : examen d'un ensemble. Deux modes, plus l'affichage en grand :
//   « Une à une »  : la photo courante en grand, les 3 voisines de chaque côté en plus petit ;
//   « Imagettes »  : grille de miniatures.
// Le menu « Afficher » choisit les photos montrées selon leur choix (⭐ ❤️ ⊙ ✖️ A), dans tous les modes.
// Gestes : glisser à gauche / à droite pour passer à la photo suivante ou précédente (une seule à la fois),
// vers le haut pour ❤️ (je garde), vers le bas pour ✖️ (je passe).
// La pastille en haut à gauche de la photo montre le choix (· ❤️ ⭐ ✖️) et le change ; le bouton ⭐ du bas
// marque un coup de cœur.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import {
  PASSE, GARDE, COEUR, AUTO, categorie, estTrie, photosDe, progressionEnsemble, peutMettreCoeur,
  ensembleAContinuer, valeurSuivante, prochaineATrier, comptesEnsemble, valeurApresFleche,
} from './etat.js?v=0.17.0';
import { el, notifier, confettis, encouragement, nouveauxBadges, annoncerBadge } from './ludique.js?v=0.17.0';
import { ouvrirVisionneuse } from './zoom.js?v=0.17.0';
import { CONFIG } from './config.js?v=0.17.0';
import { lireStockage, ecrireStockage } from './stockage.js?v=0.17.0';
import { boutonAide } from './aide.js?v=0.17.0';
import { telechargerOriginaux } from './telechargement.js?v=0.17.0';

export const SYMBOLES = { [PASSE]: '✖️', [GARDE]: '❤️', [COEUR]: '⭐', [AUTO]: 'A' };
const TEXTES = { [PASSE]: '✖️ Je passe', [GARDE]: '❤️ Je garde', [COEUR]: '❤️ ⭐ Coup de cœur', [AUTO]: 'A Écartée automatiquement' };
const VOISINS = 3;
const ECHELLES = [1, 0.55, 0.4, 0.3]; // taille des photos selon leur distance à la photo centrale
const CLE_MODE = 'florilege-mode';
const CLE_AVANCE = 'florilege-avance-auto';
const CLE_FILTRE = 'florilege-filtre';
// Catégories du menu « Afficher », dans l'ordre habituel ; par défaut : coups de cœur, gardées et à trier.
const CATEGORIES = [
  { id: 'coeur', icone: '⭐', libelle: 'Coups de cœur' },
  { id: 'garde', icone: '❤️', libelle: 'Gardées' },
  { id: 'atrier', icone: '⊙', libelle: 'À trier' },
  { id: 'passe', icone: '✖️', libelle: 'Écartées' },
  { id: 'auto', icone: 'A', libelle: 'Écartées automatiquement' },
];
const FILTRE_DEFAUT = ['coeur', 'garde', 'atrier'];
const CM = 38; // un centimètre à l'écran, en pixels CSS (96 px par pouce)
const MODES = [
  { id: 'photo', icone: '▢', libelle: 'Une à une', titre: 'Les photos une à une. Clavier : ← → défiler · ↑ je garde · ↓ je passe · E coup de cœur · Suppr effacer · Entrée voir en grand' },
  { id: 'grille', icone: '▦', libelle: 'Imagettes', titre: 'Les photos en miniatures (G)' },
];
const EFFACER = '⊙'; // même dessin que la pastille d'une photo « à trier »

// Proportions d'une photo ; inconnues (0) tant que l'image n'est pas chargée : 4/3 par défaut.
const rapport = p => (p.largeur > 0 && p.hauteur > 0 ? p.largeur / p.hauteur : 4 / 3);
const ratioDe = p => (p.largeur > 0 && p.hauteur > 0 ? `${p.largeur} / ${p.hauteur}` : '4 / 3');

function badgeDe(v) {
  return estTrie(v) ? SYMBOLES[v] : '·';
}

export function ecranEnsemble(ctx, ensembleId, nav, options = {}) {
  const { etat, images } = ctx;
  const ens = etat.ensembles.find(e => e.id === ensembleId);
  const photos = photosDe(etat, ensembleId);
  const max = etat.config.max_coups_de_coeur ?? 4;
  let mode = options.mode || lireStockage(CLE_MODE, 'photo');
  let filtre = new Set(lireStockage(CLE_FILTRE, FILTRE_DEFAUT).filter(c => CATEGORIES.some(k => k.id === c)));
  if (!filtre.size) filtre = new Set(FILTRE_DEFAUT);
  if (mode === 'retenues') mode = 'photo'; // ancien mode « Retenues »
  const toutAffiche = () => filtre.size === CATEGORIES.length;
  const estAffichee = i => filtre.has(categorie(etat.votes[photos[i].id]));
  const menusFiltre = new Set(); // menus « Afficher » (entête et visionneuse), tenus à jour ensemble
  if (!MODES.some(m => m.id === mode)) mode = 'photo';
  let avanceAuto = lireStockage(CLE_AVANCE, false);
  let cur = options.index ?? Math.max(0, prochaineATrier(etat, ensembleId, -1));
  let etaitTermine = progressionEnsemble(etat, ensembleId).statut === 'termine';
  let fin = null;
  let visionneuse = null;
  let vue = null; // vue affichée : { racine, afficher, detruire, majPhoto(i), clavier(e), position() }

  // Les miniatures sont demandées au fur et à mesure de l'affichage (pas toutes d'un coup : la file d'attente
  // serait occupée longtemps et la photo affichée attendrait).

  // ---- entête commun
  const selecteur = el('div', { class: 'selecteur-mode', role: 'tablist', 'aria-label': 'Mode d\'affichage' },
    MODES.map(m => el('button', { role: 'tab', 'data-mode': m.id, title: m.titre, onclick: () => changerMode(m.id) },
      el('span', { class: 'icone-mode', 'aria-hidden': 'true' }, `${m.icone} `), m.libelle)));
  const caseAvance = el('input', { type: 'checkbox', checked: avanceAuto });
  caseAvance.addEventListener('change', () => basculerAvance(caseAvance.checked));
  const optionAvance = el('label', { class: 'option-tri', title: 'Passer à la photo suivante après un choix' }, caseAvance, ' Suivante après choix');
  const boutonTelecharger = el('button', { class: 'btn-telecharger', title: 'Télécharger la photo d\'origine (en imagettes : les photos sélectionnées)',
    'aria-label': 'Télécharger', onclick: () => telecharger() }, '⬇️');
  const ligneModes = el('div', { class: 'ligne-modes' },
    menuFiltre(),
    optionAvance, boutonTelecharger);
  const stats = el('div', { class: 'tri-stats' });
  const barre = el('span');
  const corps = el('div', { class: 'tri-corps' });
  const racine = el('section', { class: 'ecran ecran-tri' },
    el('header', { class: 'tri-entete' },
      el('button', { class: 'btn-accueil', title: 'Retour à l\'accueil (Échap)', 'aria-label': 'Accueil', onclick: nav.accueil },
        el('img', { src: 'img/florilege-icone.svg', alt: '', class: 'logo-accueil', width: 30, height: 30 }),
        el('span', { class: 'libelle-accueil' }, 'Accueil')),
      el('div', { class: 'tri-infos' }, el('div', { class: 'tri-titre' }, ens.nom)),
      selecteur,
      boutonAide()),
    ligneModes,
    stats,
    el('div', { class: 'barre-progression' }, barre),
    corps);

  function actualiserEntete() {
    const c = comptesEnsemble(etat, ensembleId);
    const triees = photos.length - c.nonTries;
    const position = vue?.position?.();
    stats.replaceChildren(...[
      position?.total ? el('span', { class: 'pilule', title: toutAffiche() ? 'Photo affichée / nombre de photos' : 'Photo affichée / nombre de photos affichées (menu « Afficher »)' },
        `📷 ${position.n}/${position.total}`) : null,
      el('span', { class: 'pilule', title: 'Photos sans choix' }, `⊙ ${c.nonTries}`),
      el('span', { class: 'pilule', title: 'Photos écartées' }, `✖️ ${c.passes}`),
      c.autos ? el('span', { class: 'pilule auto', title: 'Photos écartées automatiquement' }, `A ${c.autos}`) : null,
      el('span', { class: 'pilule', title: 'Photos gardées (❤️ et ⭐)' }, `❤️+⭐ ${c.gardes + c.coeurs}`),
      el('span', { class: `pilule${c.coeurs >= max ? ' plein' : ''}`, title: 'Coups de cœur utilisés' }, `⭐ ${c.coeurs}/${max}`),
    ].filter(Boolean));
    barre.style.width = `${photos.length ? 100 * triees / photos.length : 0}%`;
    for (const b of selecteur.children) b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false');
  }

  // ---- enregistrement d'un choix (commun à tous les modes)

  function voter(i, valeur) {
    ctx.voter(photos[i].id, valeur);
    vue?.majPhoto(i);
    actualiserEntete();
    if (visionneuse) visionneuse.maj(etatVisionneuse());
    const termine = progressionEnsemble(etat, ensembleId).statut === 'termine';
    if (termine && !etaitTermine) terminer();
    etaitTermine = termine;
  }

  // Le coup de cœur est refusé au-delà de la limite ; renvoie false dans ce cas.
  function basculerEtoile(i = cur) {
    const v = etat.votes[photos[i].id];
    if (v === COEUR) { voter(i, GARDE); return true; }
    if (!peutMettreCoeur(etat, ensembleId, photos[i].id)) {
      signaler(`Déjà ${max} coups de cœur dans cet ensemble : retirez-en un pour en donner un autre.`);
      return false;
    }
    voter(i, COEUR);
    return true;
  }

  // Pastille : · → ❤️ → ⭐ → ✖️ → ·
  function changerChoix(i) {
    voter(i, valeurSuivante(etat.votes[photos[i].id], peutMettreCoeur(etat, ensembleId, photos[i].id)));
  }

  function effacer(i = cur) {
    if (!estTrie(etat.votes[photos[i].id])) {
      signaler('Cette photo n\'a pas encore de choix.');
      return;
    }
    voter(i, null);
    signaler('Choix effacé : la photo est de nouveau « à trier ».');
  }

  // Message court : au milieu de la visionneuse si elle est ouverte, sinon en bas de l'écran.
  function signaler(texte) {
    if (visionneuse) visionneuse.message(texte);
    else notifier(texte);
  }

  // État affiché dans la visionneuse : choix de la photo et compteurs de l'ensemble.
  function etatVisionneuse() {
    const v = etat.votes[photos[cur].id];
    const c = comptesEnsemble(etat, ensembleId);
    const position = vue?.position?.() || { n: cur + 1, total: photos.length };
    return {
      choix: TEXTES[v] || 'À trier',
      valeur: estTrie(v) ? v : null,
      coeur: v === COEUR,
      compteur: `📷 ${position.n}/${position.total} · `
        + (c.nonTries ? `⊙ ${c.nonTries} à trier` : 'tout est trié')
        + ` · ✖️ ${c.passes}${c.autos ? ` · A ${c.autos}` : ''} · ❤️+⭐ ${c.gardes + c.coeurs} · ⭐ ${c.coeurs}/${max}`,
      position: position.n,
      total: position.total,
      avance: avanceAuto,
    };
  }

  function ouvrirGrand() {
    if (visionneuse || !photos.length || !vue?.position?.().total) return;
    visionneuse = ouvrirVisionneuse(images, photos[cur].id, {
      extras: [menuFiltre(true)],
      ratio: ratioDe(photos[cur]),
      surFermeture: () => { visionneuse = null; },
      actions: {
        defiler: (sens, distance) => vue?.defiler?.(sens, distance),
        garder: () => vue?.choisir?.(GARDE),
        passer: () => vue?.choisir?.(PASSE),
        haut: () => vue?.choisir?.(GARDE, true),
        bas: () => vue?.choisir?.(PASSE, true),
        etoile: () => basculerEtoile(),
        effacer: () => effacer(),
        allerA: (n, leger) => vue?.allerA?.(n, leger),
        avance: v => basculerAvance(v),
        telecharger: () => telecharger(),
      },
    });
    visionneuse.maj(etatVisionneuse());
  }

  function changerMode(m) {
    mode = m;
    ecrireStockage(CLE_MODE, m);
    vue?.detruire();
    vue = m === 'grille' ? vueGrille() : vuePhoto();
    corps.replaceChildren(vue.racine);
    actualiserEntete();
    vue.afficher?.();
  }

  // Case « Suivante après choix » (entête ou visionneuse).
  function basculerAvance(v) {
    avanceAuto = v;
    ecrireStockage(CLE_AVANCE, v);
    caseAvance.checked = v;
    visionneuse?.maj({ avance: v });
  }

  // Téléchargement de la photo d'origine : la photo affichée, ou en imagettes les photos sélectionnées.
  function telecharger() {
    const ids = mode === 'grille'
      ? (vue.selection?.() || []).map(i => photos[i].id)
      : (vue?.position?.().total ? [photos[cur].id] : []);
    telechargerOriginaux(images.backend, ctx.jeton, ids);
  }

  // Menu « Afficher » : cases ⭐ ❤️ ⊙ ✖️ A. sombre : version pour la visionneuse.
  function menuFiltre(sombre = false) {
    const resume = el('span', { class: 'menu-filtre-resume' });
    const cases = CATEGORIES.map(c => {
      const input = el('input', { type: 'checkbox', 'data-id': c.id });
      input.addEventListener('change', () => {
        const nouveau = new Set(filtre);
        if (input.checked) nouveau.add(c.id); else nouveau.delete(c.id);
        if (!nouveau.size) { input.checked = true; notifier('Gardez au moins une catégorie.'); return; }
        changerFiltre(nouveau);
      });
      return el('label', { class: 'menu-filtre-choix' }, input, el('span', { class: 'menu-filtre-icone' }, c.icone), ` ${c.libelle}`);
    });
    const menu = el('details', { class: `menu-filtre${sombre ? ' sombre' : ''}` },
      el('summary', { title: 'Choisir les photos affichées (R : tout / par défaut)' }, el('span', { class: 'menu-filtre-libelle' }, 'Afficher '), resume),
      el('div', { class: 'menu-filtre-liste' }, cases,
        el('div', { class: 'menu-filtre-raccourcis' },
          el('button', { type: 'button', onclick: () => changerFiltre(new Set(CATEGORIES.map(c => c.id))) }, 'Tout'),
          el('button', { type: 'button', onclick: () => changerFiltre(new Set(FILTRE_DEFAUT)) }, 'Par défaut'))));
    menu.maj = () => {
      resume.textContent = toutAffiche() ? 'tout ▾' : `${CATEGORIES.filter(c => filtre.has(c.id)).map(c => c.icone).join(' ')} ▾`;
      for (const input of menu.querySelectorAll('input')) input.checked = filtre.has(input.dataset.id);
    };
    // Un clic ailleurs referme le menu.
    document.addEventListener('pointerdown', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; }, true);
    menu.maj();
    menusFiltre.add(menu);
    return menu;
  }

  // Nouveau choix de photos affichées : on reconstruit la vue (et on met à jour la visionneuse).
  function changerFiltre(nouveau) {
    filtre = nouveau;
    ecrireStockage(CLE_FILTRE, [...filtre]);
    for (const m of menusFiltre) { if (m.isConnected) m.maj(); else menusFiltre.delete(m); }
    changerMode(mode);
    if (!visionneuse) return;
    if (!vue.position?.().total) {
      visionneuse.fermer();
      notifier('Aucune photo à afficher avec ce choix.');
      return;
    }
    visionneuse.changerPhoto(photos[cur].id, ratioDe(photos[cur]));
    visionneuse.maj(etatVisionneuse());
  }

  // ---------------------------------------------------------------- mode « une à une »

  function vuePhoto() {
    const filtrage = !toutAffiche();
    const scene = el('div', { class: 'scene' });
    const vide = el('div', { class: 'scene-vide', hidden: true },
      el('p', {}, 'Aucune photo à afficher avec ce choix (menu « Afficher »).'),
      el('button', { class: 'btn-secondaire', onclick: () => changerFiltre(new Set(CATEGORIES.map(c => c.id))) }, 'Voir toutes les photos'));
    const messageBout = el('div', { class: 'message-bout', 'aria-live': 'polite' });
    const cartes = new Map(); // indice de photo → élément
    let ordre = [];           // indices des photos affichées, dans l'ordre
    let pos = 0;              // position de la photo courante dans « ordre »
    const boutonEtoile = el('button', { class: 'btn-rond etoile-bas', 'aria-label': 'Coup de cœur', title: 'Coup de cœur ⭐ (E)',
      onclick: () => { if (ordre.length && !basculerEtoile()) secouer(cartes.get(cur)); } }, '★');
    // Le bouton ⭐ est doré quand la photo affichée est un coup de cœur.
    function majBoutonEtoile() {
      const v = ordre.length ? etat.votes[photos[cur].id] : null;
      boutonEtoile.classList.toggle('doree', v === COEUR);
      boutonEtoile.setAttribute('aria-pressed', v === COEUR ? 'true' : 'false');
    }

    // Ascenseur horizontal : position dans l'ensemble ; le faire glisser fait défiler les photos.
    const curseur = el('input', { type: 'range', class: 'curseur-photos', min: 1, max: 1, value: 1, step: 1, 'aria-label': 'Position dans l\'ensemble' });
    curseur.addEventListener('input', () => allerPos(Number(curseur.value) - 1, { leger: true, silencieux: true }));
    curseur.addEventListener('change', () => allerPos(Number(curseur.value) - 1));
    // Les touches du clavier gardent leur rôle habituel (défiler, choisir) même si l'ascenseur a le focus.
    curseur.addEventListener('keydown', e => { e.preventDefault(); curseur.blur(); });

    const racineVue = el('div', { class: 'vue-photo' },
      el('div', { class: 'scene-cadre' },
        scene, vide, messageBout,
        el('button', { class: 'nav-photo gauche', 'aria-label': 'Photo précédente', title: 'Photo précédente (←)', onclick: () => allerPos(pos - 1) }, '‹'),
        el('button', { class: 'nav-photo droite', 'aria-label': 'Photo suivante', title: 'Photo suivante (→)', onclick: () => allerPos(pos + 1) }, '›')),
      curseur,
      el('div', { class: 'tri-actions' },
        el('button', { class: 'btn-rond petit', 'aria-label': 'Effacer le choix de cette photo', title: 'Effacer le choix : la photo redevient « à trier » (Suppr)', onclick: () => ordre.length && effacer() }, EFFACER),
        el('button', { class: 'btn-rond passe', 'aria-label': 'Je passe', title: 'Je passe (↓)', onclick: () => choisir(PASSE) }, SYMBOLES[PASSE]),
        el('button', { class: 'btn-rond garde', 'aria-label': 'Je garde', title: 'Je garde (↑)', onclick: () => choisir(GARDE) }, SYMBOLES[GARDE]),
        boutonEtoile));

    // « C'est la dernière photo » : au milieu de la photo (ou de la visionneuse), seulement si l'on tente d'aller plus loin.
    let minuteurBout = null;
    function signalerBout(sens) {
      const texte = sens < 0 ? 'C\'est la première photo' : 'C\'est la dernière photo';
      if (visionneuse) { visionneuse.message(texte); return; }
      messageBout.textContent = texte;
      messageBout.classList.add('visible');
      clearTimeout(minuteurBout);
      minuteurBout = setTimeout(() => messageBout.classList.remove('visible'), 1400);
    }

    // Liste des photos affichées ; la photo courante reste la même si elle y figure encore.
    function calculerOrdre() {
      const avant = pos;
      ordre = filtrage
        ? photos.map((p, i) => i).filter(estAffichee)
        : photos.map((p, i) => i);
      const k = ordre.indexOf(cur);
      if (k >= 0) {
        pos = k;
      } else if (ordre.length) {
        // La photo courante a disparu (ou n'était pas retenue) : on prend la suivante dans l'ordre.
        const suivante = ordre.findIndex(i => i > cur);
        pos = suivante >= 0 ? suivante : Math.min(avant, ordre.length - 1);
        cur = ordre[pos];
      }
      vide.hidden = ordre.length > 0;
    }

    function creerCarte(i) {
      const p = photos[i];
      const img = el('img', { alt: `Photo ${p.ordre} sur ${photos.length} — ${ens.nom}`, draggable: 'false' });
      const choix = el('button', { class: 'choix', title: 'Changer le choix : · → ❤️ → ⭐ → ✖️' });
      choix.addEventListener('pointerdown', e => e.stopPropagation());
      choix.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== cur) { allerPhoto(i); return; }
        changerChoix(i);
      });
      const carte = el('div', { class: 'defil nouvelle' },
        el('div', { class: 'cadre' }, img, choix,
          el('span', { class: 'tampon tampon-haut', 'aria-hidden': 'true' }, `${SYMBOLES[GARDE]} Je garde`),
          el('span', { class: 'tampon tampon-bas', 'aria-hidden': 'true' }, `${SYMBOLES[PASSE]} Je passe`)));
      carte.indice = i;
      carte.img = img;
      carte.choix = choix;
      // Tant qu'aucune image n'est affichée, la carte indique « Chargement… » ; « Image indisponible » en cas d'échec.
      img.addEventListener('load', () => { carte.classList.add('chargee'); carte.classList.remove('echec'); });
      images.mini(p.id, 1).then(url => { if (!carte.grande) img.src = url; }).catch(() => { carte.echecMini = true; signalerEchec(carte); });
      // Dimensions inconnues du serveur : on les déduit de la première image chargée.
      if (!(p.largeur > 0 && p.hauteur > 0)) {
        img.addEventListener('load', () => {
          if (p.largeur > 0 || !img.naturalWidth) return;
          p.largeur = img.naturalWidth;
          p.hauteur = img.naturalHeight;
          placer();
          if (visionneuse && cur === i) visionneuse.changerPhoto(p.id, ratioDe(p));
        });
      }
      majCarte(carte);
      return carte;
    }

    function majCarte(carte) {
      const v = etat.votes[photos[carte.indice].id];
      carte.dataset.valeur = estTrie(v) ? v : '';
      carte.choix.textContent = badgeDe(v);
      carte.choix.setAttribute('aria-label', `Choix : ${TEXTES[v] || 'à trier'}. Toucher pour changer.`);
    }

    function chargerGrande(carte) {
      if (carte.grande) return;
      images.grande(photos[carte.indice].id, 0).then(async url => {
        const tampon = new Image();
        tampon.src = url;
        try { await tampon.decode(); } catch { /* on affiche quand même */ }
        carte.grande = true;
        carte.img.src = url;
      }).catch(() => { carte.echecGrande = true; signalerEchec(carte); });
    }

    function signalerEchec(carte) {
      if (!carte.classList.contains('chargee') && (carte.echecMini || carte.echecGrande)) carte.classList.add('echec');
    }

    // Place les photos : la courante en grand, les voisines de plus en plus petites, à moitié cachées.
    // « leger » : pendant un défilement rapide, on ne charge pas encore les grandes images.
    function placer(decalage = 0, leger = false) {
      const L = scene.clientWidth;
      const H = scene.clientHeight;
      if (!L || !H) return;
      const maxL = L * (L < H ? 0.8 : 0.7);
      const maxH = H * 0.94;
      const taille = (i, f) => {
        const r = rapport(photos[i]);
        let w = maxL * f;
        let h = w / r;
        if (h > maxH * f) { h = maxH * f; w = h * r; }
        return { w, h };
      };

      // Photos à afficher : la courante et jusqu'à 3 de chaque côté.
      const voulues = new Map();
      for (let k = -VOISINS; k <= VOISINS; k++) {
        if (pos + k >= 0 && pos + k < ordre.length) voulues.set(ordre[pos + k], k);
      }
      for (const [i, carte] of cartes) {
        if (voulues.has(i)) continue;
        cartes.delete(i);
        carte.classList.add('part');
        setTimeout(() => carte.remove(), 300);
      }
      if (!ordre.length) return;

      const positions = new Map([[ordre[pos], 0]]);
      for (const sens of [1, -1]) {
        let x = 0;
        let demi = taille(ordre[pos], 1).w / 2;
        for (let k = 1; k <= VOISINS; k++) {
          const p = pos + sens * k;
          if (p < 0 || p >= ordre.length) break;
          x += demi;
          positions.set(ordre[p], sens * x);
          demi = taille(ordre[p], ECHELLES[k]).w / 2;
        }
      }

      for (const [i, k] of voulues) {
        let carte = cartes.get(i);
        if (!carte) {
          carte = creerCarte(i);
          cartes.set(i, carte);
          scene.append(carte);
        }
        const d = Math.abs(k);
        const { w, h } = taille(i, ECHELLES[d]);
        carte.style.width = `${w}px`;
        carte.style.height = `${h}px`;
        carte.base = `translate(-50%, -50%) translate(${positions.get(i) + decalage}px, 0)`;
        carte.style.transform = carte.base;
        carte.style.zIndex = String(10 - d);
        carte.dataset.distance = d;
        carte.classList.toggle('centre', d === 0);
        if (carte.classList.contains('nouvelle')) {
          void carte.offsetWidth; // position initiale sans animation
          carte.classList.remove('nouvelle');
        }
      }
      if (!leger) {
        const centre = cartes.get(ordre[pos]);
        if (centre) chargerGrande(centre);
      }
    }

    function precharger() {
      for (let k = 1; k <= CONFIG.prechargementAvance; k++) {
        if (pos + k < ordre.length) images.grande(photos[ordre[pos + k]].id, k).catch(() => {});
      }
      if (pos > 0) images.grande(photos[ordre[pos - 1]].id, 3).catch(() => {});
    }

    // Va à la position p de la liste ; renvoie false si on est au bout.
    function allerPos(p, { leger = false, silencieux = false } = {}) {
      if (!ordre.length) return false;
      if (p < 0 || p >= ordre.length) {
        if (!silencieux) signalerBout(p < 0 ? -1 : 1);
        placer();
        return false;
      }
      pos = p;
      cur = ordre[pos];
      placer(0, leger);
      if (!leger) precharger();
      majCurseur();
      majBoutonEtoile();
      actualiserEntete();
      if (visionneuse) {
        visionneuse.changerPhoto(photos[cur].id, ratioDe(photos[cur]));
        visionneuse.maj(etatVisionneuse());
      }
      return true;
    }

    function majCurseur() {
      curseur.max = String(Math.max(1, ordre.length));
      curseur.value = String(pos + 1);
      curseur.hidden = ordre.length < 2;
    }

    function allerPhoto(i) {
      const p = ordre.indexOf(i);
      if (p >= 0) allerPos(p);
    }

    // Défilement : toujours une seule photo par geste, quelle que soit sa longueur ou sa vitesse
    // (pour aller plus vite : la réglette horizontale).
    function defilerSelonGeste(sens) {
      allerPos(pos + sens);
    }

    // ❤️ ou ✖️ : on enregistre ; on passe à la suivante seulement si l'option est cochée.
    // fleche : true pour une flèche ou un geste (échelle ✖️ ↔ ❤️ ↔ ⭐, voir valeurApresFleche),
    // false pour les boutons ❤️ et ✖️ (valeur directe).
    function choisir(valeur, fleche = false) {
      if (!ordre.length) return;
      const i = cur;
      if (fleche) {
        const actuelle = etat.votes[photos[i].id];
        const coeurPossible = peutMettreCoeur(etat, ensembleId, photos[i].id);
        valeur = valeurApresFleche(actuelle, valeur === GARDE, coeurPossible);
        if (actuelle === GARDE && valeur === GARDE) {
          secouer(cartes.get(i));
          signaler(`Déjà ${max} coups de cœur dans cet ensemble : retirez-en un pour en donner un autre.`);
          return;
        }
        if (valeur === actuelle) return; // déjà en haut (⭐) ou en bas (✖️) de l'échelle
      }
      voter(i, valeur);
      const carte = cartes.get(i);
      if (carte) {
        carte.classList.remove('pulse');
        void carte.offsetWidth;
        carte.classList.add('pulse');
      }
      if (!avanceAuto) return;
      if (!ordre.includes(i)) return; // photo sortie de l'affichage : la suivante a déjà pris sa place
      if (pos + 1 < ordre.length) { allerPos(pos + 1); return; }
      const j = prochaineATrier(etat, ensembleId, i);
      if (j >= 0 && ordre.includes(j)) {
        const reste = comptesEnsemble(etat, ensembleId).nonTries;
        signaler(`Il reste ${reste} photo${reste > 1 ? 's' : ''} à trier dans cet ensemble.`);
        allerPhoto(j);
      }
    }

    function secouer(carte) {
      if (!carte) return;
      carte.classList.remove('secoue');
      void carte.offsetWidth;
      carte.classList.add('secoue');
    }

    // ---- gestes : horizontal = défiler, vertical = choisir
    const pointeurs = new Map();
    let geste = null;

    function remettreCentre() {
      const c = cartes.get(cur);
      if (!c) return;
      c.style.transform = c.base;
      c.firstChild.style.setProperty('--o-haut', 0);
      c.firstChild.style.setProperty('--o-bas', 0);
    }

    scene.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      scene.setPointerCapture(e.pointerId);
      if (pointeurs.size === 2) {
        geste = null;
        pointeurs.clear();
        scene.classList.remove('glisse');
        placer();
        ouvrirGrand();
        return;
      }
      const t = performance.now();
      geste = {
        x0: e.clientX, y0: e.clientY, t0: t, dx: 0, dy: 0, axe: null,
        cible: e.target.closest('.defil'), traces: [{ x: e.clientX, t }],
      };
    });

    scene.addEventListener('pointermove', e => {
      if (!geste || !pointeurs.has(e.pointerId)) return;
      geste.dx = e.clientX - geste.x0;
      geste.dy = e.clientY - geste.y0;
      const t = performance.now();
      geste.traces.push({ x: e.clientX, t });
      while (geste.traces.length > 2 && t - geste.traces[0].t > 100) geste.traces.shift();
      if (!geste.axe && Math.hypot(geste.dx, geste.dy) > 10) {
        geste.axe = Math.abs(geste.dx) >= Math.abs(geste.dy) ? 'h' : 'v';
        scene.classList.add('glisse');
      }
      if (geste.axe === 'h') {
        placer(geste.dx, true);
      } else if (geste.axe === 'v') {
        const c = cartes.get(cur);
        if (!c) return;
        c.style.transform = `${c.base} translate(0, ${geste.dy}px)`;
        const s = Math.min(110, scene.clientHeight * 0.2);
        c.firstChild.style.setProperty('--o-haut', Math.max(0, Math.min(1, -geste.dy / s)));
        c.firstChild.style.setProperty('--o-bas', Math.max(0, Math.min(1, geste.dy / s)));
      }
    });

    function finGeste(e) {
      pointeurs.delete(e.pointerId);
      if (!geste) return;
      const g = geste;
      geste = null;
      scene.classList.remove('glisse');
      if (e.type === 'pointercancel') { remettreCentre(); placer(); return; }
      const duree = performance.now() - g.t0;

      if (!g.axe) {
        // Simple toucher ou clic.
        if (!g.cible) return;
        if (g.cible.indice !== cur) { allerPhoto(g.cible.indice); return; }
        ouvrirGrand(); // un seul toucher ou clic sur la photo : affichage agrandi
        return;
      }
      if (g.axe === 'h') {
        // Vitesse au moment du lâcher (sur les 100 dernières ms), en pixels par milliseconde.
        const a = g.traces[0];
        const b = g.traces[g.traces.length - 1];
        const v = (b.x - a.x) / Math.max(b.t - a.t, 1);
        const distance = Math.abs(g.dx);
        const lance = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(g.dx);
        if (distance > CM * 0.8 || (lance && distance > 15)) defilerSelonGeste(g.dx < 0 ? 1 : -1);
        else placer();
        return;
      }
      const s = Math.min(110, scene.clientHeight * 0.2);
      const lance = Math.abs(g.dy) / Math.max(duree, 1) > 0.6;
      remettreCentre();
      if (g.dy < -s || (lance && g.dy < -40)) choisir(GARDE, true);
      else if (g.dy > s || (lance && g.dy > 40)) choisir(PASSE, true);
    }
    scene.addEventListener('pointerup', finGeste);
    scene.addEventListener('pointercancel', finGeste);

    const observateurTaille = new ResizeObserver(() => {
      scene.classList.add('glisse');
      placer();
      requestAnimationFrame(() => scene.classList.remove('glisse'));
    });
    observateurTaille.observe(scene);

    calculerOrdre();

    return {
      racine: racineVue,
      afficher() { placer(); precharger(); majCurseur(); majBoutonEtoile(); },
      detruire() { observateurTaille.disconnect(); clearTimeout(minuteurBout); },
      position: () => ({ n: ordre.length ? pos + 1 : 0, total: ordre.length }),
      allerA: (n, leger) => allerPos(n, { leger, silencieux: true }),
      defiler: sens => defilerSelonGeste(sens),
      choisir,
      majPhoto(i) {
        const c = cartes.get(i);
        if (c) majCarte(c);
        majBoutonEtoile();
        if (filtrage) {
          const avant = cur;
          calculerOrdre();
          placer();
          majCurseur();
          if (cur !== avant && visionneuse && ordre.length) visionneuse.changerPhoto(photos[cur].id, ratioDe(photos[cur]));
          if (visionneuse && !ordre.length) visionneuse.fermer();
        }
      },
      clavier(e) {
        const actions = {
          ArrowLeft: () => allerPos(pos - 1),
          ArrowRight: () => allerPos(pos + 1),
          ArrowUp: () => choisir(GARDE, true),
          ArrowDown: () => choisir(PASSE, true),
          e: () => { if (ordre.length && !basculerEtoile()) secouer(cartes.get(cur)); },
          '*': () => ordre.length && basculerEtoile(),
          Delete: () => ordre.length && effacer(),
          Backspace: () => ordre.length && effacer(),
          Enter: ouvrirGrand,
        };
        const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
        if (!action) return false;
        action();
        return true;
      },
    };
  }

  // ---------------------------------------------------------------- mode imagettes

  // Un toucher (ou clic) sélectionne ou désélectionne une imagette ; un appui long (ou Maj+clic) sélectionne
  // toute la plage depuis la précédente ; un double toucher (ou double clic) ouvre la photo en « une à une ».
  // Les boutons du bas (⊙ ✖️ ❤️ ⭐, comme en « une à une ») s'appliquent à toute la sélection.
  function vueGrille() {
    const filtrage = !toutAffiche();
    const APPUI_LONG = 500; // ms
    const selection = new Set();
    let ancre = null;      // dernière imagette touchée en mode sélection
    let appui = null;      // appui en cours : { i, x, y, minuteur, long }
    let dernierToucher = { i: -1, t: 0 }; // pour reconnaître un double toucher

    const observateur = new IntersectionObserver(entrees => {
      for (const en of entrees) {
        if (!en.isIntersecting) continue;
        const img = en.target;
        observateur.unobserve(img);
        images.mini(img.dataset.id, 1).then(url => { img.src = url; }).catch(() => {});
      }
    }, { rootMargin: '300px' });

    const vignettes = [];
    const grille = el('div', { class: 'grille-revue' });
    const visible = i => !filtrage || estAffichee(i);
    const vide = el('div', { class: 'scene-vide grille-vide', hidden: true },
      el('p', {}, 'Aucune photo à afficher avec ce choix (menu « Afficher »).'),
      el('button', { class: 'btn-secondaire', onclick: () => changerFiltre(new Set(CATEGORIES.map(c => c.id))) }, 'Voir toutes les photos'));
    photos.forEach((p, i) => {
      const img = el('img', { alt: '', 'data-id': p.id, decoding: 'async', draggable: 'false' });
      const pastille = el('button', { class: 'pastille', title: 'Changer le choix' });
      const vignette = el('div', { class: 'vignette' },
        el('button', { class: 'ouvrir', 'aria-label': `Photo ${p.ordre}` }, img),
        el('span', { class: 'etoile-mini', 'aria-hidden': 'true' }, '★'),
        el('span', { class: 'coche', 'aria-hidden': 'true' }, '✓'),
        pastille);
      vignette.indice = i;
      vignettes.push(vignette);
      grille.append(vignette);
      observateur.observe(img);
      maj(i);
    });

    function maj(i) {
      const v = etat.votes[photos[i].id];
      const vignette = vignettes[i];
      const pastille = vignette.querySelector('.pastille');
      vignette.dataset.valeur = estTrie(v) ? v : '';
      vignette.hidden = !visible(i);
      vignette.classList.toggle('courante', i === cur);
      vignette.classList.toggle('choisie', selection.has(i));
      pastille.textContent = estTrie(v) ? SYMBOLES[v] : '·';
      pastille.setAttribute('aria-label', `Photo ${photos[i].ordre} : ${TEXTES[v] || 'à trier'}. Toucher pour changer.`);
    }

    // ---- barre d'actions de la sélection
    const compteSelection = el('span', { class: 'selection-compte' });
    const appliquerA = valeur => () => appliquerSelection(valeur);
    const boutonsChoix = [
      el('button', { class: 'btn-rond petit', title: 'Effacer le choix des photos sélectionnées', onclick: appliquerA(null) }, EFFACER),
      el('button', { class: 'btn-rond passe', title: 'Je passe', onclick: appliquerA(PASSE) }, SYMBOLES[PASSE]),
      el('button', { class: 'btn-rond garde', title: 'Je garde', onclick: appliquerA(GARDE) }, SYMBOLES[GARDE]),
      el('button', { class: 'btn-rond etoile-bas', title: 'Coup de cœur', onclick: appliquerA(COEUR) }, '★'),
    ];
    const annuler = el('button', { class: 'btn-selection annuler', title: 'Annuler la sélection (Échap)', onclick: viderSelection }, '✕');
    const barre = el('div', { class: 'tri-actions barre-grille' }, compteSelection, ...boutonsChoix, annuler);
    const aide = el('p', { class: 'aide-grille' });

    function majSelection() {
      const n = selection.size;
      grille.classList.toggle('en-selection', n > 0);
      compteSelection.textContent = String(n);
      compteSelection.title = `${n} photo${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}`;
      for (const b of boutonsChoix) b.disabled = n === 0;
      annuler.hidden = n === 0;
      compteSelection.hidden = n === 0;
      aide.textContent = n
        ? `${n} photo${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''} : choisissez ci-dessous (⊙ ✖️ ❤️ ⭐). Appui long : toute la plage depuis la précédente.`
        : 'Touchez des photos pour les sélectionner, puis un bouton du bas. Double toucher : ouvrir la photo. Pastille : changer le choix d\'une photo.';
      vignettes.forEach((v, i) => v.classList.toggle('choisie', selection.has(i)));
    }

    function basculer(i) {
      if (selection.has(i)) selection.delete(i); else selection.add(i);
      ancre = i;
      majSelection();
    }

    function selectionnerPlage(i) {
      const debut = ancre ?? i;
      for (let k = Math.min(debut, i); k <= Math.max(debut, i); k++) if (visible(k)) selection.add(k);
      ancre = i;
      majSelection();
    }

    function viderSelection() {
      selection.clear();
      ancre = null;
      majSelection();
    }

    function appliquerSelection(valeur) {
      const indices = [...selection].sort((a, b) => a - b);
      if (valeur === COEUR) {
        const autres = photos.filter((p, i) => !selection.has(i) && etat.votes[p.id] === COEUR).length;
        if (autres + indices.length > max) {
          notifier(`Pas plus de ${max} coups de cœur par ensemble : il en reste ${Math.max(0, max - autres)} à donner.`);
          return;
        }
      }
      for (const i of indices) voter(i, valeur);
      notifier(`${indices.length} photo${indices.length > 1 ? 's' : ''} : ${TEXTES[valeur] || 'à trier'}`);
      viderSelection();
      // « Suivante après choix » : une seule photo choisie → la suivante est sélectionnée à son tour.
      if (avanceAuto && indices.length === 1) {
        let j = indices[0] + 1;
        while (j < photos.length && !visible(j)) j++;
        if (j < photos.length) {
          basculer(j);
          vignettes[j].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }

    function ouvrir(i) {
      cur = i;
      changerMode('photo');
    }

    function majVide() {
      vide.hidden = vignettes.some(v => !v.hidden);
    }

    // ---- appui court / appui long
    grille.addEventListener('pointerdown', e => {
      const vignette = e.target.closest('.vignette');
      if (!vignette || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const i = vignette.indice;
      appui = { i, x: e.clientX, y: e.clientY, long: false, surPastille: !!e.target.closest('.pastille') };
      appui.minuteur = setTimeout(() => {
        if (!appui) return;
        appui.long = true;
        navigator.vibrate?.(30);
        if (selection.size) selectionnerPlage(i);
        else { selection.add(i); ancre = i; majSelection(); }
      }, APPUI_LONG);
    });
    grille.addEventListener('pointermove', e => {
      if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) {
        clearTimeout(appui.minuteur);
        appui = null; // l'utilisateur fait défiler la grille
      }
    });
    const annulerAppui = () => { if (appui) clearTimeout(appui.minuteur); appui = null; };
    grille.addEventListener('pointercancel', annulerAppui);
    grille.addEventListener('pointerup', e => {
      if (!appui) return;
      const a = appui;
      annulerAppui();
      if (a.long) return; // déjà traité à l'expiration du délai
      if (a.surPastille && !selection.size) { changerChoix(a.i); return; }
      if (e.shiftKey && selection.size) { selectionnerPlage(a.i); return; }
      const maintenant = performance.now();
      if (dernierToucher.i === a.i && maintenant - dernierToucher.t < 400) {
        // Double toucher : on annule la sélection faite par le premier, et on ouvre la photo.
        dernierToucher = { i: -1, t: 0 };
        if (selection.has(a.i)) selection.delete(a.i);
        majSelection();
        ouvrir(a.i);
        return;
      }
      dernierToucher = { i: a.i, t: maintenant };
      basculer(a.i);
    });
    // Clavier (Entrée ou espace sur une imagette ou une pastille) : detail vaut 0 pour un clic clavier.
    grille.addEventListener('click', e => {
      const vignette = e.target.closest('.vignette');
      if (!vignette || e.detail !== 0) return;
      if (e.target.closest('.pastille') && !selection.size) changerChoix(vignette.indice);
      else basculer(vignette.indice);
    });
    grille.addEventListener('dblclick', e => e.preventDefault()); // pas de sélection de texte
    // Empêche le menu contextuel du téléphone (appui long sur une image).
    grille.addEventListener('contextmenu', e => e.preventDefault());

    majSelection();
    majVide();
    const racineVue = el('div', { class: 'vue-grille' }, aide, vide, el('div', { class: 'grille-defil' }, grille), barre);

    return {
      racine: racineVue,
      afficher() { requestAnimationFrame(() => vignettes[cur]?.scrollIntoView({ block: 'center' })); },
      detruire() { observateur.disconnect(); annulerAppui(); },
      majPhoto(i) { maj(i); majVide(); },
      selection: () => [...selection].sort((a, b) => a - b),
      position: () => ({ n: 0, total: 0 }),
      clavier(e) {
        if (e.key === 'Escape' && selection.size) { viderSelection(); return true; }
        if (e.key === 'Enter' && selection.size === 1) { ouvrir([...selection][0]); return true; }
        return false;
      },
    };
  }

  // ---------------------------------------------------------------- fin d'ensemble
  // Un bandeau monte puis s'estompe de lui-même : il n'empêche pas de continuer à retoucher les choix.

  function fermerFin() {
    clearTimeout(fin?.minuteur);
    fin?.remove();
    fin = null;
  }

  function terminer() {
    fermerFin();
    const c = comptesEnsemble(etat, ensembleId);
    const prochain = ensembleAContinuer(etat);
    fin = el('div', { class: 'fin-bandeau', role: 'status' },
      el('div', { class: 'fin-icone', 'aria-hidden': 'true' }, '🌸'),
      el('div', { class: 'fin-texte' },
        el('strong', {}, 'Ensemble terminé !'),
        el('span', {}, prochain ? ` ${encouragement()}` : ' Vous avez tout trié, merci !'),
        el('div', { class: 'fin-resume' },
          `${SYMBOLES[PASSE]} ${c.passes} · ${SYMBOLES[GARDE]}+${SYMBOLES[COEUR]} ${c.gardes + c.coeurs} · ${SYMBOLES[COEUR]} ${c.coeurs}`)),
      prochain
        ? el('button', { class: 'btn-principal petit', onclick: () => nav.ensemble(prochain, 'photo') }, 'Suivant ›')
        : null);
    // Survoler ou toucher le bandeau le garde affiché.
    fin.addEventListener('pointerenter', () => { clearTimeout(fin?.minuteur); fin?.classList.remove('estompe'); });
    fin.addEventListener('pointerleave', () => programmerEstompage());
    document.body.append(fin); // au-dessus de la visionneuse, dans tous les modes
    programmerEstompage();
    confettis();
    for (const b of nouveauxBadges(etat, ctx.jeton)) annoncerBadge(b);
  }

  function programmerEstompage() {
    if (!fin) return;
    const bandeau = fin;
    clearTimeout(bandeau.minuteur);
    bandeau.minuteur = setTimeout(() => {
      bandeau.classList.add('estompe');
      bandeau.minuteur = setTimeout(() => { if (fin === bandeau) fermerFin(); }, 1200);
    }, 5000);
  }

  // ---------------------------------------------------------------- clavier

  function clavier(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!vue?.clavier(e)) nav.accueil();
      return;
    }
    // Dans une zone de texte, les touches servent à écrire (une case à cocher ne bloque rien).
    if (e.target.closest?.('textarea, input:not([type="checkbox"])')) return;
    // Entrée ou espace sur un bouton : laisser le bouton agir.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
    const touche = e.key.toLowerCase();
    if (touche === 'g' || touche === 'r') {
      if (touche === 'r') changerFiltre(new Set(toutAffiche() ? FILTRE_DEFAUT : CATEGORIES.map(c => c.id)));
      else changerMode(mode === 'grille' ? 'photo' : 'grille');
      e.preventDefault();
      return;
    }
    if (vue?.clavier(e)) e.preventDefault();
  }
  document.addEventListener('keydown', clavier);

  changerMode(mode);
  return {
    racine,
    // Pour réafficher le même endroit après une resynchronisation avec le serveur.
    position: () => ({ ensembleId, index: cur, mode }),
    detruire() {
      fermerFin();
      document.removeEventListener('keydown', clavier);
      vue?.detruire();
      visionneuse?.fermer();
    },
  };
}
