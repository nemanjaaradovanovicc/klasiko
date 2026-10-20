// node --experimental-strip-types scripts/match-test.ts
import { matchRows, type MatchCharge, type StatementRow } from '../src/lib/match.ts';

const charges: MatchCharge[] = [
  { id: 'ana-10', period: '2026-10', remaining: 4000, first_name: 'Ana', last_name: 'Petrović', parent_name: 'Marija Petrović', ref_no: 1042 },
  { id: 'ana-11', period: '2026-11', remaining: 4000, first_name: 'Ana', last_name: 'Petrović', parent_name: 'Marija Petrović', ref_no: 1042 },
  { id: 'luka-11', period: '2026-11', remaining: 3150, first_name: 'Luka', last_name: 'Ilić', parent_name: 'Dragan Ilić', ref_no: 1043 },
  { id: 'mina-11', period: '2026-11', remaining: 4500, first_name: 'Mina', last_name: 'Đorđević', parent_name: 'Jelena Đorđević', ref_no: 1044 },
  { id: 'vuk-11', period: '2026-11', remaining: 4500, first_name: 'Vuk', last_name: 'Đorđević', parent_name: 'Jelena Đorđević', ref_no: 1045 },
];
const r = (payer: string, purpose: string, reference: string, amount: number): StatementRow => ({ date: '2026-11-05', amount, payer, purpose, reference });
const rows = [
  r('PETROVIC MARIJA', 'Clanarina', '00 1042-202611', 4000),        // tačan poziv na broj → ana-11
  r('ILIC DRAGAN BEOGRAD', 'uplata 1043', '', 3150),                 // broj učenika u svrsi → luka-11
  r('Jelena Djordjevic', 'Mina Djordjevic novembar', '', 4500),     // ime deteta bez kvačica → mina-11
  r('Jelena Đorđević', 'članarina Vuk', '', 4500),                   // roditelj + ime → vuk-11
  r('Petar Marković', 'pozajmica', '', 12000),                       // nepoznato
  r('Neko', 'isplata', '', -500),                                     // isplata se preskače
];
const amb = matchRows([r('Jelena Djordjevic', 'novembar', '', 4500)], charges)[0];
console.log(amb.score < 55 && amb.reason.includes('više') ? '✓ dvoje dece bez imena: traži proveru' : '✗ dvoje dece: ' + JSON.stringify(amb));
const res = matchRows(rows, charges);
const expect = ['ana-11', 'luka-11', 'mina-11', 'vuk-11', null];
let bad = 0;
res.forEach((x, i) => {
  const ok = x.chargeId === expect[i];
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${x.row.payer.padEnd(22)} → ${x.chargeId ?? '—'} (${x.reason}, ${x.score})`);
});
console.log(res.length === 5 ? '✓ isplata preskočena' : '✗ isplata nije preskočena');
console.log(bad || res.length !== 5 ? 'NEUSPEH' : 'Sve provere uparivanja su prošle');
