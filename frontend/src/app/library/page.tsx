'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bookmark, Heart, Loader2, ListPlus, PlayCircle, Plus, Trash2 } from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';

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
      <div className="min-h-screen flex items-center justify-center bg-black text-red-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        <header className="mb-8 border-b border-zinc-900 pb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Personal Vault</p>
          <h1 className="text-3xl font-black tracking-tighter mt-2">Biblioteca</h1>
        </header>

        <div className="flex gap-1 mb-8 border-b border-zinc-900">
          <TabButton active={tab === 'progress'} onClick={() => setTab('progress')} icon={<PlayCircle className="w-4 h-4" />} label={`Lendo (${data.in_progress.length})`} />
          <TabButton active={tab === 'favorites'} onClick={() => setTab('favorites')} icon={<Heart className="w-4 h-4" />} label={`Favoritos (${data.favorites.length})`} />
          <TabButton active={tab === 'lists'} onClick={() => setTab('lists')} icon={<Bookmark className="w-4 h-4" />} label={`Listas (${data.lists.length})`} />
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest border-b-2 transition-all ${
        active
          ? 'border-red-600 text-red-500'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProgressTab({ progress }: { progress: Progress[] }) {
  if (progress.length === 0) {
    return <Empty hint="Você ainda não começou a ler nada. Volte ao catálogo e comece um capítulo." />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {progress.map((p) => (
        <Link
          key={p.id}
          href={`/read/${p.chapter}`}
          className="flex gap-4 p-4 border border-zinc-900 hover:border-red-900/60 bg-zinc-950/50 rounded transition-all"
        >
          <img src={p.manga_cover} alt={p.manga_title} className="w-16 h-24 object-cover rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Continuar lendo</p>
            <h3 className="text-sm font-bold text-white truncate mt-1">{p.manga_title}</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Capítulo {p.chapter_number}
              {p.chapter_title ? ` — ${p.chapter_title}` : ''}
            </p>
            <p className="text-[11px] text-zinc-600 mt-2">
              Página {p.page_number || 1}
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
    return <Empty hint='Sem favoritos ainda. Use o ícone de coração na página de cada mangá.' />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
      {favorites.map((manga) => (
        <div key={manga.id} className="group relative">
          <Link href={`/manga/${manga.id}`}>
            <div className="aspect-[2/3] overflow-hidden rounded-md bg-zinc-900">
              <img
                src={manga.cover || '/placeholder.jpg'}
                alt={manga.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <h3 className="mt-2 text-xs font-bold text-zinc-300 line-clamp-2">
              {manga.title}
            </h3>
          </Link>
          <button
            onClick={() => onRemove(manga.id)}
            className="absolute top-2 right-2 p-1.5 bg-black/80 border border-zinc-800 rounded hover:border-red-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
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
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-600"
          maxLength={80}
        />
        <button
          type="submit"
          disabled={creating || !newListName.trim()}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 px-4 py-2 text-xs font-bold uppercase tracking-widest"
        >
          <Plus className="w-4 h-4" /> Criar
        </button>
      </form>

      {lists.length === 0 ? (
        <Empty
          icon={<ListPlus className="w-10 h-10 text-zinc-700" />}
          hint="Crie listas para organizar seus mangás (ex: Para ler, Lendo, Concluídos)."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lists.map((list) => (
            <article
              key={list.id}
              className="border border-zinc-900 bg-zinc-950/50 p-5 rounded"
            >
              <header className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{list.name}</h3>
                  <p className="text-[11px] text-zinc-500">
                    {list.item_count} mangá{list.item_count === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(list.id)}
                  className="text-zinc-600 hover:text-red-500 p-1"
                  title="Excluir lista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </header>
              {list.description && (
                <p className="text-xs text-zinc-500 mb-3">{list.description}</p>
              )}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {list.items.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    href={`/manga/${item.manga.id}`}
                    className="min-w-[60px] aspect-[2/3] rounded overflow-hidden bg-zinc-900 hover:ring-2 hover:ring-red-600 transition"
                  >
                    <img
                      src={item.manga.cover || '/placeholder.jpg'}
                      alt={item.manga.title}
                      className="h-full w-full object-cover"
                    />
                  </Link>
                ))}
                {list.item_count === 0 && (
                  <p className="text-xs text-zinc-600 italic">Lista vazia.</p>
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
      {icon ?? <Bookmark className="w-10 h-10 text-zinc-700 mb-3" />}
      <p className="text-sm text-zinc-500 max-w-md">{hint}</p>
    </div>
  );
}
