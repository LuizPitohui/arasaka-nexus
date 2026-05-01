'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { STATUS_COLOR, StatusBadge, type HealthStatus } from '../_components';

type SourceRow = {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  languages: string[];
  is_active: boolean;
  is_registered: boolean;
  priority: number;
  health: {
    status: HealthStatus;
    down_for_seconds: number;
    last_check_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    consecutive_failures: number;
    avg_latency_ms_5m: number;
    p95_latency_ms_5m: number;
    error_rate_5m: number;
    last_error_class: string;
    last_error_message: string;
    parser_drift_detected: boolean;
  };
};

const POLL_MS = 30_000;

export default function SourcesPage() {
  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HealthStatus | 'ALL'>('ALL');

  const refetch = async () => {
    try {
      const res = await api.get<{ results: SourceRow[] }>('/admin/sources/');
      setRows(res.results);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refetch();
    const id = window.setInterval(refetch, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const onForce = async (id: string) => {
    try {
      await api.post(`/admin/sources/${id}/healthcheck/`);
      toast.success(`probe enfileirado · ${id}`);
      window.setTimeout(refetch, 3000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (error && !rows) {
    return (
      <div className="text-[var(--neon-magenta)] font-mono text-sm">
        ✗ falha ao carregar — {error}
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="text-[var(--fg-muted)] font-mono text-xs uppercase tracking-[0.3em]">
        ◌ enumerando alvos…
      </div>
    );
  }

  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.health.status === filter);

  const tally = {
    ALL: rows.length,
    UP: rows.filter((r) => r.health.status === 'UP').length,
    DEGRADED: rows.filter((r) => r.health.status === 'DEGRADED').length,
    DOWN: rows.filter((r) => r.health.status === 'DOWN').length,
    UNKNOWN: rows.filter((r) => r.health.status === 'UNKNOWN').length,
  };

  return (
    <div className="space-y-4 mikoshi-decrypt">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-px border border-[var(--fg-faint)] bg-[var(--bg-terminal)] w-fit text-[10px] uppercase tracking-[0.3em] font-mono">
        <Chip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label={`tudo (${tally.ALL})`} />
        <Chip active={filter === 'UP'} onClick={() => setFilter('UP')} label={`up (${tally.UP})`} color="var(--neon-green)" />
        <Chip active={filter === 'DEGRADED'} onClick={() => setFilter('DEGRADED')} label={`deg (${tally.DEGRADED})`} color="var(--neon-yellow)" />
        <Chip active={filter === 'DOWN'} onClick={() => setFilter('DOWN')} label={`down (${tally.DOWN})`} color="var(--neon-magenta)" />
        <Chip active={filter === 'UNKNOWN'} onClick={() => setFilter('UNKNOWN')} label={`?? (${tally.UNKNOWN})`} />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="text-[var(--fg-muted)] font-mono text-xs uppercase tracking-[0.3em] py-8 text-center border border-dashed border-[var(--fg-faint)]">
            ◌ nenhuma fonte nesse estado
          </div>
        )}
        {filtered.map((row) => (
          <SourceCard key={row.id} row={row} onForce={onForce} />
        ))}
      </div>

      <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--fg-muted)] flex justify-between flex-wrap gap-2">
        <span>{rows.length} fontes registradas</span>
        <span className="mikoshi-blink">◉ auto-refresh 30s</span>
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 transition-colors ${
        active
          ? 'bg-[var(--neon-cyan)] text-black'
          : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)]'
      }`}
      style={!active && color ? { color } : undefined}
    >
      {label}
    </button>
  );
}

function SourceCard({
  row,
  onForce,
}: {
  row: SourceRow;
  onForce: (id: string) => void;
}) {
  const { id, name, kind, base_url, languages, is_active, is_registered, health } = row;
  const accent = STATUS_COLOR[health.status];
  const errPct = (health.error_rate_5m * 100).toFixed(1);

  return (
    <article
      className="group border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm font-mono relative overflow-hidden hover:border-[var(--neon-cyan)] transition-colors"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* Subtle scanline on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div
          className="absolute h-px w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            top: '50%',
          }}
        />
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={health.status} drift={health.parser_drift_detected} />
            <h3 className="text-base font-bold truncate group-hover:text-[var(--neon-cyan)] transition-colors">
              {name}
              <span className="text-[var(--fg-muted)] text-[10px] ml-2 tracking-[0.2em]">
                [{id}]
              </span>
            </h3>
            {!is_registered && (
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--neon-yellow)] border border-[var(--neon-yellow)] px-1.5 py-0.5">
                ⚠ não registrado
              </span>
            )}
            {!is_active && is_registered && (
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                ⏸ desativada
              </span>
            )}
          </div>

          <div className="mt-2 flex gap-2 flex-wrap text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)]">
            <span>{kind}</span>
            <span className="text-[var(--fg-faint)]">·</span>
            <span className="truncate text-[var(--fg-secondary)]">{base_url}</span>
            {languages.length > 0 && (
              <>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>{languages.join(' / ')}</span>
              </>
            )}
          </div>

          {health.status === 'DOWN' && (
            <p className="mt-2.5 text-[11px] text-[var(--neon-magenta)] mikoshi-glitch">
              ✗ FORA DO AR HÁ {formatDuration(health.down_for_seconds)} ·{' '}
              {health.consecutive_failures} falhas consecutivas
            </p>
          )}
          {health.parser_drift_detected && (
            <p className="mt-2 text-[11px] text-[var(--neon-yellow)]">
              ⚠ parser drift detectado — site provavelmente mudou de HTML
            </p>
          )}
          {health.last_error_class && health.status !== 'UP' && (
            <p className="mt-1 text-[10px] text-[var(--fg-secondary)] truncate">
              último erro:{' '}
              <span className="text-[var(--fg-primary)]">{health.last_error_class}</span>
              {health.last_error_message && <> — {health.last_error_message.slice(0, 120)}</>}
            </p>
          )}
        </div>

        <div className="flex flex-row md:flex-col gap-2 md:items-end justify-end">
          <Link
            href={`/mikoshi/admin/sources/${id}`}
            className="text-[10px] uppercase tracking-[0.25em] px-3 py-1.5 border border-[var(--neon-cyan)] text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-black transition-colors"
          >
            ◢ detalhes
          </Link>
          {is_registered && (
            <button
              onClick={() => onForce(id)}
              className="text-[10px] uppercase tracking-[0.25em] px-3 py-1.5 border border-[var(--fg-faint)] text-[var(--fg-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-colors"
            >
              ▮ forçar probe
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 border-t border-[var(--fg-faint)] divide-x divide-[var(--fg-faint)]">
        <Metric label="erro 5m" value={`${errPct}%`} accent={health.error_rate_5m > 0.1 ? 'magenta' : 'cyan'} />
        <Metric label="latência avg" value={`${health.avg_latency_ms_5m}ms`} />
        <Metric label="p95" value={`${health.p95_latency_ms_5m}ms`} />
        <Metric
          label="último ok"
          value={health.last_success_at ? formatRelative(health.last_success_at) : '—'}
        />
        <Metric
          label="último check"
          value={health.last_check_at ? formatRelative(health.last_check_at) : '—'}
        />
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  accent = 'fg',
}: {
  label: string;
  value: string;
  accent?: 'fg' | 'cyan' | 'magenta';
}) {
  const color =
    accent === 'cyan'
      ? 'var(--neon-cyan)'
      : accent === 'magenta'
      ? 'var(--neon-magenta)'
      : 'var(--fg-primary)';
  return (
    <div className="px-3 py-2 transition-colors hover:bg-[var(--bg-elevated)]">
      <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="text-sm tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, (Date.now() - then) / 1000);
  return `${formatDuration(Math.floor(diff))} atrás`;
}
