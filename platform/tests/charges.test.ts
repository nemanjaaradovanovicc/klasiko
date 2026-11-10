import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyAdvances, createChargesForPeriod } from '@/lib/charges';

// Mala zamena za Supabase klijent: dovoljna da se proveri obračun bez baze.
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const log: { op: string; table: string; rows?: unknown; id?: unknown }[] = [];
  const from = (table: string) => {
    let op = 'select', payload: unknown = null;
    const filters: [string, unknown][] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
      is: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
      in: () => chain,
      order: () => chain,
      range: () => chain,
      insert: (rows: unknown) => { op = 'insert'; payload = rows; return chain; },
      update: (rows: unknown) => { op = 'update'; payload = rows; return chain; },
      then: (ok: (v: unknown) => unknown) => {
        if (op !== 'select') { log.push({ op, table, rows: payload, id: filters.find(([c]) => c === 'id')?.[1] }); return ok({ data: null, error: null }); }
        const rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
        return ok({ data: rows, error: null });
      },
    };
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, log };
}

const st = (id: string, ref: number, over: Record<string, unknown> = {}) => ({ student_id: id, students: { id, active: true, custom_fee: null, discount_pct: 0, family_id: null, ref_no: ref, joined_at: '2026-01-01', ...over } });
const org = { id: 'o', fee_due_day: 10, default_fee: 3000, sibling_discount_pct: 10 };

describe('mesečna zaduženja', () => {
  it('računa cenu grupe, posebnu cenu, popust i podrazumevanu cenu', async () => {
    const { db, log } = fakeDb({
      groups: [
        { id: 'g1', name: 'A', monthly_fee: 4000, group_members: [st('s1', 1), st('s2', 2, { custom_fee: 2000 }), st('s3', 3, { discount_pct: 25 })] },
        { id: 'g2', name: 'B', monthly_fee: null, group_members: [st('s4', 4)] },
      ],
      charges: [],
      payments: [],
    });
    const res = await createChargesForPeriod(db, org, '2026-11');
    expect(res).toEqual({ created: 4, skipped: 0 });
    const rows = log.find((l) => l.op === 'insert')!.rows as { student_id: string; amount: number; due_date: string; kind: string }[];
    expect(Object.fromEntries(rows.map((r) => [r.student_id, r.amount]))).toEqual({ s1: 4000, s2: 2000, s3: 3000, s4: 3000 });
    expect(rows[0].due_date).toBe('2026-11-10');
    expect(rows[0].kind).toBe('monthly');
  });
  it('preskače neaktivne, već zadužene i upisane posle tog meseca', async () => {
    const { db, log } = fakeDb({
      groups: [{ id: 'g', name: 'A', monthly_fee: 1000, group_members: [st('s1', 1), st('s2', 2, { active: false }), st('s3', 3, { joined_at: '2026-12-01' })] }],
      charges: [{ id: 'c', student_id: 's1', group_id: 'g', period: '2026-11', kind: 'monthly' }],
      payments: [],
    });
    expect(await createChargesForPeriod(db, org, '2026-11')).toEqual({ created: 0, skipped: 0 });
    expect(log.filter((l) => l.op === 'insert')).toEqual([]);
  });
  it('prijavljuje učenike bez cene', async () => {
    const { db } = fakeDb({ groups: [{ id: 'g', name: 'A', monthly_fee: null, group_members: [st('s1', 1)] }], charges: [], payments: [] });
    expect(await createChargesForPeriod(db, { ...org, default_fee: null }, '2026-11')).toEqual({ created: 0, skipped: 1 });
  });
  it('popust za braću i sestre: prvo upisano dete plaća punu cenu, veći popust ima prednost', async () => {
    const { db, log } = fakeDb({
      groups: [{ id: 'g', name: 'A', monthly_fee: 1000, group_members: [st('s1', 1, { family_id: 'f' }), st('s2', 2, { family_id: 'f' }), st('s3', 3, { family_id: 'f', discount_pct: 50 }), st('s4', 4)] }],
      charges: [],
      payments: [],
    });
    await createChargesForPeriod(db, org, '2026-11');
    const rows = log.find((l) => l.op === 'insert')!.rows as { student_id: string; amount: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.student_id, r.amount]))).toEqual({ s1: 1000, s2: 900, s3: 500, s4: 1000 });
  });
  it('drugo dete 20%, treće 50%', async () => {
    const { db, log } = fakeDb({
      groups: [{ id: 'g', name: 'A', monthly_fee: 1000, group_members: [st('s1', 1, { family_id: 'f' }), st('s2', 2, { family_id: 'f' }), st('s3', 3, { family_id: 'f' })] }],
      charges: [],
      payments: [],
    });
    await createChargesForPeriod(db, { ...org, sibling_discount_pct: 20, sibling_discount_3_pct: 50 }, '2026-11');
    const rows = log.find((l) => l.op === 'insert')!.rows as { student_id: string; amount: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.student_id, r.amount]))).toEqual({ s1: 1000, s2: 800, s3: 500 });
  });
  it('ako procenat za treće dete nije upisan, važi procenat za drugo', async () => {
    const { db, log } = fakeDb({
      groups: [{ id: 'g', name: 'A', monthly_fee: 1000, group_members: [st('s1', 1, { family_id: 'f' }), st('s2', 2, { family_id: 'f' }), st('s3', 3, { family_id: 'f' })] }],
      charges: [],
      payments: [],
    });
    await createChargesForPeriod(db, { ...org, sibling_discount_pct: 10, sibling_discount_3_pct: 0 }, '2026-11');
    const rows = log.find((l) => l.op === 'insert')!.rows as { student_id: string; amount: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.student_id, r.amount]))).toEqual({ s1: 1000, s2: 900, s3: 900 });
  });
});

describe('avans', () => {
  const base = { student_id: 's', paid_at: '2026-10-01', method: 'bank', note: null, created_by: null, statement_hash: 'h', org_id: 'o', charge_id: null };
  it('ceo avans ide na jedno zaduženje', async () => {
    const { db, log } = fakeDb({
      payments: [{ id: 'p', amount: 1000, ...base }],
      charges: [{ id: 'c', student_id: 's', period: '2026-11', amount: 2000, payments: [] }],
    });
    expect(await applyAdvances(db, 'o')).toBe(1);
    expect(log).toEqual([{ op: 'update', table: 'payments', rows: { charge_id: 'c', amount: 1000 }, id: 'p' }]);
  });
  it('veći avans se deli i ostatak ostaje avans', async () => {
    const { db, log } = fakeDb({
      payments: [{ id: 'p', amount: 3000, ...base }],
      charges: [{ id: 'c', student_id: 's', period: '2026-11', amount: 2000, payments: [{ amount: 500 }] }],
    });
    await applyAdvances(db, 'o');
    expect(log[0]).toMatchObject({ op: 'insert', rows: { charge_id: 'c', amount: 1500 } });
    expect(log[1]).toMatchObject({ op: 'update', rows: { amount: 1500 }, id: 'p' });
  });
});
