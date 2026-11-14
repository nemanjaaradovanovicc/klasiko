import { describe, expect, it } from 'vitest';
import { LIMITS, canEditQuestionnaire, canEditStudentRecord, parseQuestionnaire } from '@/lib/questionnaire';

const open = { sameOrg: true, teachesStudent: false, hasActiveDropIn: false };

describe('pravo na upitnik', () => {
  it('vlasnik škole menja upitnik i karton', () => {
    expect(canEditQuestionnaire({ isOwner: true }, open)).toBe(true);
    expect(canEditStudentRecord({ isOwner: true })).toBe(true);
  });

  it('vlasnik druge škole ne menja ništa', () => {
    expect(canEditQuestionnaire({ isOwner: true }, { ...open, sameOrg: false })).toBe(false);
  });

  it('predavač svog učenika menja samo upitnik', () => {
    const access = { sameOrg: true, teachesStudent: true, hasActiveDropIn: false };
    expect(canEditQuestionnaire({ isOwner: false }, access)).toBe(true);
    expect(canEditStudentRecord({ isOwner: false })).toBe(false);
  });

  it('predavač otvorene grupe menja upitnik učenika koje vidi', () => {
    expect(canEditQuestionnaire({ isOwner: false }, { sameOrg: true, teachesStudent: false, hasActiveDropIn: true })).toBe(true);
  });

  it('predavač bez grupe i bez otvorene grupe ne menja upitnik', () => {
    expect(canEditQuestionnaire({ isOwner: false }, open)).toBe(false);
    expect(canEditQuestionnaire({ isOwner: false }, { sameOrg: false, teachesStudent: true, hasActiveDropIn: true })).toBe(false);
  });
});

describe('validacija upitnika', () => {
  it('prihvata prazan upitnik i skraćuje razmake', () => {
    const res = parseQuestionnaire({ parent_name: '  ', photo_consent: '', serbian_level: '' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.parent_name).toBeNull();
    expect(res.value.photo_consent).toBeNull();
    expect(res.value.serbian_level).toBeNull();
    expect(res.value.desired_lessons).toEqual([]);
  });

  it('prihvata nivo, pismo, porodicu, časove i saglasnost', () => {
    const res = parseQuestionnaire({
      serbian_level: 'pocetni',
      serbian_level_note: 'uči ćirilicu',
      family_type: 'dvojezicna',
      knows_local_script: 'delimicno',
      knows_latin: 'DA',
      knows_cyrillic: 'ne',
      desired_lessons: ['oba', '1_individualni', 'oba'],
      photo_consent: 'DA',
      parent_email: 'mama@example.com',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.serbian_level).toBe('pocetni');
    expect(res.value.family_type).toBe('dvojezicna');
    expect(res.value.knows_local_script).toBe('delimicno');
    expect(res.value.knows_latin).toBe('da');
    expect(res.value.desired_lessons).toEqual(['1_individualni', 'oba']);
    expect(res.value.photo_consent).toBe('da');
  });

  it('odbija nepoznat nivo, pismo, porodicu, čas i saglasnost', () => {
    expect(parseQuestionnaire({ serbian_level: 'a1' })).toEqual({ ok: false, error: 'Nivo srpskog nije prepoznat.' });
    expect(parseQuestionnaire({ family_type: 'cetiri' })).toEqual({ ok: false, error: 'Tip porodice nije prepoznat.' });
    expect(parseQuestionnaire({ knows_cyrillic: 'mozda' })).toEqual({ ok: false, error: 'Odgovor o pismu nije prepoznat.' });
    expect(parseQuestionnaire({ desired_lessons: ['vikend'] })).toEqual({ ok: false, error: 'Željeni časovi nisu prepoznati.' });
    expect(parseQuestionnaire({ photo_consent: 'mozda' })).toEqual({ ok: false, error: 'Saglasnost za fotografisanje može biti samo DA ili NE.' });
  });

  it('odbija loš email i predugačak tekst', () => {
    expect(parseQuestionnaire({ parent_email: 'nije-email' })).toEqual({ ok: false, error: 'Email roditelja nije ispravan.' });
    expect(parseQuestionnaire({ parent_name: 'a'.repeat(LIMITS.parentName + 1) }).ok).toBe(false);
    expect(parseQuestionnaire({ messenger_phone: '1'.repeat(LIMITS.phone + 1) }).ok).toBe(false);
    expect(parseQuestionnaire({ learning_style: 'a'.repeat(LIMITS.long + 1) }).ok).toBe(false);
    const ok = parseQuestionnaire({ parent_name: 'a'.repeat(LIMITS.parentName), messenger_phone: '064 111 2233' });
    expect(ok.ok).toBe(true);
  });
});
