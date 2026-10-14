# Florilège — tests du script de réduction des photos (pytest).
# © 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).

import os
import sys
import time

import pytest
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import reduire_photos as rp  # noqa: E402


def photo(chemin, taille=(3000, 2000), orientation=None, gps=False):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    im = Image.new("RGB", taille, (200, 120, 40))
    exif = Image.Exif()
    exif[0x010F] = "Appareil de test"
    if orientation:
        exif[0x0112] = orientation
    if gps:
        exif[0x8825] = {1: "N", 2: (43.0, 36.0, 0.0)}
    ext = os.path.splitext(chemin)[1].lower()
    im.save(chemin, "PNG" if ext == ".png" else "JPEG", exif=exif.tobytes())


@pytest.fixture
def selection(tmp_path):
    r = tmp_path / "Ma sélection"
    photo(str(r / "2001" / "a.jpg"))
    photo(str(r / "2001" / "Vacances" / "b.JPG"), (1500, 4000))
    photo(str(r / "2001" / "Vacances" / "Plage" / "c.png"), (800, 600))
    photo(str(r / "2002" / "d.jpeg"), orientation=6)
    (r / "2002" / "film.mp4").write_bytes(b"pas une image")
    photo(str(r / "2002" / "_Originaux_Picasa" / "d.jpeg"))  # à ignorer
    photo(str(r / "Divers" / "e.jpg"))  # pas un dossier d'année
    return r


def test_noms():
    assert rp.nom_reduit("IMG_1.jpg") == "IMG_1.jpg"
    assert rp.nom_reduit("IMG_1.HEIC") == "IMG_1.HEIC.jpg"
    assert rp.nom_original("IMG_1.HEIC.jpg") == "IMG_1.HEIC"
    assert rp.nom_original("IMG_2.jpg") == "IMG_2.jpg"
    assert rp.nom_original("vacances.2001.jpg") == "vacances.2001.jpg"
    assert rp.est_dossier_allege("2001-allégé") and rp.est_dossier_allege("2001-ALLEGE")


def test_arborescence_et_reduction(selection):
    bilan = rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    a = selection / "2001-allégé"
    assert (a / "a.jpg").exists()
    assert (a / "Vacances" / "b.JPG").exists()
    assert (a / "Vacances" / "Plage" / "c.png.jpg").exists()
    assert (selection / "2002-allégé" / "d.jpeg").exists()
    assert not (selection / "2002-allégé" / "_Originaux_Picasa").exists()
    assert not (selection / "Divers-allégé").exists()
    assert bilan["ignores"] == [os.path.join("2002", "film.mp4")]
    with Image.open(a / "a.jpg") as im:
        assert max(im.size) == 1080 and im.size == (1080, 720)
        assert not im.getexif()  # métadonnées supprimées
    with Image.open(a / "Vacances" / "Plage" / "c.png.jpg") as im:
        assert im.size == (800, 600)  # jamais agrandie
    with Image.open(selection / "2002-allégé" / "d.jpeg") as im:
        assert im.size == (720, 1080)  # orientation 6 appliquée aux pixels


def test_relance_incrementale(selection):
    rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    bilan = rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    assert bilan["a_traiter"] == 0
    assert bilan["annees"]["2001"]["inchangees"] == 3
    # Ajout d'une photo, d'un dossier et modification d'un original
    photo(str(selection / "2001" / "Nouveau" / "f.jpg"))
    photo(str(selection / "2003" / "g.jpg"))
    time.sleep(0.05)
    os.utime(selection / "2001" / "a.jpg", (time.time() + 10, time.time() + 10))
    bilan = rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    assert bilan["annees"]["2001"]["nouvelles"] == 1
    assert bilan["annees"]["2001"]["mises_a_jour"] == 1
    assert bilan["annees"]["2003"]["nouvelles"] == 1
    assert (selection / "2003-allégé" / "g.jpg").exists()


def test_orphelines(selection):
    rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    os.remove(selection / "2001" / "a.jpg")
    bilan = rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    assert bilan["orphelines"] == [os.path.join("2001-allégé", "a.jpg")]
    assert (selection / "2001-allégé" / "a.jpg").exists()  # signalée, pas supprimée
    rp.traiter(str(selection), processus=1, nettoyer=True, afficher=lambda *_: None)
    assert not (selection / "2001-allégé" / "a.jpg").exists()


def test_originaux_intacts(selection):
    avant = {p: p.stat().st_mtime for p in selection.rglob("*") if p.is_file()}
    rp.traiter(str(selection), processus=1, afficher=lambda *_: None)
    for p, m in avant.items():
        assert p.stat().st_mtime == m


def test_heic(tmp_path):
    pytest.importorskip("pillow_heif")
    r = tmp_path / "s"
    os.makedirs(r / "2004")
    Image.new("RGB", (2000, 1500), (10, 200, 10)).save(r / "2004" / "IMG_1.HEIC")
    rp.traiter(str(r), processus=1, afficher=lambda *_: None)
    with Image.open(r / "2004-allégé" / "IMG_1.HEIC.jpg") as im:
        assert im.size == (1080, 810)
