/**
 * Florilège — script Apps Script lié au Google Sheet de la sélection.
 *
 * Rôles :
 *   - API web (doPost) pour l'application des sélectionneurs : état, enregistrement des choix,
 *     miniatures et grandes images (lues dans le dossier Drive privé, renvoyées en base64) ;
 *   - menu « Florilège » dans le classeur : installation, sélectionneurs et liens,
 *     photos de test, indexation des images, ouverture des manches.
 *
 * Déploiement : voir le README (Extensions → Apps Script, coller ce fichier, déployer en application web
 * « Exécuter en tant que : moi », « Accès : tout le monde »).
 *
 * © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (Bonne Action License).
 * En échange, une seule chose vous est demandée, sur l'honneur : faire une bonne action chaque jour.
 * Aider un voisin, sourire à un inconnu, ramasser un papier… c'est vous qui voyez.
 */

const VERSION = '0.8.0';

// Onglets du classeur et leurs colonnes (section 5 des spécifications).
const ONGLETS = {
  Config: ['cle', 'valeur'],
  Selectionneurs: ['id', 'nom', 'jeton', 'actif', 'personne_id'],
  Personnes: ['id', 'nom', 'ordre'],
  Ensembles: ['id', 'nom', 'ordre', 'nb_photos'],
  Photos: ['id', 'ensemble_id', 'fichier', 'miniature', 'drive_id', 'drive_id_mini', 'largeur', 'hauteur', 'date_prise', 'ordre'],
  VisagesPicasa: ['photo_id', 'visage_id', 'personne_id', 'x', 'y', 'l', 'h'],
  Attributions: ['selectionneur_id', 'ensemble_id', 'manche'],
  Votes: ['horodatage', 'event_id', 'selectionneur_id', 'manche', 'type', 'photo_id', 'photo_b_id', 'valeur'],
  Etiquettes: ['horodatage', 'event_id', 'selectionneur_id', 'photo_id', 'action', 'visage_id', 'personne_id', 'x', 'y', 'l', 'h'],
  ShortList: ['ensemble_id', 'photo_id', 'score_m1', 'rang'],
  EtiquettesFinales: ['photo_id', 'personne_id', 'origine'],
  Resultat: ['ensemble_id', 'photo_id', 'rang', 'force_par_admin'],
  Journal: ['horodatage', 'selectionneur_id', 'evenement', 'detail'],
};

// Paramètres par défaut (section 9).
const DEFAUTS = {
  phase: 'preparation',
  titre_selection: '',
  photos_par_ensemble: 4,
  k_selectionneurs_m1: 3,
  max_coups_de_coeur: 4,
  taille_shortlist: 12,
  duels_par_ensemble: 8,
  verifs_par_photo: 2,
  seuil_consensus: 2,
  lambda: 1,
  mu: 0.5,
  nu: 0.5,
  dossier_images_drive: '',
  url_application: 'https://cyrille31.github.io/florilege/index.html',
  jeton_admin_hache: '',
};

const DUREE_CACHE = 21600; // 6 h, le maximum de CacheService

// ============================================================================ outils

function classeur() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function onglet(nom) {
  const feuille = classeur().getSheetByName(nom);
  if (!feuille) throw new Error(`Onglet « ${nom} » introuvable : lancez Florilège → Installer.`);
  return feuille;
}

// Lit un onglet sous forme de tableau d'objets { colonne: valeur }.
function lireTable(nom) {
  const feuille = onglet(nom);
  const n = feuille.getLastRow() - 1;
  if (n < 1) return [];
  const entetes = ONGLETS[nom];
  return feuille.getRange(2, 1, n, entetes.length).getValues().map(ligne => {
    const o = {};
    entetes.forEach((c, k) => { o[c] = ligne[k]; });
    return o;
  });
}

// Ajoute des lignes (tableaux de valeurs) à la fin d'un onglet, en une seule écriture.
function ajouterLignes(nom, lignes) {
  if (!lignes.length) return;
  const feuille = onglet(nom);
  feuille.getRange(feuille.getLastRow() + 1, 1, lignes.length, lignes[0].length).setValues(lignes);
}

