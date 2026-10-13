// Florilège — visionneuse : la photo en grand, en plein écran si l'appareil le permet.
// Téléphone : pincer pour zoomer, glisser pour se déplacer, toucher deux fois pour basculer 1× / 2,5×.
// PC : clic pour zoomer (la photo suit alors la souris), nouveau clic pour revenir ; molette pour régler.
// Les touches du clavier (photo précédente / suivante, choix) restent actives : l'écran appelant
// met la visionneuse à jour avec changerPhoto() et majChoix().
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { el } from './ludique.js';

const ZOOM_INITIAL = 2.5;
const ZOOM_MAX = 6;

function pleinEcranPossible() {
  return !!(document.documentElement.requestFullscreen && document.fullscreenEnabled);
}

export function ouvrirVisionneuse(images, photoId, { surFermeture } = {}) {
  const img = el('img', { alt: 'Photo agrandie', draggable: 'false' });
  const choix = el('span', { class: 'visionneuse-choix', 'aria-live': 'polite' });
  const fermer = el('button', { class: 'btn-icone visionneuse-fermer', 'aria-label': 'Fermer (Échap)', title: 'Fermer (Échap)' }, '✕');
  const couche = el('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo agrandie' }, img, choix, fermer);
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
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
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

  function changerPhoto(id) {
    photoId = id;
    reinitialiser();
    const grande = images.urlSiDisponible(id, 'grande');
    img.src = grande || images.urlSiDisponible(id, 'mini') || '';
    if (!grande) images.grande(id, 0).then(url => { if (photoId === id) img.src = url; }).catch(() => {});
  }

  function majChoix(texte) {
    choix.textContent = texte || '';
    choix.hidden = !texte;
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
  fermer.addEventListener('pointerdown', e => e.stopPropagation());

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
    const immobile = Math.hypot(e.clientX - glisse.x0, e.clientY - glisse.y0) < 10
      && performance.now() - glisse.t0 < 350;
    glisse = null;
    if (!immobile) return;
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
  changerPhoto(photoId);
  majChoix('');
  fermer.focus();
  if (pleinEcranPossible()) {
    pleinEcranDemande = true;
    document.documentElement.requestFullscreen().catch(() => { pleinEcranDemande = false; });
  }
  return { fermer: detruire, changerPhoto, majChoix };
}
