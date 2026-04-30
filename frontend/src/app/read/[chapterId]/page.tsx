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
import Loader from '@/components/Loader';

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
  navigation: { prev: number | null; next: number | null };
};

type ReaderMode = 'vertical' | 'paged' | 'webtoon' | 'double';
type FitMode = 'width' | 'height' | 'both' | 'original';

const READER_MODES: { value: ReaderMode; label: string }[] = [
  { value: 'vertical', label: 'VERT' },
  { value: 'paged', label: 'PAGED' },
  { value: 'webtoon', label: 'WEBTOON' },
  { value: 'double', label: 'DOUBLE' },
];

const FIT_MODES: { value: FitMode; label: string }[] = [
  { value: 'width', label: 'W' },
  { value: 'height', label: 'H' },
  { value: 'both', label: 'FIT' },
  { value: 'original', label: '1:1' },
];

const STORAGE_KEY = 'nexus_reader_prefs';
type Prefs = { mode: ReaderMode; fit: FitMode };
const DEFAULT_PREFS: Prefs = { mode: 'vertical', fit: 'width' };

const apiOrigin = (() => {
  try { return new URL(API_URL).origin; } catch { return 'http://localhost:8000'; }
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

  useEffect(() => {
    const local = loadPrefs();
    setPrefs(local);
    if (tokenStore.getAccess()) {
      api.get<{ reader_mode: ReaderMode }>('/accounts/profile/').then((p) => {
        setPrefs((prev) => {
          const merged = { ...prev, mode: p.reader_mode ?? prev.mode };
          savePrefs(merged);
          return merged;
        });
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!params?.chapterId) return;
    let cancelled = false;
    setLoading(true);
    setPageIndex(0);
    api.get<ReaderData>(`/read/${params.chapterId}/`, { auth: false })
      .then((d) => { if (!cancelled) { setData(d); window.scrollTo(0, 0); } })
      .catch((err) => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params?.chapterId]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!params?.chapterId || !tokenStore.getAccess()) return;
    api.post('/accounts/progress/', {
      chapter: Number(params.chapterId),
      page_number: 0,
      completed: false,
    }).catch(() => {});
  }, [params?.chapterId]);

  useEffect(() => {
    if (!data || prefs.mode === 'paged' || prefs.mode === 'double') return;
    let marked = false;
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (window.scrollY / docHeight) * 100) : 0;
      setScrollProgress(pct);
      if (!marked && pct >= 95 && tokenStore.getAccess() && params?.chapterId) {
        marked = true;
        api.post('/accounts/progress/', {
          chapter: Number(params.chapterId),
          page_number: data.pages.length,
          completed: true,
        }).catch(() => {});
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [data, prefs.mode, params?.chapterId]);

  useEffect(() => {
    if (!data || (prefs.mode !== 'paged' && prefs.mode !== 'double')) return;
    if (!tokenStore.getAccess() || !params?.chapterId) return;
    const isLastPage = prefs.mode === 'double'
      ? pageIndex + 2 >= data.pages.length
      : pageIndex >= data.pages.length - 1;
    if (isLastPage && pageIndex > 0) {
      api.post('/accounts/progress/', {
        chapter: Number(params.chapterId),
        page_number: pageIndex + 1,
        completed: true,
      }).catch(() => {});
    }
  }, [pageIndex, prefs.mode, data, params?.chapterId]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      if (patch.mode && tokenStore.getAccess()) {
        api.patch('/accounts/profile/', { reader_mode: patch.mode }).catch(() => {});
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

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'd':
          if (prefs.mode === 'paged' || prefs.mode === 'double') { e.preventDefault(); goNextPage(); }
          else if (data.navigation.next) router.push(`/read/${data.navigation.next}`);
          break;
        case 'ArrowLeft':
        case 'a':
          if (prefs.mode === 'paged' || prefs.mode === 'double') { e.preventDefault(); goPrevPage(); }
          else if (data.navigation.prev) router.push(`/read/${data.navigation.prev}`);
          break;
        case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
        case 'm': case 'M': e.preventDefault(); {
          const idx = READER_MODES.findIndex((m) => m.value === prefs.mode);
          const nextMode = READER_MODES[(idx + 1) % READER_MODES.length].value;
          updatePrefs({ mode: nextMode });
        } break;
        case 'Escape': setShowSettings(false); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, prefs.mode, goNextPage, goPrevPage, toggleFullscreen, updatePrefs, router]);

  useEffect(() => {
    if (!data) return;
    if (prefs.mode !== 'paged' && prefs.mode !== 'double') return;
    const indices = prefs.mode === 'double'
      ? [pageIndex + 2, pageIndex + 3, pageIndex - 1, pageIndex - 2]
      : [pageIndex + 1, pageIndex + 2, pageIndex - 1];
    indices.filter((i) => i >= 0 && i < data.pages.length).forEach((i) => {
      const img = new Image();
      img.src = resolvePageUrl(data.pages[i].image);
    });
  }, [data, pageIndex, prefs.mode]);

  const fitClasses: Record<FitMode, string> = useMemo(() => ({
    width: 'w-full h-auto',
    height: 'h-screen w-auto',
    both: 'max-h-screen max-w-full w-auto h-auto',
    original: 'w-auto h-auto',
  }), []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-void)' }}>
        <Loader fullscreen label="LOADING_STREAM" caption="// BUFFERING_PAGES" />
      </div>
    );
  }
  if (!data) return null;

  const totalPages = data.pages.length;
  const displayPage = prefs.mode === 'double'
    ? Math.min(pageIndex + 1, totalPages)
    : prefs.mode === 'paged'
    ? pageIndex + 1
    : Math.round((scrollProgress / 100) * totalPages) || 1;

  const pagedProgress = (prefs.mode === 'paged' || prefs.mode === 'double')
    ? totalPages > 0 ? ((pageIndex + (prefs.mode === 'double' ? 2 : 1)) / totalPages) * 100 : 0
    : scrollProgress;

  return (
    <main className="min-h-screen flex flex-col items-center" style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }} ref={containerRef}>
      {/* HUD HEADER */}
      <header
        className="fixed top-0 left-0 w-full backdrop-blur-md h-14 z-50 flex justify-between items-center px-4"
        style={{
          background: 'rgba(10,10,10,0.95)',
          borderBottom: '1px solid var(--border-faint)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => router.push(`/manga/${data.manga_id}`)}
            className="flex-shrink-0 transition-colors hover:text-[var(--arasaka-red)]"
            style={{ color: 'var(--fg-secondary)' }}
            title="Back to entry"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="text-xs font-bold max-w-[120px] md:max-w-md truncate" style={{ color: 'var(--fg-primary)' }}>
              {data.manga_title}
            </h1>
            <p className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>
              // CH_{data.chapter_number} · PG_{String(displayPage).padStart(3, '0')}/{String(totalPages).padStart(3, '0')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <HUDButton
            active={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            title="Settings (M cycles mode)"
          >
            <Settings className="w-4 h-4" />
          </HUDButton>
          <HUDButton onClick={toggleFullscreen} title="Fullscreen (F)">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </HUDButton>
          <HUDButton onClick={() => router.push('/')} title="Home">
            <Home className="w-4 h-4" />
          </HUDButton>
        </div>

        {/* progress bar */}
        <div
          className="absolute bottom-0 left-0 h-[2px] transition-all"
          style={{
            width: `${pagedProgress}%`,
            background: 'var(--arasaka-red)',
            boxShadow: '0 0 8px var(--arasaka-red)',
          }}
        />
      </header>

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div
          className="fixed top-16 right-2 z-50 w-72 p-4 space-y-4 bracket"
          style={{
            background: 'var(--bg-terminal)',
            border: '1px solid var(--border-faint)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="kicker">// READER_CONFIG</p>

          <div>
            <p className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--fg-muted)' }}>MODE</p>
            <div className="grid grid-cols-2 gap-1">
              {READER_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => updatePrefs({ mode: m.value })}
                  className="px-2 py-1.5 mono text-[10px] uppercase tracking-widest transition"
                  style={{
                    border: prefs.mode === m.value ? '1px solid var(--arasaka-red)' : '1px solid var(--border-faint)',
                    background: prefs.mode === m.value ? 'rgba(220,38,38,0.08)' : 'transparent',
                    color: prefs.mode === m.value ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--fg-muted)' }}>FIT</p>
            <div className="grid grid-cols-4 gap-1">
              {FIT_MODES.map((f) => (
                <button
                  key={f.value}
                  onClick={() => updatePrefs({ fit: f.value })}
                  className="px-2 py-1.5 mono text-[10px] uppercase tracking-widest transition"
                  style={{
                    border: prefs.fit === f.value ? '1px solid var(--arasaka-red)' : '1px solid var(--border-faint)',
                    background: prefs.fit === f.value ? 'rgba(220,38,38,0.08)' : 'transparent',
                    color: prefs.fit === f.value ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mono text-[10px] uppercase tracking-widest leading-relaxed pt-3" style={{ color: 'var(--fg-muted)', borderTop: '1px solid var(--border-faint)' }}>
            <p style={{ color: 'var(--fg-secondary)', fontWeight: 700 }} className="mb-1.5">// SHORTCUTS</p>
            <p>← → / A D · NAV</p>
            <p>F · FULLSCREEN · M · CYCLE_MODE</p>
            <p>ESC · CLOSE_PANEL</p>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="mt-14 w-full flex flex-col items-center" style={{ background: 'var(--bg-void)' }}>
        {prefs.mode === 'vertical' && (
          <div className="w-full md:max-w-3xl flex flex-col">
            {data.pages.map((page, index) => (
              <div key={index} className="leading-[0] w-full">
                <img
                  src={resolvePageUrl(page.image)}
                  alt={`Page ${index + 1}`}
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
                  alt={`Page ${index + 1}`}
                  className="block w-full h-auto select-none"
                  loading={index < 3 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        )}

        {prefs.mode === 'paged' && (
          <PagedView page={data.pages[pageIndex]} fitClass={fitClasses[prefs.fit]} onPrev={goPrevPage} onNext={goNextPage} />
        )}

        {prefs.mode === 'double' && (
          <DoubleView left={data.pages[pageIndex]} right={data.pages[pageIndex + 1]} onPrev={goPrevPage} onNext={goNextPage} />
        )}
      </div>

      {/* FOOTER NAV */}
      {(prefs.mode === 'vertical' || prefs.mode === 'webtoon') && (
        <div className="w-full max-w-3xl p-8 pb-24 space-y-6 text-center" style={{ background: 'var(--bg-void)' }}>
          <p className="mono text-[11px] uppercase tracking-[0.3em]" style={{ color: 'var(--fg-muted)' }}>
            // END_OF_STREAM
          </p>
          <div className="grid grid-cols-2 gap-4">
            {data.navigation.prev ? (
              <Link
                href={`/read/${data.navigation.prev}`}
                className="flex items-center justify-center gap-2 py-4 mono text-xs uppercase tracking-widest transition-all"
                style={{ background: 'var(--bg-terminal)', border: '1px solid var(--border-faint)', color: 'var(--fg-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--arasaka-red)'; e.currentTarget.style.color = 'var(--arasaka-red)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-faint)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
              >
                <ChevronLeft className="w-4 h-4" /> PREV_CH
              </Link>
            ) : (
              <div className="opacity-30 py-4 mono text-xs uppercase tracking-widest cursor-not-allowed" style={{ border: '1px solid var(--border-faint)' }}>
                START
              </div>
            )}
            {data.navigation.next ? (
              <Link
                href={`/read/${data.navigation.next}`}
                className="flex items-center justify-center gap-2 py-4 mono text-xs uppercase tracking-[0.18em] font-bold transition-all"
                style={{ background: 'var(--arasaka-red)', color: '#fff', boxShadow: 'var(--glow-red)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--arasaka-red-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--arasaka-red)'; }}
              >
                NEXT_CH <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <div className="opacity-30 py-4 mono text-xs uppercase tracking-widest cursor-not-allowed" style={{ border: '1px solid var(--border-faint)' }}>
                LATEST
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function HUDButton({
  children, onClick, active, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 transition-colors"
      style={{
        background: active ? 'rgba(220,38,38,0.12)' : 'transparent',
        color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
        border: active ? '1px solid var(--arasaka-red)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

function PagedView({ page, fitClass, onPrev, onNext }: {
  page: ReaderPage | undefined; fitClass: string; onPrev: () => void; onNext: () => void;
}) {
  if (!page) return null;
  return (
    <div className="relative w-full flex items-center justify-center select-none" style={{ minHeight: 'calc(100vh - 3.5rem)', background: 'var(--bg-void)' }}>
      <button onClick={onPrev} className="absolute left-0 top-0 bottom-0 w-1/3 z-10 cursor-w-resize" aria-label="Previous page" />
      <button onClick={onNext} className="absolute right-0 top-0 bottom-0 w-1/3 z-10 cursor-e-resize" aria-label="Next page" />
      <img src={resolvePageUrl(page.image)} alt={`Page ${page.order + 1}`} className={`mx-auto block ${fitClass}`} />
    </div>
  );
}

function DoubleView({ left, right, onPrev, onNext }: {
  left: ReaderPage | undefined; right: ReaderPage | undefined; onPrev: () => void; onNext: () => void;
}) {
  if (!left) return null;
  return (
    <div className="relative w-full flex items-center justify-center gap-1 select-none" style={{ minHeight: 'calc(100vh - 3.5rem)', background: 'var(--bg-void)' }}>
      <button onClick={onPrev} className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-w-resize" />
      <button onClick={onNext} className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-e-resize" />
      <img src={resolvePageUrl(left.image)} alt={`Page ${left.order + 1}`} className="max-h-screen w-auto h-auto" />
      {right && (<img src={resolvePageUrl(right.image)} alt={`Page ${right.order + 1}`} className="max-h-screen w-auto h-auto" />)}
    </div>
  );
}
