'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  BookOpen,
  Bookmark,
  ChevronRight,
  Crown,
  Filter,
  Heart,
  Layers,
  ListPlus,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';
import Loader from '@/components/Loader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MangaSummary = {
  id: number;
  title: string;
  cover: string;
  status?: string;
  categories?: string[];
  work_id?: number | null;
  work_sources_count?: number;
};

type Progress = {
  id: number;
  chapter: number;
  chapter_number: string;
  chapter_title: string | null;
  manga_id: number;
  manga_title: string;
  manga_cover: string;
  page_number: number;
  completed: boolean;
  updated_at: string;
};

type UserBrief = { id: number; username: string; avatar: string | null };

type ReadingList = {
  id: number;
  name: string;
  description: string;
  is_public: boolean;
  item_count: number;
  items: { id: number; manga: MangaSummary; position: number; added_at: string }[];
  owner: UserBrief;
  collaborators: UserBrief[];
  my_role: 'owner' | 'collaborator' | 'viewer';
};

type LibraryOverview = {
  sort?: FavSort;
  favorites: MangaSummary[];
  in_progress: Progress[];
  lists: ReadingList[];
};

type Tab = 'progress' | 'favorites' | 'lists';

type FavSort =
  | 'updated'
  | 'added'
  | 'added_asc'
  | 'alpha'
  | 'alpha_desc'
  | 'chapters';

const FAV_SORT_OPTIONS: { value: FavSort; label: string }[] = [
  { value: 'updated', label: 'Atualizado' },
  { value: 'added', label: 'Adicionado ↓' },
  { value: 'added_asc', label: 'Adicionado ↑' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'alpha_desc', label: 'Z → A' },
  { value: 'chapters', label: 'Mais caps' },
];

const FAV_SORT_STORAGE_KEY = 'nexus_vault_fav_sort';
const FAV_SORT_VALUES = FAV_SORT_OPTIONS.map((o) => o.value);

