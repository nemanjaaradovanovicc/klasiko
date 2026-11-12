import { describe, expect, it } from 'vitest';
import { matchRows, matchesSearch, statementKeys, suggestAllocation, type MatchCharge, type StatementRow } from '@/lib/match';
import { mapStatementColumns, toAmount, toDate } from '@/lib/statement';
import { attendanceStats, isISODate, parsePeriod, periodLabel, currentPeriod, absenceStreaks } from '@/lib/format';
import { fixImportedPhone, intlPhone, phoneKey, waUrl } from '@/lib/phone';
import { installmentPlan } from '@/lib/charges';
import { allocateUsage, expiryAfterCancellations, packageBalance, packageReminderText, shouldRemindPackage, suggestedExpiry } from '@/lib/packages';
import { slotOccursOn } from '@/lib/schedule';
import { familySuggestions } from '@/lib/families';
import { slotConflicts } from '@/lib/groups';
import { familyReference, ipsPayload, studentReference } from '@/lib/ips';
import { trialReminderDue } from '@/lib/billing';
import { isTrialOutcome, trialStats, trialsByTeacher } from '@/lib/trials';
import { NO_TEACHER, isWithTeacher, studentsPerTeacher, teacherIdsOf } from '@/lib/students';

const charges: MatchCharge[] = [
  { id: 'ana-10', period: '2026-10', remaining: 4000, first_name: 'Ana', last_name: 'Petrović', parent_name: 'Marija Petrović', ref_no: 1042 },
  { id: 'ana-11', period: '2026-11', remaining: 4000, first_name: 'Ana', last_name: 'Petrović', parent_name: 'Marija Petrović', ref_no: 1042 },
  { id: 'luka-11', period: '2026-11', remaining: 3150, first_name: 'Luka', last_name: 'Ilić', parent_name: 'Dragan Ilić', ref_no: 1043 },
  { id: 'mina-11', period: '2026-11', remaining: 4500, first_name: 'Mina', last_name: 'Đorđević', parent_name: 'Jelena Đorđević', ref_no: 1044, family: 'f1' },
  { id: 'vuk-11', period: '2026-11', remaining: 4500, first_name: 'Vuk', last_name: 'Đorđević', parent_name: 'Jelena Đorđević', ref_no: 1045, family: 'f1' },
];
const r = (payer: string, purpose: string, reference: string, amount: number): StatementRow => ({ date: '2026-11-05', amount, payer, purpose, reference });

