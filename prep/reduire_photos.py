#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Florilège — création des dossiers de photos allégées
====================================================

Dans le dossier Google Drive de la sélection (celui qui contient le Google Sheet), chaque dossier
d'année (« 2001 », « 2002 »…, avec éventuellement des sous-dossiers) reçoit un jumeau « 2001-allégé »
qui reproduit la même arborescence avec des copies réduites des photos :
  - 1 080 pixels de grand côté au plus, JPEG qualité 78, progressif ;
  - orientation appliquée aux pixels, toutes les métadonnées supprimées (dont la position GPS) ;
  - même nom de fichier ; les photos qui ne sont pas en JPEG (HEIC, PNG…) reçoivent « .jpg » en plus
    (IMG_0001.HEIC → IMG_0001.HEIC.jpg), ce qui permet de retrouver le nom d'origine.

Relance sans risque : seules les photos nouvelles ou modifiées depuis le dernier passage sont traitées ;
les originaux ne sont jamais modifiés. Les copies dont l'original a disparu sont signalées
(et supprimées avec l'option --nettoyer).

Utilisation :
    python reduire_photos.py "G:\\Mon Drive\\Florilège\\Ma sélection"
    python reduire_photos.py              (le dossier est alors demandé)
Options : --nettoyer, --taille 1080, --qualite 78, --processus N, --simulation

Dépendances : Python 3.8+, Pillow ; pillow-heif pour les photos d'iPhone (HEIC).

© 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (Bonne Action License).
En échange, une seule chose vous est demandée, sur l'honneur : faire une bonne action chaque jour.
Aider un voisin, sourire à un inconnu, ramasser un papier… c'est vous qui voyez.
"""

import argparse
import os
import sys
import time
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime

VERSION = "0.9.0"
SUFFIXE = "-allégé"
EXTENSIONS_JPEG = {".jpg", ".jpeg"}
EXTENSIONS_IMAGES = EXTENSIONS_JPEG | {".png", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".webp", ".gif"}
# Dossiers jamais parcourus (dont ceux produits par picasa-export).
DOSSIERS_IGNORES = {"_originaux_picasa", "originaux_picasa", "_catalogue_picasa", ".picasaoriginals"}

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    print("Il manque Pillow. Installez-le avec :  pip install pillow pillow-heif")
    sys.exit(1)

try:  # photos d'iPhone
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_POSSIBLE = True
except ImportError:  # pragma: no cover
    HEIC_POSSIBLE = False

Image.MAX_IMAGE_PIXELS = None


# --------------------------------------------------------------------------- noms et dossiers

def normaliser(nom):
    return unicodedata.normalize("NFC", nom).casefold()


def est_dossier_allege(nom):
    n = normaliser(nom)
    return n.endswith(normaliser(SUFFIXE)) or n.endswith("-allege")


def est_dossier_annee(chemin):
    """Un dossier d'année commence par un chiffre et n'est pas lui-même un dossier allégé."""
    nom = os.path.basename(chemin)
    return os.path.isdir(chemin) and nom[:1].isdigit() and not est_dossier_allege(nom)


def nom_reduit(nom):
    """Nom de la copie réduite : identique pour un JPEG, sinon « .jpg » est ajouté."""
    return nom if os.path.splitext(nom)[1].lower() in EXTENSIONS_JPEG else nom + ".jpg"


def nom_original(nom_copie):
    """Inverse de nom_reduit : IMG_1.HEIC.jpg → IMG_1.HEIC ; IMG_2.jpg → IMG_2.jpg."""
    base, ext = os.path.splitext(nom_copie)
    if ext.lower() in EXTENSIONS_JPEG and os.path.splitext(base)[1].lower() in EXTENSIONS_IMAGES - EXTENSIONS_JPEG:
        return base
    return nom_copie


def lister_photos(dossier_annee):
    """Liste (chemin relatif, chemin complet) des images d'un dossier d'année, sous-dossiers compris,
    et les fichiers ignorés (vidéos, documents…)."""
    photos, ignores = [], []
    for racine, dossiers, fichiers in os.walk(dossier_annee):
        dossiers[:] = sorted(d for d in dossiers if not d.startswith(".") and normaliser(d) not in DOSSIERS_IGNORES)
        for nom in sorted(fichiers):
            if nom.startswith(".") or nom.lower() in ("thumbs.db", "desktop.ini", ".picasa.ini", "picasa.ini"):
                continue
            complet = os.path.join(racine, nom)
            relatif = os.path.relpath(complet, dossier_annee)
            if os.path.splitext(nom)[1].lower() in EXTENSIONS_IMAGES:
                photos.append((relatif, complet))
            else:
                ignores.append(relatif)
    return photos, ignores


# --------------------------------------------------------------------------- réduction d'une photo

def a_jour(source, cible):
    """La copie existe et correspond à l'original (même date de modification, reportée sur la copie)."""
    try:
        return abs(os.path.getmtime(cible) - os.path.getmtime(source)) < 2
    except OSError:
        return False


def reduire(source, cible, taille, qualite):
    """Crée la copie réduite ; renvoie None si tout va bien, sinon un message d'erreur."""
    try:
        with Image.open(source) as im:
            im = ImageOps.exif_transpose(im)  # l'orientation est appliquée aux pixels
            if im.mode not in ("RGB", "L"):
                fond = Image.new("RGB", im.size, (255, 255, 255))
                rgba = im.convert("RGBA")
                fond.paste(rgba, mask=rgba.split()[-1])
                im = fond
            elif im.mode == "L":
                im = im.convert("RGB")
            im.thumbnail((taille, taille), Image.LANCZOS)  # ne grossit jamais
            os.makedirs(os.path.dirname(cible), exist_ok=True)
            temporaire = cible + ".tmp"
            # Aucune métadonnée n'est recopiée (ni EXIF, ni GPS, ni profil).
            im.save(temporaire, "JPEG", quality=qualite, progressive=True, optimize=True)
        os.replace(temporaire, cible)
        st = os.stat(source)
        os.utime(cible, (st.st_atime, st.st_mtime))  # sert à repérer les originaux modifiés
        return None
    except Exception as e:  # noqa: BLE001
        try:
            os.remove(cible + ".tmp")
        except OSError:
            pass
        return f"{type(e).__name__} : {e}"


def _tache(args):
    source, cible, taille, qualite = args
    return source, reduire(source, cible, taille, qualite)


# --------------------------------------------------------------------------- traitement complet

def traiter(racine, taille=1080, qualite=78, processus=None, nettoyer=False, simulation=False, afficher=print):
    """Traite tous les dossiers d'année de « racine ». Renvoie un dictionnaire de bilan."""
    racine = os.path.abspath(racine)
    annees = sorted(os.path.join(racine, n) for n in os.listdir(racine) if est_dossier_annee(os.path.join(racine, n)))
    bilan = {"annees": {}, "erreurs": [], "ignores": [], "orphelines": [], "heic_impossible": []}
    taches = []

    for dossier in annees:
        nom = os.path.basename(dossier)
        cible_racine = os.path.join(racine, nom + SUFFIXE)
        photos, ignores = lister_photos(dossier)
        b = {"photos": len(photos), "nouvelles": 0, "mises_a_jour": 0, "inchangees": 0}
        attendues = set()
        for relatif, source in photos:
            dossier_rel, fichier = os.path.split(relatif)
            cible = os.path.join(cible_racine, dossier_rel, nom_reduit(fichier))
            attendues.add(os.path.normcase(os.path.abspath(cible)))
            if source.lower().endswith((".heic", ".heif")) and not HEIC_POSSIBLE:
                bilan["heic_impossible"].append(os.path.join(nom, relatif))
                continue
            if a_jour(source, cible):
                b["inchangees"] += 1
                continue
            b["mises_a_jour" if os.path.exists(cible) else "nouvelles"] += 1
            taches.append((source, cible, taille, qualite))
        bilan["ignores"] += [os.path.join(nom, r) for r in ignores]

        # Copies dont l'original n'existe plus.
        if os.path.isdir(cible_racine):
            for r, _, fichiers in os.walk(cible_racine):
                for f in fichiers:
                    complet = os.path.join(r, f)
                    if f.endswith(".tmp") or os.path.normcase(os.path.abspath(complet)) not in attendues:
                        bilan["orphelines"].append(os.path.relpath(complet, racine))
                        if nettoyer and not simulation:
                            os.remove(complet)
            if nettoyer and not simulation:
                for r, dossiers, fichiers in os.walk(cible_racine, topdown=False):
                    if r != cible_racine and not os.listdir(r):
                        os.rmdir(r)
        bilan["annees"][nom] = b
        afficher(f"  {nom} : {b['photos']} photos ({b['nouvelles']} nouvelles, {b['mises_a_jour']} modifiées, "
                 f"{b['inchangees']} déjà à jour)")

    if taches and not simulation:
        afficher(f"Réduction de {len(taches)} photo(s)…")
        faites = 0
        debut = time.time()
        with ProcessPoolExecutor(max_workers=processus or max(1, (os.cpu_count() or 2) - 1)) as executeur:
            for source, erreur in executeur.map(_tache, taches, chunksize=4):
                faites += 1
                if erreur:
                    bilan["erreurs"].append(f"{os.path.relpath(source, racine)} : {erreur}")
                if faites % 50 == 0 or faites == len(taches):
                    duree = time.time() - debut
                    reste = duree / faites * (len(taches) - faites)
                    afficher(f"  {faites}/{len(taches)} — environ {reste / 60:.0f} min restantes")
    bilan["a_traiter"] = len(taches)
    return bilan


def ecrire_rapport(racine, bilan, chemin):
    lignes = [f"Florilège — rapport de réduction des photos ({datetime.now():%Y-%m-%d %H:%M})", f"Dossier : {racine}", ""]
    for nom, b in bilan["annees"].items():
        lignes.append(f"{nom} : {b['photos']} photos — {b['nouvelles']} nouvelles, {b['mises_a_jour']} modifiées, "
                      f"{b['inchangees']} déjà à jour")
    for titre, cle in (("Erreurs", "erreurs"), ("Photos HEIC non traitées (installer pillow-heif)", "heic_impossible"),
                       ("Copies sans original (supprimées si --nettoyer)", "orphelines"),
                       ("Fichiers ignorés (vidéos, documents…)", "ignores")):
        if bilan[cle]:
            lignes += ["", f"{titre} : {len(bilan[cle])}"] + [f"  {x}" for x in bilan[cle]]
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes) + "\n")


