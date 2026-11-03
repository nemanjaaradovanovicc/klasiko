"""Provera internih linkova na sajtu: pokvareni linkovi, nepostojeća sidra, stranice bez dolaznih linkova.
Pokretanje: python3 tools/check_links.py [-v za broj dolaznih linkova po stranici]"""
import os, re, sys
from collections import defaultdict
from html.parser import HTMLParser

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
SKIP = {'google3b070cd1c273f1ab.html'}
NOINDEX_OK = {'/404', '/hvala', '/hvala-demo'}


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.in_nav = [], set(), 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.add(a['id'])
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])


def url_of(rel):
    u = '/' + rel[:-5] if rel.endswith('.html') else '/' + rel
    if u.endswith('/index'):
        u = u[:-6] or '/'
    return u or '/'


pages = {}
for root, _, files in os.walk(PUB):
    for f in files:
        if f.endswith('.html') and f not in SKIP:
            rel = os.path.relpath(os.path.join(root, f), PUB).replace(os.sep, '/')
            p = P()
            p.feed(open(os.path.join(root, f), encoding='utf-8').read())
            pages[url_of(rel)] = p

errors, warns = [], []
inbound = defaultdict(set)
# tel: bez broja, uključujući CSS href^="tel:" koji alati prijave kao prazan link
bare_tel = re.compile(r'tel:(?!\+381638219713)')
for root, _, files in os.walk(PUB):
    for f in files:
        if not f.endswith(('.html', '.css', '.js')) or f in SKIP:
            continue
        path = os.path.join(root, f)
        text = open(path, encoding='utf-8').read()
        for m in bare_tel.finditer(text):
            line = text[:m.start()].count('\n') + 1
            errors.append(f'{os.path.relpath(path, PUB)}:{line}: tel: bez broja')
            break
for src, p in sorted(pages.items()):
    for h in p.links:
        if h.lower().startswith('tel:'):
            digits = re.sub(r'\D', '', h)
            if len(digits) < 8:
                errors.append(f'{src}: prazan tel link {h}')
        if re.match(r'^[a-z]+:', h) and not h.startswith('https://www.klasiko.rs'):
            if h.startswith('http://'):
                warns.append(f'{src}: nije https: {h}')
            continue
        h2 = h.replace('https://www.klasiko.rs', '') or '/'
        path, _, frag = h2.partition('#')
        path = path.split('?')[0]
        target = path or src
        if target.endswith('.html') or (target != '/' and target.endswith('/')):
            warns.append(f'{src}: nekanonski oblik linka: {h}')
            target = target[:-5] if target.endswith('.html') else target.rstrip('/')
        if not path.startswith('/') and path:
            warns.append(f'{src}: relativan link: {h}')
            continue
        if target.startswith(('/assets/', '/fonts/')) or re.search(r'\.(png|webp|ico|txt|xml|webmanifest|woff2)$', target):
            if not os.path.exists(os.path.join(PUB, target.lstrip('/'))):
                errors.append(f'{src}: ne postoji fajl {h}')
            continue
        if target.startswith('/api/'):
            continue
        if target not in pages:
            errors.append(f'{src}: pokvaren link {h}')
            continue
        if target != src:
            inbound[target].add(src)
        if frag and frag not in pages[target].ids:
            errors.append(f'{src}: sidro #{frag} ne postoji na {target}')

for u in sorted(pages):
    if u == '/' or u in NOINDEX_OK:
        continue
    n = len(inbound[u])
    if n < 3:
        warns.append(f'{u}: samo {n} dolaznih linkova ({", ".join(sorted(inbound[u])) or "nijedan"})')

print(f'Stranica: {len(pages)}')
if '-v' in sys.argv:
    for u in sorted(pages, key=lambda u: len(inbound[u])):
        print(f'{len(inbound[u]):3} {u}')
for e in errors:
    print('GREŠKA', e)
for w in warns:
    print('UPOZORENJE', w)
sys.exit(1 if errors else 0)