// Remplace tout le contenu (hors en-tête) d'un onglet.
function remplacerTable(nom, lignes) {
  const feuille = onglet(nom);
  const n = feuille.getLastRow() - 1;
  if (n > 0) feuille.getRange(2, 1, n, ONGLETS[nom].length).clearContent();
  ajouterLignes(nom, lignes);
}

function lireConfig() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('config');
  if (enCache) return JSON.parse(enCache);
  const config = Object.assign({}, DEFAUTS);
  for (const l of lireTable('Config')) if (l.cle) config[l.cle] = l.valeur;
  cache.put('config', JSON.stringify(config), 60);
  return config;
}

function ecrireConfig(cle, valeur) {
  const feuille = onglet('Config');
  const lignes = lireTable('Config');
  const k = lignes.findIndex(l => l.cle === cle);
  if (k >= 0) feuille.getRange(k + 2, 2).setValue(valeur);
  else feuille.appendRow([cle, valeur]);
  CacheService.getScriptCache().remove('config');
}

// « Génération » des données : changée après chaque import ou indexation, elle invalide les caches.
function generation() {
  return PropertiesService.getScriptProperties().getProperty('generation') || '1';
}

function nouvelleGeneration() {
  PropertiesService.getScriptProperties().setProperty('generation', String(Date.now()));
}

function maintenant() {
  return new Date().toISOString();
}

function journal(selectionneurId, evenement, detail) {
  try {
    ajouterLignes('Journal', [[maintenant(), selectionneurId || '', evenement, String(detail || '').slice(0, 2000)]]);
  } catch (e) { /* le journal ne doit jamais faire échouer une requête */ }
}

function jetonAleatoire() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 20);
}

function hacher(texte) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte)
    .map(o => ((o + 256) % 256).toString(16).padStart(2, '0')).join('');
}

// Dossier Drive qui contient le classeur (le « dossier de la sélection », section 3.5).
function dossierSelection() {
  const parents = DriveApp.getFileById(classeur().getId()).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function sousDossier(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function dossierImages() {
  const id = lireConfig().dossier_images_drive;
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* identifiant périmé : on retombe sur images/ */ }
  }
  return sousDossier(dossierSelection(), 'images');
}

// ============================================================================ API web

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return repondre({ ok: true, application: 'Florilège', version: VERSION });
}

function doPost(e) {
  let requete;
  try {
    requete = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    return repondre({ erreur: 'Requête illisible.' });
  }
  try {
    const sel = selectionneurParJeton(requete.jeton);
    if (!sel) return repondre({ erreur: 'Lien inconnu ou désactivé. Vérifiez le lien reçu.', code: 'jeton' });
    switch (requete.action) {
      case 'etat': return repondre(apiEtat(sel));
      case 'evenements': return repondre(apiEvenements(sel, requete.evenements));
      case 'miniatures': return repondre(apiMiniatures(sel, requete.ids));
      case 'image': return repondre(apiImage(sel, requete.id));
      case 'erreur':
        journal(sel.id, 'erreur client', requete.message);
        return repondre({ ok: true });
      default: return repondre({ erreur: `Action inconnue : ${requete.action}` });
    }
  } catch (err) {
    journal('', 'erreur serveur', `${requete.action} : ${err && err.stack ? err.stack : err}`);
    return repondre({ erreur: `Erreur du serveur : ${err.message || err}` });
  }
}

// ---------------------------------------------------------------- identité

function selectionneurParJeton(jeton) {
  if (!jeton || String(jeton).length < 12) return null;
  const cache = CacheService.getScriptCache();
  const cle = `sel_${generation()}_${jeton}`;
  const enCache = cache.get(cle);
  if (enCache) return JSON.parse(enCache) || null;
  const ligne = lireTable('Selectionneurs').find(l => String(l.jeton) === String(jeton));
  const actif = ligne && String(ligne.actif).toLowerCase() !== 'non' && ligne.actif !== false;
  const sel = actif ? { id: String(ligne.id), nom: String(ligne.nom) } : null;
  cache.put(cle, JSON.stringify(sel), 600);
  return sel;
}

