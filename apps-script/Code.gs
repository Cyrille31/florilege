/**
 * Florilège — script Apps Script lié au Google Sheet de la sélection (fonctionnement simplifié).
 *
 * Organisation du dossier Google Drive (celui qui contient ce classeur) :
 *   2001/ , 2002/ …              photos originales (avec d'éventuels sous-dossiers)
 *   2001-allégé/ , 2002-allégé/  copies réduites, même arborescence (créées par prep/reduire_photos.py)
 *   florilege-photos.json        liste des photos, créée par le menu « Mettre à jour la liste des photos »
 *
 * Le classeur n'a qu'une feuille, « Choix » : une ligne par photo et par testeur
 *   Photo | Dossier | Choix | Testeur | Horodatage
 * (Choix : cœur, étoile, x ou non classé ; Dossier : chemin relatif dans l'arborescence d'origine).
 *
 * Les testeurs s'identifient par leur nom dans l'application ; en redonnant le même nom, ils retrouvent
 * leur avancement. Un ensemble = un dossier d'année (ses sous-dossiers sont regroupés).
 *
 * Déploiement : voir le README (Extensions → Apps Script, coller ce fichier et appsscript.json,
 * déployer en application web « Exécuter en tant que : moi », « Accès : tout le monde »).
 *
 * © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (Bonne Action License).
 * En échange, une seule chose vous est demandée, sur l'honneur : faire une bonne action chaque jour.
 * Aider un voisin, sourire à un inconnu, ramasser un papier… c'est vous qui voyez.
 */

const VERSION = '0.13.0';

// Réglages (modifiables ici).
const REGLAGES = {
  titre: '',                      // nom de la sélection affiché sous « Florilège »
  maxCoupsDeCoeur: 4,             // étoiles autorisées par ensemble (dossier d'année)
  suffixe: '-allégé',             // suffixe des dossiers de photos réduites
  fichierListe: 'florilege-photos.json',
  feuille: 'Choix',
  application: 'https://cyrille31.github.io/florilege/', // adresse de l'application (GitHub Pages)
};

const COLONNES = ['Photo', 'Dossier', 'Choix', 'Testeur', 'Horodatage'];
const CHOIX = { 0: 'x', 1: 'cœur', 2: 'étoile' };
const NON_CLASSE = 'non classé';
const DUREE_CACHE = 21600; // 6 h, le maximum de CacheService
const FICHIER_ENCOURS = 'florilege-photos-encours.json';
const FUSEAU = 'Europe/Paris';

// ============================================================================ outils

function classeur() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// La feuille « Choix » ; créée au besoin (la feuille vide d'un classeur neuf est renommée).
function feuilleChoix() {
  const ss = classeur();
  let f = ss.getSheetByName(REGLAGES.feuille);
  if (!f) {
    const feuilles = ss.getSheets();
    f = feuilles.length === 1 && feuilles[0].getLastRow() === 0 ? feuilles[0].setName(REGLAGES.feuille) : ss.insertSheet(REGLAGES.feuille);
  }
  if (f.getLastRow() === 0) {
    f.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES]).setFontWeight('bold').setBackground('#e6f2ee');
    f.setFrozenRows(1);
    // Tout en texte : évite qu'un dossier « 2001 » devienne un nombre ou l'horodatage une date.
    f.getRange(1, 1, f.getMaxRows(), COLONNES.length).setNumberFormat('@');
  }
  return f;
}

function lireChoix() {
  const f = feuilleChoix();
  const n = f.getLastRow() - 1;
  return n > 0 ? f.getRange(2, 1, n, COLONNES.length).getValues() : [];
}