describe('uparivanje izvoda', () => {
  it('prepoznaje poziv na broj, broj učenika i imena', () => {
    const res = matchRows([
      r('PETROVIC MARIJA', 'Clanarina', '00 1042-202611', 4000),
      r('ILIC DRAGAN BEOGRAD', 'uplata 1043', '', 3150),
      r('Jelena Djordjevic', 'Mina Djordjevic novembar', '', 4500),
      r('Jelena Đorđević', 'članarina Vuk', '', 4500),
      r('Petar Marković', 'pozajmica', '', 12000),
      r('Neko', 'isplata', '', -500),
    ], charges);
    expect(res.map((x) => x.chargeId)).toEqual(['ana-11', 'luka-11', 'mina-11', 'vuk-11', null]);
  });
  it('dvoje dece bez imena traži proveru', () => {
    const amb = matchRows([r('Jelena Djordjevic', 'novembar', '', 4500)], charges)[0];
    expect(amb.score).toBeLessThan(55);
    expect(amb.reason).toContain('više');
  });
  it('poziv na broj bez crte se prepoznaje', () => {
    expect(matchRows([r('X', '', '1042202611', 4000)], charges)[0]).toMatchObject({ chargeId: 'ana-11', reason: 'poziv na broj' });
    expect(matchRows([r('X', '', '00 1042202611', 4000)], charges)[0].chargeId).toBe('ana-11');
  });
  it('tuđi duži broj nije isti učenik (11042-202611)', () => {
    expect(matchRows([r('X', '', '11042-202611', 4000)], charges)[0].chargeId).toBeNull();
  });
  it('godina u svrsi nije broj učenika', () => {
    const c = [{ ...charges[0], id: 'x', ref_no: 2026, first_name: 'Mika', last_name: 'Lazić', parent_name: null }];
    expect(matchRows([r('Neko Drugi', 'racun 2026', '', 4000)], c)[0].chargeId).toBeNull();
    expect(matchRows([r('Neko Drugi', '', '2026-202610', 4000)], c)[0].chargeId).toBe('x');
  });
  it('veća uplata se raspoređuje na starija dugovanja istog učenika', () => {
    const res = matchRows([r('X', '', '1042-202611', 8000)], charges)[0];
    expect(res.allocations).toEqual([{ chargeId: 'ana-11', amount: 4000 }, { chargeId: 'ana-10', amount: 4000 }]);
    expect(res.leftover).toBe(0);
  });
  it('uplata za dvoje dece iz iste porodice se deli, a višak ostaje kao avans', () => {
    const res = matchRows([r('X', '', '1044-000000', 10000)], charges)[0];
    expect(res.allocations).toEqual([{ chargeId: 'mina-11', amount: 4500 }, { chargeId: 'vuk-11', amount: 4500 }]);
    expect(res.leftover).toBe(1000);
  });
  it('dva reda istog imena idu na dva različita meseca', () => {
    const res = matchRows([r('Marija Petrović', 'Ana Petrović', '', 4000), r('Marija Petrović', 'Ana Petrović', '', 4000)], charges);
    expect(res.map((x) => x.chargeId).sort()).toEqual(['ana-10', 'ana-11']);
  });
  it('isti red izvoda ima isti ključ, a dva ista reda u jednom izvodu dobijaju različit', () => {
    const a = r('Ana', 'x', '1', 100);
    expect(statementKeys([a])[0]).toBe(statementKeys([{ ...a }])[0]);
    const [k1, k2] = statementKeys([a, { ...a }]);
    expect(k1).not.toBe(k2);
  });
  it('raspodela ne ide na tuđe dete bez porodice', () => {
    const { allocations, leftover } = suggestAllocation(5000, charges[2], charges);
    expect(allocations).toEqual([{ chargeId: 'luka-11', amount: 3150 }]);
    expect(leftover).toBe(1850);
  });
});

describe('čitanje izvoda', () => {
  it.each([
    ['4.000', 4000], ['4.000,00', 4000], ['4,000.00', 4000], ['4000', 4000], ['4000,5', 4000.5], ['4000.5', 4000.5],
    ['1.234.567,89', 1234567.89], ['12.50', 12.5], ['4,000', 4000], ['-500,00', -500], ['RSD 2.990,00', 2990], ['', 0],
  ])('iznos %s', (input, expected) => expect(toAmount(input)).toBe(expected));
  it('broj iz Excel-a ostaje isti', () => expect(toAmount(1234.5)).toBe(1234.5));
  it('datumi', () => {
    expect(toDate('5.11.2026.')).toBe('2026-11-05');
    expect(toDate('2026-11-05 10:00')).toBe('2026-11-05');
    expect(toDate('')).toBeNull();
  });
  it('kolona Uplatilac nije iznos', () => {
    const m = mapStatementColumns(['Datum', 'Uplatilac', 'Svrha', 'Poziv na broj', 'Iznos uplate']);
    expect(m).toMatchObject({ date: 0, payer: 1, purpose: 2, reference: 3, amount: 4 });
  });
});

describe('format', () => {
  it('neispravan mesec postaje tekući, a periodLabel ne pada', () => {
    expect(parsePeriod('2026-13')).toBe(currentPeriod());
    expect(parsePeriod('2026-00')).toBe(currentPeriod());
    expect(parsePeriod('2026-11')).toBe('2026-11');
    expect(periodLabel('2026-13')).toBe('2026-13');
    expect(periodLabel('2026-11')).toBe('Novembar 2026.');
  });
  it('datum mora da postoji', () => {
    expect(isISODate('2026-02-31')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate(null)).toBe(false);
  });
  it('opravdani izostanci se ne računaju u procenat', () => {
    expect(attendanceStats([{ status: 'present' }, { status: 'absent' }, { status: 'excused' }])).toEqual({ present: 1, absent: 1, excused: 1, counted: 2, pct: 50 });
    expect(attendanceStats([{ status: 'excused' }]).pct).toBeNull();
  });
  it('niz izostanaka', () => {
    const rows = [{ student_id: 'a', status: 'absent', date: '2026-11-03' }, { student_id: 'a', status: 'excused', date: '2026-11-02' }, { student_id: 'a', status: 'absent', date: '2026-11-01' }, { student_id: 'a', status: 'present', date: '2026-10-30' }];
    expect(absenceStreaks(rows)[0].streak).toBe(2);
  });
});

