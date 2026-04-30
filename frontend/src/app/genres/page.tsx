'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Tag } from 'lucide-react';

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

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header className="mb-8 border-b border-zinc-900 pb-6 flex items-center gap-3">
          <Tag className="w-7 h-7 text-purple-500" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Categories</p>
            <h1 className="text-3xl font-black tracking-tighter mt-1">Gêneros</h1>
          </div>
        </header>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          </div>
        ) : genres.length === 0 ? (
          <p className="text-sm text-zinc-500 py-20 text-center">
            Nenhum gênero indexado ainda. Adicione mangás à biblioteca primeiro.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {genres.map((g) => (
              <Link
                key={g.id}
                href={`/browse?genre=${encodeURIComponent(g.slug)}`}
                className="border border-zinc-900 hover:border-red-600 bg-zinc-950/50 p-4 rounded transition-all flex items-center justify-between group"
              >
                <span className="text-sm text-zinc-300 group-hover:text-white truncate">
                  {g.name}
                </span>
                <span className="text-[11px] text-zinc-600 group-hover:text-red-500">
                  {g.manga_count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
