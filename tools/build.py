import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import build_common as C
from niches import NICHE_PAGES
from posts import POSTS
from posts_more import MORE_POSTS
from posts_batch2a import POSTS_2A
from posts_batch2b import POSTS_2B
from posts_batch3 import POSTS_3
POSTS = POSTS + MORE_POSTS + POSTS_2A + POSTS_2B + POSTS_3

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
C.POSTS[:] = POSTS
import math
for _p in POSTS:
    _p['minutes'] = max(3, math.ceil(len(re.sub(r'<[^>]+>', ' ', _p['body']).split()) / 200))
BY_SLUG = {p['slug']: p for p in POSTS}


def related_posts(p, n=3):
    """Najsrodniji članci: ista tema, zajednička stranica za vrstu škole, međusobni linkovi."""
    def score(q):
        sc = 3 if q['tag'] == p['tag'] else 0
        sc += 2 * sum(1 for nc in NICHE_PAGES if p['slug'] in nc['blog'] and q['slug'] in nc['blog'])
        sc += 1 if f"/blog/{q['slug']}" in p['body'] else 0
        sc += 1 if f"/blog/{p['slug']}" in q['body'] else 0
        return sc
    i = POSTS.index(p)
    others = [q for q in POSTS if q['slug'] != p['slug']]
    # Kod istog skora prednost imaju članci posle ovog (kružno), da se linkovi ravnomerno rasporede.
    return sorted(others, key=lambda q: (-score(q), (POSTS.index(q) - i) % len(POSTS)))[:n]

def post_card(p):
    return f'''<a class="post-card" href="/blog/{p['slug']}"><div class="cov" aria-hidden="true"><span>{p['tag']}</span></div><div class="bd"><strong>{C.e(p['title'])}</strong><p>{C.e(p['excerpt'])}</p><em>Pročitaj, {p['minutes']} min →</em></div></a>'''


