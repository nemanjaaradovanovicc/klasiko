import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import build_common as C
from niches import NICHE_PAGES
from posts import POSTS

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
C.POSTS[:] = POSTS
import math
for _p in POSTS:
    _p['minutes'] = max(3, math.ceil(len(re.sub(r'<[^>]+>', ' ', _p['body']).split()) / 200))
BY_SLUG = {p['slug']: p for p in POSTS}

def post_card(p):
    return f'''<a class="post-card" href="/blog/{p['slug']}"><div class="cov" aria-hidden="true"><span>{p['tag']}</span></div><div class="bd"><strong>{C.e(p['title'])}</strong><p>{C.e(p['excerpt'])}</p><em>Pročitaj, {p['minutes']} min →</em></div></a>'''


MOCK = {
 'jezici': ('Škola jezika Lingua', [('16:00','Engleski za decu, A1','Sala 1'),('17:30','Nemački A2, tinejdžeri','Sala 2'),('19:00','Engleski B2, odrasli','Sala 1')], ('Ana P.','Plaćeno'), ('Luka I.','Čeka uplatu'), ('Grupe',14), ('Polaznici',126)),
 'ples': ('Plesni studio Ritam', [('17:00','Balet, deca 5 do 7','Sala 1'),('18:30','Hip hop, juniori','Sala 2'),('20:00','Latino, odrasli','Sala 1')], ('Mina P.','Plaćeno'), ('Sara J.','Čeka uplatu'), ('Grupe',9), ('Plesači',87)),
 'borilacke': ('Karate klub Pobeda', [('17:00','Mlađi pioniri','Sala A'),('18:15','Juniori, žuti i narandžasti pojas','Sala A'),('19:30','Seniori','Sala B')], ('Luka I.','Plaćeno'), ('Nikola S.','Čeka uplatu'), ('Grupe',6), ('Članovi',112)),
 'centri': ('Edukativni centar Korak', [('10:00','Programiranje za decu','Učionica 1'),('15:00','Priprema za prijemni, matematika','Učionica 2'),('18:00','Gitara, početni','Učionica 3')], ('Jovan M.','Plaćeno'), ('Teodora R.','Rata kasni'), ('Kursevi',11), ('Polaznici',154)),
}

def mock_html(src):
    name, rows, ok, late, s1, s2 = MOCK[src]
    r = ''.join(f'<div class="mk-row{" o" if i == 1 else ""}"><b>{t}</b><span>{C.e(n)}</span><small>{C.e(room)}</small></div>' for i, (t, n, room) in enumerate(rows))
    return f'''<div class="mock" aria-hidden="true">
<div class="mk-card">
<div class="mk-top"><i></i><i></i><i></i><span>Pregled</span></div>
<div class="mk-bd">
<div class="mk-hi"><div><strong>{C.e(name)}</strong><small>Danas su tri časa i jedna uplata čeka</small></div><em>{name[0]}</em></div>
<div class="mk-stats"><div><small>{s1[0]}</small><b>{s1[1]}</b></div><div><small>{s2[0]}</small><b>{s2[1]}</b></div><div class="c"><small>Čeka uplatu</small><b>1</b></div></div>
<div class="mk-list"><small>Današnji termini</small>{r}</div>
<div class="mk-pay"><span>{C.e(ok[0])}</span><em>{ok[1]}</em></div>
<div class="mk-pay late"><span>{C.e(late[0])}</span><em>{late[1]}</em></div>
</div>
</div>
<div class="mk-float"><span>✓</span>Prisustvo zabeleženo</div>
</div>'''

def faq_ld(items):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}

# ---------- Stranice po vrsti škole ----------
for n in NICHE_PAGES:
    path = n['path']
    bc = [('Početna', '/'), (n['name'], None)]
    ld = {"@context": "https://schema.org", "@graph": [
        C.ORG,
        {"@type": "WebPage", "@id": C.SITE + path + "#webpage", "url": C.SITE + path, "name": n['title'],
         "description": n['desc'], "inLanguage": "sr-Latn", "isPartOf": {"@id": C.SITE + "/#website"},
         "about": {"@type": "SoftwareApplication", "name": "Klasiko", "applicationCategory": "BusinessApplication",
                   "operatingSystem": "Web, iOS, Android", "audience": {"@type": "BusinessAudience", "audienceType": n['name']}}},
        C.bc_ld(bc, path),
        faq_ld(n['faq']),
    ]}
    pains = ''.join(f'<div class="pain"><b>{t}</b><div><strong>{C.e(a)}</strong><span>{C.e(b)}</span></div></div>' for t, a, b in n['pains'])
    feats = ''.join(f'<div class="card"><div class="ic {cls}">{C.ICONS[ic]}</div><div><h3>{C.e(h)}</h3><p>{C.e(p)}</p></div></div>' for ic, h, p, cls in n['feats'])
    steps = ''.join(f'<li><div><strong>{C.e(a)}</strong><span>{C.e(b)}</span></div></li>' for a, b in n['steps'])
    faqs = ''.join(f'<details{" open" if i == 0 else ""}><summary>{C.e(q)}</summary><p>{C.e(a)}</p></details>' for i, (q, a) in enumerate(n['faq']))
    others = ''.join(f'<a class="lk" href="{p}"><small>Za koga</small><strong>{l}</strong><em>Pogledaj →</em></a>' for p, l in C.NICHES if p != path)
    posts = ''.join(post_card(BY_SLUG[s]) for s in n['blog'])
    page = C.head(n['title'], n['desc'], path, og_title=n['h1'] + ' | Klasiko', ld=ld) + C.header() + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-grid">
