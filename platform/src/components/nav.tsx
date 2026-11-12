'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Users, UsersRound, CalendarDays, CheckSquare, Wallet, BarChart3, Settings, Shield, Menu, X, LogOut, Receipt, HeartHandshake, ScanLine, Megaphone, ScrollText, Package, Sparkles,
} from 'lucide-react';

const ICONS = { LayoutDashboard, Users, UsersRound, CalendarDays, CheckSquare, Wallet, BarChart3, Settings, Shield, Receipt, HeartHandshake, ScanLine, Megaphone, ScrollText, Package, Sparkles } as const;
export type IconName = keyof typeof ICONS;
export interface NavItem { href: string; label: string; icon: IconName; mobile?: boolean }

function Pending({ dark = false }: { dark?: boolean }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`ml-auto h-4 w-4 rounded-full border-2 border-t-transparent ${dark ? 'border-white/80' : 'border-brand'} ${pending ? 'animate-spin opacity-100' : 'opacity-0'}`} />;
}

function matches(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

// Aktivna je samo stavka sa najdužim poklapanjem (npr. /admin/naplata, a ne i /admin).
function activeHref(path: string, items: NavItem[]) {
  return items.filter((i) => matches(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function SideNav({ items, footer }: { items: NavItem[]; footer: React.ReactNode }) {
  const path = usePathname();
  const current = activeHref(path, items);
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = current === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold transition ${active ? 'bg-white text-brand shadow-sm' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}
          >
            <Icon size={19} strokeWidth={2.2} />
            {it.label}
            <Pending dark={!active} />
          </Link>
        );
      })}
      <div className="mt-auto pt-4">{footer}</div>
    </nav>
  );
}

function MobilePending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand transition-opacity ${pending ? 'animate-pulse opacity-100' : 'opacity-0'}`} />;
}

export function MobileNav({ items, footer }: { items: NavItem[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = activeHref(path, items);
  const main = items.filter((i) => i.mobile).slice(0, 4);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${main.length + 1}, minmax(0, 1fr))` }}>
        {main.map((it) => {
          const Icon = ICONS[it.icon];
          const active = current === it.href;
          return (
            <Link key={it.href} href={it.href} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold ${active ? 'text-brand' : 'text-mut'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {it.label}
              <MobilePending />
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold text-mut">
          <Menu size={22} />
          Više
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[17px] font-extrabold text-ink">Meni</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-mut hover:bg-soft" aria-label="Zatvori">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.map((it) => {
                const Icon = ICONS[it.icon];
                return (
                  <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-[15px] font-bold ${current === it.href ? 'bg-soft-2 text-brand' : 'bg-soft text-ink'}`}>
                    <Icon size={19} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}

export function LogoutButton({ dark = false }: { dark?: boolean }) {
  return (
    <form action="/odjava" method="post">
      <button className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-bold ${dark ? 'text-white/80 hover:bg-white/10' : 'bg-soft text-mut hover:text-brand'}`}>
        <LogOut size={18} />
        Odjavi se
      </button>
    </form>
  );
}
