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

const VERSION = '0.11.2';

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

function installer() {
  const ui = SpreadsheetApp.getUi();
  const actuel = dossierSelection();
  const rep = ui.prompt('Installer Florilège',
    'Lien (adresse) du dossier Google Drive qui contient vos dossiers de photos, un par année (« 2001 », « 2002 »…).\n'
    + `Laisser vide pour garder le dossier actuel du classeur : « ${actuel.getName()} ».`, ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  const texte = rep.getResponseText().trim();
  let dossier = actuel;
  if (texte) {
    const m = /folders\/([\w-]+)/.exec(texte) || /^([\w-]{20,})$/.exec(texte) || /[?&]id=([\w-]+)/.exec(texte);
    try {
      dossier = DriveApp.getFolderById(m ? m[1] : texte);
    } catch (err) {
      ui.alert('Florilège', 'Dossier introuvable. Dans Google Drive, ouvrez le dossier et copiez l\'adresse affichée par le navigateur.', ui.ButtonSet.OK);
      return;
    }
    if (dossier.getId() !== actuel.getId()) DriveApp.getFileById(ss().getId()).moveTo(dossier);
  }
  const annees = [];
  const it = dossier.getFolders();
  while (it.hasNext()) { const d = it.next(); if (estDossierAnnee(d.getName())) annees.push(d.getName()); }
  feuilleChoix();
  definirMotDePasse();
  PropertiesService.getScriptProperties().setProperty('installe', 'oui');

  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (err) { /* pas encore déployé */ }
  const deploye = /\/s\/[\w-]+\/exec/.test(url);
  const html = HtmlService.createHtmlOutput(`
    <style>body{font-family:sans-serif;font-size:14px;line-height:1.45}li{margin:4px 0}</style>
    <p>Le classeur est rangé dans <b>${String(dossier.getName()).replace(/</g, '&lt;')}</b>
      (${annees.length ? `dossiers d'année : ${annees.sort(trierNoms).join(', ')}` : 'aucun dossier d\'année pour l\'instant'}).</p>
    <p><b>Étapes suivantes :</b></p>
    <ol>
      ${deploye ? '<li>L\'application web est déjà publiée.</li>' : `<li><b>Publier l'application web</b> (une seule fois) : menu <i>Extensions → Apps Script</i>,
        puis <i>Déployer → Nouveau déploiement</i>, roue dentée → <i>Application Web</i>, « Exécuter en tant que : <b>Moi</b> »,
        « Qui a accès : <b>Tout le monde</b> », <i>Déployer</i>, puis autoriser (Paramètres avancés → Accéder à…, tout cocher).</li>`}
      <li><b>Florilège → Créer les photos allégées</b> (en tâche de fond ; la liste des photos est mise à jour à la fin).</li>
      <li><b>Florilège → Lien d'invitation pour les testeurs</b>, à envoyer avec le mot de passe.</li>
    </ol>`).setWidth(520).setHeight(360);
  ui.showModalDialog(html, 'Florilège est installé');
}

// ============================================================================ mot de passe commun
// Gardé dans les propriétés privées du script (jamais dans le dépôt GitHub, qui est public).
// Majuscules et espaces en trop ne comptent pas.

function normaliserMotDePasse(mdp) {
  return String(mdp || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Lien à envoyer aux testeurs : l'adresse de l'application suivie de l'identifiant de ce serveur (?s=…).
// Ainsi, le même site sert à toutes les sélections, et l'adresse du serveur n'est pas inscrite dans GitHub.
function lienInvitation() {
  const ui = SpreadsheetApp.getUi();
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* pas encore déployé */ }
  const m = /\/s\/([\w-]+)\/exec/.exec(url);
  if (!m) {
    ui.alert('Florilège', 'Le script n\'est pas encore publié en application web : dans l\'éditeur Apps Script, '
      + 'Déployer → Nouveau déploiement → Application Web (Exécuter en tant que : moi ; accès : tout le monde).', ui.ButtonSet.OK);
    return;
  }
  const lien = `${REGLAGES.application}?s=${m[1]}`;
  const mdp = PropertiesService.getScriptProperties().getProperty('mot_de_passe');
  const message = `Bonjour ! Pour participer à la sélection de photos, ouvre ce lien sur ton téléphone ou ton ordinateur :\n${lien}\n`
    + (mdp ? `Mot de passe : ${mdp}\n` : '')
    + 'Indique ton prénom : tu pourras t\'arrêter et reprendre quand tu veux, sur n\'importe quel appareil, avec le même prénom.';
  const echapper = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = HtmlService.createHtmlOutput(`
    <style>body{font-family:sans-serif;font-size:14px}textarea{width:100%;font-size:13px}</style>
    <p><b>Lien d'invitation</b> (cliquer dedans pour le sélectionner, puis Ctrl+C) :</p>
    <textarea rows="2" onclick="this.select()">${echapper(lien)}</textarea>
    <p><b>Message prêt à envoyer</b> (mail, WhatsApp…) :</p>
    <textarea rows="7" onclick="this.select()">${echapper(message)}</textarea>`).setWidth(520).setHeight(380);
  ui.showModalDialog(html, 'Inviter les testeurs');
}

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
