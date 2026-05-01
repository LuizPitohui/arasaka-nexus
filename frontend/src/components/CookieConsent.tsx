'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';

const KEY = 'nexus_cookie_consent';

type Choice = 'accepted' | 'rejected';

function readChoice(): Choice | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(KEY);
  return v === 'accepted' || v === 'rejected' ? v : null;
}

function writeChoice(choice: Choice) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, choice);
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readChoice() === null) {
      // small delay so it doesn't hit during the boot sequence
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  if (!open) return null;

  const accept = () => {
    writeChoice('accepted');
    setOpen(false);
  };
  const reject = () => {
    writeChoice('rejected');
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed left-3 right-3 md:left-auto md:right-6 md:max-w-md z-50"
      style={{
        bottom: 44,
        background: 'var(--bg-terminal)',
        border: '1px solid var(--arasaka-red)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 30px rgba(220,38,38,0.15)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 mono text-[9px] uppercase tracking-[0.3em]"
        style={{
          background: 'rgba(220,38,38,0.12)',
          borderBottom: '1px solid var(--arasaka-red)',
          color: 'var(--arasaka-red)',
        }}
      >
        <span className="flex items-center gap-1.5">
          <Cookie className="w-3 h-3" />
          // PROTOCOL_99 · COOKIES
        </span>
        <button
          aria-label="Fechar"
          onClick={reject}
          className="p-1 transition-colors hover:text-white"
          style={{ color: 'var(--arasaka-red)' }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="p-4">
        <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>
          Usamos apenas cookies <strong>essenciais</strong> para manter sua
          sessão e suas preferências de leitura. Não rastreamos para
          publicidade nem compartilhamos com terceiros.
        </p>
        <p
          className="mt-2 mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          Detalhes em{' '}
          <Link
            href="/privacidade"
            className="underline"
            style={{ color: 'var(--arasaka-red)' }}
          >
            política de privacidade
          </Link>
          .
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={accept}
            className="flex-1 py-2 mono text-[11px] uppercase tracking-[0.25em] font-bold transition-all"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              boxShadow: 'var(--glow-red)',
            }}
          >
            ▸ ACEITAR
          </button>
          <button
            onClick={reject}
            className="flex-1 py-2 mono text-[11px] uppercase tracking-[0.25em] transition-colors"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-secondary)',
            }}
          >
            APENAS_ESSENCIAIS
          </button>
        </div>
      </div>
    </div>
  );
}
