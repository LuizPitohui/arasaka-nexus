'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import Loader from '@/components/Loader';
import { MangaCard } from '@/components/MangaGrid';
import { SourceBadge, isImportableSource } from '@/components/SourceBadge';
import { ApiError, api } from '@/lib/api';

type SearchResult = {
  id: number | string;
  title: string;
  cover: string;
  status?: string;
  mangadex_id?: string | null;
  in_library?: boolean;
  source?: string;
  external_id?: string;
  sub_source?: string;
};

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [throttled, setThrottled] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setThrottled(false);
    api
      .get<SearchResult[]>(`/search/?q=${encodeURIComponent(query)}`, {
        auth: false,
      })
      .then((data) => {
        if (cancelled) return;
        setResults(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429) {
          setThrottled(true);
        } else {
          console.error(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const open = async (m: SearchResult) => {
    if (m.in_library && typeof m.id === 'number' && m.id > 0) {
      router.push(`/manga/${m.id}`);
      return;
    }
    if (m.mangadex_id) {
      const loading = toast.loading('// IMPORTANDO...');
      try {
        const res = await api.post<{ manga_id: number }>('/import/', {
          mangadex_id: m.mangadex_id,
        });
        toast.dismiss(loading);
        if (res.manga_id) router.push(`/manga/${res.manga_id}`);
      } catch (err) {
        toast.dismiss(loading);
        console.error(err);
        toast.error('// IMPORT_FAIL — tente de novo');
      }
      return;
    }
    if (!isImportableSource(m.source)) {
      toast.info(
        `Fonte "${(m.source ?? 'externa').toUpperCase()}" ainda não tem import automático.`,
      );
    }
  };

  if (!query) {
    return (
      <main
        className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto"
        style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
      >
        <p className="kicker mb-2">// SEARCH_TERMINAL</p>
        <h1 className="display text-3xl">Use a barra de busca acima</h1>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      <p className="kicker mb-2">// SEARCH_RESULTS</p>
      <h1 className="display text-2xl md:text-3xl mb-1">
        &quot;{query}&quot;
      </h1>
      <p
        className="mono text-[11px] uppercase tracking-widest mb-8"
        style={{ color: 'var(--fg-muted)' }}
      >
        {loading
          ? '// SCANNING_GRID...'
          : throttled
            ? '// RATE_LIMIT — aguarde alguns segundos'
            : `// ${String(results.length).padStart(2, '0')} ENTRADAS`}
      </p>

      {loading && results.length === 0 ? (
        <Loader label="SCANNING_GRID" caption="// QUERYING_DATABASE" />
      ) : results.length === 0 ? (
        <div
          className="py-16 text-center mono text-xs uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          // NULL_RESULT — nenhum mangá encontrado para &quot;{query}&quot;.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
          {results.map((m, i) => (
            <div
              key={`${m.source ?? 'mangadex'}-${m.external_id ?? m.id}`}
              onClick={() => open(m)}
              className="cursor-pointer relative"
            >
              <div className="absolute top-2 right-2 z-10">
                <SourceBadge source={m.source} inLibrary={m.in_library} subSource={m.sub_source} />
              </div>
              <MangaCard
                index={i}
                manga={{
                  id: typeof m.id === 'number' ? m.id : 0,
                  title: m.title,
                  cover: m.cover,
                  status: m.status,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: 'var(--bg-void)' }}>
          <Loader fullscreen label="LOADING" caption="// QUERY_TERMINAL" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
