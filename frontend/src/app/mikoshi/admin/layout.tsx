'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { auth } from '@/lib/api';

import { BootGate } from './_components';

type GuardState = 'checking' | 'booting' | 'allowed' | 'denied';

export default function MikoshiAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>('checking');
  const [user, setUser] = useState<{ username: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await auth.me();
        if (!alive) return;
        if (!me.is_staff) {
          // 404-like UX: don't leak existence to non-staff
          setState('denied');
          router.replace('/');
          return;
        }
        setUser({ username: me.username });
        setState('booting');
      } catch {
        if (!alive) return;
        setState('denied');
        router.replace('/login?next=' + encodeURIComponent(pathname));
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  if (state === 'checking') {
    return (
      <main className="min-h-[60vh] grid place-items-center text-xs uppercase tracking-[0.3em] text-[var(--fg-muted)] font-mono">
        ◌ checking clearance…
      </main>
    );
  }
  if (state === 'denied') return null;
  if (state === 'booting' && user) {
    return <BootGate username={user.username} onDone={() => setState('allowed')} />;
  }

  return (
    <div className="relative min-h-[80vh]">
      {/* Background grid drift + scanline overlay scoped to the admin */}
      <div className="mikoshi-grid-bg pointer-events-none absolute inset-0 opacity-40" />
      <div className="mikoshi-scan-line pointer-events-none absolute inset-0 opacity-30" />

      <main className="relative px-4 md:px-8 py-6 max-w-[1400px] mx-auto">
        <header className="mb-8 border-b border-[var(--fg-faint)] pb-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--neon-magenta)] font-mono mikoshi-blink">
                ▮ ARASAKA // restricted
              </p>
              <h1 className="text-3xl md:text-4xl font-bold font-mono tracking-tight mt-2 mikoshi-decrypt">
                <span className="text-[var(--fg-primary)]">MIKOSHI</span>
                <span className="text-[var(--neon-cyan)] mx-3">/</span>
                <span className="text-[var(--fg-secondary)] mikoshi-glitch">admin console</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)] font-mono mt-2">
                ALL ACCESS LOGGED · SESSION{' '}
                <span className="text-[var(--neon-cyan)]">
                  {user ? '◉ active' : '◌ idle'}
                </span>
              </p>
            </div>
            <div className="text-right font-mono">
              <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                operator
              </p>
              <p className="text-base text-[var(--neon-cyan)] mt-0.5">
                {user?.username}
                <span className="mikoshi-blink ml-1">▮</span>
              </p>
            </div>
          </div>
        </header>

        <nav className="mb-7 flex gap-px text-[10px] uppercase tracking-[0.3em] font-mono w-fit border border-[var(--fg-faint)] bg-[var(--bg-terminal)]">
          <NavItem href="/mikoshi/admin" label="◢ overview" exact />
          <NavItem href="/mikoshi/admin/sources" label="◢ fontes" />
        </nav>

        {children}

        <footer className="mt-12 pt-5 border-t border-[var(--fg-faint)] text-[9px] uppercase tracking-[0.3em] font-mono text-[var(--fg-faint)] flex justify-between flex-wrap gap-2">
          <span>mikoshi-vault · build {new Date().getFullYear()}</span>
          <span className="mikoshi-blink">◉ telemetry on</span>
        </footer>
      </main>
    </div>
  );
}

function NavItem({
  href,
  label,
  exact = false,
}: {
  href: string;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`px-4 py-2 transition-all duration-200 relative ${
        active
          ? 'bg-[var(--neon-cyan)] text-black'
          : 'text-[var(--fg-secondary)] hover:text-[var(--neon-cyan)] hover:bg-[var(--bg-elevated)]'
      }`}
    >
      {label}
    </Link>
  );
}
