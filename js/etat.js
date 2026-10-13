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

// Valeur suivante quand on touche une miniature dans la grille de revue :
// non trié → garde → coup de cœur → passe → garde… (le coup de cœur est sauté si la limite est atteinte).
export function valeurSuivante(valeur, coeurPossible) {
  if (!estTrie(valeur) || valeur === PASSE) return GARDE;
  if (valeur === GARDE) return coeurPossible ? COEUR : PASSE;
  return PASSE;
}
