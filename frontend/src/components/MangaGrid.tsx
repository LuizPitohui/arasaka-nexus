'use client';

import Link from 'next/link';

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
      {items.map((manga) => (
        <MangaCard key={manga.id} manga={manga} />
      ))}
    </div>
  );
}

export function MangaCard({ manga }: { manga: GridManga }) {
  return (
    <Link href={`/manga/${manga.id}`} className="group block corners-sm">
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
        {/* status chip */}
        {manga.status && (
          <span
            className="absolute top-2 left-2 mono text-[9px] px-1.5 py-0.5 uppercase tracking-widest"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid var(--border-faint)',
              color: 'var(--fg-secondary)',
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
          }}
        >
          // ENTRY_{String(manga.id).padStart(4, '0')}
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
  if (!pagination) return null;
  const hasPrev = Boolean(pagination.previous);
  const hasNext = Boolean(pagination.next);
  if (!hasPrev && !hasNext) return null;

  return (
    <div
      className="flex items-center justify-between mt-12 pt-6"
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
        {pagination.count.toLocaleString('pt-BR')} ENTRADAS
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
  );
}
