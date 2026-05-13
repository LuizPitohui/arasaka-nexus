'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Trophy } from 'lucide-react';

import Loader from '@/components/Loader';
import { ApiError, tokenStore } from '@/lib/api';
import {
  fetchSeasons,
  fmt,
  type SeasonHistoryEntry,
} from '@/lib/ranking';

/**
 * Historico de seasons — mostra todas as janelas competitivas que o user
 * participou, com peak rank alcancado em cada uma. Linka pro leaderboard
 * da season especifica via ?season=<slug>.
 */
export default function SeasonsPage() {
  const router = useRouter();
  const [seasons, setSeasons] = useState<SeasonHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      router.replace('/login?next=/seasons');
      return;
    }
    fetchSeasons()
      .then(setSeasons)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login?next=/seasons');
          return;
        }
        setError('Falha ao carregar historico');
      });
  }, [router]);

  if (error) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
      >
        <p
          className="mono text-[12px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          // {error}
        </p>
      </main>
    );
  }

  if (!seasons) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="QUERYING_ARCHIVE" caption="// FETCHING_SEASONS" />
      </div>
    );
  }

  const active = seasons.find((s) => s.is_active) ?? null;
  const closed = seasons.filter((s) => !s.is_active);

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      <div className="absolute inset-0 rank-grid-bg opacity-30 pointer-events-none" />
      <div className="relative max-w-4xl mx-auto p-6 md:p-10">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest mb-6 transition-colors"
          style={{ color: 'var(--fg-muted)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--arasaka-red)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--fg-muted)')
          }
        >
          <ArrowLeft className="w-3 h-3" /> VOLTAR AO LEADERBOARD
        </Link>

        <p
          className="mono text-[11px] uppercase tracking-[0.3em] mb-3"
          style={{ color: 'var(--fg-muted)' }}
        >
          // SEASONS_ARCHIVE
        </p>
        <h1
          className="glitch-2 text-3xl md:text-4xl font-black tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          HISTORICO
        </h1>
        <p
          className="mono text-[11px] uppercase tracking-widest mt-2 mb-10"
          style={{ color: 'var(--fg-muted)' }}
        >
          {fmt(seasons.length)} season{seasons.length === 1 ? '' : 's'} registrada
          {seasons.length === 1 ? '' : 's'}
        </p>

        {active && (
          <section className="mb-12 rank-row-in">
            <SectionLabel n="01" title="SEASON ATIVA" />
            <SeasonRow season={active} active />
          </section>
        )}

        {closed.length > 0 && (
          <section>
            <SectionLabel
              n={active ? '02' : '01'}
              title="SEASONS ENCERRADAS"
            />
            <div className="space-y-3">
              {closed.map((s, i) => (
                <SeasonRow key={s.id} season={s} index={i} />
              ))}
            </div>
          </section>
        )}

        {!active && closed.length === 0 && (
          <p
            className="mono text-[11px] uppercase tracking-widest p-6 text-center corners-sm"
            style={{
              color: 'var(--fg-muted)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-faint)',
            }}
          >
            // SEM_SEASONS_REGISTRADAS
          </p>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="mono text-[10px] uppercase tracking-widest px-1.5 py-0.5"
        style={{
          color: 'var(--arasaka-red)',
          border: '1px solid var(--arasaka-red)',
        }}
      >
        {n}
      </span>
      <h2
        className="text-[11px] uppercase tracking-[0.25em] font-bold mono"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: 'var(--border-faint)' }} />
    </div>
  );
}

function SeasonRow({
  season,
  active = false,
  index = 0,
}: {
  season: SeasonHistoryEntry;
  active?: boolean;
  index?: number;
}) {
  const startsAt = new Date(season.starts_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const endsAt = new Date(season.ends_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const peak = season.my_peak_rank;
  const finalRank = season.my_final_rank;
  const unranked = season.my_score === 0;

  return (
    <Link
      href={`/leaderboard?season=${season.slug}`}
      className="corners-sm block relative overflow-hidden rank-row-in group transition-colors"
      style={
        {
          background: 'var(--bg-elevated)',
          border: `1px solid ${active ? 'var(--arasaka-red)' : 'var(--border-faint)'}`,
          animationDelay: `${Math.min(index * 40, 400)}ms`,
        } as React.CSSProperties
      }
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: active
            ? 'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 40%, transparent 100%)'
            : 'linear-gradient(90deg, var(--border-mid) 0%, transparent 100%)',
        }}
      />
      <div className="rank-scan-overlay" />
      <div className="relative flex items-center gap-4 md:gap-6 p-4 md:p-5">
        {/* Emblem do peak rank */}
        <div
          className="shrink-0 corners-sm flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            background: 'var(--bg-base)',
            border: `1px solid ${
              active ? 'var(--arasaka-red)' : 'var(--border-mid)'
            }`,
            opacity: unranked ? 0.4 : 1,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={peak.emblem}
            alt={peak.name}
            style={{ width: 52, height: 52, objectFit: 'contain' }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="text-lg font-black tracking-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: active ? 'var(--arasaka-red)' : 'var(--fg-primary)',
              }}
            >
              {season.name.toUpperCase()}
            </h3>
            {active && (
              <span
                className="mono text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                style={{
                  background: 'var(--arasaka-red)',
                  color: '#fff',
                }}
              >
                ATIVA
              </span>
            )}
          </div>
          <p
            className="mono text-[10px] uppercase tracking-widest mt-1 flex items-center gap-2 flex-wrap"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Clock className="w-3 h-3" />
            {startsAt} → {endsAt}
          </p>
          <div
            className="mono text-[11px] uppercase tracking-widest mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap"
            style={{ color: 'var(--fg-secondary)' }}
          >
            {unranked ? (
              <span style={{ color: 'var(--fg-muted)' }}>
                // SEM_PARTICIPACAO
              </span>
            ) : (
              <>
                <span>
                  <span style={{ color: 'var(--fg-muted)' }}>PICO </span>
                  <span style={{ color: 'var(--neon-yellow)' }}>{peak.name}</span>
                </span>
                {finalRank.tier !== peak.tier && (
                  <span>
                    <span style={{ color: 'var(--fg-muted)' }}>FINAL </span>
                    {finalRank.name}
                  </span>
                )}
                <span>
                  <span style={{ color: 'var(--fg-muted)' }}>SCORE </span>
                  {fmt(season.my_score)}
                  <span style={{ color: 'var(--fg-muted)' }}> pts</span>
                </span>
              </>
            )}
          </div>
        </div>

        <Trophy
          className="w-4 h-4 shrink-0 transition-opacity opacity-30 group-hover:opacity-100"
          style={{ color: 'var(--arasaka-red)' }}
        />
      </div>
    </Link>
  );
}
