'use client';

/**
 * PWA bootstrap — registra o service worker e gerencia o install prompt.
 *
 * - Em produção (HTTPS), registra /sw.js no scope raiz.
 * - Em dev (localhost), pula registro pra nao cachear builds quentes do Next.
 * - Captura o evento `beforeinstallprompt` (Chrome/Edge/Samsung) e mostra
 *   um banner discreto no canto inferior. Usuario aceita ou dispensa.
 * - "Dispensa" persiste em localStorage por 7 dias pra nao virar nag.
 */

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < DISMISS_TTL_MS;
}

export function PWAInit() {
  const [installEvt, setInstallEvt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Registro do SW
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.hostname === 'localhost') return; // skip em dev

    // Aguarda load pra nao competir com hidratacao inicial
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('SW registration failed:', err);
        });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // Install prompt capture
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (dismissedRecently()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!installEvt) return null;

  const accept = async () => {
    try {
      await installEvt.prompt();
      await installEvt.userChoice;
    } finally {
      setInstallEvt(null);
    }
  };

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setInstallEvt(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Instalar Arasaka Nexus"
      className="fixed bottom-4 right-4 z-50 max-w-xs p-4 mono text-[11px] uppercase tracking-widest"
      style={{
        background: 'var(--bg-terminal)',
        border: '1px solid var(--arasaka-red)',
        color: 'var(--fg-primary)',
        boxShadow: '0 0 30px rgba(220,38,38,0.2)',
      }}
    >
      <p
        className="mb-2"
        style={{ color: 'var(--arasaka-red)' }}
      >
        ▮ INSTALAR APP
      </p>
      <p
        className="mb-3 normal-case tracking-normal"
        style={{ color: 'var(--fg-muted)', fontSize: '11px' }}
      >
        Adicione o Nexus à tela inicial pra abrir como app, sem barra de
        URL e com cache offline.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          className="flex-1 py-2 px-3 transition-colors"
          style={{
            background: 'var(--arasaka-red)',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          INSTALAR
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="py-2 px-3 transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--fg-muted)',
            border: '1px solid var(--border-faint)',
          }}
        >
          AGORA NÃO
        </button>
      </div>
    </div>
  );
}
