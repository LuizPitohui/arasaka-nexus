'use client';

// Arasaka Nexus — Brand mark + wordmark lockup.
// Use <Brand /> in headers and hero sections. <ChevronMark /> on its own
// for favicons, splash, and watermarks.

type Props = { size?: number; markSize?: number; className?: string };

export function ChevronMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M10 56 L34 8 L58 56" stroke="#22d3ee" strokeWidth="0.5" fill="none" opacity="0.4" />
      <path d="M8 56 L32 8 L56 56" stroke="#dc2626" strokeWidth="2.5" fill="none" strokeLinejoin="miter" />
      <path d="M18 56 L32 28 L46 56" stroke="#dc2626" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M16 42 L26 42 M38 42 L48 42" stroke="#dc2626" strokeWidth="2" />
      <path d="M4 60 L60 60" stroke="#dc2626" strokeWidth="1" opacity="0.5" />
      <rect x="30" y="36" width="4" height="4" fill="#dc2626" />
    </svg>
  );
}

export default function Brand({ size = 22, markSize, className }: Props) {
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <ChevronMark size={markSize ?? size + 6} />
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: size,
          letterSpacing: '-0.04em',
          textTransform: 'uppercase',
          color: 'var(--fg-primary)',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        ARASAKA <span style={{ color: 'var(--arasaka-red)' }}>NEXUS</span>
      </span>
    </div>
  );
}
