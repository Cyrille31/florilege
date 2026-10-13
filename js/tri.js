// Florilège — manche 1 : tri éclair (une photo à la fois, trois choix) et grille de revue.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import {
  PASSE, GARDE, COEUR, estTrie, photosDe, progressionEnsemble, peutMettreCoeur,
  ensembleAContinuer, valeurSuivante,
} from './etat.js';
import { el, notifier, confettis, encouragement, nouveauxBadges, annoncerBadge } from './ludique.js';
import { ouvrirZoom } from './zoom.js';
import { CONFIG } from './config.js';

export const SYMBOLES = { [PASSE]: '✖️', [GARDE]: '❤️', [COEUR]: '⭐' };

// Affiche la miniature tout de suite, puis la grande image dès qu'elle est prête.
function chargerImage(images, img, photoId) {
  let grandeAffichee = false;
  const mini = images.urlSiDisponible(photoId, 'mini');
  if (mini) img.src = mini;
  else images.mini(photoId, 0).then(url => { if (!grandeAffichee) img.src = url; }).catch(() => {});
  images.grande(photoId, 0).then(async url => {
    const tampon = new Image();
    tampon.src = url;
    try { await tampon.decode(); } catch { /* on affiche quand même */ }
    grandeAffichee = true;
    img.src = url;
  }).catch(() => {});
}

// ---------------------------------------------------------------- écran de tri

