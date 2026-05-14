'use client';

import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Info,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';

import type { RankPayload } from '@/lib/ranking';

/**
 * Seção "// PROTOCOLO" que ensina o sistema:
 *   - Como pontos são ganhos (capitulos, obras completas, tempo)
 *   - Como tiers funcionam (percentil global)
 *   - Como seasons funcionam (3 meses, peak rank, recompute)
 *
 * Default expandida na primeira visita, collapsavel.
 */
export default function RankingRules({ tiers }: { tiers: RankPayload[] }) {
  const [open, setOpen] = useState(true);

  // Backend devolve do mais alto pro mais baixo; UI mostra topo→base
  const orderedTiers = [...tiers].sort((a, b) => b.tier - a.tier);

  return (
    <div
      className="corners-sm relative overflow-hidden"
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
            'linear-gradient(90deg, var(--neon-cyan) 0%, var(--neon-cyan) 30%, transparent 100%)',
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 md:p-5 group"
        style={{ color: 'var(--fg-primary)' }}
      >
        <div className="flex items-center gap-3">
          <Info className="w-4 h-4" style={{ color: 'var(--neon-cyan)' }} />
          <span
            className="mono text-[11px] uppercase tracking-[0.25em] font-bold"
            style={{ color: 'var(--fg-secondary)' }}
          >
            COMO FUNCIONA O RANKING
          </span>
        </div>
        <span
          className="mono text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors group-hover:text-[var(--neon-cyan)]"
          style={{ color: 'var(--fg-muted)' }}
        >
          {open ? 'OCULTAR' : 'EXPANDIR'}
          {open ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </span>
      </button>

      {open && (
        <div className="p-5 md:p-6 pt-0 space-y-6 rank-row-in">
          {/* PONTUACAO */}
          <Block
            label="01"
            title="PONTUACAO"
            kicker="// Como agentes ganham pontos"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <PointCard
                icon={<BookOpen className="w-4 h-4" />}
                value="5"
                unit="PTS"
                title="POR CAPITULO"
                desc="So leitura real pelo reader. Voce precisa ficar ao menos 30 segundos no capitulo. Marcar 'lido em lote' na lista do manga NAO concede pontos — e ajuste de estado, nao recompensa."
              />
              <PointCard
                icon={<Flame className="w-4 h-4" />}
                value="3"
                unit="× CAPS"
                title="OBRA COMPLETA"
                desc="Bonus ao concluir TODOS os capitulos atuais de uma obra. Escala com tamanho — terminar uma obra de 200 capitulos rende +600 pts. Pago uma vez por obra na season."
              />
              <PointCard
                icon={<Clock className="w-4 h-4" />}
                value="1"
                unit="/ 5 MIN"
                title="TEMPO ATIVO"
                desc="Por cada bloco de 5 min lendo um capitulo. Capeado em 30 min por capitulo pra evitar abas esquecidas. Calculado pela duracao entre abrir o capitulo e marcar como lido."
              />
            </div>
            <p
              className="mono text-[10px] mt-3 uppercase tracking-widest"
              style={{ color: 'var(--fg-muted)' }}
            >
              // Pontos sao idempotentes — re-marcar um capitulo nao gera pontos
              extras. Folhear catalogo, favoritar, criar listas: zero pontos.
              Aqui se sobe lendo.
            </p>
          </Block>

          {/* HIERARQUIA */}
          <Block
            label="02"
            title="HIERARQUIA"
            kicker="// Cada tier exige uma pontuacao minima absoluta"
          >
            <p
              className="mono text-[11px] mb-4"
              style={{ color: 'var(--fg-secondary)' }}
            >
              Voce sobe acumulando pontos, independente de quantos agentes
              estao competindo. A POSICAO no leaderboard ainda e disputada —
              dentro do mesmo tier, quem leu mais lidera.
            </p>
            <div
              className="corners-sm overflow-hidden"
              style={{ border: '1px solid var(--border-faint)' }}
            >
              {orderedTiers.map((tier, i) => (
                <div
                  key={tier.slug}
                  className="flex items-center gap-3 p-2.5 md:p-3"
                  style={{
                    background:
                      i % 2 === 0 ? 'var(--bg-base)' : 'rgba(0,0,0,0.25)',
                    borderTop:
                      i === 0 ? 'none' : '1px solid var(--border-faint)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tier.emblem}
                    alt={tier.name}
                    style={{ width: 34, height: 34, objectFit: 'contain' }}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-bold"
                      style={{ color: 'var(--fg-primary)' }}
                    >
                      {tier.name}
                    </p>
                    <p
                      className="mono text-[9px] uppercase tracking-widest"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      TIER {tier.tier}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="mono text-xs font-bold"
                      style={{ color: 'var(--arasaka-red)' }}
                    >
                      {tier.min_score === 0
                        ? 'INICIO'
                        : `${tier.min_score.toLocaleString('pt-BR')}+ PTS`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p
              className="mono text-[10px] mt-3 uppercase tracking-widest"
              style={{ color: 'var(--fg-muted)' }}
            >
              // Saburo's Hand exige 200.000 pts — sao dezenas de milhares de
              capitulos lidos com tempo real de leitura. Quase ninguem deveria
              chegar la. Director (75k) ja e dedicacao extrema.
            </p>
          </Block>

          {/* SEASON */}
          <Block
            label="03"
            title="SEASON"
            kicker="// Janelas competitivas de 3 meses"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RuleCard
                icon={<RotateCcw className="w-4 h-4" />}
                title="DURACAO"
                desc="Cada season dura 90 dias (trimestral). Ao encerrar, o score zera e uma nova season comeca automaticamente — todo mundo recomeca do Sewer Rat."
              />
              <RuleCard
                icon={<TrendingUp className="w-4 h-4" />}
                title="PEAK RANK"
                desc="O tier mais alto que voce alcancou na season fica registrado mesmo se voce cair depois. Aparece no HUD como PICO em amarelo."
              />
            </div>
            <p
              className="mono text-[10px] mt-3 uppercase tracking-widest"
              style={{ color: 'var(--fg-muted)' }}
            >
              // O ranking global e recalculado uma vez por dia, as 04:00 BRT.
              Pontos contam na hora; promocao/rebaixamento de tier so reflete
              no proximo recompute.
            </p>
          </Block>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Block({
  label,
  title,
  kicker,
  children,
}: {
  label: string;
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span
          className="mono text-[10px] uppercase tracking-widest px-1.5 py-0.5"
          style={{
            color: 'var(--neon-cyan)',
            border: '1px solid var(--neon-cyan)',
          }}
        >
          {label}
        </span>
        <h3
          className="text-sm font-bold tracking-wider"
          style={{ color: 'var(--fg-primary)' }}
        >
          {title}
        </h3>
        <p
          className="mono text-[10px] uppercase tracking-widest ml-auto truncate"
          style={{ color: 'var(--fg-muted)' }}
        >
          {kicker}
        </p>
      </div>
      {children}
    </section>
  );
}

function PointCard({
  icon,
  value,
  unit,
  title,
  desc,
}: {
  icon: React.ReactNode;
  value: string;
  unit: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="corners-sm p-4 relative"
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <div className="flex items-baseline gap-2">
        <span style={{ color: 'var(--arasaka-red)' }}>{icon}</span>
        <span
          className="mono text-3xl font-black leading-none"
          style={{
            color: 'var(--fg-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {value}
        </span>
        <span
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--arasaka-red)' }}
        >
          {unit}
        </span>
      </div>
      <p
        className="mono text-[10px] uppercase tracking-widest mt-2 font-bold"
        style={{ color: 'var(--fg-primary)' }}
      >
        {title}
      </p>
      <p
        className="text-xs mt-1.5 leading-relaxed"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {desc}
      </p>
    </div>
  );
}

function RuleCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="corners-sm p-4"
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--neon-cyan)' }}>{icon}</span>
        <p
          className="mono text-[10px] uppercase tracking-widest font-bold"
          style={{ color: 'var(--fg-primary)' }}
        >
          {title}
        </p>
      </div>
      <p
        className="text-xs mt-2 leading-relaxed"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {desc}
      </p>
    </div>
  );
}
