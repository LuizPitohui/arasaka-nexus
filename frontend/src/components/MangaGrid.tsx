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
      <div className="py-20 text-center text-zinc-500 text-sm">
        Nenhum mangá encontrado com esses filtros.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
      {items.map((manga) => (
        <Link
          key={manga.id}
          href={`/manga/${manga.id}`}
          className="group block"
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-zinc-900 shadow-lg transition-all duration-300 group-hover:-translate-y-1">
            <img
              src={manga.cover || '/placeholder.jpg'}
              alt={manga.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-85 group-hover:opacity-100"
              loading="lazy"
            />
            {manga.status && (
              <span className="absolute top-2 left-2 text-[9px] px-2 py-0.5 bg-black/80 border border-zinc-800 text-zinc-400 uppercase tracking-widest">
                {manga.status}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-xs font-bold text-zinc-300 line-clamp-2 group-hover:text-white transition-colors">
            {manga.title}
          </h3>
          {manga.categories && manga.categories.length > 0 && (
            <p className="text-[10px] text-zinc-600 truncate mt-1">
              {manga.categories.slice(0, 3).join(' · ')}
            </p>
          )}
        </Link>
      ))}
    </div>
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
    <div className="flex items-center justify-between mt-10 pt-6 border-t border-zinc-900">
      <button
        disabled={!hasPrev}
        onClick={() => onChange(page - 1)}
        className="text-xs uppercase tracking-widest px-4 py-2 border border-zinc-800 hover:border-red-600 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        ← Anterior
      </button>
      <span className="text-xs text-zinc-500">
        Página {page} · {pagination.count.toLocaleString('pt-BR')} resultado(s)
      </span>
      <button
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
        className="text-xs uppercase tracking-widest px-4 py-2 border border-zinc-800 hover:border-red-600 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        Próxima →
      </button>
    </div>
  );
}