// Ensembles visibles par un sélectionneur en manche 1 : ceux qui lui sont attribués,
// ou tous si aucune attribution n'a encore été faite.
function ensemblesVisibles(selId) {
  const attributions = lireTable('Attributions').filter(a => Number(a.manche) === 1);
  if (!attributions.length) return null; // null = tous
  return new Set(attributions.filter(a => String(a.selectionneur_id) === selId).map(a => String(a.ensemble_id)));
}

// ---------------------------------------------------------------- index des photos (avec cache)

function infosPhotos(ids) {
  const cache = CacheService.getScriptCache();
  const prefixe = `p_${generation()}_`;
  const trouves = cache.getAll(ids.map(id => prefixe + id));
  const res = {};
  let manquants = false;
  for (const id of ids) {
    const v = trouves[prefixe + id];
    if (v) res[id] = JSON.parse(v); else manquants = true;
  }
  if (!manquants) return res;
  // Au moins une photo absente du cache : on relit l'onglet et on met tout en cache.
  const tout = {};
  for (const p of lireTable('Photos')) {
    if (!p.id) continue;
    tout[prefixe + p.id] = JSON.stringify({ e: String(p.ensemble_id), d: String(p.drive_id), m: String(p.drive_id_mini) });
  }
  const cles = Object.keys(tout);
  for (let i = 0; i < cles.length; i += 500) {
    const lot = {};
    cles.slice(i, i + 500).forEach(c => { lot[c] = tout[c]; });
    cache.putAll(lot, DUREE_CACHE);
  }
  for (const id of ids) if (tout[prefixe + id]) res[id] = JSON.parse(tout[prefixe + id]);
  return res;
}

// ---------------------------------------------------------------- état du sélectionneur

function valeurVote(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

function apiEtat(sel) {
  const config = lireConfig();
  const visibles = ensemblesVisibles(sel.id);
  const ensembles = lireTable('Ensembles')
    .filter(e => e.id && (!visibles || visibles.has(String(e.id))))
    .map(e => ({ id: String(e.id), nom: String(e.nom), ordre: Number(e.ordre) || 0, nb_photos: Number(e.nb_photos) || 0 }));
  const ids = new Set(ensembles.map(e => e.id));
  const photos = lireTable('Photos')
    .filter(p => p.id && ids.has(String(p.ensemble_id)))
    .map(p => ({
      id: String(p.id),
      ensemble_id: String(p.ensemble_id),
      largeur: Number(p.largeur) || 0,
      hauteur: Number(p.hauteur) || 0,
      ordre: Number(p.ordre) || 0,
    }));

  // Derniers choix du sélectionneur (manche 1) ; le dernier horodatage fait foi.
  const votes = {};
  const dates = {};
  for (const v of lireTable('Votes')) {
    if (String(v.selectionneur_id) !== sel.id || Number(v.manche) !== 1 || v.type !== 'tri') continue;
    const h = String(v.horodatage);
    if (dates[v.photo_id] && dates[v.photo_id] > h) continue;
    dates[v.photo_id] = h;
    votes[v.photo_id] = valeurVote(v.valeur);
  }

  journal(sel.id, 'connexion', '');
  return {
    selectionneur: sel,
    config: {
      phase: String(config.phase),
      titre_selection: String(config.titre_selection || ''),
      max_coups_de_coeur: Number(config.max_coups_de_coeur) || 4,
      photos_par_ensemble: Number(config.photos_par_ensemble) || 4,
    },
    ensembles,
    photos,
    votes,
    collectif: progressionCollective(),
  };
}

// Progression du groupe : nombre de couples (sélectionneur, photo) triés sur le total attendu.
function progressionCollective() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('collectif');
  if (enCache) return JSON.parse(enCache);

  const actifs = lireTable('Selectionneurs').filter(s => s.id && String(s.actif).toLowerCase() !== 'non' && s.actif !== false);
  const ensembles = lireTable('Ensembles');
  const nbParEnsemble = {};
  ensembles.forEach(e => { nbParEnsemble[String(e.id)] = Number(e.nb_photos) || 0; });
  const attributions = lireTable('Attributions').filter(a => Number(a.manche) === 1);
  let total = 0;
  if (attributions.length) {
    attributions.forEach(a => { total += nbParEnsemble[String(a.ensemble_id)] || 0; });
  } else {
    const nbPhotos = Object.values(nbParEnsemble).reduce((s, n) => s + n, 0);
    total = nbPhotos * actifs.length;
  }

  const derniers = {};
  for (const v of lireTable('Votes')) {
    if (Number(v.manche) !== 1 || v.type !== 'tri') continue;
    const cle = `${v.selectionneur_id}|${v.photo_id}`;
    const h = String(v.horodatage);
    if (derniers[cle] && derniers[cle].h > h) continue;
    derniers[cle] = { h, v: valeurVote(v.valeur) };
  }
  const faits = Object.values(derniers).filter(d => d.v !== null).length;
  const res = { faits: Math.min(faits, total), total };
  cache.put('collectif', JSON.stringify(res), 120);
  return res;
}

