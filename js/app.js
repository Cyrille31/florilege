// Florilège — interface des sélectionneurs : démarrage, accueil, navigation entre écrans.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { CONFIG, modeDemo, urlApi } from './config.js?v=0.12.4';
import {
  backend, lireNom, memoriserNom, oublierNom, nettoyerNom, cleNom, FileEvenements, chargerEtat, memoriserEtat,
  memoriserMotDePasse, oublierMotDePasse,
  nouvelEvenement, ErreurServeur, signalerErreur, mesures,
} from './api.js?v=0.12.4';
import { ChargeurImages } from './images.js?v=0.12.4';
import { appliquer, estTrie, ensembleAContinuer, progressionGlobale } from './etat.js?v=0.12.4';
import { el, carteEnsembles, jaugeCollective, rangeeBadges, notifier } from './ludique.js?v=0.12.4';
import { ecranEnsemble } from './tri.js?v=0.12.4';
import { supprimerStockage } from './stockage.js?v=0.12.4';

const PHRASE_BAL = 'En échange, une seule chose vous est demandée, sur l\'honneur : faire une bonne action '
  + 'chaque jour. Aider un voisin, sourire à un inconnu, ramasser un papier… c\'est vous qui voyez.';

const PHRASES_PHASE = {
  manche1: 'Triez les photos : ✖️ je passe, ❤️ je garde, ⭐ coup de cœur.',
  manche2: 'La finale arrive bientôt : vous choisirez entre deux photos.',
  preparation: 'Les photos sont en cours de préparation. Revenez un peu plus tard !',
  attente: 'La sélection est en pause pour le moment. Merci, et à bientôt pour la suite !',
};

const app = document.getElementById('app');
const ctx = { etat: null, images: null, file: null, jeton: null, voter };
let ecranCourant = null;
let minuteurMemo = null;

// ---------------------------------------------------------------- enregistrement d'un choix

function voter(photoId, valeur) {
  const etat = ctx.etat;
  const avant = estTrie(etat.votes[photoId]);
  const ev = nouvelEvenement({ type: 'tri', manche: 1, photo_id: photoId, valeur });
  appliquer(etat, ev);
  ctx.file.ajouter(ev);
  // La jauge collective suit nos propres choix sans attendre le serveur.
  const apres = estTrie(valeur);
  if (etat.collectif && avant !== apres) etat.collectif.faits += apres ? 1 : -1;
  clearTimeout(minuteurMemo);
  minuteurMemo = setTimeout(() => memoriserEtat(ctx.jeton, etat), 1000);
}

// ---------------------------------------------------------------- navigation

function montrer(ecran) {
  ecranCourant?.detruire?.();
  ecranCourant = ecran;
  app.replaceChildren(ecran.racine);
  window.scrollTo(0, 0);
}

// Les sous-écrans ajoutent une entrée d'historique : le bouton « retour » du téléphone ramène à l'accueil.
const nav = {
  accueil() {
    if (history.state?.ecran) history.back();
    else montrerAccueil();
  },
  // mode : 'photo' (photo par photo), 'grille' (imagettes) ; sans mode, le dernier utilisé.
  ensemble(ensembleId, mode) {
    entrer({ ecran: 'ensemble', ensembleId });
    montrer(ecranEnsemble(ctx, ensembleId, nav, { mode }));
  },
};

function entrer(etatHistorique) {
  if (history.state?.ecran) history.replaceState(etatHistorique, '');
  else history.pushState(etatHistorique, '');
}

window.addEventListener('popstate', () => {
  if (ctx.etat) montrerAccueil();
});

// ---------------------------------------------------------------- indicateur de synchronisation

const indicateur = el('span', { class: 'synchro', role: 'status', 'aria-live': 'polite' });

function majIndicateur(statut, n) {
  indicateur.dataset.statut = statut;
  indicateur.textContent = statut === 'ok' ? '✓ Tout est enregistré'
    : statut === 'horsligne' ? `⚠ Hors ligne — ${n} choix gardé${n > 1 ? 's' : ''} sur l'appareil`
      : `⟳ ${n} choix en attente d'envoi`;
}

