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
  Menu,
  Shuffle,
  Tag,
  User,
  X,
} from 'lucide-react';

import { ApiError, api, auth, tokenStore } from '@/lib/api';
import Brand from './Brand';
import { GlobalSearch } from './GlobalSearch';

type Me = { id: number; username: string; email: string; is_staff: boolean };

const NAV_ITEMS = [
  { href: '/popular', label: 'Populares', icon: Flame },
  { href: '/latest', label: 'Últimos', icon: Clock },
  { href: '/genres', label: 'Gêneros', icon: Tag },
  { href: '/random', label: 'Random', icon: Shuffle },
] as const;

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokenStore.getAccess()));
  }, [pathname]);

  // Close drawer whenever pathname changes (user navigated)
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock scroll while drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

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
    setDrawerOpen(false);
    router.push('/');
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: 'rgba(0,0,0,0.92)',
          borderBottom: '1px solid var(--border-faint)',
        }}
      >
        <div
          style={{
            height: 2,
            background:
              'linear-gradient(90deg, transparent, var(--arasaka-red) 20%, var(--arasaka-red) 80%, transparent)',
            opacity: 0.6,
          }}
        />
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-6 py-3 gap-3">
          {/* Mobile hamburger — left side */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 transition-colors"
            style={{
              color: 'var(--fg-secondary)',
              border: '1px solid var(--border-faint)',
            }}
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center" aria-label="Home">
            <Brand size={18} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  current={pathname}
                  icon={<Icon className="w-3 h-3" />}
                >
                  {item.label}
                </NavLink>
              );
            })}
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

          {/* Global search — inline on desktop, icon-overlay on mobile */}
          <GlobalSearch />

          {/* Right cluster — username/login (hidden on mobile, lives in drawer) */}
          <div className="hidden md:flex items-center gap-3">
            {authed ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 mono text-[11px] uppercase tracking-widest"
                  style={{ color: 'var(--fg-secondary)' }}
                  title="Perfil"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{me?.username ?? 'agent'}</span>
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

          {/* Mobile right cluster — compact icon-only profile/login */}
          <div className="md:hidden flex items-center gap-2">
            {authed ? (
              <Link
                href="/profile"
                className="flex items-center justify-center w-10 h-10"
                style={{
                  color: 'var(--fg-secondary)',
                  border: '1px solid var(--border-faint)',
                }}
                aria-label="Perfil"
              >
                <User className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex items-center justify-center w-10 h-10"
                style={{
                  color: 'var(--arasaka-red)',
                  border: '1px solid var(--arasaka-red)',
                }}
                aria-label="Entrar"
              >
                <LogIn className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname ?? ''}
        authed={authed}
        username={me?.username ?? null}
        onLogout={onLogout}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer
// ---------------------------------------------------------------------------
function MobileDrawer({
  open,
  onClose,
  pathname,
  authed,
  username,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  authed: boolean;
  username: string | null;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Backdrop — inline position to bypass any cascade conflict */}
      <div
        onClick={onClose}
        aria-hidden
        className="md:hidden"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 55,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms var(--ease-out)',
        }}
      />

      {/* Drawer panel — slides from left.
          NOTE: must NOT use the .scanlines utility class here — it sets
          position: relative and overrides Tailwind's `fixed`, dropping the
          drawer back into document flow. Inline `position: fixed` keeps it
          authoritative regardless of cascade order. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className="md:hidden flex flex-col"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 60,
          width: 320,
          maxWidth: '85vw',
          background: 'var(--bg-deck)',
          borderRight: '1px solid var(--arasaka-red)',
          boxShadow: '8px 0 32px rgba(0,0,0,0.7)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 280ms var(--ease-out)',
        }}
      >
        {/* status header */}
        <div
          className="flex items-center justify-between px-4 py-3 mono text-[10px] uppercase tracking-[0.3em]"
          style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--arasaka-red)',
            color: 'var(--fg-muted)',
          }}
        >
          <span>// NAV_PROTOCOL</span>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex items-center justify-center w-7 h-7 transition-colors"
            style={{ color: 'var(--fg-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Brand */}
        <div className="px-5 py-6">
          <Brand size={18} />
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto">
          <p
            className="px-5 mb-2 mono text-[10px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--fg-muted)' }}
          >
            // NAVIGATE
          </p>
          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <DrawerLink
                key={item.href}
                href={item.href}
                index={i + 1}
                active={active}
                icon={<Icon className="w-4 h-4" />}
                onClick={onClose}
              >
                {item.label}
              </DrawerLink>
            );
          })}

          {authed && (
            <DrawerLink
              href="/library"
              index={NAV_ITEMS.length + 1}
              active={pathname === '/library'}
              icon={<Library className="w-4 h-4" />}
              onClick={onClose}
            >
              Vault
            </DrawerLink>
          )}

          {authed && (
            <>
              <p
                className="px-5 mt-6 mb-2 mono text-[10px] uppercase tracking-[0.3em]"
                style={{ color: 'var(--fg-muted)' }}
              >
                // AGENT
              </p>
              <DrawerLink
                href="/profile"
                index={null}
                active={pathname === '/profile'}
                icon={<User className="w-4 h-4" />}
                onClick={onClose}
              >
                {username ?? 'Perfil'}
              </DrawerLink>
            </>
          )}
        </nav>

        {/* Footer action */}
        <div
          className="p-4"
          style={{ borderTop: '1px solid var(--border-faint)' }}
        >
          {authed ? (
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 mono text-[11px] uppercase tracking-[0.3em] py-3 transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-mid)',
                color: 'var(--fg-secondary)',
              }}
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 mono text-[11px] uppercase tracking-[0.3em] py-3 font-bold transition-colors"
              style={{
                background: 'var(--arasaka-red)',
                color: '#fff',
                border: '1px solid var(--arasaka-red)',
                boxShadow: 'var(--glow-red)',
              }}
            >
              <LogIn className="w-4 h-4" /> ▸ Entrar
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

function DrawerLink({
  href,
  index,
  active,
  icon,
  children,
  onClick,
}: {
  href: string;
  index: number | null;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-5 py-3 mono text-[12px] uppercase tracking-[0.2em] transition-colors relative"
      style={{
        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
        background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
        borderLeft: active
          ? '2px solid var(--arasaka-red)'
          : '2px solid transparent',
      }}
    >
      {index !== null && (
        <span
          className="text-[10px] tabular-nums"
          style={{ color: active ? 'var(--arasaka-red)' : 'var(--fg-muted)' }}
        >
          {String(index).padStart(2, '0')}
        </span>
      )}
      <span style={{ color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)' }}>
        {icon}
      </span>
      {children}
    </Link>
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
