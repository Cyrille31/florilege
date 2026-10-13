// Florilège — configuration du client.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

export const CONFIG = {
  // URL de l'application web Apps Script (se termine par /exec), obtenue au déploiement (voir le README).
  // Laisser vide pour utiliser le back-end simulé (mode démonstration, photos factices).
  // Exemple : urlApi: 'https://script.google.com/macros/s/AKfycb…/exec',
  urlApi: 'https://script.google.com/macros/s/AKfycbwRS1ayI37n9RyO-XkIEo3J8ICYmMfEbTTiyoy6ObefqcQZe1A3aBGFR4ZznDzria2h2Q/exec',

  // Version affichée dans l'écran « À propos ».
  version: '0.8.1',

  // Envoi groupé des événements (section 7.4 des spécifications).
  envoiToutesLesNActions: 10,
  envoiToutesLesNSecondes: 15,

  // Préchargement des grandes images (section 3.3).
  prechargementAvance: 5,
  requetesSimultanees: 3, // Apps Script limite le nombre d'exécutions simultanées
  miniaturesParLot: 16,
};

// Mode démonstration : pas d'URL d'API, ou paramètre ?demo=1 dans l'adresse.
export function modeDemo() {
  const p = new URLSearchParams(location.search);
  return !CONFIG.urlApi || p.get('demo') === '1';
}
