import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

/**
 * Servida pelo service worker quando o usuario navega sem rede.
 * Build estatico — nao depende da API pra renderizar.
 */
export default function OfflinePage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 scanlines"
      style={{ background: 'var(--bg-void)' }}
    >
      <div
        className="w-full max-w-md p-10 text-center"
        style={{
          background: 'var(--bg-terminal)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <p
          className="kicker mb-3"
          style={{ color: 'var(--arasaka-red)' }}
        >
          // CONNECTION_LOST
        </p>
        <h1
          className="display text-3xl mb-4"
          style={{ color: 'var(--fg-primary)' }}
        >
          OFFLINE
        </h1>
        <p
          className="mono text-sm mb-8"
          style={{ color: 'var(--fg-muted)' }}
        >
          Nenhuma rede detectada. Capítulos que você já leu continuam
          disponíveis enquanto estiverem em cache.
        </p>
        <Link
          href="/"
          className="inline-block py-3 px-6 mono text-xs uppercase tracking-[0.3em]"
          style={{
            background: 'var(--arasaka-red)',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          ▸ TENTAR DE NOVO
        </Link>
      </div>
    </main>
  );
}
