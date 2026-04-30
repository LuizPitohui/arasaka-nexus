'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { api } from '@/lib/api';
import Loader from '@/components/Loader';
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
    selectedGenres.length > 0 ||
    statusFilter !== '' ||
    title.trim() !== '' ||
    ordering !== 'recent';

  const activeCount =
    selectedGenres.length +
    (statusFilter ? 1 : 0) +
    (title.trim() ? 1 : 0) +
    (ordering !== 'recent' ? 1 : 0);

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header
          className="mb-8 pb-6"
          style={{ borderBottom: '1px solid var(--border-faint)' }}
        >
          <p
            className="mono text-[11px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--fg-muted)' }}
          >
            // QUERY_INTERFACE
          </p>
          <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
            <h1
              className="glitch-2 text-4xl md:text-5xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Catálogo
            </h1>
            <p
              className="mono text-[11px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              {data
                ? `${data.count.toLocaleString('pt-BR')} MATCH${data.count === 1 ? '' : 'ES'}`
                : 'SEARCHING...'}
              {activeCount > 0 && ` · ${activeCount} FILTRO${activeCount === 1 ? '' : 'S'}`}
            </p>
          </div>
        </header>

        <div className="grid md:grid-cols-[260px_1fr] gap-8">
          {/* Sidebar */}
          <aside className="space-y-7">
            <FilterBlock label="01" title="Título">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setPage(1);
                }}
                placeholder="Ex: One Piece"
                className="w-full px-3 py-2 text-sm focus:outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-primary)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--arasaka-red)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
              />
            </FilterBlock>

            <FilterBlock label="02" title="Status">
              <div className="flex flex-col gap-1">
                {STATUS_OPTIONS.map((opt) => {
                  const active = statusFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setStatusFilter(opt.value);
                        setPage(1);
                      }}
                      className="mono text-left px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors"
                      style={{
                        border: '1px solid',
                        borderColor: active ? 'var(--arasaka-red)' : 'var(--border-mid)',
                        background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
                        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </FilterBlock>

            <FilterBlock label="03" title="Ordenação">
              <select
                value={ordering}
                onChange={(e) => {
                  setOrdering(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm focus:outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-primary)',
                }}
              >
                {ORDERING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FilterBlock>

            <FilterBlock
              label="04"
              title={`Gêneros${selectedGenres.length > 0 ? ` · ${selectedGenres.length}` : ''}`}
            >
              <div
                className="max-h-72 overflow-y-auto pr-1 space-y-1 p-2"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-faint)',
                }}
              >
                {genres.map((g) => {
                  const active = selectedGenres.includes(g.slug);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGenre(g.slug)}
                      className="w-full text-left px-2 py-1 text-[11px] flex justify-between items-center transition-colors"
                      style={{
                        background: active ? 'rgba(220,38,38,0.12)' : 'transparent',
                        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        if (!active)
                          e.currentTarget.style.background = 'var(--bg-base)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span className="truncate">{g.name}</span>
                      <span
                        className="mono text-[10px] tabular-nums shrink-0 ml-2"
                        style={{ color: 'var(--fg-muted)' }}
                      >
                        {g.manga_count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FilterBlock>

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="mono w-full flex items-center justify-center gap-2 text-[11px] uppercase tracking-widest py-2 transition-colors"
                style={{
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                  e.currentTarget.style.color = 'var(--arasaka-red)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-mid)';
                  e.currentTarget.style.color = 'var(--fg-secondary)';
                }}
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </aside>

          {/* Results */}
          <section>
            {loading ? (
              <Loader label="RUNNING_QUERY" caption="// FETCHING_RESULTS" />
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

function FilterBlock({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--arasaka-red)' }}
        >
          {label}
        </span>
        <label
          className="mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {title}
        </label>
      </div>
      {children}
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
          <Loader fullscreen label="INITIALIZING_QUERY" caption="// LOADING_FILTERS" />
        </div>
      }
    >
      <BrowseInner />
    </Suspense>
  );
}
