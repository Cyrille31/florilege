// Florilège — manche 1 : examen d'un ensemble, en mode « photo par photo » ou en mode « imagettes ».
// Photo par photo : glisser à gauche ou à droite pour défiler sans rien valider,
// vers le haut pour ❤️ (je garde), vers le bas pour ✖️ (je passe) ;
// l'étoile, dans le coin de la photo, marque un coup de cœur (dorée si choisie).
// Les 3 photos précédentes et suivantes sont visibles de part et d'autre, en plus petit.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import {
  PASSE, GARDE, COEUR, estTrie, photosDe, progressionEnsemble, peutMettreCoeur,
  ensembleAContinuer, valeurSuivante, prochaineATrier, comptesEnsemble,
} from './etat.js';
import { el, notifier, confettis, encouragement, nouveauxBadges, annoncerBadge } from './ludique.js';
import { ouvrirVisionneuse } from './zoom.js';
import { CONFIG } from './config.js';
import { lireStockage, ecrireStockage } from './stockage.js';

export const SYMBOLES = { [PASSE]: '✖️', [GARDE]: '❤️', [COEUR]: '⭐' };
const TEXTES = { [PASSE]: '✖️ Je passe', [GARDE]: '❤️ Je garde', [COEUR]: '❤️ ⭐ Coup de cœur' };
const VOISINS = 3;
const ECHELLES = [1, 0.55, 0.4, 0.3]; // taille des photos selon leur distance à la photo centrale
const CLE_MODE = 'florilege-mode';

function badgeDe(v) {
  return v === PASSE ? SYMBOLES[PASSE] : v === GARDE || v === COEUR ? SYMBOLES[GARDE] : '';
}

