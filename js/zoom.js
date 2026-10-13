// Florilège — affichage agrandi d'une photo.
// Téléphone : pincer pour zoomer, glisser pour se déplacer, toucher deux fois pour basculer 1× / 2,5×.
// PC : la photo suit la souris ; molette pour régler le zoom ; clic ou Échap pour fermer.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { el } from './ludique.js';

const ZOOM_INITIAL = 2.5;
const ZOOM_MAX = 6;

export function ouvrirZoom(images, photoId, { x, y, souris = false } = {}) {
  const img = el('img', { alt: 'Photo agrandie', draggable: 'false' });
  const fermer = el('button', { class: 'btn-icone zoom-fermer', 'aria-label': 'Fermer l\'agrandissement' }, '✕');
  const couche = el('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo agrandie' }, img, fermer);
  const precedent = document.activeElement;

  const mini = images.urlSiDisponible(photoId, 'mini');
  const grande = images.urlSiDisponible(photoId, 'grande');
  img.src = grande || mini || '';
  if (!grande) images.grande(photoId, 0).then(url => { img.src = url; }).catch(() => {});

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

  // Mode souris : la photo suit le curseur (bord droit de la photo visible quand le curseur est à droite).
  function suivreSouris(px, py) {
    tx = -(px - L() / 2) * (s - 1);
    ty = -(py - H() / 2) * (s - 1);
    appliquer();
  }

  function detruire() {
    document.removeEventListener('keydown', clavier, true);
    couche.remove();
    precedent?.focus?.();
  }

  function clavier(e) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      detruire();
    }
  }
  document.addEventListener('keydown', clavier, true);
  fermer.addEventListener('click', e => { e.stopPropagation(); detruire(); });

  // ---- gestes
  const pointeurs = new Map();
  let pincement = null;
  let glisse = null;
  let dernierTap = 0;

  couche.addEventListener('pointerdown', e => {
    if (e.target === fermer) return;
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
    if (e.pointerType === 'mouse') { detruire(); return; }
    const maintenant = performance.now();
    if (maintenant - dernierTap < 320) {
      dernierTap = 0;
      if (s > 1.05) { s = 1; tx = 0; ty = 0; appliquer(); } else zoomerVers(ZOOM_INITIAL, e.clientX, e.clientY);
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
  fermer.focus();

  // Ouverture directement zoomée sur le point touché ou cliqué.
  if (x != null) {
    if (souris) { s = ZOOM_INITIAL; suivreSouris(x, y); } else zoomerVers(ZOOM_INITIAL, x, y);
  } else {
    appliquer();
  }
  return { fermer: detruire };
}
