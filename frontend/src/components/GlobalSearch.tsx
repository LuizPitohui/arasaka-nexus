'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { ApiError, api } from '@/lib/api';

type SearchResult = {
  id: number | string;
  title: string;
  cover: string;
  status?: string;
  mangadex_id?: string | null;
  in_library?: boolean;
};

const MIN_LEN = 2;
const DEBOUNCE_MS = 400;
const PREVIEW_LIMIT = 6;

/**
 * Header-resident search.
 *
 * Desktop: inline input (~280px) with autocomplete dropdown.
 * Mobile:  icon button that expands to a fullscreen overlay panel.
 *
 * Live preview shows up to 6 hits with a footer link "Ver todos os
 * resultados" that pushes to /search?q=... for the full grid.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_LEN) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await api.get<SearchResult[]>(
          `/search/?q=${encodeURIComponent(q)}`,
          { auth: false },
        );
        setResults(Array.isArray(data) ? data.slice(0, PREVIEW_LIMIT) : []);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 429)) {
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Close dropdown on outside click / Escape (desktop)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock scroll while mobile overlay is open + autofocus input
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // small delay so the keyboard pops up after the overlay is mounted
    const t = setTimeout(() => mobileInputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [mobileOpen]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_LEN) return;
    setOpen(false);
    setMobileOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const openManga = async (m: SearchResult) => {
    setOpen(false);
    setMobileOpen(false);
    if (typeof m.id === 'number' && m.id > 0) {
      router.push(`/manga/${m.id}`);
      return;
    }
    if (m.mangadex_id) {
      try {
        const res = await api.post<{ manga_id: number }>('/import/', {
          mangadex_id: m.mangadex_id,
        });
        if (res.manga_id) router.push(`/manga/${res.manga_id}`);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const showDropdown = open && query.trim().length >= MIN_LEN;

  return (
    <>
      {/* DESKTOP — inline input with dropdown */}
      <div ref={containerRef} className="hidden md:block relative">
        <SearchInput
          inputRef={inputRef}
          value={query}
          loading={loading}
          onChange={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmit={() => submit(query)}
          onClear={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          width={280}
        />
        {showDropdown && (
          <ResultDropdown
            query={query}
            results={results}
            loading={loading}
            onSelect={openManga}
            onSeeAll={() => submit(query)}
          />
        )}
      </div>

      {/* MOBILE — icon button that opens overlay */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Buscar"
        className="md:hidden flex items-center justify-center w-10 h-10"
        style={{
          color: 'var(--fg-secondary)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <Search className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar mangás"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(0,0,0,0.96)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-3"
            style={{ borderBottom: '1px solid var(--arasaka-red)' }}
          >
            <SearchInput
              inputRef={mobileInputRef}
              value={query}
              loading={loading}
              onChange={(v) => setQuery(v)}
              onFocus={() => {}}
              onSubmit={() => submit(query)}
              onClear={() => {
                setQuery('');
                mobileInputRef.current?.focus();
              }}
              width="100%"
              autoFocus
            />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar busca"
              className="flex items-center justify-center w-10 h-10 shrink-0"
              style={{
                color: 'var(--fg-secondary)',
                border: '1px solid var(--border-faint)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 64px)' }}>
            {query.trim().length < MIN_LEN && (
              <p
                className="px-5 py-10 text-center mono text-[11px] uppercase tracking-[0.3em]"
                style={{ color: 'var(--fg-muted)' }}
              >
                // DIGITE PELO MENOS {MIN_LEN} CARACTERES
              </p>
            )}
            {query.trim().length >= MIN_LEN && (
              <MobileResults
                query={query}
                results={results}
                loading={loading}
                onSelect={openManga}
                onSeeAll={() => submit(query)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SearchInput({
  inputRef,
  value,
  loading,
  onChange,
  onFocus,
  onSubmit,
  onClear,
  width,
  autoFocus,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  loading: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  onSubmit: () => void;
  onClear: () => void;
  width: number | string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative" style={{ width: typeof width === 'number' ? `${width}px` : width }}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        {loading ? (
          <span className="loader-dot" style={{ color: 'var(--arasaka-red)' }} />
        ) : (
          <Search className="w-4 h-4" style={{ color: 'var(--fg-muted)' }} />
        )}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        autoFocus={autoFocus}
        placeholder="// QUERY THE GRID..."
        className="w-full py-2 pl-10 pr-9 mono text-[12px] outline-none transition-all uppercase tracking-wider"
        style={{
          background: 'var(--bg-terminal)',
          border: '1px solid var(--border-mid)',
          color: 'var(--fg-primary)',
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-mid)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.boxShadow = 'var(--glow-red)';
        }}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar busca"
          className="absolute inset-y-0 right-2 flex items-center justify-center px-1 transition-colors"
          style={{ color: 'var(--fg-muted)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function ResultDropdown({
  query,
  results,
  loading,
  onSelect,
  onSeeAll,
}: {
  query: string;
  results: SearchResult[];
  loading: boolean;
  onSelect: (m: SearchResult) => void;
  onSeeAll: () => void;
}) {
  return (
    <div
      className="absolute right-0 mt-2 w-[420px]"
      style={{
        background: 'var(--bg-terminal)',
        border: '1px solid var(--arasaka-red)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 30px rgba(220,38,38,0.15)',
        zIndex: 50,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 mono text-[9px] uppercase tracking-[0.3em]"
        style={{
          background: 'rgba(220,38,38,0.1)',
          borderBottom: '1px solid var(--border-faint)',
          color: 'var(--arasaka-red)',
        }}
      >
        <span>// MATCHES · &quot;{query}&quot;</span>
        <span style={{ color: 'var(--fg-muted)' }}>↵ ENTER</span>
      </div>

      {loading && results.length === 0 && (
        <p
          className="px-4 py-6 mono text-[11px] uppercase tracking-widest text-center"
          style={{ color: 'var(--fg-muted)' }}
        >
          // SCANNING_GRID...
        </p>
      )}
      {!loading && results.length === 0 && (
        <p
          className="px-4 py-6 mono text-[11px] uppercase tracking-widest text-center"
          style={{ color: 'var(--fg-muted)' }}
        >
          // NULL_RESULT
        </p>
      )}

      <ul className="max-h-[60vh] overflow-y-auto">
        {results.map((m) => (
          <li key={`${m.id}-${m.mangadex_id ?? ''}`}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
              style={{ color: 'var(--fg-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(220,38,38,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <img
                src={m.cover || '/placeholder.jpg'}
                alt=""
                className="w-9 h-12 object-cover shrink-0"
                style={{ border: '1px solid var(--border-faint)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--fg-primary)' }}>
                  {m.title}
                </p>
                <p
                  className="mono text-[9px] uppercase tracking-widest mt-0.5"
                  style={{ color: m.in_library ? 'var(--neon-cyan)' : 'var(--fg-muted)' }}
                >
                  {m.in_library ? '✓ NO_VAULT' : 'MANGADEX'}
                  {m.status ? ` · ${m.status}` : ''}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {results.length > 0 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="w-full px-3 py-2 mono text-[10px] uppercase tracking-[0.3em] font-bold transition-colors"
          style={{
            background: 'var(--arasaka-red)',
            color: '#fff',
            borderTop: '1px solid var(--arasaka-red)',
          }}
        >
          ▸ VER TODOS OS RESULTADOS
        </button>
      )}
    </div>
  );
}

function MobileResults({
  query,
  results,
  loading,
  onSelect,
  onSeeAll,
}: {
  query: string;
  results: SearchResult[];
  loading: boolean;
  onSelect: (m: SearchResult) => void;
  onSeeAll: () => void;
}) {
  return (
    <div className="px-3 py-3">
      {loading && results.length === 0 && (
        <p
          className="py-8 mono text-[11px] uppercase tracking-widest text-center"
          style={{ color: 'var(--fg-muted)' }}
        >
          // SCANNING_GRID...
        </p>
      )}
      {!loading && results.length === 0 && (
        <p
          className="py-8 mono text-[11px] uppercase tracking-widest text-center"
          style={{ color: 'var(--fg-muted)' }}
        >
          // NULL_RESULT — tente outro termo
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {results.map((m) => (
          <li key={`${m.id}-${m.mangadex_id ?? ''}`}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full flex items-center gap-3 p-2 text-left"
              style={{
                background: 'var(--bg-terminal)',
                border: '1px solid var(--border-faint)',
                color: 'var(--fg-secondary)',
              }}
            >
              <img
                src={m.cover || '/placeholder.jpg'}
                alt=""
                className="w-12 h-16 object-cover shrink-0"
                style={{ border: '1px solid var(--border-faint)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--fg-primary)' }}>
                  {m.title}
                </p>
                <p
                  className="mono text-[9px] uppercase tracking-widest mt-0.5"
                  style={{ color: m.in_library ? 'var(--neon-cyan)' : 'var(--fg-muted)' }}
                >
                  {m.in_library ? '✓ NO_VAULT' : 'MANGADEX'}
                  {m.status ? ` · ${m.status}` : ''}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {results.length > 0 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="w-full mt-3 py-3 mono text-[11px] uppercase tracking-[0.3em] font-bold"
          style={{
            background: 'var(--arasaka-red)',
            color: '#fff',
            border: '1px solid var(--arasaka-red)',
            boxShadow: 'var(--glow-red)',
          }}
        >
          ▸ VER TODOS · &quot;{query}&quot;
        </button>
      )}
    </div>
  );
}