// Clé de comparaison d'un nom de testeur : sans espaces superflus ni différence de majuscules.
function cleTesteur(nom) {
  return String(nom || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function dossierSelection() {
  const parents = DriveApp.getFileById(classeur().getId()).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function estDossierAllege(nom) {
  const n = String(nom).normalize('NFC').toLowerCase();
  return n.endsWith(REGLAGES.suffixe.normalize('NFC').toLowerCase()) || n.endsWith('-allege');
}

// IMG_1.HEIC.jpg → IMG_1.HEIC (le script de réduction ajoute « .jpg » aux photos non JPEG).
function nomOriginal(nom) {
  const m = /^(.*\.(heic|heif|png|tif|tiff|bmp|webp|gif))\.jpe?g$/i.exec(nom);
  return m ? m[1] : nom;
}

// Une image : reconnue comme telle par Google Drive, ou à défaut d'après son extension
// (Drive classe parfois un JPEG envoyé par le navigateur en « application/octet-stream »).
const EXTENSIONS_IMAGES = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
function estImage(e) {
  return /^image\//.test(e.type || '') || EXTENSIONS_IMAGES.test(e.nom || '');
}

function typeImage(blob, nom) {
  const type = blob.getContentType() || '';
  if (/^image\//.test(type)) return type;
  return /\.png$/i.test(nom) ? 'image/png' : 'image/jpeg';
}

function generation() {
  return PropertiesService.getScriptProperties().getProperty('generation') || '1';
}

function maintenantLisible(date) {
  return Utilities.formatDate(date || new Date(), FUSEAU, 'yyyy-MM-dd HH:mm:ss');
}

// ============================================================================ liste des photos

// Lit la liste des photos (fichier JSON du dossier), avec un cache découpé en morceaux de 90 Ko.
function listePhotos() {
  const cache = CacheService.getScriptCache();
  const prefixe = `liste_${generation()}_`;
  const n = Number(cache.get(`${prefixe}n`) || 0);
  if (n) {
    const morceaux = cache.getAll(Array.from({ length: n }, (_, k) => prefixe + k));
    if (Object.keys(morceaux).length === n) {
      return JSON.parse(Array.from({ length: n }, (_, k) => morceaux[prefixe + k]).join(''));
    }
  }
  const it = dossierSelection().getFilesByName(REGLAGES.fichierListe);
  if (!it.hasNext()) return { photos: [], date: '' };
  const texte = it.next().getBlob().getDataAsString('UTF-8');
  const parts = {};
  let k = 0;
  for (let i = 0; i < texte.length; i += 90000) parts[prefixe + k++] = texte.slice(i, i + 90000);
  parts[`${prefixe}n`] = String(k);
  cache.putAll(parts, DUREE_CACHE);
  return JSON.parse(texte);
}

function indexParId() {
  const index = {};
  for (const p of listePhotos().photos) index[p.id] = p;
  return index;
}

// Recense les dossiers « -allégé » (et leurs sous-dossiers). Utilise le service avancé Drive
// (plus rapide, donne les dimensions) s'il est activé, sinon DriveApp.
// Si le temps manque (limite de 6 minutes), l'état est mémorisé et la relance reprend où elle s'était arrêtée.
function mettreAJourListe() {
  const ui = SpreadsheetApp.getUi();
  const r = calculerListe();
  if (r.statut === 'aucun') {
    ui.alert('Florilège', `Aucun dossier « …${REGLAGES.suffixe} » à côté du classeur. Lancez d'abord « Créer les photos allégées » (ou l'outil de réduction sur votre PC).`, ui.ButtonSet.OK);
  } else if (r.statut === 'interrompu') {
    ui.alert('Florilège', `${r.nb} photos recensées pour l'instant. Le temps autorisé par Google est presque écoulé : relancez « Mettre à jour la liste des photos » pour terminer.`, ui.ButtonSet.OK);
  } else {
    ui.alert('Liste des photos à jour', r.message, ui.ButtonSet.OK);
  }
}

// Recense les photos des dossiers « -allégé » et écrit florilege-photos.json.
// Renvoie { statut: 'aucun' | 'interrompu' | 'fini', nb, message } ; sans fenêtre (utilisable par un déclencheur).
function calculerListe(dureeMax) {
  const debut = Date.now();
  const limite = dureeMax || 4.5 * 60 * 1000;
  const racine = dossierSelection();
  const proprietes = PropertiesService.getScriptProperties();
  // Mise à jour interrompue (temps écoulé) : son état est gardé dans un fichier temporaire du dossier.
  const fichierEncours = racine.getFilesByName(FICHIER_ENCOURS);
  const temp = fichierEncours.hasNext() ? fichierEncours.next() : null;
  let encours = temp ? JSON.parse(temp.getBlob().getDataAsString('UTF-8')) : null;
  if (!encours) {
    const file = [];
    const it = racine.getFolders();
    while (it.hasNext()) {
      const d = it.next();
      if (estDossierAllege(d.getName())) {
        const annee = d.getName().normalize('NFC').replace(/-all[eé]g[eé]$/i, '');
        file.push({ id: d.getId(), annee, rel: annee });
      }
    }
    if (!file.length) return { statut: 'aucun', nb: 0, message: '' };
    encours = { file, photos: [], ignores: [] };
  }
  while (encours.file.length) {
    if (Date.now() - debut > limite) {
      if (temp) temp.setContent(JSON.stringify(encours));
      else racine.createFile(FICHIER_ENCOURS, JSON.stringify(encours), 'application/json');
      return { statut: 'interrompu', nb: encours.photos.length, message: '' };
    }
    const d = encours.file.shift();
    for (const e of contenuDossier(d.id)) {
      if (e.dossier) encours.file.push({ id: e.id, annee: d.annee, rel: `${d.rel}/${e.nom}` });
      else if (estImage(e)) {
        const nom = nomOriginal(e.nom);
        encours.photos.push({ id: `${d.rel}/${nom}`, e: d.annee, dossier: d.rel, nom, d: e.id, l: e.l || 0, h: e.h || 0 });
      } else {
        // Fichier que Google Drive ne reconnaît pas comme une image : signalé à la fin.
        (encours.ignores = encours.ignores || []).push(`${d.rel}/${e.nom} (${e.type || 'type inconnu'})`);
      }
    }
  }
  if (temp) temp.setTrashed(true);
  // Dossiers envoyés deux fois par le navigateur (« 2001-allégé » en double) : ils sont réunis,
  // et une même photo (même dossier relatif, même nom) n'est gardée qu'une fois.
  const vues = {};
  const nbAvant = encours.photos.length;
  encours.photos = encours.photos.filter(p => (vues[p.id] ? false : (vues[p.id] = true)));
  const doublons = nbAvant - encours.photos.length;
  const ignores = encours.ignores || [];
  encours.photos.sort((a, b) => trierNoms(a.e, b.e) || trierNoms(a.dossier, b.dossier) || trierNoms(a.nom, b.nom));
  const contenu = JSON.stringify({ date: maintenantLisible(), photos: encours.photos });
  const it = racine.getFilesByName(REGLAGES.fichierListe);
  if (it.hasNext()) it.next().setContent(contenu);
  else racine.createFile(REGLAGES.fichierListe, contenu, 'application/json');
  proprietes.setProperty('generation', String(Date.now()));
  feuilleChoix();

  const parAnnee = {};
  encours.photos.forEach(p => { parAnnee[p.e] = (parAnnee[p.e] || 0) + 1; });
  const detail = Object.keys(parAnnee).sort(trierNoms).map(a => `${a} : ${parAnnee[a]}`).join('\n');
  const message = `${encours.photos.length} photos.\n\n${detail}`
    + (doublons ? `\n\n${doublons} photo(s) en double ignorée(s) (dossier envoyé deux fois dans Google Drive).` : '')
    + (ignores.length ? `\n\n${ignores.length} fichier(s) non reconnu(s) comme image et ignoré(s)`
      + ` :\n${ignores.slice(0, 15).join('\n')}${ignores.length > 15 ? '\n…' : ''}` : '');
  return { statut: 'fini', nb: encours.photos.length, message };
}

function trierNoms(a, b) {
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}

// Contenu d'un dossier : service avancé Drive s'il est activé (plus rapide, dimensions comprises), sinon DriveApp.
function contenuDossier(idDossier) {
  return typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list ? contenuAvance(idDossier) : contenuDriveApp(idDossier);
}

// Contenu d'un dossier via l'API Drive (service avancé) : 1 000 éléments par appel, dimensions comprises.
function contenuAvance(idDossier) {
  const res = [];
  let page;
  do {
    const r = Drive.Files.list({
      q: `'${idDossier}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, description, modifiedTime, imageMediaMetadata(width, height))',
      pageSize: 1000,
      pageToken: page,
    });
    for (const f of r.files || []) {
      const meta = f.imageMediaMetadata || {};
      res.push({
        id: f.id, nom: f.name, type: f.mimeType, dossier: f.mimeType === 'application/vnd.google-apps.folder',
        l: meta.width, h: meta.height, description: f.description || '', modifie: f.modifiedTime || '',
      });
    }
    page = r.nextPageToken;
  } while (page);
  return res;
}

// Contenu d'un dossier via DriveApp (plus lent, sans les dimensions : l'application les déduit des images).
function contenuDriveApp(idDossier) {
  const d = DriveApp.getFolderById(idDossier);
  const res = [];
  const sous = d.getFolders();
  while (sous.hasNext()) { const s = sous.next(); res.push({ id: s.getId(), nom: s.getName(), dossier: true }); }
  const fichiers = d.getFiles();
  while (fichiers.hasNext()) {
    const f = fichiers.next();
    res.push({ id: f.getId(), nom: f.getName(), type: f.getMimeType(), description: f.getDescription() || '', modifie: f.getLastUpdated().toISOString() });
  }
  return res;
}

// ============================================================================ photos allégées dans Google Drive
// Pour chaque dossier d'année (nom commençant par un chiffre), crée « <année>-allégé » avec la même
// arborescence : chaque photo y est remplacée par la version réduite (1 080 px) que Google Drive fabrique
// pour ses aperçus (sans métadonnées, orientation appliquée). Rien à installer sur un PC.
// Google limitant une exécution à 6 minutes, le travail se poursuit seul, par tranches, en tâche de fond.
// Relance sans risque : une copie déjà faite (et dont l'original n'a pas changé) n'est pas refaite ;
// les copies faites par l'outil PC (prep/reduire_photos.py) sont laissées telles quelles.

const FICHIER_REDUCTION = 'florilege-reduction-encours.json';
const TAILLE_REDUITE = 1080;
const DOSSIERS_IGNORES = /^(_?originaux_picasa|_catalogue_picasa|\.picasaoriginals)$/i;

function estDossierAnnee(nom) {
  return /^\d/.test(String(nom)) && !estDossierAllege(nom);
}

// Même règle que l'outil PC : JPEG → même nom ; autres formats → « .jpg » ajouté (IMG_1.HEIC → IMG_1.HEIC.jpg).
function nomReduit(nom) {
  return /\.jpe?g$/i.test(nom) ? nom : `${nom}.jpg`;
}

function creerPhotosAllegees() {
  const ui = SpreadsheetApp.getUi();
  if (typeof Drive === 'undefined' || !Drive.Files) {
    ui.alert('Florilège', 'Le service avancé « Drive » n\'est pas activé : remplacez appsscript.json par la version du dépôt GitHub, puis réessayez.', ui.ButtonSet.OK);
    return;
  }
  const annees = [];
  const it = dossierSelection().getFolders();
  while (it.hasNext()) { const d = it.next(); if (estDossierAnnee(d.getName())) annees.push(d.getName()); }
  if (!annees.length) {
    ui.alert('Florilège', 'Aucun dossier d\'année (nom commençant par un chiffre, par exemple « 2001 ») à côté du classeur.', ui.ButtonSet.OK);
    return;
  }
  const encours = lireFichierJson(FICHIER_REDUCTION);
  const ok = ui.alert('Créer les photos allégées',
    (encours ? 'Une création est déjà en cours : elle va reprendre.\n\n' : '')
    + `Dossiers d'année trouvés : ${annees.sort(trierNoms).join(', ')}.\n\n`
    + 'Le travail se fait en tâche de fond, par tranches de quelques minutes (compter environ une heure pour 3 000 photos). '
    + 'Vous pouvez fermer le classeur ; suivez l\'avancement avec « État de la création des photos allégées ». '
    + 'À la fin, la liste des photos est mise à jour automatiquement.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('reduction_bilan', 'En cours : la première tranche démarre dans une minute environ.');
  planifierSuiteReduction(5);
  ss().toast('La création des photos allégées démarre dans une minute environ.', 'Florilège', 8);
}

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function etatReduction() {
  const ui = SpreadsheetApp.getUi();
  const encours = lireFichierJson(FICHIER_REDUCTION);
  const bilan = PropertiesService.getScriptProperties().getProperty('reduction_bilan') || 'Aucune création de photos allégées lancée pour l\'instant.';
  const planifiee = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'poursuivreReduction');
  ui.alert('Photos allégées',
    (encours ? `En cours : ${encours.faites} photo(s) réduite(s), ${encours.file.length} dossier(s) restant(s) à parcourir.`
      + (planifiee ? '\nLa prochaine tranche est programmée.' : '\nAucune tranche programmée : relancez « Créer les photos allégées ».') + '\n\n' : '')
    + bilan, ui.ButtonSet.OK);
}

function lireFichierJson(nom) {
  const it = dossierSelection().getFilesByName(nom);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}

function ecrireFichierJson(nom, objet) {
  const racine = dossierSelection();
  const it = racine.getFilesByName(nom);
  if (it.hasNext()) it.next().setContent(JSON.stringify(objet));
  else racine.createFile(nom, JSON.stringify(objet), 'application/json');
}

function supprimerFichier(nom) {
  const it = dossierSelection().getFilesByName(nom);
  while (it.hasNext()) it.next().setTrashed(true);
}

function planifierSuiteReduction(secondes) {
  supprimerSuiteReduction();
  ScriptApp.newTrigger('poursuivreReduction').timeBased().after((secondes || 60) * 1000).create();
}

function supprimerSuiteReduction() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'poursuivreReduction').forEach(t => ScriptApp.deleteTrigger(t));
}

// Appelée par le déclencheur : traite une tranche, puis programme la suivante s'il reste du travail.
function poursuivreReduction() {
  // Verrou propre à la réduction (l'enregistrement des choix utilise le verrou du script : il n'est pas bloqué).
  const verrou = LockService.getDocumentLock();
  if (!verrou.tryLock(5000)) return;
  try {
    reduireUneTranche(4.5 * 60 * 1000);
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty('reduction_bilan', `Erreur : ${err.message || err}. Relancez « Créer les photos allégées ».`);
    throw err;
  } finally {
    verrou.releaseLock();
  }
}

function reduireUneTranche(dureeMax) {
  const debut = Date.now();
  const proprietes = PropertiesService.getScriptProperties();
  const racine = dossierSelection();
  let etat = lireFichierJson(FICHIER_REDUCTION);
  if (!etat) {
    const dossiers = {};
    const it = racine.getFolders();
    while (it.hasNext()) { const d = it.next(); dossiers[d.getName().normalize('NFC')] = dossiers[d.getName().normalize('NFC')] || d; }
    const file = [];
    for (const nom of Object.keys(dossiers).filter(estDossierAnnee).sort(trierNoms)) {
      const cible = dossiers[`${nom}${REGLAGES.suffixe}`.normalize('NFC')] || racine.createFolder(`${nom}${REGLAGES.suffixe}`);
      file.push({ src: dossiers[nom].getId(), dst: cible.getId(), rel: nom });
    }
    etat = { file, faites: 0, erreurs: [], attente: [], debut: maintenantLisible() };
  }

  const tempsEcoule = () => Date.now() - debut > dureeMax;
  while (etat.file.length) {
    const d = etat.file[0];
    const sousTaches = [];
    const existants = {};
    const sousDossiers = {};
    for (const e of contenuDossier(d.dst)) (e.dossier ? sousDossiers : existants)[e.nom] = e;
    let dossierCible = null;
    let interrompu = false;
    for (const e of contenuDossier(d.src)) {
      if (e.dossier) {
        if (DOSSIERS_IGNORES.test(e.nom) || e.nom.startsWith('.')) continue;
        if (!sousDossiers[e.nom]) {
          dossierCible = dossierCible || DriveApp.getFolderById(d.dst);
          sousDossiers[e.nom] = { id: dossierCible.createFolder(e.nom).getId(), dossier: true };
        }
        sousTaches.push({ src: e.id, dst: sousDossiers[e.nom].id, rel: `${d.rel}/${e.nom}` });
        continue;
      }
      if (!estImage(e)) continue;
      const nom = nomReduit(e.nom);
      const marque = `florilege:${e.id}:${e.modifie}`;
      const deja = existants[nom];
      if (deja && (deja.description === marque || !String(deja.description).startsWith('florilege:'))) continue; // à jour
      if (tempsEcoule()) { interrompu = true; break; }
      try {
        const blob = versionReduite(e.id);
        if (!blob) { etat.attente.push(`${d.rel}/${e.nom}`); continue; }
        if (deja) DriveApp.getFileById(deja.id).setTrashed(true); // l'original a changé : copie refaite
        dossierCible = dossierCible || DriveApp.getFolderById(d.dst);
        dossierCible.createFile(blob.setName(nom)).setDescription(marque);
        etat.faites++;
      } catch (err) {
        etat.erreurs.push(`${d.rel}/${e.nom} : ${err.message || err}`);
      }
    }
    if (interrompu) break;
    etat.file.shift();
    etat.file.push(...sousTaches);
    if (tempsEcoule()) break;
  }

  if (etat.file.length) {
    ecrireFichierJson(FICHIER_REDUCTION, etat);
    proprietes.setProperty('reduction_bilan', `En cours depuis le ${etat.debut} : ${etat.faites} photo(s) réduite(s) pour l'instant.`);
    planifierSuiteReduction(60);
    return { statut: 'en cours', etat };
  }

  // Terminé : bilan, puis mise à jour de la liste des photos.
  supprimerFichier(FICHIER_REDUCTION);
  supprimerSuiteReduction();
  const attente = Array.from(new Set(etat.attente));
  let bilan = `Terminé le ${maintenantLisible()} : ${etat.faites} photo(s) réduite(s).`
    + (attente.length ? `\n${attente.length} photo(s) dont Google Drive n'a pas encore préparé l'aperçu (photos très récentes) : relancez plus tard.` : '')
    + (etat.erreurs.length ? `\n${etat.erreurs.length} erreur(s), par exemple :\n${etat.erreurs.slice(0, 5).join('\n')}` : '');
  const liste = calculerListe(Math.max(30000, dureeMax - (Date.now() - debut)));
  bilan += liste.statut === 'fini' ? `\n\nListe des photos mise à jour : ${liste.nb} photos.`
    : '\n\nLa liste des photos n\'a pas pu être terminée : lancez « Mettre à jour la liste des photos ».';
  proprietes.setProperty('reduction_bilan', bilan.slice(0, 8000));
  return { statut: 'fini', etat };
}

// Version réduite d'une image, fabriquée par Google Drive (celle de ses aperçus), à la taille voulue.
function versionReduite(idFichier) {
  const f = Drive.Files.get(idFichier, { fields: 'thumbnailLink' });
  if (!f.thumbnailLink) return null; // aperçu pas encore prêt
  const url = /=s\d+[^/]*$/.test(f.thumbnailLink)
    ? f.thumbnailLink.replace(/=s\d+[^/]*$/, `=s${TAILLE_REDUITE}`)
    : `${f.thumbnailLink}=s${TAILLE_REDUITE}`;
  const rep = UrlFetchApp.fetch(url, { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true });
  if (rep.getResponseCode() !== 200) throw new Error(`aperçu refusé par Google Drive (code ${rep.getResponseCode()})`);
  return rep.getBlob();
}

// ============================================================================ installation (nouvel organisateur)

// Fenêtre d'installation : petit explorateur de dossiers Google Drive (ou lien collé), puis mot de passe.
function installer() {
  const html = HtmlService.createHtmlOutput(PAGE_INSTALLATION).setWidth(600).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Installer Florilège');
}

function echapperHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Identifiant d'un dossier à partir d'un lien Google Drive (ou de l'identifiant lui-même).
function extraireIdDossier(texte) {
  const t = String(texte || '').trim();
  const m = /folders\/([\w-]+)/.exec(t) || /[?&]id=([\w-]+)/.exec(t) || /^([\w-]{15,})$/.exec(t);
  return m ? m[1] : '';
}

// Appelée par la fenêtre : contenu d'un dossier (sous-dossiers, fil d'Ariane, nombre de dossiers d'année).
function listerDossiers(idOuLien) {
  let dossier;
  const id = extraireIdDossier(idOuLien);
  if (idOuLien === 'racine') dossier = DriveApp.getRootFolder();
  else if (id) {
    try { dossier = DriveApp.getFolderById(id); } catch (err) { throw new Error('Dossier introuvable : vérifiez le lien.'); }
  } else dossier = dossierSelection();
  const chemin = [];
  let courant = dossier;
  for (let k = 0; k < 12; k++) {
    chemin.unshift({ id: courant.getId(), nom: courant.getName() });
    const parents = courant.getParents();
    if (!parents.hasNext()) break;
    courant = parents.next();
  }
  const enfants = [];
  const it = dossier.getFolders();
  while (it.hasNext()) {
    const d = it.next();
    enfants.push({ id: d.getId(), nom: d.getName(), annee: estDossierAnnee(d.getName()), allege: estDossierAllege(d.getName()) });
  }
  enfants.sort((x, y) => trierNoms(x.nom, y.nom));
  return { id: dossier.getId(), nom: dossier.getName(), chemin, enfants, nbAnnees: enfants.filter(e => e.annee).length };
}

// Appelée par la fenêtre : range le classeur dans le dossier choisi, mot de passe, feuille Choix.
// Renvoie le texte HTML des étapes suivantes.
function installerDans(idDossier, motDePasse) {
  const dossier = DriveApp.getFolderById(idDossier);
  if (dossier.getId() !== dossierSelection().getId()) DriveApp.getFileById(ss().getId()).moveTo(dossier);
  const proprietes = PropertiesService.getScriptProperties();
  const mdp = normaliserMotDePasse(motDePasse);
  if (mdp) proprietes.setProperty('mot_de_passe', mdp);
  feuilleChoix();
  proprietes.setProperty('installe', 'oui');
  const annees = [];
  const it = dossier.getFolders();
  while (it.hasNext()) { const d = it.next(); if (estDossierAnnee(d.getName())) annees.push(d.getName()); }
  // getUrl() renvoie souvent l'adresse du déploiement de test : seule une vraie réponse du serveur fait foi.
  const deploye = verifierServeur(idDeploiement(urlApplicationWeb())).ok;
  return `<p>✅ Le classeur est rangé dans <b>${echapperHtml(dossier.getName())}</b>
      (${annees.length ? `dossiers d'année : ${echapperHtml(annees.sort(trierNoms).join(', '))}` : 'aucun dossier d\'année pour l\'instant'}).<br>
      ${mdp ? `Mot de passe commun : <b>${echapperHtml(mdp)}</b>.` : (proprietes.getProperty('mot_de_passe') ? 'Mot de passe commun inchangé.' : 'Pas de mot de passe : l\'application est ouverte à qui en a le lien.')}</p>
    <p><b>Étapes suivantes :</b></p>
    <ol>
      ${deploye ? '<li>L\'application web est déjà publiée.</li>' : `<li><b>Publier l'application web de ce classeur</b> (une seule fois ; une copie du modèle n'est jamais publiée d'office) :
        menu <i>Extensions → Apps Script</i>, puis <i>Déployer → Nouveau déploiement</i>, roue dentée → <i>Application Web</i>,
        « Exécuter en tant que : <b>Moi</b> », « Qui a accès : <b>Tout le monde</b> », <i>Déployer</i>, puis autoriser
        (Paramètres avancés → Accéder à…, tout cocher). <b>Copiez l'URL affichée</b> : elle sera demandée à l'étape « Lien d'invitation ».</li>`}
      <li><b>Florilège → Créer les photos allégées</b> (en tâche de fond ; la liste des photos est mise à jour à la fin).</li>
      <li><b>Florilège → Lien d'invitation pour les testeurs</b>, à envoyer avec le mot de passe.</li>
    </ol>`;
}

const PAGE_INSTALLATION = `<!doctype html><html><head><base target="_top"><style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#1d2b27;margin:0}
  h3{margin:4px 0 8px;font-size:15px}
  .chemin{margin:6px 0;color:#5b6b66;font-size:13px}
  .chemin a{color:#155e4d;cursor:pointer;text-decoration:underline}
  .liste{border:1px solid #ddd;border-radius:8px;height:230px;overflow:auto;margin:6px 0}
  .ligne{padding:7px 10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;gap:8px;align-items:center}
  .ligne:hover{background:#eef6f3}
  .ligne.annee{color:#155e4d;font-weight:bold}
  .ligne.allege{color:#999}
  .vide{padding:10px;color:#888}
  .bilan{margin:8px 0;padding:8px 10px;border-radius:8px;background:#f3f6f5}
  .bilan.ok{background:#e3f4ec}
  button{font:inherit;padding:8px 14px;border-radius:18px;border:1px solid #155e4d;background:#fff;color:#155e4d;cursor:pointer}
  button.principal{background:#155e4d;color:#fff}
  input{font:inherit;padding:7px 10px;border:1px solid #bbb;border-radius:8px;width:100%;box-sizing:border-box}
  .petit{font-size:12px;color:#777}
  .rangee{display:flex;gap:8px;align-items:center;margin-top:6px}
  #erreur{color:#c62828;margin:6px 0}
</style></head><body>
<div id="etape1">
  <h3>1. Le dossier de vos photos</h3>
  <div>Choisissez le dossier Google Drive qui contient vos dossiers de photos, un par année (« 2001 », « 2002 »…).
    Cliquez sur un dossier pour l'ouvrir.</div>
  <div class="chemin" id="chemin">Chargement…</div>
  <div class="liste" id="liste"></div>
  <div class="bilan" id="bilan"></div>
  <div class="rangee"><button class="principal" id="choisir" onclick="choisir()">Choisir ce dossier</button></div>
  <p class="petit">Ou collez le lien du dossier (l'adresse affichée par le navigateur quand le dossier est ouvert dans Google Drive),
    par exemple <i>https://drive.google.com/drive/folders/1AbCdEfGh…</i></p>
  <div class="rangee"><input id="lien" placeholder="https://drive.google.com/drive/folders/…"><button onclick="ouvrirLien()">Ouvrir</button></div>
</div>
<div id="etape2" style="display:none">
  <h3>2. Le mot de passe commun</h3>
  <div>Il sera demandé une fois à chaque testeur, avec son prénom (majuscules et espaces ne comptent pas).
    Laisser vide pour ne pas en mettre (ou garder celui déjà défini).</div>
  <div class="rangee"><input id="mdp" placeholder="Mot de passe commun"></div>
  <div class="rangee"><button onclick="retour()">‹ Changer de dossier</button><button class="principal" onclick="terminer()">Terminer l'installation</button></div>
</div>
<div id="etape3" style="display:none"><div id="fin"></div><div class="rangee"><button class="principal" onclick="google.script.host.close()">Fermer</button></div></div>
<div id="erreur"></div>
<script>
  let courant = null;
  function echapper(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function erreur(e) { document.getElementById('erreur').textContent = e && e.message ? e.message : String(e); }
  function charger(id) {
    document.getElementById('erreur').textContent = '';
    document.getElementById('liste').innerHTML = '<div class="vide">Chargement…</div>';
    google.script.run.withSuccessHandler(afficher).withFailureHandler(erreur).listerDossiers(id);
  }
  function afficher(d) {
    courant = d;
    document.getElementById('chemin').innerHTML = '<a onclick="charger(\\'racine\\')">Mon Drive</a>' + d.chemin.slice(1)
      .map(c => ' › <a onclick="charger(\\'' + c.id + '\\')">' + echapper(c.nom) + '</a>').join('');
    document.getElementById('liste').innerHTML = d.enfants.length ? d.enfants.map(e =>
      '<div class="ligne' + (e.annee ? ' annee' : '') + (e.allege ? ' allege' : '') + '" onclick="charger(\\'' + e.id + '\\')">'
      + (e.annee ? '📅' : '📁') + ' ' + echapper(e.nom) + '</div>').join('') : '<div class="vide">Aucun sous-dossier.</div>';
    const b = document.getElementById('bilan');
    b.className = 'bilan' + (d.nbAnnees ? ' ok' : '');
    b.innerHTML = d.nbAnnees ? '✅ <b>' + echapper(d.nom) + '</b> contient ' + d.nbAnnees + ' dossier(s) d\\'année : c\\'est sans doute le bon.'
      : 'Le dossier <b>' + echapper(d.nom) + '</b> ne contient pas de dossier d\\'année (nom commençant par un chiffre).';
  }
  function ouvrirLien() { const l = document.getElementById('lien').value.trim(); if (l) charger(l); }
  function choisir() {
    if (!courant) return;
    if (!courant.nbAnnees && !confirm('Ce dossier ne contient pas de dossier d\\'année. Le choisir quand même ?')) return;
    document.getElementById('etape1').style.display = 'none';
    document.getElementById('etape2').style.display = 'block';
    document.getElementById('mdp').focus();
  }
  function retour() { document.getElementById('etape2').style.display = 'none'; document.getElementById('etape1').style.display = 'block'; }
  function terminer() {
    document.getElementById('erreur').textContent = 'Installation…';
    google.script.run.withSuccessHandler(html => {
      document.getElementById('erreur').textContent = '';
      document.getElementById('etape2').style.display = 'none';
      document.getElementById('etape3').style.display = 'block';
      document.getElementById('fin').innerHTML = html;
    }).withFailureHandler(erreur).installerDans(courant.id, document.getElementById('mdp').value);
  }
  charger('');
</script></body></html>`;

// ============================================================================ mot de passe commun
// Gardé dans les propriétés privées du script (jamais dans le dépôt GitHub, qui est public).
// Majuscules et espaces en trop ne comptent pas.

function normaliserMotDePasse(mdp) {
  return String(mdp || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Lien à envoyer aux testeurs : l'adresse de l'application suivie de l'identifiant de ce serveur (?s=…).
// Ainsi, le même site sert à toutes les sélections, et l'adresse du serveur n'est pas inscrite dans GitHub.
// Adresse de l'application web. ScriptApp.getService().getUrl() n'est pas toujours fiable (ancien déploiement,
// copie d'un classeur modèle) : l'organisateur peut donc coller l'adresse exacte, gardée dans la propriété url_web.
function urlApplicationWeb() {
  const memorisee = PropertiesService.getScriptProperties().getProperty('url_web');
  if (memorisee) return memorisee;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; /* pas encore déployé */ }
}

function idDeploiement(url) {
  const m = /\/macros\/(?:a\/[^/]+\/)?s\/([\w-]{20,})\/(?:exec|dev)/.exec(String(url || '')) || /^\s*(AKfy[\w-]{20,})\s*$/.exec(String(url || ''));
  return m ? m[1] : '';
}

// Interroge l'application web comme le ferait un testeur anonyme : renvoie { ok, message }.
function verifierServeur(id) {
  if (!id) return { ok: false, message: 'Aucune application web publiée n\'a été trouvée.' };
  try {
    const rep = UrlFetchApp.fetch(`https://script.google.com/macros/s/${id}/exec`, { muteHttpExceptions: true, followRedirects: true });
    const texte = rep.getContentText();
    try {
      const json = JSON.parse(texte);
      if (json.application === 'Florilège') return { ok: true, message: `Le serveur répond (version ${json.version || '?'}).` };
    } catch (e) { /* page HTML de Google */ }
    if (/Impossible d.ouvrir le fichier|Sorry, unable to open/i.test(texte)) {
      return { ok: false, message: 'Cette adresse ne correspond à aucun déploiement actif (déploiement supprimé ou adresse erronée).' };
    }
    if (rep.getResponseCode() === 401 || rep.getResponseCode() === 403 || /accounts\.google\.com|ServiceLogin/i.test(texte)) {
      return { ok: false, message: 'Le serveur exige une connexion Google : dans le déploiement, « Qui a accès » doit être « Tout le monde ».' };
    }
    return { ok: false, message: `Réponse inattendue du serveur (code ${rep.getResponseCode()}).` };
  } catch (e) {
    return { ok: false, message: `Vérification impossible : ${e.message}` };
  }
}

// Données de la fenêtre « Inviter les testeurs ».
function donneesInvitation() {
  const url = urlApplicationWeb();
  const id = idDeploiement(url);
  const verification = verifierServeur(id);
  const lien = id ? `${REGLAGES.application}?s=${id}` : '';
  const mdp = PropertiesService.getScriptProperties().getProperty('mot_de_passe');
  const message = lien ? `Bonjour ! Pour participer à la sélection de photos, ouvre ce lien sur ton téléphone ou ton ordinateur :\n${lien}\n`
    + (mdp ? `Mot de passe : ${mdp}\n` : '')
    + 'Indique ton prénom : tu pourras t\'arrêter et reprendre quand tu veux, sur n\'importe quel appareil, avec le même prénom.' : '';
  const memorisee = !!PropertiesService.getScriptProperties().getProperty('url_web');
  if (!verification.ok && !memorisee) {
    verification.message = 'Ce classeur n\'est pas encore publié en application web (Google ne propose que l\'adresse du déploiement de test).';
  }
  return { url, lien, message, ok: verification.ok, verification: verification.message,
    memorisee };
}

// Adresse collée par l'organisateur (URL de l'application Web affichée dans Déployer → Gérer les déploiements).
function enregistrerUrlWeb(texte) {
  const proprietes = PropertiesService.getScriptProperties();
  if (!String(texte || '').trim()) { proprietes.deleteProperty('url_web'); return donneesInvitation(); }
  const id = idDeploiement(texte);
  if (!id) throw new Error('Adresse non reconnue : elle doit ressembler à https://script.google.com/macros/s/AKfy…/exec');
  proprietes.setProperty('url_web', `https://script.google.com/macros/s/${id}/exec`);
  return donneesInvitation();
}

function lienInvitation() {
  const html = HtmlService.createHtmlOutput(PAGE_INVITATION).setWidth(580).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Inviter les testeurs');
}

const PAGE_INVITATION = `<!doctype html><html><head><base target="_top"><style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#222;margin:0 4px}
  textarea,input{width:100%;box-sizing:border-box;font-size:13px;padding:6px}
  button{font-size:14px;padding:6px 12px;cursor:pointer}
  .ok{color:#2e7d32}.ko{color:#c62828}.aide{color:#666;font-size:12.5px}
  .rangee{display:flex;gap:6px}.rangee input{flex:1}
  #actuelle{word-break:break-all}
</style></head><body>
<p id="etat">Vérification du serveur…</p>
<div id="lien" style="display:none">
  <p><b>Lien d'invitation</b> (cliquer dedans pour le sélectionner, puis Ctrl+C) :</p>
  <textarea id="t-lien" rows="2" readonly onclick="this.select()"></textarea>
  <p><b>Message prêt à envoyer</b> (mail, WhatsApp…) :</p>
  <textarea id="t-message" rows="6" readonly onclick="this.select()"></textarea>
</div>
<div id="conseil" class="aide" style="display:none"><b>À faire une fois, dans ce classeur</b> (chaque copie du modèle a son propre script,
  à publier) :<ol style="margin:4px 0;padding-left:20px">
  <li><i>Extensions → Apps Script</i>, puis <i>Déployer → Nouveau déploiement</i>, roue dentée → <i>Application Web</i>,
  « Exécuter en tant que : Moi », « Qui a accès : Tout le monde », <i>Déployer</i> (accepter les autorisations).</li>
  <li>Copier l'<b>URL</b> affichée (…/exec), la coller ci-dessous et cliquer sur <i>Utiliser</i>.</li></ol>
  Si un déploiement existe déjà : <i>Déployer → Gérer les déploiements</i> pour retrouver son URL.</div>
<details id="corriger">
  <summary>Corriger l'adresse du serveur</summary>
  <p class="aide">Dans l'éditeur Apps Script : <i>Déployer → Gérer les déploiements</i>, copier l'« URL » de l'application Web
  (exemple : https://script.google.com/macros/s/AKfycbx…/exec) et la coller ici.</p>
  <div class="rangee"><input id="url" placeholder="https://script.google.com/macros/s/…/exec"><button onclick="enregistrer()">Utiliser</button></div>
  <p class="aide" id="actuelle"></p>
</details>
<p style="text-align:right"><button onclick="google.script.host.close()">Fermer</button></p>
<script>
  function afficher(d) {
    var etat = document.getElementById('etat');
    etat.className = d.ok ? 'ok' : 'ko';
    etat.textContent = (d.ok ? '✅ ' : '⚠️ ') + d.verification
      + (d.ok ? '' : ' Le lien ne fonctionnera pas tant que ce problème n\\'est pas réglé.');
    // Un lien qui ne fonctionne pas n'est pas montré, pour éviter de l'envoyer par erreur.
    document.getElementById('lien').style.display = d.lien && d.ok ? '' : 'none';
    document.getElementById('conseil').style.display = d.ok ? 'none' : '';
    document.getElementById('t-lien').value = d.lien;
    document.getElementById('t-message').value = d.message;
    document.getElementById('corriger').open = !d.ok;
    document.getElementById('actuelle').textContent = d.url ? 'Adresse utilisée' + (d.memorisee ? ' (collée)' : ' (détectée)') + ' : ' + d.url : '';
  }
  function erreur(e) { var etat = document.getElementById('etat'); etat.className = 'ko'; etat.textContent = '⚠️ ' + (e && e.message ? e.message : e); }
  function enregistrer() {
    document.getElementById('etat').className = ''; document.getElementById('etat').textContent = 'Vérification du serveur…';
    google.script.run.withSuccessHandler(afficher).withFailureHandler(erreur).enregistrerUrlWeb(document.getElementById('url').value);
  }
  google.script.run.withSuccessHandler(afficher).withFailureHandler(erreur).donneesInvitation();
</script></body></html>`;

function definirMotDePasse() {
  const ui = SpreadsheetApp.getUi();
  const proprietes = PropertiesService.getScriptProperties();
  const actuel = proprietes.getProperty('mot_de_passe');
  const rep = ui.prompt('Mot de passe commun',
    `${actuel ? 'Un mot de passe est déjà défini.' : 'Aucun mot de passe pour l\'instant : l\'application est ouverte à tous.'}\n\n`
    + 'Nouveau mot de passe à communiquer aux testeurs (laisser vide pour supprimer le mot de passe) :',
    ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  const mdp = normaliserMotDePasse(rep.getResponseText());
  if (mdp) {
    proprietes.setProperty('mot_de_passe', mdp);
    ui.alert('Florilège', `Mot de passe enregistré : « ${mdp} ».\nLes testeurs le saisiront une fois, avec leur prénom.`, ui.ButtonSet.OK);
  } else {
    proprietes.deleteProperty('mot_de_passe');
    ui.alert('Florilège', 'Mot de passe supprimé : l\'application est ouverte à toute personne qui en connaît l\'adresse.', ui.ButtonSet.OK);
  }
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
    const attendu = PropertiesService.getScriptProperties().getProperty('mot_de_passe');
    if (attendu && normaliserMotDePasse(requete.mdp) !== attendu) {
      return repondre({ erreur: requete.mdp ? 'Mot de passe incorrect.' : 'Indiquez le mot de passe commun.', code: 'mdp' });
    }
    const testeur = String(requete.testeur || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!testeur || testeur.length > 60) return repondre({ erreur: 'Indiquez votre nom pour commencer.', code: 'nom' });
    switch (requete.action) {
      case 'etat': return repondre(apiEtat(testeur));
      case 'evenements': return repondre(apiEvenements(testeur, requete.evenements));
      case 'miniatures': return repondre(apiMiniatures(requete.ids));
      case 'image': return repondre(apiImage(requete.id));
      case 'erreur':
        console.error(`Erreur client (${testeur}) : ${requete.message}`);
        return repondre({ ok: true });
      default: return repondre({ erreur: `Action inconnue : ${requete.action}` });
    }
  } catch (err) {
    console.error(`${requete.action} : ${err && err.stack ? err.stack : err}`);
    return repondre({ erreur: `Erreur du serveur : ${err.message || err}` });
  }
}

function valeurDeChoix(texte) {
  const t = String(texte || '').normalize('NFC').trim().toLowerCase();
  if (t === 'x') return 0;
  if (t === 'cœur' || t === 'coeur') return 1;
  if (t === 'étoile' || t === 'etoile') return 2;
  return null;
}

function apiEtat(testeur) {
  const liste = listePhotos();
  const annees = [];
  const vues = {};
  for (const p of liste.photos) if (!vues[p.e]) { vues[p.e] = true; annees.push(p.e); }
  const nbParAnnee = {};
  liste.photos.forEach(p => { nbParAnnee[p.e] = (nbParAnnee[p.e] || 0) + 1; });
  const ordreDans = {};
  const photos = liste.photos.map(p => {
    ordreDans[p.e] = (ordreDans[p.e] || 0) + 1;
    return { id: p.id, ensemble_id: p.e, largeur: p.l || 0, hauteur: p.h || 0, ordre: ordreDans[p.e] };
  });

  // Choix déjà faits par ce testeur ; et progression du groupe.
  const cle = cleTesteur(testeur);
  const votes = {};
  const testeurs = {};
  let faits = 0;
  for (const [photo, dossier, choix, nom] of lireChoix()) {
    const ct = cleTesteur(nom);
    if (!ct) continue;
    testeurs[ct] = true;
    const v = valeurDeChoix(choix);
    if (v !== null) faits++;
    if (ct === cle) votes[`${dossier}/${photo}`] = v;
  }
  testeurs[cle] = true;
  const total = liste.photos.length * Object.keys(testeurs).length;

  return {
    selectionneur: { id: cle, nom: testeur },
    config: { phase: liste.photos.length ? 'manche1' : 'preparation', titre_selection: REGLAGES.titre, max_coups_de_coeur: REGLAGES.maxCoupsDeCoeur },
    ensembles: annees.map((a, k) => ({ id: a, nom: a, ordre: k + 1, nb_photos: nbParAnnee[a] })),
    photos,
    votes,
    collectif: { faits: Math.min(faits, total), total },
  };
}

// Enregistre les choix : une ligne par (testeur, dossier, photo), mise à jour si elle existe déjà.
// Le choix le plus récent (horodatage de l'appareil) fait foi ; un renvoi du même lot est sans effet.
function apiEvenements(testeur, evenements) {
  if (!Array.isArray(evenements) || !evenements.length) return { acceptes: [] };
  if (evenements.length > 100) throw new Error('Trop de choix dans un seul envoi.');
  const index = indexParId();
  const cle = cleTesteur(testeur);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const f = feuilleChoix();
    const lignes = lireChoix();
    const position = {};
    lignes.forEach((l, k) => { position[`${cleTesteur(l[3])}|${l[1]}|${l[0]}`] = k; });
    const modifiees = {};
    const nouvelles = [];
    const nouvellesPos = {};
    for (const ev of evenements) {
      if (ev.type !== 'tri') continue;
      const photo = index[String(ev.photo_id || '')];
      if (!photo) continue; // photo inconnue (liste modifiée entre-temps)
      const valeur = ev.valeur === null || ev.valeur === undefined ? null : Number(ev.valeur);
      if (valeur !== null && !(valeur in CHOIX)) continue;
      const date = ev.horodatage ? new Date(ev.horodatage) : new Date();
      const ligne = [photo.nom, photo.dossier, valeur === null ? NON_CLASSE : CHOIX[valeur], testeur,
        maintenantLisible(isNaN(date) ? new Date() : date)];
      const k = `${cle}|${photo.dossier}|${photo.nom}`;
      if (k in position) {
        const actuelle = modifiees[position[k]] || lignes[position[k]];
        if (String(actuelle[4]) > ligne[4]) continue; // un choix plus récent est déjà enregistré
        ligne[3] = actuelle[3]; // garde l'écriture du nom telle que saisie la première fois
        modifiees[position[k]] = ligne;
      } else if (k in nouvellesPos) {
        if (nouvelles[nouvellesPos[k]][4] <= ligne[4]) nouvelles[nouvellesPos[k]] = ligne;
      } else {
        nouvellesPos[k] = nouvelles.length;
        nouvelles.push(ligne);
      }
    }
    for (const [k, ligne] of Object.entries(modifiees)) f.getRange(Number(k) + 2, 1, 1, COLONNES.length).setValues([ligne]);
    if (nouvelles.length) f.getRange(f.getLastRow() + 1, 1, nouvelles.length, COLONNES.length).setValues(nouvelles);
  } finally {
    verrou.releaseLock();
  }
  return { acceptes: evenements.map(e => e.event_id) };
}

// ---------------------------------------------------------------- images

function apiMiniatures(ids) {
  if (!Array.isArray(ids)) return { images: {}, types: {} };
  const index = indexParId();
  const cache = CacheService.getScriptCache();
  const prefixe = `m_${generation()}_`;
  const connus = ids.slice(0, 30).map(String).filter(id => index[id]);
  const enCache = cache.getAll(connus.map(id => prefixe + index[id].d));
  const images = {};
  const types = {};
  const aMettreEnCache = {};
  for (const id of connus) {
    const c = enCache[prefixe + index[id].d];
    if (c) {
      const sep = c.indexOf('|');
      types[id] = c.slice(0, sep);
      images[id] = c.slice(sep + 1);
      continue;
    }
    try {
      // Vignette générée par Drive à partir de la copie réduite ; à défaut, la copie elle-même.
      const fichier = DriveApp.getFileById(index[id].d);
      let blob = null;
      try { blob = fichier.getThumbnail(); } catch (e) { /* pas de vignette pour ce fichier */ }
      blob = blob || fichier.getBlob();
      const b64 = Utilities.base64Encode(blob.getBytes());
      images[id] = b64;
      types[id] = typeImage(blob, fichier.getName());
      if (b64.length < 95000) aMettreEnCache[prefixe + index[id].d] = `${types[id]}|${b64}`;
    } catch (err) {
      console.error(`Miniature introuvable ${id} : ${err.message}`);
    }
  }
  if (Object.keys(aMettreEnCache).length) cache.putAll(aMettreEnCache, DUREE_CACHE);
  return { images, types };
}

function apiImage(id) {
  const photo = indexParId()[String(id || '')];
  if (!photo) return { erreur: 'Photo inconnue (la liste des photos a peut-être changé : rechargez la page).' };
  const fichier = DriveApp.getFileById(photo.d);
  const blob = fichier.getBlob();
  return { donnees: Utilities.base64Encode(blob.getBytes()), type: typeImage(blob, fichier.getName()) };
}

// ============================================================================ menu du classeur

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Florilège')
    .addItem('Installer / configurer…', 'installer')
    .addSeparator()
    .addItem('Créer les photos allégées (dans Google Drive)', 'creerPhotosAllegees')
    .addItem('État de la création des photos allégées', 'etatReduction')
    .addItem('Mettre à jour la liste des photos', 'mettreAJourListe')
    .addItem('Recommencer la mise à jour depuis le début', 'recommencerListe')
    .addSeparator()
    .addItem('Définir le mot de passe commun…', 'definirMotDePasse')
    .addItem('Lien d\'invitation pour les testeurs', 'lienInvitation')
    .addSeparator()
    .addItem('À propos', 'aPropos')
    .addToUi();
  try {
    if (!PropertiesService.getScriptProperties().getProperty('installe') && !ss().getSheetByName(REGLAGES.feuille)) {
      ss().toast('Bienvenue ! Pour commencer : menu Florilège → Installer / configurer…', 'Florilège', 15);
    }
  } catch (err) { /* simple déclencheur : sans gravité */ }
}

function recommencerListe() {
  const it = dossierSelection().getFilesByName(FICHIER_ENCOURS);
  while (it.hasNext()) it.next().setTrashed(true);
  mettreAJourListe();
}

function aPropos() {
  const ui = SpreadsheetApp.getUi();
  const liste = listePhotos();
  ui.alert('Florilège',
    `Florilège ${VERSION} — sélection collective de photos.\n`
    + `Liste des photos : ${liste.photos.length} photos${liste.date ? ` (mise à jour le ${liste.date})` : ''}.\n`
    + `Mot de passe commun : ${PropertiesService.getScriptProperties().getProperty('mot_de_passe') ? 'défini' : 'aucun (accès libre)'}.\n\n`
    + 'Un logiciel CGExcel (cgexcel.wordpress.com) — © 2026 Cyrille Gindre.\n'
    + 'Licence MIT + BAL 1.0 (Bonne Action License). En échange, une seule chose vous est demandée, sur l\'honneur : '
    + 'faire une bonne action chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c\'est vous qui voyez.',
    ui.ButtonSet.OK);
}
