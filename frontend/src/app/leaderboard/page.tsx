'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';

import Loader from '@/components/Loader';
import { ApiError, tokenStore } from '@/lib/api';
import {
  fetchLeaderboard,
  type LeaderboardResponse,
  type RankEntry,
} from '@/lib/ranking';

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

  const seasonEnds = new Date(data.season.ends_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <p
          className="mono text-[11px] uppercase tracking-[0.3em] mb-3"
          style={{ color: 'var(--fg-muted)' }}
        >
          // GLOBAL_RANKING
        </p>
        <header
          className="corners-sm mb-8 p-6 md:p-8 relative overflow-hidden"
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
                'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 30%, transparent 100%)',
            }}
          />
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6" style={{ color: 'var(--arasaka-red)' }} />
            <h1
              className="glitch-2 text-3xl md:text-4xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {data.season.name}
            </h1>
          </div>
          <p
            className="mono text-[11px] mt-3 uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            SEASON ENCERRA · {seasonEnds}
          </p>
        </header>

        {/* Tier legend */}
        <section className="mb-10">
          <h2
            className="mono text-[10px] uppercase tracking-[0.25em] font-bold mb-4"
            style={{ color: 'var(--fg-secondary)' }}
          >
            HIERARQUIA
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...data.tiers].reverse().map((tier) => (
              <div
                key={tier.slug}
                className="corners-sm p-3 flex items-center gap-3"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-faint)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tier.emblem}
                  alt={tier.name}
                  style={{ width: 36, height: 36, objectFit: 'contain' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: 'var(--fg-primary)' }}>
                    {tier.name}
                  </p>
                  <p
                    className="mono text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    TIER {tier.tier}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* My row callout */}
        {data.me && (
          <section className="mb-8">
            <h2
              className="mono text-[10px] uppercase tracking-[0.25em] font-bold mb-3"
              style={{ color: 'var(--fg-secondary)' }}
            >
              VOCÊ
            </h2>
            <Row entry={data.me} highlight />
          </section>
        )}

        {/* Leaderboard */}
        <section>
          <h2
            className="mono text-[10px] uppercase tracking-[0.25em] font-bold mb-3"
            style={{ color: 'var(--fg-secondary)' }}
          >
            TOP {data.entries.length}
          </h2>
          {data.entries.length === 0 ? (
            <p
              className="mono text-[11px] uppercase tracking-widest p-6 text-center corners-sm"
              style={{
                color: 'var(--fg-muted)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-faint)',
              }}
            >
              // SEM_AGENTES_PONTUANDO
            </p>
          ) : (
            <div className="space-y-2">
              {data.entries.map((entry) => (
                <Row
                  key={`${entry.username}-${entry.position}`}
                  entry={entry}
                  highlight={data.me?.username === entry.username}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Row({ entry, highlight = false }: { entry: RankEntry; highlight?: boolean }) {
  return (
    <div
      className="corners-sm flex items-center gap-4 p-3 md:p-4"
      style={{
        background: highlight ? 'rgba(220,38,38,0.06)' : 'var(--bg-elevated)',
        border: `1px solid ${highlight ? 'var(--arasaka-red)' : 'var(--border-faint)'}`,
      }}
    >
      <div
        className="mono text-sm font-bold w-12 text-center shrink-0"
        style={{ color: highlight ? 'var(--arasaka-red)' : 'var(--fg-muted)' }}
      >
        {entry.position ? `#${entry.position}` : '—'}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={entry.rank.emblem}
        alt={entry.rank.name}
        style={{ width: 40, height: 40, objectFit: 'contain' }}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {entry.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar}
            alt=""
            style={{
              width: 32,
              height: 32,
              objectFit: 'cover',
              border: '1px solid var(--border-mid)',
            }}
            className="shrink-0 corners-sm"
          />
        ) : (
          <div
            className="shrink-0 corners-sm"
            style={{
              width: 32,
              height: 32,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
            }}
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--fg-primary)' }}>
            {entry.username}
          </p>
          <p
            className="mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            {entry.rank.name}
          </p>
        </div>
      </div>
      <div
        className="mono text-sm font-bold shrink-0 text-right"
        style={{ color: 'var(--fg-primary)' }}
      >
        {entry.score.toLocaleString('pt-BR')}
        <span
          className="mono text-[9px] uppercase tracking-widest block"
          style={{ color: 'var(--fg-muted)' }}
        >
          pts
        </span>
      </div>
    </div>
  );
}