// ---------------------------------------------------------------- écrans

function entete() {
  return el('header', { class: 'entete' },
    el('img', { src: 'img/florilege-icone.svg', alt: '', class: 'logo', width: 40, height: 40 }),
    el('div', {},
      el('div', { class: 'marque' }, 'Florilège'),
      ctx.etat?.config.titre_selection ? el('div', { class: 'sous-titre' }, ctx.etat.config.titre_selection) : null));
}

function pied() {
  return el('footer', { class: 'pied' },
    el('span', {}, indicateur, el('span', { class: 'version', title: 'Numéro de version de Florilège' }, `v${CONFIG.version}`)),
    el('span', {},
      modeDemo() ? el('button', { class: 'btn-lien', onclick: razDemo }, 'Remettre la démo à zéro') : null,
      el('button', { class: 'btn-lien', onclick: ouvrirAPropos }, 'À propos')));
}

// Démonstration uniquement : efface tous les choix simulés et relance.
function razDemo() {
  if (!confirm('Effacer tous les choix de la démonstration et recommencer ?')) return;
  clearTimeout(minuteurMemo);
  const cles = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle.startsWith('florilege-demo')) cles.push(cle);
    }
  } catch { /* stockage indisponible */ }
  cles.forEach(supprimerStockage);
  supprimerStockage(`florilege-demo-serveur-${cleNom(ctx.jeton)}`);
  ctx.file.file = [];
  const p = new URLSearchParams(location.search);
  p.delete('reinit');
  location.replace(`${location.pathname}${p.toString() ? `?${p}` : ''}`);
}

function montrerAccueil() {
  const etat = ctx.etat;
  const phase = etat.config.phase;
  const contenu = [entete(),
    el('h1', {}, `Bonjour ${etat.selectionneur.nom} !`,
      el('button', { class: 'btn-lien pas-moi', onclick: changerDeNom }, 'Ce n\'est pas moi'))];
  contenu.push(el('p', { class: 'phrase' }, PHRASES_PHASE[phase] || 'Merci de votre participation ! La suite arrive bientôt.'));

  if (phase === 'manche1') {
    const aContinuer = ensembleAContinuer(etat);
    const g = progressionGlobale(etat);
    contenu.push(aContinuer
      ? el('button', { class: 'btn-principal grand', onclick: () => nav.ensemble(aContinuer, 'photo') }, g.faits ? 'Continuer' : 'Commencer')
      : el('p', { class: 'tout-fini' }, '🌸 Tout est trié, merci ! Vous pouvez encore revoir vos choix.'));
    contenu.push(jaugeCollective(etat));
    contenu.push(rangeeBadges(etat));
    contenu.push(el('h2', {}, 'Vos ensembles'));
    contenu.push(carteEnsembles(etat, ctx.images, id => nav.ensemble(id)));
  } else {
    contenu.push(jaugeCollective(etat));
  }
  contenu.push(pied());
  montrer({ racine: el('main', { class: 'ecran ecran-accueil' }, contenu) });
}

function ouvrirAPropos() {
  const fenetre = el('dialog', { class: 'apropos' },
    el('img', { src: 'img/florilege-icone.svg', alt: '', width: 96, height: 96 }),
    el('h2', {}, 'Florilège'),
    el('p', {}, `Sélection collective de photos — version ${CONFIG.version}`),
    el('p', {}, 'Un logiciel ', el('a', { href: 'https://cgexcel.wordpress.com', target: '_blank', rel: 'noopener' }, 'CGExcel'), ' — © 2026 Cyrille Gindre.'),
    el('p', { class: 'licence' }, 'Licence MIT + « BAL 1.0 — Bonne Action License ». ', PHRASE_BAL),
    modeDemo() ? el('p', { class: 'demo' }, 'Mode démonstration : photos factices, rien n\'est envoyé sur Internet.') : null,
    el('form', { method: 'dialog' }, el('button', { class: 'btn-principal' }, 'Fermer')));
  fenetre.addEventListener('close', () => fenetre.remove());
  document.body.append(fenetre);
  fenetre.showModal();
}

