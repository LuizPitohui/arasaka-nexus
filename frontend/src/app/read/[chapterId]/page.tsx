'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Home,
  Maximize2,
  Minimize2,
  Settings,
} from 'lucide-react';

import { API_URL, api, tokenStore } from '@/lib/api';

type ReaderPage = {
  id: number | string;
  image: string;
  order: number;
};

type ReaderData = {
  source: string;
  manga_id: number;
  manga_title: string;
  chapter_number: string;
  title: string;
  pages: ReaderPage[];
  navigation: {
    prev: number | null;
    next: number | null;
  };
};

type ReaderMode = 'vertical' | 'paged' | 'webtoon' | 'double';
type FitMode = 'width' | 'height' | 'both' | 'original';

const READER_MODES: { value: ReaderMode; label: string }[] = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'paged', label: 'Paginado' },
  { value: 'webtoon', label: 'Webtoon' },
  { value: 'double', label: 'Página dupla' },
];

const FIT_MODES: { value: FitMode; label: string }[] = [
  { value: 'width', label: 'Largura' },
  { value: 'height', label: 'Altura' },
  { value: 'both', label: 'Tela' },
  { value: 'original', label: 'Original' },
];

const STORAGE_KEY = 'nexus_reader_prefs';

type Prefs = {
  mode: ReaderMode;
  fit: FitMode;
};

const DEFAULT_PREFS: Prefs = { mode: 'vertical', fit: 'width' };

const apiOrigin = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return 'http://localhost:8000';
  }
})();

function resolvePageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${cleanPath}`;
}

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      mode: (parsed.mode as ReaderMode) ?? DEFAULT_PREFS.mode,
      fit: (parsed.fit as FitMode) ?? DEFAULT_PREFS.fit,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: Prefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function ReaderPage() {
  const params = useParams<{ chapterId: string }>();
  const router = useRouter();

  const [data, setData] = useState<ReaderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [pageIndex, setPageIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load prefs from localStorage + profile (if authed)
  useEffect(() => {
    const local = loadPrefs();
    setPrefs(local);
    if (tokenStore.getAccess()) {
      api
        .get<{ reader_mode: ReaderMode }>('/accounts/profile/')
        .then((profile) => {
          setPrefs((prev) => {
            // Profile preference wins on first load only (don't override mid-session)
            const merged = { ...prev, mode: profile.reader_mode ?? prev.mode };
            savePrefs(merged);
            return merged;
          });
        })
        .catch(() => {});
    }
  }, []);

  // Fetch chapter
  useEffect(() => {
    if (!params?.chapterId) return;
    let cancelled = false;
    setLoading(true);
    setPageIndex(0);
    api
      .get<ReaderData>(`/read/${params.chapterId}/`, { auth: false })
      .then((readerData) => {
        if (cancelled) return;
        setData(readerData);
        window.scrollTo(0, 0);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params?.chapterId]);

  // Fullscreen state listener
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Track reading progress (open + complete)
  useEffect(() => {
    if (!params?.chapterId || !tokenStore.getAccess()) return;
    api
      .post('/accounts/progress/', {
        chapter: Number(params.chapterId),
        page_number: 0,
        completed: false,
      })
      .catch(() => {});
  }, [params?.chapterId]);

  // Vertical/webtoon: track scroll for completion + progress bar
  useEffect(() => {
    if (!data || prefs.mode === 'paged' || prefs.mode === 'double') return;
    let marked = false;
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (window.scrollY / docHeight) * 100) : 0;
      setScrollProgress(pct);
      if (!marked && pct >= 95 && tokenStore.getAccess() && params?.chapterId) {
        marked = true;
        api
          .post('/accounts/progress/', {
            chapter: Number(params.chapterId),
            page_number: data.pages.length,
            completed: true,
          })
          .catch(() => {});
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [data, prefs.mode, params?.chapterId]);

  // Paged/double: track current page for completion
  useEffect(() => {
    if (!data || (prefs.mode !== 'paged' && prefs.mode !== 'double')) return;
    if (!tokenStore.getAccess() || !params?.chapterId) return;
    const isLastPage =
      prefs.mode === 'double'
        ? pageIndex + 2 >= data.pages.length
        : pageIndex >= data.pages.length - 1;
    if (isLastPage && pageIndex > 0) {
      api
        .post('/accounts/progress/', {
          chapter: Number(params.chapterId),
          page_number: pageIndex + 1,
          completed: true,
        })
        .catch(() => {});
    }
  }, [pageIndex, prefs.mode, data, params?.chapterId]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      // Persist mode preference to profile if authenticated
      if (patch.mode && tokenStore.getAccess()) {
        api
          .patch('/accounts/profile/', { reader_mode: patch.mode })
          .catch(() => {});
      }
      return next;
    });
  }, []);

  const goNextPage = useCallback(() => {
    if (!data) return;
    const step = prefs.mode === 'double' ? 2 : 1;
    if (pageIndex + step < data.pages.length) {
      setPageIndex((idx) => idx + step);
      window.scrollTo(0, 0);
    } else if (data.navigation.next) {
      router.push(`/read/${data.navigation.next}`);
    }
  }, [data, pageIndex, prefs.mode, router]);

  const goPrevPage = useCallback(() => {
    if (!data) return;
    const step = prefs.mode === 'double' ? 2 : 1;
    if (pageIndex - step >= 0) {
      setPageIndex((idx) => idx - step);
      window.scrollTo(0, 0);
    } else if (data.navigation.prev) {
      router.push(`/read/${data.navigation.prev}`);
    }
  }, [data, pageIndex, prefs.mode, router]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'd':
          if (prefs.mode === 'paged' || prefs.mode === 'double') {
            e.preventDefault();
            goNextPage();
          } else if (data.navigation.next) {
            router.push(`/read/${data.navigation.next}`);
          }
          break;
        case 'ArrowLeft':
        case 'a':
          if (prefs.mode === 'paged' || prefs.mode === 'double') {
            e.preventDefault();
            goPrevPage();
          } else if (data.navigation.prev) {
            router.push(`/read/${data.navigation.prev}`);
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          {
            const idx = READER_MODES.findIndex((m) => m.value === prefs.mode);
            const nextMode = READER_MODES[(idx + 1) % READER_MODES.length].value;
            updatePrefs({ mode: nextMode });
          }
          break;
        case 'Escape':
          setShowSettings(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, prefs.mode, goNextPage, goPrevPage, toggleFullscreen, updatePrefs, router]);

  // Preload neighbouring images in paged/double mode
  useEffect(() => {
    if (!data) return;
    if (prefs.mode !== 'paged' && prefs.mode !== 'double') return;
    const indicesToPreload =
      prefs.mode === 'double'
        ? [pageIndex + 2, pageIndex + 3, pageIndex - 1, pageIndex - 2]
        : [pageIndex + 1, pageIndex + 2, pageIndex - 1];
    indicesToPreload
      .filter((i) => i >= 0 && i < data.pages.length)
      .forEach((i) => {
        const img = new Image();
        img.src = resolvePageUrl(data.pages[i].image);
      });
  }, [data, pageIndex, prefs.mode]);

  const fitClasses: Record<FitMode, string> = useMemo(
    () => ({
      width: 'w-full h-auto',
      height: 'h-screen w-auto',
      both: 'max-h-screen max-w-full w-auto h-auto',
      original: 'w-auto h-auto',
    }),
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-red-600 font-mono text-sm animate-pulse">CARREGANDO STREAM...</p>
      </div>
    );
  }
  if (!data) return null;

  const totalPages = data.pages.length;
  const displayPage =
    prefs.mode === 'double'
      ? Math.min(pageIndex + 1, totalPages)
      : prefs.mode === 'paged'
      ? pageIndex + 1
      : Math.round((scrollProgress / 100) * totalPages) || 1;

  const pagedProgress =
    prefs.mode === 'paged' || prefs.mode === 'double'
      ? totalPages > 0
        ? ((pageIndex + (prefs.mode === 'double' ? 2 : 1)) / totalPages) * 100
        : 0
      : scrollProgress;

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col items-center" ref={containerRef}>
      {/* HEADER */}
      <header className="fixed top-0 left-0 w-full bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 h-14 z-50 flex justify-between items-center px-4 shadow-2xl">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => router.push(`/manga/${data.manga_id}`)}
            className="hover:text-red-500 transition-colors flex-shrink-0"
            title="Voltar para a Obra"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="text-xs font-bold text-white max-w-[120px] md:max-w-md truncate">
              {data.manga_title}
            </h1>
            <p className="text-[10px] text-zinc-400">
              Capítulo {data.chapter_number} · {displayPage}/{totalPages}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`p-2 rounded-full transition-colors ${
              showSettings ? 'bg-red-950/30 text-red-500' : 'hover:bg-zinc-800 text-zinc-400'
            }`}
            title="Configurações (M para ciclar modo)"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
            title="Tela cheia (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-0.5 bg-red-600 transition-all" style={{ width: `${pagedProgress}%` }} />
      </header>

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div
          className="fixed top-14 right-2 z-50 w-72 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl p-4 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Modo</p>
            <div className="grid grid-cols-2 gap-1">
              {READER_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => updatePrefs({ mode: m.value })}
                  className={`px-2 py-1.5 text-[11px] uppercase tracking-widest border transition ${
                    prefs.mode === m.value
                      ? 'border-red-600 bg-red-950/30 text-red-500'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Encaixe</p>
            <div className="grid grid-cols-4 gap-1">
              {FIT_MODES.map((f) => (
                <button
                  key={f.value}
                  onClick={() => updatePrefs({ fit: f.value })}
                  className={`px-2 py-1.5 text-[10px] uppercase tracking-widest border transition ${
                    prefs.fit === f.value
                      ? 'border-red-600 bg-red-950/30 text-red-500'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-900 pt-3">
            <p className="font-bold text-zinc-500 mb-1">Atalhos</p>
            <p>← → ou A / D · navegar</p>
            <p>F · tela cheia · M · ciclar modo</p>
            <p>Esc · fechar este painel</p>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="mt-14 w-full flex flex-col items-center bg-black">
        {prefs.mode === 'vertical' && (
          <div className="w-full md:max-w-3xl flex flex-col">
            {data.pages.map((page, index) => (
              <div key={index} className="leading-[0] w-full">
                <img
                  src={resolvePageUrl(page.image)}
                  alt={`Página ${index + 1}`}
                  className={`block select-none mx-auto ${fitClasses[prefs.fit]}`}
                  loading={index < 3 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        )}

        {prefs.mode === 'webtoon' && (
          <div className="w-full max-w-2xl flex flex-col">
            {data.pages.map((page, index) => (
              <div key={index} className="leading-[0] w-full">
                <img
                  src={resolvePageUrl(page.image)}
                  alt={`Página ${index + 1}`}
                  className="block w-full h-auto select-none"
                  loading={index < 3 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        )}

        {prefs.mode === 'paged' && (
          <PagedView
            page={data.pages[pageIndex]}
            fitClass={fitClasses[prefs.fit]}
            onPrev={goPrevPage}
            onNext={goNextPage}
          />
        )}

        {prefs.mode === 'double' && (
          <DoubleView
            left={data.pages[pageIndex]}
            right={data.pages[pageIndex + 1]}
            onPrev={goPrevPage}
            onNext={goNextPage}
          />
        )}
      </div>

      {/* FOOTER NAV — only on continuous modes */}
      {(prefs.mode === 'vertical' || prefs.mode === 'webtoon') && (
        <div className="w-full max-w-3xl p-8 pb-24 space-y-6 bg-black text-center">
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-mono">Fim do Capítulo</p>
          <div className="grid grid-cols-2 gap-4">
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
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------
function PagedView({
  page,
  fitClass,
  onPrev,
  onNext,
}: {
  page: ReaderPage | undefined;
  fitClass: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!page) return null;
  return (
    <div
      className="relative w-full flex items-center justify-center bg-black select-none"
      style={{ minHeight: 'calc(100vh - 3.5rem)' }}
    >
      {/* Click hotzones */}
      <button
        onClick={onPrev}
        className="absolute left-0 top-0 bottom-0 w-1/3 z-10 cursor-w-resize"
        aria-label="Página anterior"
      />
      <button
        onClick={onNext}
        className="absolute right-0 top-0 bottom-0 w-1/3 z-10 cursor-e-resize"
        aria-label="Próxima página"
      />
      <img
        src={resolvePageUrl(page.image)}
        alt={`Página ${page.order + 1}`}
        className={`mx-auto block ${fitClass}`}
      />
    </div>
  );
}

function DoubleView({
  left,
  right,
  onPrev,
  onNext,
}: {
  left: ReaderPage | undefined;
  right: ReaderPage | undefined;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!left) return null;
  return (
    <div
      className="relative w-full flex items-center justify-center gap-1 bg-black select-none"
      style={{ minHeight: 'calc(100vh - 3.5rem)' }}
    >
      <button onClick={onPrev} className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-w-resize" />
      <button onClick={onNext} className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-e-resize" />
      <img
        src={resolvePageUrl(left.image)}
        alt={`Página ${left.order + 1}`}
        className="max-h-screen w-auto h-auto"
      />
      {right && (
        <img
          src={resolvePageUrl(right.image)}
          alt={`Página ${right.order + 1}`}
          className="max-h-screen w-auto h-auto"
        />
      )}
    </div>
  );
}
