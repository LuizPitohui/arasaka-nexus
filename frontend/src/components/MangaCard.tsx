import NextImage from 'next/image';
import Link from 'next/link'; // Importamos o módulo de navegação
import { Manga } from '@/types';

export default function MangaCard({ manga }: { manga: Manga }) {
  
  const getCoverUrl = (path: string) => {
    if (!path) return '/placeholder.png';
    if (path.startsWith('http')) return path;
    const baseUrl = 'http://localhost:8000';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  const coverUrl = getCoverUrl(manga.cover);

  return (
    // O Card agora é um Link que leva para a rota dinâmica
    <Link href={`/manga/${manga.id}`} className="block group">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-red-600 transition-all duration-300">
        <div className="aspect-[3/4] relative overflow-hidden bg-zinc-900">
          {coverUrl && (
            <NextImage
              src={coverUrl}
              alt={manga.title}
              fill
              sizes="(max-width: 768px) 50vw, 16vw"
              className="object-cover group-hover:scale-110 transition-transform duration-500"
              priority={false}
              unoptimized={true}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2">
            <span className="text-[10px] uppercase bg-red-600 px-2 py-0.5 font-bold tracking-tighter text-white rounded-sm">
              {manga.status}
            </span>
          </div>
        </div>

        <div className="p-3">
          <h3 className="font-bold text-sm truncate text-zinc-100 group-hover:text-red-500 transition-colors">
            {manga.title}
          </h3>
          <p className="text-xs text-zinc-500 truncate">{manga.author}</p>
        </div>
      </div>
    </Link>
  );
}