function isFavSort(v: string): v is FavSort {
  return (FAV_SORT_VALUES as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n: number) => n.toLocaleString('pt-BR');

function timeAgoShort(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}sem`;
  const months = Math.floor(days / 30);
  return `${months}mes`;
}

// useCountUp inline — anima de 0 → target. Respeita prefers-reduced-motion.
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) {
      setValue(0);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.floor(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
          <Loader
            fullscreen
            label="OPENING_VAULT"
            caption="// DECRYPTING_PERSONAL_INDEX"
          />
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}

function isTab(v: string | null): v is Tab {
  return v === 'progress' || v === 'favorites' || v === 'lists';
}

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estado URL-driven: aba, sort de favoritos, filtro de busca. Permite
  // browser back/forward restaurar tudo + link compartilhavel pega o
  // mesmo estado pra outro user.
  const tabParam = searchParams.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'progress';
  const urlSort = searchParams.get('sort');
  const urlFilter = searchParams.get('q') ?? '';

  // Helper pra atualizar a URL preservando outros params.
  // Usa `replace` (sem history entry) pra mudancas de UI (sort/filter/tab
  // que sao continuas) — back nao precisa voltar key-by-key.
  const updateUrl = (mutator: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    const qs = params.toString();
    router.replace(qs ? `/library?${qs}` : '/library', { scroll: false });
  };

  const setTab = (next: Tab) => {
    updateUrl((p) => {
      if (next === 'progress') p.delete('tab');
      else p.set('tab', next);
    });
  };

  const [data, setData] = useState<LibraryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  // Sort default vem da URL, fallback pra localStorage, fallback pra 'updated'.
  // URL ganha sempre que presente — links compartilhados sobrescrevem prefs locais.
  const [favSort, setFavSort] = useState<FavSort>(() => {
    if (urlSort && isFavSort(urlSort)) return urlSort;
    return 'updated';
  });
  const [favFilter, setFavFilter] = useState(urlFilter);

  // Hydrate sort do localStorage se a URL nao especificou
  useEffect(() => {
    if (urlSort) return;
    try {
      const stored = window.localStorage.getItem(FAV_SORT_STORAGE_KEY);
      if (stored && isFavSort(stored)) setFavSort(stored);
    } catch {
      /* no-op */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync favFilter -> URL com debounce 300ms pra evitar push por keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      updateUrl((p) => {
        if (favFilter.trim()) p.set('q', favFilter.trim());
        else p.delete('q');
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favFilter]);

  const reload = async (sortOverride?: FavSort) => {
    try {
      const s = sortOverride ?? favSort;
      const fresh = await api.get<LibraryOverview>(`/accounts/library/?sort=${s}`);
      setData(fresh);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      router.replace('/login?next=/library');
      return;
    }
    api
      .get<LibraryOverview>(`/accounts/library/?sort=${favSort}`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login?next=/library');
        } else {
          toast.error('Falha ao carregar biblioteca.');
        }
      })
      .finally(() => setLoading(false));
  }, [router, favSort]);

  const handleSortChange = (next: FavSort) => {
    setFavSort(next);
    try {
      window.localStorage.setItem(FAV_SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // Sort tb vai pra URL — link compartilhavel preserva preferencia.
    // Default 'updated' fica fora da URL pra mantela limpa.
    updateUrl((p) => {
      if (next === 'updated') p.delete('sort');
      else p.set('sort', next);
    });
  };

  const handleUnfavorite = async (mangaId: number) => {
    try {
      await api.delete(`/accounts/favorites/by-manga/${mangaId}/`);
      toast.success('Removido dos favoritos.');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao remover.');
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreatingList(true);
    try {
      await api.post('/accounts/lists/', { name: newListName.trim() });
      setNewListName('');
      toast.success('Lista criada.');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao criar lista.');
    } finally {
      setCreatingList(false);
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm('Excluir esta lista? Os mangás dentro dela não serão apagados.'))
      return;
    try {
      await api.delete(`/accounts/lists/${listId}/`);
      toast.success('Lista excluída.');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao excluir.');
    }
  };

  // Mapa pra exibir progresso em cima dos favoritos (cap. atual / status)
  const progressByMangaId = useMemo(() => {
    const m = new Map<number, Progress>();
    (data?.in_progress ?? []).forEach((p) => m.set(p.manga_id, p));
    return m;
  }, [data?.in_progress]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader
          fullscreen
          label="OPENING_VAULT"
          caption="// DECRYPTING_PERSONAL_INDEX"
        />
      </div>
    );
  }
  if (!data) return null;

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      {/* Ambient backdrop */}
      <div className="absolute inset-0 rank-grid-bg opacity-30 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto p-6 md:p-10">
        <VaultHeader data={data} />

        <StatsStrip data={data} />

        <TabBar tab={tab} setTab={setTab} data={data} />

        {tab === 'progress' && <ProgressTab progress={data.in_progress} />}
        {tab === 'favorites' && (
          <FavoritesTab
            favorites={data.favorites}
            sort={favSort}
            onSortChange={handleSortChange}
            filter={favFilter}
            setFilter={setFavFilter}
            progressByMangaId={progressByMangaId}
            onRemove={handleUnfavorite}
          />
        )}
        {tab === 'lists' && (
          <ListsTab
            lists={data.lists}
            newListName={newListName}
            setNewListName={setNewListName}
            onCreate={handleCreateList}
            creating={creatingList}
            onDelete={handleDeleteList}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function VaultHeader({ data }: { data: LibraryOverview }) {
  return (
    <header className="mb-8 rank-row-in">
      <p
        className="mono text-[11px] uppercase tracking-[0.3em]"
        style={{ color: 'var(--fg-muted)' }}
      >
        // PERSONAL_VAULT
      </p>
      <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
        <h1
          className="glitch-3 text-4xl md:text-5xl font-black tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          VAULT
        </h1>
        <p
          className="mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--arasaka-red)' }}
        >
          {fmt(data.in_progress.length + data.favorites.length)} ITENS ·{' '}
          {fmt(data.lists.length)} LISTAS
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Stats strip — 4 KPIs com count-up
// ---------------------------------------------------------------------------
function StatsStrip({ data }: { data: LibraryOverview }) {
  const totalItems = data.favorites.length;
  const inProgress = data.in_progress.length;
  const lists = data.lists.length;
  const completed = data.in_progress.filter((p) => p.completed).length;

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 rank-row-in"
      style={{ animationDelay: '60ms' }}
    >
      <StatCell
        icon={<Heart className="w-3.5 h-3.5" />}
        label="FAVORITOS"
        value={totalItems}
      />
      <StatCell
        icon={<PlayCircle className="w-3.5 h-3.5" />}
        label="EM ANDAMENTO"
        value={inProgress}
        accent
      />
      <StatCell
        icon={<Crown className="w-3.5 h-3.5" />}
        label="CONCLUIDOS"
        value={completed}
      />
      <StatCell
        icon={<Bookmark className="w-3.5 h-3.5" />}
        label="LISTAS"
        value={lists}
      />
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  const animated = useCountUp(value, 900);
  return (
    <div
      className="corners-sm p-3 md:p-4 relative overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${accent ? 'var(--arasaka-red)' : 'var(--border-faint)'}`,
      }}
    >
      {accent && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 40%, transparent 100%)',
          }}
        />
      )}
      <div
        className="mono text-[9px] uppercase tracking-widest flex items-center gap-1.5"
        style={{ color: 'var(--fg-muted)' }}
      >
        <span style={{ color: accent ? 'var(--arasaka-red)' : 'var(--fg-secondary)' }}>
          {icon}
        </span>
        {label}
      </div>
      <p
        className="text-2xl md:text-3xl font-black tabular-nums mt-1.5"
        style={{
          fontFamily: 'var(--font-display)',
          color: accent ? 'var(--arasaka-red)' : 'var(--fg-primary)',
        }}
      >
        {fmt(animated)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function TabBar({
  tab,
  setTab,
  data,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  data: LibraryOverview;
}) {
  return (
    <div
      className="flex gap-1 mb-8"
      style={{ borderBottom: '1px solid var(--border-faint)' }}
    >
      <TabButton
        active={tab === 'progress'}
        onClick={() => setTab('progress')}
        icon={<PlayCircle className="w-3.5 h-3.5" />}
        label="Lendo"
        count={data.in_progress.length}
      />
      <TabButton
        active={tab === 'favorites'}
        onClick={() => setTab('favorites')}
        icon={<Heart className="w-3.5 h-3.5" />}
        label="Favoritos"
        count={data.favorites.length}
      />
      <TabButton
        active={tab === 'lists'}
        onClick={() => setTab('lists')}
        icon={<Bookmark className="w-3.5 h-3.5" />}
        label="Listas"
        count={data.lists.length}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="mono flex items-center gap-2 px-4 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors relative"
      style={{
        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--fg-primary)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--fg-secondary)';
      }}
    >
      {icon}
      {label}
      <span
        className="tabular-nums"
        style={{ color: active ? 'var(--arasaka-red)' : 'var(--fg-muted)' }}
      >
        [{count.toString().padStart(2, '0')}]
      </span>
      {active && (
        <span
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--arasaka-red)',
            boxShadow: '0 0 12px var(--arasaka-red)',
          }}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab: Em andamento — cards ricos com cover background + progress
