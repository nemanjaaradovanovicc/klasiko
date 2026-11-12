# Klasiko aplikacija

Next.js 16, React 19, Supabase (Postgres, Auth, RLS), Vercel.

## Objava izmena

1. U Supabase SQL Editoru redom pokreni migracije koje još nisu pokrenute (poslednja je `supabase/migrations/007_probni_casovi.sql`). Mogu bezbedno više puta. Prvo ih pokreni, pa tek onda objavi kod. Nove promenljive okruženja nisu potrebne: dnevni cron i mejl ostaju kako jesu.
2. Opciono, u Vercelu dodaj `CRON_SECRET` (dugačak slučajan niz) ako želiš automatska mesečna zaduženja. Bez njega se opcija ne prikazuje, a zaduženja se prave dugmetom na stranici Uplate.
3. Objavi kod. Dnevni posao je u `vercel.json` (svako jutro u 7 ili 8 po Beogradu).

Migracija sadrži i jednu izmenu starih podataka: časovi upisani na vlasnika ili admina prebacuju se na predavača grupe, jer je ranije svaki čas išao na onoga ko je upisao prisustvo. Ako je vlasnik stvarno držao neki čas, izmeni predavača pri upisu prisustva.

## Rad bez mejla

Aplikacija radi bez naloga za slanje mejlova. Dok `RESEND_API_KEY` i `EMAIL_FROM` nisu upisani u Vercel:

- nova lozinka ide kao i do sada: predavaču je resetuje vlasnik, a vlasniku admin, preko WhatsApp-a;
- podsetnici se šalju na WhatsApp sa stranice „Ko duguje”, a obaveštenja se vide na linku za roditelje;
- nova škola kreće odmah, bez potvrde adrese, a registraciju vidiš u Adminu;
- opcije za mejl se ne prikazuju.

Kad upišeš ove dve promenljive i ponovo objaviš, pojavljuju se potvrda adrese pri registraciji, reset lozinke mejlom, podsetnici da probni period ističe, automatski podsetnici za uplate i slanje obaveštenja mejlom. Podsetnici stižu iz dnevnog posla, pa je potreban i `CRON_SECRET`.

## Samostalna registracija

Dugmad „Probaj 14 dana” na sajtu vode na `app.klasiko.rs/registracija?paket=...`. Škola dobija 14 dana probe na izabranom paketu.

Sa uključenim mejlom nalog ne može da se koristi dok vlasnik ne otvori link iz mejla. Nepotvrđena škola stoji u Adminu sa oznakom „Email nije potvrđen” i ne ulazi u brojke. Nova registracija na istu adresu zamenjuje nepotvrđen nalog. Ako mejl ne stigne, resetuj vlasniku lozinku u Adminu: to potvrđuje nalog, a privremenu lozinku pošalješ na WhatsApp.

## Probni časovi

Stranica „Probni časovi” (`/probni`) je u meniju i za vlasnika i za predavača. Predavač upisuje svaki probni čas koji održi (datum, kandidat, kontakt, napomena) i kasnije ishod: upisao/la se ili nije. Vidi samo svoje probne časove. Vlasnik vidi sve, bira ko je držao čas kad sam upisuje, i iz probnog časa jednim klikom pravi karton učenika.

Brojke za mesec (koliko probnih, koliko upisanih, koliko nije, koliko još čeka odluku) su na vrhu te stranice i u Izveštajima, gde su i podela po predavaču i izvoz u Excel. Računa se mesec u kom je probni čas održan. Probni časovi ne ulaze u prisustvo ni u „Časovi po predavaču”.

## Dvostepena prijava za admina

Isključena je. Prijava ide samo emailom i lozinkom. Ako je kasnije poželiš, u Supabase-u uključi TOTP (Authentication > Multi-Factor), u Vercel dodaj `SUPERADMIN_MFA=on` i ponovo objavi. Admin tada pri prijavi podešava i unosi kod sa telefona.

## Testovi

```bash
npm install
npm test            # logika, obračun i sve migracije sa RLS-om na pravom Postgresu (PGlite), bez naloga i interneta
npm run typecheck
```

Prolaz kroz celu aplikaciju, bez Dockera i bez diranja produkcije:

```bash
npm run local-db    # u prvom terminalu: lokalna baza i Auth, piše .env.test

# u drugom terminalu
set -a; . ./.env.test; set +a
npm run build
node --env-file=.env.test node_modules/next/dist/bin/next start -p 3100

# u trećem terminalu
npm run smoke -- http://localhost:3100
npm run e2e -- http://localhost:3100
```

`scripts/local-supabase.mjs` je zamena za Supabase REST i Auth za pozive koje ova aplikacija koristi, sa pravim Postgresom i RLS-om. Nije pravi Supabase, pa veće izmene proveri i na testnom Supabase projektu. `smoke` i `e2e` odbijaju da rade bez `SMOKE_TEST_OK=1`, koji stoji samo u `.env.test`. Nikad ih ne pokreći na produkciji.

## Šta ostaje ručno

- **Privatnost:** popuni `[DATUM]`, `[NAZIV...]`, `[ADRESA]`, `[PIB]`, `[MB]` u `../tools/privatnost.py` i pokreni `python3 tools/build.py`.
- **Ugovor sa školama:** `../docs/ugovor-o-obradi-podataka.md` je šablon. Neka ga pregleda pravnik.
- **Naplata pretplate:** uplate idu na račun iz `platform_settings` uz napomenu „nije faktura”. Oblik poslovanja i izdavanje računa proveri sa knjigovođom.
- **WhatsApp i Viber:** poruke se šalju ručno, jedna po klik, iz stranice „Ko duguje”. Potpuno automatsko slanje traži WhatsApp Business API ili Viber Business nalog.
- **Škole za brisanje:** prikazane su u Admin > Dnevnik. Brisanje potvrđuje admin, ništa se ne briše samo.
