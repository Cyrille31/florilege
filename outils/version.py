#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Florilège — change le numéro de version partout où il apparaît.

    python outils/version.py 0.6.0

Met à jour js/config.js et apps-script/Code.gs (version affichée) et ajoute « ?v=<version> » à tous les chemins
de fichiers JavaScript et CSS chargés par les pages : chaque nouvelle version force ainsi
les navigateurs à recharger les fichiers au lieu d'utiliser leur copie en cache.

© 2026 Cyrille Gindre — CGExcel — Licence MIT + BAL 1.0 (voir LICENSE).
"""

import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
        print("Utilisation : python outils/version.py 1.2.3")
        return 1
    v = sys.argv[1]

    # Imports entre modules JavaScript : from './x.js' / import './x.js'
    motif_js = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.{1,2}/[^'"?]+\.js)(\?v=[^'"]*)?(['"])""")
    # Pages HTML : src="js/x.js", href="css/x.css", et imports dans les scripts intégrés
    motif_html = re.compile(r"""((?:src|href)=")((?:\./)?(?:js|css)/[^"?]+\.(?:js|css))(\?v=[^"]*)?(")""")

    modifies = []
    for chemin in sorted(RACINE.glob("js/**/*.js")) + sorted(RACINE.glob("*.html")):
        texte = chemin.read_text(encoding="utf-8")
        nouveau = motif_js.sub(lambda m: f"{m[1]}{m[2]}?v={v}{m[4]}", texte)
        if chemin.suffix == ".html":
            nouveau = motif_html.sub(lambda m: f"{m[1]}{m[2]}?v={v}{m[4]}", nouveau)
        if chemin.name == "config.js":
            nouveau = re.sub(r"version: '[^']*'", f"version: '{v}'", nouveau)
        if nouveau != texte:
            chemin.write_text(nouveau, encoding="utf-8")
            modifies.append(chemin.relative_to(RACINE).as_posix())

    # Version du script Apps Script (affichée par doGet et « À propos »).
    gs = RACINE / "apps-script" / "Code.gs"
    texte = gs.read_text(encoding="utf-8")
    nouveau = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{v}';", texte)
    if nouveau != texte:
        gs.write_text(nouveau, encoding="utf-8")
        modifies.append("apps-script/Code.gs")

    print(f"Version {v} : {len(modifies)} fichier(s) mis à jour.")
    for m in modifies:
        print(f"  {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
