'use client';

/**
 * Visual badge for a chapter's translated language.
 *
 * MangaDex usa codigos como "pt-br", "en", "es-la", "ja". Aqui mapeamos os
 * principais para uma flag emoji + label curta. Para idiomas nao mapeados
 * exibimos o codigo cru em uppercase (ex: "VI", "ID") ainda formatado como
 * pill, garantindo que o usuario sempre saiba em que idioma o capitulo esta.
 */
type LangSpec = { flag: string; label: string };

const LANG_MAP: Record<string, LangSpec> = {
  'pt-br': { flag: '🇧🇷', label: 'PT-BR' },
  'pt': { flag: '🇵🇹', label: 'PT' },
  'en': { flag: '🇬🇧', label: 'EN' },
  'es': { flag: '🇪🇸', label: 'ES' },
  'es-la': { flag: '🇲🇽', label: 'ES-LA' },
  'ja': { flag: '🇯🇵', label: 'JA' },
  'ko': { flag: '🇰🇷', label: 'KO' },
  'zh': { flag: '🇨🇳', label: 'ZH' },
  'zh-hk': { flag: '🇭🇰', label: 'ZH-HK' },
  'fr': { flag: '🇫🇷', label: 'FR' },
  'de': { flag: '🇩🇪', label: 'DE' },
  'it': { flag: '🇮🇹', label: 'IT' },
  'ru': { flag: '🇷🇺', label: 'RU' },
  'pl': { flag: '🇵🇱', label: 'PL' },
  'tr': { flag: '🇹🇷', label: 'TR' },
  'ar': { flag: '🇸🇦', label: 'AR' },
  'id': { flag: '🇮🇩', label: 'ID' },
  'vi': { flag: '🇻🇳', label: 'VI' },
  'th': { flag: '🇹🇭', label: 'TH' },
  'uk': { flag: '🇺🇦', label: 'UK' },
};

export function getLangSpec(code: string | null | undefined): LangSpec | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (LANG_MAP[c]) return LANG_MAP[c];
  // fallback: just show the raw code in uppercase, no flag
  return { flag: '🌐', label: c.toUpperCase() };
}

export function LanguageBadge({
  code,
  size = 'sm',
}: {
  code: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const spec = getLangSpec(code);
  if (!spec) return null;

  const padding = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const fontSize = size === 'md' ? 'text-[11px]' : 'text-[9px]';

  return (
    <span
      className={`inline-flex items-center gap-1 mono ${padding} ${fontSize} uppercase tracking-widest shrink-0`}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-faint)',
        color: 'var(--fg-secondary)',
      }}
      title={`Idioma: ${spec.label}`}
      aria-label={`Idioma ${spec.label}`}
    >
      <span aria-hidden style={{ fontSize: size === 'md' ? '14px' : '12px' }}>
        {spec.flag}
      </span>
      <span>{spec.label}</span>
    </span>
  );
}
