import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-mut hover:text-brand">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-brand sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] font-semibold text-mut">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          {title && <h2 className="text-[17px] font-extrabold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = 'default', hint }: { label: string; value: ReactNode; tone?: 'default' | 'coral' | 'brand' | 'ok'; hint?: ReactNode }) {
  const tones = {
    default: 'bg-white border border-line',
    coral: 'bg-coral-soft',
    brand: 'bg-brand text-white',
    ok: 'bg-ok-soft',
  } as const;
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <div className={`text-[13px] font-bold ${tone === 'brand' ? 'text-white/80' : tone === 'coral' ? 'text-coral-dark' : 'text-mut'}`}>{label}</div>
      <div className={`mt-1 text-[26px] font-extrabold tabular-nums tracking-tight ${tone === 'coral' ? 'text-coral-dark' : ''}`}>{value}</div>
      {hint && <div className={`mt-0.5 text-[12px] font-semibold ${tone === 'brand' ? 'text-white/70' : 'text-mut'}`}>{hint}</div>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line-2 bg-white px-6 py-10 text-center">
      <div className="text-[17px] font-extrabold text-ink">{title}</div>
      {text && <p className="mx-auto mt-1 max-w-md text-[15px] font-medium text-mut">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'coral' | 'ok' | 'brand' | 'gray' }) {
  const tones = {
    soft: 'bg-soft-2 text-brand',
    coral: 'bg-coral-soft text-coral-dark',
    ok: 'bg-ok-soft text-ok',
    brand: 'bg-brand text-white',
    gray: 'bg-[#EEEAF2] text-[#6b6375]',
  } as const;
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, name, type = 'text', defaultValue, required, placeholder, hint, step, min, max, autoComplete }: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-coral"> *</span>}
      </span>
      <input className="input" name={name} type={type} defaultValue={defaultValue ?? ''} required={required} placeholder={placeholder} step={step} min={min} max={max} autoComplete={autoComplete} />
      {hint && <span className="mt-1 block text-[12px] font-semibold text-mut">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, defaultValue, placeholder, rows = 3 }: { label: string; name: string; defaultValue?: string | null; placeholder?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input" name={name} defaultValue={defaultValue ?? ''} placeholder={placeholder} rows={rows} />
    </label>
  );
}

export function Select({ label, name, defaultValue, options, required, placeholder }: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-coral"> *</span>}
      </span>
      <select className="input" name={name} defaultValue={defaultValue ?? ''} required={required}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div className={`mb-5 rounded-2xl px-4 py-3 text-[15px] font-bold ${err ? 'bg-coral-soft text-coral-dark' : 'bg-ok-soft text-ok'}`} role="status">
      {err || ok}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
