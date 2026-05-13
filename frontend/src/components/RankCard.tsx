'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Info, Trophy } from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  fetchMyRank,
  fmt,
  timeUntil,
  type RankEntry,
} from '@/lib/ranking';

/**
 * Widget compacto do /profile com rank + score + barra de progresso ao
 * próximo tier. Animações: count-up no score, fill na progress bar,
 * pulse no emblema, scanline ambiente. Linka pra /leaderboard.
 */
export default function RankCard() {
  const [data, setData] = useState<RankEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animatedScore = useCountUp(data?.score ?? 0, 1100);

  useEffect(() => {
    fetchMyRank()
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) {
          setError('Sem season ativa');
        } else {
          setError('Falha ao carregar rank');
        }
      });
  }, []);

  if (error) {
    return (
      <div
        className="corners-sm p-4 mono text-[11px] uppercase tracking-widest"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
          color: 'var(--fg-muted)',
        }}
      >
        // {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="corners-sm p-5 mono text-[11px] uppercase tracking-widest"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
          color: 'var(--fg-muted)',
        }}
      >
        // SYNCING_RANK<span className="mikoshi-blink">_</span>
      </div>
    );
  }

  const unranked = data.score === 0;
  const progress = data.progress ?? null;
  const countdown = timeUntil(data.season.ends_at);
  const totalAgents = data.total_agents ?? 0;
  const percent = progress?.percent ?? (unranked ? 0 : 100);

  return (
    <Link
      href="/leaderboard"
      className="corners-sm block relative overflow-hidden group rank-row-in"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-faint)',
      }}
    >
      {/* Top rail */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 30%, transparent 100%)',
        }}
      />
      {/* Ambient grid + scanline */}
      <div className="absolute inset-0 rank-grid-bg opacity-40 pointer-events-none" />
      <div className="rank-scan-overlay" />

      <div className="relative p-5 md:p-6">
        <div className="flex items-center gap-5">
          <div
            className="shrink-0 flex items-center justify-center corners-sm"
            style={{
              width: 88,
              height: 88,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.rank.emblem}
              alt={data.rank.name}
              className="rank-emblem-pulse"
              style={{ width: 76, height: 76, objectFit: 'contain' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              // {data.season.name}
            </p>
            <h3
              className="text-2xl md:text-3xl font-black tracking-tight mt-0.5"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
            >
              {data.rank.name.toUpperCase()}
            </h3>
            <div
              className="mono text-[11px] mt-1.5 uppercase tracking-widest flex flex-wrap items-center gap-x-3 gap-y-1"
              style={{ color: 'var(--fg-secondary)' }}
            >
              <span style={{ color: 'var(--fg-primary)' }}>
                {fmt(animatedScore)}<span style={{ color: 'var(--fg-muted)' }}> pts</span>
              </span>
              {!unranked && (
                <span>
                  <span style={{ color: 'var(--fg-muted)' }}>POS </span>
                  #{data.position}
                  {totalAgents > 0 && (
                    <span style={{ color: 'var(--fg-muted)' }}>/{fmt(totalAgents)}</span>
                  )}
                </span>
              )}
              {unranked && (
                <span style={{ color: 'var(--fg-muted)' }}>UNRANKED</span>
              )}
            </div>
          </div>
          <ChevronRight
            className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1"
            style={{ color: 'var(--arasaka-red)' }}
          />
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mono text-[10px] uppercase tracking-widest mb-2">
            <span style={{ color: 'var(--fg-muted)' }}>
              {progress ? (
                <>
                  // PROX:{' '}
                  <span style={{ color: 'var(--fg-secondary)' }}>
                    {progress.next_rank.name.toUpperCase()}
                  </span>
                </>
              ) : (
                <>// MAX_TIER_ALCANCADO</>
              )}
            </span>
            <span style={{ color: 'var(--fg-secondary)' }}>
              {progress ? `${percent}%` : '100%'}
            </span>
          </div>
          <ProgressBar percent={percent} maxed={!progress} />
          <div
            className="mt-1.5 mono text-[10px] uppercase tracking-widest flex items-center justify-between"
            style={{ color: 'var(--fg-muted)' }}
          >
            <span>
              {progress
                ? progress.points_to_next > 0
                  ? `${fmt(progress.points_to_next)} pts pra promocao`
                  : 'PROMOCAO_PENDENTE // proximo recompute'
                : 'TOPO DA HIERARQUIA'}
            </span>
            {countdown && (
              <span>
                ENCERRA {countdown.days}d {countdown.hours}h
              </span>
            )}
          </div>
        </div>

        {/* Breakdown chips */}
        {data.breakdown && (data.breakdown.chapter || data.breakdown.work_complete || data.breakdown.reading_time) ? (
          <>
            <div className="mt-5 flex items-center justify-between">
              <p
                className="mono text-[10px] uppercase tracking-widest flex items-center gap-1.5"
                style={{ color: 'var(--fg-muted)' }}
              >
                <Info className="w-3 h-3" style={{ color: 'var(--neon-cyan)' }} />
                // PASSE_O_MOUSE_PARA_DETALHES
              </p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <BreakdownChip
                label="CAPS"
                value={data.breakdown.chapter}
                hint="10 pts por capitulo lido. Marca automaticamente ao terminar o reader, ou via 'marcar como lido' na lista."
              />
              <BreakdownChip
                label="OBRAS"
                value={data.breakdown.work_complete}
                hint="Bonus de 5 × numero de caps ao completar uma obra inteira. Paga uma vez por obra na season."
              />
              <BreakdownChip
                label="TEMPO"
                value={data.breakdown.reading_time}
                hint="1 ponto a cada 5 minutos lidos por capitulo. Cap em 30 min por capitulo (evita abas esquecidas)."
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Bottom corner indicator */}
      <div
        className="absolute bottom-3 right-3 mono text-[9px] uppercase tracking-widest flex items-center gap-1.5 opacity-60"
        style={{ color: 'var(--fg-muted)' }}
      >
        <Trophy className="w-3 h-3" /> RANKED_VIEW
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

function ProgressBar({ percent, maxed }: { percent: number; maxed: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: 10,
        background: 'var(--bg-base)',
        border: '1px solid var(--border-mid)',
      }}
    >
      <div
        className="relative h-full rank-progress-fill"
        style={
          {
            '--rank-progress': `${clamped}%`,
            background: maxed
              ? 'linear-gradient(90deg, var(--neon-yellow) 0%, var(--arasaka-red) 100%)'
              : 'linear-gradient(90deg, var(--arasaka-red-deep) 0%, var(--arasaka-red) 60%, var(--arasaka-red-hover) 100%)',
            boxShadow: maxed
              ? '0 0 12px rgba(250,204,21,0.5)'
              : '0 0 12px rgba(220,38,38,0.5)',
          } as React.CSSProperties
        }
      >
        {/* shine streak */}
        <div
          className="absolute inset-y-0 w-1/3 rank-progress-shine"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
          }}
        />
      </div>
      {/* Tick marks */}
      <div className="absolute inset-0 flex pointer-events-none">
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className="absolute top-0 bottom-0"
            style={{
              left: `${tick}%`,
              width: 1,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BreakdownChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div
      className="corners-sm p-2 text-center cursor-help transition-colors"
      title={hint}
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border-faint)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--neon-cyan)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-faint)';
      }}
    >
      <div
        className="mono text-[9px] uppercase tracking-widest"
        style={{ color: 'var(--fg-muted)' }}
      >
        {label}
      </div>
      <div
        className="mono text-sm font-bold mt-0.5"
        style={{ color: 'var(--fg-primary)' }}
      >
        {fmt(value)}
        <span className="mono text-[8px] ml-1" style={{ color: 'var(--fg-muted)' }}>
          pts
        </span>
      </div>
    </div>
  );
}

// Hook simples de count-up — ease-out cubic, ignora se target=0.
function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) {
      setValue(0);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.floor(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
