// Florilège — manche 1 : examen d'un ensemble. Trois modes :
//   « Une à une »  : toutes les photos, la courante en grand, les 3 voisines de chaque côté en plus petit ;
//   « Retenues »   : pareil, mais seules les photos gardées (❤️ ou ⭐) restent affichées ;
//   « Imagettes »  : grille de miniatures.
// Gestes : glisser à gauche / à droite pour défiler sans rien valider (un geste rapide fait défiler
// plusieurs photos, avec ralentissement), vers le haut pour ❤️ (je garde), vers le bas pour ✖️ (je passe).
// L'étoile, dans le coin de la photo, marque un coup de cœur ; la pastille de l'autre coin change le choix.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import {
  PASSE, GARDE, COEUR, estTrie, photosDe, progressionEnsemble, peutMettreCoeur,
  ensembleAContinuer, valeurSuivante, prochaineATrier, comptesEnsemble,
} from './etat.js?v=0.6.1';
import { el, notifier, confettis, encouragement, nouveauxBadges, annoncerBadge } from './ludique.js?v=0.6.1';
import { ouvrirVisionneuse } from './zoom.js?v=0.6.1';
import { CONFIG } from './config.js?v=0.6.1';
import { lireStockage, ecrireStockage } from './stockage.js?v=0.6.1';

export const SYMBOLES = { [PASSE]: '✖️', [GARDE]: '❤️', [COEUR]: '⭐' };
const TEXTES = { [PASSE]: '✖️ Je passe', [GARDE]: '❤️ Je garde', [COEUR]: '❤️ ⭐ Coup de cœur' };
const VOISINS = 3;
const ECHELLES = [1, 0.55, 0.4, 0.3]; // taille des photos selon leur distance à la photo centrale
const CLE_MODE = 'florilege-mode';
const CLE_AVANCE = 'florilege-avance-auto';
const CM = 38; // un centimètre à l'écran, en pixels CSS (96 px par pouce)
const MODES = [
  { id: 'photo', icone: '▢', libelle: 'Une à une', titre: 'Toutes les photos, une à une' },
  { id: 'retenues', icone: '❤️', libelle: 'Retenues', titre: 'Seulement les photos gardées (❤️ et ⭐)' },
  { id: 'grille', icone: '▦', libelle: 'Imagettes', titre: 'Toutes les photos en miniatures' },
];

const estRetenue = v => v === GARDE || v === COEUR;
const ratioDe = p => `${p.largeur} / ${p.hauteur}`;

function badgeDe(v) {
  return v === PASSE ? SYMBOLES[PASSE] : estRetenue(v) ? SYMBOLES[GARDE] : '·';
}

