// Florilège — accès protégé à localStorage (peut être indisponible : navigation privée, etc.).
// En cas d'échec, les valeurs restent en mémoire pour la durée de la page.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

const memoire = new Map();

export function lireStockage(cle, defaut = null) {
  try {
    const brut = localStorage.getItem(cle);
    if (brut !== null) return JSON.parse(brut);
  } catch { /* stockage indisponible ou valeur illisible */ }
  return memoire.has(cle) ? structuredClone(memoire.get(cle)) : defaut;
}

export function ecrireStockage(cle, valeur) {
  memoire.set(cle, structuredClone(valeur));
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}

export function supprimerStockage(cle) {
  memoire.delete(cle);
  try { localStorage.removeItem(cle); } catch { /* sans importance */ }
}