// ---------------------------------------------------------------------------
function ProgressTab({ progress }: { progress: Progress[] }) {
  if (progress.length === 0) {
    return (
      <EmptyState
        icon={<PlayCircle className="w-12 h-12" />}
        title="// NO_ACTIVE_STREAM"
        hint="Nenhum capítulo em andamento. Inicia uma obra no catálogo e ela aparece aqui pra retomar."
        cta={{ href: '/popular', label: 'Explorar populares' }}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {progress.map((p, i) => (
        <ProgressCard key={p.id} progress={p} index={i} />
      ))}
    </div>
  );
}

function ProgressCard({ progress: p, index }: { progress: Progress; index: number }) {
  return (
    <Link
      href={`/read/${p.chapter}`}
      className="group corners-sm flex gap-4 p-4 relative overflow-hidden transition-all rank-row-in"
      style={
        {
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
          animationDelay: `${Math.min(index * 40, 360)}ms`,
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--arasaka-red)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-faint)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Cover blur backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-15 pointer-events-none transition-opacity group-hover:opacity-25"
        style={{
          backgroundImage: `url(${p.manga_cover})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(20px) saturate(0.6)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, var(--bg-elevated) 30%, rgba(22,22,26,0.7) 100%)',
        }}
      />

      <div
        className="relative shrink-0 corners-sm overflow-hidden"
        style={{
          width: 72,
          height: 108,
          border: '1px solid var(--border-mid)',
        }}
      >
        <img
          src={p.manga_cover}
          alt={p.manga_title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {/* Status dot */}
        <span
          className="absolute top-1.5 right-1.5"
          style={{
            width: 8,
            height: 8,
            borderRadius: 0,
            background: p.completed ? 'var(--neon-green)' : 'var(--arasaka-red)',
            boxShadow: `0 0 8px ${p.completed ? 'var(--neon-green)' : 'var(--arasaka-red)'}`,
          }}
        />
      </div>
      <div className="relative flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p
            className="mono text-[10px] uppercase tracking-widest flex items-center gap-1.5"
            style={{ color: 'var(--arasaka-red)' }}
          >
            ▸ RESUME
            <span style={{ color: 'var(--fg-muted)' }}>· {timeAgoShort(p.updated_at)}</span>
          </p>
          <h3
            className="text-sm font-bold truncate mt-1"
            style={{ color: 'var(--fg-primary)' }}
          >
            {p.manga_title}
          </h3>
          <p
            className="text-xs mt-1 line-clamp-1"
            style={{ color: 'var(--fg-secondary)' }}
          >
            Cap. {p.chapter_number}
            {p.chapter_title ? ` — ${p.chapter_title}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p
            className="mono text-[10px] uppercase tracking-widest tabular-nums"
            style={{ color: 'var(--fg-muted)' }}
          >
            PG {String(p.page_number || 1).padStart(3, '0')}
          </p>
          <ChevronRight
            className="w-4 h-4 transition-transform group-hover:translate-x-1"
            style={{ color: 'var(--arasaka-red)' }}
          />
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tab: Favoritos — grid premium com filtro + overlay
// ---------------------------------------------------------------------------
function FavoritesTab({
  favorites,
  sort,
  onSortChange,
  filter,
  setFilter,
  progressByMangaId,
  onRemove,
}: {
  favorites: MangaSummary[];
  sort: FavSort;
  onSortChange: (next: FavSort) => void;
  filter: string;
  setFilter: (v: string) => void;
  progressByMangaId: Map<number, Progress>;
  onRemove: (id: number) => void;
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((m) => m.title.toLowerCase().includes(q));
  }, [favorites, filter]);

  return (
    <div>
      {/* Toolbar — search + sort */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <div
          className="flex items-center gap-2 px-3 py-2 flex-1 max-w-md"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-mid)',
          }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--fg-muted)' }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por título..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--fg-primary)' }}
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="p-0.5"
              style={{ color: 'var(--fg-muted)' }}
              aria-label="Limpar filtro"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="mono text-[10px] uppercase tracking-[0.3em] mr-1 flex items-center gap-1"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Filter className="w-3 h-3" /> ORDER
          </span>
          {FAV_SORT_OPTIONS.map((opt) => {
            const active = sort === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSortChange(opt.value)}
                className="mono text-[10px] uppercase tracking-widest px-2.5 py-1 transition-colors"
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
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-12 h-12" />}
          title="// NO_FAVORITES_INDEXED"
          hint="Marca obras com o coração na página de detalhe pra elas aparecerem aqui."
          cta={{ href: '/popular', label: 'Explorar catálogo' }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-12 h-12" />}
          title="// NO_MATCH"
          hint={`Nenhuma obra com "${filter}" entre seus favoritos.`}
        />
      ) : (
        <FavoritesGrid
          favorites={filtered}
          progressByMangaId={progressByMangaId}
          onRemove={onRemove}
        />
      )}

      {filter && filtered.length > 0 && (
        <p
          className="mono text-[10px] uppercase tracking-widest mt-6"
          style={{ color: 'var(--fg-muted)' }}
        >
          // {fmt(filtered.length)} de {fmt(favorites.length)} mostrados
        </p>
      )}
    </div>
  );
}

function FavoritesGrid({
  favorites,
  progressByMangaId,
  onRemove,
}: {
  favorites: MangaSummary[];
  progressByMangaId: Map<number, Progress>;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
      {favorites.map((manga, i) => (
        <FavoriteCard
          key={manga.id}
          manga={manga}
          progress={progressByMangaId.get(manga.id)}
          onRemove={onRemove}
          index={i}
        />
      ))}
    </div>
  );
}

function FavoriteCard({
  manga,
  progress,
  onRemove,
  index,
}: {
  manga: MangaSummary;
  progress?: Progress;
  onRemove: (id: number) => void;
  index: number;
}) {
  return (
    <div
      className="group relative rank-row-in"
      style={
        {
          animationDelay: `${Math.min(index * 25, 360)}ms`,
        } as React.CSSProperties
      }
    >
      <Link href={`/manga/${manga.id}`} className="block corners-sm">
        <div
          className="aspect-[2/3] overflow-hidden relative transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--arasaka-red)';
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-faint)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <img
            src={manga.cover || '/placeholder.jpg'}
            alt={manga.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />

          {/* Status chip — em andamento ou completo */}
          {progress && (
            <span
              className="absolute top-2 left-2 mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 inline-flex items-center gap-1"
              style={{
                background: 'rgba(0,0,0,0.85)',
                border: `1px solid ${progress.completed ? 'var(--neon-green)' : 'var(--arasaka-red)'}`,
                color: progress.completed ? 'var(--neon-green)' : 'var(--arasaka-red)',
              }}
            >
              {progress.completed ? '✓' : '▸'} CAP {progress.chapter_number}
            </span>
          )}

          {/* Multi-source badge */}
          {(manga.work_sources_count ?? 1) > 1 && (
            <span
              className="absolute top-2 right-2 mono text-[9px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                background: 'rgba(220,38,38,0.18)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--arasaka-red)',
                backdropFilter: 'blur(2px)',
              }}
              title={`${manga.work_sources_count} fontes`}
            >
              ▸ {manga.work_sources_count}
            </span>
          )}

          {/* Hover overlay com gradient bottom */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              background:
                'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
            }}
          />

          {/* Bottom info on hover */}
          <div
            className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ zIndex: 2 }}
          >
            <p
              className="mono text-[9px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              ▸ ABRIR
            </p>
          </div>
        </div>
        <h3
          className="mt-3 text-[13px] font-semibold line-clamp-2"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {manga.title}
        </h3>
        {progress && (
          <p
            className="mono text-[10px] mt-1 uppercase tracking-widest truncate"
            style={{ color: 'var(--fg-muted)' }}
          >
            // {timeAgoShort(progress.updated_at)} · cap {progress.chapter_number}
          </p>
        )}
      </Link>

      {/* Remove button — top right corner of CARD (outside link) */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            confirm(`Remover "${manga.title}" dos favoritos?`)
          ) {
            onRemove(manga.id);
          }
        }}
        className="absolute top-2 right-2 p-1.5 transition opacity-0 group-hover:opacity-100"
        style={{
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid var(--border-mid)',
          color: 'var(--fg-secondary)',
          // Sobreposicao: se ha multi-source badge tb no top-right, sobe esse
          top: (manga.work_sources_count ?? 1) > 1 ? '32px' : '8px',
          zIndex: 3,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.color = 'var(--arasaka-red)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-mid)';
          e.currentTarget.style.color = 'var(--fg-secondary)';
        }}
        title="Remover dos favoritos"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Listas — cards com stack de capas