export function ecranTri(ctx, ensembleId, nav) {
  const { etat, images } = ctx;
  const ens = etat.ensembles.find(e => e.id === ensembleId);
  const photos = photosDe(etat, ensembleId);
  const max = etat.config.max_coups_de_coeur ?? 4;
  const pile = [];     // choix annulables : { photoId, avant }
  let carte = null;    // carte affichée
  let suivante = null; // carte visible derrière
  let fin = null;      // panneau de fin d'ensemble

  images.minis(photos.map(p => p.id), 1);

  const compteur = el('div', { class: 'tri-compteur' });
  const coeurs = el('div', { class: 'tri-coeurs', title: 'Coups de cœur utilisés dans cet ensemble' });
  const barre = el('span');
  const scene = el('div', { class: 'scene' });
  const btnAnnuler = el('button', { class: 'btn-rond petit', 'aria-label': 'Annuler le dernier choix', title: 'Annuler (Retour arrière)', onclick: annuler }, '↶');
  const btnCoeur = el('button', { class: 'btn-rond coeur', 'aria-label': 'Coup de cœur', title: 'Coup de cœur (↑)', onclick: () => choisir(COEUR) }, SYMBOLES[COEUR]);
  const racine = el('section', { class: 'ecran ecran-tri' },
    el('header', { class: 'tri-entete' },
      el('button', { class: 'btn-icone', 'aria-label': 'Retour à l\'accueil', title: 'Accueil (Échap)', onclick: nav.accueil }, '‹'),
      el('div', { class: 'tri-infos' }, el('div', { class: 'tri-titre' }, ens.nom), compteur),
      coeurs),
    el('div', { class: 'barre-progression' }, barre),
    scene,
    el('div', { class: 'tri-actions' },
      btnAnnuler,
      el('button', { class: 'btn-rond passe', 'aria-label': 'Je passe', title: 'Je passe (←)', onclick: () => choisir(PASSE) }, SYMBOLES[PASSE]),
      btnCoeur,
      el('button', { class: 'btn-rond garde', 'aria-label': 'Je garde', title: 'Je garde (→)', onclick: () => choisir(GARDE) }, SYMBOLES[GARDE]),
      el('button', { class: 'btn-rond petit', 'aria-label': 'Agrandir la photo', title: 'Agrandir (clic sur la photo)', onclick: () => zoomer() }, '🔍'),
    ),
    el('p', { class: 'aide-clavier' }, 'Clavier : ← je passe · → je garde · ↑ coup de cœur · Retour arrière : annuler · clic : agrandir'));

  function nonTriees(n) {
    const res = [];
    for (const p of photos) {
      if (!estTrie(etat.votes[p.id])) res.push(p);
      if (res.length >= n) break;
    }
    return res;
  }

  function actualiserEntete() {
    const pr = progressionEnsemble(etat, ensembleId);
    compteur.textContent = `${Math.min(pr.faits + 1, pr.total)} / ${pr.total}`;
    coeurs.textContent = `${SYMBOLES[COEUR]} ${pr.coeurs}/${max}`;
    coeurs.classList.toggle('plein', pr.coeurs >= max);
    btnCoeur.classList.toggle('epuise', pr.coeurs >= max);
    barre.style.width = `${pr.total ? 100 * pr.faits / pr.total : 0}%`;
    btnAnnuler.disabled = !pile.length;
  }

  function creerCarte(photo, derriere) {
    const img = el('img', { alt: `Photo ${photo.ordre} sur ${photos.length} — ${ens.nom}`, draggable: 'false' });
    const cadre = el('div', { class: 'cadre', style: `--ratio:${photo.largeur}/${photo.hauteur}` }, img,
      el('span', { class: 'tampon tampon-passe', 'aria-hidden': 'true' }, `${SYMBOLES[PASSE]} Je passe`),
      el('span', { class: 'tampon tampon-garde', 'aria-hidden': 'true' }, `${SYMBOLES[GARDE]} Je garde`),
      el('span', { class: 'tampon tampon-coeur', 'aria-hidden': 'true' }, `${SYMBOLES[COEUR]} Coup de cœur`));
    const n = el('div', { class: `carte-photo${derriere ? ' derriere' : ''}` }, cadre);
    n.photoId = photo.id;
    chargerImage(images, img, photo.id);
    return n;
  }

  // Met en place la carte courante et celle de derrière ; lance le préchargement.
  function avancer() {
    actualiserEntete();
    const liste = nonTriees(CONFIG.prechargementAvance + 1);
    if (!liste.length) {
      if (suivante) { suivante.remove(); suivante = null; }
      carte = null;
      terminer();
      return;
    }
    liste.forEach((p, k) => images.grande(p.id, k).catch(() => {}));
    if (suivante && suivante.photoId === liste[0].id) {
      carte = suivante;
      carte.classList.remove('derriere');
    } else {
      suivante?.remove();
      carte = creerCarte(liste[0], false);
      scene.append(carte);
    }
    suivante = liste[1] ? creerCarte(liste[1], true) : null;
    if (suivante) scene.append(suivante);
  }

  function reconstruire() {
    scene.querySelectorAll('.carte-photo').forEach(c => c.remove());
    carte = null;
    suivante = null;
    avancer();
    carte?.classList.add('revient');
  }

  // ---- choix

  function choisir(valeur, geste = { dx: 0, dy: 0 }) {
    if (!carte || fin) return;
    const id = carte.photoId;
    if (valeur === COEUR && !peutMettreCoeur(etat, ensembleId, id)) {
      revenir();
      carte.classList.remove('secoue');
      void carte.offsetWidth; // relance l'animation
      carte.classList.add('secoue');
      notifier(`Déjà ${max} coups de cœur dans cet ensemble. Vous pourrez en échanger dans la revue.`);
      return;
    }
    pile.push({ photoId: id, avant: etat.votes[id] ?? null });
    ctx.voter(id, valeur);

    // Animation de sortie de la carte, la suivante prend sa place immédiatement.
    const partant = carte;
    const L = innerWidth * 1.3;
    const H = innerHeight * 1.3;
    partant.classList.remove('glisse');
    partant.classList.add('sort');
    const cadre = partant.firstChild;
    cadre.style.setProperty(`--o-${valeur === PASSE ? 'passe' : valeur === GARDE ? 'garde' : 'coeur'}`, 1);
    partant.style.transform = valeur === GARDE ? `translate(${L}px, ${geste.dy}px) rotate(24deg)`
      : valeur === PASSE ? `translate(${-L}px, ${geste.dy}px) rotate(-24deg)`
        : `translate(${geste.dx}px, ${-H}px)`;
    setTimeout(() => partant.remove(), 350);
    carte = null;
    avancer();
  }

  function annuler() {
    const d = pile.pop();
    if (!d) return;
    ctx.voter(d.photoId, d.avant);
    if (fin) { fin.remove(); fin = null; }
    reconstruire();
  }

  function zoomer(x, y, souris = false) {
    if (!carte) return;
    ouvrirZoom(images, carte.photoId, { x, y, souris });
  }

  // ---- fin d'ensemble

  function terminer() {
    if (fin) return;
    const pr = progressionEnsemble(etat, ensembleId);
    let gardes = 0;
    let passes = 0;
    for (const p of photos) {
      if (etat.votes[p.id] === GARDE) gardes++;
      if (etat.votes[p.id] === PASSE) passes++;
    }
    const prochain = ensembleAContinuer(etat);
    const principal = prochain
      ? el('button', { class: 'btn-principal', onclick: () => nav.tri(prochain) }, 'Ensemble suivant')
      : el('button', { class: 'btn-principal', onclick: nav.accueil }, 'Retour à l\'accueil');
    fin = el('div', { class: 'fin-ensemble' },
      el('div', { class: 'fin-carte', role: 'dialog', 'aria-label': 'Ensemble terminé' },
        el('div', { class: 'fin-icone', 'aria-hidden': 'true' }, '🌸'),
        el('h2', {}, 'Ensemble terminé !'),
        el('p', {}, prochain ? encouragement() : 'Vous avez tout trié. Merci beaucoup !'),
        el('p', { class: 'fin-resume' },
          `${SYMBOLES[COEUR]} ${pr.coeurs}   ${SYMBOLES[GARDE]} ${gardes}   ${SYMBOLES[PASSE]} ${passes}`),
        principal,
        prochain ? el('button', { class: 'btn-secondaire', onclick: nav.accueil }, 'Pause') : null,
        el('div', { class: 'fin-liens' },
          el('button', { class: 'btn-lien', onclick: () => nav.revue(ensembleId) }, 'Revoir mes choix'),
          pile.length ? el('button', { class: 'btn-lien', onclick: annuler }, '↶ Annuler la dernière') : null)));
    racine.append(fin);
    principal.focus();
    if (pile.length) confettis();
    for (const b of nouveauxBadges(etat, ctx.jeton)) annoncerBadge(b);
  }

  // ---- gestes (pointer events : doigt, souris, stylet)

  const pointeurs = new Map();
  let geste = null;
  let dernierTap = 0;

  function seuil() {
    return Math.min(110, scene.clientWidth * 0.25);
  }

  function deplacer(dx, dy) {
    carte.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
    const s = seuil();
    const borne = v => Math.max(0, Math.min(1, v));
    const vertical = -dy > Math.abs(dx);
    const cadre = carte.firstChild;
    cadre.style.setProperty('--o-garde', vertical ? 0 : borne(dx / s));
    cadre.style.setProperty('--o-passe', vertical ? 0 : borne(-dx / s));
    cadre.style.setProperty('--o-coeur', vertical ? borne(-dy / s) : 0);
  }

  function revenir() {
    if (!carte) return;
    carte.classList.remove('glisse');
    carte.style.transform = '';
    for (const k of ['garde', 'passe', 'coeur']) carte.firstChild.style.setProperty(`--o-${k}`, 0);
  }

  scene.addEventListener('pointerdown', e => {
    if (!carte || fin || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    scene.setPointerCapture(e.pointerId);
    if (pointeurs.size === 2) {
      // Pincement : on ouvre l'agrandissement au milieu des deux doigts.
      const [a, b] = [...pointeurs.values()];
      geste = null;
      pointeurs.clear();
      revenir();
      zoomer((a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    geste = { x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0 };
    carte.classList.add('glisse');
  });

  scene.addEventListener('pointermove', e => {
    if (!geste || !pointeurs.has(e.pointerId) || !carte) return;
    geste.dx = e.clientX - geste.x0;
    geste.dy = e.clientY - geste.y0;
    deplacer(geste.dx, geste.dy);
  });

  function finGeste(e) {
    pointeurs.delete(e.pointerId);
    if (!geste || !carte) return;
    const g = geste;
    geste = null;
    if (e.type === 'pointercancel') { revenir(); return; }
    const distance = Math.hypot(g.dx, g.dy);
    const duree = performance.now() - g.t0;
    if (distance < 10 && duree < 350) {
      revenir();
      if (e.pointerType === 'mouse') { zoomer(e.clientX, e.clientY, true); return; }
      const maintenant = performance.now();
      if (maintenant - dernierTap < 320) { dernierTap = 0; zoomer(e.clientX, e.clientY); } else dernierTap = maintenant;
      return;
    }
    const vitesse = distance / Math.max(duree, 1);
    const s = seuil();
    const lance = vitesse > 0.6;
    let choix = null;
    if (-g.dy > Math.abs(g.dx) && (-g.dy > s || (lance && -g.dy > 40))) choix = COEUR;
    else if (Math.abs(g.dx) > Math.abs(g.dy) * 0.7 && (Math.abs(g.dx) > s || (lance && Math.abs(g.dx) > 40))) {
      choix = g.dx > 0 ? GARDE : PASSE;
    }
    if (choix === null) revenir();
    else choisir(choix, g);
  }
  scene.addEventListener('pointerup', finGeste);
  scene.addEventListener('pointercancel', finGeste);

  // ---- clavier (PC)

  function clavier(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.zoom')) return;
    const actions = {
      ArrowLeft: () => choisir(PASSE),
      ArrowRight: () => choisir(GARDE),
      ArrowUp: () => choisir(COEUR),
      Backspace: annuler,
      Escape: nav.accueil,
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }
  document.addEventListener('keydown', clavier);

  avancer();
  return { racine, detruire: () => document.removeEventListener('keydown', clavier) };
}

// ---------------------------------------------------------------- grille de revue

export function ecranRevue(ctx, ensembleId, nav) {
  const { etat, images } = ctx;
  const ens = etat.ensembles.find(e => e.id === ensembleId);
  const photos = photosDe(etat, ensembleId);
  const max = etat.config.max_coups_de_coeur ?? 4;
  const coeurs = el('div', { class: 'tri-coeurs' });

  const observateur = new IntersectionObserver(entrees => {
    for (const en of entrees) {
      if (!en.isIntersecting) continue;
      const img = en.target;
      observateur.unobserve(img);
      images.mini(img.dataset.id, 1).then(url => { img.src = url; }).catch(() => {});
    }
  }, { rootMargin: '300px' });

  function actualiserCoeurs() {
    const pr = progressionEnsemble(etat, ensembleId);
    coeurs.textContent = `${SYMBOLES[COEUR]} ${pr.coeurs}/${max}`;
    coeurs.classList.toggle('plein', pr.coeurs >= max);
  }

  function libelle(v) {
    return estTrie(v) ? SYMBOLES[v] : '·';
  }

  const grille = el('div', { class: 'grille-revue' });
  for (const p of photos) {
    const img = el('img', { alt: '', 'data-id': p.id, decoding: 'async' });
    const pastille = el('span', { class: 'pastille' }, libelle(etat.votes[p.id]));
    const bouton = el('button', {
      class: 'vignette',
      'data-valeur': estTrie(etat.votes[p.id]) ? etat.votes[p.id] : '',
      'aria-label': `Photo ${p.ordre} : ${libelle(etat.votes[p.id])}. Toucher pour changer.`,
    }, img, pastille);
    bouton.addEventListener('click', () => {
      const v = valeurSuivante(etat.votes[p.id], peutMettreCoeur(etat, ensembleId, p.id));
      ctx.voter(p.id, v);
      pastille.textContent = libelle(v);
      bouton.dataset.valeur = v;
      bouton.setAttribute('aria-label', `Photo ${p.ordre} : ${libelle(v)}. Toucher pour changer.`);
      actualiserCoeurs();
    });
    grille.append(bouton);
    observateur.observe(img);
  }
  actualiserCoeurs();

  const termine = progressionEnsemble(etat, ensembleId).statut === 'termine';
  const racine = el('section', { class: 'ecran ecran-revue' },
    el('header', { class: 'tri-entete' },
      el('button', { class: 'btn-icone', 'aria-label': 'Retour à l\'accueil', onclick: nav.accueil }, '‹'),
      el('div', { class: 'tri-infos' }, el('div', { class: 'tri-titre' }, ens.nom), el('div', { class: 'tri-compteur' }, 'Mes choix')),
      coeurs),
    el('p', { class: 'aide' }, `Touchez une photo pour changer : ${SYMBOLES[GARDE]} → ${SYMBOLES[COEUR]} → ${SYMBOLES[PASSE]}`),
    grille,
    el('div', { class: 'pied-revue' },
      termine
        ? el('button', { class: 'btn-principal', onclick: nav.accueil }, 'Retour à l\'accueil')
        : el('button', { class: 'btn-principal', onclick: () => nav.tri(ensembleId) }, 'Continuer le tri')));

  return { racine, detruire: () => observateur.disconnect() };
}
