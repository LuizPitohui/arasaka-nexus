'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { fetchMyRank, type RankEntry } from '@/lib/ranking';

/**
 * Cartão compacto com rank atual do usuário na season ativa.
 *
 * Renderiza emblema do tier + nome + posição global + score. Linka pra
 * /leaderboard. Quando user não tem stats (score=0), mostra "// UNRANKED".
 */
export default function RankCard() {
  const [data, setData] = useState<RankEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        className="corners-sm p-4 mono text-[11px] uppercase tracking-widest"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-faint)',
          color: 'var(--fg-muted)',
        }}
      >
        // SYNCING_RANK...
      </div>
    );
  }

  const unranked = data.score === 0 || data.position === null;
  const seasonEnds = new Date(data.season.ends_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <Link
      href="/leaderboard"
      className="corners-sm block p-5 relative overflow-hidden transition-colors group"
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
      <div className="flex items-center gap-4">
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-mid)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.rank.emblem}
            alt={data.rank.name}
            style={{ width: 64, height: 64, objectFit: 'contain' }}
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
            className="text-xl font-black tracking-tight mt-0.5"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
          >
            {data.rank.name}
          </h3>
          <p
            className="mono text-[10px] mt-1 uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            {unranked ? (
              <>// UNRANKED · 0 pts · season encerra {seasonEnds}</>
            ) : (
              <>
                #{data.position} GLOBAL · {data.score.toLocaleString('pt-BR')} pts
                · encerra {seasonEnds}
              </>
            )}
          </p>
        </div>
        <Trophy
          className="w-5 h-5 shrink-0 transition-opacity opacity-40 group-hover:opacity-100"
          style={{ color: 'var(--arasaka-red)' }}
        />
      </div>
    </Link>
  );
}
