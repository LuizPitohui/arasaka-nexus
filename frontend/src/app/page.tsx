'use client';

import { useEffect, useState } from 'react';
import { Manga } from '@/types';
import MangaCard from '@/components/MangaCard';
import { Search, Library } from 'lucide-react';

export default function Home() {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false); // NOVO: Protocolo Anti-Hydration

  useEffect(() => {
    setMounted(true); // O componente montou no cliente
    fetch('http://localhost:8000/api/mangas/')
      .then((res) => res.json())
      .then((data) => {
        setMangas(data);
        setLoading(false);
      })
      .catch((err) => console.error('Erro ao acessar o Nexus:', err));
  }, []);

  // Se ainda não montou, não renderiza nada para evitar erro de Hydration
  if (!mounted) return null;

  const filteredMangas = mangas.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-black text-zinc-100 p-6">
      {/* Header do Império */}
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-800 pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-red-600 italic">
            ARASAKA <span className="text-zinc-100">NEXUS</span>
          </h1>
          <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
            Content Distribution Node // Unauthorized Access Prohibited
          </p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="LOCALIZAR OBRA NO BANCO DE DADOS..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-none py-2 pl-10 pr-4 text-xs font-mono focus:border-red-600 outline-none transition-colors"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      {/* Grid de Conteúdo */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-6 text-zinc-400">
          <Library className="w-4 h-4" />
          <h2 className="uppercase text-xs font-bold tracking-widest">Arquivos Disponíveis</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-zinc-900 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {filteredMangas.map((manga) => (
              <MangaCard key={manga.id} manga={manga} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}