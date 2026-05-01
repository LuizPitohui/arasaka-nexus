'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

import { STATUS_COLOR, Sparkline, StatusDot, type HealthStatus } from './_components';

type SourceSummary = {
  id: string;
  name: string;
  status: HealthStatus;
  down_for_seconds: number;
  latency_avg_ms: number;
  error_rate_5m: number;
  sparkline: number[];
};

type Activity = {
  checked_at: string;
  source_id: string;
  endpoint: string;
  origin: 'probe' | 'traffic';
  success: boolean;
  latency_ms: number;
  status_code: number | null;
  error_class: string;
};

type Overview = {
  sources: {
    enabled: number;
    known: number;
    by_status: Record<HealthStatus, number>;
    summary: SourceSummary[];
  };
  library: { mangas: number; chapters: number };
  users: { total: number; staff: number };
  telemetry_24h: { total_requests: number; failures: number; error_rate: number };
  recent_activity: Activity[];
  generated_at: string;
};

const POLL_MS = 30_000;

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const fresh = await api.get<Overview>('/admin/sources/overview/');
        if (alive) {
          setData(fresh);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  if (error && !data) {
    return (
      <div className="text-[var(--neon-magenta)] font-mono text-sm">
        ✗ falha ao carregar telemetria — {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-[var(--fg-muted)] font-mono text-xs uppercase tracking-[0.3em]">
        ◌ querying mainframe…
      </div>
    );
  }

  return (
    <div className="space-y-7 mikoshi-decrypt">
      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Kpi label="Habilitadas" value={data.sources.enabled} hint={`${data.sources.known} no registry`} accent="cyan" />
        <Kpi label="UP" value={data.sources.by_status.UP} accent="green" pulse={data.sources.by_status.UP > 0 ? 'up' : undefined} />
        <Kpi label="Degradadas" value={data.sources.by_status.DEGRADED} accent="yellow" pulse={data.sources.by_status.DEGRADED > 0 ? 'degraded' : undefined} />
        <Kpi label="Down" value={data.sources.by_status.DOWN} accent="magenta" pulse={data.sources.by_status.DOWN > 0 ? 'down' : undefined} />
        <Kpi label="Unknown" value={data.sources.by_status.UNKNOWN} accent="muted" />
        <Kpi
          label="Erro 24h"
          value={`${(data.telemetry_24h.error_rate * 100).toFixed(1)}%`}
          hint={`${data.telemetry_24h.failures}/${data.telemetry_24h.total_requests} req`}
          accent={data.telemetry_24h.error_rate > 0.1 ? 'magenta' : 'cyan'}
        />
      </section>

      {/* Status matrix + activity feed */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <SourceMatrix sources={data.sources.summary} />
        <ActivityFeed activity={data.recent_activity} />
      </section>

      {/* Catalogue + users mini-row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Mangás" value={data.library.mangas.toLocaleString('pt-BR')} />
        <Kpi label="Capítulos" value={data.library.chapters.toLocaleString('pt-BR')} />
        <Kpi label="Operadores" value={data.users.total} />
        <Kpi label="Staff" value={data.users.staff} accent="cyan" />
      </section>

      <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--fg-muted)] flex justify-between flex-wrap gap-2">
        <span>last sync :: {new Date(data.generated_at).toLocaleString('pt-BR')}</span>
        <span className="mikoshi-blink">◉ auto-refresh 30s</span>
      </p>
    </div>
  );
}

/* ─────────────── KPI tile ─────────────── */
function Kpi({
  label,
  value,
  hint,
  accent = 'cyan',
  pulse,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: 'cyan' | 'green' | 'yellow' | 'magenta' | 'muted' | 'fg';
  pulse?: 'up' | 'down' | 'degraded';
}) {
  const colorMap = {
    cyan: 'var(--neon-cyan)',
    green: 'var(--neon-green)',
    yellow: 'var(--neon-yellow)',
    magenta: 'var(--neon-magenta)',
    muted: 'var(--fg-muted)',
    fg: 'var(--fg-primary)',
  } as const;
  const color = colorMap[accent];
  const pulseClass = pulse === 'up' ? 'mikoshi-dot-up' : pulse === 'down' ? 'mikoshi-dot-down' : pulse === 'degraded' ? 'mikoshi-dot-degraded' : '';
  return (
    <div
      className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm p-3 font-mono relative overflow-hidden group hover:border-[var(--neon-cyan)] transition-colors"
    >
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color, opacity: 0.5 }} />
      <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className={`text-2xl mt-1 mikoshi-counter inline-flex items-center gap-2 ${pulseClass} rounded-full`} style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--fg-faint)] mt-1 truncate">
          {hint}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Status matrix (one row per source) ─────────────── */
function SourceMatrix({ sources }: { sources: SourceSummary[] }) {
  return (
    <div className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm font-mono">
      <header className="px-3 py-2 border-b border-[var(--fg-faint)] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-secondary)]">
          ◢ matriz de fontes
        </span>
        <span className="text-[9px] uppercase tracking-[0.25em] text-[var(--fg-muted)]">
          {sources.length} alvos · 5min window
        </span>
      </header>
      {sources.length === 0 && (
        <div className="px-3 py-8 text-[var(--fg-muted)] text-center text-xs uppercase tracking-[0.3em]">
          ◌ aguardando primeiro probe
        </div>
      )}
      {sources.map((s) => (
        <Link
          key={s.id}
          href={`/mikoshi/admin/sources/${s.id}`}
          className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--fg-faint)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors group"
        >
          <StatusDot status={s.status} size={10} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[var(--fg-primary)] group-hover:text-[var(--neon-cyan)] transition-colors flex items-center gap-2">
              <span className="truncate">{s.name}</span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--fg-faint)]">
                [{s.id}]
              </span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)] mt-0.5 flex gap-2 flex-wrap">
              <span style={{ color: s.error_rate_5m > 0.1 ? 'var(--neon-magenta)' : 'var(--fg-muted)' }}>
                erro {(s.error_rate_5m * 100).toFixed(0)}%
              </span>
              <span>·</span>
              <span>{s.latency_avg_ms}ms avg</span>
              {s.status === 'DOWN' && s.down_for_seconds > 0 && (
                <>
                  <span>·</span>
                  <span className="text-[var(--neon-magenta)]">
                    fora há {formatDurationShort(s.down_for_seconds)}
                  </span>
                </>
              )}
            </div>
          </div>
          <Sparkline points={s.sparkline} color={STATUS_COLOR[s.status]} />
        </Link>
      ))}
    </div>
  );
}