<div class="hero-in">
{C.crumbs(bc)}
<span class="badge"><i></i>{n['badge']}. Lista čekanja je otvorena.</span>
<h1>{n['h1']}<span class="dot">.</span></h1>
<p class="lead">{n['lead']}</p>
{C.form('prijava', n['src'] + '-hero')}
<ul class="checks"><li>Popust za rane korisnike</li><li>Bez obaveze</li><li>Bez spama</li></ul>
</div>
<div class="hero-vis">{mock_html(n['src'])}<p class="mk-note">Konceptualni prikaz aplikacije u razvoju. Imena i brojevi su primeri.</p></div>
</div>
</section>

<section class="sec alt">
<div class="wrap split">
<div class="sec-head" style="margin:0"><span class="eyebrow">Zvuči poznato?</span><h2>{n['pain_title']}<span class="dot">.</span></h2><p>{n['pain_text']}</p></div>
<div class="panel"><span class="eyebrow" style="display:block;padding-bottom:6px">Jedna obična nedelja</span>{pains}</div>
</div>
</section>

<section class="sec">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Planirane mogućnosti</span><h2>{n['feat_title']}<span class="dot">.</span></h2></div>
<div class="grid">{feats}</div>
<p class="small">Klasiko je u razvoju. Redosled mogućnosti oblikujemo prema razgovorima sa školama i klubovima.</p>
</div>
</section>

<section class="sec alt">
<div class="wrap split">
<div class="sec-head" style="margin:0"><span class="eyebrow">Kako zamišljamo Klasiko</span><h2>Tri koraka do uredne organizacije<span class="dot">.</span></h2><p>Bez komplikovanog podešavanja i bez obuke od nekoliko dana.</p><div><a class="btn" href="#prijava">Želim rani pristup</a></div></div>
<ol class="steps">{steps}</ol>
</div>
</section>

<section class="sec">
<div class="wrap split">
<div class="sec-head" style="margin:0;flex:1 1 300px"><span class="eyebrow">FAQ</span><h2>Česta pitanja<span class="dot">.</span></h2><p>Nema tvog pitanja? Piši nam na <a href="https://www.instagram.com/klasiko.rs/" target="_blank" rel="noopener">Instagramu</a> ili na <a href="mailto:{C.EMAIL}">{C.EMAIL}</a>.</p></div>
<div class="faq" style="flex:2 1 520px">{faqs}</div>
</div>
</section>

<section class="sec alt">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Sa bloga</span><h2>Saveti za lakše vođenje<span class="dot">.</span></h2></div>
<div class="posts">{posts}</div>
<div class="sec-head" style="margin:56px 0 24px"><span class="eyebrow">Klasiko pravimo i za</span></div>
<div class="links">{others}</div>
</div>
</section>
{C.cta(n['src'])}
</main>
''' + C.footer()
    open(os.path.join(OUT, n['file']), 'w', encoding='utf-8').write(page)
    print('ok', path)

# ---------- Blog ----------
os.makedirs(os.path.join(OUT, 'blog'), exist_ok=True)
bc = [('Početna', '/'), ('Blog', None)]
ld = {"@context": "https://schema.org", "@graph": [
    C.ORG,
    {"@type": "Blog", "@id": C.SITE + "/blog#blog", "url": C.SITE + "/blog", "name": "Klasiko blog",
     "description": "Praktični saveti za vlasnike škola jezika, plesnih škola, klubova i edukativnih centara.",
     "inLanguage": "sr-Latn", "publisher": {"@id": C.SITE + "/#organization"},
     "blogPost": [{"@type": "BlogPosting", "headline": p['title'], "url": C.SITE + "/blog/" + p['slug'], "datePublished": C.DATE} for p in POSTS]},
    C.bc_ld(bc, '/blog'),
]}
cards = ''.join(post_card(p) for p in POSTS)
page = C.head('Blog za vlasnike škola i klubova: saveti za organizaciju | Klasiko',
              'Praktični saveti za vlasnike škola jezika, plesnih škola, klubova borilačkih veština i edukativnih centara: članarine, raspored časova i kako privući nove učenike.',
              '/blog', og_title='Klasiko blog: saveti za vođenje škole', ld=ld) + C.header('/blog') + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-in">
{C.crumbs(bc)}
<span class="badge"><i></i>Klasiko blog</span>
<h1>Saveti za lakše vođenje škole<span class="dot">.</span></h1>
<p class="lead">Praktični vodiči za vlasnike škola jezika, plesnih škola, klubova i edukativnih centara. Bez teorije, sa primerima koje možeš da primeniš već sutra.</p>
</div>
</section>
<section class="sec alt" style="padding-top:clamp(40px,6vw,72px)">
<div class="wrap">
<div class="posts">{cards}</div>
</div>
</section>
<section class="sec" style="padding-bottom:0">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Lista čekanja</span><h2>Novi članci i vesti o Klasiku, u tvom inboxu<span class="dot">.</span></h2><p>Prijavi se na listu čekanja: šaljemo povremene savete i javljamo ti kada otvorimo rani pristup, uz popust za rane korisnike.</p></div>
{C.form('prijava', 'blog-hero')}
</div>
</section>
{C.cta('blog')}
</main>
''' + C.footer()
open(os.path.join(OUT, 'blog', 'index.html'), 'w', encoding='utf-8').write(page)
print('ok /blog')

