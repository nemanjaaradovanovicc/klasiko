import { describe, expect, it } from 'vitest';
import { matchRows, matchesSearch, statementKeys, suggestAllocation, type MatchCharge, type StatementRow } from '@/lib/match';
import { mapStatementColumns, toAmount, toDate } from '@/lib/statement';
import { attendanceStats, isISODate, parsePeriod, periodLabel, currentPeriod, absenceStreaks } from '@/lib/format';
import { fixImportedPhone, intlPhone, phoneKey, waUrl } from '@/lib/phone';
import { installmentPlan } from '@/lib/charges';
import { packageBalance } from '@/lib/packages';
import { familySuggestions } from '@/lib/families';
import { slotConflicts } from '@/lib/groups';
import { familyReference, ipsPayload, studentReference } from '@/lib/ips';

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
