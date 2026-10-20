# Stranice za lansiranje: cene, zakazivanje demo-a, potvrda.
import os
import build_common as C

PLANS = [
    {'id': 'start', 'name': 'Start', 'for': 'Za male škole i nove klubove', 'm': 2990, 'y': 29900, 'life': None,
     'feats': ['Do 50 aktivnih učenika', 'Vlasnik i do 2 predavača', 'Sve mogućnosti aplikacije']},
    {'id': 'rast', 'name': 'Rast', 'for': 'Za škole koje rastu', 'm': 5990, 'y': 59900, 'life': 149000, 'top': True,
     'feats': ['Do 200 aktivnih učenika', 'Do 10 predavača', 'Sve mogućnosti aplikacije']},
    {'id': 'pro', 'name': 'Pro', 'for': 'Za velike škole i centre', 'm': 9990, 'y': 99900, 'life': 249000,
     'feats': ['Neograničen broj učenika', 'Neograničen broj predavača', 'Sve mogućnosti aplikacije']},
]

INCLUDED = [
    'Učenici, roditelji i kontakti', 'Grupe, sale i nedeljni raspored', 'Prisustvo sa telefona, za predavače',
    'Mesečne članarine, popusti i dodatna zaduženja', 'IPS QR kod za uplatu', 'Podsetnik za uplatu preko WhatsApp-a',
    'Izveštaji po mesecima', 'Uvoz i izvoz u Excel', 'Besplatan prenos podataka', 'Lična podrška na srpskom',
]

PRICE_FAQ = [
    ('Da li je probni period zaista besplatan?', 'Da. Prvih 14 dana koristiš Klasiko besplatno, bez kartice i bez obaveze. Ako ne nastaviš, nalog se pauzira, a podaci ostaju sačuvani.'),
    ('Kako se plaća pretplata?', 'Na osnovu fakture, uplatom na račun. Bez kartica i bez automatskih naplata.'),
    ('Mogu li da otkažem u bilo kom trenutku?', 'Mogu. Mesečna pretplata nema ugovornu obavezu: kad prestaneš da plaćaš, nalog se pauzira, bez penala.'),
    ('Šta je lifetime licenca?', 'Jednokratna uplata za paket Rast ili Pro, posle koje Klasiko koristiš bez mesečne pretplate, uključujući nove verzije aplikacije. Nudimo je samo prvim 50 škola.'),
    ('Mogu li da promenim paket kasnije?', 'Mogu, u bilo kom trenutku. Podaci ostaju isti, menja se samo ograničenje broja učenika i predavača.'),
    ('Prijavio sam se na listu čekanja. Da li važi popust?', 'Važi. Škole sa liste čekanja dobijaju 30 odsto popusta na mesečnu ili godišnju pretplatu prve godine. Napomeni to pri zakazivanju demo-a.'),
]

DEMO_FAQ = [
    ('Koliko traje demo?', 'Oko 20 minuta, preko video poziva ili telefona, kako ti odgovara.'),
    ('Šta mi treba za demo?', 'Ništa posebno. Ako želiš, pripremi tabelu sa učenicima, pa ti odmah pokažemo kako izgleda tvoja škola u Klasiku.'),
    ('Šta se dešava posle demo-a?', 'Otvaramo ti nalog za 14 dana besplatne probe i, ako želiš, besplatno prenosimo podatke iz Excel-a.'),
]


def card(p):
    def n(x):
        return f'{x:,}'.replace(',', '.')
    feats = ''.join(f'<li>{f}</li>' for f in p['feats'])
    life = f'<div class="pl-life">ili <b>{n(p["life"])} RSD</b> jednom, lifetime licenca</div>' if p['life'] else '<div class="pl-life">Lifetime licenca nije dostupna za Start</div>'
    tag = '<span class="pl-tag">Najčešći izbor</span>' if p.get('top') else ''
    return f'''<div class="pl{' top' if p.get('top') else ''}">
{tag}<h3>{p['name']}</h3>
<p class="pl-for">{p['for']}</p>
<div class="pl-price"><span class="m">{n(p['m'])}</span><span class="y">{n(round(p['y'] / 12))}</span> <small>RSD mesečno</small></div>
<div class="pl-bill"><span class="m">uz mesečnu naplatu</span><span class="y">{n(p['y'])} RSD godišnje, 2 meseca gratis</span></div>
<ul>{feats}</ul>
{life}
<a class="btn{'' if p.get('top') else ' soft'}" href="/demo?paket={p['id']}">Probaj 14 dana besplatno</a>
</div>'''


