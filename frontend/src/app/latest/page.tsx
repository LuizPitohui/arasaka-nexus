'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import type { MangaSummary, Paginated } from '@/lib/types';
import { MangaGrid, Pager } from '@/components/MangaGrid';

export default function LatestPage() {
  const [data, setData] = useState<Paginated<MangaSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Paginated<MangaSummary>>(`/mangas/latest/?page=${page}`, { auth: false })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  const now = new Date();
  const stamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header
          className="mb-10 pb-6"
          style={{ borderBottom: '1px solid var(--border-faint)' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="mono text-[10px] uppercase tracking-widest px-2 py-0.5 inline-flex items-center gap-1.5"
              style={{
                background: 'rgba(220,38,38,0.1)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--arasaka-red)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--arasaka-red)',
                  boxShadow: '0 0 8px var(--arasaka-red)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              LIVE
            </span>
            <p
              className="mono text-[11px] uppercase tracking-[0.3em]"
              style={{ color: 'var(--fg-muted)' }}
            >
              // FEED_UPDATES
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
            <h1
              className="text-4xl md:text-5xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Últimos <span style={{ color: 'var(--arasaka-red)' }}>Lançamentos</span>
            </h1>
            <p
              className="mono text-[11px] uppercase tracking-widest"
              style={{ color: 'var(--fg-muted)' }}
            >
              SYNC · {stamp}
            </p>
          </div>
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
      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </main>
  );
}
