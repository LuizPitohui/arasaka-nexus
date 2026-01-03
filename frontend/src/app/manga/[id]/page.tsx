'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NextImage from 'next/image';
import Link from 'next/link'; // <--- IMPORTANTE: Módulo de Navegação
import { ArrowLeft, Calendar, BookOpen } from 'lucide-react';

interface Chapter {
  id: number;
  number: string;
  title: string;
  release_date: string;
}

interface MangaDetail {
  id: number;
  title: string;
  description: string;
  cover: string;
  author: string;
  status: string;
  chapters: Chapter[];
}

export default function MangaPage() {
  const params = useParams();
  const router = useRouter();
  const [manga, setManga] = useState<MangaDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:8000/api/mangas/${params.id}/`)
      .then((res) => res.json())
      .then((data) => {
        setManga(data);
        setLoading(false);
      })
      .catch((err) => console.error('Falha na conexão:', err));
  }, [params.id]);

  if (loading) return <div className="min-h-screen bg-black text-red-600 flex items-center justify-center font-mono">CARREGANDO DADOS...</div>;
  if (!manga) return <div className="min-h-screen bg-black text-zinc-500 flex items-center justify-center font-mono">ARQUIVO CORROMPIDO OU INEXISTENTE</div>;

  const getCoverUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = 'http://localhost:8000';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      {/* Botão de Voltar */}
      <div className="absolute top-6 left-6 z-10">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 bg-black/50 backdrop-blur-md border border-zinc-800 px-4 py-2 rounded-full hover:border-red-600 transition-colors text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> VOLTAR
        </button>
      </div>

      {/* Hero Section */}
      <div className="relative w-full h-[50vh] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-black z-[1]" />
        <NextImage
            src={getCoverUrl(manga.cover)}
            alt={manga.title}
            fill
            className="object-cover opacity-50 blur-sm"
            unoptimized={true}
        />
        
        <div className="absolute bottom-0 left-0 w-full p-6 z-10 max-w-7xl mx-auto flex flex-col md:flex-row gap-8 items-end">
          <div className="w-40 md:w-56 aspect-[3/4] relative rounded-lg overflow-hidden border-2 border-zinc-800 shadow-2xl shrink-0 hidden md:block">
            <NextImage
              src={getCoverUrl(manga.cover)}
              alt={manga.title}
              fill
              className="object-cover"
              unoptimized={true}
            />
          </div>

          <div className="mb-4">
            <span className="inline-block bg-red-600 text-white text-xs font-bold px-2 py-1 rounded mb-2">
              {manga.status}
            </span>
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter mb-2">{manga.title}</h1>
            <p className="text-lg text-zinc-400 font-mono">{manga.author}</p>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="max-w-7xl mx-auto p-6 grid md:grid-cols-3 gap-12">
        
        {/* Sinopse */}
        <div className="md:col-span-2 space-y-8">
          <section>
            <h3 className="text-xl font-bold border-b border-zinc-800 pb-2 mb-4 text-red-500">SINOPSE</h3>
            <p className="text-zinc-300 leading-relaxed text-sm md:text-base">
              {manga.description}
            </p>
          </section>

          {/* Lista de Capítulos Linkada */}
          <section>
            <h3 className="text-xl font-bold border-b border-zinc-800 pb-2 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-red-500" />
              CAPÍTULOS
            </h3>
            
            <div className="grid gap-2">
              {manga.chapters && manga.chapters.length > 0 ? (
                manga.chapters.map((chapter) => (
                  <Link 
                    key={chapter.id}
                    href={`/read/${chapter.id}`} // <--- A CORREÇÃO TÁTICA
                    className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded hover:border-red-600 hover:bg-zinc-800 transition-all group text-left"
                  >
                    <span className="font-bold text-zinc-200 group-hover:text-white">
                      Capítulo {chapter.number} {chapter.title ? `- ${chapter.title}` : ''}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(chapter.release_date).toLocaleDateString()}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center border border-dashed border-zinc-800 text-zinc-500 rounded">
                  NENHUM ARQUIVO DE DADOS ENCONTRADO (Sem capítulos cadastrados)
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Stats */}
        <div className="space-y-6">
          <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
            <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">Classificação</h4>
            <div className="text-3xl font-black text-white">4.9 <span className="text-sm text-zinc-600 font-normal">/ 5.0</span></div>
          </div>
        </div>

      </div>
    </main>
  );
}