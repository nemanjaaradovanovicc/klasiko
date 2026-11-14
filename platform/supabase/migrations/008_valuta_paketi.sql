-- Valuta škole (RSD ili EUR) i režim „rad samo sa paketima”.
-- Nove kolone pokrivaju postojeće politike na organizations: član škole čita, vlasnik menja.
-- Migracija se može pokrenuti više puta.

alter table organizations add column if not exists currency text not null default 'RSD';
do $$ begin
  alter table organizations add constraint organizations_currency_check check (currency in ('RSD', 'EUR'));
exception when duplicate_object then null; end $$;

alter table organizations add column if not exists packages_only boolean not null default false;