// ---------------------------------------------------------------- enregistrement des choix

function apiEvenements(sel, evenements) {
  if (!Array.isArray(evenements) || !evenements.length) return { acceptes: [] };
  if (evenements.length > 100) throw new Error('Trop d\'événements dans un seul envoi.');
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const feuille = onglet('Votes');
    const n = feuille.getLastRow() - 1;
    const deja = new Set(n > 0 ? feuille.getRange(2, 2, n, 1).getValues().map(l => String(l[0])) : []);
    const lignes = [];
    for (const ev of evenements) {
      const id = String(ev.event_id || '');
      if (!id || deja.has(id)) continue; // doublon : déjà enregistré (idempotence)
      if (ev.type !== 'tri' && ev.type !== 'duel') continue;
      const valeur = ev.valeur === null || ev.valeur === undefined ? '' : Number(ev.valeur);
      if (valeur !== '' && [0, 1, 2].indexOf(valeur) < 0) continue;
      deja.add(id);
      lignes.push([
        String(ev.horodatage || maintenant()), id, sel.id, Number(ev.manche) || 1, ev.type,
        String(ev.photo_id || ''), String(ev.photo_b_id || ''), valeur,
      ]);
    }
    ajouterLignes('Votes', lignes);
  } finally {
    verrou.releaseLock();
  }
  // Tous les événements reçus sont confirmés, y compris les doublons ignorés.
  return { acceptes: evenements.map(e => e.event_id) };
}

// ---------------------------------------------------------------- images

function verifierAcces(sel, ids) {
  const visibles = ensemblesVisibles(sel.id);
  const infos = infosPhotos(ids);
  const res = {};
  for (const id of ids) {
    const info = infos[id];
    if (info && (!visibles || visibles.has(info.e))) res[id] = info;
  }
  return res;
}

