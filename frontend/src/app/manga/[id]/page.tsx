'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Clock, Calendar, Tag } from 'lucide-react';

export default function MangaDetails() {
  const params = useParams();
  const router = useRouter();
  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Busca dados do Mangá
    fetch(`http://localhost:8000/api/mangas/${params.id}/`)
      .then(res => res.json())
      .then(data => {
        setManga(data);
        // Busca Capítulos Deste Mangá
        // Nota: Precisamos filtrar os capítulos pelo ID do mangá. 
        // Idealmente teríamos uma rota /api/mangas/{id}/chapters/, mas vamos filtrar no front por enquanto ou usar a lista se vier no serializer.
        // Vamos assumir que criaremos uma rota específica ou filtraremos.
        return fetch(`http://localhost:8000/api/chapters/?manga=${params.id}`);
      })
      .then(res => res.json())
      .then(data => {
        // Se a API retornar paginação, pegamos 'results', senão pegamos 'data' ou o array direto
        const chaptersList = Array.isArray(data) ? data : (data.results || []);
        setChapters(chaptersList);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, [params.id]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-red-600 animate-pulse">CARREGANDO DADOS...</div>;
  if (!manga) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      
      {/* Banner de Fundo (Borrado) */}
      <div className="fixed inset-0 h-96 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black z-10" />
        <img src={manga.cover} className="w-full h-full object-cover opacity-30 blur-xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto p-6 md:pt-20">
        
        {/* Botão Voltar */}
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-5 h-5" /> Voltar para Home
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Capa Principal */}
          <div className="w-full md:w-72 flex-shrink-0">
            <img src={manga.cover} className="w-full rounded-lg shadow-2xl shadow-red-900/20 border border-zinc-800" />
            <div className="mt-4 flex gap-2 flex-wrap">
               {/* Categorias (Se houver) */}
               {manga.categories && manga.categories.map((cat: any) => (
                 <span key={cat.id} className="text-[10px] bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase tracking-wider">
                   {cat.name}
                 </span>
               ))}
            </div>
          </div>

          {/* Informações */}
          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-black mb-4 text-white">{manga.title}</h1>
            <p className="text-zinc-500 text-sm mb-6 leading-relaxed max-w-2xl">
              {manga.description ? manga.description : "Sem descrição disponível."}
            </p>

            <div className="flex items-center gap-6 mb-10 border-b border-zinc-800 pb-6">
              <div className="flex flex-col">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Status</span>
                <span className="font-bold text-white">{manga.status}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Capítulos</span>
                <span className="font-bold text-white">{chapters.length}</span>
              </div>
            </div>

            {/* Lista de Capítulos */}
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
                    <span className="text-xs text-zinc-600">
                      LER
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