// Florilège — tests du module etat.js.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { test, egal, vrai } from './mini_test.js?v=0.10.0';
import {
  PASSE, GARDE, COEUR, photosDe, progressionEnsemble, progressionGlobale, indexProchaine,
  ensembleAContinuer, peutMettreCoeur, appliquer, valeurSuivante, prochaineATrier, comptesEnsemble, valeurApresFleche,
} from '../etat.js?v=0.10.0';

function etatExemple() {
  return {
    config: { max_coups_de_coeur: 2 },
    ensembles: [{ id: 'b', ordre: 2 }, { id: 'a', ordre: 1 }],
    photos: [
      { id: 'a2', ensemble_id: 'a', ordre: 2 },
      { id: 'a1', ensemble_id: 'a', ordre: 1 },
      { id: 'a3', ensemble_id: 'a', ordre: 3 },
      { id: 'b1', ensemble_id: 'b', ordre: 1 },
    ],
    votes: {},
  };
}

test('photosDe trie par ordre', () => {
  egal(photosDe(etatExemple(), 'a').map(p => p.id), ['a1', 'a2', 'a3']);
});

test('progression : vide, en cours, terminé', () => {
  const e = etatExemple();
  egal(progressionEnsemble(e, 'a').statut, 'vide');
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: COEUR });
  egal(progressionEnsemble(e, 'a'), { faits: 1, total: 3, coeurs: 1, statut: 'encours' });
  appliquer(e, { type: 'tri', photo_id: 'a2', valeur: PASSE });
  appliquer(e, { type: 'tri', photo_id: 'a3', valeur: GARDE });
  egal(progressionEnsemble(e, 'a').statut, 'termine');
  egal(progressionGlobale(e), { faits: 3, total: 4, termines: 1, nbEnsembles: 2 });
});

test('un vote annulé (null) redevient « non trié »', () => {
  const e = etatExemple();
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: GARDE });
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: null });
  egal(progressionEnsemble(e, 'a').faits, 0);
  egal(indexProchaine(e, 'a'), 0);
});

test('indexProchaine saute les photos déjà triées', () => {
  const e = etatExemple();
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: PASSE });
  egal(indexProchaine(e, 'a'), 1);
});

test('ensembleAContinuer : un ensemble entamé passe avant un ensemble vide', () => {
  const e = etatExemple();
  egal(ensembleAContinuer(e), 'a');
  appliquer(e, { type: 'tri', photo_id: 'b1', valeur: PASSE });
  egal(ensembleAContinuer(e), 'a');
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: PASSE });
  appliquer(e, { type: 'tri', photo_id: 'a2', valeur: PASSE });
  appliquer(e, { type: 'tri', photo_id: 'a3', valeur: PASSE });
  egal(ensembleAContinuer(e), null);
});

test('limite des coups de cœur', () => {
  const e = etatExemple();
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: COEUR });
  vrai(peutMettreCoeur(e, 'a', 'a2'));
  appliquer(e, { type: 'tri', photo_id: 'a2', valeur: COEUR });
  vrai(!peutMettreCoeur(e, 'a', 'a3'), 'la limite de 2 devrait être atteinte');
  vrai(peutMettreCoeur(e, 'a', 'a1'), 'une photo déjà en coup de cœur le reste');
});

test('valeurSuivante sur la pastille d\'une imagette', () => {
  egal(valeurSuivante(undefined, true), GARDE);
  egal(valeurSuivante(GARDE, true), COEUR);
  egal(valeurSuivante(GARDE, false), PASSE);
  egal(valeurSuivante(COEUR, true), PASSE);
  egal(valeurSuivante(PASSE, true), null);
});

test('prochaineATrier repart du début si besoin', () => {
  const e = etatExemple();
  appliquer(e, { type: 'tri', photo_id: 'a2', valeur: PASSE });
  egal(prochaineATrier(e, 'a', 0), 2);
  egal(prochaineATrier(e, 'a', 2), 0);
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: PASSE });
  appliquer(e, { type: 'tri', photo_id: 'a3', valeur: PASSE });
  egal(prochaineATrier(e, 'a', 0), -1);
});

test('comptesEnsemble', () => {
  const e = etatExemple();
  appliquer(e, { type: 'tri', photo_id: 'a1', valeur: COEUR });
  appliquer(e, { type: 'tri', photo_id: 'a2', valeur: GARDE });
  egal(comptesEnsemble(e, 'a'), { passes: 0, gardes: 1, coeurs: 1, nonTries: 1 });
});

test('valeurApresFleche : échelle ✖️ ↔ ❤️ ↔ ⭐', () => {
  egal(valeurApresFleche(undefined, true, true), GARDE);
  egal(valeurApresFleche(PASSE, true, true), GARDE);
  egal(valeurApresFleche(GARDE, true, true), COEUR);
  egal(valeurApresFleche(GARDE, true, false), GARDE);
  egal(valeurApresFleche(COEUR, true, true), COEUR);
  egal(valeurApresFleche(undefined, false, true), PASSE);
  egal(valeurApresFleche(COEUR, false, true), GARDE);
  egal(valeurApresFleche(GARDE, false, true), PASSE);
  egal(valeurApresFleche(PASSE, false, true), PASSE);
});
