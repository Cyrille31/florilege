// Florilège — état du sélectionneur : fonctions pures de calcul (testables sans navigateur).
// L'état reçu du serveur a la forme :
//   { selectionneur, config, ensembles: [...], photos: [...], votes: { photo_id: 0|1|2|null }, collectif }
// Un vote absent ou null signifie « pas encore trié ».
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

export const PASSE = 0;
export const GARDE = 1;
export const COEUR = 2;

export function estTrie(valeur) {
  return valeur === PASSE || valeur === GARDE || valeur === COEUR;
}

// Photos d'un ensemble, dans l'ordre d'affichage.
export function photosDe(etat, ensembleId) {
  if (!etat._parEnsemble) {
    const index = new Map();
    for (const p of etat.photos) {
      if (!index.has(p.ensemble_id)) index.set(p.ensemble_id, []);
      index.get(p.ensemble_id).push(p);
    }
    for (const liste of index.values()) liste.sort((a, b) => a.ordre - b.ordre);
    // Propriété non énumérable : ne part pas dans les sauvegardes JSON.
    Object.defineProperty(etat, '_parEnsemble', { value: index, configurable: true });
  }
  return etat._parEnsemble.get(ensembleId) || [];
}

export function ensemblesTries(etat) {
  return [...etat.ensembles].sort((a, b) => a.ordre - b.ordre);
}

export function progressionEnsemble(etat, ensembleId) {
  const photos = photosDe(etat, ensembleId);
  let faits = 0;
  let coeurs = 0;
  for (const p of photos) {
    const v = etat.votes[p.id];
    if (estTrie(v)) faits++;
    if (v === COEUR) coeurs++;
  }
  const total = photos.length;
  const statut = faits === 0 ? 'vide' : faits >= total ? 'termine' : 'encours';
  return { faits, total, coeurs, statut };
}

export function progressionGlobale(etat) {
  let faits = 0;
  let total = 0;
  let termines = 0;
  for (const e of etat.ensembles) {
    const pr = progressionEnsemble(etat, e.id);
    faits += pr.faits;
    total += pr.total;
    if (pr.statut === 'termine') termines++;
  }
  return { faits, total, termines, nbEnsembles: etat.ensembles.length };
}

// Indice de la première photo non triée d'un ensemble, ou -1 si tout est trié.
export function indexProchaine(etat, ensembleId) {
  return photosDe(etat, ensembleId).findIndex(p => !estTrie(etat.votes[p.id]));
}

// Ensemble à reprendre avec « Continuer » : d'abord un ensemble entamé, sinon le premier non commencé.
export function ensembleAContinuer(etat) {
  const liste = ensemblesTries(etat);
  const entame = liste.find(e => progressionEnsemble(etat, e.id).statut === 'encours');
  if (entame) return entame.id;
  const vide = liste.find(e => progressionEnsemble(etat, e.id).statut === 'vide');
  return vide ? vide.id : null;
}

export function peutMettreCoeur(etat, ensembleId, photoId) {
  if (etat.votes[photoId] === COEUR) return true;
  return progressionEnsemble(etat, ensembleId).coeurs < (etat.config.max_coups_de_coeur ?? 4);
}

// Applique un événement de tri à l'état (le dernier appliqué fait foi).
export function appliquer(etat, ev) {
  if (ev.type === 'tri') etat.votes[ev.photo_id] = ev.valeur;
  return etat;
}

// Valeur suivante quand on touche la pastille d'une imagette :
// non trié → garde → coup de cœur → passe → non trié (le coup de cœur est sauté si la limite est atteinte).
export function valeurSuivante(valeur, coeurPossible) {
  if (!estTrie(valeur)) return GARDE;
  if (valeur === GARDE) return coeurPossible ? COEUR : PASSE;
  if (valeur === COEUR) return PASSE;
  return null;
}

// Indice de la prochaine photo non triée après « apres » (en repartant du début si besoin), ou -1.
export function prochaineATrier(etat, ensembleId, apres = -1) {
  const photos = photosDe(etat, ensembleId);
  for (let k = 1; k <= photos.length; k++) {
    const i = (apres + k + photos.length) % photos.length;
    if (!estTrie(etat.votes[photos[i].id])) return i;
  }
  return -1;
}

// Comptes d'un ensemble par choix : { passes, gardes, coeurs, nonTries }.
export function comptesEnsemble(etat, ensembleId) {
  const c = { passes: 0, gardes: 0, coeurs: 0, nonTries: 0 };
  for (const p of photosDe(etat, ensembleId)) {
    const v = etat.votes[p.id];
    if (v === PASSE) c.passes++;
    else if (v === GARDE) c.gardes++;
    else if (v === COEUR) c.coeurs++;
    else c.nonTries++;
  }
  return c;
}

// Flèche (ou geste) vers le haut ou vers le bas : on monte ou on descend d'un cran sur l'échelle
// ✖️ ↔ ❤️ ↔ ⭐. Une photo non triée devient ❤️ (haut) ou ✖️ (bas).
// Si le coup de cœur n'est pas possible (limite atteinte), la valeur ne change pas.
export function valeurApresFleche(valeur, versLeHaut, coeurPossible) {
  if (versLeHaut) {
    if (valeur === GARDE) return coeurPossible ? COEUR : GARDE;
    if (valeur === COEUR) return COEUR;
    return GARDE;
  }
  if (valeur === COEUR) return GARDE;
  return PASSE;
}
