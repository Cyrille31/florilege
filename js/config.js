// Florilège — configuration du client.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

export const CONFIG = {
  // Adresse fixe d'un serveur Apps Script (facultatif, pour une installation personnelle).
  // Laissée vide : l'adresse du serveur vient du lien d'invitation (?s=…), fourni par le menu du Google Sheet.
  urlApi: '',

  // Version affichée dans l'écran « À propos ».
  version: '0.10.0',

  // Envoi groupé des événements (section 7.4 des spécifications).
  envoiToutesLesNActions: 10,
  envoiToutesLesNSecondes: 15,

  // Préchargement des grandes images (section 3.3).
  prechargementAvance: 5,
  requetesSimultanees: 3, // Apps Script limite le nombre d'exécutions simultanées
  miniaturesParLot: 16,
};

const parametres = new URLSearchParams(location.search);
let serveurMemoire = '';

// Identifiant du serveur (déploiement Apps Script) de la sélection : paramètre ?s= du lien d'invitation,
// mémorisé sur l'appareil pour les visites suivantes. Chaque organisateur a le sien : le même site sert à tous.
export function identifiantServeur() {
  const s = parametres.get('s');
  if (s && /^[\w-]{20,200}$/.test(s)) {
    serveurMemoire = s;
    try { localStorage.setItem('florilege-serveur', s); } catch { /* navigation privée */ }
    return s;
  }
  try { return localStorage.getItem('florilege-serveur') || serveurMemoire; } catch { return serveurMemoire; }
}

export function urlApi() {
  if (CONFIG.urlApi) return CONFIG.urlApi;
  const id = identifiantServeur();
  return id ? `https://script.google.com/macros/s/${id}/exec` : '';
}

// Mode démonstration (photos factices, rien n'est envoyé) : paramètre ?demo=1.
export function modeDemo() {
  return parametres.get('demo') === '1';
}

// Clé des données gardées sur l'appareil, propre à chaque sélection (deux sélections ne se mélangent pas).
export function cleLocale(suffixe) {
  const serveur = modeDemo() ? 'demo' : (CONFIG.urlApi || identifiantServeur()).slice(-12).replace(/[^\w-]/g, '');
  return `florilege-${serveur}-${suffixe}`;
}
