"""Peta serija članaka. Tekstovi su u fajlovima posts_5*.py, po temama."""
import importlib
import pathlib

DATE_5 = '2026-11-05'
DATE_5_SR = '5. novembra 2026.'

POSTS_5 = []
for _f in sorted(pathlib.Path(__file__).parent.glob('posts_5*.py')):
    POSTS_5 += importlib.import_module(_f.stem).POSTS

for _p in POSTS_5:
    _p['date'] = DATE_5
    _p['date_sr'] = DATE_5_SR
