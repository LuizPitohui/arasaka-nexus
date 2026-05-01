'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { STATUS_COLOR, Sparkline, StatusBadge, type HealthStatus } from '../../_components';

type LogEntry = {
  checked_at: string;
  origin: 'probe' | 'traffic';
  endpoint: string;
  success: boolean;
  latency_ms: number;
  status_code: number | null;
  error_class: string;
  error_message: string;
  extracted_count: number | null;
};

type SourceDetail = {
  id: string;
  name: string;
  base_url: string;
  kind: string;
  is_active: boolean;
  is_registered: boolean;
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
  recent_logs: LogEntry[];
};

const POLL_MS = 30_000;

type MihonSubSource = {
  id: string;
  name: string;
  lang: string;
  icon: string;
  is_nsfw: boolean;
};

type MihonSubSourcesResponse = {
  connected: boolean;
  configured: boolean;
  sub_sources: MihonSubSource[];
  count?: number;
  error?: string;
};

export default function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<SourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mihon, setMihon] = useState<MihonSubSourcesResponse | null>(null);

  const refetch = async () => {
    try {
      const fresh = await api.get<SourceDetail>(`/admin/sources/${id}/`);
      setData(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    if (id === 'mihon') {
      try {
        const sub = await api.get<MihonSubSourcesResponse>('/admin/sources/mihon/sub-sources/');
        setMihon(sub);
      } catch {
        // Silencioso — sub-sources são best-effort.
      }
    }
  };

  useEffect(() => {
    refetch();
    const t = window.setInterval(refetch, POLL_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onForce = async () => {
    try {
      await api.post(`/admin/sources/${id}/healthcheck/`);
      toast.success('probe enfileirado');
      window.setTimeout(refetch, 3000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (error && !data) {
    return (
      <div className="text-[var(--neon-magenta)] font-mono text-sm">
        ✗ falha ao carregar — {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-[var(--fg-muted)] font-mono text-xs uppercase tracking-[0.3em]">
        ◌ querying source telemetry…
      </div>
    );
  }

  const { health } = data;
  const accent = STATUS_COLOR[health.status];

  // Derive sparkline from recent logs (oldest → newest)
  const sparkPoints = data.recent_logs
    .slice()
    .reverse()
    .map((l) => l.latency_ms);

  return (
    <div className="space-y-6 font-mono mikoshi-decrypt">
      <Link
        href="/mikoshi/admin/sources"
        className="inline-flex items-center text-[10px] uppercase tracking-[0.3em] text-[var(--fg-secondary)] hover:text-[var(--neon-cyan)]"
      >
        ← voltar
      </Link>

      {/* HERO */}
      <header
        className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm relative overflow-hidden"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        {/* Big rotating ring backdrop */}
        <div
          className="absolute -right-20 -top-20 w-72 h-72 mikoshi-rotate opacity-20 pointer-events-none"
          style={{
            border: `1px dashed ${accent}`,
            borderRadius: '50%',
          }}
        />
        <div
          className="absolute -right-10 -top-10 w-56 h-56 mikoshi-rotate opacity-15 pointer-events-none"
          style={{
            border: `1px solid ${accent}`,
            borderRadius: '50%',
            animationDuration: '22s',
            animationDirection: 'reverse',
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <StatusBadge status={health.status} drift={health.parser_drift_detected} />
              <h2 className="text-2xl md:text-3xl font-bold mt-3 truncate">
                {data.name}
                <span className="text-[var(--fg-muted)] text-sm ml-3 tracking-[0.2em]">
                  [{data.id}]
                </span>
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)] flex flex-wrap gap-2">
                <span>{data.kind}</span>
                <span className="text-[var(--fg-faint)]">·</span>
                <span className="text-[var(--fg-secondary)]">{data.base_url}</span>
              </p>

              {health.status === 'DOWN' && (
                <p className="mt-3 text-sm text-[var(--neon-magenta)] mikoshi-glitch">
                  ✗ FORA DO AR HÁ {formatDuration(health.down_for_seconds)} ·{' '}
                  {health.consecutive_failures} falhas consecutivas
                </p>
              )}
              {health.parser_drift_detected && (
                <p className="mt-2 text-sm text-[var(--neon-yellow)]">
                  ⚠ parser drift — HTML provavelmente mudou
                </p>
              )}
              {health.last_error_class && health.status !== 'UP' && (
                <p className="mt-2 text-[11px] text-[var(--fg-secondary)]">
                  último erro:{' '}
                  <span className="text-[var(--fg-primary)]">{health.last_error_class}</span>
                  {health.last_error_message && (
                    <span className="block text-[var(--fg-muted)] mt-0.5">
                      {health.last_error_message.slice(0, 240)}
                    </span>
                  )}
                </p>
              )}
            </div>

            <button
              onClick={onForce}
              className="text-[10px] uppercase tracking-[0.25em] px-4 py-2 border border-[var(--neon-cyan)] text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)] hover:text-black transition-colors"
            >
              ▮ forçar probe
            </button>
          </div>

          {/* Sparkline + metrics */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
            <div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--fg-muted)] mb-1">
                latência — últimos {sparkPoints.length} probes
              </div>
              <Sparkline points={sparkPoints} width={460} height={50} color={accent} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--fg-faint)]">
              <Metric label="erro 5m" value={`${(health.error_rate_5m * 100).toFixed(1)}%`} accent={health.error_rate_5m > 0.1 ? 'magenta' : 'cyan'} />
              <Metric label="avg" value={`${health.avg_latency_ms_5m}ms`} />
              <Metric label="p95" value={`${health.p95_latency_ms_5m}ms`} />
              <Metric label="último ok" value={health.last_success_at ? formatRelative(health.last_success_at) : '—'} />
              <Metric label="last check" value={health.last_check_at ? formatRelative(health.last_check_at) : '—'} />
            </div>
          </div>
        </div>
      </header>

      {/* LOG STREAM */}
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.3em] text-[var(--fg-secondary)] border-l-2 border-[var(--neon-cyan)] pl-2 flex items-center justify-between">
          <span>◢ log stream ({data.recent_logs.length})</span>
          <span className="mikoshi-blink text-[var(--neon-cyan)] text-[9px]">◉ live</span>
        </h3>
        <div className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase tracking-[0.25em] text-[var(--fg-muted)]">
              <tr className="border-b border-[var(--fg-faint)]">
                <th className="text-left px-3 py-2">timestamp</th>
                <th className="text-left px-3 py-2">origem</th>
                <th className="text-left px-3 py-2">endpoint</th>
                <th className="text-left px-3 py-2">res</th>
                <th className="text-left px-3 py-2">latência</th>
                <th className="text-left px-3 py-2">status</th>
                <th className="text-left px-3 py-2">extr</th>
                <th className="text-left px-3 py-2">erro</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-[var(--fg-muted)] text-center uppercase tracking-[0.3em]">
                    ◌ aguardando primeiro probe
                  </td>
                </tr>
              )}
              {data.recent_logs.map((log, i) => (
                <tr
                  key={`${log.checked_at}-${i}`}
                  className={`border-t border-[var(--fg-faint)]/40 hover:bg-[var(--bg-elevated)] transition-colors ${
                    i === 0 ? 'mikoshi-tick' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 text-[var(--fg-secondary)] tabular-nums whitespace-nowrap">
                    {new Date(log.checked_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className="text-[9px] uppercase tracking-[0.2em]"
                      style={{
                        color: log.origin === 'probe' ? 'var(--neon-cyan)' : 'var(--fg-secondary)',
                      }}
                    >
                      {log.origin}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[var(--fg-primary)]">{log.endpoint}</td>
                  <td className="px-3 py-1.5">
                    <span style={{ color: log.success ? 'var(--neon-green)' : 'var(--neon-magenta)' }}>
                      {log.success ? '✓ ok' : '✗ fail'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{log.latency_ms}ms</td>
                  <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{log.status_code ?? '—'}</td>
                  <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{log.extracted_count ?? '—'}</td>
                  <td className="px-3 py-1.5 text-[var(--neon-magenta)] truncate max-w-xs">
                    {log.error_class}
                    {log.error_message ? `: ${log.error_message.slice(0, 80)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MIHON SUB-SOURCES PANEL */}
      {id === 'mihon' && (
        <section className="border border-[var(--fg-faint)] bg-[var(--bg-terminal)]/70 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--fg-faint)] text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">
            <span>// extensões mihon ({mihon?.count ?? 0})</span>
            <span style={{ color: mihon?.connected ? 'var(--neon-cyan)' : 'var(--neon-magenta)' }}>
              {mihon === null
                ? '◌ aguardando'
                : !mihon.configured
                ? '⏸ SUWAYOMI_URL não definido'
                : !mihon.connected
                ? '✗ suwayomi inacessível'
                : `◉ ${mihon.count} sub-fontes`}
            </span>
          </div>
          {mihon && mihon.configured && mihon.sub_sources.length === 0 && (
            <div className="px-4 py-6 text-[var(--fg-muted)] text-[11px] uppercase tracking-[0.25em] text-center">
              // nenhuma extensão instalada — instale via UI do Suwayomi em :4567
            </div>
          )}
          {mihon && mihon.error && (
            <div className="px-4 py-3 text-[var(--neon-magenta)] text-[11px]">
              ✗ {mihon.error}
            </div>
          )}
          {mihon && mihon.sub_sources.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--fg-faint)]">
              {mihon.sub_sources.map((s) => (
                <div
                  key={s.id}
                  className="bg-[var(--bg-terminal)] px-3 py-2.5 flex items-center gap-2.5 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  {s.icon && (
                    <img
                      src={s.icon}
                      alt=""
                      className="w-7 h-7 object-contain shrink-0"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-[var(--fg-primary)] truncate">{s.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[9px] uppercase tracking-widest">
                      <span className="text-[var(--neon-cyan)]">{s.lang || '??'}</span>
                      {s.is_nsfw && <span className="text-[var(--neon-magenta)]">18+</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
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
    <div className="bg-[var(--bg-terminal)] px-3 py-2 hover:bg-[var(--bg-elevated)] transition-colors">
      <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="text-sm mt-0.5 tabular-nums" style={{ color }}>
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
