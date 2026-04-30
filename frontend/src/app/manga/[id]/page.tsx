'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Heart } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api, tokenStore } from '@/lib/api';

type Category = { id: number; name: string; slug: string };

type MangaDetail = {
  id: number;
  mangadex_id: string | null;
  title: string;
  alternative_title: string | null;
  description: string | null;
  cover: string;
  author: string;
  status: string;
  categories: Category[];
  chapter_count: number;
};

type Chapter = {
  id: number;
  number: string;
  title: string | null;
  release_date: string;
};

type Paginated<T> = { results: T[] } | T[];

export default function MangaDetails() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const authed =
    typeof window !== 'undefined' && Boolean(tokenStore.getAccess());

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<MangaDetail>(`/mangas/${params.id}/`, { auth: false }),
      api.get<Paginated<Chapter>>(`/chapters/?manga=${params.id}`, {
        auth: false,
      }),
    ])
      .then(([mangaData, chaptersData]) => {
        if (cancelled) return;
        setManga(mangaData);
        const list = Array.isArray(chaptersData)
          ? chaptersData
          : chaptersData.results ?? [];
        setChapters(list);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  useEffect(() => {
    if (!params?.id || !authed) return;
    api
      .get<{ is_favorite: boolean }>(
        `/accounts/favorites/check/?manga_id=${params.id}`,
      )
      .then((res) => setIsFavorite(res.is_favorite))
      .catch(() => {});
  }, [params?.id, authed]);

  const toggleFavorite = async () => {
    if (!authed) {
      router.push(`/login?next=/manga/${params?.id}`);
      return;
    }
    if (!params?.id) return;
    setFavLoading(true);
    try {
      if (isFavorite) {
        await api.delete(`/accounts/favorites/by-manga/${params.id}/`);
        setIsFavorite(false);
        toast.success('// REMOVED FROM VAULT');
      } else {
        await api.post('/accounts/favorites/', {
          manga_id: Number(params.id),
        });
        setIsFavorite(true);
        toast.success('// VAULTED');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=/manga/${params.id}`);
      } else {
        toast.error('// VAULT_FAIL');
      }
    } finally {
      setFavLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center mono text-xs uppercase tracking-[0.3em] animate-pulse"
        style={{ background: 'var(--bg-void)', color: 'var(--arasaka-red)' }}
      >
        // LOADING_DATA...
      </div>
    );
  }
  if (!manga) return null;

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      {/* Cover wash */}
      <div className="fixed inset-0 h-[480px] z-0">
        <div
          className="absolute inset-0 z-10"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 60%, var(--bg-void) 100%)',
          }}
        />
        <img
          src={manga.cover}
          alt=""
          className="w-full h-full object-cover opacity-25 blur-2xl"
        />
        {/* scanlines */}
        <div
          className="absolute inset-0 z-20 pointer-events-none opacity-30"
          style={{
            background:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto p-6 md:pt-16">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 mono text-[11px] uppercase tracking-widest mb-8 transition-colors hover:text-white"
          style={{ color: 'var(--fg-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" /> // RETURN_HOME
        </button>

        <p className="kicker mb-3">
          // VAULT_RECORD #{String(manga.id).padStart(5, '0')}
        </p>

        <div className="flex flex-col md:flex-row gap-10">
          <div className="w-full md:w-72 flex-shrink-0">
            <div
              className="relative bracket"
              style={{ border: '1px solid var(--border-faint)' }}
            >
              <img
                src={manga.cover}
                alt={manga.title}
                className="w-full block"
              />
            </div>
            <div className="mt-4 flex gap-1.5 flex-wrap">
              {manga.categories?.map((cat) => (
                <span
                  key={cat.id}
                  className="mono text-[10px] px-2 py-1 uppercase tracking-widest"
                  style={{
                    background: 'var(--bg-terminal)',
                    border: '1px solid var(--border-faint)',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  {cat.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1
                className="display text-4xl md:text-5xl flex-1"
                style={{ color: 'var(--fg-primary)' }}
              >
                {manga.title}
              </h1>
              <button
                onClick={toggleFavorite}
                disabled={favLoading}
                className="flex items-center gap-2 px-4 py-2 mono text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                style={{
                  background: isFavorite
                    ? 'rgba(220,38,38,0.1)'
                    : 'transparent',
                  border: isFavorite
                    ? '1px solid var(--arasaka-red)'
                    : '1px solid var(--border-mid)',
                  color: isFavorite
                    ? 'var(--arasaka-red)'
                    : 'var(--fg-secondary)',
                }}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`}
                />
                <span className="hidden md:inline">
                  {isFavorite ? 'IN_VAULT' : 'VAULT'}
                </span>
              </button>
            </div>

            {manga.alternative_title && (
              <p
                className="mono text-xs uppercase tracking-widest mb-4"
                style={{ color: 'var(--fg-muted)' }}
              >
                // ALT: {manga.alternative_title}
              </p>
            )}

            <p
              className="text-sm leading-relaxed max-w-2xl mb-8"
              style={{ color: 'var(--fg-secondary)' }}
            >
              {manga.description || '// NO_DESCRIPTION_AVAILABLE'}
            </p>

            <div
              className="flex flex-wrap items-end gap-6 md:gap-8 mb-10 pb-6"
              style={{ borderBottom: '1px solid var(--border-faint)' }}
            >
              <Stat label="STATUS" value={manga.status} />
              <Stat
                label="CHAPTERS"
                value={String(manga.chapter_count ?? chapters.length)}
              />
              <Stat
                label="SOURCE"
                value="MANGADEX_STREAM"
                accent="var(--neon-cyan)"
              />
              {chapters.length > 0 && (
                <Link
                  href={`/read/${chapters[0].id}`}
                  className="ml-auto mono inline-flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.3em] font-bold transition-colors"
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
                  <BookOpen className="w-3.5 h-3.5" /> ▸ INICIAR_STREAM
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3 mb-5">
              <BookOpen
                className="w-4 h-4"
                style={{ color: 'var(--arasaka-red)' }}
              />
              <p className="kicker">// CHAPTERS_AVAILABLE</p>
              <div
                className="flex-1 h-px"
                style={{ background: 'var(--border-faint)' }}
              />
              <span
                className="mono text-[11px]"
                style={{ color: 'var(--fg-muted)' }}
              >
                {chapters.length.toString().padStart(3, '0')}
              </span>
            </div>

            <div className="grid gap-1.5">
              {chapters.length === 0 ? (
                <div
                  className="p-4 mono text-xs uppercase tracking-widest"
                  style={{
                    background: 'var(--bg-terminal)',
                    border: '1px solid var(--border-faint)',
                    color: 'var(--fg-muted)',
                  }}
                >
                  // NO_CHAPTERS_SYNCED — system is fetching...
                </div>
              ) : (
                chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/read/${chapter.id}`}
                    className="flex items-center justify-between p-3.5 transition-all group"
                    style={{
                      background: 'var(--bg-terminal)',
                      border: '1px solid var(--border-faint)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                      e.currentTarget.style.background =
                        'rgba(220,38,38,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        'var(--border-faint)';
                      e.currentTarget.style.background = 'var(--bg-terminal)';
                    }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span
                        className="mono text-sm font-bold w-14"
                        style={{ color: 'var(--arasaka-red)' }}
                      >
                        #{chapter.number.padStart(3, '0')}
                      </span>
                      <span
                        className="text-sm truncate"
                        style={{ color: 'var(--fg-secondary)' }}
                      >
                        {chapter.title || `Chapter ${chapter.number}`}
                      </span>
                    </div>
                    <span
                      className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      READ →
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="mono text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--fg-muted)' }}
      >
        // {label}
      </span>
      <span
        className="mono text-sm font-bold uppercase tracking-[0.15em]"
        style={{ color: accent ?? 'var(--fg-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
