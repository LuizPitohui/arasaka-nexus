'use client';

import { useEffect, useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';

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
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header className="mb-8 border-b border-zinc-900 pb-6 flex items-center gap-3">
          <Flame className="w-7 h-7 text-red-500" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Trending</p>
            <h1 className="text-3xl font-black tracking-tighter mt-1">Mais Populares</h1>
          </div>
        </header>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
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
