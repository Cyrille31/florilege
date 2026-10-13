// Florilège — configuration du client.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

export const CONFIG = {
  // URL de l'application web Apps Script (se termine par /exec).
  // Laisser vide pour utiliser le back-end simulé (mode démonstration, photos factices).
  urlApi: '',

  // Version affichée dans l'écran « À propos ».
  version: '0.7.0',

  // Envoi groupé des événements (section 7.4 des spécifications).
  envoiToutesLesNActions: 10,
  envoiToutesLesNSecondes: 15,

  // Préchargement des grandes images (section 3.3).
  prechargementAvance: 5,
  requetesSimultanees: 4,
  miniaturesParLot: 16,
};

// Mode démonstration : pas d'URL d'API, ou paramètre ?demo=1 dans l'adresse.
export function modeDemo() {
  const p = new URLSearchParams(location.search);
  return !CONFIG.urlApi || p.get('demo') === '1';
}