function montrerMessage(titre, texte) {
  montrer({ racine: el('main', { class: 'ecran ecran-accueil' }, entete(), el('h1', {}, titre), el('p', { class: 'phrase' }, texte), pied()) });
}

// Le serveur ne répond pas en JSON : hors ligne, ou (cas le plus fréquent à l'installation) Google renvoie
// une page d'erreur à la place du script (publication incomplète, autorisation à renouveler…).
function montrerConnexionImpossible(e) {
  if (!navigator.onLine) {
    montrerMessage('Connexion impossible', 'Vous semblez hors ligne. Vérifiez votre connexion Internet puis rechargez la page.');
    return;
  }
  const url = urlApi();
  montrer({ racine: el('main', { class: 'ecran ecran-accueil' }, entete(),
    el('h1', {}, 'Le serveur ne répond pas'),
    el('p', { class: 'phrase' }, 'Florilège n\'obtient pas de réponse du script Google de cette sélection. '
      + 'Si votre connexion Internet fonctionne, le script n\'est probablement pas (ou plus) accessible.'),
    el('p', {}, el('a', { class: 'btn-principal', href: url, target: '_blank', rel: 'noopener' }, 'Tester le serveur')),
    el('p', { class: 'phrase' }, 'Ce bouton ouvre l\'adresse du serveur dans un nouvel onglet. Si tout va bien, on y lit '
      + '« {"ok":true,"application":"Florilège",…} ». Sinon, la page de Google indique le problème.'),
    el('details', {},
      el('summary', {}, 'Pour l\'organisateur : causes habituelles'),
      el('ul', {},
        el('li', {}, 'Le lien d\'invitation vient d\'un ancien déploiement, supprimé depuis : regénérez-le (Florilège → Lien d\'invitation pour les testeurs).'),
        el('li', {}, 'Le déploiement n\'est pas ouvert à « Tout le monde » (et non « Tout le monde disposant d\'un compte Google ») : '
          + 'Déployer → Gérer les déploiements → crayon → Qui a accès : Tout le monde.'),
        el('li', {}, 'Le script a été modifié et attend une nouvelle autorisation : dans le classeur, choisissez un article du menu '
          + 'Florilège (par exemple « À propos ») et acceptez les autorisations demandées.'),
        el('li', {}, 'Le code a été collé mais pas republié : Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer.')),
      el('p', { style: 'font-size:.85rem;word-break:break-all' }, `Adresse du serveur : ${url}`),
      el('p', { style: 'font-size:.85rem' }, `Détail technique : ${e?.message || e}`)),
    el('p', {}, el('button', { class: 'btn-secondaire', onclick: () => location.reload() }, 'Réessayer')),
    el('p', {}, el('button', { class: 'btn-secondaire', onclick: oublierServeur }, 'Oublier ce serveur (revenir à l\'accueil)')),
    pied()) });
}

// Efface le serveur mémorisé sur l'appareil (lien d'invitation périmé) et revient à la page d'accueil du site.
function oublierServeur() {
  try { localStorage.removeItem('florilege-serveur'); } catch { /* navigation privée */ }
  location.href = location.pathname;
}

// ---------------------------------------------------------------- identification par le nom

