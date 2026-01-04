'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2, TrendingUp, Clock, Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  
  // Estados de Dados
  const [featured, setFeatured] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de Busca
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // 1. CARREGA A HOME (Protocolo Genesis)
  useEffect(() => {
    fetch('http://localhost:8000/api/home-data/')
      .then((res) => res.json())
      .then((data) => {
        setFeatured(data.featured || []);
        setRecent(data.recent || []);
        setLoading(false);
      })
      .catch((err) => console.error(err));
  }, []);

  // 2. BUSCA (Mantida igual)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.length > 2) {
        setSearching(true);
        fetch(`http://localhost:8000/api/search/?q=${query}`)
          .then(res => res.json())
          .then(data => {
            setSearchResults(data);
            setSearching(false);
          });
      } else {
        setSearchResults([]);
      }
    }, 800);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Função para abrir mangá (Simplificada)
  const handleOpenManga = async (manga: any) => {
     // Lógica de importar se não tiver ID local (vem da busca)
     if (manga.id && Number.isInteger(manga.id)) {
        router.push(`/manga/${manga.id}`);
     } else {
        // É da busca externa, precisa importar
        try {
            const res = await fetch('http://localhost:8000/api/import/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manga)
            });
            const data = await res.json();
            router.push(`/manga/${data.id}`);
        } catch (e) { console.error(e); }
     }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-red-600 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-mono tracking-widest text-xs uppercase animate-pulse">
            Sincronizando Banco de Dados Global...
        </p>
    </div>
  );

  // SE TIVER BUSCA ATIVA, MOSTRA SÓ A BUSCA (Limpeza visual)
  if (query.length > 2) {
      return (
        <main className="min-h-screen bg-black text-zinc-100 p-8">
            <Header query={query} setQuery={setQuery} searching={searching} />
            <h2 className="text-zinc-500 mb-6 text-sm">Resultados para "{query}"</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                {searchResults.map((manga) => (
                    <MangaCard key={manga.mangadex_id} manga={manga} onClick={() => handleOpenManga(manga)} />
                ))}
            </div>
        </main>
      )
  }

  // HOME PADRÃO (VITRINE)
  return (
    <main className="min-h-screen bg-black text-zinc-100 pb-20">
      <div className="p-8">
        <Header query={query} setQuery={setQuery} searching={searching} />

        {/* 1. SESSÃO DESTAQUES (Recomendados) */}
        <section className="mb-12">
            <div className="flex items-center gap-2 mb-6 text-red-500 font-bold tracking-wider text-sm uppercase">
                <Flame className="w-4 h-4" /> Recomendados pela Arasaka
            </div>
            
            {/* Carrossel Horizontal Simples */}
            <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x">
                {featured.map((manga) => (
                    <div key={manga.id} className="min-w-[160px] md:min-w-[200px] snap-start cursor-pointer group" onClick={() => router.push(`/manga/${manga.id}`)}>
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-3 border border-zinc-900 group-hover:border-red-600 transition-all">
                            <img src={manga.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black to-transparent">
                                <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded">TOP TIER</span>
                            </div>
                        </div>
                        <h3 className="text-sm font-medium text-zinc-300 truncate group-hover:text-white">{manga.title}</h3>
                        <p className="text-xs text-zinc-600 truncate">{manga.categories?.join(', ')}</p>
                    </div>
                ))}
            </div>
        </section>

        {/* 2. SESSÃO ÚLTIMAS ADIÇÕES (Recently Added) */}
        <section>
            <div className="flex items-center gap-2 mb-6 text-blue-500 font-bold tracking-wider text-sm uppercase">
                <Clock className="w-4 h-4" /> Adicionados Recentemente
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {recent.map((manga) => (
                    <MangaCard key={manga.id} manga={manga} onClick={() => router.push(`/manga/${manga.id}`)} />
                ))}
            </div>
        </section>

      </div>
    </main>
  );
}

// Componentes Auxiliares para limpar o código principal
function Header({ query, setQuery, searching }: any) {
    return (
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-zinc-900 pb-6">
            <h1 className="text-3xl font-black italic tracking-tighter text-white">
                ARASAKA <span className="text-red-600">NEXUS</span>
            </h1>
            <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    {searching ? <Loader2 className="w-4 h-4 text-red-600 animate-spin" /> : <Search className="w-4 h-4 text-zinc-600" />}
                </div>
                <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar no Banco de Dados..." 
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all placeholder:text-zinc-600"
                />
            </div>
        </header>
    )
}

function MangaCard({ manga, onClick }: any) {
    return (
        <div className="group cursor-pointer relative" onClick={onClick}>
            <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-zinc-900 shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-red-900/10">
                <img src={manga.cover || '/placeholder.jpg'} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100" />
            </div>
            <h2 className="mt-3 text-xs font-bold text-zinc-400 group-hover:text-white transition-colors line-clamp-2">
                {manga.title}
            </h2>
        </div>
    )
}