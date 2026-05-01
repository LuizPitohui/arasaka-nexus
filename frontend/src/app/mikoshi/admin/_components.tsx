'use client';

import { useEffect, useState } from 'react';

export type HealthStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export const STATUS_COLOR: Record<HealthStatus, string> = {
  UP: 'var(--neon-green)',
  DEGRADED: 'var(--neon-yellow)',
  DOWN: 'var(--neon-magenta)',
  UNKNOWN: 'var(--fg-muted)',
};

export function StatusDot({ status, size = 10 }: { status: HealthStatus; size?: number }) {
  const cls =
    status === 'UP'
      ? 'mikoshi-dot-up'
      : status === 'DOWN'
      ? 'mikoshi-dot-down'
      : status === 'DEGRADED'
      ? 'mikoshi-dot-degraded'
      : '';
  return (
    <span
      className={`inline-block rounded-full ${cls}`}
      style={{
        width: size,
        height: size,
        background: STATUS_COLOR[status],
        flexShrink: 0,
      }}
      aria-label={status}
    />
  );
}

export function StatusBadge({
  status,
  drift = false,
}: {
  status: HealthStatus;
  drift?: boolean;
}) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] px-2 py-1"
      style={{ color: c, border: `1px solid ${c}` }}
    >
      <StatusDot status={status} size={6} />
      {status}
      {drift && <span className="text-[var(--neon-yellow)]">· drift</span>}
    </span>
  );
}

/**
 * SVG sparkline of recent latency values. Renders nothing if <2 points.
 */
export function Sparkline({
  points,
  width = 140,
  height = 32,
  color = 'var(--neon-cyan)',
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!points || points.length < 2) {
    return (
      <div
        className="text-[9px] uppercase tracking-[0.2em] text-[var(--fg-faint)] font-mono"
        style={{ width, height, lineHeight: `${height}px` }}
      >
        — sem dados —
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const area = `${path} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  const lastX = (points.length - 1) * step;
  const lastY = height - ((last - min) / span) * (height - 4) - 2;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${color})`} />
      <path d={path} stroke={color} strokeWidth={1.4} fill="none" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color}>
        <animate attributeName="r" values="2.5;5;2.5" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/**
 * Pequena sequência "ACCESS GRANTED" que mostra antes do conteúdo.
 * Após `duration` ms, dispara `onDone`.
 */
export function BootGate({
  username,
  onDone,
  duration = 1100,
}: {
  username: string;
  onDone: () => void;
  duration?: number;
}) {
  const [step, setStep] = useState(0);
  const lines = [
    '> ESTABLISHING SECURE LINK ...',
    '> AUTH RING: VALID',
    `> CLEARANCE :: ${username.toUpperCase()}`,
    '> ACCESS GRANTED. WELCOME OPERATOR.',
  ];
  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= lines.length - 1) {
          window.clearInterval(id);
          window.setTimeout(onDone, 300);
          return s;
        }
        return s + 1;
      });
    }, duration / lines.length);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[var(--bg-void)]">
      <div className="mikoshi-grid-bg absolute inset-0 opacity-50" />
      <div className="mikoshi-scan-line absolute inset-0 opacity-60" />
      <div className="relative font-mono text-[11px] md:text-xs leading-7 text-[var(--neon-cyan)] max-w-md w-full px-6">
        {lines.slice(0, step + 1).map((line, i) => (
          <div key={i} className="mikoshi-tick">
            {line}
            {i === step && <span className="mikoshi-blink ml-1">▮</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