// demanderMotDePasse : le serveur exige le mot de passe commun (absent ou incorrect sur cet appareil).
function montrerIdentification(message, demanderMotDePasse = false) {
  const champ = el('input', {
    type: 'text', id: 'nom', name: 'nom', required: true, maxlength: 60, autocomplete: 'given-name',
    placeholder: 'Votre prénom', 'aria-label': 'Votre prénom ou votre nom', value: lireNom() || '',
  });
  const champMdp = demanderMotDePasse ? el('input', {
    type: 'password', id: 'mdp', name: 'mdp', required: true, maxlength: 60, autocomplete: 'current-password',
    placeholder: 'Mot de passe commun', 'aria-label': 'Mot de passe commun',
  }) : null;
  const formulaire = el('form', { class: 'identification' },
    champ,
    champMdp,
    el('button', { class: 'btn-principal grand', type: 'submit' }, 'C\'est parti'));
  formulaire.addEventListener('submit', e => {
    e.preventDefault();
    const nom = nettoyerNom(champ.value);
    if (!nom) return;
    memoriserNom(nom);
    if (champMdp) memoriserMotDePasse(champMdp.value);
    demarrer();
  });
  montrer({
    racine: el('main', { class: 'ecran ecran-accueil' },
      entete(),
      el('h1', {}, 'Bienvenue !'),
      el('p', { class: 'phrase' }, message || 'Quel est votre prénom ? En le redonnant plus tard, sur n\'importe quel '
        + 'appareil, vous retrouverez où vous en êtes.'),
      formulaire,
      pied()),
  });
  (champ.value && champMdp ? champMdp : champ).focus();
}

// Page pour un nouvel organisateur : copier le classeur modèle, puis suivre le menu Florilège du classeur.
function montrerOrganisateur() {
  const lienModele = CONFIG.modele ? `https://docs.google.com/spreadsheets/d/${CONFIG.modele}/copy` : '';
  const guide = 'https://github.com/Cyrille31/florilege#mise-en-service-fonctionnement-simplifi%C3%A9';
  montrer({
    racine: el('main', { class: 'ecran ecran-accueil organisateur' },
      entete(),
      el('h1', {}, 'Organiser une sélection'),
      el('p', { class: 'phrase' }, 'Tout se passe dans votre Google Drive, avec votre compte Google : vos photos ne sont partagées avec personne.'),
      el('ol', { class: 'etapes' },
        el('li', {}, 'Dans Google Drive, rangez vos photos dans un dossier, avec un sous-dossier par année (« 2001 », « 2002 »…).'),
        el('li', {}, lienModele
          ? ['Copiez le classeur modèle dans votre Google Drive : ', el('a', { href: lienModele, target: '_blank', rel: 'noopener' }, 'Copier le modèle Florilège'),
            '. Google place la copie (« Copie de … ») à la racine de « Mon Drive » : à l\'étape suivante, le menu Installer la range dans le dossier de vos photos '
            + '(vous pouvez aussi la déplacer vous-même : clic droit sur le fichier → Organiser → Déplacer).']
          : ['Créez un Google Sheet dans ce dossier et ajoutez-lui le script de Florilège, comme indiqué dans le ',
            el('a', { href: guide, target: '_blank', rel: 'noopener' }, 'guide de mise en service'), '.']),
        el('li', {}, 'Ouvrez la copie : menu Florilège → Installer / configurer… (le menu apparaît quelques secondes après l\'ouverture). Une fenêtre permet de naviguer dans votre Google Drive jusqu\'au dossier de vos photos (ou d\'en coller le lien) : le classeur y est rangé automatiquement. Choisissez ensuite un mot de passe ; une fenêtre vous guide pour publier l\'application (quelques clics).'),
        el('li', {}, 'Menu Florilège → Créer les photos allégées : les copies réduites sont préparées dans votre Google Drive, en tâche de fond.'),
        el('li', {}, 'Menu Florilège → Lien d\'invitation pour les testeurs : envoyez-le, avec le mot de passe.')),
      el('button', { class: 'btn-secondaire', onclick: () => location.reload() }, 'Retour'),
      pied()),
  });
}

// « Ce n'est pas moi » : on envoie ce qui reste en attente, puis on redemande le nom.
function changerDeNom() {
  ctx.file?.envoyerEnPartant();
  oublierNom();
  location.reload();
}

// ---------------------------------------------------------------- démarrage

