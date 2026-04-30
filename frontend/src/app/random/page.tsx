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
      .then((manga) => router.replace(`/manga/${manga.id}`))
      .catch(() => router.replace('/'));
  }, [router]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      <div className="relative">
        <Shuffle
          className="w-14 h-14"
          style={{ color: 'var(--arasaka-red)' }}
        />
        <Loader2
          className="w-14 h-14 absolute inset-0 animate-spin opacity-40"
          style={{ color: 'var(--arasaka-red)' }}
        />
      </div>
      <p
        className="mono text-xs uppercase tracking-[0.3em] animate-pulse"
        style={{ color: 'var(--fg-muted)' }}
      >
        // RANDOMIZING_ENTRY...
      </p>
    </main>
  );
}