function apiMiniatures(sel, ids) {
  if (!Array.isArray(ids)) return { images: {}, types: {} };
  ids = ids.slice(0, 30).map(String);
  const autorisees = verifierAcces(sel, ids);
  const cache = CacheService.getScriptCache();
  const prefixe = `m_${generation()}_`;
  const enCache = cache.getAll(Object.keys(autorisees).map(id => prefixe + id));
  const images = {};
  const types = {};
  const aMettreEnCache = {};
  for (const id of Object.keys(autorisees)) {
    const c = enCache[prefixe + id];
    if (c) {
      const sep = c.indexOf('|');
      types[id] = c.slice(0, sep);
      images[id] = c.slice(sep + 1);
      continue;
    }
    const info = autorisees[id];
    try {
      // Miniature produite par le script de préparation ; à défaut, vignette générée par Drive.
      const blob = info.m ? DriveApp.getFileById(info.m).getBlob() : DriveApp.getFileById(info.d).getThumbnail();
      if (!blob) continue;
      const b64 = Utilities.base64Encode(blob.getBytes());
      images[id] = b64;
      types[id] = blob.getContentType() || 'image/jpeg';
      if (b64.length < 95000) aMettreEnCache[prefixe + id] = `${types[id]}|${b64}`;
    } catch (err) {
      journal(sel.id, 'miniature introuvable', `${id} : ${err.message}`);
    }
  }
  if (Object.keys(aMettreEnCache).length) cache.putAll(aMettreEnCache, DUREE_CACHE);
  return { images, types };
}

function apiImage(sel, id) {
  id = String(id || '');
  const info = verifierAcces(sel, [id])[id];
  if (!info) return { erreur: 'Photo inconnue.' };
  const blob = DriveApp.getFileById(info.d).getBlob();
  return { donnees: Utilities.base64Encode(blob.getBytes()), type: blob.getContentType() || 'image/jpeg' };
}

// ============================================================================ menu du classeur

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Florilège')
    .addItem('1. Installer / vérifier le classeur', 'installer')
    .addSeparator()
    .addItem('Ajouter des sélectionneurs…', 'ajouterSelectionneurs')
    .addItem('Afficher les liens personnels', 'afficherLiens')
    .addSeparator()
    .addItem('Créer des photos de test', 'creerPhotosDeTest')
    .addItem('Utiliser mes photos (sous-dossiers de images/)', 'importerSousDossiers')
    .addItem('Indexer les images (après le script de préparation)', 'indexerImages')
    .addSeparator()
    .addItem('Ouvrir la manche 1', 'ouvrirManche1')
    .addItem('Mettre en attente (fermer la manche)', 'mettreEnAttente')
    .addSeparator()
    .addItem('Effacer tous les votes (tests)', 'effacerVotes')
    .addItem('À propos', 'aPropos')
    .addToUi();
}

function ui() {
  return SpreadsheetApp.getUi();
}

function installer() {
  const ss = classeur();
  for (const [nom, colonnes] of Object.entries(ONGLETS)) {
    let feuille = ss.getSheetByName(nom);
    if (!feuille) feuille = ss.insertSheet(nom);
    feuille.getRange(1, 1, 1, colonnes.length).setValues([colonnes]).setFontWeight('bold').setBackground('#e6f2ee');
    feuille.setFrozenRows(1);
    // Tout en texte : évite que « 001 » devienne 1 ou qu'un horodatage soit converti en date.
    feuille.getRange(1, 1, feuille.getMaxRows(), colonnes.length).setNumberFormat('@');
  }
  const feuilleParDefaut = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuilleParDefaut && ss.getSheets().length > 1) ss.deleteSheet(feuilleParDefaut);

  const existantes = new Set(lireTable('Config').map(l => l.cle));
  const lignes = Object.entries(DEFAUTS).filter(([cle]) => !existantes.has(cle)).map(([cle, v]) => [cle, v]);
  ajouterLignes('Config', lignes);
  CacheService.getScriptCache().remove('config');

  const dossier = dossierSelection();
  const images = sousDossier(dossier, 'images');
  ['prep', 'exports', 'config', 'secret'].forEach(n => sousDossier(dossier, n));
  if (!lireConfig().dossier_images_drive) ecrireConfig('dossier_images_drive', images.getId());

  let message = `Classeur prêt (version ${VERSION}).\n\nDossiers créés à côté du classeur : images, prep, exports, config, secret.`;
  if (!lireConfig().jeton_admin_hache) {
    const jeton = jetonAleatoire();
    ecrireConfig('jeton_admin_hache', hacher(jeton));
    message += `\n\nJeton administrateur (à noter, il ne sera plus affiché) :\n${jeton}`;
  }
  message += '\n\nÉtapes suivantes : déployer l\'application web (voir le README), puis ajouter des sélectionneurs.';
  journal('', 'admin', 'installation');
  ui().alert('Florilège', message, ui().ButtonSet.OK);
}

