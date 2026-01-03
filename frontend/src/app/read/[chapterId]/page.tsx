'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

interface Page {
  id: number | string;
  image: string;
  order: number;
}

interface ReaderData {
  source: string;
  manga_id: number;
  chapter_number: string;
  title: string;
  pages: Page[];
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ReaderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Usamos a nova rota inteligente
    fetch(`http://localhost:8000/api/read/${params.chapterId}/`)
      .then((res) => {
        if (!res.ok) throw new Error('Erro na leitura');
        return res.json();
      })
      .then((readerData) => {
        setData(readerData);
        setLoading(false);
      })
      .catch((err) => console.error(err));
  }, [params.chapterId]);

  const getImageUrl = (path: string) => {
    if (!path) return '';
    // Se for URL externa (MangaDex), usa direto
    if (path.startsWith('http')) return path;
    // Se for local, adiciona o localhost
    const baseUrl = 'http://localhost:8000';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-red-600 animate-pulse">ESTABELECENDO CONEXÃO NEURAL...</div>;
  if (!data || !data.pages) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">FALHA NO STREAMING DE DADOS</div>;

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col items-center">
      
      {/* Header */}
      <header className="fixed top-0 left-0 w-full bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 p-4 z-50 flex justify-between items-center shadow-lg">
        <button 
          onClick={() => router.push(`/manga/${data.manga_id}`)} // ID vem do backend agora
          className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          VOLTAR
        </button>

        <div className="text-center">
          <h1 className="text-sm font-bold text-white">Capítulo {data.chapter_number}</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
            FONTE: {data.source === 'LOCAL' ? 'ARASAKA SERVER (SECURE)' : 'MANGADEX NETWORK (LIVE)'}
          </p>
        </div>
        <div className="w-20"></div> 
      </header>

      {/* Leitor */}
      <div className="w-full max-w-3xl mt-20 mb-20 flex flex-col min-h-screen">
        {data.pages.map((page, index) => (
          <div key={index} className="relative w-full">
            <img
              src={getImageUrl(page.image)}
              alt={`Página ${index + 1}`}
              className="w-full h-auto block"
              loading="lazy" // Performance para listas longas
            />
          </div>
        ))}
      </div>
      
      {/* Navegação Inferior (Simplificada) */}
      <div className="fixed bottom-6 flex gap-4 z-50">
         {/* Lógica de Próximo/Anterior ficaria aqui */}
      </div>

    </main>
  );
}