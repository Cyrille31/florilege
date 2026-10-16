// Florilège — back-end simulé (mode démonstration).
// Imite l'API Apps Script avec des photos factices dessinées dans le navigateur.
// Les « données serveur » sont conservées dans localStorage, ce qui permet de tester
// la reprise après fermeture de l'onglet.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { lireStockage, ecrireStockage, supprimerStockage } from './stockage.js?v=0.12.4';

const parametres = new URLSearchParams(location.search);
// Latence simulée d'une requête (ms), pour juger l'effet du préchargement : ?latence=800
const LATENCE = Number(parametres.get('latence') ?? 400);

const ENSEMBLES = [
  { id: 'e1', nom: 'Vacances à la mer', nb: 28, teinte: 200 },
  { id: 'e2', nom: 'Anniversaire', nb: 45, teinte: 20 },
  { id: 'e3', nom: 'Randonnée en montagne', nb: 9, teinte: 110 },
  { id: 'e4', nom: 'Pique-nique', nb: 3, teinte: 50 },
];

const FORMATS = [[4, 3], [3, 4], [4, 3], [16, 9], [1, 1], [3, 4], [4, 3]];

// Générateur pseudo-aléatoire déterministe (mulberry32) : même photo, même dessin.
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function graineDe(texte) {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function construirePhotos() {
  const photos = [];
  for (const e of ENSEMBLES) {
    for (let i = 0; i < e.nb; i++) {
      const id = `${e.id}p${String(i + 1).padStart(3, '0')}`;
      const [l, h] = FORMATS[graineDe(id) % FORMATS.length];
      photos.push({ id, ensemble_id: e.id, largeur: l * 270, hauteur: h * 270, ordre: i + 1 });
    }
  }
  return photos;
}

const PHOTOS = construirePhotos();
const PHOTOS_PAR_ID = new Map(PHOTOS.map(p => [p.id, p]));

function cleServeur(jeton) {
  return `florilege-demo-serveur-${String(jeton).trim().toLowerCase()}`;
}

function lireServeur(jeton) {
  return lireStockage(cleServeur(jeton), { votes: {}, vus: [] });
}

function attendre(ms) {
  return new Promise(r => setTimeout(r, ms * (0.6 + Math.random() * 0.8)));
}

async function reseau(ms = LATENCE, bloquable = true) {
  await attendre(ms);
  if (bloquable && (!navigator.onLine || parametres.get('horsligne') === '1')) {
    throw new Error('Hors ligne (simulation)');
  }
}

// ---------------------------------------------------------------- dessin des photos factices

function dessiner(photo, grandCote) {
  const ens = ENSEMBLES.find(e => e.id === photo.ensemble_id);
  const r = hasard(graineDe(photo.id));
  const echelle = grandCote / Math.max(photo.largeur, photo.hauteur);
  const L = Math.round(photo.largeur * echelle);
  const H = Math.round(photo.hauteur * echelle);
  const canvas = document.createElement('canvas');
  canvas.width = L;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const teinte = ens.teinte + (r() - 0.5) * 60;

  // Ciel
  const ciel = c.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, `hsl(${teinte + 20} 70% ${55 + r() * 25}%)`);
  ciel.addColorStop(1, `hsl(${teinte + 40} 60% ${80 + r() * 10}%)`);
  c.fillStyle = ciel;
  c.fillRect(0, 0, L, H);

  // Soleil
  c.fillStyle = `hsl(${45 + r() * 15} 95% 70%)`;
  c.beginPath();
  c.arc(L * (0.15 + r() * 0.7), H * (0.12 + r() * 0.25), Math.min(L, H) * (0.06 + r() * 0.06), 0, Math.PI * 2);
  c.fill();

  // Collines superposées
  for (let k = 0; k < 3; k++) {
    const base = H * (0.55 + k * 0.13);
    c.fillStyle = `hsl(${teinte - 60 + k * 15} ${40 + k * 10}% ${45 - k * 10}%)`;
    c.beginPath();
    c.moveTo(0, H);
    c.lineTo(0, base);
    const n = 4 + Math.floor(r() * 3);
    for (let i = 1; i <= n; i++) {
      c.quadraticCurveTo(L * (i - 0.5) / n, base - H * (0.05 + r() * 0.15), L * i / n, base + (r() - 0.5) * H * 0.05);
    }
    c.lineTo(L, H);
    c.fill();
  }

  // Silhouettes de « personnes »
  const nbPersonnes = Math.floor(r() * 5);
  for (let i = 0; i < nbPersonnes; i++) {
    const x = L * (0.15 + r() * 0.7);
    const y = H * (0.7 + r() * 0.15);
    const t = Math.min(L, H) * (0.06 + r() * 0.04);
    c.fillStyle = `hsl(${r() * 360} 55% 45%)`;
    c.beginPath();
    c.ellipse(x, y + t * 1.6, t * 0.9, t * 1.4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `hsl(${25 + r() * 15} 45% ${55 + r() * 25}%)`;
    c.beginPath();
    c.arc(x, y, t * 0.65, 0, Math.PI * 2);
    c.fill();
  }

  // Étiquette lisible : ensemble et numéro
  const taille = Math.round(Math.min(L, H) * 0.09);
  c.font = `700 ${taille}px system-ui, sans-serif`;
  c.textBaseline = 'top';
  const texte = `${ens.nom} · n° ${photo.ordre}`;
  const marge = taille * 0.5;
  const largeurTexte = c.measureText(texte).width;
  c.fillStyle = 'rgba(0,0,0,.45)';
  c.fillRect(marge * 0.6, marge * 0.6, largeurTexte + marge * 0.8, taille * 1.3);
  c.fillStyle = '#fff';
  c.fillText(texte, marge, marge * 0.75);

  return new Promise(res => canvas.toBlob(res, 'image/jpeg', grandCote > 400 ? 0.82 : 0.7));
}

// ---------------------------------------------------------------- API simulée

export const backendSimule = {
  async etat(jeton) {
    if (parametres.get('reinit') === '1') supprimerStockage(cleServeur(jeton));
    // L'état se charge toujours en démonstration ; ?horsligne=1 ne bloque que les envois.
    await attendre(LATENCE);
    const serveur = lireServeur(jeton);
    const votes = {};
    for (const [id, v] of Object.entries(serveur.votes)) votes[id] = v.valeur;
    const total = PHOTOS.length * 3;
    const faitsParLesAutres = Math.round(PHOTOS.length * 3 * 0.35);
    const faitsParMoi = Object.values(votes).filter(v => v !== null).length;
    return {
      selectionneur: { id: jeton.toLowerCase(), nom: jeton },
      config: {
        phase: parametres.get('phase') || 'manche1',
        titre_selection: 'Démonstration',
        max_coups_de_coeur: 4,
        photos_par_ensemble: 4,
      },
      ensembles: ENSEMBLES.map((e, i) => ({ id: e.id, nom: e.nom, ordre: i + 1, nb_photos: e.nb })),
      photos: PHOTOS,
      votes,
      collectif: { faits: Math.min(total, faitsParLesAutres + faitsParMoi), total },
    };
  },

  // Reçoit un lot d'événements ; idempotent grâce à event_id ; le dernier horodatage fait foi.
  async envoyer(jeton, evenements) {
    await reseau();
    const serveur = lireServeur(jeton);
    const vus = new Set(serveur.vus);
    for (const ev of evenements) {
      if (vus.has(ev.event_id)) continue;
      vus.add(ev.event_id);
      if (ev.type !== 'tri') continue;
      const avant = serveur.votes[ev.photo_id];
      if (!avant || avant.horodatage <= ev.horodatage) {
        serveur.votes[ev.photo_id] = { valeur: ev.valeur, horodatage: ev.horodatage };
      }
    }
    serveur.vus = [...vus];
    ecrireStockage(cleServeur(jeton), serveur);
    return { acceptes: evenements.map(e => e.event_id) };
  },

  // Miniatures par lot : { id: Blob }
  async miniatures(jeton, ids) {
    await reseau(LATENCE, false);
    const res = {};
    for (const id of ids) {
      const p = PHOTOS_PAR_ID.get(id);
      if (p) res[id] = await dessiner(p, 320);
    }
    return res;
  },

  // Copie réduite (1 080 px) d'une photo : Blob
  async image(jeton, id) {
    await reseau(LATENCE, false);
    const p = PHOTOS_PAR_ID.get(id);
    if (!p) throw new Error(`Photo inconnue : ${id}`);
    return dessiner(p, 1080);
  },
};
