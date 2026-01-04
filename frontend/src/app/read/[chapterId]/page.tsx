'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';

interface Page {
  id: number | string;
  image: string;
  order: number;
}

interface ReaderData {
  source: string;
  manga_id: number;
  manga_title: string;
  chapter_number: string;
  title: string;
  pages: Page[];
  navigation: {
    prev: number | null;
    next: number | null;
  };
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ReaderData | null>(null);
  const [loading, setLoading] = useState(true);

  // Função para buscar dados (Reutilizável para quando mudar de capítulo)
  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8000/api/read/${params.chapterId}/`)
      .then((res) => {
        if (!res.ok) throw new Error('Erro na leitura');
        return res.json();
      })
      .then((readerData) => {
        setData(readerData);
        setLoading(false);
        // Rola para o topo ao trocar de capítulo
        window.scrollTo(0, 0);
      })
      .catch((err) => console.error(err));
  }, [params.chapterId]);

  const getImageUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = 'http://localhost:8000';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-red-600 font-mono text-sm animate-pulse">CARREGANDO STREAM...</p>
    </div>
  );

  if (!data) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col items-center">
      
      {/* --- HEADER DE NAVEGAÇÃO --- */}
      <header className="fixed top-0 left-0 w-full bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 h-14 z-50 flex justify-between items-center px-4 shadow-2xl transition-transform duration-300">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push(`/manga/${data.manga_id}`)}
            className="hover:text-red-500 transition-colors"
            title="Voltar para a Obra"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-xs font-bold text-white max-w-[150px] md:max-w-md truncate">
              {data.manga_title}
            </h1>
            <p className="text-[10px] text-zinc-400">
              Capítulo {data.chapter_number}
            </p>
          </div>
        </div>

        {/* Controles de Topo */}
        <div className="flex items-center gap-2">
           <button 
             onClick={() => router.push('/')}
             className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
           >
             <Home className="w-4 h-4 text-zinc-500" />
           </button>
        </div>
      </header>

      {/* --- ÁREA DE LEITURA (SEM GAPS) --- */}
      {/* max-w-2xl é ideal para leitura em PC. w-full para Mobile. */}
      <div className="w-full md:max-w-3xl mt-14 flex flex-col bg-black">
        {data.pages.map((page, index) => (
          // 'leading-none' e 'block' removem o espaço fantasma em baixo das imagens
          <div key={index} className="leading-[0] w-full"> 
            <img
              src={getImageUrl(page.image)}
              alt={`Página ${index + 1}`}
              className="w-full h-auto block select-none"
              loading="lazy"
            />
          </div>
        ))}
      </div>
      
      {/* --- RODAPÉ DE NAVEGAÇÃO ENTRE CAPÍTULOS --- */}
      <div className="w-full max-w-3xl p-8 pb-24 space-y-6 bg-black text-center">
        <p className="text-zinc-600 text-xs uppercase tracking-widest font-mono">Fim do Capítulo</p>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Botão Anterior */}
          {data.navigation.prev ? (
             <Link 
               href={`/read/${data.navigation.prev}`}
               className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 py-4 rounded hover:border-red-600 hover:text-red-500 transition-all"
             >
               <ChevronLeft className="w-4 h-4" /> Anterior
             </Link>
          ) : (
             <div className="opacity-30 border border-zinc-900 py-4 rounded cursor-not-allowed">Início</div>
          )}

          {/* Botão Próximo */}
          {data.navigation.next ? (
             <Link 
               href={`/read/${data.navigation.next}`}
               className="flex items-center justify-center gap-2 bg-red-900/20 border border-red-900/50 text-red-500 py-4 rounded hover:bg-red-600 hover:text-white hover:border-red-600 transition-all font-bold"
             >
               Próximo <ChevronRight className="w-4 h-4" />
             </Link>
          ) : (
             <div className="opacity-30 border border-zinc-900 py-4 rounded cursor-not-allowed">Atual</div>
          )}
        </div>
      </div>

    </main>
  );
}