def pricing_block():
    return f'''<div class="bill-toggle" role="group" aria-label="Način naplate">
<button type="button" class="on" data-bill="m">Mesečno</button><button type="button" data-bill="y">Godišnje <em>2 meseca gratis</em></button>
</div>
<div class="plans" data-bill="m">{''.join(card(p) for p in PLANS)}</div>
<p class="small" style="text-align:center">Cene su u dinarima. Plaćanje na osnovu fakture, bez kartice. Lifetime licenca važi samo za prvih 50 škola.</p>'''


def faq_html(items):
    return ''.join(f'<details{" open" if i == 0 else ""}><summary>{C.e(q)}</summary><p>{C.e(a)}</p></details>' for i, (q, a) in enumerate(items))


def faq_ld(items):
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}


def offers_ld():
    offers = []
    for p in PLANS:
        offers.append({"@type": "Offer", "name": f"{p['name']} mesečno", "price": p['m'], "priceCurrency": "RSD", "url": C.SITE + "/cene"})
        offers.append({"@type": "Offer", "name": f"{p['name']} godišnje", "price": p['y'], "priceCurrency": "RSD", "url": C.SITE + "/cene"})
        if p['life']:
            offers.append({"@type": "Offer", "name": f"{p['name']} lifetime", "price": p['life'], "priceCurrency": "RSD", "url": C.SITE + "/cene"})
    return offers


def software_ld():
    return {"@type": "SoftwareApplication", "@id": C.SITE + "/#software", "name": "Klasiko", "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web, iOS, Android", "url": C.SITE + "/", "inLanguage": "sr-Latn",
            "description": "Program za vođenje škola jezika, plesnih škola, klubova borilačkih veština, edukativnih centara i privatnih vrtića: učenici, grupe, raspored, prisustvo, članarine sa IPS QR uplatama i izveštaji.",
            "offers": {"@type": "AggregateOffer", "priceCurrency": "RSD", "lowPrice": 2990, "highPrice": 249000, "offerCount": len(offers_ld()), "offers": offers_ld()}}