export function ecranEnsemble(ctx, ensembleId, nav, options = {}) {
  const { etat, images } = ctx;
  const ens = etat.ensembles.find(e => e.id === ensembleId);
  const photos = photosDe(etat, ensembleId);
  const max = etat.config.max_coups_de_coeur ?? 4;
  let mode = options.mode || lireStockage(CLE_MODE, 'photo');
  if (!MODES.some(m => m.id === mode)) mode = 'photo';
  let dernierModePhoto = mode === 'grille' ? 'photo' : mode;
  let cur = options.index ?? Math.max(0, prochaineATrier(etat, ensembleId, -1));
  let etaitTermine = progressionEnsemble(etat, ensembleId).statut === 'termine';
  let fin = null;
  let visionneuse = null;
  let vue = null; // vue affichée : { racine, afficher, detruire, majPhoto(i), clavier(e), compteur() }

  images.minis(photos.map(p => p.id), 1);

  // ---- entête commun
  const compteur = el('div', { class: 'tri-compteur' });
  const selecteur = el('div', { class: 'selecteur-mode', role: 'tablist', 'aria-label': 'Mode d\'affichage' },
    MODES.map(m => el('button', { role: 'tab', 'data-mode': m.id, title: m.titre, onclick: () => changerMode(m.id) },
      el('span', { 'aria-hidden': 'true' }, m.icone), ` ${m.libelle}`)));
  const stats = el('div', { class: 'tri-stats' });
  const barre = el('span');
  const corps = el('div', { class: 'tri-corps' });
  const racine = el('section', { class: 'ecran ecran-tri' },
    el('header', { class: 'tri-entete' },
      el('button', { class: 'btn-accueil', title: 'Retour à l\'accueil (Échap)', onclick: nav.accueil }, '🏠 Accueil'),
      el('div', { class: 'tri-infos' }, el('div', { class: 'tri-titre' }, ens.nom), compteur)),
    selecteur,
    stats,
    el('div', { class: 'barre-progression' }, barre),
    corps);

  function actualiserEntete() {
    const c = comptesEnsemble(etat, ensembleId);
    const triees = photos.length - c.nonTries;
    compteur.textContent = `${vue?.compteur?.() ?? ''}${triees} / ${photos.length} triée${triees > 1 ? 's' : ''}`;
    stats.replaceChildren(
      el('span', { class: `pilule${c.coeurs >= max ? ' plein' : ''}`, title: 'Coups de cœur utilisés' }, `⭐ ${c.coeurs}/${max}`),
      el('span', { class: 'pilule', title: 'Photos gardées (❤️ et ⭐)' }, `❤️+⭐ ${c.gardes + c.coeurs}`),
      el('span', { class: 'pilule', title: 'Photos écartées' }, `✖️ ${c.passes}`),
      c.nonTries ? el('span', { class: 'pilule discrete', title: 'Photos sans choix' }, `${c.nonTries} à trier`) : null);
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
      notifier(`Déjà ${max} coups de cœur dans cet ensemble : retirez-en un pour en donner un autre.`);
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
      notifier('Cette photo n\'a pas encore de choix.');
      return;
    }
    voter(i, null);
    notifier('Choix effacé : la photo est de nouveau « à trier ».');
  }

  // État affiché dans la visionneuse : choix de la photo et compteurs de l'ensemble.
  function etatVisionneuse() {
    const v = etat.votes[photos[cur].id];
    const c = comptesEnsemble(etat, ensembleId);
    return {
      choix: TEXTES[v] || 'À trier',
      valeur: estTrie(v) ? v : null,
      coeur: v === COEUR,
      compteur: `⭐ ${c.coeurs}/${max} · ❤️+⭐ ${c.gardes + c.coeurs}`,
    };
  }

  function ouvrirGrand() {
    if (visionneuse || !photos.length) return;
    visionneuse = ouvrirVisionneuse(images, photos[cur].id, {
      ratio: ratioDe(photos[cur]),
      surFermeture: () => { visionneuse = null; },
      actions: {
        defiler: (sens, distance) => vue?.defiler?.(sens, distance),
        garder: () => vue?.choisir?.(GARDE),
        passer: () => vue?.choisir?.(PASSE),
        etoile: () => basculerEtoile(),
      },
    });
    visionneuse.maj(etatVisionneuse());
  }

  function changerMode(m) {
    if (m !== 'grille') dernierModePhoto = m;
    mode = m;
    ecrireStockage(CLE_MODE, m);
    vue?.detruire();
    vue = m === 'grille' ? vueGrille() : vuePhoto(m === 'retenues');
    corps.replaceChildren(vue.racine);
    actualiserEntete();
    vue.afficher?.();
  }

  // ---------------------------------------------------------------- modes « une à une » et « retenues »

  function vuePhoto(seulementRetenues) {
    const scene = el('div', { class: 'scene' });
    const vide = el('div', { class: 'scene-vide', hidden: true },
      el('p', {}, 'Aucune photo retenue pour l\'instant.'),
      el('button', { class: 'btn-secondaire', onclick: () => changerMode('photo') }, 'Voir toutes les photos'));
    const cartes = new Map(); // indice de photo → élément
    let ordre = [];           // indices des photos affichées, dans l'ordre
    let pos = 0;              // position de la photo courante dans « ordre »
    let avanceAuto = lireStockage(CLE_AVANCE, false);
    let inertie = null;

    const caseAvance = el('input', { type: 'checkbox', checked: avanceAuto });
    caseAvance.addEventListener('change', () => {
      avanceAuto = caseAvance.checked;
      ecrireStockage(CLE_AVANCE, avanceAuto);
    });

    const racineVue = el('div', { class: 'vue-photo' },
      el('div', { class: 'scene-cadre' },
        scene, vide,
        el('button', { class: 'nav-photo gauche', 'aria-label': 'Photo précédente', title: 'Photo précédente (←)', onclick: () => allerPos(pos - 1) }, '‹'),
        el('button', { class: 'nav-photo droite', 'aria-label': 'Photo suivante', title: 'Photo suivante (→)', onclick: () => allerPos(pos + 1) }, '›')),
      el('div', { class: 'tri-actions' },
        el('button', { class: 'btn-rond petit', 'aria-label': 'Effacer le choix de cette photo', title: 'Effacer le choix (Suppr)', onclick: () => ordre.length && effacer() }, '⌫'),
        el('button', { class: 'btn-rond passe', 'aria-label': 'Je passe', title: 'Je passe (↓)', onclick: () => choisir(PASSE) }, SYMBOLES[PASSE]),
        el('button', { class: 'btn-rond garde', 'aria-label': 'Je garde', title: 'Je garde (↑)', onclick: () => choisir(GARDE) }, SYMBOLES[GARDE]),
        el('button', { class: 'btn-rond petit', 'aria-label': 'Voir en grand', title: 'Voir en grand (clic sur la photo, ou Entrée)', onclick: ouvrirGrand }, '🔍')),
      el('label', { class: 'option-avance' }, caseAvance, ' Passer à la photo suivante après ❤️ ou ✖️'),
      el('p', { class: 'aide-clavier' },
        'Clavier : ← → défiler · ↑ je garde · ↓ je passe · E coup de cœur · Suppr effacer · Entrée ou clic : voir en grand'));

    // Liste des photos affichées ; la photo courante reste la même si elle y figure encore.
    function calculerOrdre() {
      const avant = pos;
      ordre = seulementRetenues
        ? photos.map((p, i) => i).filter(i => estRetenue(etat.votes[photos[i].id]))
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
      const etoile = el('button', { class: 'etoile', 'aria-label': 'Coup de cœur', title: 'Coup de cœur (E)' }, '★');
      const choix = el('button', { class: 'choix', title: 'Changer le choix : · → ❤️ → ⭐ → ✖️' });
      for (const b of [etoile, choix]) b.addEventListener('pointerdown', e => e.stopPropagation());
      etoile.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== cur) { allerPhoto(i); return; }
        if (!basculerEtoile(i)) secouer(carte);
      });
      choix.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== cur) { allerPhoto(i); return; }
        changerChoix(i);
      });
      const carte = el('div', { class: 'defil nouvelle' },
        el('div', { class: 'cadre' }, img, choix, etoile,
          el('span', { class: 'tampon tampon-haut', 'aria-hidden': 'true' }, `${SYMBOLES[GARDE]} Je garde`),
          el('span', { class: 'tampon tampon-bas', 'aria-hidden': 'true' }, `${SYMBOLES[PASSE]} Je passe`)));
      carte.indice = i;
      carte.img = img;
      carte.etoile = etoile;
      carte.choix = choix;
      images.mini(p.id, 1).then(url => { if (!carte.grande) img.src = url; }).catch(() => {});
      majCarte(carte);
      return carte;
    }

    function majCarte(carte) {
      const v = etat.votes[photos[carte.indice].id];
      carte.dataset.valeur = estTrie(v) ? v : '';
      carte.choix.textContent = badgeDe(v);
      carte.choix.setAttribute('aria-label', `Choix : ${TEXTES[v] || 'à trier'}. Toucher pour changer.`);
      carte.etoile.classList.toggle('doree', v === COEUR);
      carte.etoile.setAttribute('aria-pressed', v === COEUR ? 'true' : 'false');
    }

    function chargerGrande(carte) {
      if (carte.grande) return;
      images.grande(photos[carte.indice].id, 0).then(async url => {
        const tampon = new Image();
        tampon.src = url;
        try { await tampon.decode(); } catch { /* on affiche quand même */ }
        carte.grande = true;
        carte.img.src = url;
      }).catch(() => {});
    }

    // Place les photos : la courante en grand, les voisines de plus en plus petites, à moitié cachées.
    // « leger » : pendant un défilement rapide, on ne charge pas encore les grandes images.
    function placer(decalage = 0, leger = false) {
      const L = scene.clientWidth;
      const H = scene.clientHeight;
      if (!L || !H) return;
      const maxL = L * (L < H ? 0.8 : 0.6);
      const maxH = H * 0.94;
      const taille = (i, f) => {
        const r = photos[i].largeur / photos[i].hauteur;
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
        if (!silencieux) {
          notifier(p < 0 ? 'C\'est la première photo.' : 'C\'est la dernière photo.', 1500);
        }
        placer();
        return false;
      }
      pos = p;
      cur = ordre[pos];
      placer(0, leger);
      if (!leger) precharger();
      actualiserEntete();
      if (visionneuse) {
        visionneuse.changerPhoto(photos[cur].id, ratioDe(photos[cur]));
        visionneuse.maj(etatVisionneuse());
      }
      return true;
    }

    function allerPhoto(i) {
      const p = ordre.indexOf(i);
      if (p >= 0) allerPos(p);
    }

    // Défilement rapide : plusieurs photos, de plus en plus lentement.
    function arreterInertie() {
      if (!inertie) return;
      clearTimeout(inertie);
      inertie = null;
      scene.style.removeProperty('--duree');
      placer();
      precharger();
    }

    function lancerInertie(sens, nombre) {
      let i = 0;
      const pas = () => {
        const duree = Math.round(45 + 330 * (i / nombre) ** 2);
        scene.style.setProperty('--duree', `${duree}ms`);
        i++;
        const dernier = i >= nombre;
        const ok = allerPos(pos + sens, { leger: !dernier, silencieux: true });
        if (!ok || dernier) {
          inertie = null;
          setTimeout(() => {
            if (inertie) return;
            scene.style.removeProperty('--duree');
            placer();
            precharger();
            if (!ok) notifier(sens < 0 ? 'C\'est la première photo.' : 'C\'est la dernière photo.', 1500);
          }, duree);
          return;
        }
        inertie = setTimeout(pas, duree);
      };
      pas();
    }

    // Défilement selon la longueur du geste (la vitesse ne compte pas) :
    // jusqu'à 4 cm, une photo ; au-delà, 2 photos ; plusieurs grands gestes de suite, 5 photos.
    let dernierGrandGeste = { t: 0, sens: 0 };
    function defilerSelonGeste(sens, distance) {
      if (distance <= CM * 4) {
        dernierGrandGeste = { t: 0, sens: 0 };
        allerPos(pos + sens);
        return;
      }
      const maintenant = performance.now();
      const enSerie = dernierGrandGeste.sens === sens && maintenant - dernierGrandGeste.t < 2000;
      dernierGrandGeste = { t: maintenant, sens };
      lancerInertie(sens, enSerie ? 5 : 2);
    }

    // ❤️ ou ✖️ : on enregistre ; on passe à la suivante seulement si l'option est cochée.
    function choisir(valeur) {
      if (fin || !ordre.length) return;
      const i = cur;
      voter(i, valeur);
      const carte = cartes.get(i);
      if (carte) {
        carte.classList.remove('pulse');
        void carte.offsetWidth;
        carte.classList.add('pulse');
      }
      if (fin || !avanceAuto) return;
      if (!ordre.includes(i)) return; // en mode « retenues », la photo écartée a déjà laissé place à la suivante
      if (pos + 1 < ordre.length) { allerPos(pos + 1); return; }
      if (!seulementRetenues) {
        const j = prochaineATrier(etat, ensembleId, i);
        if (j >= 0) {
          const reste = comptesEnsemble(etat, ensembleId).nonTries;
          notifier(`Il reste ${reste} photo${reste > 1 ? 's' : ''} à trier dans cet ensemble.`);
          allerPhoto(j);
        }
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
    let dernierTap = 0;

    function remettreCentre() {
      const c = cartes.get(cur);
      if (!c) return;
      c.style.transform = c.base;
      c.firstChild.style.setProperty('--o-haut', 0);
      c.firstChild.style.setProperty('--o-bas', 0);
    }

    scene.addEventListener('pointerdown', e => {
      if (fin || (e.pointerType === 'mouse' && e.button !== 0)) return;
      arreterInertie();
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
        if (e.pointerType === 'mouse') { ouvrirGrand(); return; }
        const maintenant = performance.now();
        if (maintenant - dernierTap < 320) { dernierTap = 0; ouvrirGrand(); } else dernierTap = maintenant;
        return;
      }
      if (g.axe === 'h') {
        // Vitesse au moment du lâcher (sur les 100 dernières ms), en pixels par milliseconde.
        const a = g.traces[0];
        const b = g.traces[g.traces.length - 1];
        const v = (b.x - a.x) / Math.max(b.t - a.t, 1);
        const distance = Math.abs(g.dx);
        const lance = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(g.dx);
        if (distance > CM * 0.8 || (lance && distance > 15)) defilerSelonGeste(g.dx < 0 ? 1 : -1, distance);
        else placer();
        return;
      }
      const s = Math.min(110, scene.clientHeight * 0.2);
      const lance = Math.abs(g.dy) / Math.max(duree, 1) > 0.6;
      remettreCentre();
      if (g.dy < -s || (lance && g.dy < -40)) choisir(GARDE);
      else if (g.dy > s || (lance && g.dy > 40)) choisir(PASSE);
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
      afficher() { placer(); precharger(); },
      detruire() { observateurTaille.disconnect(); clearTimeout(inertie); },
      defiler: (sens, distance) => { arreterInertie(); defilerSelonGeste(sens, distance); },
      choisir,
      compteur() {
        if (!ordre.length) return '';
        return seulementRetenues
          ? `Retenue ${pos + 1} / ${ordre.length} · `
          : `Photo ${pos + 1} / ${ordre.length} · `;
      },
      majPhoto(i) {
        const c = cartes.get(i);
        if (c) majCarte(c);
        if (seulementRetenues) {
          const avant = cur;
          calculerOrdre();
          placer();
          if (cur !== avant && visionneuse && ordre.length) visionneuse.changerPhoto(photos[cur].id, ratioDe(photos[cur]));
        }
      },
      clavier(e) {
        const actions = {
          ArrowLeft: () => allerPos(pos - 1),
          ArrowRight: () => allerPos(pos + 1),
          ArrowUp: () => choisir(GARDE),
          ArrowDown: () => choisir(PASSE),
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

  function vueGrille() {
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
    photos.forEach((p, i) => {
      const img = el('img', { alt: '', 'data-id': p.id, decoding: 'async' });
      const pastille = el('button', { class: 'pastille', title: 'Changer le choix' });
      const vignette = el('div', { class: 'vignette' },
        el('button', {
          class: 'ouvrir',
          'aria-label': `Voir la photo ${p.ordre}`,
          onclick: () => {
            cur = i;
            // Une photo non retenue n'apparaît pas en mode « retenues » : on l'ouvre alors en mode « une à une ».
            changerMode(dernierModePhoto === 'retenues' && !estRetenue(etat.votes[p.id]) ? 'photo' : dernierModePhoto);
          },
        }, img),
        el('span', { class: 'etoile-mini', 'aria-hidden': 'true' }, '★'),
        pastille);
      pastille.addEventListener('click', () => changerChoix(i));
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
      vignette.classList.toggle('courante', i === cur);
      pastille.textContent = estTrie(v) ? SYMBOLES[v] : '·';
      pastille.setAttribute('aria-label', `Photo ${photos[i].ordre} : ${TEXTES[v] || 'à trier'}. Toucher pour changer.`);
    }

    const racineVue = el('div', { class: 'vue-grille' },
      el('p', { class: 'aide' }, `Touchez une photo pour la voir en grand. Touchez sa pastille pour changer le choix : · → ${SYMBOLES[GARDE]} → ${SYMBOLES[COEUR]} → ${SYMBOLES[PASSE]} → ·`),
      grille);

    return {
      racine: racineVue,
      afficher() { requestAnimationFrame(() => vignettes[cur]?.scrollIntoView({ block: 'center' })); },
      detruire() { observateur.disconnect(); },
      majPhoto: maj,
      clavier() { return false; },
    };
  }

  // ---------------------------------------------------------------- fin d'ensemble

  function fermerFin() {
    fin?.remove();
    fin = null;
  }

  function terminer() {
    if (fin) return;
    const c = comptesEnsemble(etat, ensembleId);
    const prochain = ensembleAContinuer(etat);
    const principal = prochain
      ? el('button', { class: 'btn-principal', onclick: () => nav.ensemble(prochain, 'photo') }, 'Ensemble suivant')
      : el('button', { class: 'btn-principal', onclick: nav.accueil }, 'Retour à l\'accueil');
    fin = el('div', { class: 'fin-ensemble' },
      el('div', { class: 'fin-carte', role: 'dialog', 'aria-label': 'Ensemble terminé' },
        el('div', { class: 'fin-icone', 'aria-hidden': 'true' }, '🌸'),
        el('h2', {}, 'Ensemble terminé !'),
        el('p', {}, prochain ? encouragement() : 'Vous avez tout trié. Merci beaucoup !'),
        el('p', { class: 'fin-resume' },
          `${SYMBOLES[COEUR]} ${c.coeurs}   ${SYMBOLES[GARDE]}+${SYMBOLES[COEUR]} ${c.gardes + c.coeurs}   ${SYMBOLES[PASSE]} ${c.passes}`),
        principal,
        prochain ? el('button', { class: 'btn-secondaire', onclick: nav.accueil }, 'Pause') : null,
        el('div', { class: 'fin-liens' },
          el('button', { class: 'btn-lien', onclick: () => { fermerFin(); changerMode('retenues'); } }, 'Revoir mes retenues'),
          el('button', { class: 'btn-lien', onclick: fermerFin }, 'Fermer'))));
    racine.append(fin);
    principal.focus();
    confettis();
    for (const b of nouveauxBadges(etat, ctx.jeton)) annoncerBadge(b);
  }

  // ---------------------------------------------------------------- clavier

  function clavier(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (fin) fermerFin(); else nav.accueil();
      return;
    }
    // Dans une zone de texte, les touches servent à écrire (une case à cocher ne bloque rien).
    if (fin || e.target.closest?.('textarea, input:not([type="checkbox"])')) return;
    // Entrée ou espace sur un bouton : laisser le bouton agir.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
    const touche = e.key.toLowerCase();
    if (touche === 'g' || touche === 'r') {
      changerMode(touche === 'r' ? 'retenues' : mode === 'grille' ? dernierModePhoto : 'grille');
      e.preventDefault();
      return;
    }
    if (vue?.clavier(e)) e.preventDefault();
  }
  document.addEventListener('keydown', clavier);

  changerMode(mode);
  return {
    racine,
    detruire() {
      document.removeEventListener('keydown', clavier);
      vue?.detruire();
      visionneuse?.fermer();
    },
  };
}
