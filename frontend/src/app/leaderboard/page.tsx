'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Crown, Flame, Hourglass, Layers, Trophy } from 'lucide-react';

import Loader from '@/components/Loader';
import RankingRules from '@/components/RankingRules';
import { ApiError, tokenStore } from '@/lib/api';
import {
  fetchLeaderboard,
  fmt,
  timeUntil,
  type LeaderboardResponse,
  type RankEntry,
  type RankPayload,
} from '@/lib/ranking';

/**
 * Leaderboard global — experiência Valorant-like.
 *
 * Layout:
 *  1. Header com season name + countdown timer (live)
 *  2. HERO STATUS — meu rank, progress bar, breakdown, top-3 podium quando aplicavel
 *  3. HIERARQUIA — fileira de 8 tiers, marcador na minha posicao atual
 *  4. PODIUM — top 3 destacados
 *  5. LEADERBOARD — lista paginada com row stagger animation
 */
export default function LeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      router.replace('/login?next=/leaderboard');
      return;
    }
    fetchLeaderboard({ limit: 100 })
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login?next=/leaderboard');
          return;
        }
        setError('Falha ao carregar leaderboard.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="QUERYING_RANKS" caption="// FETCHING_LEADERBOARD" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
      >
        <p className="mono text-[12px] uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>
          // {error || 'NO_DATA'}
        </p>
      </main>
    );
  }

  const podium = data.entries.slice(0, 3);
  const rest = data.entries.slice(3);

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      {/* Ambient backdrop */}
      <div className="absolute inset-0 rank-grid-bg opacity-30 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto p-6 md:p-10">
        <PageHeader season={data.season} totalAgents={data.total_agents} />

        {data.me && (
          <section className="mb-12 rank-row-in">
            <SectionLabel n="01" title="MEU_STATUS" />
            <HeroCard me={data.me} totalAgents={data.total_agents} />
          </section>
        )}

        <section className="mb-12">
          <SectionLabel n="02" title="HIERARQUIA" />
          <TierLadder tiers={data.tiers} currentTier={data.me?.rank.tier ?? 0} />
        </section>

        {podium.length > 0 && (
          <section className="mb-12">
            <SectionLabel n="03" title="PODIUM" />
            <Podium entries={podium} meUsername={data.me?.username ?? null} />
          </section>
        )}

        <section>
          <SectionLabel
            n={podium.length > 0 ? '04' : '03'}
            title={
              rest.length > 0
                ? `LEADERBOARD · ${fmt(rest.length)} AGENTES`
                : 'LEADERBOARD'
            }
          />
          {rest.length === 0 ? (
            <p
              className="mono text-[11px] uppercase tracking-widest p-6 text-center corners-sm"
              style={{
                color: 'var(--fg-muted)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-faint)',
              }}
            >
              // SEM_MAIS_AGENTES_PONTUANDO
            </p>
          ) : (
            <div className="space-y-2">
              {rest.map((entry, i) => (
                <Row
                  key={`${entry.username}-${entry.position}`}
                  entry={entry}
                  highlight={data.me?.username === entry.username}
                  index={i}
                />
              ))}
            </div>
          )}
        </section>

        <section id="protocolo" className="mt-12 scroll-mt-24">
          <SectionLabel
            n={podium.length > 0 ? '05' : '04'}
            title="PROTOCOLO"
          />
          <RankingRules tiers={data.tiers} />
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page header — title + countdown live timer
// ---------------------------------------------------------------------------
function PageHeader({
  season,
  totalAgents,
}: {
  season: LeaderboardResponse['season'];
  totalAgents: number;
}) {
  const countdown = useLiveCountdown(season.ends_at);

  return (
    <header className="mb-10">
      <p
        className="mono text-[11px] uppercase tracking-[0.3em] mb-3"
        style={{ color: 'var(--fg-muted)' }}
      >
        // GLOBAL_RANKING
      </p>
      <div
        className="corners-sm relative overflow-hidden p-6 md:p-8 rank-row-in"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 40%, transparent 100%)',
          }}
        />
        <div className="rank-scan-overlay" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6" style={{ color: 'var(--arasaka-red)' }} />
            <div>
              <h1
                className="glitch-2 text-3xl md:text-4xl font-black tracking-tight leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {season.name.toUpperCase()}
              </h1>
              <p
                className="mono text-[10px] mt-2 uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                {fmt(totalAgents)} agentes em disputa
              </p>
            </div>
          </div>
          <div className="md:ml-auto flex items-center gap-4">
            <Hourglass className="w-5 h-5" style={{ color: 'var(--arasaka-red)' }} />
            <div>
              <p
                className="mono text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                ENCERRA EM
              </p>
              <p
                className="mono text-lg font-bold mt-0.5"
                style={{ color: 'var(--fg-primary)' }}
              >
                {countdown ? (
                  <>
                    {countdown.days}<span style={{ color: 'var(--fg-muted)' }}>d</span>{' '}
                    {String(countdown.hours).padStart(2, '0')}
                    <span style={{ color: 'var(--fg-muted)' }}>h</span>{' '}
                    {String(countdown.minutes).padStart(2, '0')}
                    <span style={{ color: 'var(--fg-muted)' }}>m</span>
                  </>
                ) : (
                  'ENCERRADA'
                )}
              </p>
            </div>
          </div>
        </div>
        <a
          href="#protocolo"
          className="relative mt-4 inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--neon-cyan)]"
          style={{ color: 'var(--fg-muted)' }}
        >
          // COMO_FUNCIONA_O_RANKING ↓
        </a>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero card — meu rank com progress + breakdown