function ajouterSelectionneurs() {
  const rep = ui().prompt('Ajouter des sélectionneurs',
    'Prénoms (ou noms) séparés par des virgules ou des retours à la ligne :', ui().ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui().Button.OK) return;
  const noms = rep.getResponseText().split(/[,\n;]/).map(s => s.trim()).filter(Boolean);
  if (!noms.length) return;
  const existants = lireTable('Selectionneurs');
  let n = existants.reduce((m, s) => Math.max(m, Number(String(s.id).replace(/\D/g, '')) || 0), 0);
  ajouterLignes('Selectionneurs', noms.map(nom => [`s${String(++n).padStart(2, '0')}`, nom, jetonAleatoire(), 'oui', '']));
  nouvelleGeneration();
  journal('', 'admin', `sélectionneurs ajoutés : ${noms.join(', ')}`);
  afficherLiens();
}

function afficherLiens() {
  const config = lireConfig();
  const url = String(config.url_application);
  const titre = config.titre_selection ? ` « ${config.titre_selection} »` : '';
  const echapper = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lignes = lireTable('Selectionneurs').filter(s => s.id).map(s => {
    const lien = `${url}?v=${s.jeton}`;
    const message = `Bonjour ${s.nom} ! Voici ton lien personnel pour la sélection de photos${titre} : ${lien}\n`
      + 'Pas besoin de compte : ouvre-le sur ton téléphone ou ton ordinateur, tu peux t\'arrêter et reprendre quand tu veux.';
    return `<h3>${echapper(s.nom)}${String(s.actif).toLowerCase() === 'non' ? ' (désactivé)' : ''}</h3>
      <textarea rows="4" onclick="this.select()">${echapper(message)}</textarea>`;
  }).join('');
  const html = HtmlService.createHtmlOutput(`
    <style>body{font-family:sans-serif;font-size:14px}textarea{width:100%;font-size:13px}h3{margin:14px 0 4px}</style>
    <p>Cliquez dans un message pour le sélectionner, puis copiez-le (Ctrl+C) dans un mail ou WhatsApp.</p>
    ${lignes || '<p>Aucun sélectionneur pour l\'instant.</p>'}`).setWidth(560).setHeight(520);
  ui().showModalDialog(html, 'Liens personnels');
}

// ---------------------------------------------------------------- photos de test

// Crée des photos factices (dessins SVG) dans images/_test pour essayer l'application
// avant d'avoir préparé les vraies photos.
function creerPhotosDeTest() {
  const ok = ui().alert('Photos de test',
    'Créer 3 ensembles de photos factices (72 images SVG) ? Les onglets Ensembles et Photos seront remplacés.',
    ui().ButtonSet.OK_CANCEL);
  if (ok !== ui().Button.OK) return;
  const dossier = sousDossier(dossierImages(), '_test');
  const ensembles = [
    ['t1', 'Test — Plage', 24, 200],
    ['t2', 'Test — Fête', 36, 20],
    ['t3', 'Test — Montagne', 12, 110],
  ];
  const formats = [[1080, 810], [810, 1080], [1080, 810], [1080, 608], [1080, 1080]];
  const lignesEnsembles = [];
  const lignesPhotos = [];
  ensembles.forEach(([id, nom, nb, teinte], k) => {
    lignesEnsembles.push([id, nom, k + 1, nb]);
    for (let i = 1; i <= nb; i++) {
      const pid = `${id}p${String(i).padStart(3, '0')}`;
      const [L, H] = formats[(i * 7 + k) % formats.length];
      const fichier = dossier.createFile(Utilities.newBlob(svgDeTest(nom, i, L, H, teinte + i * 9), 'image/svg+xml', `${pid}.svg`));
      lignesPhotos.push([pid, id, `${pid}.svg`, `${pid}.svg`, fichier.getId(), fichier.getId(), L, H, '', i]);
    }
  });
  remplacerTable('Ensembles', lignesEnsembles);
  remplacerTable('Photos', lignesPhotos);
  nouvelleGeneration();
  journal('', 'admin', 'photos de test créées');
  ui().alert('Florilège', `${lignesPhotos.length} photos de test créées dans images/_test.`, ui().ButtonSet.OK);
}