async function demarrer() {
  if (!modeDemo() && !urlApi()) {
    montrer({
      racine: el('main', { class: 'ecran ecran-accueil' },
        entete(),
        el('h1', {}, 'Lien d\'invitation nécessaire'),
        el('p', { class: 'phrase' }, 'Pour participer à une sélection, ouvrez le lien que son organisateur vous a envoyé.'),
        el('a', { class: 'btn-secondaire lien-demo', href: '?demo=1' }, 'Essayer la démonstration'),
        el('button', { class: 'btn-lien organiser', onclick: montrerOrganisateur }, 'Vous organisez une sélection ? Créer la vôtre'),
        pied()),
    });
    return;
  }
  const jeton = lireNom();
  if (!jeton) {
    montrerIdentification();
    return;
  }
  ctx.jeton = jeton;
  ctx.file = new FileEvenements(jeton);
  ctx.file.surChangement(majIndicateur);
  ctx.images = new ChargeurImages(backend, jeton);
  try {
    const { etat, horsLigne } = await chargerEtat(jeton, ctx.file);
    ctx.etat = etat;
    majIndicateur(horsLigne ? 'horsligne' : ctx.file.statut(), ctx.file.enAttente());
    if (horsLigne) notifier('Hors ligne : vous pouvez continuer, tout sera envoyé plus tard.');
  } catch (e) {
    if (e instanceof ErreurServeur && e.code === 'nom') { oublierNom(); montrerIdentification(e.message); }
    else if (e instanceof ErreurServeur && e.code === 'mdp') { oublierMotDePasse(); montrerIdentification(e.message, true); }
    else if (e instanceof ErreurServeur && e.code === 'jeton') {
      // Réponse d'un ancien script (version à liens personnels) : le nouveau n'a pas été redéployé.
      montrerMessage('Script du serveur à mettre à jour', 'Le script Apps Script publié est une ancienne version. '
        + 'Dans l\'éditeur Apps Script : Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer.');
    }
    else if (e instanceof ErreurServeur) montrerMessage('Problème sur le serveur', e.message);
    else montrerConnexionImpossible(e);
    return;
  }
  // Un rechargement en plein tri rouvre l'accueil (l'historique du navigateur est remis à zéro).
  if (history.state?.ecran) history.replaceState(null, '');
  montrerAccueil();
  ctx.file.envoyer();
}

// Erreurs JavaScript : remontées au serveur (journal d'exécution d'Apps Script).
window.addEventListener('error', e => signalerErreur(ctx.jeton, `${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener('unhandledrejection', e => signalerErreur(ctx.jeton, `Promesse rejetée : ${e.reason?.message || e.reason}`));

// ---------------------------------------------------------------- diagnostic (?diag=1)
// Affiche les temps de réponse du serveur, pour juger de la fluidité (section 3.3 des spécifications).

function panneauDiagnostic() {
  const panneau = el('pre', { class: 'diagnostic', 'aria-hidden': 'true' });
  document.body.append(panneau);
  setInterval(() => {
    const parAction = {};
    for (const m of mesures) (parAction[m.action] ||= []).push(m);
    const lignes = Object.entries(parAction).map(([action, liste]) => {
      const ms = liste.map(m => m.ms).sort((a, b) => a - b);
      const moyenne = ms.reduce((t, x) => t + x, 0) / ms.length;
      const ko = liste.reduce((t, m) => t + m.octets, 0) / liste.length / 1024;
      return `${action.padEnd(11)} n=${String(ms.length).padStart(3)}  moy ${Math.round(moyenne)} ms  `
        + `méd ${Math.round(ms[Math.floor(ms.length / 2)])}  max ${Math.round(ms[ms.length - 1])}  ${ko.toFixed(0)} Ko`;
    });
    const connexion = navigator.connection ? ` · réseau ${navigator.connection.effectiveType}` : '';
    panneau.textContent = `Diagnostic v${CONFIG.version}${connexion}\n${lignes.join('\n') || 'aucune requête'}`;
  }, 1000);
}

if (new URLSearchParams(location.search).get('diag') === '1') panneauDiagnostic();

demarrer();
