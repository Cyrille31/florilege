// Florilège — échanges avec le serveur (Apps Script ou back-end simulé) et file d'événements.
// Chaque action produit un événement (event_id unique) placé dans une file locale,
// envoyée par lots : toutes les N actions, toutes les N secondes, au passage en
// arrière-plan et à la fermeture. En cas d'échec, nouvel essai avec délai croissant.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { CONFIG, modeDemo, urlApi, cleLocale } from './config.js?v=0.11.0';
import { backendSimule } from './simulation.js?v=0.11.0';
import { lireStockage, ecrireStockage, supprimerStockage } from './stockage.js?v=0.11.0';
import { appliquer } from './etat.js?v=0.11.0';

// ---------------------------------------------------------------- back-end Apps Script
// Les requêtes POST sont en text/plain (corps JSON) pour éviter la requête CORS préalable.
// Les actions correspondantes sont dans apps-script/Code.gs.

function base64VersBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new Blob([octets], { type });
}

// Erreur renvoyée par le serveur (lien inconnu, photo inconnue…), à distinguer d'une coupure réseau.
export class ErreurServeur extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Mesure des temps de réponse, affichée avec le paramètre ?diag=1 (voir app.js).
export const mesures = [];

// Un échec réseau (ou Apps Script momentanément saturé) donne lieu à un second essai.
async function appel(action, donnees) {
  try {
    return await appelUnique(action, donnees);
  } catch (e) {
    if (e instanceof ErreurServeur) throw e;
    await new Promise(r => setTimeout(r, 800));
    return appelUnique(action, donnees);
  }
}

async function appelUnique(action, donnees) {
  const debut = performance.now();
  const rep = await fetch(urlApi(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...donnees, mdp: lireMotDePasse() }),
  });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const texte = await rep.text();
  mesures.push({ action, ms: performance.now() - debut, octets: texte.length });
  const json = JSON.parse(texte);
  if (json.erreur) throw new ErreurServeur(json.erreur, json.code);
  return json;
}

const backendHttp = {
  etat: nom => appel('etat', { testeur: nom }),
  envoyer: (nom, evenements) => appel('evenements', { testeur: nom, evenements }),
  // Envoi « au mieux » lors de la fermeture de la page (aucune réponse attendue).
  envoyerSansAttendre(nom, evenements) {
    const corps = new Blob([JSON.stringify({ action: 'evenements', testeur: nom, evenements, mdp: lireMotDePasse() })], { type: 'text/plain' });
    return navigator.sendBeacon?.(urlApi(), corps);
  },
  async miniatures(nom, ids) {
    const json = await appel('miniatures', { testeur: nom, ids });
    const res = {};
    for (const [id, b64] of Object.entries(json.images || {})) res[id] = base64VersBlob(b64, json.types?.[id]);
    return res;
  },
  async image(nom, id) {
    const json = await appel('image', { testeur: nom, id });
    return base64VersBlob(json.donnees, json.type);
  },
  erreur: (nom, message) => appel('erreur', { testeur: nom, message }),
};

export const backend = modeDemo() ? backendSimule : backendHttp;

// ---------------------------------------------------------------- identité
// Le testeur s'identifie par son nom, mémorisé sur l'appareil. En redonnant le même nom (sans tenir compte
// des majuscules ni des espaces en trop), il retrouve son avancement, sur n'importe quel appareil.

