# Pozdravni mejl u MailerLite-u

Svako ko se prijavi preko sajta ulazi u grupu „Lista čekanja”. Automatizacija ispod šalje mu pozdravni mejl odmah posle potvrde emaila.

## 1. Potvrda emaila (double opt-in)

1. **Account settings → Subscribe settings**: uključi **Double opt-in for API and integrations**. Bez ove opcije prijave sa sajta ne dobijaju mejl za potvrdu, a stranica `/hvala` kaže da on stiže.
2. Na istom mestu prilagodi mejl za potvrdu:
   - **Subject:** Potvrdi prijavu na listu čekanja za Klasiko
   - **Tekst:** Zdravo! Klikni na dugme ispod da potvrdiš email. Tako rezervišeš popust za rane korisnike i prvi saznaješ kada otvorimo rani pristup.
   - **Dugme:** Potvrđujem prijavu

## 2. Automatizacija

1. **Automation → Create workflow**, naziv „Pozdravni mejl”.
2. **Trigger:** *When subscriber joins a group* → izaberi **Lista čekanja**.
3. Dodaj korak **Email** i u njega ubaci tekst ispod.
4. Klikni **Turn on** (gore desno).

Pošiljalac: ime **Nemanja iz Klasika**, a za email koristi adresu na svom domenu kada ga potvrdiš u MailerLite-u (Sites/Domains).

## 3. Tekst mejla

**Subject:** Na listi si. Evo šta sledi
**Preview text:** Popust za rane korisnike je rezervisan za tebe.

---

Zdravo,

hvala što si se prijavio na listu čekanja za Klasiko! Popust za rane korisnike je sada rezervisan za tebe.

Ukratko, šta je Klasiko: pravimo program koji vlasnicima škola jezika, plesnih škola, klubova i edukativnih centara skida administraciju sa leđa. Učenici, grupe, raspored, članarine i obaveštenja roditeljima, na jednom mestu umesto u pet tabela i deset grupa za poruke.

**Šta sledi:**

1. **Javljamo se prvi tebi.** Kada otvorimo rani pristup, saznaješ pre svih.
2. **Popust je tvoj.** Iznos objavljujemo pre lansiranja i važi za sve sa liste čekanja.
3. **Bez spama.** Pišemo retko, samo kada imamo nešto korisno: vesti o razvoju i praktične savete.

**Jedno pitanje za tebe**

Pre nego što napišemo i jednu funkciju, želimo da razumemo kako škole stvarno rade. Zato te molim da odgovoriš na ovaj mejl, makar jednom rečenicom:

> Šta ti danas oduzima najviše vremena u vođenju škole?

Lično čitam svaki odgovor, a tvoj odgovor direktno utiče na to šta pravimo prvo.

Dok čekaš, možda ti koristi neki od ovih vodiča:

- [Evidencija članarina: kako da uvek znaš ko je platio](https://www.klasiko.rs/blog/evidencija-clanarina)
- [Kako napraviti raspored časova](https://www.klasiko.rs/blog/raspored-casova)
- [Kako privući nove učenike: 12 proverenih načina](https://www.klasiko.rs/blog/kako-privuci-nove-ucenike)

Hvala ti što si među prvima,
Nemanja Radovanović
Osnivač, Klasiko
[www.klasiko.rs](https://www.klasiko.rs) · [Instagram @klasiko.rs](https://www.instagram.com/klasiko.rs/)

---

## 4. Opciono: drugi mejl posle 4 dana

U istoj automatizaciji dodaj **Delay → 4 days**, pa još jedan **Email**:

**Subject:** Kako danas vodiš školu?

Zdravo, Nemanja iz Klasika ovde.

Pre par dana si se prijavio na listu čekanja. Ako imaš dva minuta, voleo bih da čujem kako danas vodiš školu: u Excelu, svesci, nekom programu? Šta ti najviše smeta?

Samo odgovori na ovaj mejl. Škole koje nam se jave pozivamo da prve probaju Klasiko i da zajedno sa nama odluče šta pravimo.

Hvala!
Nemanja