def build(OUT, post_card, POSTS):
    # ----- /cene -----
    bc = [('Početna', '/'), ('Cene', None)]
    ld = {"@context": "https://schema.org", "@graph": [C.ORG, software_ld(), C.bc_ld(bc, '/cene'), faq_ld(PRICE_FAQ)]}
    inc = ''.join(f'<li>{x}</li>' for x in INCLUDED)
    page = C.head('Cene Klasika: paketi od 2.990 RSD mesečno, 14 dana besplatno | Klasiko',
                  'Cene programa Klasiko za škole, klubove i vrtiće: Start 2.990, Rast 5.990 i Pro 9.990 RSD mesečno. Godišnje 2 meseca gratis, lifetime licenca, 14 dana besplatno.',
                  '/cene', og_title='Cene Klasika: od 2.990 RSD mesečno', ld=ld) + C.header('/cene') + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-in" style="align-items:center;text-align:center">
{C.crumbs(bc)}
<span class="badge" style="align-self:center"><i></i>14 dana besplatno, bez kartice</span>
<h1 style="max-width:none">Jednostavne cene, bez iznenađenja<span class="dot">.</span></h1>
<p class="lead" style="margin:0 auto">Svi paketi imaju sve mogućnosti. Razlikuju se samo po broju učenika i predavača.</p>
</div>
</section>
<section class="sec alt" style="padding-top:clamp(40px,6vw,64px)">
<div class="wrap">{pricing_block()}</div>
</section>
<section class="sec">
<div class="wrap split">
<div class="sec-head" style="margin:0"><span class="eyebrow">Uključeno u svaki paket</span><h2>Sve što ti treba, bez dodatnih modula<span class="dot">.</span></h2><p>Nema skrivenih troškova, provizija ni doplata za funkcije.</p></div>
<ul class="inc">{inc}</ul>
</div>
</section>
<section class="sec alt">
<div class="wrap">
<div class="life-box">
<div><span class="eyebrow">Samo za prvih 50 škola</span><h2>Lifetime licenca<span class="dot">.</span></h2><p>Platiš jednom i koristiš Klasiko bez mesečne pretplate, uključujući nove verzije. Rast za 149.000 RSD, Pro za 249.000 RSD.</p></div>
<a class="btn" href="/demo?paket=lifetime">Pitaj za lifetime</a>
</div>
</div>
</section>
<section class="sec">
<div class="wrap split">
<div class="sec-head" style="margin:0;flex:1 1 300px"><span class="eyebrow">Pitanja o cenama</span><h2>Česta pitanja<span class="dot">.</span></h2><p>Imaš još pitanja? Pozovi <a href="tel:{C.PHONE_TEL}">{C.PHONE}</a> ili piši na <a href="{C.WA}" target="_blank" rel="noopener">WhatsApp</a>.</p></div>
<div class="faq" style="flex:2 1 520px">{faq_html(PRICE_FAQ)}</div>
</div>
</section>
{C.cta('cene')}
</main>
''' + C.footer()
    open(os.path.join(OUT, 'cene.html'), 'w', encoding='utf-8').write(page)
    print('ok /cene')

    # ----- /demo -----
    bc = [('Početna', '/'), ('Zakaži demo', None)]
    ld = {"@context": "https://schema.org", "@graph": [C.ORG, C.bc_ld(bc, '/demo'), faq_ld(DEMO_FAQ),
          {"@type": "ContactPage", "url": C.SITE + "/demo", "name": "Zakaži demo Klasika", "inLanguage": "sr-Latn"}]}
    kinds = [('skola_jezika', 'Škola jezika'), ('plesna_skola', 'Plesna škola'), ('borilacke', 'Klub borilačkih veština'), ('sportski_klub', 'Sportski klub'),
             ('edukativni_centar', 'Edukativni centar ili akademija'), ('muzicka_skola', 'Muzička škola'), ('vrtic', 'Privatni vrtić'), ('ostalo', 'Nešto drugo')]
    kopts = ''.join(f'<option value="{k}">{l}</option>' for k, l in kinds)
    page = C.head('Zakaži besplatan demo Klasika | Klasiko',
                  'Zakaži besplatan demo Klasika: pozovi +381 63 8219713, piši na WhatsApp ili ostavi kontakt. Pokazujemo aplikaciju i otvaramo nalog za 14 dana besplatne probe.',
                  '/demo', og_title='Zakaži besplatan demo Klasika', ld=ld) + C.header('/demo') + f'''<main id="sadrzaj">