describe('telefon', () => {
  it.each([
    ['0641234567', '381641234567'], ['+381 64 123 4567', '381641234567'], ['00381641234567', '381641234567'], ['381641234567', '381641234567'], ['641234567', '381641234567'], ['064/123-45-67', '381641234567'], ['', ''],
  ])('%s', (input, expected) => expect(intlPhone(input)).toBe(expected));
  it('Excel broj dobija nulu', () => {
    expect(fixImportedPhone(641234567)).toBe('0641234567');
    expect(fixImportedPhone('0641234567')).toBe('0641234567');
    expect(fixImportedPhone('+381641234567')).toBe('+381641234567');
    expect(fixImportedPhone(null)).toBeNull();
  });
  it('isti broj u različitim zapisima', () => expect(phoneKey('064 123 4567')).toBe(phoneKey('+381641234567')));
  it('WhatsApp link', () => expect(waUrl('0641234567', 'a b')).toBe('https://wa.me/381641234567?text=a%20b'));
});

describe('rate i paketi', () => {
  it('rate daju tačan zbir i prelaze u novu godinu', () => {
    const plan = installmentPlan(10000, 3, '2026-11');
    expect(plan.map((p) => p.period)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(plan.reduce((a, p) => a + p.amount, 0)).toBe(10000);
  });
  const pkg = { student_id: 's', group_id: 'g', classes_total: 8, purchased_at: '2026-10-01', expires_at: null };
  it('paket: ostaje kupljeno minus odslušano od kupovine', () => {
    const presence = [{ student_id: 's', group_id: 'g', date: '2026-09-30' }, { student_id: 's', group_id: 'g', date: '2026-10-02' }, { student_id: 's', group_id: 'g', date: '2026-10-09' }];
    expect(packageBalance([pkg], presence, '2026-11-05')).toEqual({ total: 8, used: 2, remaining: 6, expired: false });
  });
  it('istekao paket se ne računa', () => {
    expect(packageBalance([{ ...pkg, expires_at: '2026-10-31' }], [], '2026-11-05')).toEqual({ total: 0, used: 0, remaining: 0, expired: true });
  });
});

describe('porodice i termini', () => {
  const s = (id: string, phone: string | null, family: string | null = null) => ({ id, first_name: id, last_name: '', parent_phone: phone, parent_email: null, family_id: family });
  it('isti telefon je predlog, a već povezana porodica nije', () => {
    expect(familySuggestions([s('a', '0641234567'), s('b', '+381641234567'), s('c', '0651111111')]).map((l) => l.map((x) => x.id))).toEqual([['a', 'b']]);
    expect(familySuggestions([s('a', '0641234567', 'f'), s('b', '0641234567', 'f')])).toEqual([]);
  });
  const other = { weekday: 1, start_time: '17:00:00', end_time: '18:00:00', room_id: 'r1', teacher_id: 't1', group_name: 'A' };
  it('preklapanje sale i predavača', () => {
    expect(slotConflicts({ weekday: 1, start_time: '17:30', end_time: '18:30', room_id: 'r1', teacher_id: null }, [other])[0]).toContain('sala');
    expect(slotConflicts({ weekday: 1, start_time: '17:30', end_time: '18:30', room_id: 'r2', teacher_id: 't1' }, [other])[0]).toContain('predavač');
    expect(slotConflicts({ weekday: 1, start_time: '18:00', end_time: '19:00', room_id: 'r1', teacher_id: 't1' }, [other])).toEqual([]);
    expect(slotConflicts({ weekday: 2, start_time: '17:00', end_time: '18:00', room_id: 'r1', teacher_id: 't1' }, [other])).toEqual([]);
  });
  const bi = { weekday: 7, start_time: '18:00', end_time: '19:00', room_id: 'r1', teacher_id: 't1', group_name: 'Radionica', recurrence: 'biweekly' as const };
  it('dva termina svake druge nedelje se ne preklapaju ako padaju u suprotne nedelje', () => {
    expect(slotConflicts({ ...bi, anchor_date: '2026-11-08' }, [{ ...bi, anchor_date: '2026-11-15', group_name: 'Stariji' }])).toEqual([]);
    expect(slotConflicts({ ...bi, anchor_date: '2026-11-08' }, [{ ...bi, anchor_date: '2026-11-22', group_name: 'Stariji' }])[0]).toContain('sala');
  });
});

describe('paketi časova', () => {
  it('rok je 10 nedelja za jedan čas nedeljno, 5 za dva, 8 za radionicu svake druge nedelje', () => {
    expect(suggestedExpiry('2026-01-05', 10, 1)).toBe('2026-03-16');
    expect(suggestedExpiry('2026-01-05', 10, 2)).toBe('2026-02-09');
    expect(suggestedExpiry('2026-01-05', 4, 0.5)).toBe('2026-03-02');
  });
  it('otkazan čas bez nadoknade produžava rok za nedelju dana', () => {
    expect(expiryAfterCancellations('2026-01-05', 10, 1, ['2026-01-12', '2026-04-01'])).toBe('2026-03-23');
  });
  it('stariji paket prvi troši održane časove', () => {
    const used = allocateUsage(
      [
        { id: 'a', classes_total: 2, purchased_at: '2026-01-01', expires_at: '2026-03-01' },
        { id: 'b', classes_total: 2, purchased_at: '2026-02-01', expires_at: '2026-04-01' },
      ],
      [
        { session_id: '1', date: '2026-01-10' },
        { session_id: '2', date: '2026-01-17' },
        { session_id: '3', date: '2026-02-10' },
      ],
    );
    expect(used.get('a')).toBe(2);
    expect(used.get('b')).toBe(1);
  });
  it('podsetnik ide kad je ostao tačno jedan čas', () => {
    expect(shouldRemindPackage(9, 10, false)).toBe(true);
    expect(shouldRemindPackage(8, 10, false)).toBe(false);
    expect(shouldRemindPackage(1, 1, false)).toBe(false);
    expect(shouldRemindPackage(9, 10, true)).toBe(false);
  });
  it('čas svake druge nedelje pada samo u parnim nedeljama od primera', () => {
    const slot = { weekday: 7, recurrence: 'biweekly', anchor_date: '2026-11-08' };
    expect(slotOccursOn('2026-11-08', slot)).toBe(true);
    expect(slotOccursOn('2026-11-15', slot)).toBe(false);
    expect(slotOccursOn('2026-11-22', slot)).toBe(true);
    expect(slotOccursOn('2026-11-09', slot)).toBe(false);
  });
  it('tekst podsetnika sadrži uputstvo za uplatu', () => {
    const text = packageReminderText({ school: 'Škola', student: 'Ana', used: 9, total: 10, price: 250, currency: 'EUR', instructions: 'PayPal: skola@example.com', bankAccount: null, link: null });
    expect(text).toContain('PayPal: skola@example.com');
    expect(text).toContain('250 EUR');
  });
});

describe('IPS QR', () => {
  it('sadrži račun, iznos i poziv na broj', () => {
    const p = ipsPayload({ account: '160-5100000000-99', payee: 'Škola', amount: 4000, purpose: 'Clanarina', reference: studentReference(1042, '2026-11') })!;
    expect(p).toContain('R:160000510000000099');
    expect(p).toContain('I:RSD4000,00');
    expect(p).toContain('RO:001042-202611');
  });
  it('poziv za ceo dug prepoznaje uparivanje', () => {
    expect(familyReference(1042)).toBe('1042-000000');
  });
});

describe('podsetnik za probni period', () => {
  const due = (trial_ends_at: string | null, trial_reminder_key: string | null = null, status: 'trial' | 'active' = 'trial') => trialReminderDue({ status, trial_ends_at, trial_reminder_key }, '2026-06-15');
  it('javlja se 3 dana pre isteka i posle isteka', () => {
    expect(due('2026-06-19')).toBeNull();
    expect(due('2026-06-18')).toMatchObject({ kind: 'soon', days: 3, key: '2026-06-18:soon' });
    expect(due('2026-06-15')).toMatchObject({ kind: 'soon', days: 0 });
    expect(due('2026-06-14')).toMatchObject({ kind: 'ended', days: -1, key: '2026-06-14:ended' });
    expect(due('2026-06-12')).toMatchObject({ kind: 'ended' });
    expect(due('2026-06-11')).toBeNull();
  });
  it('isti podsetnik ide samo jednom, a produžen period ga dobija ponovo', () => {
    expect(due('2026-06-16', '2026-06-16:soon')).toBeNull();
    expect(due('2026-06-14', '2026-06-14:ended')).toBeNull();
    expect(due('2026-06-14', '2026-06-14:soon')).toMatchObject({ kind: 'ended' });
    expect(due('2026-06-17', '2026-06-16:ended')).toMatchObject({ kind: 'soon' });
  });
  it('samo za škole u probnom periodu', () => {
    expect(due('2026-06-16', null, 'active')).toBeNull();
    expect(due(null)).toBeNull();
  });
});

describe('probni časovi', () => {
  const rows = [
    { outcome: 'enrolled', teacher_id: 't1' },
    { outcome: 'enrolled', teacher_id: 't1' },
    { outcome: 'declined', teacher_id: 't1' },
    { outcome: 'pending', teacher_id: 't2' },
    { outcome: 'declined', teacher_id: null },
  ];
  it('broji ishode, a procenat računa samo od onih sa ishodom', () => {
    expect(trialStats(rows)).toEqual({ total: 5, enrolled: 2, declined: 2, pending: 1, pct: 50 });
    expect(trialStats([{ outcome: 'pending' }])).toEqual({ total: 1, enrolled: 0, declined: 0, pending: 1, pct: null });
    expect(trialStats([])).toEqual({ total: 0, enrolled: 0, declined: 0, pending: 0, pct: null });
  });
  it('deli brojke po predavaču, od onoga sa najviše probnih', () => {
    const out = trialsByTeacher(rows, new Map([['t1', 'Jelena']]));
    expect(out.map((t) => [t.name, t.total, t.enrolled, t.declined, t.pending, t.pct])).toEqual([
      ['Jelena', 3, 2, 1, 0, 67],
      ['Bez predavača', 1, 0, 1, 0, 0],
      ['Bivši korisnik', 1, 0, 0, 1, null],
    ]);
  });
  it('prihvata samo poznate ishode', () => {
    expect(['pending', 'enrolled', 'declined'].every(isTrialOutcome)).toBe(true);
    expect(isTrialOutcome('maybe')).toBe(false);
    expect(isTrialOutcome(null)).toBe(false);
  });
});

describe('učenici po predavaču', () => {
  const g = (teacher_id: string | null, active = true) => ({ groups: { teacher_id, active } });
  const ana = { group_members: [g('milica'), g('milica'), g('jovana')] };
  const luka = { group_members: [g('milica')] };
  const mina = { group_members: [g(null)] };
  const vuk = { group_members: [] };
  const sara = { group_members: [g('jovana', false), { groups: null }] };
  it('učenik se vodi kod predavača svake svoje aktivne grupe, jednom', () => {
    expect(teacherIdsOf(ana)).toEqual(['milica', 'jovana']);
    expect(teacherIdsOf(sara)).toEqual([]); // Arhivirana grupa se ne računa.
    expect(isWithTeacher(ana, 'jovana')).toBe(true);
    expect(isWithTeacher(luka, 'jovana')).toBe(false);
  });
  it('bez predavača su učenici bez grupe ili u grupi bez predavača', () => {
    expect([ana, luka, mina, vuk, sara].map((s) => isWithTeacher(s, NO_TEACHER))).toEqual([false, false, true, true, true]);
  });
  it('broji učenike po predavaču', () => {
    expect([...studentsPerTeacher([ana, luka, mina, vuk, sara])].sort()).toEqual([[NO_TEACHER, 3], ['jovana', 1], ['milica', 2]]);
  });
});
