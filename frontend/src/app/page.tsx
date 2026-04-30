'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Flame, PlayCircle, Search } from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';
import Loader from '@/components/Loader';
import { MangaCard, type GridManga } from '@/components/MangaGrid';

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

  const handleOpenManga = async (
    manga: SearchResult | FeaturedManga | RecentManga,
  ) => {
    const localId = typeof manga.id === 'number' ? manga.id : null;
    if (localId !== null) {
      router.push(`/manga/${localId}`);
      return;
    }
    const dexId = (manga as SearchResult).mangadex_id;
    if (!dexId) return;
    try {
      const res = await api.post<ImportResponse>('/import/', {
        mangadex_id: dexId,
      });
      if (res.manga_id) router.push(`/manga/${res.manga_id}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-void)' }}>
        <Loader fullscreen label="SYNCING_GLOBAL_DATABASE" caption="// PULLING_HOMEPAGE_FEED" />
      </div>
    );
  }

  // SEARCH MODE
  if (query.length > 2) {
    return (
      <main
        className="min-h-screen p-8 max-w-7xl mx-auto"
        style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
      >
        <SearchBar query={query} setQuery={setQuery} searching={searching} />
        <div className="mb-6">
          <p className="kicker mb-1">// SEARCH_RESULTS</p>
          <h2
            className="display text-2xl"
            style={{ color: 'var(--fg-primary)' }}
          >
            &quot;{query}&quot;
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-5 gap-y-8">
          {searchResults.map((manga) => (
            <div
              key={`${manga.mangadex_id}-${manga.id}`}
              onClick={() => handleOpenManga(manga)}
              className="cursor-pointer"
            >
              <MangaCard
                manga={{
                  id: typeof manga.id === 'number' ? manga.id : 0,
                  title: manga.title,
                  cover: manga.cover,
                  status: manga.status,
                }}
              />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // HOME
  return (
    <main
      className="min-h-screen pb-20"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      <div className="max-w-7xl mx-auto p-8">
        <SearchBar query={query} setQuery={setQuery} searching={searching} />

        {/* HERO */}
        <section className="mb-16 relative overflow-hidden scanlines bracket">
          <div
            className="px-8 py-12 relative"
            style={{
              background:
                'linear-gradient(120deg, rgba(220,38,38,0.10) 0%, transparent 60%), var(--bg-deck)',
              border: '1px solid var(--border-faint)',
            }}
          >
            {/* hex grid overlay */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'url(/hex-grid.svg)',
                backgroundSize: '56px 48px',
                opacity: 0.3,
              }}
            />
            <div className="relative">
            <p className="kicker mb-3">// PROTOCOL_07 // KNOWLEDGE_VAULT</p>
            <h1
              className="display text-5xl md:text-6xl mb-4 max-w-3xl uppercase"
              style={{ color: 'var(--fg-primary)' }}
            >
              Direct Stream{' '}
              <span style={{ color: 'var(--arasaka-red)' }} className="glitch">
                from the Grid.
              </span>
            </h1>
            <p
              className="text-base max-w-xl mb-8"
              style={{ color: 'var(--fg-secondary)' }}
            >
              Mangás sincronizados em tempo real, leitura criptografada via subnet.
              Catálogo, leitor híbrido, vault pessoal — tudo no mesmo terminal, agente.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/popular"
                className="mono inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.3em] font-bold transition-all"
                style={{
                  background: 'var(--arasaka-red)',
                  color: '#fff',
                  border: '1px solid var(--arasaka-red)',
                  boxShadow: 'var(--glow-red)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--arasaka-red-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--arasaka-red)';
                }}
              >
                ▸ ENGAGE_STREAM
              </Link>
              <Link
                href="/library"
                className="mono inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.3em] font-bold transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--fg-secondary)',
                  border: '1px solid var(--border-mid)',
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
                ▸ ENTRAR_VAULT
              </Link>
            </div>
            </div>
          </div>
        </section>

        {seeding && (
          <div
            className="mb-12 p-4 mono text-xs uppercase tracking-widest"
            style={{
              background: 'var(--bg-terminal)',
              border: '1px solid var(--border-faint)',
              borderLeft: '2px solid var(--arasaka-red)',
              color: 'var(--fg-secondary)',
            }}
          >
            <span style={{ color: 'var(--arasaka-red)' }}>// SYSTEM:</span>{' '}
            populating initial catalog in background. Refresh shortly.
          </div>
        )}

        {/* CONTINUE READING */}
        {continueItems.length > 0 && (
          <Section
            kicker="// STREAM_01"
            title="Continue Reading"
            accent="var(--neon-green)"
            icon={<PlayCircle className="w-3.5 h-3.5" />}
          >
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
              {continueItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/read/${item.chapter}`}
                  className="min-w-[280px] snap-start flex gap-3 p-3 transition-all corners-sm group"
                  style={{
                    background: 'var(--bg-terminal)',
                    border: '1px solid var(--border-faint)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--neon-green)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-faint)';
                  }}
                >
                  <img
                    src={item.manga_cover}
                    alt={item.manga_title}
                    className="w-14 h-20 object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="kicker"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      // CH {item.chapter_number}
                    </p>
                    <h3
                      className="text-sm font-bold truncate mt-1"
                      style={{ color: 'var(--fg-primary)' }}
                    >
                      {item.manga_title}
                    </h3>
                    <p
                      className="mono text-[10px] uppercase tracking-widest mt-2"
                      style={{ color: 'var(--neon-green)' }}
                    >
                      ▶ RESUME_STREAM
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* FEATURED */}
        <Section
          kicker="// STREAM_02"
          title="Recommended by Arasaka"
          accent="var(--arasaka-red)"
          icon={<Flame className="w-3.5 h-3.5" />}
        >
          <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-hide snap-x">
            {featured.map((manga) => (
              <div
                key={manga.id}
                className="min-w-[160px] md:min-w-[200px] snap-start cursor-pointer group corners-sm"
                onClick={() => router.push(`/manga/${manga.id}`)}
              >
                <div
                  className="relative aspect-[2/3] overflow-hidden mb-3 transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-faint)',
                  }}
                >
                  <img
                    src={manga.cover}
                    alt={manga.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div
                    className="absolute bottom-0 left-0 w-full p-2"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
                    }}
                  >
                    <span
                      className="mono text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                      style={{
                        background: 'var(--arasaka-red)',
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      TOP_TIER
                    </span>
                  </div>
                </div>
                <h3
                  className="text-sm font-medium truncate group-hover:text-white"
                  style={{ color: 'var(--fg-secondary)' }}
                >
                  {manga.title}
                </h3>
                <p
                  className="mono text-[10px] truncate uppercase tracking-widest"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {manga.categories?.slice(0, 2).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* RECENT */}
        <Section
          kicker="// STREAM_03"
          title="Recently Added"
          accent="var(--neon-cyan)"
          icon={<Clock className="w-3.5 h-3.5" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
            {recent.map((manga) => (
              <MangaCard key={manga.id} manga={manga as GridManga} />
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({
  kicker,
  title,
  accent,
  icon,
  children,
}: {
  kicker: string;
  title: string;
  accent: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-2" style={{ color: accent }}>
          {icon}
          <span
            className="mono text-[11px] uppercase tracking-[0.18em] font-bold"
          >
            {kicker}
          </span>
        </div>
        <div
          className="flex-1 h-px"
          style={{ background: 'var(--border-faint)' }}
        />
      </div>
      <h2
        className="display text-2xl mb-6"
        style={{ color: 'var(--fg-primary)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function SearchBar({
  query,
  setQuery,
  searching,
}: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
}) {
  return (
    <div className="mb-10 flex justify-end">
      <div className="relative w-full md:w-[420px]">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          {searching ? (
            <span className="loader-dot" style={{ color: 'var(--arasaka-red)' }} />
          ) : (
            <Search
              className="w-4 h-4"
              style={{ color: 'var(--fg-muted)' }}
            />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="// QUERY THE GRID..."
          className="w-full py-2.5 pl-10 pr-4 mono text-sm outline-none transition-all uppercase tracking-wider"
          style={{
            background: 'var(--bg-terminal)',
            border: '1px solid var(--border-mid)',
            color: 'var(--fg-primary)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--arasaka-red)';
            e.currentTarget.style.boxShadow = 'var(--glow-red)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-mid)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>
    </div>
  );
}