for p in POSTS:
    path = '/blog/' + p['slug']
    body = p['body']
    heads = re.findall(r'<h2 id="([^"]+)">([^<]+)</h2>', body)
    toc = '<nav class="toc" aria-label="Sadržaj članka"><b>U ovom članku</b><ol>' + ''.join(f'<li><a href="#{i}">{t}</a></li>' for i, t in heads) + '</ol></nav>'
    # forma u sredini članka
    mid = heads[len(heads) // 2][0]
    inline = f'''<div class="inline-cta col"><p>Klasiko pravimo da članarine, raspored i obaveštenja budu na jednom mestu. Prijavi se na listu čekanja i obezbedi popust za rane korisnike.</p><div class="dark">{C.form('prijava', 'blog-' + p['slug'], 'Želim rani pristup', dark=True)}</div></div>\n'''
    body = body.replace(f'<h2 id="{mid}">', inline + f'<h2 id="{mid}">', 1)
    words = len(re.sub(r'<[^>]+>', ' ', p['body']).split())
    bc = [('Početna', '/'), ('Blog', '/blog'), (p['short'], None)]
    ld = {"@context": "https://schema.org", "@graph": [
        C.ORG,
        {"@type": "BlogPosting", "@id": C.SITE + path + "#article", "headline": p['title'], "description": p['desc'],
         "url": C.SITE + path, "mainEntityOfPage": C.SITE + path, "image": C.SITE + "/og-image.png",
         "datePublished": C.DATE, "dateModified": C.DATE, "inLanguage": "sr-Latn", "wordCount": words,
         "author": {"@type": "Person", "name": "Nemanja Radovanović", "jobTitle": "Osnivač, Klasiko"},
         "publisher": {"@id": C.SITE + "/#organization"}},
        C.bc_ld(bc, path),
    ]}
    related = ''.join(post_card(q) for q in POSTS if q['slug'] != p['slug'])
    extra = f'<meta property="article:published_time" content="{C.DATE}">\n<meta property="article:author" content="Nemanja Radovanović">\n'
    page = C.head(p['seo_title'], p['desc'], path, og_title=p['title'], og_type='article', ld=ld, extra=extra) + C.header('/blog') + f'''<main id="sadrzaj">
<article>
<header class="post-hero hero">
<div class="wrap hero-in">
{C.crumbs(bc)}
<span class="badge"><i></i>{p['tag']}</span>
<h1>{C.e(p['title'])}<span class="dot">.</span></h1>
<p class="lead">{C.e(p['lead'])}</p>
<div class="meta"><span class="av" aria-hidden="true">NR</span><span>Nemanja Radovanović</span><span class="sep">·</span><time datetime="{C.DATE}">{C.DATE_SR}</time><span class="sep">·</span><span class="rt">{p['minutes']} min čitanja</span></div>
</div>
</header>
<div class="prose">
{toc}
{body}
</div>
</article>
<section class="sec alt">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Pročitaj još</span><h2>Još saveta sa bloga<span class="dot">.</span></h2></div>
<div class="posts">{related}</div>
<div class="sec-head" style="margin:56px 0 24px"><span class="eyebrow">Klasiko pravimo za</span></div>
<div class="links">{''.join(f'<a class="lk" href="{q}"><small>Za koga</small><strong>{l}</strong><em>Pogledaj →</em></a>' for q, l in C.NICHES)}</div>
</div>
</section>
{C.cta('blog-' + p['slug'])}
</main>
''' + C.footer()
    open(os.path.join(OUT, 'blog', p['slug'] + '.html'), 'w', encoding='utf-8').write(page)
    print('ok', path, words, 'reči')

# ---------- Sitemap ----------
urls = [('/', '1.0', 'weekly')] + [(n['path'], '0.9', 'monthly') for n in NICHE_PAGES] + [('/blog', '0.8', 'weekly')] + [('/blog/' + p['slug'], '0.7', 'monthly') for p in POSTS]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
for u, pr, cf in urls:
    img = f'\n    <image:image><image:loc>{C.SITE}/og-image.png</image:loc></image:image>' if u == '/' else ''
    sm += f'  <url>\n    <loc>{C.SITE}{u}</loc>\n    <lastmod>{C.DATE}</lastmod>\n    <changefreq>{cf}</changefreq>\n    <priority>{pr}</priority>{img}\n  </url>\n'
sm += '</urlset>\n'
open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)
print('ok sitemap', len(urls))
