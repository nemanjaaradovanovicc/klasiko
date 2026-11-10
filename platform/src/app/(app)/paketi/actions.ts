'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrg, requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isISODate, todayISO } from '@/lib/format';
import { suggestedExpiry } from '@/lib/packages';
import { weeklyFrequency } from '@/lib/schedule';

function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
}
function safeBack(v: FormDataEntryValue | null, fallback: string): string {
  const b = String(v || '');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
}
function go(back: string, q: string) {
  redirect(`${back}${back.includes('?') ? '&' : '?'}${q}`);
}
function currencyOf(v: string | null): 'RSD' | 'EUR' {
  return v?.toUpperCase() === 'EUR' ? 'EUR' : 'RSD';
}

async function ensurePayment(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, userId: string, row: { id: string; student_id: string; group_id: string; price: number; currency: string; charge_id: string | null; classes_total: number }, paidAt: string | null, description: string) {
  if (!(Number(row.price) > 0)) return;
  let chargeId = row.charge_id;
  if (!chargeId) {
    const { data: ch, error } = await supabase.from('charges').insert({
      org_id: orgId,
      student_id: row.student_id,
      group_id: row.group_id,
      period: (paidAt ?? todayISO()).slice(0, 7),
      amount: row.price,
      currency: row.currency,
      kind: 'package',
      description,
      due_date: null,
    }).select('id').single();
    if (error || !ch) return;
    chargeId = ch.id;
    await supabase.from('class_packages').update({ charge_id: chargeId }).eq('id', row.id).eq('org_id', orgId);
  }
  if (!paidAt) return;
  const { data: pays } = await supabase.from('payments').select('id').eq('charge_id', chargeId).eq('org_id', orgId).limit(1);
  if (pays?.length) {
    await supabase.from('payments').update({ paid_at: paidAt }).eq('id', pays[0].id).eq('org_id', orgId);
  } else {
    await supabase.from('payments').insert({
      org_id: orgId,
      student_id: row.student_id,
      charge_id: chargeId,
      amount: row.price,
      currency: row.currency,
      paid_at: paidAt,
      method: 'other',
      note: 'Paket časova',
      created_by: userId,
    });
  }
}

export async function createCatalog(fd: FormData) {
  const ctx = await requireOwner();
  const name = s(fd, 'name');
  const lessons = Number(fd.get('lessons'));
  const price = Number(String(fd.get('price') ?? '').replace(',', '.'));
  if (!name || !Number.isInteger(lessons) || lessons < 1 || !Number.isFinite(price) || price < 0) {
    redirect('/paketi?err=' + encodeURIComponent('Unesi naziv, broj časova i cenu paketa.'));
  }
  const supabase = await createClient();
  const { error } = await supabase.from('lesson_packages').insert({
    org_id: ctx.org.id,
    name,
    lessons,
    price,
    currency: currencyOf(s(fd, 'currency')),
    shared: fd.get('shared') === 'on',
    active: true,
  });
  revalidatePath('/paketi');
  redirect('/paketi?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=katalog'));
}

export async function updateCatalog(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id') || '');
  const name = s(fd, 'name');
  const lessons = Number(fd.get('lessons'));
  const price = Number(String(fd.get('price') ?? '').replace(',', '.'));
  if (!name || !Number.isInteger(lessons) || lessons < 1 || !Number.isFinite(price) || price < 0) {
    redirect('/paketi?err=' + encodeURIComponent('Unesi naziv, broj časova i cenu paketa.'));
  }
  const supabase = await createClient();
  const { error } = await supabase.from('lesson_packages').update({
    name,
    lessons,
    price,
    currency: currencyOf(s(fd, 'currency')),
    shared: fd.get('shared') === 'on',
    active: fd.get('active') === 'on',
  }).eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/paketi');
  redirect('/paketi?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=katalog'));
}

