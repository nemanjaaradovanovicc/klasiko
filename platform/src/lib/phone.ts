// Brojevi telefona: jedno mesto za format koji razume WhatsApp i Viber.

export function intlPhone(p: string | null | undefined): string {
  let d = (p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '381' + d.slice(1);
  // Excel često izgubi početnu nulu (641234567).
  if (!d.startsWith('381') && d.length >= 8 && d.length <= 9) d = '381' + d;
  return d;
}

export function waUrl(phone: string | null | undefined, text?: string): string {
  return `https://wa.me/${intlPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// Telefon iz Excel-a: broj bez početne nule vraća u uobičajen oblik (0641234567).
export function fixImportedPhone(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{8,9}$/.test(s) && !s.startsWith('0')) return '0' + s;
  return s;
}

// Ključ za poređenje dva broja (0641234567, +381 64 123 4567 i 381641234567 su isti broj).
export function phoneKey(p: string | null | undefined): string {
  return intlPhone(p);
}
