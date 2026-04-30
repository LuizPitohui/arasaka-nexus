'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useCountUp } from '@/hooks/useCountUp';

export type GridManga = {
  id: number;
  title: string;
  cover: string;
  status?: string;
  categories?: string[];
};

export function MangaGrid({ items }: { items: GridManga[] }) {
  if (items.length === 0) {
    return (
      <div
        className="py-20 text-center mono text-xs uppercase tracking-widest"
        style={{ color: 'var(--fg-muted)' }}
      >
        // NULL_RESULT — nenhum mangá com esses filtros.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
      {items.map((manga, idx) => (
        <MangaCard key={manga.id} manga={manga} index={idx} />
      ))}
    </div>
  );
}

export function MangaCard({
  manga,
  index = 0,
}: {
  manga: GridManga;
  index?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), Math.min(index * 28, 360));
    return () => clearTimeout(t);
  }, [index]);

  return (
    <Link
      href={`/manga/${manga.id}`}
      className="group block corners-sm card-shell"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 320ms var(--ease-out), transform 320ms var(--ease-out)',
      }}
    >
      <div
        className="relative aspect-[2/3] overflow-hidden"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <img
          src={manga.cover || '/placeholder.jpg'}
          alt={manga.title}
          loading="lazy"
          className="h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.04]"
          style={{ opacity: 0.85 }}
          onLoad={(e) => ((e.currentTarget.style.opacity = '1'))}
        />
        {/* scanline overlay on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px)',
          }}
        />
        {/* flicker brackets */}
        <span className="card-bracket card-bracket-tl" aria-hidden />
        <span className="card-bracket card-bracket-br" aria-hidden />

        {/* status chip */}
        {manga.status && (
          <span
            className="absolute top-2 left-2 mono text-[9px] px-1.5 py-0.5 uppercase tracking-widest"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid var(--border-faint)',
              color: 'var(--fg-secondary)',
              zIndex: 4,
            }}
          >
            {manga.status}
          </span>
        )}
        {/* hairline ID at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1 mono text-[9px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
            color: 'var(--arasaka-red)',
            zIndex: 4,
          }}
        >
          <span className="card-id">
            // ENTRY_{String(manga.id).padStart(4, '0')}
          </span>
        </div>
      </div>
      <h3
        className="mt-3 text-[13px] font-semibold line-clamp-2 transition-colors"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {manga.title}
      </h3>
      {manga.categories && manga.categories.length > 0 && (
        <p
          className="mono text-[10px] truncate mt-1 uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          {manga.categories.slice(0, 2).join(' · ')}
        </p>
      )}
    </Link>
  );
}

type Pagination = {
  count: number;
  next: string | null;
  previous: string | null;
};

export function Pager({
  pagination,
  page,
  onChange,
}: {
  pagination: Pagination | null;
  page: number;
  onChange: (page: number) => void;
}) {
  const animatedCount = useCountUp(pagination?.count ?? 0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  if (!pagination) return null;
  const hasPrev = Boolean(pagination.previous);
  const hasNext = Boolean(pagination.next);
  if (!hasPrev && !hasNext) return null;

  // assume page size 24 to estimate total pages for the jumper
  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(pagination.count / PAGE_SIZE));

  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) {
      const target = Math.max(1, Math.min(totalPages, n));
      if (target !== page) onChange(target);
    }
    setJumpOpen(false);
  };

  return (
    <>
      {/* DESKTOP — inline footer pager (current design) */}
      <div
        className="hidden md:flex items-center justify-between mt-12 pt-6"
        style={{ borderTop: '1px solid var(--border-faint)' }}
      >
        <button
          disabled={!hasPrev}
          onClick={() => onChange(page - 1)}
          className="mono text-[11px] uppercase tracking-widest px-4 py-2 transition disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            border: '1px solid var(--border-mid)',
            color: 'var(--fg-secondary)',
          }}
          onMouseEnter={(e) => {
            if (hasPrev) {
              e.currentTarget.style.borderColor = 'var(--arasaka-red)';
              e.currentTarget.style.color = 'var(--arasaka-red)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-mid)';
            e.currentTarget.style.color = 'var(--fg-secondary)';
          }}
        >
          ← PREV
        </button>
        <span
          className="mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          PG {String(page).padStart(2, '0')} ·{' '}
          <span className="tabular-nums" style={{ color: 'var(--fg-secondary)' }}>
            {animatedCount.toLocaleString('pt-BR')}
          </span>{' '}
          ENTRADAS
        </span>
        <button
          disabled={!hasNext}
          onClick={() => onChange(page + 1)}
          className="mono text-[11px] uppercase tracking-widest px-4 py-2 transition disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            border: '1px solid var(--border-mid)',
            color: 'var(--fg-secondary)',
          }}
          onMouseEnter={(e) => {
            if (hasNext) {
              e.currentTarget.style.borderColor = 'var(--arasaka-red)';
              e.currentTarget.style.color = 'var(--arasaka-red)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-mid)';
            e.currentTarget.style.color = 'var(--fg-secondary)';
          }}
        >
          NEXT →
        </button>
      </div>

      {/* MOBILE — fixed bottom bar that's always visible while scrolling */}
      <div className="md:hidden h-16" aria-hidden />
      <div
        className="md:hidden fixed left-0 right-0 z-40"
        style={{
          // sit above the global StatusBar (28px tall)
          bottom: 28,
          background: 'rgba(0,0,0,0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid var(--arasaka-red)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
        }}
      >
        {jumpOpen && (
          <form
            onSubmit={submitJump}
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-faint)' }}
          >
            <span
              className="mono text-[10px] uppercase tracking-[0.3em] flex-shrink-0"
              style={{ color: 'var(--fg-muted)' }}
            >
              // GOTO
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="flex-1 mono text-sm tabular-nums px-3 py-2 focus:outline-none"
              style={{
                background: 'var(--bg-void)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--fg-primary)',
              }}
            />
            <button
              type="submit"
              className="mono px-3 py-2 text-[11px] uppercase tracking-widest font-bold"
              style={{
                background: 'var(--arasaka-red)',
                color: '#fff',
                border: '1px solid var(--arasaka-red)',
              }}
            >
              ▸ GO
            </button>
            <button
              type="button"
              onClick={() => setJumpOpen(false)}
              className="mono px-2 py-2 text-[11px] uppercase tracking-widest"
              style={{
                border: '1px solid var(--border-mid)',
                color: 'var(--fg-secondary)',
              }}
            >
              ✕
            </button>
          </form>
        )}

        <div className="flex items-stretch h-12">
          <button
            disabled={!hasPrev}
            onClick={() => onChange(page - 1)}
            aria-label="Página anterior"
            className="flex-1 flex items-center justify-center gap-1.5 mono text-[10px] uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              color: 'var(--fg-secondary)',
              borderRight: '1px solid var(--border-faint)',
            }}
          >
            <ChevronLeft className="w-4 h-4" /> PREV
          </button>
          <button
            onClick={() => setJumpOpen((v) => !v)}
            aria-label="Pular para página"
            className="px-4 flex flex-col items-center justify-center mono leading-none transition-colors"
            style={{
              background: 'rgba(220,38,38,0.08)',
              color: 'var(--arasaka-red)',
              borderRight: '1px solid var(--border-faint)',
              borderLeft: '1px solid var(--border-faint)',
              minWidth: 84,
            }}
          >
            <span
              className="text-[8px] uppercase tracking-[0.3em]"
              style={{ color: 'var(--fg-muted)' }}
            >
              PG
            </span>
            <span className="text-xs font-bold tabular-nums mt-0.5">
              {String(page).padStart(2, '0')}/{String(totalPages).padStart(2, '0')}
            </span>
          </button>
          <button
            disabled={!hasNext}
            onClick={() => onChange(page + 1)}
            aria-label="Próxima página"
            className="flex-1 flex items-center justify-center gap-1.5 mono text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              color: '#fff',
              background: 'var(--arasaka-red)',
              boxShadow: 'var(--glow-red)',
            }}
          >
            NEXT <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