export function ecranEnsemble(ctx, ensembleId, nav, options = {}) {
  const { etat, images } = ctx;
  const ens = etat.ensembles.find(e => e.id === ensembleId);
  const photos = photosDe(etat, ensembleId);
  const max = etat.config.max_coups_de_coeur ?? 4;
  let mode = options.mode || lireStockage(CLE_MODE, 'photo');
  let cur = options.index ?? Math.max(0, prochaineATrier(etat, ensembleId, -1));
  let etaitTermine = progressionEnsemble(etat, ensembleId).statut === 'termine';
  let fin = null;
  let visionneuse = null;
  let vue = null; // vue affichée : { racine, detruire, majPhoto(i), clavier(e) }

  images.minis(photos.map(p => p.id), 1);

  // ---- entête commun
  const compteur = el('div', { class: 'tri-compteur' });
  const btnMode = el('button', { class: 'btn-mode', onclick: () => changerMode(mode === 'photo' ? 'grille' : 'photo') });
  const stats = el('div', { class: 'tri-stats' });
  const barre = el('span');
  const corps = el('div', { class: 'tri-corps' });
  const racine = el('section', { class: 'ecran ecran-tri' },
    el('header', { class: 'tri-entete' },
      el('button', { class: 'btn-icone', 'aria-label': 'Retour à l\'accueil', title: 'Accueil (Échap)', onclick: nav.accueil }, '‹'),
      el('div', { class: 'tri-infos' }, el('div', { class: 'tri-titre' }, ens.nom), compteur),
      btnMode),
    stats,
    el('div', { class: 'barre-progression' }, barre),
    corps);

  function actualiserEntete() {
    const c = comptesEnsemble(etat, ensembleId);
    const triees = photos.length - c.nonTries;
    compteur.textContent = mode === 'photo'
      ? `Photo ${cur + 1} / ${photos.length} · ${triees} triée${triees > 1 ? 's' : ''}`
      : `${triees} / ${photos.length} triée${triees > 1 ? 's' : ''}`;
    stats.replaceChildren(
      el('span', { class: `pilule${c.coeurs >= max ? ' plein' : ''}`, title: 'Coups de cœur utilisés' }, `⭐ ${c.coeurs}/${max}`),
      el('span', { class: 'pilule', title: 'Photos gardées (❤️ et ⭐)' }, `❤️+⭐ ${c.gardes + c.coeurs}`),
      el('span', { class: 'pilule', title: 'Photos écartées' }, `✖️ ${c.passes}`),
      c.nonTries ? el('span', { class: 'pilule discrete', title: 'Photos sans choix' }, `${c.nonTries} à trier`) : null);
    barre.style.width = `${photos.length ? 100 * triees / photos.length : 0}%`;
    btnMode.textContent = mode === 'photo' ? '▦ Imagettes' : '▢ Photo par photo';
    btnMode.setAttribute('aria-label', mode === 'photo' ? 'Afficher les imagettes' : 'Afficher photo par photo');
  }

  // ---- enregistrement d'un choix (commun aux deux modes)

  function voter(i, valeur) {
    ctx.voter(photos[i].id, valeur);
    actualiserEntete();
    vue?.majPhoto(i);
    if (visionneuse && i === cur) visionneuse.majChoix(TEXTES[valeur] || 'À trier');
    const termine = progressionEnsemble(etat, ensembleId).statut === 'termine';
    if (termine && !etaitTermine) terminer();
    etaitTermine = termine;
  }

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

  function effacer(i = cur) {
    if (!estTrie(etat.votes[photos[i].id])) {
      notifier('Cette photo n\'a pas encore de choix.');
      return;
    }
    voter(i, null);
    notifier('Choix effacé : la photo est de nouveau « à trier ».');
  }

  function ouvrirGrand() {
    if (visionneuse) return;
    visionneuse = ouvrirVisionneuse(images, photos[cur].id, { surFermeture: () => { visionneuse = null; } });
    visionneuse.majChoix(TEXTES[etat.votes[photos[cur].id]] || 'À trier');
  }

  function changerMode(m) {
    mode = m;
    ecrireStockage(CLE_MODE, m);
    vue?.detruire();
    vue = m === 'photo' ? vuePhoto() : vueGrille();
    corps.replaceChildren(vue.racine);
    actualiserEntete();
    vue.afficher?.();
  }

  // ---------------------------------------------------------------- mode photo par photo

  function vuePhoto() {
    const scene = el('div', { class: 'scene' });
    const cartes = new Map(); // indice → élément
    const racineVue = el('div', { class: 'vue-photo' },
      el('div', { class: 'scene-cadre' },
        scene,
        el('button', { class: 'nav-photo gauche', 'aria-label': 'Photo précédente', title: 'Photo précédente (←)', onclick: () => aller(cur - 1) }, '‹'),
        el('button', { class: 'nav-photo droite', 'aria-label': 'Photo suivante', title: 'Photo suivante (→)', onclick: () => aller(cur + 1) }, '›')),
      el('div', { class: 'tri-actions' },
        el('button', { class: 'btn-rond petit', 'aria-label': 'Effacer le choix de cette photo', title: 'Effacer le choix (Suppr)', onclick: () => effacer() }, '⌫'),
        el('button', { class: 'btn-rond passe', 'aria-label': 'Je passe', title: 'Je passe (↓)', onclick: () => choisir(PASSE) }, SYMBOLES[PASSE]),
        el('button', { class: 'btn-rond garde', 'aria-label': 'Je garde', title: 'Je garde (↑)', onclick: () => choisir(GARDE) }, SYMBOLES[GARDE]),
        el('button', { class: 'btn-rond petit', 'aria-label': 'Voir en grand', title: 'Voir en grand (clic sur la photo, ou Entrée)', onclick: ouvrirGrand }, '🔍')),
      el('p', { class: 'aide-clavier' },
        'Clavier : ← → défiler · ↑ je garde · ↓ je passe · E coup de cœur · Suppr effacer · Entrée ou clic : voir en grand'));

    function creerCarte(i) {
      const p = photos[i];
      const img = el('img', { alt: `Photo ${p.ordre} sur ${photos.length} — ${ens.nom}`, draggable: 'false' });
      const etoile = el('button', { class: 'etoile', 'aria-label': 'Coup de cœur', title: 'Coup de cœur (E)' }, '★');
      etoile.addEventListener('pointerdown', e => e.stopPropagation());
      etoile.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== cur) { aller(i); return; }
        if (!basculerEtoile(i)) secouer(carte);
      });
      const carte = el('div', { class: 'defil nouvelle' },
        el('div', { class: 'cadre' }, img,
          el('span', { class: 'choix', 'aria-hidden': 'true' }),
          etoile,
          el('span', { class: 'tampon tampon-haut', 'aria-hidden': 'true' }, `${SYMBOLES[GARDE]} Je garde`),
          el('span', { class: 'tampon tampon-bas', 'aria-hidden': 'true' }, `${SYMBOLES[PASSE]} Je passe`)));
      carte.indice = i;
      carte.img = img;
      carte.etoile = etoile;
      images.mini(p.id, 1).then(url => { if (!carte.grande) img.src = url; }).catch(() => {});
      majCarte(carte);
      return carte;
    }

    function majCarte(carte) {
      const v = etat.votes[photos[carte.indice].id];
      carte.dataset.valeur = estTrie(v) ? v : '';
      carte.querySelector('.choix').textContent = badgeDe(v);
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

    // Place les photos : la centrale en grand, les voisines de plus en plus petites, à moitié cachées.
    function placer(decalage = 0) {
      const L = scene.clientWidth;
      const H = scene.clientHeight;
      if (!L || !H) return;
      const maxL = L * (L < H ? 0.8 : 0.6);
      const maxH = H * 0.96;
      const taille = (i, f) => {
        const r = photos[i].largeur / photos[i].hauteur;
        let w = maxL * f;
        let h = w / r;
        if (h > maxH * f) { h = maxH * f; w = h * r; }
        return { w, h };
      };

      // Cartes à afficher : la centrale et jusqu'à 3 de chaque côté.
      const voulues = new Map();
      for (let k = -VOISINS; k <= VOISINS; k++) {
        const i = cur + k;
        if (i >= 0 && i < photos.length) voulues.set(i, k);
      }
      for (const [i, carte] of cartes) {
        if (!voulues.has(i)) { carte.remove(); cartes.delete(i); }
      }

      const positions = new Map([[cur, 0]]);
      for (const sens of [1, -1]) {
        let x = 0;
        let demiPrecedent = taille(cur, 1).w / 2;
        for (let k = 1; k <= VOISINS; k++) {
          const i = cur + sens * k;
          if (!voulues.has(i)) break;
          x += demiPrecedent;
          positions.set(i, sens * x);
          demiPrecedent = taille(i, ECHELLES[k]).w / 2;
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
      const centre = cartes.get(cur);
      if (centre) chargerGrande(centre);
    }

    function precharger() {
      for (let k = 1; k <= CONFIG.prechargementAvance; k++) {
        if (cur + k < photos.length) images.grande(photos[cur + k].id, k).catch(() => {});
      }
      if (cur > 0) images.grande(photos[cur - 1].id, 3).catch(() => {});
    }

    function aller(i) {
      if (i < 0 || i >= photos.length) {
        notifier(i < 0 ? 'C\'est la première photo de l\'ensemble.' : 'C\'est la dernière photo de l\'ensemble.', 1500);
        placer();
        return;
      }
      cur = i;
      placer();
      precharger();
      actualiserEntete();
      if (visionneuse) {
        visionneuse.changerPhoto(photos[cur].id);
        visionneuse.majChoix(TEXTES[etat.votes[photos[cur].id]] || 'À trier');
      }
    }

    // ❤️ ou ✖️ : on enregistre puis on passe à la photo suivante.
    function choisir(valeur) {
      if (fin) return;
      const i = cur;
      voter(i, valeur);
      cartes.get(i)?.classList.add('pulse');
      setTimeout(() => cartes.get(i)?.classList.remove('pulse'), 400);
      if (fin) { placer(); return; }
      if (i + 1 < photos.length) { aller(i + 1); return; }
      const j = prochaineATrier(etat, ensembleId, i);
      if (j >= 0) {
        const reste = comptesEnsemble(etat, ensembleId).nonTries;
        notifier(`Il reste ${reste} photo${reste > 1 ? 's' : ''} à trier dans cet ensemble.`);
        aller(j);
      } else {
        placer();
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
      geste = { x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0, axe: null, cible: e.target.closest('.defil') };
    });

    scene.addEventListener('pointermove', e => {
      if (!geste || !pointeurs.has(e.pointerId)) return;
      geste.dx = e.clientX - geste.x0;
      geste.dy = e.clientY - geste.y0;
      if (!geste.axe && Math.hypot(geste.dx, geste.dy) > 10) {
        geste.axe = Math.abs(geste.dx) >= Math.abs(geste.dy) ? 'h' : 'v';
        scene.classList.add('glisse');
      }
      if (geste.axe === 'h') {
        placer(geste.dx);
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
      const vitesse = Math.hypot(g.dx, g.dy) / Math.max(duree, 1);
      const lance = vitesse > 0.6;

      if (!g.axe) {
        // Simple toucher ou clic.
        if (g.cible && g.cible.indice !== cur) { aller(g.cible.indice); return; }
        if (!g.cible) return;
        if (e.pointerType === 'mouse') { ouvrirGrand(); return; }
        const maintenant = performance.now();
        if (maintenant - dernierTap < 320) { dernierTap = 0; ouvrirGrand(); } else dernierTap = maintenant;
        return;
      }
      if (g.axe === 'h') {
        const s = Math.min(90, scene.clientWidth * 0.18);
        if (g.dx < -s || (lance && g.dx < -40)) aller(cur + 1);
        else if (g.dx > s || (lance && g.dx > 40)) aller(cur - 1);
        else placer();
        return;
      }
      const s = Math.min(110, scene.clientHeight * 0.2);
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

    return {
      racine: racineVue,
      afficher() { placer(); precharger(); },
      detruire() { observateurTaille.disconnect(); },
      majPhoto(i) { const c = cartes.get(i); if (c) majCarte(c); },
      clavier(e) {
        const actions = {
          ArrowLeft: () => aller(cur - 1),
          ArrowRight: () => aller(cur + 1),
          ArrowUp: () => choisir(GARDE),
          ArrowDown: () => choisir(PASSE),
          e: () => { if (!basculerEtoile()) secouer(cartes.get(cur)); },
          '*': () => basculerEtoile(),
          Delete: () => effacer(),
          Backspace: () => effacer(),
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
        el('button', { class: 'ouvrir', 'aria-label': `Voir la photo ${p.ordre}`, onclick: () => { cur = i; changerMode('photo'); } }, img),
        el('span', { class: 'etoile-mini', 'aria-hidden': 'true' }, '★'),
        pastille);
      pastille.addEventListener('click', () => {
        const v = valeurSuivante(etat.votes[p.id], peutMettreCoeur(etat, ensembleId, p.id));
        voter(i, v);
      });
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
      afficher() { vignettes[cur]?.scrollIntoView({ block: 'center' }); },
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
          mode === 'photo'
            ? el('button', { class: 'btn-lien', onclick: () => { fermerFin(); changerMode('grille'); } }, 'Voir les imagettes')
            : null,
          el('button', { class: 'btn-lien', onclick: fermerFin }, 'Revoir les photos'))));
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
    if (fin || e.target.closest?.('input, textarea')) return;
    // Entrée sur un bouton : laisser le bouton agir.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
    if (e.key === 'g' || e.key === 'G') {
      changerMode(mode === 'photo' ? 'grille' : 'photo');
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
