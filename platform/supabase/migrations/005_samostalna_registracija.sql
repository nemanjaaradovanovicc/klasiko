-- Samostalna registracija: poreklo škole, oznaka „nova” u adminu i podsetnik da probni period ističe.
-- Može bezbedno više puta. Postojeće škole se označavaju samo pri prvom pokretanju.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'source') then
    alter table organizations add column source text not null default 'admin' check (source in ('admin', 'self'));
    alter table organizations add column admin_seen_at timestamptz; -- null: admin još nije otvorio školu
    alter table organizations add column trial_reminder_key text; -- poslednji poslat podsetnik: <datum isteka>:soon ili :ended

    update organizations set source = 'self' where id in (select org_id from audit_log where action = 'org.register' and org_id is not null);
    update organizations set admin_seen_at = now();
  end if;
end $$;

-- Vlasnik škole ne može sam da menja paket, status, datume pretplate ni administrativne oznake.
create or replace function public.protect_org_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() and auth.uid() is not null then
    new.plan := old.plan;
    new.billing := old.billing;
    new.status := old.status;
    new.trial_ends_at := old.trial_ends_at;
    new.paid_until := old.paid_until;
    new.admin_notes := old.admin_notes;
    new.source := old.source;
    new.admin_seen_at := old.admin_seen_at;
    new.trial_reminder_key := old.trial_reminder_key;
  end if;
  return new;
end $$;