/* ─────────────── Live activity feed (terminal-style) ─────────────── */
function ActivityFeed({ activity }: { activity: Activity[] }) {
  // Track previous keys to apply the slide-in animation only to fresh entries.
  const prevSet = useRef<Set<string>>(new Set());
  const newKeys: Set<string> = new Set();
  const items = activity.map((a, i) => {
    const key = `${a.checked_at}-${a.source_id}-${a.endpoint}-${i}`;
    if (!prevSet.current.has(key)) newKeys.add(key);
    return { ...a, key };
  });
  useEffect(() => {
    prevSet.current = new Set(items.map((i) => i.key));
  }, [items]);

  return (
    <div className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm font-mono">
      <header className="px-3 py-2 border-b border-[var(--fg-faint)] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-secondary)]">
          ◢ activity feed
        </span>
        <span className="mikoshi-blink text-[9px] uppercase tracking-[0.25em] text-[var(--neon-cyan)]">
          ◉ live
        </span>
      </header>
      <ul className="max-h-[420px] overflow-y-auto text-[10px]">
        {items.length === 0 && (
          <li className="px-3 py-8 text-[var(--fg-muted)] text-center uppercase tracking-[0.3em]">
            ◌ silêncio nas linhas
          </li>
        )}
        {items.map((a) => (
          <li
            key={a.key}
            className={`px-3 py-1.5 border-b border-[var(--fg-faint)]/40 last:border-b-0 flex items-center gap-2 hover:bg-[var(--bg-elevated)] ${
              newKeys.has(a.key) ? 'mikoshi-tick' : ''
            }`}
          >
            <span
              className="text-[9px]"
              style={{
                color: a.success ? 'var(--neon-green)' : 'var(--neon-magenta)',
              }}
            >
              {a.success ? '✓' : '✗'}
            </span>
            <span className="text-[var(--fg-faint)] tabular-nums">
              {new Date(a.checked_at).toLocaleTimeString('pt-BR')}
            </span>
            <span className="text-[var(--neon-cyan)] truncate min-w-0 flex-1">
              {a.source_id}
            </span>
            <span className="text-[var(--fg-secondary)] truncate">
              {a.endpoint}
            </span>
            <span className="text-[var(--fg-muted)] tabular-nums">
              {a.latency_ms}ms
            </span>
            {!a.success && a.error_class && (
              <span className="text-[var(--neon-magenta)] truncate max-w-[80px]">
                {a.error_class}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ''}`;
}

