// Florilège — aspects ludiques : carte des ensembles, jauge collective, badges,
// messages d'encouragement, confettis, petites notifications.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { progressionEnsemble, progressionGlobale, ensemblesTries, photosDe } from './etat.js?v=0.6.1';
import { lireStockage, ecrireStockage } from './stockage.js?v=0.6.1';

// Les huit teintes des pétales de l'icône.
export const TEINTES = ['#ff6f61', '#ff9a3d', '#f4a623', '#5cbf4a', '#22a8c4', '#3d8bfd', '#8e5cf7', '#e85aa7'];

const animationsReduites = matchMedia('(prefers-reduced-motion: reduce)');

export function el(balise, attributs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [k, v] of Object.entries(attributs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) {
    if (e == null || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

// ---------------------------------------------------------------- carte des ensembles

export function carteEnsembles(etat, images, surChoix) {
  const grille = el('div', { class: 'carte' });
  ensemblesTries(etat).forEach((ens, i) => {
    const pr = progressionEnsemble(etat, ens.id);
    const teinte = TEINTES[i % TEINTES.length];
    const photos = photosDe(etat, ens.id);
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    if (photos.length) {
      images.mini(photos[0].id, 2).then(url => { img.src = url; }).catch(() => {});
    }
    const pourcent = pr.total ? Math.round(100 * pr.faits / pr.total) : 0;
    const libelle = pr.statut === 'termine' ? 'terminé' : pr.statut === 'vide' ? 'à trier' : `${pr.faits} / ${pr.total}`;
    grille.append(el('button', {
      class: 'tuile',
      'data-statut': pr.statut,
      style: `--teinte:${teinte}`,
      'aria-label': `${ens.nom} : ${libelle}`,
      onclick: () => surChoix(ens.id),
    },
    el('span', { class: 'tuile-image' }, img),
    pr.statut === 'termine' ? el('span', { class: 'tuile-coche', 'aria-hidden': 'true' }, '✓') : null,
    el('span', { class: 'tuile-nom' }, ens.nom),
    el('span', { class: 'tuile-barre', 'aria-hidden': 'true' }, el('span', { style: `width:${pourcent}%` })),
    el('span', { class: 'tuile-etat' }, libelle),
    ));
  });
  return grille;
}

// ---------------------------------------------------------------- jauge collective

export function jaugeCollective(etat) {
  const { faits, total } = etat.collectif || { faits: 0, total: 0 };
  const pourcent = total ? Math.round(100 * faits / total) : 0;
  return el('div', { class: 'jauge', role: 'img', 'aria-label': `Progression du groupe : ${pourcent} %` },
    el('div', { class: 'jauge-texte' }, `Ensemble, nous avons trié ${pourcent} % des photos`),
    el('div', { class: 'jauge-barre' }, el('span', { style: `width:${pourcent}%` })),
  );
}

// ---------------------------------------------------------------- messages

const ENCOURAGEMENTS = [
  'Joli travail !',
  'Et un ensemble de plus !',
  'Bel œil !',
  'Bravo, c\'est dans la boîte.',
  'Merci, ça avance bien.',
  'Excellent choix… on suppose !',
  'Voilà qui est fait.',
];

export function encouragement() {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

// ---------------------------------------------------------------- badges (manche 1)

const BADGES = [
  { id: 'premier', titre: 'Premier ensemble trié', icone: '🌱', test: g => g.termines >= 1 },
  { id: 'moitie', titre: 'La moitié des ensembles triés', icone: '🌿', test: g => g.nbEnsembles > 1 && g.termines >= g.nbEnsembles / 2 },
  { id: 'tout', titre: 'Tout trié !', icone: '🌸', test: g => g.nbEnsembles > 0 && g.termines === g.nbEnsembles },
];

export function badgesObtenus(etat) {
  const g = progressionGlobale(etat);
  return BADGES.filter(b => b.test(g));
}

// Renvoie les badges obtenus depuis la dernière fois (mémorisé sur l'appareil).
export function nouveauxBadges(etat, jeton) {
  const cle = `florilege-badges-${jeton}`;
  const vus = new Set(lireStockage(cle, []));
  const obtenus = badgesObtenus(etat);
  const nouveaux = obtenus.filter(b => !vus.has(b.id));
  if (nouveaux.length) ecrireStockage(cle, obtenus.map(b => b.id));
  return nouveaux;
}

export function rangeeBadges(etat) {
  const obtenus = new Set(badgesObtenus(etat).map(b => b.id));
  return el('div', { class: 'badges' },
    el('span', { class: 'badges-titre' }, `Mes badges (${obtenus.size}/${BADGES.length})`),
    BADGES.map(b => {
      const texte = `${b.icone} ${b.titre}${obtenus.has(b.id) ? ' : obtenu !' : ' : pas encore obtenu'}`;
      return el('button', {
        class: `badge${obtenus.has(b.id) ? ' obtenu' : ''}`,
        title: texte,
        'aria-label': texte,
        onclick: () => notifier(texte),
      }, b.icone);
    }));
}

// ---------------------------------------------------------------- animations

export function confettis(nombre = 70) {
  if (animationsReduites.matches) return;
  const couche = el('div', { class: 'confettis', 'aria-hidden': 'true' });
  for (let i = 0; i < nombre; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 45;
    couche.append(el('i', {
      style: [
        `--c:${TEINTES[i % TEINTES.length]}`,
        `--dx:${Math.cos(angle) * distance}vmin`,
        `--dy:${Math.sin(angle) * distance - 20}vmin`,
        `--r:${Math.round(Math.random() * 720 - 360)}deg`,
        `--d:${(0.9 + Math.random() * 0.9).toFixed(2)}s`,
      ].join(';'),
    }));
  }
  document.body.append(couche);
  setTimeout(() => couche.remove(), 2200);
}

let minuteurNotif = null;
export function notifier(texte, duree = 2600) {
  let zone = document.getElementById('notification');
  if (!zone) {
    zone = el('div', { id: 'notification', role: 'status', 'aria-live': 'polite' });
    document.body.append(zone);
  }
  zone.textContent = texte;
  zone.classList.add('visible');
  clearTimeout(minuteurNotif);
  minuteurNotif = setTimeout(() => zone.classList.remove('visible'), duree);
}

export function annoncerBadge(badge) {
  notifier(`${badge.icone} Badge obtenu : ${badge.titre}`, 3500);
}
