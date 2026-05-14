'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { api } from '@/lib/api';
import Loader from '@/components/Loader';
import type { MangaSummary, Paginated } from '@/lib/types';
import { MangaGrid, Pager } from '@/components/MangaGrid';

export default function LatestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
          <Loader fullscreen label="SYNCING_FEED" />
        </div>
      }
    >
      <LatestContent />
    </Suspense>
  );
}

function LatestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?page=N persiste pagina via back/forward. Default 1 quando ausente.
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const qs = params.toString();
    router.push(qs ? `/latest?${qs}` : '/latest', { scroll: false });
  };

  const [data, setData] = useState<Paginated<MangaSummary> | null>(null);
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
              className="glitch text-4xl md:text-5xl font-black tracking-tight"
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
          <Loader label="SYNCING_FEED" caption="// PULLING_LATEST_PACKETS" />
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
