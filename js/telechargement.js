// Florilège — téléchargement des photos d'origine (dossier de l'année, pas la copie allégée).
// Une photo à la fois, pour ne pas surcharger le serveur ; chaque photo devient un fichier téléchargé.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { notifier } from './ludique.js?v=0.16.0';

let enCours = false;

function enregistrer(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ids : identifiants des photos à télécharger.
export async function telechargerOriginaux(backend, jeton, ids) {
  if (!ids.length) { notifier('Sélectionnez d\'abord les photos à télécharger.'); return; }
  if (enCours) { notifier('Un téléchargement est déjà en cours…'); return; }
  enCours = true;
  let reussies = 0;
  const erreurs = [];
  try {
    for (const [k, id] of ids.entries()) {
      notifier(ids.length > 1 ? `Téléchargement ${k + 1} / ${ids.length}…` : 'Téléchargement de la photo d\'origine…', 60000);
      try {
        const { nom, blob } = await backend.original(jeton, id);
        enregistrer(blob, nom);
        reussies++;
        // Petite pause : certains navigateurs bloquent les téléchargements trop rapprochés.
        if (k < ids.length - 1) await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        erreurs.push(e.message || String(e));
      }
    }
  } finally {
    enCours = false;
  }
  if (!erreurs.length) notifier(reussies > 1 ? `${reussies} photos téléchargées.` : 'Photo téléchargée.');
  else notifier(`${reussies} photo${reussies > 1 ? 's' : ''} téléchargée${reussies > 1 ? 's' : ''} ; échec : ${erreurs[0]}`, 6000);
}
