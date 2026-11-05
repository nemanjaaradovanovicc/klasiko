# Tekst Politike privatnosti (stranica /privatnost). build.py ga ubacuje u zajednički šablon sa menijem i podnožjem.
# Pre objave popuni: [NAZIV PREDUZETNIKA ILI FIRME], [ADRESA], [PIB], [MB].

UPDATED = '[DATUM]'

BODY = '''<p>Ova politika objašnjava koje podatke prikupljamo kada koristiš sajt klasiko.rs, kada se prijaviš za savete na mejl ili zatražiš demo, i kako obrađujemo podatke koje škole unose u aplikaciju Klasiko.</p>

<h2>Ko je rukovalac podacima</h2>
<p>[NAZIV PREDUZETNIKA ILI FIRME], [ADRESA], PIB [PIB], matični broj [MB]. Kontakt za pitanja o podacima: <a href="mailto:klasiko.rs@gmail.com">klasiko.rs@gmail.com</a>.</p>

<h2>Koje podatke prikupljamo</h2>
<ul>
<li><strong>Prijava za savete na mejl:</strong> email adresa i vreme prijave.</li>
<li><strong>Zahtev za demo:</strong> ime, telefon, a po želji email, naziv i vrsta škole, broj učenika, termin za poziv i poruka.</li>
<li><strong>Nalog u aplikaciji:</strong> ime, email i telefon korisnika (vlasnika i predavača) i podaci o pretplati škole.</li>
</ul>

<h2>Zašto ih koristimo</h2>
<ul>
<li>da ti se javimo u vezi sa demo-om i probnim periodom,</li>
<li>da ti otvorimo i održavamo nalog u aplikaciji i pošaljemo podatke za uplatu pretplate,</li>
<li>da ti, ako si se prijavio, povremeno pošaljemo savete i vesti o Klasiku.</li>
</ul>
<p>Za mejlove sa savetima pravni osnov je tvoj pristanak, koji možeš da povučeš u svakom trenutku, klikom na link za odjavu ili porukom na naš kontakt email. Za zahtev za demo i korišćenje aplikacije pravni osnov su radnje pre zaključenja ugovora i izvršenje ugovora.</p>

<h2>Podaci koje škole unose u aplikaciju</h2>
<p>Škola koja koristi Klasiko unosi podatke svojih učenika, roditelja i predavača (na primer ime, kontakt, prisustvo i uplate). Za te podatke rukovalac je škola, a Klasiko ih obrađuje samo u njeno ime i po njenom nalogu, da bi aplikacija radila. Te podatke ne koristimo za sopstvene potrebe, ne prodajemo ih i ne delimo sa drugima. Svaka škola vidi samo svoje podatke i može u svakom trenutku da ih preuzme. Podrška Klasika podacima škole pristupa samo kad je to potrebno za pomoć ili otklanjanje kvara, a svaki takav ulazak ostaje u dnevniku koji škola vidi. Roditelj sa ličnim linkom vidi samo podatke svoje dece. Za pitanja o podacima deteta ili učenika obrati se školi.</p>

<h2>Ko još ima pristup podacima</h2>
<p>Email adrese za savete čuvamo kod servisa MailerLite, koji za nas šalje mejlove. Zahteve za demo i podatke iz aplikacije čuvamo u bazi kod servisa Supabase. Sajt i aplikacija su postavljeni na servisu Vercel, koji beleži i anonimnu statistiku poseta bez kolačića (Vercel Web Analytics). Ovi servisi obrađuju podatke samo po našem nalogu. Tvoje podatke ne prodajemo i ne delimo sa drugima radi reklamiranja.</p>

<h2>Kolačići: Google Analytics i Meta Pixel</h2>
<p>Samo ako to odobriš u obaveštenju o kolačićima, sajt učitava Google Analytics (Google Ireland Ltd.) za statistiku poseta i Meta Pixel (Meta Platforms Ireland Ltd.) za merenje uspešnosti reklama na Facebooku i Instagramu. Oni beleže posetu stranicama i slanje forme za demo. Dok ne prihvatiš, nijedan od njih se ne učitava i ne postavlja kolačiće. Izbor možeš da promeniš brisanjem podataka sajta u pregledaču. Statistika Vercel Web Analytics radi bez kolačića i bez ličnih podataka.</p>

<h2>Koliko dugo čuvamo podatke</h2>
<p>Email za savete čuvamo dok se ne odjaviš. Zahteve za demo čuvamo najduže godinu dana ako ne postaneš korisnik. Podatke škole u aplikaciji čuvamo dok traje pretplata, a posle prestanka ih brišemo na zahtev škole ili najkasnije godinu dana kasnije.</p>

<h2>Tvoja prava</h2>
<p>Imaš pravo na pristup svojim podacima, njihovu ispravku i brisanje, ograničenje obrade, prenosivost i povlačenje pristanka. Ako smatraš da su ti prava povređena, možeš podneti pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti.</p>

<h2>Kontakt</h2>
<p>Za sva pitanja o privatnosti piši nam na <a href="mailto:klasiko.rs@gmail.com">klasiko.rs@gmail.com</a>.</p>
'''
