"""Šesta serija članaka. Tekstovi su u fajlovima posts_6*.py, po temama."""
import importlib
import pathlib

DATE_6 = '2026-11-05'
DATE_6_SR = '5. novembra 2026.'

POSTS_6 = []
for _f in sorted(pathlib.Path(__file__).parent.glob('posts_6?.py')):
    POSTS_6 += importlib.import_module(_f.stem).POSTS

for _p in POSTS_6:
    _p['date'] = DATE_6
    _p['date_sr'] = DATE_6_SR
