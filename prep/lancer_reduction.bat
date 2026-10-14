@echo off
chcp 65001 >nul
rem Florilège - réduction des photos - CGExcel - (c) 2026 Cyrille Gindre - MIT + BAL 1.0
rem En echange, une seule chose vous est demandee, sur l'honneur : faire une bonne action chaque jour.
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set PY=py) else (set PY=python)

%PY% -c "import PIL, pillow_heif" >nul 2>nul
if not %errorlevel%==0 (
    echo Installation de Pillow et pillow-heif...
    %PY% -m pip install --user pillow pillow-heif
)

%PY% reduire_photos.py %*
echo.
pause
