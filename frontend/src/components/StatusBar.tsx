'use client';

// Persistent bottom HUD. Live clock, uptime, REAL latency, net status.
// Hidden on /read/* (reader is full-bleed). Body gets bottom padding to compensate.
//
// Latencia: bate em /api/ping/ a cada 10s, mede tempo da request real.
// O endpoint backend e barato (sem DB, sem auth) e tem Cache-Control:
// no-store pra Cloudflare nao cachear (mediria latencia do edge, nao do
// origin). Status NET deriva: <300ms OK verde, <800ms slow amarelo,
// erro/timeout DOWN vermelho.

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { API_URL } from '@/lib/api';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

type NetStatus = 'OK' | 'SLOW' | 'DOWN';

const PING_INTERVAL_MS = 10_000;
const PING_TIMEOUT_MS = 8_000;
// Limites de classificacao (deriva NetStatus do RTT medido)
const LATENCY_SLOW_MS = 300;
const LATENCY_DOWN_MS = 800;

export function StatusBar() {
  const pathname = usePathname() ?? '';
  const [time, setTime] = useState('--:--:--');
  const [uptime, setUptime] = useState('00h00m');
  const [latency, setLatency] = useState<number | null>(null);
  const [net, setNet] = useState<NetStatus>('OK');
  const startRef = useRef<number>(0);

  // Clock + uptime — tick por segundo (sem network)
  useEffect(() => {
    startRef.current = Date.now();
    const tick = () => {
      const now = new Date();
      setTime(
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      );
      const ms = Date.now() - startRef.current;
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setUptime(`${pad(h)}h${pad(m)}m`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Ping real ao backend a cada PING_INTERVAL_MS
  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      const start = performance.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
        // credentials: 'include' deixa o cookie cf_clearance viajar — sem
        // ele a Cloudflare Bot Management trata como request automatizada
        // e devolve 403 + JS challenge (NET_DOWN falso). O endpoint nao
        // exige auth, mas os cookies sao necessarios pra passar pelo WAF.
        const res = await fetch(`${API_URL}/ping/`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const rtt = Math.round(performance.now() - start);
        if (cancelled) return;
        if (!res.ok) {
          setLatency(rtt);
          setNet('DOWN');
          return;
        }
        setLatency(rtt);
        setNet(
          rtt >= LATENCY_DOWN_MS
            ? 'DOWN'
            : rtt >= LATENCY_SLOW_MS
              ? 'SLOW'
              : 'OK',
        );
      } catch {
        if (cancelled) return;
        setLatency(null);
        setNet('DOWN');
      }
    };

    ping(); // measurement imediata
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (pathname.startsWith('/read/')) return null;

  const netLabel = net === 'OK' ? 'NET_OK' : net === 'SLOW' ? 'NET_SLOW' : 'NET_DOWN';
  const netColor =
    net === 'OK'
      ? 'var(--neon-green)'
      : net === 'SLOW'
        ? 'var(--neon-yellow)'
        : 'var(--arasaka-red)';

  const latencyDisplay = latency === null ? '—' : `${latency}ms`;
  const latencyColor =
    latency === null
      ? 'var(--fg-muted)'
      : net === 'OK'
        ? 'var(--fg-secondary)'
        : netColor;

  return (
    <div className="status-bar mono" role="contentinfo" aria-label="Status">
      <div className="status-bar-inner">
        <div className="status-bar-left">
          <span className="status-cluster">
            <span
              className="status-dot"
              style={{ background: netColor, boxShadow: `0 0 6px ${netColor}` }}
              aria-hidden
            />
            <span style={{ color: netColor }}>{netLabel}</span>
          </span>
          <span className="status-sep" aria-hidden>
            ·
          </span>
          <span>SUBNET 17.A</span>
          <span className="status-sep status-hide-sm" aria-hidden>
            ·
          </span>
          <span className="status-hide-sm">
            LATENCY{' '}
            <span className="tabular-nums" style={{ color: latencyColor }}>
              {latencyDisplay}
            </span>
          </span>
        </div>

        <div className="status-bar-right">
          <span className="status-hide-md">
            UPTIME <span className="tabular-nums">{uptime}</span>
          </span>
          <span className="status-sep status-hide-md" aria-hidden>
            ·
          </span>
          <span style={{ color: 'var(--arasaka-red)' }}>
            SYS_TIME <span className="tabular-nums">{time}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default StatusBar;
