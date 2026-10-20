'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, X, UserPlus, CheckSquare, Wallet, UsersRound, Building2, Receipt } from 'lucide-react';

const ICONS = { UserPlus, CheckSquare, Wallet, UsersRound, Building2, Receipt } as const;
export interface QuickAction { href: string; label: string; hint: string; icon: keyof typeof ICONS }

// Plutajuće dugme „+” na telefonu: najčešće radnje u dva dodira.
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  if (actions.length === 0 || path.startsWith('/prisustvo/')) return null;
  return (
    <div className="print:hidden lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Brze akcije"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-coral text-[#3A0F0A] shadow-[0_12px_30px_rgba(255,107,94,0.45)] transition active:scale-95"
      >
        <Plus size={28} strokeWidth={2.6} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-2" />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[17px] font-extrabold text-ink">Brze akcije</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-mut hover:bg-soft" aria-label="Zatvori"><X size={20} /></button>
            </div>
            <div className="flex flex-col gap-2">
              {actions.map((a) => {
                const Icon = ICONS[a.icon];
                return (
                  <Link key={a.href} href={a.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl bg-soft px-4 py-3.5 active:bg-soft-2">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand ring-1 ring-line"><Icon size={20} /></span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-extrabold text-ink">{a.label}</span>
                      <span className="block text-[12px] font-semibold text-mut">{a.hint}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
