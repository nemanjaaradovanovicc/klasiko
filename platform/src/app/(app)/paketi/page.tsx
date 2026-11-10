import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Card, Field, Flash, Badge, Select } from '@/components/ui';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { packageBalances, type Balance } from '@/lib/packages-db';
import { hasNextPackage, packageReminderText, shouldRemindPackage } from '@/lib/packages';
import { dateSr, formatMoney, fullName, todayISO } from '@/lib/format';
import { parentUrl } from '@/lib/parent';
import { ConfirmButton } from '@/components/confirm';
import { createCatalog, updateCatalog, deleteCatalog, assignPackage, savePackagePayment, deletePackagePurchase } from './actions';
import { PackageRemindButton } from './remind';

export const metadata = { title: 'Paketi časova' };

const OK: Record<string, string> = {
  katalog: 'Katalog paketa je sačuvan.',
  paket: 'Paket je dodat. Datum uplate, ako je unet, zatvara zaduženje.',
  uplata: 'Datum uplate i istek su sačuvani.',
  obrisan: 'Kupovina je obrisana. Zaduženje, ako postoji, ostaje na stranici Uplate.',
};

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; grupa?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();
  type Cat = { id: string; name: string; lessons: number; price: number; currency: string; shared: boolean; active: boolean };
  type G = { id: string; name: string; drop_in: boolean; fee_type: string };
  type M = { group_id: string; student_id: string; students: { id: string; first_name: string; last_name: string; active: boolean } | null };
  type St = { id: string; first_name: string; last_name: string; active: boolean };
  const [catalogRes, groupsRes, membersRes, remindersRes, balancesRes, linksRes] = await Promise.all([
    supabase.from('lesson_packages').select('id, name, lessons, price, currency, shared, active').eq('org_id', ctx.org.id).order('name'),
    supabase.from('groups').select('id, name, drop_in, fee_type').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('group_members').select('group_id, student_id, students(id, first_name, last_name, active)').eq('org_id', ctx.org.id),
    supabase.from('reminders').select('class_package_id, channel').eq('org_id', ctx.org.id).eq('kind', 'package_low'),
    packageBalances(supabase, ctx.org.id, today).then((rows) => ({ rows, error: null as string | null })).catch((e: unknown) => {
      console.error(e);
      return { rows: [] as Balance[], error: 'Kupljeni paketi se trenutno ne mogu prikazati. Katalog i dodela i dalje rade.' };
    }),
    fetchAll<{ student_id: string; token: string }>((a, b) => supabase.from('parent_links').select('student_id, token').eq('org_id', ctx.org.id).eq('revoked', false).order('token').range(a, b)).catch((e: unknown) => {
      console.error(e);
      return [] as { student_id: string; token: string }[];
    }),
  ]);
  const catalog = catalogRes.data;
  const groups = groupsRes.data;
  const members = membersRes.data;
  const reminders = remindersRes.data;
  const balances = balancesRes.rows;
  const links = linksRes;
  const loadError = balancesRes.error
    ?? (catalogRes.error || groupsRes.error || membersRes.error ? 'Deo podataka se nije učitao. Osveži stranicu. Katalog možeš da sačuvaš ako se forma vidi.' : null);
  const cats = (catalog ?? []) as Cat[];
  const activeCats = cats.filter((c) => c.active);
  const grs = (groups ?? []) as G[];
  const mem = ((members ?? []) as unknown as M[]).filter((m) => m.students?.active);
  const dropIds = grs.filter((g) => g.drop_in).map((g) => g.id);
  const allStudents: St[] = dropIds.length
    ? await fetchAll<St>((a, b) => supabase.from('students').select('id, first_name, last_name, active').eq('org_id', ctx.org.id).eq('active', true).order('last_name').order('id').range(a, b))
    : [];
  const byGroup = new Map<string, { id: string; name: string }[]>();
  for (const m of mem) {
    const name = fullName(m.students!);
    byGroup.set(m.group_id, [...(byGroup.get(m.group_id) ?? []), { id: m.student_id, name }]);
  }
  for (const gid of dropIds) {
    const have = new Set((byGroup.get(gid) ?? []).map((s) => s.id));
    const extra = allStudents.filter((s) => !have.has(s.id)).map((s) => ({ id: s.id, name: fullName(s) }));
    byGroup.set(gid, [...(byGroup.get(gid) ?? []), ...extra].sort((a, b) => a.name.localeCompare(b.name, 'sr')));
  }
  const options = grs.flatMap((g) => (byGroup.get(g.id) ?? []).map((st) => ({ value: `${g.id}:${st.id}`, label: `${g.name} · ${st.name}` })));

  const shown = sp.grupa ? balances.filter((b) => b.group_id === sp.grupa) : balances;
  const grouped = new Map<string, Balance[]>();
  for (const b of shown) grouped.set(b.id, [...(grouped.get(b.id) ?? []), b]);
  const sent = new Set((reminders ?? []).map((r) => `${r.class_package_id}:${r.channel}`));
  const linkBy = new Map(links.map((l) => [l.student_id, l.token]));
  const bundlePrice = (b: Balance) => {
    const mates = balances.filter((x) => (b.bundle_id ? x.bundle_id === b.bundle_id : x.id === b.id));
    return Math.max(0, ...mates.map((x) => x.price));
  };

  return (
    <>
      <PageHeader
        title="Paketi časova"
        subtitle={ctx.isOwner ? 'Katalog, kupovina i datumi uplate' : 'Uplata i istek za tvoje učenike'}
      />
      <Flash ok={sp.ok ? (OK[sp.ok] ?? sp.ok) : undefined} err={sp.err ?? loadError ?? undefined} />

      {ctx.isOwner && (
        <Card title="Katalog paketa" className="mb-6">
          <p className="mb-4 text-[14px] font-semibold text-ink-2">Škola definiše pakete: naziv, broj časova, cenu i valutu. Popust za braću i sestre može biti poseban paket sa fiksnom cenom (npr. dvoje dece, troje dece). Duo na istom času je zajednički paket: deca dele jedan broj časova.</p>
          {cats.length > 0 && (
            <ul className="mb-4 flex flex-col gap-3">
              {cats.map((c) => (
                <li key={c.id} className="rounded-xl bg-soft px-3 py-3">
                  <form action={updateCatalog} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Field label="Naziv" name="name" defaultValue={c.name} required />
                    <Field label="Časova" name="lessons" type="number" min={1} step="1" defaultValue={c.lessons} required />
                    <Field label="Cena" name="price" type="number" min={0} step="0.01" defaultValue={c.price} required />
                    <Select label="Valuta" name="currency" defaultValue={c.currency} options={[{ value: 'EUR', label: 'EUR' }, { value: 'RSD', label: 'RSD' }]} />
                    <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-2"><input type="checkbox" name="shared" defaultChecked={c.shared} className="h-5 w-5 accent-[#5B2A86]" /> Zajednički čas (duo)</label>
                    <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-2"><input type="checkbox" name="active" defaultChecked={c.active} className="h-5 w-5 accent-[#5B2A86]" /> U ponudi</label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button className="btn btn-sm btn-soft">Sačuvaj</button>
                    </div>
                  </form>
                  <form action={deleteCatalog} className="mt-2">
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton message={c.active ? 'Arhivirati ili obrisati ovaj paket iz kataloga?' : 'Obrisati paket iz kataloga?'} className="text-[13px] font-bold text-coral-dark hover:underline">{c.active ? 'Arhiviraj ili obriši' : 'Obriši'}</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createCatalog} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Novi paket" name="name" required placeholder="npr. 10 individualnih časova" /></div>
            <Field label="Broj časova" name="lessons" type="number" min={1} step="1" required placeholder="10" />
            <Field label="Cena" name="price" type="number" min={0} step="0.01" required placeholder="250" />
            <Select label="Valuta" name="currency" defaultValue="EUR" options={[{ value: 'EUR', label: 'EUR' }, { value: 'RSD', label: 'RSD' }]} />
            <label className="flex items-start gap-2 text-[14px] font-semibold text-ink-2"><input type="checkbox" name="shared" className="mt-1 h-5 w-5 accent-[#5B2A86]" /> Zajednički čas (duo): izabrana deca dele jedan broj časova</label>
            <div className="sm:col-span-2"><button className="btn">Dodaj u katalog</button></div>
          </form>
        </Card>
      )}

      <Card title="Dodeli paket" className="mb-6">
        <form action={assignPackage} className="grid gap-3">
          <input type="hidden" name="back" value="/paketi" />
          {activeCats.length > 0 ? (
            <Select label="Paket iz kataloga" name="package_id" placeholder="Ručni unos ispod" options={activeCats.map((c) => ({ value: c.id, label: `${c.name} · ${c.lessons} čas. · ${formatMoney(c.price, c.currency)}${c.shared ? ' · duo' : ''}` }))} />
          ) : (
            <p className="text-[14px] font-semibold text-ink-2">{ctx.isOwner ? 'Katalog je prazan. Možeš odmah da uneseš broj časova i cenu, ili prvo da dodaš paket iznad.' : 'Škola još nije definisala katalog. Unesi broj časova i cenu.'}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Broj časova (ručno)" name="classes" type="number" min={1} step="1" hint="Ignoriše se kad je izabran paket" />
            <Field label="Cena (ručno)" name="price" type="number" min={0} step="0.01" />
            <Select label="Valuta (ručno)" name="currency" defaultValue="EUR" options={[{ value: 'EUR', label: 'EUR' }, { value: 'RSD', label: 'RSD' }]} />
          </div>
          <label className="flex items-start gap-2 text-[14px] font-semibold text-ink-2"><input type="checkbox" name="shared" className="mt-1 h-5 w-5 accent-[#5B2A86]" /> Ručni unos je zajednički čas (duo). Za paket iz kataloga važi ono što piše u katalogu.</label>
          <label className="block">
            <span className="label">Učenici</span>
            <select name="pick" multiple required className="input h-40 py-2">
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="mt-1 block text-[12px] font-semibold text-mut">Za porodični paket izaberi svako dete (svako sa svojom grupom). Za duo izaberi oba deteta iz iste grupe. Drži Ctrl ili Cmd za više.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Datum uplate</span><input className="input" type="date" name="paid_at" /></label>
            <label className="block"><span className="label">Važi do (ako ne računaš automatski)</span><input className="input" type="date" name="expires_at" /></label>
          </div>
          <label className="flex items-start gap-2 text-[14px] font-semibold text-ink-2">
            <input type="checkbox" name="auto_expires" defaultChecked className="mt-1 h-5 w-5 accent-[#5B2A86]" />
            <span>Računaj istek automatski: 10 časova jednom nedeljno traje 10 nedelja, dvaput nedeljno 5. Otkazan čas bez nadoknade produžava istek za nedelju dana.</span>
          </label>
          <div><button className="btn">Sačuvaj kupovinu</button></div>
        </form>
      </Card>

      <Card title={sp.grupa ? 'Paketi ove grupe' : 'Kupljeni paketi'} actions={sp.grupa ? <Link href="/paketi" className="text-[13px] font-bold text-brand">Svi paketi</Link> : undefined}>
        {grouped.size === 0 ? (
          <p className="text-[14px] font-semibold text-mut">Još nema kupljenih paketa.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {[...grouped.values()].map((rows) => {
              const b = rows[0];
              const price = bundlePrice(b);
              const remind = rows.some((r) => shouldRemindPackage(r.used, r.total, r.expired) && !hasNextPackage(balances, r));
              const phone = rows.map((r) => r.phone).find(Boolean) ?? null;
              const token = rows.map((r) => linkBy.get(r.student_id)).find(Boolean);
              const emailed = sent.has(`${b.id}:email`);
              const waSent = sent.has(`${b.id}:whatsapp`);
              return (
                <li key={b.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-ink">{rows.map((r) => r.name).join(', ')}</div>
                      <div className="text-[13px] font-semibold text-mut">{b.group}{b.shared ? ' · zajednički čas' : ''}{b.bundle_id ? ' · porodični paket' : ''}</div>
                    </div>
                    <Badge tone={b.expired ? 'gray' : b.remaining <= 1 ? 'coral' : 'ok'}>{b.expired ? 'istekao' : `ostalo ${b.remaining} od ${b.total}`}</Badge>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-ink-2">
                    {formatMoney(price, b.currency)} · kupljeno {dateSr(b.purchased_at)}
                    {b.paid_at ? ` · plaćeno ${dateSr(b.paid_at)}` : ' · uplata nije evidentirana'}
                    {b.expires_at ? ` · važi do ${dateSr(b.expires_at)}` : ''}
                    {rows.length === 1 ? ` · odslušano ${b.used}` : ''}
                  </p>
                  {ctx.org.package_reminders && remind && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {phone && (
                        <PackageRemindButton
                          phone={phone}
                          packageId={b.id}
                          studentId={b.student_id}
                          sent={waSent}
                          message={packageReminderText({
                            school: ctx.org.name,
                            student: rows.map((r) => r.name).join(', '),
                            used: b.used,
                            total: b.total,
                            price,
                            currency: b.currency,
                            instructions: ctx.org.payment_instructions,
                            bankAccount: ctx.org.bank_account,
                            link: token ? parentUrl(token) : null,
                          })}
                        />
                      )}
                      {emailed && <span className="text-[12px] font-bold text-ok">Mejl je poslat</span>}
                      {!phone && <span className="text-[12px] font-bold text-coral-dark">Nema telefona roditelja</span>}
                    </div>
                  )}
                  <form action={savePackagePayment} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="back" value="/paketi" />
                    <label className="block"><span className="label">Datum uplate</span><input className="input" type="date" name="paid_at" defaultValue={b.paid_at ?? ''} /></label>
                    <label className="block"><span className="label">Važi do</span><input className="input" type="date" name="expires_at" defaultValue={b.expires_at ?? ''} /></label>
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2 sm:col-span-2">
                      <input type="checkbox" name="auto_expires" defaultChecked={b.auto_expires} className="h-5 w-5 accent-[#5B2A86]" />
                      Računaj istek automatski (uz produženje za otkazane časove)
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button className="btn btn-sm">Sačuvaj uplatu i istek</button>
                    </div>
                  </form>
                  <form action={deletePackagePurchase} className="mt-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="back" value="/paketi" />
                    <ConfirmButton message="Obrisati ovu kupovinu paketa? Zaduženje na Uplatama ostaje." className="text-[13px] font-bold text-coral-dark hover:underline">Obriši kupovinu</ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