// ---------------------------------------------------------------------------
function HeroCard({ me, totalAgents }: { me: RankEntry; totalAgents: number }) {
  const animatedScore = useCountUp(me.score, 1300);
  const progress = me.progress ?? null;
  const breakdown = me.breakdown;
  const unranked = me.score === 0 || me.position === null;
  const percent = progress?.percent ?? (unranked ? 0 : 100);

  return (
    <div
      className="corners-sm relative overflow-hidden p-6 md:p-8"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--arasaka-red)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background:
            'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red-hover) 50%, var(--arasaka-red) 100%)',
        }}
      />
      <div className="rank-scan-overlay" />
      <div className="absolute inset-0 rank-grid-bg opacity-25 pointer-events-none" />

      <div className="relative flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-center">
        {/* Emblem */}
        <div
          className="shrink-0 flex items-center justify-center corners-sm rank-tier-glow mx-auto md:mx-0"
          style={{
            width: 140,
            height: 140,
            background: 'var(--bg-base)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={me.rank.emblem}
            alt={me.rank.name}
            className="rank-emblem-pulse"
            style={{ width: 118, height: 118, objectFit: 'contain' }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 w-full">
          <p
            className="mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--arasaka-red)' }}
          >
            // TIER_ATUAL
          </p>
          <h2
            className="text-4xl md:text-5xl font-black tracking-tight mt-1 leading-none"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
          >
            {me.rank.name.toUpperCase()}
          </h2>
          <div
            className="mono text-xs mt-3 uppercase tracking-widest flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ color: 'var(--fg-secondary)' }}
          >
            <span>
              <span style={{ color: 'var(--fg-muted)' }}>SCORE </span>
              <span style={{ color: 'var(--fg-primary)' }}>{fmt(animatedScore)}</span>
              <span style={{ color: 'var(--fg-muted)' }}> pts</span>
            </span>
            {!unranked && (
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>POS </span>
                #{me.position}
                <span style={{ color: 'var(--fg-muted)' }}>/{fmt(totalAgents)}</span>
              </span>
            )}
            {unranked && (
              <span style={{ color: 'var(--fg-muted)' }}>// AGUARDANDO_PRIMEIRA_LEITURA</span>
            )}
            {me.peak_rank && me.peak_rank.tier > me.rank.tier && (
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>PICO </span>
                <span style={{ color: 'var(--neon-yellow)' }}>{me.peak_rank.name}</span>
              </span>
            )}
          </div>

          {/* Progress to next */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="mono text-[10px] uppercase tracking-widest">
                <span style={{ color: 'var(--fg-muted)' }}>// PROXIMO_TIER: </span>
                {progress ? (
                  <span style={{ color: 'var(--fg-primary)' }}>
                    {progress.next_rank.name.toUpperCase()}
                  </span>
                ) : (
                  <span style={{ color: 'var(--neon-yellow)' }}>MAXIMO_ALCANCADO</span>
                )}
              </div>
              <span
                className="mono text-sm font-bold"
                style={{ color: progress ? 'var(--arasaka-red)' : 'var(--neon-yellow)' }}
              >
                {progress ? `${percent}%` : '100%'}
              </span>
            </div>
            <ProgressBar percent={percent} maxed={!progress} thick />
            <div
              className="mt-2 mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--fg-muted)' }}
            >
              {progress ? (
                progress.points_to_next > 0 ? (
                  <>
                    +<span style={{ color: 'var(--fg-secondary)' }}>{fmt(progress.points_to_next)} pts</span> pra promocao ·
                    threshold <span style={{ color: 'var(--fg-secondary)' }}>{fmt(progress.threshold_score)}</span>
                  </>
                ) : (
                  <>// PROMOCAO_PENDENTE · proximo recompute em 24h</>
                )
              ) : (
                <>// SEM_TIER_SUPERIOR · mantenha posicao no topo</>
              )}
            </div>
          </div>

          {/* Breakdown */}
          {breakdown && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BreakdownCell
                icon={<Layers className="w-3.5 h-3.5" />}
                label="CAPITULOS"
                value={breakdown.chapter}
              />
              <BreakdownCell
                icon={<Flame className="w-3.5 h-3.5" />}
                label="OBRAS_COMPLETAS"
                value={breakdown.work_complete}
              />
              <BreakdownCell
                icon={<Clock className="w-3.5 h-3.5" />}
                label="TEMPO_ATIVO"
                value={breakdown.reading_time}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BreakdownCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const animated = useCountUp(value, 1000);
  return (
    <div
      className="corners-sm p-3 relative overflow-hidden"
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <div
        className="mono text-[9px] uppercase tracking-widest flex items-center gap-1.5"
        style={{ color: 'var(--fg-muted)' }}
      >
        <span style={{ color: 'var(--arasaka-red)' }}>{icon}</span>
        {label}
      </div>
      <div
        className="mono text-lg font-bold mt-1"
        style={{ color: 'var(--fg-primary)' }}
      >
        {fmt(animated)}
        <span className="mono text-[10px] ml-1" style={{ color: 'var(--fg-muted)' }}>
          pts
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier ladder — strip horizontal com 8 emblemas + marcador atual
// ---------------------------------------------------------------------------
function TierLadder({
  tiers,
  currentTier,
}: {
  tiers: RankPayload[];
  currentTier: number;
}) {
  // Backend devolve do mais alto pro mais baixo; pra UX queremos baixo→alto
  const ordered = useMemo(
    () => [...tiers].sort((a, b) => a.tier - b.tier),
    [tiers],
  );

  return (
    <div
      className="corners-sm p-4 md:p-5 relative overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <div className="rank-scan-overlay" />
      <div className="relative grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
        {ordered.map((tier) => {
          const isCurrent = tier.tier === currentTier;
          const isPassed = tier.tier < currentTier;
          return (
            <div
              key={tier.slug}
              className="flex flex-col items-center text-center relative pt-1.5"
            >
              {isCurrent && (
                <div
                  className="absolute -top-1.5 mono text-[8px] uppercase tracking-widest rank-marker-bob px-1.5 py-0.5"
                  style={{
                    color: 'var(--arasaka-red)',
                    border: '1px solid var(--arasaka-red)',
                    background: 'var(--bg-base)',
                    transform: 'translateY(-100%)',
                  }}
                >
                  VOCE
                </div>
              )}
              <div
                className="corners-sm flex items-center justify-center mb-2 transition-all"
                style={{
                  width: isCurrent ? 64 : 48,
                  height: isCurrent ? 64 : 48,
                  background: 'var(--bg-base)',
                  border: `1px solid ${isCurrent ? 'var(--arasaka-red)' : 'var(--border-mid)'}`,
                  opacity: isPassed ? 1 : isCurrent ? 1 : 0.45,
                  boxShadow: isCurrent ? '0 0 16px rgba(220,38,38,0.45)' : 'none',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tier.emblem}
                  alt={tier.name}
                  className={isCurrent ? 'rank-emblem-pulse' : ''}
                  style={{
                    width: isCurrent ? 56 : 42,
                    height: isCurrent ? 56 : 42,
                    objectFit: 'contain',
                    filter: isPassed || isCurrent ? 'none' : 'grayscale(0.8)',
                  }}
                />
              </div>
              <p
                className="mono text-[9px] uppercase tracking-widest leading-tight"
                style={{
                  color: isCurrent
                    ? 'var(--arasaka-red)'
                    : isPassed
                      ? 'var(--fg-secondary)'
                      : 'var(--fg-muted)',
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                {tier.name}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podium top 3
// ---------------------------------------------------------------------------
function Podium({
  entries,
  meUsername,
}: {
  entries: RankEntry[];
  meUsername: string | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {entries.map((entry, i) => (
        <PodiumCard
          key={entry.username}
          entry={entry}
          place={i + 1}
          isMe={meUsername === entry.username}
        />
      ))}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  isMe,
}: {
  entry: RankEntry;
  place: number;
  isMe: boolean;
}) {
  const placeColors: Record<number, { rail: string; accent: string; label: string }> = {
    1: { rail: 'var(--neon-yellow)', accent: 'var(--neon-yellow)', label: '#01' },
    2: { rail: '#cbd5e1', accent: '#e2e8f0', label: '#02' },
    3: { rail: '#c2410c', accent: '#fb923c', label: '#03' },
  };
  const c = placeColors[place] ?? placeColors[3];
  const animated = useCountUp(entry.score, 1200);

  return (
    <div
      className="corners-sm relative overflow-hidden p-5 rank-row-in"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${isMe ? 'var(--arasaka-red)' : 'var(--border-faint)'}`,
        animationDelay: `${place * 80}ms`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: c.rail,
          boxShadow: `0 0 14px ${c.rail}`,
        }}
      />
      {place === 1 && (
        <Crown
          className="absolute top-3 right-3 w-5 h-5"
          style={{ color: c.accent, filter: `drop-shadow(0 0 8px ${c.accent})` }}
        />
      )}
      <div className="flex items-center gap-4">
        <div
          className="shrink-0 corners-sm flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            background: 'var(--bg-base)',
            border: `1px solid ${c.rail}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.rank.emblem}
            alt={entry.rank.name}
            className={place === 1 ? 'rank-emblem-pulse' : ''}
            style={{ width: 60, height: 60, objectFit: 'contain' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="mono text-[10px] uppercase tracking-widest"
            style={{ color: c.accent }}
          >
            {c.label}
          </p>
          <p
            className="text-base font-bold truncate mt-0.5"
            style={{ color: 'var(--fg-primary)' }}
          >
            {entry.username}
          </p>
          <p
            className="mono text-[10px] uppercase tracking-widest mt-1"
            style={{ color: 'var(--fg-muted)' }}
          >
            {entry.rank.name}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          SCORE
        </span>
        <span
          className="mono text-xl font-bold"
          style={{ color: 'var(--fg-primary)' }}
        >
          {fmt(animated)}
          <span className="mono text-[10px] ml-1" style={{ color: 'var(--fg-muted)' }}>
            pts
          </span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard leaderboard row
// ---------------------------------------------------------------------------
function Row({
  entry,
  highlight = false,
  index,
}: {
  entry: RankEntry;
  highlight?: boolean;
  index: number;
}) {
  const animated = useCountUp(entry.score, 900);
  return (
    <div
      className="corners-sm flex items-center gap-3 md:gap-4 p-3 md:p-4 relative overflow-hidden transition-colors rank-row-in"
      style={
        {
          background: highlight ? 'rgba(220,38,38,0.08)' : 'var(--bg-elevated)',
          border: `1px solid ${highlight ? 'var(--arasaka-red)' : 'var(--border-faint)'}`,
          animationDelay: `${Math.min(index * 30, 600)}ms`,
        } as React.CSSProperties
      }
    >
      {highlight && (
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: 2,
            background:
              'linear-gradient(180deg, transparent 0%, var(--arasaka-red) 50%, transparent 100%)',
          }}
        />
      )}
      <div
        className="mono text-sm font-bold w-10 md:w-12 text-center shrink-0"
        style={{ color: highlight ? 'var(--arasaka-red)' : 'var(--fg-muted)' }}
      >
        {entry.position ? `#${entry.position}` : '—'}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={entry.rank.emblem}
        alt={entry.rank.name}
        style={{ width: 36, height: 36, objectFit: 'contain' }}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {entry.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar}
            alt=""
            style={{
              width: 30,
              height: 30,
              objectFit: 'cover',
              border: '1px solid var(--border-mid)',
            }}
            className="shrink-0 corners-sm hidden sm:block"
          />
        ) : (
          <div
            className="shrink-0 corners-sm hidden sm:block"
            style={{
              width: 30,
              height: 30,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
            }}
          />
        )}
        <div className="min-w-0">
          <p
            className="text-sm font-bold truncate"
            style={{ color: 'var(--fg-primary)' }}
          >
            {entry.username}
            {highlight && (
              <span
                className="mono ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                style={{
                  color: 'var(--arasaka-red)',
                  border: '1px solid var(--arasaka-red)',
                }}
              >
                VOCE
              </span>
            )}
          </p>
          <p
            className="mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            {entry.rank.name}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className="mono text-sm md:text-base font-bold"
          style={{ color: 'var(--fg-primary)' }}
        >
          {fmt(animated)}
        </div>
        <div
          className="mono text-[9px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          pts
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function ProgressBar({
  percent,
  maxed,
  thick = false,
}: {
  percent: number;
  maxed: boolean;
  thick?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: thick ? 14 : 10,
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
              ? '0 0 14px rgba(250,204,21,0.55)'
              : '0 0 14px rgba(220,38,38,0.55)',
          } as React.CSSProperties
        }
      >
        <div
          className="absolute inset-y-0 w-1/3 rank-progress-shine"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
          }}
        />
      </div>
      <div className="absolute inset-0 flex pointer-events-none">
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className="absolute top-0 bottom-0"
            style={{
              left: `${tick}%`,
              width: 1,
              background: 'rgba(0,0,0,0.55)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Hook: count-up para number; ease-out cubic; respeita prefers-reduced-motion.
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

// Hook: countdown ao-vivo até ISO date, refresca a cada minuto.
function useLiveCountdown(iso: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => timeUntil(iso), [iso, tick]);
}