export function nettoyerNom(nom) {
  return String(nom || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Clé utilisée pour les données gardées sur l'appareil.
export function cleNom(nom) {
  return nettoyerNom(nom).toLowerCase();
}

export function lireNom() {
  return lireStockage(cleLocale('nom'));
}

export function memoriserNom(nom) {
  ecrireStockage(cleLocale('nom'), nettoyerNom(nom));
}

export function oublierNom() {
  supprimerStockage(cleLocale('nom'));
}

// Mot de passe commun, mémorisé sur l'appareil et joint à chaque requête.
export function lireMotDePasse() {
  return lireStockage(cleLocale('mdp')) || '';
}

export function memoriserMotDePasse(mdp) {
  ecrireStockage(cleLocale('mdp'), String(mdp || '').trim());
}

export function oublierMotDePasse() {
  supprimerStockage(cleLocale('mdp'));
}

function nouvelId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const o = crypto.getRandomValues(new Uint8Array(16));
  return [...o].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function nouvelEvenement(champs) {
  return { event_id: nouvelId(), horodatage: new Date().toISOString(), ...champs };
}

// ---------------------------------------------------------------- file d'événements

export class FileEvenements {
  constructor(jeton) {
    this.jeton = jeton;
    this.cle = cleLocale(`file-${cleNom(jeton)}`);
    this.file = lireStockage(this.cle, []);
    this.enCours = false;
    this.echecs = 0;
    this.horsLigne = false;
    this.minuteur = null;
    this.ecouteurs = new Set();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.envoyerEnPartant();
    });
    window.addEventListener('pagehide', () => this.envoyerEnPartant());
    window.addEventListener('online', () => { this.echecs = 0; this.envoyer(); });
    window.addEventListener('offline', () => { this.horsLigne = true; this.signaler(); });
  }

  enAttente() {
    return this.file.length;
  }

  statut() {
    if (this.horsLigne) return 'horsligne';
    return this.file.length ? 'attente' : 'ok';
  }

  surChangement(fn) {
    this.ecouteurs.add(fn);
  }

  signaler() {
    for (const fn of this.ecouteurs) fn(this.statut(), this.file.length);
  }

  sauver() {
    ecrireStockage(this.cle, this.file);
  }

  ajouter(ev) {
    this.file.push(ev);
    this.sauver();
    this.signaler();
    if (this.file.length >= CONFIG.envoiToutesLesNActions) this.envoyer();
    else this.planifier(CONFIG.envoiToutesLesNSecondes * 1000);
  }

  planifier(delai) {
    if (this.minuteur) return;
    this.minuteur = setTimeout(() => {
      this.minuteur = null;
      this.envoyer();
    }, delai);
  }

  async envoyer() {
    if (this.enCours || !this.file.length) return;
    clearTimeout(this.minuteur);
    this.minuteur = null;
    this.enCours = true;
    const lot = this.file.slice(0, 50);
    let reussi = false;
    try {
      const rep = await backend.envoyer(this.jeton, lot);
      const acceptes = new Set(rep.acceptes || lot.map(e => e.event_id));
      this.file = this.file.filter(e => !acceptes.has(e.event_id));
      this.sauver();
      this.echecs = 0;
      this.horsLigne = false;
      reussi = true;
    } catch {
      this.echecs++;
      this.horsLigne = !navigator.onLine || this.echecs >= 2;
    } finally {
      this.enCours = false;
      this.signaler();
    }
    if (reussi && this.file.length) this.envoyer();
    else if (!reussi) this.planifier(Math.min(60, 2 ** this.echecs) * 1000);
  }

  // À la fermeture ou au passage en arrière-plan : on tente un envoi immédiat.
  // Les événements restent dans la file tant qu'ils ne sont pas confirmés ;
  // un éventuel doublon sera ignoré par le serveur grâce à event_id.
  envoyerEnPartant() {
    if (!this.file.length) return;
    if (backend.envoyerSansAttendre) backend.envoyerSansAttendre(this.jeton, this.file.slice(0, 50));
    else this.envoyer();
  }
}

// ---------------------------------------------------------------- chargement de l'état

// Récupère l'état complet auprès du serveur, puis rejoue les événements locaux non confirmés.
// Hors ligne, on repart du dernier état connu sur cet appareil.
export async function chargerEtat(jeton, file) {
  const cle = cleLocale(`etat-${cleNom(jeton)}`);
  let etat;
  let horsLigne = false;
  try {
    etat = await backend.etat(jeton);
  } catch (e) {
    // Lien refusé par le serveur : pas question de repartir d'un état mémorisé.
    if (e instanceof ErreurServeur) throw e;
    etat = lireStockage(cle);
    if (!etat) throw e;
    horsLigne = true;
  }
  for (const ev of file.file) appliquer(etat, ev);
  ecrireStockage(cle, etat);
  return { etat, horsLigne };
}

// Mémorise l'état courant sur l'appareil (pour une réouverture hors ligne).
export function memoriserEtat(jeton, etat) {
  ecrireStockage(cleLocale(`etat-${cleNom(jeton)}`), etat);
}

// ---------------------------------------------------------------- erreurs du client

// Les erreurs JavaScript sont remontées dans l'onglet Journal (au plus 5 par visite).
let erreursSignalees = 0;
export function signalerErreur(jeton, message) {
  if (!backend.erreur || erreursSignalees >= 5) return;
  erreursSignalees++;
  backend.erreur(jeton, `${String(message).slice(0, 800)} — ${navigator.userAgent}`).catch(() => {});
}
