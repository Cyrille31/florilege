// Florilège — tags des photos.
// La liste des tags est commune à tous ; les tags posés sur une photo aussi. Chacun choisit, pour lui-même,
// les tags proposés au cochage. Le panneau (à droite de l'écran) se referme dès qu'on fait autre chose.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { el, notifier } from './ludique.js?v=0.19.1';
import { tagsDe, tagsProposes } from './etat.js?v=0.19.1';

let panneau = null; // panneau ouvert : { racine, fermer }

export function panneauTagsOuvert() {
  return !!panneau;
}

export function fermerPanneauTags() {
  panneau?.fermer();
}

// Noms des tags d'une photo, dans l'ordre de la liste.
export function nomsTags(etat, photoId) {
  const poses = new Set(tagsDe(etat, photoId));
  return (etat.tags || []).filter(t => poses.has(t.id)).map(t => t.nom);
}

// photoIds : photos concernées (une seule, ou la sélection des imagettes).
// poser(photoId, ids) enregistre les tags d'une photo ; surChangement() rafraîchit l'affichage ;
// gerer() ouvre la gestion des tags.
export function ouvrirPanneauTags({ etat, photoIds, poser, surChangement, gerer }) {
  fermerPanneauTags();
  if (!photoIds.length) { notifier('Sélectionnez d\'abord des photos.'); return; }
  const liste = el('div', { class: 'tags-liste' });
  const racine = el('aside', { class: 'panneau-tags', role: 'dialog', 'aria-label': 'Tags de la photo' },
    el('div', { class: 'tags-titre' }, photoIds.length > 1 ? `🏷 Tags (${photoIds.length} photos)` : '🏷 Tags'),
    liste,
    el('button', { class: 'btn-secondaire tags-gerer', title: 'Gérer les tags : ajouter, renommer, ordonner, supprimer, choisir ceux proposés',
      onclick: () => { fermer(); gerer(); } }, '⚙ Gérer…'));

  function remplir() {
    const proposes = tagsProposes(etat);
    if (!proposes.length) {
      liste.replaceChildren(el('p', { class: 'tags-vide' }, (etat.tags || []).length
        ? 'Aucun tag proposé : choisissez-les dans « Gérer les tags ».'
        : 'Pas encore de tags : créez-en dans « Gérer les tags ».'));
      return;
    }
    liste.replaceChildren(...proposes.map(t => {
      const n = photoIds.filter(id => tagsDe(etat, id).includes(t.id)).length;
      const input = el('input', { type: 'checkbox', checked: n === photoIds.length });
      input.indeterminate = n > 0 && n < photoIds.length;
      input.addEventListener('change', () => {
        const ordre = (etat.tags || []).map(x => x.id);
        for (const id of photoIds) {
          const actuels = new Set(tagsDe(etat, id));
          if (input.checked) actuels.add(t.id); else actuels.delete(t.id);
          poser(id, ordre.filter(x => actuels.has(x)));
        }
        surChangement?.();
      });
      return el('label', { class: 'tags-choix' }, input, el('span', {}, t.nom));
    }));
  }

  // N'importe quelle action en dehors du panneau (clic, touche) le referme.
  // Un appui dans le rectangle du panneau (même hors d'un tag, même pendant son apparition) ne le referme pas.
  const dansPanneau = e => {
    if (racine.contains(e.target)) return true;
    const r = racine.getBoundingClientRect();
    return e.clientX >= window.innerWidth - r.width && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  const dehors = e => { if (!dansPanneau(e) && !document.querySelector('dialog.tags-gestion')) fermer(); };
  // Dans le panneau, Tab, Espace et Entrée servent à cocher ; toute autre touche referme le panneau (et agit).
  // Échap referme seulement le panneau (pas la visionneuse ni l'écran en dessous).
  const touche = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fermer(); return; }
    if (!(racine.contains(e.target) && ['Tab', ' ', 'Enter'].includes(e.key))) fermer();
  };
  function fermer() {
    if (panneau?.racine !== racine) return;
    panneau = null;
    document.removeEventListener('pointerdown', dehors, true);
    window.removeEventListener('keydown', touche, true);
    racine.classList.add('ferme');
    document.body.classList.remove('avec-tags');
    setTimeout(() => racine.remove(), 200);
  }
  remplir();
  document.body.append(racine);
  // La photo se réduit pour rester entièrement visible à côté du panneau.
  document.body.classList.add('avec-tags');
  panneau = { racine, fermer };
  // Le clic qui a ouvert le panneau ne doit pas le refermer aussitôt.
  setTimeout(() => {
    if (panneau?.racine !== racine) return;
    document.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', touche, true); // avant les raccourcis de la visionneuse et de l'écran
  }, 0);
}

// ---------------------------------------------------------------- gestion de la liste

