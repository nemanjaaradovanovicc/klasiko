export type Role = 'superadmin' | 'owner' | 'teacher';
export type OrgStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type Plan = 'start' | 'rast' | 'pro';
export type Billing = 'monthly' | 'yearly' | 'lifetime';

export interface Organization {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  pib: string | null;
  mb: string | null;
  bank_account: string | null;
  payee_name: string | null;
  fee_due_day: number;
  default_fee: number | null;
  plan: Plan;
  billing: Billing;
  status: OrgStatus;
  trial_ends_at: string | null;
  paid_until: string | null;
  admin_notes: string | null;
  billing_name: string | null;
  billing_address: string | null;
  auto_charges: boolean;
  auto_charge_day: number;
  auto_reminders: boolean;
  reminder_days_before: number;
  sibling_discount_pct: number;
  terms_accepted_at: string | null;
  source: 'admin' | 'self';
  admin_seen_at: string | null;
  trial_reminder_key: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string | null;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  must_change_password: boolean;
  active: boolean;
}

export interface Student {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  notes: string | null;
  discount_pct: number;
  custom_fee: number | null;
  active: boolean;
  joined_at: string;
  left_at: string | null;
  ref_no: number;
  checkin_code: string | null;
  family_id: string | null;
}

export interface Group {
  id: string;
  org_id: string;
  name: string;
  level: string | null;
  teacher_id: string | null;
  room_id: string | null;
  monthly_fee: number | null;
  capacity: number | null;
  color: string;
  active: boolean;
  fee_type: FeeType;
  package_classes: number | null;
}

export type FeeType = 'monthly' | 'package' | 'manual';
export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  monthly: 'Mesečna članarina',
  package: 'Paket časova',
  manual: 'Polugodište ili rate (ručno)',
};

export interface Room {
  id: string;
  org_id: string;
  name: string;
  capacity: number | null;
}

export interface Slot {
  id: string;
  org_id: string;
  group_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room_id: string | null;
}

export const KINDS: Record<string, string> = {
  skola_jezika: 'Škola jezika',
  plesna_skola: 'Plesna škola',
  borilacke: 'Klub borilačkih veština',
  sportski_klub: 'Sportski klub',
  edukativni_centar: 'Edukativni centar',
  vrtic: 'Privatni vrtić',
  muzicka_skola: 'Muzička škola',
  ostalo: 'Ostalo',
};

export const PLANS: Record<Plan, { name: string; monthly: number; yearly: number; lifetime: number | null; students: number | null; teachers: number | null }> = {
  start: { name: 'Start', monthly: 2990, yearly: 29900, lifetime: null, students: 50, teachers: 2 },
  rast: { name: 'Rast', monthly: 5990, yearly: 59900, lifetime: 149000, students: 200, teachers: 10 },
  pro: { name: 'Pro', monthly: 9990, yearly: 99900, lifetime: 249000, students: null, teachers: null },
};

export const STATUS_LABEL: Record<OrgStatus, string> = {
  trial: 'Probni period',
  active: 'Aktivna',
  suspended: 'Pauzirana',
  cancelled: 'Otkazana',
};

export const BILLING_LABEL: Record<Billing, string> = {
  monthly: 'Mesečno',
  yearly: 'Godišnje',
  lifetime: 'Lifetime',
};

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Admin Klasika',
  owner: 'Vlasnik',
  teacher: 'Predavač',
};

export interface PlatformSettings {
  issuer_name: string;
  issuer_address: string | null;
  issuer_city: string | null;
  issuer_pib: string | null;
  issuer_mb: string | null;
  bank_name: string | null;
  bank_account: string | null;
  email: string | null;
  phone: string | null;
  invoice_note: string | null;
  payment_days: number;
  billing_day: number;
}

export interface InvoiceItem { description: string; qty: number; price: number }
export interface InvoiceBuyer { name: string; address?: string | null; city?: string | null; pib?: string | null; mb?: string | null; email?: string | null; phone?: string | null }

export interface Invoice {
  id: string;
  org_id: string;
  number: string;
  issue_date: string;
  service_date: string;
  due_date: string | null;
  place: string;
  buyer: InvoiceBuyer;
  items: InvoiceItem[];
  total: number;
  status: 'issued' | 'paid' | 'cancelled';
  paid_at: string | null;
  note: string | null;
  plan: Plan | null;
  billing: Billing | null;
  sent_at: string | null;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
}

export interface SubPayment {
  id: string;
  org_id: string;
  invoice_id: string | null;
  amount: number;
  paid_at: string;
  method: string;
  plan: Plan | null;
  billing: Billing | null;
  paid_until_before: string | null;
  paid_until_after: string | null;
  note: string | null;
}

export const INVOICE_STATUS: Record<Invoice['status'], string> = { issued: 'Čeka uplatu', paid: 'Plaćeno', cancelled: 'Poništeno' };
