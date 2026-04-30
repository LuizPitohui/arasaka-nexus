'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import type { MangaSummary, Paginated } from '@/lib/types';
import { MangaGrid, Pager } from '@/components/MangaGrid';

export default function PopularPage() {
  const [data, setData] = useState<Paginated<MangaSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Paginated<MangaSummary>>(`/mangas/popular/?page=${page}`, { auth: false })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header
          className="mb-10 pb-6"
          style={{ borderBottom: '1px solid var(--border-faint)' }}
        >
          <p
            className="mono text-[11px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--fg-muted)' }}
          >
            // TRENDING_FEED
          </p>
          <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
            <h1
              className="text-4xl md:text-5xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Mais <span style={{ color: 'var(--arasaka-red)' }}>Populares</span>
            </h1>
            {data && (
              <p
                className="mono text-[11px] uppercase tracking-widest"
                style={{ color: 'var(--arasaka-red)' }}
              >
                RANK · {data.count.toLocaleString('pt-BR')} ENTRADAS
              </p>
            )}
          </div>
          <p
            className="mono text-[11px] mt-3 uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            Ordenado por engajamento e favoritos da rede.
          </p>
        </header>

        {loading ? (
          <div className="py-20 flex justify-center" style={{ color: 'var(--arasaka-red)' }}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <>
            <MangaGrid items={data?.results ?? []} />
            <Pager pagination={data} page={page} onChange={setPage} />
          </>
        )}
      </div>
    </main>
  );
}
