'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shuffle } from 'lucide-react';

import { api } from '@/lib/api';
import Loader from '@/components/Loader';

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
      className="min-h-screen flex flex-col items-center justify-center gap-8"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      <Shuffle
        className="w-12 h-12"
        style={{ color: 'var(--arasaka-red)', filter: 'drop-shadow(var(--glow-red))' }}
      />
      <Loader label="RANDOMIZING_ENTRY" caption="// SAMPLING_GLOBAL_INDEX" />
    </main>
  );
}
