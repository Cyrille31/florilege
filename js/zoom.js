// Florilège — visionneuse : la photo en grand, en plein écran si l'appareil le permet.
// Téléphone : pincer pour zoomer, glisser pour se déplacer, toucher deux fois pour basculer 1× / 2,5×.
// PC : clic pour zoomer (la photo suit alors la souris), nouveau clic pour revenir ; molette pour régler.
// Les touches du clavier (flèches, E…) restent actives. Sans zoom, on peut aussi glisser :
// gauche / droite pour défiler, haut pour ❤️, bas pour ✖️ ; une barre de boutons fait de même.
// L'écran appelant fournit les actions et met la visionneuse à jour avec changerPhoto() et maj().
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { el } from './ludique.js?v=0.8.0';

const ZOOM_INITIAL = 2.5;
const ZOOM_MAX = 6;

function pleinEcranPossible() {
  return !!(document.documentElement.requestFullscreen && document.fullscreenEnabled);
}

// actions : { defiler(sens, distance), garder(), passer(), haut(), bas(), etoile() }
// (garder / passer : boutons ❤️ ✖️ ; haut / bas : gestes, qui montent ou descendent d'un cran)
export function ouvrirVisionneuse(images, photoId, { surFermeture, actions = {}, ratio } = {}) {
  const img = el('img', { alt: 'Photo agrandie', draggable: 'false' });
  // Cadre aux proportions de la photo : il porte le pourtour de couleur du choix.
  const cadre = el('div', { class: 'zoom-cadre' }, img);
  const choix = el('span', { class: 'visionneuse-choix', 'aria-live': 'polite' });
  const compteur = el('span', { class: 'visionneuse-compteur' });
  const fermer = el('button', { class: 'btn-icone visionneuse-fermer', 'aria-label': 'Fermer (Échap)', title: 'Fermer (Échap)' }, '✕');
  const bouton = (libelle, titre, fn, classe = '') => el('button', { class: `btn-visionneuse ${classe}`, 'aria-label': titre, title: titre, onclick: e => { e.stopPropagation(); fn?.(); } }, libelle);
  const etoile = bouton('★', 'Coup de cœur (E)', actions.etoile, 'etoile-visionneuse');
  const barre = el('div', { class: 'visionneuse-barre' },
    bouton('✖️', 'Je passe (↓)', actions.passer),
    bouton('‹', 'Photo précédente (←)', () => actions.defiler?.(-1, 0), 'fleche'),
    etoile,
    bouton('›', 'Photo suivante (→)', () => actions.defiler?.(1, 0), 'fleche'),
    bouton('❤️', 'Je garde (↑)', actions.garder));
  const couche = el('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo agrandie' },
    cadre, el('div', { class: 'visionneuse-haut' }, choix, compteur), fermer, barre);
  for (const b of [fermer, ...barre.children]) b.addEventListener('pointerdown', e => e.stopPropagation());
  const precedent = document.activeElement;
  let pleinEcranDemande = false;
  let ferme = false;

  let s = 1;
  let tx = 0;
  let ty = 0;
  const L = () => couche.clientWidth;
  const H = () => couche.clientHeight;

  function borner() {
    s = Math.min(ZOOM_MAX, Math.max(1, s));
    const mx = (s - 1) * L() / 2;
    const my = (s - 1) * H() / 2;
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }

  function appliquer() {
    borner();
    cadre.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    couche.classList.toggle('zoome', s > 1.01);
  }

  function reinitialiser() {
    s = 1; tx = 0; ty = 0;
    appliquer();
  }

  // Zoome en gardant le point (px, py) de l'écran immobile.
  function zoomerVers(nouveau, px, py) {
    const cx = px - L() / 2;
    const cy = py - H() / 2;
    const ancien = s;
    s = Math.min(ZOOM_MAX, Math.max(1, nouveau));
    tx = cx - (cx - tx) * s / ancien;
    ty = cy - (cy - ty) * s / ancien;
    appliquer();
  }

  // Souris : la photo suit le curseur (bord droit de la photo visible quand le curseur est à droite).
  function suivreSouris(px, py) {
    tx = -(px - L() / 2) * (s - 1);
    ty = -(py - H() / 2) * (s - 1);
    appliquer();
  }

  function changerPhoto(id, ratio) {
    photoId = id;
    if (ratio) cadre.style.setProperty('--ratio', ratio);
    reinitialiser();
    const grande = images.urlSiDisponible(id, 'grande');
    img.src = grande || images.urlSiDisponible(id, 'mini') || '';
    if (!grande) images.grande(id, 0).then(url => { if (photoId === id) img.src = url; }).catch(() => {});
  }

  // etat : { choix: texte, valeur: 0|1|2|null, coeur: booléen, compteur: texte }
  function maj({ choix: texte, valeur, coeur, compteur: tc } = {}) {
    if (valeur !== undefined) cadre.dataset.valeur = valeur ?? '';
    if (texte !== undefined) { choix.textContent = texte || ''; choix.hidden = !texte; }
    if (coeur !== undefined) etoile.classList.toggle('doree', !!coeur);
    if (tc !== undefined) compteur.textContent = tc;
  }

  function detruire() {
    if (ferme) return;
    ferme = true;
    document.removeEventListener('keydown', clavier, true);
    document.removeEventListener('fullscreenchange', surPleinEcran);
    if (pleinEcranDemande && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    couche.remove();
    precedent?.focus?.();
    surFermeture?.();
  }

  // Quitter le plein écran (touche Échap du navigateur) ferme aussi la visionneuse.
  function surPleinEcran() {
    if (pleinEcranDemande && !document.fullscreenElement) detruire();
  }

  function clavier(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      detruire();
    }
  }
  document.addEventListener('keydown', clavier, true);
  document.addEventListener('fullscreenchange', surPleinEcran);
  fermer.addEventListener('click', e => { e.stopPropagation(); detruire(); });

  // ---- gestes
  const pointeurs = new Map();
  let pincement = null;
  let glisse = null;
  let dernierTap = 0;

  couche.addEventListener('pointerdown', e => {
    couche.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      pincement = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      glisse = null;
    } else if (pointeurs.size === 1) {
      glisse = { x: e.clientX, y: e.clientY, tx, ty, x0: e.clientX, y0: e.clientY, t0: performance.now() };
    }
  });

  couche.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && !pointeurs.size) {
      if (s > 1) suivreSouris(e.clientX, e.clientY);
      return;
    }
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pincement && pointeurs.size >= 2) {
      const [a, b] = [...pointeurs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      tx += mx - pincement.mx;
      ty += my - pincement.my;
      pincement.mx = mx;
      pincement.my = my;
      zoomerVers(pincement.s0 * d / pincement.d0, mx, my);
    } else if (glisse && e.pointerType !== 'mouse') {
      if (s <= 1.01) {
        // Sans zoom : la photo suit un peu le doigt, pour montrer le geste (défiler ou choisir).
        cadre.style.transform = `translate(${(e.clientX - glisse.x) * 0.6}px, ${(e.clientY - glisse.y) * 0.6}px)`;
        return;
      }
      tx = glisse.tx + e.clientX - glisse.x;
      ty = glisse.ty + e.clientY - glisse.y;
      appliquer();
    }
  });

  function finPointeur(e) {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) pincement = null;
    if (!glisse || e.type === 'pointercancel') { glisse = null; return; }
    const dx = e.clientX - glisse.x0;
    const dy = e.clientY - glisse.y0;
    const immobile = Math.hypot(dx, dy) < 10 && performance.now() - glisse.t0 < 350;
    glisse = null;
    if (!immobile) {
      if (e.pointerType === 'mouse' || s > 1.01) return;
      appliquer();
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) actions.defiler?.(dx < 0 ? 1 : -1, Math.abs(dx));
      else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) (dy < 0 ? actions.haut : actions.bas)?.();
      return;
    }
    if (e.pointerType === 'mouse') {
      if (s > 1.01) reinitialiser();
      else { s = ZOOM_INITIAL; suivreSouris(e.clientX, e.clientY); }
      return;
    }
    const maintenant = performance.now();
    if (maintenant - dernierTap < 320) {
      dernierTap = 0;
      if (s > 1.01) reinitialiser(); else zoomerVers(ZOOM_INITIAL, e.clientX, e.clientY);
    } else {
      dernierTap = maintenant;
    }
  }
  couche.addEventListener('pointerup', finPointeur);
  couche.addEventListener('pointercancel', finPointeur);

  couche.addEventListener('wheel', e => {
    e.preventDefault();
    zoomerVers(s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });

  document.body.append(couche);
  changerPhoto(photoId, ratio);
  maj({ choix: '' });
  fermer.focus();
  if (pleinEcranPossible()) {
    pleinEcranDemande = true;
    document.documentElement.requestFullscreen().catch(() => { pleinEcranDemande = false; });
  }
  return { fermer: detruire, changerPhoto, maj };
}
