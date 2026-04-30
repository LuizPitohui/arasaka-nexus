'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import type { Genre } from '@/lib/types';

export default function GenresPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Genre[]>('/categories/with_counts/', { auth: false })
      .then(setGenres)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalEntries = genres.reduce((acc, g) => acc + g.manga_count, 0);

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <PageHeader
          kicker="// CLASSIFICATION_INDEX"
          title="Gêneros"
          meta={
            loading
              ? 'CARREGANDO...'
              : `${genres.length} CATEGORIAS · ${totalEntries.toLocaleString('pt-BR')} ENTRADAS`
          }
        />

        {loading ? (
          <Spinner />
        ) : genres.length === 0 ? (
          <div
            className="py-20 text-center mono text-xs uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            // NULL_RESULT — nenhuma categoria indexada.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {genres.map((g, i) => (
              <Link
                key={g.id}
                href={`/browse?genre=${encodeURIComponent(g.slug)}`}
                className="group corners-sm relative px-4 py-3.5 flex items-center justify-between transition-colors"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-faint)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-faint)';
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="mono text-[10px] tabular-nums shrink-0"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="text-sm truncate transition-colors group-hover:text-white"
                    style={{ color: 'var(--fg-secondary)' }}
                  >
                    {g.name}
                  </span>
                </div>
                <span
                  className="mono text-[10px] uppercase tracking-widest tabular-nums shrink-0 ml-2"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {g.manga_count.toString().padStart(3, '0')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PageHeader({
  kicker,
  title,
  meta,
}: {
  kicker: string;
  title: string;
  meta: string;
}) {
  return (
    <header
      className="mb-10 pb-6"
      style={{ borderBottom: '1px solid var(--border-faint)' }}
    >
      <p
        className="mono text-[11px] uppercase tracking-[0.3em]"
        style={{ color: 'var(--fg-muted)' }}
      >
        {kicker}
      </p>
      <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
        <h1
          className="text-4xl md:text-5xl font-black tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        <p
          className="mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--arasaka-red)' }}
        >
          {meta}
        </p>
      </div>
    </header>
  );
}

function Spinner() {
  return (
    <div className="py-20 flex justify-center" style={{ color: 'var(--arasaka-red)' }}>
      <Loader2 className="w-8 h-8 animate-spin" />
    </div>
  );
}
