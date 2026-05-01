'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Check, Heart, ListPlus, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api, tokenStore } from '@/lib/api';
import { AdultPageGate, useAdultReveal } from '@/components/AdultLock';
import { LanguageBadge } from '@/components/LanguageBadge';
import { isAdultRating } from '@/lib/types';

type ListSummary = {
  id: number;
  name: string;
  item_count: number;
  items: { id: number; manga: { id: number } }[];
};

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
  content_rating?: string;
  categories: Category[];
  chapter_count: number;
};

type Chapter = {
  id: number;
  number: string;
  title: string | null;
  translated_language?: string | null;
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
    <>
      <AdultGate
        manga={manga}
        authed={authed}
        onBack={() => router.push('/')}
      />
      <MangaDetailBody
        manga={manga}
        chapters={chapters}
        params={params}
        router={router}
        authed={authed}
        isFavorite={isFavorite}
        favLoading={favLoading}
        toggleFavorite={toggleFavorite}
      />
    </>
  );
}

function AdultGate({
  manga,
  authed,
  onBack,
}: {
  manga: MangaDetail;
  authed: boolean;
  onBack: () => void;
}) {
  const { isAdult, revealed, reveal } = useAdultReveal(manga.id, manga.content_rating);
  if (!isAdult || revealed) return null;
  return (
    <AdultPageGate
      rating={manga.content_rating}
      hasAccess={authed}
      onReveal={reveal}
      onBack={onBack}
    />
  );
}

type MangaDetailBodyProps = {
  manga: MangaDetail;
  chapters: Chapter[];
  params: { id: string } | null;
  router: ReturnType<typeof useRouter>;
  authed: boolean;
  isFavorite: boolean;
  favLoading: boolean;
  toggleFavorite: () => Promise<void>;
};

function MangaDetailBody({
  manga,
  chapters,
  params,
  router,
  authed,
  isFavorite,
  favLoading,
  toggleFavorite,
}: MangaDetailBodyProps) {
  const { isAdult, revealed } = useAdultReveal(manga.id, manga.content_rating);
  if (isAdult && !revealed) return null;
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
              {params?.id && <AddToListMenu mangaId={Number(params.id)} authed={authed} />}
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
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <span
                        className="mono text-sm font-bold w-14 shrink-0"
                        style={{ color: 'var(--arasaka-red)' }}
                      >
                        #{chapter.number.padStart(3, '0')}
                      </span>
                      <span
                        className="text-sm truncate flex-1"
                        style={{ color: 'var(--fg-secondary)' }}
                      >
                        {chapter.title || `Chapter ${chapter.number}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <LanguageBadge code={chapter.translated_language} />
                      <span
                        className="mono text-[10px] uppercase tracking-widest hidden sm:inline"
                        style={{ color: 'var(--fg-muted)' }}
                      >
                        READ →
                      </span>
                    </div>
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

// ---------------------------------------------------------------------------
// Add-to-List menu (popover with existing lists toggle + create new)
// ---------------------------------------------------------------------------
function AddToListMenu({
  mangaId,
  authed,
}: {
  mangaId: number;
  authed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ results: ListSummary[] } | ListSummary[]>(
        '/accounts/lists/',
      );
      setLists(Array.isArray(res) ? res : res.results ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, refresh]);

  const inList = (l: ListSummary) =>
    l.items?.some((it) => it.manga.id === mangaId) ?? false;

  const toggle = async (l: ListSummary) => {
    setBusyId(l.id);
    try {
      if (inList(l)) {
        await api.delete(`/accounts/lists/${l.id}/items/${mangaId}/`);
        toast.success(`// REMOVIDO DE ${l.name.toUpperCase()}`);
      } else {
        await api.post(`/accounts/lists/${l.id}/add/`, { manga_id: mangaId });
        toast.success(`// ADICIONADO A ${l.name.toUpperCase()}`);
      }
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error(err.message);
      } else {
        console.error(err);
        toast.error('// LIST_FAIL');
      }
    } finally {
      setBusyId(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const list = await api.post<{ id: number; name: string }>(
        '/accounts/lists/',
        { name: trimmed },
      );
      await api.post(`/accounts/lists/${list.id}/add/`, { manga_id: mangaId });
      setNewName('');
      toast.success(`// CRIADA: ${list.name.toUpperCase()}`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error(err.message);
      } else {
        console.error(err);
        toast.error('// CREATE_FAIL');
      }
    } finally {
      setCreating(false);
    }
  };

  const onClickButton = () => {
    if (!authed) {
      router.push(`/login?next=/manga/${mangaId}`);
      return;
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onClickButton}
        title="Adicionar a uma lista"
        className="flex items-center gap-2 px-4 py-2 mono text-[11px] uppercase tracking-widest transition-all"
        style={{
          background: open ? 'rgba(220,38,38,0.1)' : 'transparent',
          border: open
            ? '1px solid var(--arasaka-red)'
            : '1px solid var(--border-mid)',
          color: open ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
        }}
      >
        <ListPlus className="w-3.5 h-3.5" />
        <span className="hidden md:inline">+ LIST</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 z-40 bracket"
          style={{
            background: 'var(--bg-deck)',
            border: '1px solid var(--border-faint)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="px-3 py-2 mono text-[10px] uppercase tracking-[0.3em]"
            style={{
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--arasaka-red)',
              color: 'var(--fg-muted)',
            }}
          >
            // ADD_TO_READING_LIST
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div
                className="p-4 mono text-[10px] uppercase tracking-widest text-center"
                style={{ color: 'var(--fg-muted)' }}
              >
                // LOADING_LISTS...
              </div>
            )}
            {!loading && lists.length === 0 && (
              <div
                className="p-4 mono text-[10px] uppercase tracking-widest text-center"
                style={{ color: 'var(--fg-muted)' }}
              >
                // NO_LISTS_YET
              </div>
            )}
            {!loading &&
              lists.map((l) => {
                const active = inList(l);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggle(l)}
                    disabled={busyId === l.id}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50"
                    style={{
                      background: active
                        ? 'rgba(220,38,38,0.08)'
                        : 'transparent',
                      color: active
                        ? 'var(--arasaka-red)'
                        : 'var(--fg-secondary)',
                      borderBottom: '1px solid var(--border-faint)',
                    }}
                    onMouseEnter={(e) => {
                      if (!active)
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {active ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <span
                          className="w-3.5 h-3.5 flex-shrink-0"
                          style={{
                            border: '1px solid var(--border-mid)',
                          }}
                        />
                      )}
                      <span className="text-sm truncate">{l.name}</span>
                    </span>
                    <span
                      className="mono text-[9px] tabular-nums uppercase tracking-widest flex-shrink-0"
                      style={{
                        color: active
                          ? 'var(--arasaka-red)'
                          : 'var(--fg-muted)',
                      }}
                    >
                      {String(l.item_count).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
          </div>

          <form
            onSubmit={create}
            className="p-3 space-y-2"
            style={{ borderTop: '1px solid var(--border-faint)' }}
          >
            <p
              className="mono text-[10px] uppercase tracking-[0.3em]"
              style={{ color: 'var(--arasaka-red)' }}
            >
              // NEW_LIST
            </p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da lista"
                maxLength={80}
                className="flex-1 px-3 py-2 text-sm focus:outline-none mono"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-primary)',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--arasaka-red)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-mid)')
                }
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="mono px-3 py-2 text-[11px] uppercase tracking-widest font-bold disabled:opacity-40"
                title="Criar lista e adicionar este mangá"
                style={{
                  background: 'var(--arasaka-red)',
                  color: '#fff',
                  border: '1px solid var(--arasaka-red)',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