def main():
    p = argparse.ArgumentParser(description="Crée les dossiers de photos allégées (« 2001-allégé »…) pour Florilège.")
    p.add_argument("racine", nargs="?", help="dossier Google Drive de la sélection (celui du Google Sheet)")
    p.add_argument("--taille", type=int, default=1080, help="grand côté des copies, en pixels (défaut 1080)")
    p.add_argument("--qualite", type=int, default=78, help="qualité JPEG (défaut 78)")
    p.add_argument("--processus", type=int, default=0, help="nombre de photos traitées en parallèle (défaut : automatique)")
    p.add_argument("--nettoyer", action="store_true", help="supprimer les copies dont l'original a disparu")
    p.add_argument("--simulation", action="store_true", help="ne rien écrire, juste compter")
    a = p.parse_args()

    print(f"Florilège — réduction des photos v{VERSION} — CGExcel\n")
    racine = a.racine or input("Dossier Google Drive de la sélection (celui qui contient le Google Sheet) :\n> ").strip().strip('"')
    if not os.path.isdir(racine):
        print(f"Dossier introuvable : {racine}")
        return 1
    if not any(est_dossier_annee(os.path.join(racine, n)) for n in os.listdir(racine)):
        print("Aucun dossier d'année (nom commençant par un chiffre) dans ce dossier.")
        return 1
    if not HEIC_POSSIBLE:
        print("Remarque : pillow-heif n'est pas installé, les photos HEIC (iPhone) seront ignorées.\n")
    if a.simulation:
        print("MODE SIMULATION : rien ne sera écrit.\n")

    debut = time.time()
    bilan = traiter(racine, a.taille, a.qualite, a.processus or None, a.nettoyer, a.simulation)
    rapport = os.path.join(racine, "rapport_reduction.txt")
    if not a.simulation:
        ecrire_rapport(racine, bilan, rapport)

    print(f"\n=== Terminé en {time.time() - debut:.0f} s ===")
    print(f"Photos réduites : {bilan['a_traiter'] - len(bilan['erreurs'])} | erreurs : {len(bilan['erreurs'])} | "
          f"copies sans original : {len(bilan['orphelines'])} | fichiers ignorés : {len(bilan['ignores'])}")
    if bilan["erreurs"]:
        print("Erreurs :\n  " + "\n  ".join(bilan["erreurs"][:10]))
    if not a.simulation:
        print(f"Rapport détaillé : {rapport}")
    print("\nÉtape suivante : attendre la fin de la synchronisation de Google Drive, puis, dans le Google Sheet,\n"
          "menu Florilège → Mettre à jour la liste des photos.")
    return 0 if not bilan["erreurs"] else 2


if __name__ == "__main__":
    sys.exit(main())