// Ajouter, renommer, réordonner les tags (liste commune) ; choisir ceux qui me sont proposés (choix personnel).
export function ouvrirGestionTags({ backend, jeton, etat, surMaj }) {
  const corps = el('div', { class: 'tags-gestion-liste' });
  const message = el('p', { class: 'ecartement-message', 'aria-live': 'polite' });
  const champ = el('input', { type: 'text', maxlength: 40, placeholder: 'Nouveau tag (ex. : Mamie, Noël, floue…)', 'aria-label': 'Nom du nouveau tag' });
  const ajouter = el('button', { class: 'btn-principal petit' }, 'Ajouter');
  const fenetre = el('dialog', { class: 'aide tags-gestion' },
    el('div', { class: 'aide-haut' },
      el('h2', { class: 'ecartement-titre' }, 'Gérer les tags'),
      el('form', { method: 'dialog' }, el('button', { class: 'btn-aide-fermer', 'aria-label': 'Fermer', title: 'Fermer (Échap)' }, '✕'))),
    el('div', { class: 'aide-corps' },
      el('p', { class: 'aide-grille' }, 'La liste des tags est commune à tous. Cochez ceux qui vous sont proposés quand vous taguez une photo '
        + '(ce choix n\'appartient qu\'à vous). Les flèches changent l\'ordre ; cliquez sur un nom pour le modifier ; 🗑 supprime le tag pour tous.'),
      corps,
      el('div', { class: 'rangee-ajout' }, champ, ajouter),
      message));
  fenetre.addEventListener('keydown', e => e.stopPropagation());
  fenetre.addEventListener('close', () => { fenetre.remove(); surMaj?.(); });
  document.body.append(fenetre);
  fenetre.showModal();

  const proposes = () => new Set(Array.isArray(etat.tagsAffiches) ? etat.tagsAffiches : (etat.tags || []).map(t => t.id));

  async function envoyer(donnees, okTexte) {
    message.textContent = 'Enregistrement…';
    try {
      const r = await backend.tags(jeton, donnees);
      etat.tags = r.tags;
      etat.tagsAffiches = r.tagsAffiches;
      message.textContent = okTexte || '';
      remplir();
      return r;
    } catch (e) {
      message.textContent = `Échec : ${e.message}`;
      remplir();
      return null;
    }
  }

  function remplir() {
    const tags = etat.tags || [];
    const vus = proposes();
    if (!tags.length) { corps.replaceChildren(el('p', { class: 'tags-vide' }, 'Aucun tag pour l\'instant.')); return; }
    corps.replaceChildren(...tags.map((t, k) => {
      const coche = el('input', { type: 'checkbox', checked: vus.has(t.id), title: 'Proposé quand je tague une photo' });
      coche.addEventListener('change', () => {
        const ids = tags.map(x => x.id).filter(id => (id === t.id ? coche.checked : vus.has(id)));
        envoyer({ op: 'affiches', ids });
      });
      const nom = el('input', { type: 'text', value: t.nom, maxlength: 40, 'aria-label': `Nom du tag ${t.nom}` });
      const valider = () => { if (nom.value.trim() && nom.value.trim() !== t.nom) envoyer({ op: 'renommer', id: t.id, nom: nom.value }, 'Tag renommé.'); };
      nom.addEventListener('change', valider);
      nom.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nom.blur(); } });
      const deplacer = d => {
        const ids = tags.map(x => x.id);
        [ids[k], ids[k + d]] = [ids[k + d], ids[k]];
        envoyer({ op: 'ordonner', ids });
      };
      const supprimer = async () => {
        const n = Object.values(etat.tagsPhotos || {}).filter(ids => ids.includes(t.id)).length;
        if (!confirm(`Supprimer le tag « ${t.nom} » pour tout le monde ?${n ? `\nIl sera retiré de ${n} photo${n > 1 ? 's' : ''}.` : ''}`)) return;
        const r = await envoyer({ op: 'supprimer', id: t.id }, `Tag « ${t.nom} » supprimé.`);
        if (!r) return;
        for (const [photo, ids] of Object.entries(etat.tagsPhotos || {})) {
          const restants = ids.filter(x => x !== t.id);
          if (restants.length) etat.tagsPhotos[photo] = restants; else delete etat.tagsPhotos[photo];
        }
      };
      return el('div', { class: 'tags-ligne' }, coche, nom,
        el('button', { class: 'btn-ordre', title: 'Monter', 'aria-label': 'Monter', disabled: k === 0, onclick: () => deplacer(-1) }, '↑'),
        el('button', { class: 'btn-ordre', title: 'Descendre', 'aria-label': 'Descendre', disabled: k === tags.length - 1, onclick: () => deplacer(1) }, '↓'),
        el('button', { class: 'btn-ordre btn-supprimer', title: 'Supprimer ce tag (pour tout le monde)', 'aria-label': `Supprimer le tag ${t.nom}`, onclick: supprimer }, '🗑'));
    }));
  }

  async function ajouterTag() {
    const nom = champ.value.trim();
    if (!nom) { champ.focus(); return; }
    const r = await envoyer({ op: 'ajouter', nom }, `Tag « ${nom} » ajouté.`);
    if (!r) return;
    champ.value = '';
    // Un tag que je crée m'est proposé d'office.
    if (Array.isArray(etat.tagsAffiches) && r.ajoute && !etat.tagsAffiches.includes(r.ajoute)) {
      await envoyer({ op: 'affiches', ids: [...etat.tagsAffiches, r.ajoute] }, `Tag « ${nom} » ajouté.`);
    }
  }
  ajouter.addEventListener('click', ajouterTag);
  champ.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ajouterTag(); } });
  remplir();
}
