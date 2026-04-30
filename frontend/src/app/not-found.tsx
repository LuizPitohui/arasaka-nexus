import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center gap-6 p-8">
      <p className="text-[11px] uppercase tracking-[0.4em] text-zinc-500 font-mono">
        Error 404 — Lost Signal
      </p>
      <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-red-600">
        404
      </h1>
      <p className="text-zinc-400 max-w-md text-center">
        O endereço que você procurou não existe ou foi descontinuado pela
        Corporação.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="px-5 py-2 text-xs uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-red-500 transition"
        >
          Voltar ao Catálogo
        </Link>
        <Link
          href="/random"
          className="px-5 py-2 text-xs uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white transition"
        >
          Surpreender-me
        </Link>
      </div>
    </main>
  );
}