// ---------------------------------------------------------------------------
function ListsTab({
  lists,
  newListName,
  setNewListName,
  onCreate,
  creating,
  onDelete,
}: {
  lists: ReadingList[];
  newListName: string;
  setNewListName: (v: string) => void;
  onCreate: (e: React.FormEvent) => void;
  creating: boolean;
  onDelete: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = newListName.trim();

  // Submit guarded: se input vazio, foca + toast em vez de ficar
  // disabled-darkened sem feedback ("obscurecido sem acontecer nada").
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (!trimmed) {
      inputRef.current?.focus();
      toast.error('Digite um nome pra lista primeiro.');
      return;
    }
    onCreate(e);
  };

  return (
    <div>
      {/* Form de criação */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 corners-sm p-4 max-w-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <p
          className="mono text-[10px] uppercase tracking-[0.3em] mb-3"
          style={{ color: 'var(--fg-muted)' }}
        >
          // CREATE_NEW_INDEX
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={inputRef}
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Ex: Para reler, Webtoons, Concluídos..."
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-primary)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--arasaka-red)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
            maxLength={80}
          />
          {/* Botao SEMPRE clickavel — sem disabled. Se nome vazio, handler
              foca o input + toast (em vez de parecer obscurecido sem reagir,
              feedback original do user). */}
          <button
            type="submit"
            className="mono flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors"
            style={{
              background: creating
                ? 'var(--arasaka-red-deep)'
                : 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
              cursor: creating ? 'wait' : 'pointer',
              opacity: creating ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!creating)
                e.currentTarget.style.background = 'var(--arasaka-red-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--arasaka-red)';
            }}
          >
            <Plus className="w-4 h-4" /> {creating ? 'CRIANDO...' : 'CRIAR'}
          </button>
        </div>
        <p
          className="mono text-[10px] uppercase tracking-widest mt-3"
          style={{ color: 'var(--fg-muted)' }}
        >
          // dica: tambem da pra criar lista direto na pagina de qualquer manga
        </p>
      </form>

      {lists.length === 0 ? (
        <EmptyState
          icon={<ListPlus className="w-12 h-12" />}
          title="// NO_INDEX_REGISTERED"
          hint="Crie listas pra organizar suas obras por status, tema ou prioridade."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lists.map((list, i) => (
            <ListCard
              key={list.id}
              list={list}
              onDelete={onDelete}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListCard({
  list,
  onDelete,
  index,
}: {
  list: ReadingList;
  onDelete: (id: number) => void;
  index: number;
}) {
  // Mostra os ULTIMOS 5 mangas adicionados (added_at desc). Sem scroll
  // horizontal — capas empilhadas estilo deck. Click no card abre a
  // pagina dedicada da lista com filtros + busca + todos os itens.
  const recentItems = useMemo(() => {
    const sorted = [...list.items].sort((a, b) =>
      (b.added_at || '').localeCompare(a.added_at || ''),
    );
    return sorted.slice(0, 5);
  }, [list.items]);

  return (
    <article
      className="rank-row-in"
      style={
        {
          animationDelay: `${Math.min(index * 40, 360)}ms`,
        } as React.CSSProperties
      }
    >
      <Link
        href={`/library/lists/${list.id}`}
        className="group corners-sm p-5 relative overflow-hidden transition-all block"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-faint)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              'linear-gradient(90deg, var(--arasaka-red) 0%, transparent 40%)',
            opacity: 0.6,
          }}
        />
        <header className="flex items-start justify-between mb-3 gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className="text-lg font-bold truncate transition-colors group-hover:text-[var(--arasaka-red)]"
              style={{ color: 'var(--fg-primary)' }}
            >
              {list.name}
            </h3>
            <p
              className="mono text-[10px] uppercase tracking-widest mt-0.5 flex items-center gap-1.5 flex-wrap"
              style={{ color: 'var(--fg-muted)' }}
            >
              <Layers className="w-3 h-3" />
              {list.item_count.toString().padStart(2, '0')} ENTRADAS
              {list.is_public && (
                <span
                  className="px-1 py-0.5"
                  style={{
                    background: 'var(--neon-cyan)',
                    color: 'var(--bg-base)',
                    letterSpacing: '0.1em',
                    fontSize: 9,
                  }}
                >
                  PUB
                </span>
              )}
              {list.my_role === 'collaborator' && (
                <span
                  className="px-1 py-0.5"
                  style={{
                    background: 'rgba(220,38,38,0.12)',
                    border: '1px solid var(--arasaka-red)',
                    color: 'var(--arasaka-red)',
                    letterSpacing: '0.1em',
                    fontSize: 9,
                  }}
                  title={`Owner: ${list.owner.username}`}
                >
                  ▸ COMPARTILHADA
                </span>
              )}
              {list.my_role === 'owner' && list.collaborators.length > 0 && (
                <span
                  className="px-1 py-0.5"
                  style={{
                    background: 'rgba(220,38,38,0.12)',
                    border: '1px solid var(--arasaka-red)',
                    color: 'var(--arasaka-red)',
                    letterSpacing: '0.1em',
                    fontSize: 9,
                  }}
                  title={`Compartilhada com ${list.collaborators.length} pessoa(s)`}
                >
                  +{list.collaborators.length}
                </span>
              )}
            </p>
          </div>
          {/* So owner pode excluir — colaborador "sai" via /library/lists/<id>. */}
          {list.my_role === 'owner' && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(list.id);
              }}
              className="p-1.5 transition-colors relative z-10"
              style={{
                color: 'var(--fg-muted)',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--arasaka-red)';
                e.currentTarget.style.borderColor = 'var(--arasaka-red)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--fg-muted)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              title="Excluir lista"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </header>
        {list.description && (
          <p
            className="text-xs mb-3 line-clamp-2"
            style={{ color: 'var(--fg-secondary)' }}
          >
            {list.description}
          </p>
        )}
        {list.item_count === 0 ? (
          <p
            className="mono text-[10px] uppercase tracking-widest italic py-4 text-center"
            style={{ color: 'var(--fg-muted)' }}
          >
            // EMPTY_INDEX — adicione obras na pagina de detalhe
          </p>
        ) : (
          <CoverStack items={recentItems} extra={list.item_count - recentItems.length} />
        )}
        <div
          className="mt-3 flex items-center justify-between mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          <span>// {recentItems.length === 0 ? 'sem' : 'ultimas'} adicoes</span>
          <span
            className="flex items-center gap-1 transition-colors group-hover:text-[var(--arasaka-red)]"
          >
            ABRIR LISTA <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </article>
  );
}

// Deck horizontal: flex com negative margin pra capas se sobreporem do
// canto direito. Cada capa fica em cima da anterior via z-index crescente.
// "+N" badge na ultima quando ha extras.
function CoverStack({
  items,
  extra,
}: {
  items: ReadingList['items'];
  extra: number;
}) {
  if (items.length === 0) return null;
  const W = 76;
  const H = 114;
  // Quanto cada capa "engole" da anterior. ~70% overlap deixa so uma
  // borda da capa anterior aparecendo, parecendo deck.
  const OVERLAP = 52;
  return (
    <div
      className="flex items-start"
      style={{ height: H, width: 'fit-content' }}
      aria-label={`${items.length} capas recentes`}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          className="corners-sm overflow-hidden relative shrink-0 transition-transform"
          style={{
            width: W,
            height: H,
            marginLeft: i === 0 ? 0 : -OVERLAP,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-mid)',
            zIndex: 10 + i,
            boxShadow:
              i > 0 ? '-6px 0 12px rgba(0,0,0,0.55)' : 'none',
          }}
        >
          <img
            src={item.manga.cover || '/placeholder.jpg'}
            alt={item.manga.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {i === items.length - 1 && extra > 0 && (
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: 'rgba(0,0,0,0.72)',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 22,
                letterSpacing: '0.02em',
              }}
            >
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state com arte cyberpunk
// ---------------------------------------------------------------------------
function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  hint: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      className="relative corners-sm py-16 px-6 text-center overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <div className="absolute inset-0 rank-grid-bg opacity-40 pointer-events-none" />
      <div className="rank-scan-overlay" />
      <div className="relative">
        <div
          className="inline-flex items-center justify-center mb-4 p-4 corners-sm"
          style={{
            background: 'var(--bg-base)',
            border: '1px solid var(--border-mid)',
            color: 'var(--arasaka-red)',
          }}
        >
          {icon ?? <Archive className="w-12 h-12" />}
        </div>
        <h3
          className="mono text-sm uppercase tracking-[0.25em] font-bold"
          style={{ color: 'var(--fg-primary)' }}
        >
          {title}
        </h3>
        <p
          className="mt-3 text-sm max-w-md mx-auto"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {hint}
        </p>
        {cta && (
          <Link
            href={cta.href}
            className="mono inline-flex items-center gap-2 mt-6 px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--arasaka-red-hover)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--arasaka-red)')
            }
          >
            <BookOpen className="w-4 h-4" />
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
