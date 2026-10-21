import json, html

SITE = 'https://www.klasiko.rs'
EMAIL = 'nemanja.r@vgrubs.com'
PHONE = '+381 63 8219713'
PHONE_TEL = '+381638219713'
WA = 'https://wa.me/381638219713?text=' + 'Zdravo%2C%20zanima%20me%20Klasiko.%20%C5%BDelim%20da%20zaka%C5%BEem%20demo.'
DATE = '2026-10-16'
DATE_SR = '16. oktobra 2026.'

ICONS = {
 'users': '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="3.5" stroke="#5B2A86" stroke-width="1.6"/><path d="M3.5 17c1-3.2 3.5-5 6.5-5s5.5 1.8 6.5 5" stroke="#5B2A86" stroke-width="1.6" stroke-linecap="round"/></svg>',
 'cal': '<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="5" width="22" height="20" rx="4" stroke="#5B2A86" stroke-width="2.2"/><path d="M3 11h22M9 2v6M19 2v6" stroke="#5B2A86" stroke-width="2.2" stroke-linecap="round"/></svg>',
 'card': '<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="6" width="22" height="16" rx="4" stroke="#8C3A31" stroke-width="2.2"/><path d="M3 11h22M8 17h5" stroke="#8C3A31" stroke-width="2.2" stroke-linecap="round"/></svg>',
 'check': '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.6" stroke="#5B2A86" stroke-width="1.1"/><path d="M4.5 7.2l1.7 1.7L9.6 5.4" stroke="#5B2A86" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 'cap': '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3l8 4-8 4-8-4 8-4z" stroke="#5B2A86" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 9v4c1.5 1.5 3.2 2 5 2s3.5-.5 5-2V9" stroke="#5B2A86" stroke-width="1.6" stroke-linecap="round"/></svg>',
 'msg': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8l-5 4v-4H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" stroke="#5B2A86" stroke-width="2" stroke-linejoin="round"/></svg>',
 'star': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z" stroke="#5B2A86" stroke-width="2" stroke-linejoin="round"/></svg>',
 'door': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" stroke="#5B2A86" stroke-width="2" stroke-linecap="round"/><circle cx="14.5" cy="12.5" r="1.2" fill="#5B2A86"/></svg>',
 'medal': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="15" r="5.5" stroke="#5B2A86" stroke-width="2"/><path d="M8.5 10.5L5 3h4l3 6M15.5 10.5L19 3h-4l-2 4" stroke="#5B2A86" stroke-width="2" stroke-linejoin="round"/></svg>',
 'book': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6c3-1.5 6-1.5 9 1v13c-3-2.5-6-2.5-9-1V6zM21 6c-3-1.5-6-1.5-9 1v13c3-2.5 6-2.5 9-1V6z" stroke="#5B2A86" stroke-width="2" stroke-linejoin="round"/></svg>',
}

NICHES = [
 ('/skole-jezika', 'Škole jezika'),
 ('/plesne-skole', 'Plesne škole'),
 ('/borilacke-vestine', 'Borilačke veštine'),
 ('/edukativni-centri', 'Edukativni centri i akademije'),
 ('/vrtici', 'Privatni vrtići'),
]
POSTS = []  # popunjava build.py

def e(s):
    return html.escape(s, quote=True)

def head(title, desc, path, og_title=None, og_desc=None, og_type='website', ld=None, extra='', robots='index, follow, max-image-preview:large, max-snippet:-1'):
    url = SITE + path
    ld_html = ''
    if ld:
        ld_html = '<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False, indent=1) + '\n</script>\n'
    return f'''<!doctype html>
<html lang="sr-Latn">
<head>
<meta charset="utf-8">
<script>document.documentElement.className="js";</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#5B2A86">
<meta name="format-detection" content="telephone=no">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="256x256" href="/favicon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" href="/llms.txt" title="Klasiko za AI asistente">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Klasiko">
<meta property="og:locale" content="sr_RS">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(og_title or title)}">
<meta property="og:description" content="{e(og_desc or desc)}">
<meta property="og:image" content="{SITE}/og-image.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Klasiko: Vodi školu, ne tabele.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(og_title or title)}">
<meta name="twitter:description" content="{e(og_desc or desc)}">
<meta name="twitter:image" content="{SITE}/og-image.png">
{extra}<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/manrope-latin-ext.woff2" as="font" type="font/woff2" crossorigin>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('consent','default',{{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'}});</script>
<link rel="stylesheet" href="/assets/site.css?v=4">
<script>
window.va = window.va || function () {{ (window.vaq = window.vaq || []).push(arguments); }};
</script>
<script defer src="/_vercel/insights/script.js"></script>
{ld_html}</head>
<body>
<a class="skip" href="#sadrzaj">Preskoči na sadržaj</a>
<div class="progress" aria-hidden="true"></div>
'''

def header(current=''):
    def a(href, label):
        cur = ' aria-current="page"' if current == href else ''
        return f'<a href="{href}"{cur}>{label}</a>'
    return f'''<header class="hdr">
<div class="wrap">
<a class="logo" href="/" aria-label="Klasiko, početna"><picture><source srcset="/logo-128.webp" type="image/webp"><img src="/logo-128.png" alt="Klasiko logo" width="64" height="64"></picture></a>
<nav class="nav" aria-label="Glavni meni">
{a('/#kako-radi','Kako radi')}
{a('/#za-koga','Za koga')}
{a('/cene','Cene')}
{a('/blog','Blog')}
</nav>
<a class="btn sm" href="/demo">Zakaži demo</a>
</div>
</header>
'''

