import Link from 'next/link';
import { ChevronMark } from '@/components/Brand';

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      {/* faint hex grid backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(220,38,38,0.08) 1px, transparent 0)',
          backgroundSize: '24px 24px',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      {/* scanlines */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative flex flex-col items-center gap-8 max-w-xl text-center">
        <ChevronMark size={64} className="opacity-60" />

        <p
          className="mono text-[11px] uppercase tracking-[0.4em]"
          style={{ color: 'var(--fg-muted)' }}
        >
          // ERR_404 · LOST_SIGNAL
        </p>

        <div className="relative">
          <h1
            className="text-[10rem] md:text-[14rem] font-black leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--arasaka-red)',
              letterSpacing: '-0.06em',
              textShadow: '0 0 40px rgba(220,38,38,0.4)',
            }}
          >
            404
          </h1>
          <span
            aria-hidden="true"
            className="absolute inset-0 mono text-[10rem] md:text-[14rem] font-black leading-none pointer-events-none"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'transparent',
              WebkitTextStroke: '1px rgba(34,211,238,0.3)',
              transform: 'translate(3px, 3px)',
              letterSpacing: '-0.06em',
            }}
          >
            404
          </span>
        </div>

        <div
          className="corners-sm px-6 py-4 max-w-md"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
        >
          <p style={{ color: 'var(--fg-secondary)' }}>
            O endereço requisitado não existe nesta malha — descontinuado pela
            Corporação ou redirecionado por subnet hostil.
          </p>
          <p
            className="mono text-[10px] uppercase tracking-widest mt-3"
            style={{ color: 'var(--fg-muted)' }}
          >
            CHECK URL · OR FALLBACK_BELOW
          </p>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <Link
            href="/"
            className="mono px-5 py-2.5 text-[11px] uppercase tracking-widest transition-colors"
            style={{
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-secondary)',
            }}
          >
            ← Catálogo
          </Link>
          <Link
            href="/random"
            className="mono px-5 py-2.5 text-[11px] uppercase tracking-widest transition-colors"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
            }}
          >
            Surpreender-me →
          </Link>
        </div>
      </div>
    </main>
  );
}
