# Klasiko landing stranica

Gotov sajt sa listom čekanja. Email adrese sa obe forme na stranici idu u MailerLite grupu.

## Šta je u folderu

| Fajl | Čemu služi |
| --- | --- |
| `public/index.html` | Landing stranica (dizajn, tekstovi, kalkulator, forme) |
| `public/privatnost.html` | Politika privatnosti, dostupna na adresi `/privatnost` |
| `public/logo.png`, `favicon.png`, `og-image.png` | Logo, ikonica u tabu i slika za deljenje linka |
| `api/subscribe.js` | Funkcija koja prima email i upisuje ga u MailerLite |
| `vercel.json` | Podešavanja za Vercel |
| `.env.example` | Spisak tajnih ključeva koje treba uneti u Vercel |

## Korak 1: MailerLite (oko 10 minuta)

1. Napravi besplatan nalog na mailerlite.com.
2. **Subscribers > Groups > Create group**, nazovi je „Lista čekanja”.
3. Otvori grupu i kopiraj njen **ID**: to je dugačak broj u adresi stranice u pregledaču. Ako ga ne nađeš, forma radi i bez njega, a kontakti tada idu u opštu listu pretplatnika.
4. **Integrations > MailerLite API > Generate new token**, nazovi ga „Klasiko sajt” i kopiraj ključ. Ključ se prikazuje samo jednom.
5. Preporuka: uključi **double opt-in** (Settings > Subscribe settings). Tada svaka nova prijava dobija mejl za potvrdu, a ti dobijaš čistu listu i dokaz pristanka.

MailerLite pre slanja kampanja traži da potvrdiš nalog i domen pošiljaoca. To uradi kada kupiš domen.

## Korak 2: GitHub (oko 5 minuta)

1. Napravi nalog na github.com ako ga nemaš.
2. **New repository**, naziv `klasiko-landing`, privatan.
3. Klikni **uploading an existing file** i prevuci ceo sadržaj ovog foldera (folderi `api` i `public` i svi fajlovi). Potvrdi sa **Commit changes**.

## Korak 3: Vercel (oko 5 minuta)

1. Na vercel.com se prijavi preko GitHub naloga.
2. **Add New > Project**, izaberi `klasiko-landing` i klikni **Import**.
3. Pre klika na Deploy otvori **Environment Variables** i dodaj:
   - `MAILERLITE_API_KEY` = ključ iz koraka 1
   - `MAILERLITE_GROUP_ID` = ID grupe iz koraka 1
4. Klikni **Deploy**. Za minut dobijaš adresu oblika `klasiko-landing.vercel.app`.

## Korak 4: Proveri da radi

1. Otvori sajt na telefonu, upiši svoj email i klikni „Želim rani pristup”.
2. Treba da vidiš poruku „Hvala! Prijava je primljena.”.
3. U MailerLite-u, u grupi „Lista čekanja”, treba da se pojavi tvoja adresa.
4. Ako vidiš poruku da prijava ne radi: u Vercelu otvori **Project > Logs** i proveri da li su oba ključa tačno uneta, pa ponovi Deploy.

## Korak 5: Domen klasiko.rs na Loopia

1. U Vercelu otvori projekat, pa **Settings > Domains > Add Domain**. Upiši `klasiko.rs` i prihvati predlog da se doda i `www.klasiko.rs` (jedan se automatski preusmerava na drugi).
2. Vercel će pored oba domena prikazati „Invalid Configuration” i tačne vrednosti koje treba upisati: jedan **A** zapis za `klasiko.rs` i jedan **CNAME** zapis za `www`. Koristi baš vrednosti koje ti Vercel prikaže (obično je A zapis `76.76.21.21`, a CNAME je adresa koja se završava na `vercel-dns...com`).
3. Uloguj se u **Loopia Customer Zone**, klikni na `klasiko.rs`, pa na **DNS editor**.
4. Obriši postojeće **A** i **CNAME** zapise ispod `@` i ispod `www`. Ostale zapise (MX, TXT) ne diraj, oni služe za email.
5. Ispod `@` klikni **Add a new record**, izaberi tip **A** i upiši IP adresu iz Vercela.
6. Ispod `www` klikni **Add a new record**, izaberi tip **CNAME** i upiši vrednost iz Vercela.
7. Sačuvaj. Za nekoliko minuta do sat vremena Vercel će pokazati „Valid Configuration” i sam izdati SSL sertifikat, pa sajt radi na https://klasiko.rs.

Ovo radi ako domen koristi Loopia name servere (podrazumevano kada je domen kupljen kod Loopie).

## Lokalno testiranje na svom računaru

1. Instaliraj Node.js (LTS verziju) sa nodejs.org.
2. Raspakuj arhivu, otvori terminal u folderu `klasiko-site` i pokreni:
   `npx vercel dev`
3. Prvi put će tražiti prijavu u Vercel i povezivanje sa projektom. Napravi fajl `.env.local` po uzoru na `.env.example` i upiši svoje MailerLite ključeve.
4. Otvori http://localhost:3000. Forma tada upisuje prave prijave u MailerLite.

Za brz pregled izgleda bez forme dovoljno je dvaput kliknuti na `public/index.html`.

## Pre objave popuni

- `[KONTAKT EMAIL]` u podnožju `index.html` i u `privatnost.html`
- `[DATUM]`, `[NAZIV PREDUZETNIKA ILI FIRME]`, `[ADRESA]`, `[PIB]`, `[MB]` u `privatnost.html`

Politika privatnosti je šablon napisan prema srpskom Zakonu o zaštiti podataka o ličnosti i GDPR-u. Nije pravni savet; dobro je da je pregleda pravnik pre lansiranja.

## Kasnije, po želji

- **Analitika:** u Vercelu uključi Web Analytics (besplatan osnovni plan) da vidiš posete i odakle ljudi dolaze.
- **Meta Pixel:** ako budeš pokretao reklame na Instagramu, dodaj pixel kod u `<head>` stranice, uz obaveštenje o kolačićima.
- **Izmene teksta:** sve se menja u `public/index.html`; posle izmene na GitHub-u Vercel sam objavi novu verziju.
