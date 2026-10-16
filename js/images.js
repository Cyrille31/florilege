// Florilège — chargement des images : miniatures par lots, grandes images une par une,
// au plus N requêtes simultanées, priorités (photo affichée d'abord, puis préchargement),
// cache Cache Storage pour ne jamais retélécharger une image déjà vue sur cet appareil.
// © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import { CONFIG, cleLocale } from './config.js?v=0.12.6';

const NOM_CACHE = cleLocale('images-v1'); // un cache par sélection
const GRANDES_EN_MEMOIRE = 40;

async function ouvrirCache() {
  try {
    return 'caches' in window ? await caches.open(NOM_CACHE) : null;
  } catch {
    return null;
  }
}

function cleCache(taille, id) {
  return new Request(`${location.origin}/__florilege__/${taille}/${encodeURIComponent(id)}`);
}

export class ChargeurImages {
  constructor(backend, jeton) {
    this.backend = backend;
    this.jeton = jeton;
    this.urls = new Map();       // "taille:id" → URL objet
    this.promesses = new Map();  // "taille:id" → Promise<URL>
    this.attente = [];           // tâches en file : { cle, priorite, executer }
    this.actives = 0;
    this.minisDemandees = new Map(); // id → { resolve, reject, priorite }
    this.lotPlanifie = false;
    this.ordreGrandes = [];      // pour libérer la mémoire des grandes images anciennes
    this.cache = ouvrirCache();
  }

  urlSiDisponible(id, taille) {
    return this.urls.get(`${taille}:${id}`) || null;
  }

  // ---- file de requêtes avec priorité (plus petit = plus urgent)

  planifier(cle, priorite, executer) {
    const deja = this.attente.find(t => t.cle === cle);
    if (deja) {
      deja.priorite = Math.min(deja.priorite, priorite);
      return;
    }
    this.attente.push({ cle, priorite, executer });
    this.lancer();
  }

  remonterPriorite(cle, priorite) {
    const tache = this.attente.find(t => t.cle === cle);
    if (tache) tache.priorite = Math.min(tache.priorite, priorite);
  }

  lancer() {
    while (this.actives < CONFIG.requetesSimultanees && this.attente.length) {
      this.attente.sort((a, b) => a.priorite - b.priorite);
      const tache = this.attente.shift();
      this.actives++;
      tache.executer().finally(() => {
        this.actives--;
        this.lancer();
      });
    }
  }

  async depuisCache(taille, id) {
    try {
      const cache = await this.cache;
      const rep = cache && await cache.match(cleCache(taille, id));
      return rep ? await rep.blob() : null;
    } catch {
      return null;
    }
  }

  async versCache(taille, id, blob) {
    try {
      const cache = await this.cache;
      if (cache) await cache.put(cleCache(taille, id), new Response(blob, { headers: { 'Content-Type': blob.type } }));
    } catch { /* quota dépassé, etc. : sans gravité */ }
  }

  enregistrer(taille, id, blob) {
    const cle = `${taille}:${id}`;
    const url = URL.createObjectURL(blob);
    this.urls.set(cle, url);
    if (taille === 'grande') {
      this.ordreGrandes.push(cle);
      while (this.ordreGrandes.length > GRANDES_EN_MEMOIRE) {
        const vieille = this.ordreGrandes.shift();
        URL.revokeObjectURL(this.urls.get(vieille));
        this.urls.delete(vieille);
        this.promesses.delete(vieille);
      }
    }
    return url;
  }

  // ---- grandes images (1 080 px)

  grande(id, priorite = 0) {
    const cle = `grande:${id}`;
    if (this.urls.has(cle)) return Promise.resolve(this.urls.get(cle));
    if (this.promesses.has(cle)) {
      this.remonterPriorite(cle, priorite);
      return this.promesses.get(cle);
    }
    const promesse = (async () => {
      const enCache = await this.depuisCache('grande', id);
      if (enCache) return this.enregistrer('grande', id, enCache);
      const blob = await new Promise((resolve, reject) => {
        this.planifier(cle, priorite, () => this.backend.image(this.jeton, id).then(resolve, reject));
      });
      this.versCache('grande', id, blob);
      return this.enregistrer('grande', id, blob);
    })();
    promesse.catch(() => this.promesses.delete(cle));
    this.promesses.set(cle, promesse);
    return promesse;
  }

  // ---- miniatures (320 px), regroupées par lots

  mini(id, priorite = 0) {
    const cle = `mini:${id}`;
    if (this.urls.has(cle)) return Promise.resolve(this.urls.get(cle));
    if (this.promesses.has(cle)) return this.promesses.get(cle);
    const promesse = (async () => {
      const enCache = await this.depuisCache('mini', id);
      if (enCache) return this.enregistrer('mini', id, enCache);
      const blob = await new Promise((resolve, reject) => {
        this.minisDemandees.set(id, { resolve, reject, priorite });
        this.planifierLot();
      });
      this.versCache('mini', id, blob);
      return this.enregistrer('mini', id, blob);
    })();
    promesse.catch(() => this.promesses.delete(cle));
    this.promesses.set(cle, promesse);
    return promesse;
  }

  planifierLot() {
    if (this.lotPlanifie) return;
    this.lotPlanifie = true;
    // On attend un court instant pour regrouper les demandes faites au même moment.
    setTimeout(() => {
      this.lotPlanifie = false;
      const demandes = [...this.minisDemandees.entries()].sort((a, b) => a[1].priorite - b[1].priorite);
      this.minisDemandees.clear();
      for (let i = 0; i < demandes.length; i += CONFIG.miniaturesParLot) {
        const lot = demandes.slice(i, i + CONFIG.miniaturesParLot);
        const ids = lot.map(([id]) => id);
        this.planifier(`lot:${ids.join(',')}`, lot[0][1].priorite + 0.5, async () => {
          try {
            const res = await this.backend.miniatures(this.jeton, ids);
            for (const [id, d] of lot) {
              if (res[id]) d.resolve(res[id]);
              else d.reject(new Error(`Miniature absente : ${id}`));
            }
          } catch (e) {
            for (const [, d] of lot) d.reject(e);
          }
        });
      }
    }, 30);
  }

  minis(ids, priorite = 1) {
    return ids.map(id => this.mini(id, priorite).catch(() => null));
  }
}