export async function deleteCatalog(fd: FormData) {
  const ctx = await requireOwner();
  const id = String(fd.get('id') || '');
  const supabase = await createClient();
  const { count } = await supabase.from('class_packages').select('id', { count: 'exact', head: true }).eq('package_id', id).eq('org_id', ctx.org.id);
  const { error } = count
    ? await supabase.from('lesson_packages').update({ active: false }).eq('id', id).eq('org_id', ctx.org.id)
    : await supabase.from('lesson_packages').delete().eq('id', id).eq('org_id', ctx.org.id);
  revalidatePath('/paketi');
  redirect('/paketi?' + (error ? 'err=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent(count ? 'Paket je arhiviran jer već postoje kupovine.' : 'Paket je obrisan.')));
}

// Dodeljuje katalog (ili ručni unos) jednom učeniku ili više dece. Predavač samo svojim grupama.
export async function assignPackage(fd: FormData) {
  const ctx = await requireOrg();
  const back = safeBack(fd.get('back'), '/paketi');
  const picks = new Map<string, { groupId: string; studentId: string }>();
  const add = (groupId: string, studentId: string) => {
    if (groupId && studentId) picks.set(`${groupId}:${studentId}`, { groupId, studentId });
  };
  for (const raw of fd.getAll('pick')) {
    const [groupId, studentId] = String(raw).split(':');
    add(groupId, studentId);
  }
  add(String(fd.get('group_id') || ''), String(fd.get('student_id') || ''));
  for (const id of fd.getAll('extra_student_id').map(String).filter(Boolean)) add(String(fd.get(`group_for_${id}`) || ''), id);
  const list = [...picks.values()];
  if (!list.length) go(back, 'err=' + encodeURIComponent('Izaberi bar jednog učenika i grupu.'));

  const supabase = await createClient();
  let lessons = Number(fd.get('classes'));
  let price = Number(String(fd.get('price') ?? '').replace(',', '.'));
  let currency = currencyOf(s(fd, 'currency'));
  let shared = fd.get('shared') === 'on';
  let catalogId: string | null = null;
  let catalogName: string | null = null;
  const packageId = String(fd.get('package_id') || '');
  if (packageId) {
    const { data: cat } = await supabase.from('lesson_packages').select('id, name, lessons, price, currency, shared').eq('id', packageId).eq('org_id', ctx.org.id).maybeSingle();
    if (!cat) go(back, 'err=' + encodeURIComponent('Paket nije pronađen.'));
    lessons = cat!.lessons;
    price = Number(cat!.price);
    currency = currencyOf(cat!.currency);
    shared = !!cat!.shared;
    catalogId = cat!.id;
    catalogName = cat!.name;
  }
  if (!Number.isInteger(lessons) || lessons < 1 || !Number.isFinite(price) || price < 0) {
    go(back, 'err=' + encodeURIComponent('Unesi broj časova i cenu, ili izaberi paket iz kataloga.'));
  }
  if (shared && new Set(list.map((p) => p.groupId)).size > 1) {
    go(back, 'err=' + encodeURIComponent('Zajednički paket (duo) važi za jednu grupu, jer deca dele isti čas.'));
  }

  const groupIds = [...new Set(list.map((p) => p.groupId))];
  const studentIds = [...new Set(list.map((p) => p.studentId))];
  const [{ data: groups }, { data: mem }, { data: studs }] = await Promise.all([
    supabase.from('groups').select('id, name, drop_in').in('id', groupIds).eq('org_id', ctx.org.id),
    supabase.from('group_members').select('group_id, student_id').in('group_id', groupIds),
    supabase.from('students').select('id').in('id', studentIds).eq('org_id', ctx.org.id).eq('active', true),
  ]);
  if ((groups ?? []).length !== groupIds.length) go(back, 'err=' + encodeURIComponent('Grupa nije pronađena ili nemaš pristup.'));
  if ((studs ?? []).length !== studentIds.length) go(back, 'err=' + encodeURIComponent('Učenik nije pronađen.'));
  const dropIn = new Set((groups ?? []).filter((g) => g.drop_in).map((g) => g.id));
  const member = new Set((mem ?? []).map((m) => `${m.group_id}:${m.student_id}`));
  for (const p of list) {
    if (!dropIn.has(p.groupId) && !member.has(`${p.groupId}:${p.studentId}`)) {
      go(back, 'err=' + encodeURIComponent('Učenik nije u izabranoj grupi. Za čas bez stalnih članova uključi otvorenu grupu.'));
    }
  }

  const paidRaw = String(fd.get('paid_at') || '');
  const expRaw = String(fd.get('expires_at') || '');
  const auto = fd.get('auto_expires') === 'on';
  const paidAt = isISODate(paidRaw) ? paidRaw : null;
  const manualExpires = isISODate(expRaw) ? expRaw : null;
  const purchasedAt = paidAt ?? todayISO();
  const { data: slots } = await supabase.from('schedule_slots').select('group_id, recurrence').in('group_id', groupIds);
  const freqOf = (groupId: string) => weeklyFrequency((slots ?? []).filter((sl) => sl.group_id === groupId));
  const expiresFor = (groupId: string) => (auto ? suggestedExpiry(purchasedAt, lessons, freqOf(groupId), 0) : manualExpires);
  const description = catalogName ? `Paket: ${catalogName}` : `Paket ${lessons} časova`;
  const bundle = !shared && list.length > 1 ? randomUUID() : null;

  const inserted: { id: string; student_id: string; group_id: string; price: number }[] = [];
  if (shared) {
    const first = list[0];
    const { data, error } = await supabase.from('class_packages').insert({
      org_id: ctx.org.id,
      student_id: first.studentId,
      group_id: first.groupId,
      classes_total: lessons,
      price,
      currency,
      package_id: catalogId,
      purchased_at: purchasedAt,
      paid_at: paidAt,
      expires_at: expiresFor(first.groupId),
      auto_expires: auto,
      shared: true,
    }).select('id').single();
    if (error || !data) go(back, 'err=' + encodeURIComponent(error?.message ?? 'Paket nije sačuvan. Proveri da li predaješ tu grupu.'));
    const { error: linkErr } = await supabase.from('class_package_students').insert(list.map((p) => ({ class_package_id: data!.id, student_id: p.studentId, group_id: p.groupId, org_id: ctx.org.id })));
    if (linkErr) go(back, 'err=' + encodeURIComponent(linkErr.message));
    inserted.push({ id: data!.id, student_id: first.studentId, group_id: first.groupId, price });
  } else {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const rowPrice = i === 0 ? price : 0;
      const { data, error } = await supabase.from('class_packages').insert({
        org_id: ctx.org.id,
        student_id: p.studentId,
        group_id: p.groupId,
        classes_total: lessons,
        price: rowPrice,
        currency,
        package_id: catalogId,
        purchased_at: purchasedAt,
        paid_at: paidAt,
        expires_at: expiresFor(p.groupId),
        auto_expires: auto,
        shared: false,
        bundle_id: bundle,
      }).select('id').single();
      if (error || !data) go(back, 'err=' + encodeURIComponent(error?.message ?? 'Paket nije sačuvan. Proveri da li predaješ tu grupu.'));
      inserted.push({ id: data!.id, student_id: p.studentId, group_id: p.groupId, price: rowPrice });
    }
  }

  const anchor = inserted[0];
  await ensurePayment(supabase, ctx.org.id, ctx.userId, { ...anchor, currency, charge_id: null, classes_total: lessons }, paidAt, description);
  revalidatePath('/paketi');
  revalidatePath('/ucenici');
  revalidatePath('/');
  go(back, 'ok=paket');
}

export async function savePackagePayment(fd: FormData) {
  const ctx = await requireOrg();
  const back = safeBack(fd.get('back'), '/paketi');
  const id = String(fd.get('id') || '');
  const supabase = await createClient();
  const { data: row } = await supabase.from('class_packages').select('id, bundle_id, group_id, student_id, price, currency, charge_id, classes_total, purchased_at, package_id').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!row) go(back, 'err=' + encodeURIComponent('Paket nije pronađen ili nemaš pristup.'));
  const paidAt = isISODate(String(fd.get('paid_at') || '')) ? String(fd.get('paid_at')) : null;
  const expRaw = String(fd.get('expires_at') || '');
  const auto = fd.get('auto_expires') === 'on';
  let expires: string | null = isISODate(expRaw) ? expRaw : null;
  if (auto) {
    const [{ data: slots }, { count }] = await Promise.all([
      supabase.from('schedule_slots').select('recurrence').eq('group_id', row!.group_id),
      supabase.from('package_extensions').select('session_id', { count: 'exact', head: true }).eq('class_package_id', row!.id),
    ]);
    expires = suggestedExpiry(row!.purchased_at, row!.classes_total, weeklyFrequency(slots ?? []), count ?? 0);
  }
  if (row!.bundle_id) {
    const { error } = await supabase.from('class_packages').update({ paid_at: paidAt }).eq('bundle_id', row!.bundle_id).eq('org_id', ctx.org.id);
    if (error) go(back, 'err=' + encodeURIComponent(error.message));
  }
  const { error } = await supabase.from('class_packages').update({ paid_at: paidAt, expires_at: expires, auto_expires: auto }).eq('id', row!.id).eq('org_id', ctx.org.id);
  if (error) go(back, 'err=' + encodeURIComponent(error.message));

  const { data: priced } = row!.bundle_id
    ? await supabase.from('class_packages').select('id, student_id, group_id, price, currency, charge_id, classes_total').eq('bundle_id', row!.bundle_id).eq('org_id', ctx.org.id).order('price', { ascending: false }).limit(1).maybeSingle()
    : { data: row };
  if (priced && Number(priced.price) > 0) {
    let label = `Paket ${priced.classes_total} časova`;
    if (row!.package_id) {
      const { data: cat } = await supabase.from('lesson_packages').select('name').eq('id', row!.package_id).maybeSingle();
      if (cat?.name) label = `Paket: ${cat.name}`;
    }
    await ensurePayment(supabase, ctx.org.id, ctx.userId, priced, paidAt, label);
  }
  revalidatePath('/paketi');
  revalidatePath(`/ucenici/${row!.student_id}`);
  go(back, 'ok=uplata');
}

export async function deletePackagePurchase(fd: FormData) {
  const ctx = await requireOrg();
  const back = safeBack(fd.get('back'), '/paketi');
  const supabase = await createClient();
  const { error } = await supabase.from('class_packages').delete().eq('id', String(fd.get('id') || '')).eq('org_id', ctx.org.id);
  revalidatePath('/paketi');
  revalidatePath('/ucenici');
  go(back, error ? 'err=' + encodeURIComponent(error.message) : 'ok=obrisan');
}

export async function logPackageWhatsapp(packageId: string, studentId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase.from('reminders').upsert({
    org_id: ctx.org.id,
    student_id: studentId,
    class_package_id: packageId,
    channel: 'whatsapp',
    kind: 'package_low',
    sent_by: ctx.userId,
  }, { onConflict: 'class_package_id,kind,channel', ignoreDuplicates: true });
  revalidatePath('/paketi');
  return error ? { error: error.message } : { ok: true };
}