def crumbs(items):
    """items: list of (label, path or None)"""
    li = []
    for label, path in items:
        if path:
            li.append(f'<li><a href="{path}">{e(label)}</a></li>')
        else:
            li.append(f'<li aria-current="page">{e(label)}</li>')
    return '<nav aria-label="Putanja"><ol class="crumbs">' + ''.join(li) + '</ol></nav>'


def bc_ld(items, current_path):
    out = []
    for i, (label, path) in enumerate(items):
        out.append({"@type": "ListItem", "position": i + 1, "name": label, "item": SITE + (path if path else current_path)})
    return {"@type": "BreadcrumbList", "itemListElement": out}

def form(fid, source, button='Prijavi se', dark=False):
    idattr = f' id="{fid}"' if fid == 'prijava' else ''
    inid = f'{source}-email'
    return f'''<form{idattr} class="wl" data-waitlist="{source}" novalidate>
<label class="sr" for="{inid}">Email adresa</label>
<div class="row">
<input id="{inid}" name="email" type="email" required autocomplete="email" placeholder="Tvoj email">
<button class="btn{' coral' if dark else ''}" type="submit">{button}</button>
</div>
<input class="hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="note">Prijavom prihvataš <a href="/privatnost">Politiku privatnosti</a>. Bez spama, odjava jednim klikom.</div>
<div class="status" role="status" aria-live="polite"></div>
</form>'''

def demo_buttons(dark=False):
    soft = 'coral' if dark else 'soft'
    return f'''<div class="demo-btns">
<a class="btn{' coral' if dark else ''}" href="/demo">Zakaži besplatan demo</a>
<a class="btn {'' if dark else 'soft'} wa" href="{WA}" target="_blank" rel="noopener">WhatsApp</a>
<a class="btn {'' if dark else 'soft'} tel" href="tel:{PHONE_TEL}">Pozovi {PHONE}</a>
</div>'''


def cta(source, title='Probaj Klasiko 14 dana besplatno', text='Zakaži kratak demo: pokazaćemo ti aplikaciju na primeru tvoje škole, besplatno prenosimo podatke iz Excel-a i otvaramo ti nalog za probu.'):
    return f'''<section class="sec" aria-label="Zakaži demo">
<div class="wrap">
<div class="cta dark">
<div>
<span class="eyebrow" style="color:#E6DAF2">14 dana besplatno, bez kartice</span>
<h2>{title}<span class="dot">.</span></h2>
<p>{text}</p>
</div>
<div class="cta-side">{demo_buttons(dark=True)}<p class="cta-note">Bez ugovorne obaveze. Lična podrška na srpskom.</p></div>
</div>
</div>
</section>
'''

def footer():
    niche = ''.join(f'<a href="{p}">{l}</a>' for p, l in NICHES)
    blog = ''.join(f'<a href="/blog/{p["slug"]}">{p["short"]}</a>' for p in POSTS[:4])
    return f'''<footer class="ftr">
<div class="wrap top">
<div class="brand">
<div class="lg"><div class="logo"><img src="/logo-128.png" alt="Klasiko logo" width="64" height="64" loading="lazy"></div></div>
<p>Klasiko je program za vođenje škola, klubova, edukativnih centara i privatnih vrtića: učenici, raspored, prisustvo i uplate na jednom mestu.</p>
</div>
<nav aria-label="Podnožje">
<div><b>Za koga</b>{niche}</div>
<div><b>Blog</b>{blog}<a href="/blog">Svi članci</a></div>
<div><b>Klasiko</b><a href="/">Početna</a><a href="/cene">Cene</a><a href="/demo">Zakaži demo</a><a href="https://app.klasiko.rs">Prijava u aplikaciju</a><a href="tel:+381638219713">+381 63 8219713</a><a href="https://www.instagram.com/klasiko.rs/" target="_blank" rel="noopener me">Instagram @klasiko.rs</a></div>
</nav>
</div>
<div class="wrap bot">
<span>© 2026 Klasiko</span>
<span><a href="/privatnost">Politika privatnosti</a><a href="mailto:{EMAIL}">{EMAIL}</a></span>
</div>
</footer>
<div class="m-sticky"><div><strong>14 dana besplatno</strong><small>Bez kartice i bez obaveze</small></div><a class="btn sm" href="/demo">Zakaži demo</a></div>
<div class="cookie" id="cookie" hidden role="dialog" aria-label="Kolačići">
<p>Uz tvoj pristanak koristimo kolačiće za statistiku poseta (Google Analytics) i merenje reklama (Meta Pixel). Više u <a href="/privatnost">Politici privatnosti</a>.</p>
<button class="no" type="button" data-consent="no">Odbij</button><button class="ok" type="button" data-consent="yes">Prihvatam</button>
</div>
<script src="/assets/site.js?v=4" defer></script>
</body>
</html>
'''

ORG = {"@type": "Organization", "@id": SITE + "/#organization", "name": "Klasiko", "url": SITE + "/", "logo": SITE + "/logo.png"}