function svgDeTest(nom, numero, L, H, teinte) {
  const t = Math.round(teinte) % 360;
  const collines = [0.6, 0.72, 0.84].map((base, k) => {
    const y = Math.round(H * base);
    const pts = [];
    for (let x = 0; x <= 6; x++) pts.push(`${Math.round(L * x / 6)},${y - Math.round(H * 0.08 * ((x * 37 + numero * 13 + k * 7) % 5) / 4)}`);
    return `<polygon points="0,${H} ${pts.join(' ')} ${L},${H}" fill="hsl(${(t + 140 + k * 15) % 360},${40 + k * 10}%,${45 - k * 10}%)"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">
  <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${t},70%,62%)"/><stop offset="1" stop-color="hsl(${(t + 30) % 360},60%,85%)"/></linearGradient></defs>
  <rect width="${L}" height="${H}" fill="url(#c)"/>
  <circle cx="${Math.round(L * (0.2 + (numero % 5) * 0.15))}" cy="${Math.round(H * 0.22)}" r="${Math.round(Math.min(L, H) * 0.08)}" fill="#ffe27a"/>
  ${collines}
  <rect x="20" y="20" width="${Math.round(L * 0.75)}" height="${Math.round(Math.min(L, H) * 0.12)}" fill="rgba(0,0,0,.45)"/>
  <text x="36" y="${20 + Math.round(Math.min(L, H) * 0.09)}" font-family="sans-serif" font-weight="700" font-size="${Math.round(Math.min(L, H) * 0.075)}" fill="#fff">${nom} · n° ${numero}</text>
</svg>`;
}

// Utilise de vraies photos déposées dans images/<nom de l'ensemble>/ (une photo = un fichier).
// Les miniatures sont alors les vignettes générées par Drive. Pratique pour un essai ; les vraies
// sélections passeront par le script de préparation (jalon 3), qui produit des images allégées.
function importerSousDossiers() {
  const racine = dossierImages();
  const sousDossiers = [];
  const it = racine.getFolders();
  while (it.hasNext()) {
    const d = it.next();
    if (!d.getName().startsWith('_')) sousDossiers.push(d);
  }
  if (!sousDossiers.length) {
    ui().alert('Florilège', 'Aucun sous-dossier dans images/. Créez-y un dossier par ensemble et déposez-y des photos.', ui().ButtonSet.OK);
    return;
  }
  sousDossiers.sort((a, b) => a.getName().localeCompare(b.getName()));
  const ok = ui().alert('Utiliser mes photos',
    `${sousDossiers.length} sous-dossier(s) trouvé(s). Les onglets Ensembles et Photos seront remplacés. Continuer ?`,
    ui().ButtonSet.OK_CANCEL);
  if (ok !== ui().Button.OK) return;
  const lignesEnsembles = [];
  const lignesPhotos = [];
  sousDossiers.forEach((d, k) => {
    const eid = `e${String(k + 1).padStart(2, '0')}`;
    const fichiers = [];
    const f = d.getFiles();
    while (f.hasNext()) {
      const fichier = f.next();
      if (/^image\//.test(fichier.getMimeType())) fichiers.push(fichier);
    }
    fichiers.sort((a, b) => a.getName().localeCompare(b.getName()));
    lignesEnsembles.push([eid, d.getName(), k + 1, fichiers.length]);
    fichiers.forEach((fichier, i) => {
      // Dimensions inconnues ici (0) : l'application les déduit de la miniature.
      lignesPhotos.push([`${eid}p${String(i + 1).padStart(3, '0')}`, eid, fichier.getName(), '', fichier.getId(), '', 0, 0, '', i + 1]);
    });
  });
  remplacerTable('Ensembles', lignesEnsembles);
  remplacerTable('Photos', lignesPhotos);
  nouvelleGeneration();
  journal('', 'admin', `photos importées depuis ${sousDossiers.length} sous-dossiers`);
  ui().alert('Florilège', `${lignesPhotos.length} photos dans ${lignesEnsembles.length} ensemble(s).`, ui().ButtonSet.OK);
}

// Associe à chaque photo de l'onglet Photos l'identifiant Drive de son image et de sa miniature
// (noms produits par le script de préparation), et signale les images manquantes.
function indexerImages() {
  const parNom = {};
  (function parcourir(dossier) {
    const f = dossier.getFiles();
    while (f.hasNext()) { const fichier = f.next(); parNom[fichier.getName()] = fichier.getId(); }
    const d = dossier.getFolders();
    while (d.hasNext()) parcourir(d.next());
  })(dossierImages());

  const feuille = onglet('Photos');
  const n = feuille.getLastRow() - 1;
  if (n < 1) { ui().alert('Florilège', 'L\'onglet Photos est vide.', ui().ButtonSet.OK); return; }
  const plage = feuille.getRange(2, 1, n, ONGLETS.Photos.length);
  const lignes = plage.getValues();
  const manquantes = [];
  const utilises = new Set();
  lignes.forEach(l => {
    const [id, , fichier, miniature] = l;
    if (!id) return;
    l[4] = parNom[fichier] || '';
    l[5] = parNom[miniature] || '';
    if (!l[4] || (miniature && !l[5])) manquantes.push(id);
    utilises.add(fichier); utilises.add(miniature);
  });
  plage.setValues(lignes);
  nouvelleGeneration();
  const enTrop = Object.keys(parNom).filter(nom => !utilises.has(nom)).length;
  journal('', 'admin', `indexation : ${n} photos, ${manquantes.length} sans image, ${enTrop} image(s) sans photo`);
  ui().alert('Indexation terminée',
    `${n} photos.\nPhotos sans image : ${manquantes.length}${manquantes.length ? ` (par ex. ${manquantes.slice(0, 5).join(', ')})` : ''}.\n`
    + `Images sans photo : ${enTrop}.\n\nSi des images manquent, attendez la fin de la synchronisation de Google Drive puis relancez.`,
    ui().ButtonSet.OK);
}

// ---------------------------------------------------------------- phases

function ouvrirManche1() {
  ecrireConfig('phase', 'manche1');
  journal('', 'admin', 'manche 1 ouverte');
  ui().alert('Florilège', 'La manche 1 est ouverte : les sélectionneurs peuvent trier.', ui().ButtonSet.OK);
}

function mettreEnAttente() {
  ecrireConfig('phase', 'attente');
  journal('', 'admin', 'mise en attente');
  ui().alert('Florilège', 'Phase en attente : les sélectionneurs voient un message d\'attente.', ui().ButtonSet.OK);
}

function effacerVotes() {
  const ok = ui().alert('Effacer tous les votes',
    'Tous les votes enregistrés seront supprimés définitivement. À réserver aux essais. Continuer ?', ui().ButtonSet.OK_CANCEL);
  if (ok !== ui().Button.OK) return;
  remplacerTable('Votes', []);
  CacheService.getScriptCache().remove('collectif');
  journal('', 'admin', 'votes effacés');
}

function aPropos() {
  ui().alert('Florilège',
    `Florilège ${VERSION} — sélection collective de photos.\nUn logiciel CGExcel (cgexcel.wordpress.com) — © 2026 Cyrille Gindre.\n`
    + 'Licence MIT + BAL 1.0 (Bonne Action License). En échange, une seule chose vous est demandée, sur l\'honneur : '
    + 'faire une bonne action chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c\'est vous qui voyez.',
    ui().ButtonSet.OK);
}
