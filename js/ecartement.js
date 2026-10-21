// Florilège — écartement automatique : écarter (« A ») les photos que d'autres ont déjà écartées.
// Une photo devient « A » si : elle est encore à trier pour moi, au moins une des personnes choisies l'a
// écartée à la main (✖️), et aucune de ces personnes ne l'a gardée (❤️ ou ⭐). Relancer l'outil recalcule
// tout ; « Annuler l'écartement automatique » remet les « A » à trier. Un « A » changé à la main devient
// un choix ordinaire. Le calcul est fait par le serveur, qui inscrit « A » dans le fichier des choix.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { el } from './ludique.js?v=0.17.0';
import { cleLocale } from './config.js?v=0.17.0';
import { lireStockage, ecrireStockage } from './stockage.js?v=0.17.0';

// options : { backend, jeton, file, surTermine(message) }
export function ouvrirEcartement({ backend, jeton, file, surTermine }) {
  // Personnes décochées la dernière fois (une nouvelle personne est cochée d'office).
  const cleExclues = cleLocale('ecartement-exclues');
  const exclues = new Set(lireStockage(cleExclues, []));
  const liste = el('div', { class: 'ecartement-liste' }, el('p', { class: 'ecartement-attente' }, 'Chargement de la liste…'));
  const message = el('p', { class: 'ecartement-message', 'aria-live': 'polite' });
  const appliquer = el('button', { class: 'btn-principal', disabled: true }, 'Écarter automatiquement');
  const raz = el('button', { class: 'btn-secondaire' }, 'Annuler l\'écartement automatique');
  const fenetre = el('dialog', { class: 'aide ecartement' },
    el('div', { class: 'aide-haut' },
      el('h2', { class: 'ecartement-titre' }, 'Écartement automatique'),
      el('form', { method: 'dialog' }, el('button', { class: 'btn-aide-fermer', 'aria-label': 'Fermer', title: 'Fermer (Échap)' }, '✕'))),
    el('div', { class: 'aide-corps' },
      el('p', {}, 'Écarte d\'office (', el('b', {}, 'A'), ') les photos encore à trier pour vous qu\'au moins une des personnes '
        + 'cochées a écartées (✖️) et qu\'aucune n\'a gardées (❤️ ou ⭐). Elles s\'affichent en gris avec un « A » ; '
        + 'vous pouvez toujours les changer. Relancer l\'outil recalcule tout.'),
      el('h3', {}, 'Personnes prises en compte'),
      liste,
      message,
      el('div', { class: 'ecartement-boutons' }, appliquer, raz)));
  fenetre.addEventListener('keydown', e => e.stopPropagation());
  fenetre.addEventListener('close', () => fenetre.remove());
  document.body.append(fenetre);
  fenetre.showModal();

  let cases = [];
  backend.ecartement(jeton, { mode: 'liste' }).then(({ personnes }) => {
    if (!personnes.length) {
      liste.replaceChildren(el('p', {}, 'Personne d\'autre n\'a encore trié de photos.'));
      return;
    }
    cases = personnes.map(p => ({ nom: p.nom, input: el('input', { type: 'checkbox', checked: !exclues.has(p.nom) }) }));
    liste.replaceChildren(...personnes.map((p, k) => el('label', { class: 'ecartement-personne' }, cases[k].input,
      el('span', { class: 'ecartement-nom' }, p.nom),
      el('span', { class: 'ecartement-stats' }, `✖️ ${p.ecartees} · ❤️+⭐ ${p.gardees}`))));
    appliquer.disabled = false;
  }).catch(e => { liste.replaceChildren(el('p', { class: 'erreur' }, `Liste indisponible : ${e.message}`)); });

  async function lancer(mode) {
    const personnes = cases.filter(c => c.input.checked).map(c => c.nom);
    if (mode === 'appliquer') {
      if (!personnes.length) { message.textContent = 'Cochez au moins une personne.'; return; }
      ecrireStockage(cleExclues, cases.filter(c => !c.input.checked).map(c => c.nom));
    }
    appliquer.disabled = true;
    raz.disabled = true;
    message.textContent = 'Calcul en cours…';
    try {
      await file.envoyer?.(); // le serveur doit connaître mes derniers choix
      const r = await backend.ecartement(jeton, { mode, personnes });
      const texte = mode === 'raz'
        ? `${r.retirees} photo${r.retirees > 1 ? 's' : ''} remise${r.retirees > 1 ? 's' : ''} à trier.`
        : `${r.ecartees} photo${r.ecartees > 1 ? 's' : ''} écartée${r.ecartees > 1 ? 's' : ''} automatiquement (A).`;
      fenetre.close();
      surTermine?.(texte);
    } catch (e) {
      message.textContent = `Échec : ${e.message}`;
      appliquer.disabled = false;
      raz.disabled = false;
    }
  }
  appliquer.addEventListener('click', () => lancer('appliquer'));
  raz.addEventListener('click', () => lancer('raz'));
}
