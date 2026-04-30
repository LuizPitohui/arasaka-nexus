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
  const authed = typeof window !== 'undefined' && Boolean(tokenStore.getAccess());

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<MangaDetail>(`/mangas/${params.id}/`, { auth: false }),
      api.get<Paginated<Chapter>>(`/chapters/?manga=${params.id}`, { auth: false }),
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
        toast.success('Removido dos favoritos.');
      } else {
        await api.post('/accounts/favorites/', { manga_id: Number(params.id) });
        setIsFavorite(true);
        toast.success('Adicionado aos favoritos.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=/manga/${params.id}`);
      } else {
        toast.error('Falha ao atualizar favoritos.');
      }
    } finally {
      setFavLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-red-600 animate-pulse">
        CARREGANDO DADOS...
      </div>
    );
  }
  if (!manga) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="fixed inset-0 h-96 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black z-10" />
        <img src={manga.cover} alt="" className="w-full h-full object-cover opacity-30 blur-xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto p-6 md:pt-20">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" /> Voltar para Home
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-72 flex-shrink-0">
            <img
              src={manga.cover}
              alt={manga.title}
              className="w-full rounded-lg shadow-2xl shadow-red-900/20 border border-zinc-800"
            />
            <div className="mt-4 flex gap-2 flex-wrap">
              {manga.categories?.map((cat) => (
                <span
                  key={cat.id}
                  className="text-[10px] bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase tracking-wider"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-4xl md:text-5xl font-black text-white flex-1">
                {manga.title}
              </h1>
              <button
                onClick={toggleFavorite}
                disabled={favLoading}
                className={`flex items-center gap-2 px-4 py-2 border text-xs uppercase tracking-widest transition-all ${
                  isFavorite
                    ? 'border-red-600 bg-red-950/30 text-red-500 hover:bg-red-950/50'
                    : 'border-zinc-700 text-zinc-400 hover:border-red-600 hover:text-red-500'
                } disabled:opacity-50`}
                title={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
              >
                <Heart
                  className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`}
                />
                <span className="hidden md:inline">
                  {isFavorite ? 'Favoritado' : 'Favoritar'}
                </span>
              </button>
            </div>
            <p className="text-zinc-500 text-sm mb-6 leading-relaxed max-w-2xl">
              {manga.description || 'Sem descrição disponível.'}
            </p>

            <div className="flex items-center gap-6 mb-10 border-b border-zinc-800 pb-6">
              <div className="flex flex-col">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Status</span>
                <span className="font-bold text-white">{manga.status}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Capítulos</span>
                <span className="font-bold text-white">
                  {manga.chapter_count ?? chapters.length}
                </span>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-red-600" /> Capítulos Disponíveis
            </h3>

            <div className="grid gap-2">
              {chapters.length === 0 ? (
                <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800 text-zinc-500 text-sm">
                  Nenhum capítulo sincronizado ainda. O sistema está buscando...
                </div>
              ) : (
                chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/read/${chapter.id}`}
                    className="flex items-center justify-between p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 hover:border-red-900/50 rounded transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-zinc-300 group-hover:text-red-500 w-12">
                        #{chapter.number}
                      </span>
                      <span className="text-sm text-zinc-400 group-hover:text-white truncate">
                        {chapter.title || `Capítulo ${chapter.number}`}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600">LER</span>
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
