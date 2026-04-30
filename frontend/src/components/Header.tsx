'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Clock,
  Flame,
  Library,
  LogIn,
  LogOut,
  Shuffle,
  Tag,
  User,
} from 'lucide-react';

import { ApiError, api, auth, tokenStore } from '@/lib/api';
import Brand from './Brand';

type Me = { id: number; username: string; email: string; is_staff: boolean };

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokenStore.getAccess()));
  }, [pathname]);

  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    let cancelled = false;
    api
      .get<Me>('/auth/me/')
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const onLogout = async () => {
    await auth.logout();
    setAuthed(false);
    setMe(null);
    router.push('/');
  };

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid var(--border-faint)',
      }}
    >
      {/* thin red rail */}
      <div
        style={{
          height: 2,
          background:
            'linear-gradient(90deg, transparent, var(--arasaka-red) 20%, var(--arasaka-red) 80%, transparent)',
          opacity: 0.6,
        }}
      />
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <Link href="/">
          <Brand size={18} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink href="/popular" current={pathname} icon={<Flame className="w-3 h-3" />}>
            Populares
          </NavLink>
          <NavLink href="/latest" current={pathname} icon={<Clock className="w-3 h-3" />}>
            Últimos
          </NavLink>
          <NavLink href="/genres" current={pathname} icon={<Tag className="w-3 h-3" />}>
            Gêneros
          </NavLink>
          <NavLink href="/random" current={pathname} icon={<Shuffle className="w-3 h-3" />}>
            Random
          </NavLink>
          {authed && (
            <NavLink
              href="/library"
              current={pathname}
              icon={<Library className="w-3 h-3" />}
            >
              Vault
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {authed ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 mono text-[11px] uppercase tracking-widest"
                style={{ color: 'var(--fg-secondary)' }}
                title="Perfil"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{me?.username ?? 'agent'}</span>
              </Link>
              <button
                onClick={onLogout}
                className="mono text-[11px] uppercase tracking-widest hover:text-[var(--arasaka-red)] transition-colors"
                style={{ color: 'var(--fg-muted)' }}
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 mono text-[11px] uppercase tracking-widest hover:text-white transition-colors"
              style={{ color: 'var(--fg-secondary)' }}
            >
              <LogIn className="w-3.5 h-3.5" /> Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  current,
  icon,
  children,
}: {
  href: string;
  current: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = current === href;
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-1.5 mono text-[11px] uppercase tracking-[0.18em] transition-colors relative"
      style={{
        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
      }}
    >
      {icon}
      {children}
      {active && (
        <span
          style={{
            position: 'absolute',
            bottom: -1,
            left: 8,
            right: 8,
            height: 1,
            background: 'var(--arasaka-red)',
            boxShadow: '0 0 8px var(--arasaka-red)',
          }}
        />
      )}
    </Link>
  );
}
