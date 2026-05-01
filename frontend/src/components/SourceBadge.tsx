'use client';

/**
 * Chip que mostra a fonte de origem de um resultado de busca.
 *
 * Cada fonte tem uma cor distinta para o usuario reconhecer rapidamente
 * de onde vem cada item — local catalog, MangaDex, ou um scraper.
 */
type SourceSpec = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

const SOURCE_MAP: Record<string, SourceSpec> = {
  local: {
    label: 'NO_VAULT',
    color: 'var(--neon-cyan, #2de2e6)',
    bg: 'rgba(45,226,230,0.08)',
    border: 'rgba(45,226,230,0.45)',
  },
  mangadex: {
    label: 'MANGADEX',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.4)',
  },
  comick: {
    label: 'COMICK',
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.08)',
    border: 'rgba(168,85,247,0.4)',
  },
  lermanga: {
    label: 'LERMANGA',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.4)',
  },
  brmangas: {
    label: 'BRMANGAS',
    color: '#84cc16',
    bg: 'rgba(132,204,22,0.08)',
    border: 'rgba(132,204,22,0.4)',
  },
  goldenmangas: {
    label: 'GOLDEN',
    color: '#eab308',
    bg: 'rgba(234,179,8,0.08)',
    border: 'rgba(234,179,8,0.4)',
  },
  asurascans: {
    label: 'ASURA',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.4)',
  },
  bato: {
    label: 'BATO',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.4)',
  },
  mangaplus: {
    label: 'MANGA+',
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.4)',
  },
  mihon: {
    label: 'MIHON',
    color: '#14b8a6',
    bg: 'rgba(20,184,166,0.08)',
    border: 'rgba(20,184,166,0.45)',
  },
  tsuki: {
    label: 'TSUKI',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.08)',
    border: 'rgba(236,72,153,0.4)',
  },
};

const FALLBACK: SourceSpec = {
  label: 'EXTERNAL',
  color: 'var(--fg-secondary)',
  bg: 'transparent',
  border: 'var(--border-mid)',
};

export type SearchSource = keyof typeof SOURCE_MAP | string;

export function getSourceSpec(source: string | undefined | null): SourceSpec {
  if (!source) return FALLBACK;
  return SOURCE_MAP[source.toLowerCase()] ?? {
    ...FALLBACK,
    label: source.toUpperCase(),
  };
}

/**
 * Some external sources don't have an automatic import flow yet — clicking
 * them in the search shouldn't pretend they'll import like MangaDex.
 */
export function isImportableSource(source: string | undefined | null): boolean {
  return source === 'mangadex' || source === 'local';
}

export function SourceBadge({
  source,
  inLibrary,
  subSource,
  size = 'sm',
}: {
  source?: string | null;
  /** Override: when item is in the local library, always show NO_VAULT. */
  inLibrary?: boolean;
  /** For aggregated sources like Mihon — shows the underlying provider. */
  subSource?: string | null;
  size?: 'sm' | 'md';
}) {
  const effective = inLibrary ? 'local' : source || '';
  const spec = getSourceSpec(effective);

  const padding = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const fontSize = size === 'md' ? 'text-[10px]' : 'text-[9px]';

  const label = subSource && source === 'mihon'
    ? `${spec.label} · ${subSource.toUpperCase().slice(0, 12)}`
    : spec.label;

  return (
    <span
      className={`inline-flex items-center gap-1 mono ${padding} ${fontSize} uppercase tracking-widest shrink-0`}
      style={{
        background: spec.bg,
        border: `1px solid ${spec.border}`,
        color: spec.color,
      }}
      title={`Fonte: ${label}`}
    >
      {inLibrary && <span aria-hidden>✓</span>}
      <span>{label}</span>
    </span>
  );
}
