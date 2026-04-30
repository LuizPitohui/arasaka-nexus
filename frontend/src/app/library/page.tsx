'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Bookmark,
  Heart,
  ListPlus,
  PlayCircle,
  Plus,
  Trash2,
} from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';
import Loader from '@/components/Loader';

type MangaSummary = {
  id: number;
  title: string;
  cover: string;
  status?: string;
  categories?: string[];
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

type ReadingList = {
  id: number;
  name: string;
  description: string;
  is_public: boolean;
  item_count: number;
  items: { id: number; manga: MangaSummary; position: number }[];
};

type LibraryOverview = {
  favorites: MangaSummary[];
  in_progress: Progress[];
  lists: ReadingList[];
};

type Tab = 'progress' | 'favorites' | 'lists';

export default function LibraryPage() {
  const router = useRouter();
  const [data, setData] = useState<LibraryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('progress');
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  const reload = async () => {
    try {
      const fresh = await api.get<LibraryOverview>('/accounts/library/');
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
      .get<LibraryOverview>('/accounts/library/')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login?next=/library');
        } else {
          toast.error('Falha ao carregar biblioteca.');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

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
    if (!confirm('Excluir esta lista? Os mangás dentro dela não serão apagados.')) return;
    try {
      await api.delete(`/accounts/lists/${listId}/`);
      toast.success('Lista excluída.');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao excluir.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="OPENING_VAULT" caption="// DECRYPTING_PERSONAL_INDEX" />
      </div>
    );
  }
  if (!data) return null;

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
            // PERSONAL_VAULT
          </p>
          <div className="flex items-baseline justify-between gap-4 mt-3 flex-wrap">
            <h1
              className="glitch-3 text-4xl md:text-5xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Biblioteca
            </h1>
            <p
              className="mono text-[11px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              {data.in_progress.length + data.favorites.length} ITENS · {data.lists.length}{' '}
              LISTAS
            </p>
          </div>
        </header>

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

        {tab === 'progress' && <ProgressTab progress={data.in_progress} />}
        {tab === 'favorites' && (
          <FavoritesTab favorites={data.favorites} onRemove={handleUnfavorite} />
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
            boxShadow: '0 0 8px var(--arasaka-red)',
          }}
        />
      )}
    </button>
  );
}

function ProgressTab({ progress }: { progress: Progress[] }) {
  if (progress.length === 0) {
    return (
      <Empty hint="Você ainda não começou a ler nada. Volte ao catálogo e comece um capítulo." />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {progress.map((p) => (
        <Link
          key={p.id}
          href={`/read/${p.chapter}`}
          className="group corners-sm flex gap-4 p-4 transition-colors"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-faint)';
          }}
        >
          <div
            className="shrink-0 corners-sm overflow-hidden"
            style={{ width: 64, height: 96, border: '1px solid var(--border-faint)' }}
          >
            <img
              src={p.manga_cover}
              alt={p.manga_title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              ▶ RESUME
            </p>
            <h3
              className="text-sm font-bold truncate mt-1"
              style={{ color: 'var(--fg-primary)' }}
            >
              {p.manga_title}
            </h3>
            <p
              className="text-xs mt-1 truncate"
              style={{ color: 'var(--fg-secondary)' }}
            >
              Cap. {p.chapter_number}
              {p.chapter_title ? ` — ${p.chapter_title}` : ''}
            </p>
            <p
              className="mono text-[10px] mt-2 uppercase tracking-widest tabular-nums"
              style={{ color: 'var(--fg-muted)' }}
            >
              PG {String(p.page_number || 1).padStart(3, '0')}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FavoritesTab({
  favorites,
  onRemove,
}: {
  favorites: MangaSummary[];
  onRemove: (id: number) => void;
}) {
  if (favorites.length === 0) {
    return (
      <Empty hint='Sem favoritos ainda. Use o ícone de coração na página de cada mangá.' />
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
      {favorites.map((manga) => (
        <div key={manga.id} className="group relative">
          <Link href={`/manga/${manga.id}`} className="block corners-sm">
            <div
              className="aspect-[2/3] overflow-hidden"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-faint)',
              }}
            >
              <img
                src={manga.cover || '/placeholder.jpg'}
                alt={manga.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </div>
            <h3
              className="mt-3 text-[13px] font-semibold line-clamp-2"
              style={{ color: 'var(--fg-secondary)' }}
            >
              {manga.title}
            </h3>
          </Link>
          <button
            onClick={() => onRemove(manga.id)}
            className="absolute top-2 right-2 p-1.5 transition opacity-0 group-hover:opacity-100"
            style={{
              background: 'rgba(0,0,0,0.85)',
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
            title="Remover dos favoritos"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

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
  return (
    <div>
      <form onSubmit={onCreate} className="flex gap-2 mb-8 max-w-md">
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="Nova lista (ex: Para reler)"
          className="flex-1 px-3 py-2 text-sm focus:outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-mid)',
            color: 'var(--fg-primary)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--arasaka-red)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
          maxLength={80}
        />
        <button
          type="submit"
          disabled={creating || !newListName.trim()}
          className="mono flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
          style={{
            background: 'var(--arasaka-red)',
            color: '#fff',
            border: '1px solid var(--arasaka-red)',
          }}
        >
          <Plus className="w-4 h-4" /> Criar
        </button>
      </form>

      {lists.length === 0 ? (
        <Empty
          icon={<ListPlus className="w-10 h-10" style={{ color: 'var(--fg-muted)' }} />}
          hint="Crie listas para organizar seus mangás (ex: Para ler, Lendo, Concluídos)."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lists.map((list) => (
            <article
              key={list.id}
              className="corners-sm p-5"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-faint)',
              }}
            >
              <header className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3
                    className="text-lg font-bold truncate"
                    style={{ color: 'var(--fg-primary)' }}
                  >
                    {list.name}
                  </h3>
                  <p
                    className="mono text-[10px] uppercase tracking-widest mt-0.5"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    {list.item_count.toString().padStart(2, '0')} ENTRADAS
                  </p>
                </div>
                <button
                  onClick={() => onDelete(list.id)}
                  className="p-1 transition-colors"
                  style={{ color: 'var(--fg-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--arasaka-red)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fg-muted)')}
                  title="Excluir lista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </header>
              {list.description && (
                <p
                  className="text-xs mb-3"
                  style={{ color: 'var(--fg-secondary)' }}
                >
                  {list.description}
                </p>
              )}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {list.items.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    href={`/manga/${item.manga.id}`}
                    className="shrink-0 corners-sm overflow-hidden transition"
                    style={{
                      width: 60,
                      aspectRatio: '2 / 3',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-faint)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-faint)';
                    }}
                  >
                    <img
                      src={item.manga.cover || '/placeholder.jpg'}
                      alt={item.manga.title}
                      className="h-full w-full object-cover"
                    />
                  </Link>
                ))}
                {list.item_count === 0 && (
                  <p
                    className="mono text-[10px] uppercase tracking-widest italic"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    // EMPTY_LIST
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, hint }: { icon?: React.ReactNode; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon ?? (
        <Bookmark className="w-10 h-10 mb-3" style={{ color: 'var(--fg-muted)' }} />
      )}
      <p
        className="mono text-[11px] uppercase tracking-widest max-w-md"
        style={{ color: 'var(--fg-muted)' }}
      >
        // {hint}
      </p>
    </div>
  );
}
