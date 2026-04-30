'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, Loader2, X } from 'lucide-react';

import { api } from '@/lib/api';
import type { Genre, MangaSummary, Paginated } from '@/lib/types';
import { MangaGrid, Pager } from '@/components/MangaGrid';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'ONGOING', label: 'Em andamento' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'HIATUS', label: 'Em hiato' },
];

const ORDERING_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'popular', label: 'Mais favoritados' },
  { value: 'latest_chapter', label: 'Capítulo mais novo' },
  { value: 'alphabetical', label: 'A → Z' },
  { value: 'alphabetical_desc', label: 'Z → A' },
];

function BrowseInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialGenres = useMemo(
    () => searchParams.getAll('genre'),
    [searchParams],
  );
  const initialStatus = searchParams.get('status') ?? '';
  const initialOrdering = searchParams.get('ordering') ?? 'recent';
  const initialTitle = searchParams.get('title') ?? '';

  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [ordering, setOrdering] = useState(initialOrdering);
  const [title, setTitle] = useState(initialTitle);
  const [page, setPage] = useState(1);

  const [genres, setGenres] = useState<Genre[]>([]);
  const [data, setData] = useState<Paginated<MangaSummary> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Genre[]>('/categories/with_counts/', { auth: false })
      .then(setGenres)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    selectedGenres.forEach((g) => qs.append('genre', g));
    if (statusFilter) qs.set('status', statusFilter);
    if (ordering) qs.set('ordering', ordering);
    if (title.trim()) qs.set('title', title.trim());
    qs.set('page', String(page));

    setLoading(true);
    api
      .get<Paginated<MangaSummary>>(`/mangas/?${qs.toString()}`, { auth: false })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Reflect filters in URL (without page so refresh starts at page 1)
    const urlQs = new URLSearchParams();
    selectedGenres.forEach((g) => urlQs.append('genre', g));
    if (statusFilter) urlQs.set('status', statusFilter);
    if (ordering !== 'recent') urlQs.set('ordering', ordering);
    if (title.trim()) urlQs.set('title', title.trim());
    const newUrl = urlQs.toString() ? `/browse?${urlQs.toString()}` : '/browse';
    router.replace(newUrl, { scroll: false });
  }, [selectedGenres, statusFilter, ordering, title, page, router]);

  const toggleGenre = (slug: string) => {
    setPage(1);
    setSelectedGenres((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug],
    );
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setStatusFilter('');
    setOrdering('recent');
    setTitle('');
    setPage(1);
  };

  const filtersActive =
    selectedGenres.length > 0 || statusFilter !== '' || title.trim() !== '' || ordering !== 'recent';

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header className="mb-8 border-b border-zinc-900 pb-6 flex items-center gap-3">
          <Filter className="w-7 h-7 text-emerald-500" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Browse</p>
            <h1 className="text-3xl font-black tracking-tighter mt-1">Catálogo</h1>
          </div>
        </header>

        <div className="grid md:grid-cols-[260px_1fr] gap-8">
          {/* Sidebar filters */}
          <aside className="space-y-6">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Título
              </label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setPage(1);
                }}
                placeholder="Ex: One Piece"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-600"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Status
              </label>
              <div className="flex flex-col gap-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setPage(1);
                    }}
                    className={`text-left px-3 py-1.5 text-xs border transition ${
                      statusFilter === opt.value
                        ? 'border-red-600 bg-red-950/20 text-red-500'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Ordenação
              </label>
              <select
                value={ordering}
                onChange={(e) => {
                  setOrdering(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-600"
              >
                {ORDERING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Gêneros{selectedGenres.length > 0 && ` (${selectedGenres.length})`}
              </label>
              <div className="max-h-72 overflow-y-auto pr-1 space-y-1 border border-zinc-900 rounded p-2 bg-zinc-950/50">
                {genres.map((g) => {
                  const active = selectedGenres.includes(g.slug);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGenre(g.slug)}
                      className={`w-full text-left px-2 py-1 text-[11px] rounded flex justify-between items-center transition ${
                        active
                          ? 'bg-red-950/30 text-red-400'
                          : 'text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      <span>{g.name}</span>
                      <span className="text-zinc-600">{g.manga_count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="w-full flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-red-500 border border-zinc-800 hover:border-red-600 py-2 rounded transition"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </aside>

          {/* Results */}
          <section>
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
          </section>
        </div>
      </div>
    </main>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      }
    >
      <BrowseInner />
    </Suspense>
  );
}
