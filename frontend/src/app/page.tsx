'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Flame, Loader2, PlayCircle, Search } from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';

type FeaturedManga = {
  id: number;
  title: string;
  cover: string;
  categories?: string[];
};

type RecentManga = {
  id: number;
  title: string;
  cover: string;
  status: string;
};

type SearchResult = {
  id: number | string;
  title: string;
  cover: string;
  mangadex_id: string;
  in_library: boolean;
  description?: string;
  status?: string;
};

type HomeResponse = {
  seeding: boolean;
  total: number;
  featured: FeaturedManga[];
  recent: RecentManga[];
};

type ImportResponse = {
  status: string;
  task_id: string;
  message: string;
  manga_id: number | null;
  created: boolean;
};

type ContinueItem = {
  id: number;
  chapter: number;
  chapter_number: string;
  manga_id: number;
  manga_title: string;
  manga_cover: string;
};

export default function Home() {
  const router = useRouter();

  const [featured, setFeatured] = useState<FeaturedManga[]>([]);
  const [recent, setRecent] = useState<RecentManga[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [loading, setLoading] = useState(true);

  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!tokenStore.getAccess()) return;
    api
      .get<ContinueItem[]>('/accounts/progress/continue/')
      .then(setContinueItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<HomeResponse>('/home-data/', { auth: false })
      .then((data) => {
        if (cancelled) return;
        setFeatured(data.featured ?? []);
        setRecent(data.recent ?? []);
        setSeeding(Boolean(data.seeding));
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.get<SearchResult[]>(
          `/search/?q=${encodeURIComponent(query.trim())}`,
          { auth: false },
        );
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          console.warn('Search rate limit atingido');
        } else {
          console.error(err);
        }
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [query]);

  const handleOpenManga = async (manga: SearchResult | FeaturedManga | RecentManga) => {
    const localId = typeof manga.id === 'number' ? manga.id : null;
    if (localId !== null) {
      router.push(`/manga/${localId}`);
      return;
    }
    const dexId = (manga as SearchResult).mangadex_id;
    if (!dexId) return;
    try {
      const res = await api.post<ImportResponse>('/import/', { mangadex_id: dexId });
      if (res.manga_id) {
        router.push(`/manga/${res.manga_id}`);
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-red-600 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-mono tracking-widest text-xs uppercase animate-pulse">
          Sincronizando Banco de Dados Global...
        </p>
      </div>
    );
  }

  if (query.length > 2) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 p-8">
        <Header query={query} setQuery={setQuery} searching={searching} />
        <h2 className="text-zinc-500 mb-6 text-sm">Resultados para &quot;{query}&quot;</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {searchResults.map((manga) => (
            <MangaCard
              key={`${manga.mangadex_id}-${manga.id}`}
              manga={manga}
              onClick={() => handleOpenManga(manga)}
            />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 pb-20">
      <div className="p-8">
        <Header query={query} setQuery={setQuery} searching={searching} />

        {seeding && (
          <div className="mb-8 border border-zinc-900 bg-zinc-950 text-zinc-400 text-xs p-4 rounded">
            <span className="text-red-500 font-bold">SISTEMA:</span> populando o catálogo
            inicial em background. Atualize em alguns instantes.
          </div>
        )}

        {continueItems.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6 text-emerald-500 font-bold tracking-wider text-sm uppercase">
              <PlayCircle className="w-4 h-4" /> Continuar Lendo
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
              {continueItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/read/${item.chapter}`}
                  className="min-w-[260px] snap-start flex gap-3 p-3 border border-zinc-900 hover:border-emerald-700/50 bg-zinc-950/50 rounded transition-all"
                >
                  <img
                    src={item.manga_cover}
                    alt={item.manga_title}
                    className="w-14 h-20 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                      Capítulo {item.chapter_number}
                    </p>
                    <h3 className="text-sm font-bold text-white truncate mt-1">
                      {item.manga_title}
                    </h3>
                    <p className="text-[11px] text-emerald-500 mt-2">▶ Continuar</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6 text-red-500 font-bold tracking-wider text-sm uppercase">
            <Flame className="w-4 h-4" /> Recomendados pela Arasaka
          </div>

          <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x">
            {featured.map((manga) => (
              <div
                key={manga.id}
                className="min-w-[160px] md:min-w-[200px] snap-start cursor-pointer group"
                onClick={() => router.push(`/manga/${manga.id}`)}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-3 border border-zinc-900 group-hover:border-red-600 transition-all">
                  <img
                    src={manga.cover}
                    alt={manga.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black to-transparent">
                    <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded">
                      TOP TIER
                    </span>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-zinc-300 truncate group-hover:text-white">
                  {manga.title}
                </h3>
                <p className="text-xs text-zinc-600 truncate">
                  {manga.categories?.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-6 text-blue-500 font-bold tracking-wider text-sm uppercase">
            <Clock className="w-4 h-4" /> Adicionados Recentemente
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {recent.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                onClick={() => router.push(`/manga/${manga.id}`)}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

type HeaderProps = {
  query: string;
  setQuery: (value: string) => void;
  searching: boolean;
};

function Header({ query, setQuery, searching }: HeaderProps) {
  return (
    <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-zinc-900 pb-6">
      <h1 className="text-3xl font-black italic tracking-tighter text-white">
        ARASAKA <span className="text-red-600">NEXUS</span>
      </h1>
      <div className="relative w-full md:w-96">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          {searching ? (
            <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-zinc-600" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no Banco de Dados..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-600"
        />
      </div>
    </header>
  );
}

type MangaCardProps = {
  manga: { title: string; cover?: string };
  onClick: () => void;
};

function MangaCard({ manga, onClick }: MangaCardProps) {
  return (
    <div className="group cursor-pointer relative" onClick={onClick}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-zinc-900 shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-red-900/10">
        <img
          src={manga.cover || '/placeholder.jpg'}
          alt={manga.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
        />
      </div>
      <h2 className="mt-3 text-xs font-bold text-zinc-400 group-hover:text-white transition-colors line-clamp-2">
        {manga.title}
      </h2>
    </div>
  );
}
