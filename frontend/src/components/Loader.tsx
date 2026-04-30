'use client';

// Arasaka Nexus — branded loader.
// Replace every <Loader2 /> from lucide with <Loader />.
//   <Loader />                                — full block (centered)
//   <Loader inline label="AUTHENTICATING" />  — inline for buttons / status lines
//   <Loader fullscreen label="DECRYPTING" />  — full-viewport overlay

import { useEffect, useState } from 'react';

type Props = {
  label?: string;
  inline?: boolean;
  fullscreen?: boolean;
  /** caption under the bar; pass null to hide */
  caption?: string | null;
};

export function Loader({
  label = 'DECRYPTING_PACKETS',
  inline = false,
  fullscreen = false,
  caption = '// ESTABLISHING SECURE CHANNEL',
}: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const elapsed = (t - start) / 1000;
      // asymptote toward 99 — never resolves to 100 (loader doesn't know when data lands)
      const next = Math.min(99, Math.floor(100 * (1 - Math.exp(-elapsed * 0.55))));
      setPct(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (inline) {
    return (
      <span
        className="mono inline-flex items-center gap-2"
        style={{
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--arasaka-red)',
        }}
      >
        <span className="loader-dot" aria-hidden />
        <span className="loader-dot" style={{ animationDelay: '120ms' }} aria-hidden />
        <span className="loader-dot" style={{ animationDelay: '240ms' }} aria-hidden />
        <span>{label}</span>
      </span>
    );
  }

  const body = (
    <div
      className="flex flex-col items-center gap-4"
      style={{ minWidth: 280, padding: 'var(--sp-7) var(--sp-5)' }}
      role="status"
      aria-live="polite"
    >
      {/* Scanning bar */}
      <div className="loader-scan-frame" aria-hidden>
        <div className="loader-scan-bar" />
      </div>

      {/* mono readout */}
      <div
        className="mono flex items-baseline gap-3"
        style={{
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ color: 'var(--arasaka-red)' }}>{label}</span>
        <span className="tabular-nums" style={{ color: 'var(--fg-secondary)' }}>
          {String(pct).padStart(2, '0')}%
        </span>
        <span className="blink" style={{ color: 'var(--arasaka-red)' }}>▌</span>
      </div>

      {caption !== null && (
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--fg-muted)',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center scanlines"
        style={{ background: 'var(--bg-void)' }}
      >
        {body}
      </div>
    );
  }

  return <div className="flex items-center justify-center min-h-[40vh]">{body}</div>;
}

export default Loader;