MOCK = {
 'jezici': ('Škola jezika Lingua', [('16:00','Engleski za decu, A1','Sala 1'),('17:30','Nemački A2, tinejdžeri','Sala 2'),('19:00','Engleski B2, odrasli','Sala 1')], ('Ana P.','Plaćeno'), ('Luka I.','Čeka uplatu'), ('Grupe',14), ('Polaznici',126)),
 'ples': ('Plesni studio Ritam', [('17:00','Balet, deca 5 do 7','Sala 1'),('18:30','Hip hop, juniori','Sala 2'),('20:00','Latino, odrasli','Sala 1')], ('Mina P.','Plaćeno'), ('Sara J.','Čeka uplatu'), ('Grupe',9), ('Plesači',87)),
 'borilacke': ('Karate klub Pobeda', [('17:00','Mlađi pioniri','Sala A'),('18:15','Juniori, žuti i narandžasti pojas','Sala A'),('19:30','Seniori','Sala B')], ('Luka I.','Plaćeno'), ('Nikola S.','Čeka uplatu'), ('Grupe',6), ('Članovi',112)),
 'vrtic': ('Vrtić Sunčica', [('07:30','Jaslice, dolasci','Soba 1'),('08:00','Srednja grupa, dolasci','Soba 2'),('08:00','Starija grupa, dolasci','Soba 3')], ('Lena M.','Plaćeno'), ('Vuk T.','Čeka uplatu'), ('Grupe',4), ('Dece',62)),
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
    page = C.head(n['title'], n['desc'], path, og_title=n['h1'] + ' | Klasiko', ld=ld) + C.header(path) + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-grid">
<div class="hero-in">
{C.crumbs(bc)}
<span class="badge"><i></i>{n['badge']}. 14 dana besplatno.</span>
<h1>{n['h1']}<span class="dot">.</span></h1>
<p class="lead">{n['lead']}</p>
{C.demo_buttons()}
<ul class="checks"><li>14 dana besplatno</li><li>Besplatan prenos iz Excel-a</li><li>Bez ugovorne obaveze</li></ul>
</div>
<div class="hero-vis">{mock_html(n['src'])}<p class="mk-note">Prikaz aplikacije. Imena i brojevi su primeri.</p></div>
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
<div class="sec-head"><span class="eyebrow">Mogućnosti</span><h2>{n['feat_title']}<span class="dot">.</span></h2></div>
<div class="grid">{feats}</div>
<p class="small">Sve mogućnosti su uključene u svaki paket. Novi alati stižu redovno, prema predlozima škola koje koriste Klasiko.</p>
</div>
</section>

<section class="sec alt">
<div class="wrap split">
<div class="sec-head" style="margin:0"><span class="eyebrow">Kako počinješ</span><h2>Tri koraka do uredne organizacije<span class="dot">.</span></h2><p>Bez komplikovanog podešavanja i bez obuke od nekoliko dana. Ako želiš, podatke iz Excel-a prenosimo mi, besplatno.</p><div><a class="btn" href="/demo">Zakaži demo</a></div></div>
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
cards = ''.join(post_card(p) for p in reversed(POSTS))
page = C.head('Blog: saveti za vlasnike škola i klubova | Klasiko',
              'Praktični saveti za vlasnike škola jezika, plesnih škola, klubova, edukativnih centara i vrtića: članarine, raspored, upis i roditelji.',
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
<div class="sec-head"><span class="eyebrow">Saveti na mejl</span><h2>Novi članci i vesti o Klasiku, u tvom inboxu<span class="dot">.</span></h2><p>Ostavi email: povremeno šaljemo praktične savete za vođenje škole. Bez spama, odjava jednim klikom.</p></div>
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
    inline = f'''<div class="inline-cta col"><p>Klasiko drži učenike, raspored, prisustvo i članarine na jednom mestu, sa IPS QR uplatama i uvozom iz Excel-a. Probaj ga 14 dana besplatno.</p>{C.demo_buttons(dark=True)}</div>\n'''
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
    related = ''.join(post_card(q) for q in related_posts(p))
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
<p style="margin:28px 0 0"><a class="btn soft" href="/blog">Svi članci na blogu</a></p>
<div class="sec-head" style="margin:56px 0 24px"><span class="eyebrow">Klasiko pravimo za</span></div>
<div class="links">{''.join(f'<a class="lk" href="{q}"><small>Za koga</small><strong>{l}</strong><em>Pogledaj →</em></a>' for q, l in C.NICHES)}</div>
</div>
</section>
{C.cta('blog-' + p['slug'])}
</main>
''' + C.footer()
    open(os.path.join(OUT, 'blog', p['slug'] + '.html'), 'w', encoding='utf-8').write(page)
    print('ok', path, words, 'reči')


# ---------- Hvala ----------
share_text = 'Pogledaj Klasiko, program za vođenje škola, klubova i vrtića: učenici, raspored, prisustvo i članarine na jednom mestu. Prvih 14 dana je besplatno: https://www.klasiko.rs/'
from urllib.parse import quote
st = quote(share_text)
page = C.head('Hvala na prijavi | Klasiko', 'Prijava na listu čekanja za Klasiko je primljena.', '/hvala', robots='noindex, follow') + C.header() + f"""<main id="sadrzaj">
<section class="hero thanks">
<div class="wrap hero-in" style="align-items:center;text-align:center">
<div class="tk-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg></div>
<span class="badge" style="align-self:center"><i></i>Prijava je primljena</span>
<h1 style="max-width:none">Hvala na prijavi<span class="dot">!</span></h1>
<p class="lead" style="margin:0 auto">Još samo jedan korak: potvrdi email, da bismo znali da je adresa tvoja.</p>
</div>
</section>
<section class="sec alt" style="padding-top:clamp(40px,6vw,72px)">
<div class="wrap">
<ol class="tk-steps">
<li class="card"><div class="ic c">{C.ICONS['msg']}</div><div><h3>Potvrdi email</h3><p>Poslali smo ti mejl sa linkom za potvrdu. Ako ga ne vidiš za par minuta, proveri folder Promocije ili Spam.</p></div></li>
<li class="card"><div class="ic">{C.ICONS['book']}</div><div><h3>Saveti na mejl</h3><p>Povremeno šaljemo praktične vodiče za vođenje škole i vesti o Klasiku. Bez spama.</p></div></li>
<li class="card"><div class="ic">{C.ICONS['cal']}</div><div><h3>Probaj Klasiko</h3><p>Zakaži kratak demo i otvaramo ti nalog za 14 dana besplatne probe, uz besplatan prenos podataka iz Excel-a. <a href="/demo">Zakaži demo</a></p></div></li>
</ol>
</div>
</section>
<section class="sec">
<div class="wrap">
<div class="share-box">
<div><span class="eyebrow">Podeli</span><h2>Znaš nekoga ko vodi školu ili klub<span class="dot">?</span></h2><p>Pošalji mu link. I on može da proba Klasiko 14 dana besplatno.</p></div>
<div class="share">
<a class="btn" href="https://wa.me/?text={st}" target="_blank" rel="noopener">WhatsApp</a>
<a class="btn" href="viber://forward?text={st}">Viber</a>
<a class="btn soft" href="mailto:?subject={quote('Klasiko, program za vođenje škole')}&amp;body={st}">Email</a>
<button class="btn soft" type="button" data-copy="https://www.klasiko.rs/">Kopiraj link</button>
</div>
</div>
</div>
</section>
<section class="sec alt">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Dok čekaš</span><h2>Saveti za lakše vođenje škole<span class="dot">.</span></h2></div>
<div class="posts">{''.join(post_card(q) for q in POSTS[:3])}</div>
<p class="small" style="margin-top:32px">Želiš da oblikuješ Klasiko sa nama? Piši nam na <a href="https://www.instagram.com/klasiko.rs/" target="_blank" rel="noopener">Instagramu</a> ili na <a href="mailto:{C.EMAIL}">{C.EMAIL}</a> i ispričaj kako danas vodiš školu.</p>
</div>
</section>
</main>
""" + C.footer().replace('<div class="m-sticky">', '<div class="m-sticky" hidden>')
open(os.path.join(OUT, 'hvala.html'), 'w', encoding='utf-8').write(page)
print('ok /hvala')

import pages_launch
pages_launch.build(OUT, post_card, POSTS)

# ---------- Politika privatnosti ----------
import privatnost
bc = [('Početna', '/'), ('Politika privatnosti', None)]
page = C.head('Politika privatnosti | Klasiko',
              'Politika privatnosti sajta i aplikacije Klasiko: koje podatke prikupljamo, zašto, koliko ih čuvamo i kako ostvaruješ svoja prava.',
              '/privatnost', robots='noindex, follow') + C.header() + f'''<main id="sadrzaj">
<header class="post-hero hero">
<div class="wrap hero-in">
{C.crumbs(bc)}
<h1>Politika privatnosti<span class="dot">.</span></h1>
<div class="meta"><span>Poslednja izmena: {privatnost.UPDATED}</span></div>
</div>
</header>
<div class="prose">
{privatnost.BODY}</div>
</main>
''' + C.footer()
open(os.path.join(OUT, 'privatnost.html'), 'w', encoding='utf-8').write(page)
print('ok /privatnost')

# ---------- 404 ----------
popular = [BY_SLUG[s] for s in ('evidencija-clanarina', 'raspored-casova', 'excel-ili-program-za-skolu')]
page = C.head('Stranica nije pronađena | Klasiko', 'Tražena stranica ne postoji.', '/404', robots='noindex, follow', canonical=False) + C.header() + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-in">
<span class="badge"><i></i>Greška 404</span>
<h1>Ova stranica ne postoji<span class="dot">.</span></h1>
<p class="lead">Možda je premeštena ili je adresa pogrešno upisana. Evo gde možeš da nastaviš.</p>
<div class="demo-btns"><a class="btn" href="/">Početna strana</a><a class="btn soft" href="/blog">Blog</a><a class="btn soft" href="/cene">Cene</a></div>
</div>
</section>
<section class="sec alt">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Klasiko pravimo za</span></div>
<div class="links">{''.join(f'<a class="lk" href="{q}"><small>Za koga</small><strong>{l}</strong><em>Pogledaj →</em></a>' for q, l in C.NICHES)}</div>
<div class="sec-head" style="margin:56px 0 24px"><span class="eyebrow">Najčitanije na blogu</span></div>
<div class="posts">{''.join(post_card(q) for q in popular)}</div>
</div>
</section>
</main>
''' + C.footer()
open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(page)
print('ok /404')

# ---------- Početna: isti meni kao na ostalim stranicama ----------
# index.html se uređuje ručno; između oznaka nav:start / nav:end ovde se upisuju header, CSS i JS iz site.css i site.js.
def between(text, start, end):
    i = text.index(start)
    return i, text.index(end, i) + len(end)

def put(text, start, end, new):
    i, j = between(text, start, end)
    return text[:i] + new + text[j:]

css = open(os.path.join(OUT, 'assets', 'site.css'), encoding='utf-8').read()
js = open(os.path.join(OUT, 'assets', 'site.js'), encoding='utf-8').read()
i, j = between(css, '/* nav:start', '/* nav:end */')
nav_css = css[i:j]
i, j = between(js, '// nav:start', '// nav:end')
nav_js = js[i:j]
ip = os.path.join(OUT, 'index.html')
idx = open(ip, encoding='utf-8').read()
idx = put(idx, '/* nav:start', '/* nav:end */', nav_css)
idx = put(idx, '<!-- nav:start -->', '<!-- nav:end -->', '<!-- nav:start -->\n' + C.header().strip() + '\n<!-- nav:end -->')
idx = put(idx, '// nav:start', '// nav:end', nav_js)
open(ip, 'w', encoding='utf-8').write(idx)
print('ok / (meni)')

# ---------- Sitemap ----------
urls = [('/', '1.0', 'weekly'), ('/cene', '0.9', 'monthly'), ('/demo', '0.8', 'monthly')] + [(n['path'], '0.9', 'monthly') for n in NICHE_PAGES] + [('/blog', '0.8', 'weekly')] + [('/blog/' + p['slug'], '0.7', 'monthly') for p in POSTS]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
for u, pr, cf in urls:
    img = f'\n    <image:image><image:loc>{C.SITE}/og-image.png</image:loc></image:image>' if u == '/' else ''
    sm += f'  <url>\n    <loc>{C.SITE}{u}</loc>\n    <lastmod>{C.DATE}</lastmod>\n    <changefreq>{cf}</changefreq>\n    <priority>{pr}</priority>{img}\n  </url>\n'
sm += '</urlset>\n'
open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf-8').write(sm)
print('ok sitemap', len(urls))
