-- Klasiko: naplata pretplate (fakture, uplate, podaci izdavaoca)

-- Podaci izdavaoca faktura (jedan red)
create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),
  issuer_name text not null default '',
  issuer_address text,
  issuer_city text,
  issuer_pib text,
  issuer_mb text,
  bank_name text,
  bank_account text,
  email text,
  phone text,
  invoice_note text default 'Instrukcija za uplatu. Ovo nije faktura.',
  payment_days int not null default 8,
  updated_at timestamptz not null default now()
);
insert into platform_settings (id, issuer_name, issuer_address, issuer_city, bank_name, bank_account, email, phone)
values (1, 'Nemanja Radovanović', 'Miodraga Protića 4', 'Beograd', 'Raiffeisen banka', '265-0000006877193-37', 'nemanja.r@vgrubs.com', '+381 63 8219713')
on conflict (id) do nothing;

-- Podaci kupca na školi (za fakturu)
alter table organizations add column if not exists billing_name text;
alter table organizations add column if not exists billing_address text;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  number text not null unique,
  issue_date date not null default current_date,
  service_date date not null default current_date,
  due_date date,
  place text not null default 'Beograd',
  buyer jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  status text not null default 'issued' check (status in ('issued', 'paid', 'cancelled')),
  paid_at date,
  note text,
  plan plan_code,
  billing billing_cycle,
  created_at timestamptz not null default now()
);
create index if not exists invoices_org_idx on invoices(org_id, issue_date desc);

create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  invoice_id uuid references invoices on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text not null default 'bank' check (method in ('bank', 'cash', 'card', 'other')),
  plan plan_code,
  billing billing_cycle,
  paid_until_before date,
  paid_until_after date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists sub_payments_org_idx on subscription_payments(org_id, paid_at desc);

alter table platform_settings enable row level security;
alter table invoices enable row level security;
alter table subscription_payments enable row level security;

-- Podatke izdavaoca čitaju svi prijavljeni (za uplatu), menja samo admin.
drop policy if exists ps_read on platform_settings;
create policy ps_read on platform_settings for select using (auth.uid() is not null);
drop policy if exists ps_admin on platform_settings;
create policy ps_admin on platform_settings for all using (is_superadmin()) with check (is_superadmin());

-- Vlasnik škole vidi svoje fakture i uplate; menja samo admin.
drop policy if exists inv_read on invoices;
create policy inv_read on invoices for select using (is_superadmin() or is_owner_of(org_id));
drop policy if exists inv_admin on invoices;
create policy inv_admin on invoices for all using (is_superadmin()) with check (is_superadmin());
drop policy if exists subp_read on subscription_payments;
create policy subp_read on subscription_payments for select using (is_superadmin() or is_owner_of(org_id));
drop policy if exists subp_admin on subscription_payments;
create policy subp_admin on subscription_payments for all using (is_superadmin()) with check (is_superadmin());


-- Dan u mesecu kada se šalju instrukcije i oznaka da je poruka poslata
alter table platform_settings add column if not exists billing_day int not null default 10 check (billing_day between 1 and 28);
alter table invoices add column if not exists sent_at timestamptz;
alter table invoices add column if not exists period_from date;
alter table invoices add column if not exists period_to date;
