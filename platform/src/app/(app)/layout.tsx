import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCtx, orgAccess } from '@/lib/auth';
import { SideNav, MobileNav, LogoutButton, type NavItem } from '@/components/nav';
import { ROLE_LABEL } from '@/lib/types';
import { exitOrg } from './admin/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  if (ctx.profile.must_change_password) redirect('/lozinka');

  let items: NavItem[] = [];
  if (ctx.org && ctx.isOwner) {
    items = [
      { href: '/', label: 'Pregled', icon: 'LayoutDashboard', mobile: true },
      { href: '/prisustvo', label: 'Prisustvo', icon: 'CheckSquare', mobile: true },
      { href: '/ucenici', label: 'Učenici', icon: 'Users', mobile: true },
      { href: '/uplate', label: 'Uplate', icon: 'Wallet', mobile: true },
      { href: '/grupe', label: 'Grupe', icon: 'UsersRound' },
      { href: '/raspored', label: 'Raspored', icon: 'CalendarDays' },
      { href: '/izvestaji', label: 'Izveštaji', icon: 'BarChart3' },
      { href: '/podesavanja', label: 'Podešavanja', icon: 'Settings' },
    ];
  } else if (ctx.org) {
    items = [
      { href: '/', label: 'Pregled', icon: 'LayoutDashboard', mobile: true },
      { href: '/prisustvo', label: 'Prisustvo', icon: 'CheckSquare', mobile: true },
      { href: '/raspored', label: 'Raspored', icon: 'CalendarDays', mobile: true },
      { href: '/grupe', label: 'Moje grupe', icon: 'UsersRound', mobile: true },
    ];
  }
  if (ctx.isSuper) items.push({ href: '/admin', label: 'Admin', icon: 'Shield', mobile: !ctx.org });

  const access = ctx.org ? orgAccess(ctx.org) : null;
  const footer = (
    <div className="flex flex-col gap-2">
      <Link href="/lozinka" className="block rounded-xl px-3 py-2 text-[13px] font-semibold text-white/70 hover:bg-white/10">
        <span className="block truncate font-extrabold text-white">{ctx.profile.full_name || ctx.email}</span>
        {ROLE_LABEL[ctx.profile.role]} · promeni lozinku
      </Link>
      <LogoutButton dark />
    </div>
  );
  const mobileFooter = (
    <div className="flex flex-col gap-2">
      <Link href="/lozinka" className="rounded-xl bg-soft px-3 py-2.5 text-[14px] font-bold text-ink">
        {ctx.profile.full_name || ctx.email} · promeni lozinku
      </Link>
      <LogoutButton />
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 bg-brand p-4 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2 pt-1">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white">
            <Image src="/logo.png" alt="" width={40} height={40} />
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-extrabold text-white">Klasiko</span>
            <span className="block truncate text-[12px] font-semibold text-white/70">{ctx.org?.name ?? 'Administracija'}</span>
          </span>
        </Link>
        <SideNav items={items} footer={footer} />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-soft">
            <Image src="/logo.png" alt="" width={34} height={34} />
          </span>
          <span className="min-w-0 truncate text-[16px] font-extrabold text-brand">{ctx.org?.name ?? 'Klasiko admin'}</span>
        </header>

        {ctx.isSuper && ctx.org && (
          <form action={exitOrg} className="flex flex-wrap items-center justify-between gap-2 bg-ink px-4 py-2 text-[13px] font-bold text-white lg:px-8">
            <span>Gledaš školu „{ctx.org.name}” kao admin Klasika</span>
            <button className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Nazad na admin</button>
          </form>
        )}
        {!ctx.isSuper && access?.ok && access.daysLeft !== undefined && ctx.isOwner && (
          <div className="bg-coral-soft px-4 py-2 text-center text-[13px] font-bold text-coral-dark lg:px-8">
            Probni period: još {access.daysLeft} {access.daysLeft === 1 ? 'dan' : 'dana'}.{' '}
            <a className="underline" href="https://wa.me/381638219713?text=Zdravo%2C%20%C5%BEelim%20da%20aktiviram%20Klasiko" target="_blank" rel="noopener">Aktiviraj pretplatu</a>
          </div>
        )}

        <main className="page-in mx-auto max-w-6xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      <MobileNav items={items} footer={mobileFooter} />
    </div>
  );
}
