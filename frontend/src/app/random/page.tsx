'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Shuffle } from 'lucide-react';

import { api } from '@/lib/api';

export default function RandomPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .get<{ id: number }>('/mangas/random/', { auth: false })
      .then((manga) => {
        router.replace(`/manga/${manga.id}`);
      })
      .catch(() => {
        router.replace('/');
      });
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-zinc-300 gap-4">
      <div className="relative">
        <Shuffle className="w-12 h-12 text-red-500" />
        <Loader2 className="w-12 h-12 absolute inset-0 animate-spin text-red-600 opacity-30" />
      </div>
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-mono animate-pulse">
        Selecionando aleatoriamente...
      </p>
    </main>
  );
}
