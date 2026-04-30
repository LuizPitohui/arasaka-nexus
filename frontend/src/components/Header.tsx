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

import Brand from '@/components/Brand';
import { ApiError, api, auth, tokenStore } from '@/lib/api';

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
    <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-zinc-900">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <Link href="/" aria-label="Arasaka Nexus — Home">
          <Brand size={20} />
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-[11px] uppercase tracking-widest text-zinc-400">
          <NavLink href="/popular" current={pathname}>
            <Flame className="w-3.5 h-3.5" /> Populares
          </NavLink>
          <NavLink href="/latest" current={pathname}>
            <Clock className="w-3.5 h-3.5" /> Últimos
          </NavLink>
          <NavLink href="/genres" current={pathname}>
            <Tag className="w-3.5 h-3.5" /> Gêneros
          </NavLink>
          <NavLink href="/random" current={pathname}>
            <Shuffle className="w-3.5 h-3.5" /> Random
          </NavLink>
          {authed && (
            <NavLink href="/library" current={pathname}>
              <Library className="w-3.5 h-3.5" /> Biblioteca
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {authed ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"
                title="Perfil"
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline">{me?.username ?? 'agent'}</span>
              </Link>
              <button
                onClick={onLogout}
                className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
            >
              <LogIn className="w-4 h-4" /> Entrar
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
  children,
}: {
  href: string;
  current: string;
  children: React.ReactNode;
}) {
  const active = current === href;
  return (
    <Link
      href={href}
      className={`flex items-center gap-1 transition-colors ${
        active ? 'text-red-500' : 'hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
