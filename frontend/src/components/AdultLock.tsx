'use client';

import { Lock, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { isAdultRating } from '@/lib/types';

const REVEAL_KEY = 'nexus_adult_revealed';

function getRevealedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(REVEAL_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistRevealedSet(set: Set<string>) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(REVEAL_KEY, JSON.stringify(Array.from(set)));
}

export function useAdultReveal(id: number | string | undefined, rating?: string | null) {
  const isAdult = isAdultRating(rating);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!isAdult || id === undefined || id === null) return;
    setRevealed(getRevealedSet().has(String(id)));
  }, [id, isAdult]);

  const reveal = () => {
    if (id === undefined || id === null) return;
    const next = getRevealedSet();
    next.add(String(id));
    persistRevealedSet(next);
    setRevealed(true);
  };

  const conceal = () => {
    if (id === undefined || id === null) return;
    const next = getRevealedSet();
    next.delete(String(id));
    persistRevealedSet(next);
    setRevealed(false);
  };

  return { isAdult, revealed, reveal, conceal };
}

/**
 * Small lock overlay used by MangaCard.
 * Renders only when `rating` is adult AND the user hasn't revealed yet for the session.
 */
export function AdultCardLock({
  rating,
  onReveal,
}: {
  rating?: string | null;
  onReveal: (e: React.MouseEvent) => void;
}) {
  if (!isAdultRating(rating)) return null;

  const label = rating === 'pornographic' ? '18+' : '+18';

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-md"
      style={{
        background:
          'linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(40,0,0,0.88) 100%)',
        zIndex: 6,
      }}
    >
      {/* corner brackets */}
      <span
        aria-hidden
        className="absolute top-1.5 left-1.5"
        style={{
          width: 14,
          height: 14,
          borderTop: '1px solid var(--arasaka-red)',
          borderLeft: '1px solid var(--arasaka-red)',
        }}
      />
      <span
        aria-hidden
        className="absolute bottom-1.5 right-1.5"
        style={{
          width: 14,
          height: 14,
          borderBottom: '1px solid var(--arasaka-red)',
          borderRight: '1px solid var(--arasaka-red)',
        }}
      />

      <div
        className="flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '1px solid var(--arasaka-red)',
          background: 'rgba(0,0,0,0.6)',
          boxShadow: '0 0 18px rgba(220,38,38,0.35)',
        }}
      >
        <Lock className="w-5 h-5" style={{ color: 'var(--arasaka-red)' }} />
      </div>

      <div className="text-center px-3">
        <p
          className="mono text-[10px] uppercase tracking-[0.3em]"
          style={{ color: 'var(--arasaka-red)' }}
        >
          // RESTRICTED · {label}
        </p>
        <p
          className="mono text-[9px] uppercase tracking-widest mt-1"
          style={{ color: 'var(--fg-muted)' }}
        >
          conteúdo adulto
        </p>
      </div>

      <button
        type="button"
        onClick={onReveal}
        className="mono text-[10px] uppercase tracking-[0.25em] px-3 py-1.5 transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid var(--arasaka-red)',
          color: 'var(--arasaka-red)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--arasaka-red)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--arasaka-red)';
        }}
      >
        ▸ REVELAR
      </button>
    </div>
  );
}

/**
 * Full-page gate for /manga/[id] when the title is adult-rated and the
 * viewer hasn't revealed it yet (or is not an adult / hasn't opted in).
 */
export function AdultPageGate({
  rating,
  hasAccess,
  onReveal,
  onBack,
}: {
  rating?: string | null;
  hasAccess: boolean;
  onReveal: () => void;
  onBack: () => void;
}) {
  if (!isAdultRating(rating)) return null;
  const label = rating === 'pornographic' ? '18+ (PORNOGRÁFICO)' : '+18 (ERÓTICO)';

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 scanlines"
      style={{ background: 'var(--bg-void)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 30%, var(--arasaka-red) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      <div
        className="w-full max-w-md p-8 relative bracket"
        style={{
          background: 'var(--bg-terminal)',
          border: '1px solid var(--arasaka-red)',
          boxShadow: '0 0 80px rgba(220,38,38,0.2)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 px-3 py-2 flex items-center justify-between mono text-[9px] uppercase tracking-widest"
          style={{
            background: 'rgba(220,38,38,0.15)',
            borderBottom: '1px solid var(--arasaka-red)',
            color: 'var(--arasaka-red)',
          }}
        >
          <span>// RESTRICTED_ZONE</span>
          <span className="blink">● LOCK</span>
        </div>

        <div className="text-center pt-10 pb-2">
          <div
            className="mx-auto flex items-center justify-center mb-5"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '2px solid var(--arasaka-red)',
              background: 'rgba(220,38,38,0.08)',
              boxShadow: '0 0 32px rgba(220,38,38,0.4)',
            }}
          >
            <ShieldAlert
              className="w-8 h-8"
              style={{ color: 'var(--arasaka-red)' }}
            />
          </div>

          <h1
            className="display text-2xl"
            style={{ color: 'var(--fg-primary)' }}
          >
            CONTEÚDO <span style={{ color: 'var(--arasaka-red)' }}>ADULTO</span>
          </h1>
          <p
            className="kicker mt-2"
            style={{ color: 'var(--arasaka-red)' }}
          >
            // CLASSIFICAÇÃO · {label}
          </p>

          <p
            className="mt-6 text-sm leading-relaxed"
            style={{ color: 'var(--fg-secondary)' }}
          >
            Este título contém material destinado exclusivamente a maiores de
            18 anos. Confirme que deseja prosseguir para visualizar.
          </p>

          {!hasAccess && (
            <div
              className="mt-5 p-3 mono text-[10px] uppercase tracking-widest text-left"
              style={{
                background: 'rgba(220,38,38,0.06)',
                border: '1px solid var(--border-faint)',
                color: 'var(--fg-muted)',
              }}
            >
              ⚠ Sua conta não tem permissão para conteúdo adulto.
              <br />
              Faça login com idade verificada (18+) e ative
              {' '}
              <span style={{ color: 'var(--arasaka-red)' }}>
                exibir adulto
              </span>{' '}
              no perfil.
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2">
            {hasAccess && (
              <button
                type="button"
                onClick={onReveal}
                className="w-full py-3 mono text-xs uppercase tracking-[0.3em] font-bold transition-all"
                style={{
                  background: 'var(--arasaka-red)',
                  color: '#fff',
                  boxShadow: 'var(--glow-red)',
                }}
              >
                ▸ TENHO 18+ · ENTRAR
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 mono text-xs uppercase tracking-[0.3em] transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-mid)',
                color: 'var(--fg-secondary)',
              }}
            >
              ← VOLTAR
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