<section class="hero">
<div class="wrap hero-in">
{C.crumbs(bc)}
<span class="badge"><i></i>Besplatno, oko 20 minuta</span>
<h1>Zakaži besplatan demo<span class="dot">.</span></h1>
<p class="lead">Pokazaćemo ti Klasiko na primeru tvoje škole, odgovoriti na pitanja i otvoriti ti nalog za 14 dana besplatne probe. Izaberi kako ti je najlakše.</p>
</div>
</section>
<section class="sec alt" style="padding-top:clamp(32px,5vw,56px)">
<div class="wrap">
<div class="ways">
<a class="way" href="{C.WA}" target="_blank" rel="noopener"><span class="ic">{C.ICONS['msg']}</span><strong>Piši na WhatsApp</strong><span>Najbrže: poruka sa pitanjem ili terminom koji ti odgovara.</span><em>Otvori WhatsApp →</em></a>
<a class="way" href="tel:{C.PHONE_TEL}"><span class="ic">{C.ICONS['cal']}</span><strong>Pozovi nas</strong><span>{C.PHONE}, radnim danima od 9 do 19 časova.</span><em>Pozovi →</em></a>
<a class="way" href="#forma"><span class="ic">{C.ICONS['users']}</span><strong>Ostavi kontakt</strong><span>Popuni kratku formu i javljamo ti se u toku radnog dana.</span><em>Popuni formu ↓</em></a>
</div>
</div>
</section>
<section class="sec" id="forma">
<div class="wrap split">
<div class="sec-head" style="margin:0"><span class="eyebrow">Forma</span><h2>Javićemo ti se mi<span class="dot">.</span></h2><p>Ostavi kontakt i reci kada ti odgovara. Podatke koristimo samo da bismo ti se javili u vezi sa demo-om.</p>
<ol class="steps" style="margin-top:12px"><li><div><strong>Javljamo se</strong><span>Telefonom ili na WhatsApp, u toku radnog dana.</span></div></li><li><div><strong>Kratak demo</strong><span>Oko 20 minuta, na primeru tvoje škole.</span></div></li><li><div><strong>14 dana besplatno</strong><span>Otvaramo nalog i prenosimo podatke iz Excel-a.</span></div></li></ol>
</div>
<form class="demo-form panel" data-demo novalidate>
<div class="df-grid">
<label><span>Ime i prezime *</span><input name="name" required autocomplete="name"></label>
<label><span>Telefon *</span><input name="phone" type="tel" required autocomplete="tel" placeholder="06x xxx xxxx"></label>
<label><span>Naziv škole</span><input name="school" autocomplete="organization"></label>
<label><span>Email</span><input name="email" type="email" autocomplete="email"></label>
<label><span>Vrsta</span><select name="kind"><option value="">Izaberi</option>{kopts}</select></label>
<label><span>Broj učenika</span><select name="students_count"><option value="">Izaberi</option><option>do 50</option><option>50 do 200</option><option>više od 200</option></select></label>
<label class="full"><span>Kada da te pozovemo?</span><input name="preferred_time" placeholder="npr. radnim danima posle 14h"></label>
<label class="full"><span>Poruka</span><textarea name="message" rows="3" placeholder="Kako danas vodiš školu, šta te najviše muči..."></textarea></label>
</div>
<input type="hidden" name="plan" value="">
<input class="hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn" type="submit">Pošalji zahtev za demo</button>
<div class="note">Slanjem prihvataš <a href="/privatnost">Politiku privatnosti</a>.</div>
<div class="status" role="status" aria-live="polite"></div>
</form>
</div>
</section>
<section class="sec alt">
<div class="wrap split">
<div class="sec-head" style="margin:0;flex:1 1 300px"><span class="eyebrow">FAQ</span><h2>Pre demo-a<span class="dot">.</span></h2></div>
<div class="faq" style="flex:2 1 520px">{faq_html(DEMO_FAQ)}</div>
</div>
</section>
</main>
''' + C.footer()
    open(os.path.join(OUT, 'demo.html'), 'w', encoding='utf-8').write(page)
    print('ok /demo')

    # ----- /hvala-demo -----
    page = C.head('Zahtev za demo je primljen | Klasiko', 'Zahtev za demo Klasika je primljen.', '/hvala-demo', robots='noindex, follow') + C.header() + f'''<main id="sadrzaj">
<section class="hero thanks">
<div class="wrap hero-in" style="align-items:center;text-align:center">
<div class="tk-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg></div>
<span class="badge" style="align-self:center"><i></i>Zahtev je primljen</span>
<h1 style="max-width:none">Hvala, javljamo se uskoro<span class="dot">!</span></h1>
<p class="lead" style="margin:0 auto">Pozvaćemo te ili ti pisati na WhatsApp u toku radnog dana. Ako ti se žuri, javi se odmah.</p>
<div class="demo-btns" style="justify-content:center"><a class="btn" href="{C.WA}" target="_blank" rel="noopener">Piši na WhatsApp</a><a class="btn soft" href="tel:{C.PHONE_TEL}">Pozovi {C.PHONE}</a></div>
</div>
</section>
<section class="sec alt">
<div class="wrap">
<div class="sec-head"><span class="eyebrow">Dok čekaš</span><h2>Saveti za lakše vođenje škole<span class="dot">.</span></h2></div>
<div class="posts">{''.join(post_card(q) for q in POSTS[:3])}</div>
</div>
</section>
</main>
''' + C.footer().replace('<div class="m-sticky">', '<div class="m-sticky" hidden>')
    open(os.path.join(OUT, 'hvala-demo.html'), 'w', encoding='utf-8').write(page)
    print('ok /hvala-demo')
