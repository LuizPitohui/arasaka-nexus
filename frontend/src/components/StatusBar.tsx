'use client';

// Persistent bottom HUD. Live clock, uptime, latency, net status.
// Hidden on /read/* (reader is full-bleed). Body gets bottom padding to compensate.

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function StatusBar() {
  const pathname = usePathname() ?? '';
  const [time, setTime] = useState('--:--:--');
  const [uptime, setUptime] = useState('00h00m');
  const [latency, setLatency] = useState(24);
  const [net, setNet] = useState<'OK' | 'DEGRADED'>('OK');

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const now = new Date();
      setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
      const ms = Date.now() - start;
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setUptime(`${pad(h)}h${pad(m)}m`);
      // simulated latency drift; very rare DEGRADED blip
      const drift = 18 + Math.floor(Math.random() * 14);
      setLatency(drift);
      setNet(Math.random() < 0.005 ? 'DEGRADED' : 'OK');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (pathname.startsWith('/read/')) return null;

  const netColor = net === 'OK' ? 'var(--neon-green)' : 'var(--neon-yellow)';

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
            <span style={{ color: netColor }}>NET_{net}</span>
          </span>
          <span className="status-sep" aria-hidden>·</span>
          <span>SUBNET 17.A</span>
          <span className="status-sep status-hide-sm" aria-hidden>·</span>
          <span className="status-hide-sm">
            LATENCY{' '}
            <span className="tabular-nums" style={{ color: 'var(--fg-secondary)' }}>
              {latency}ms
            </span>
          </span>
        </div>

        <div className="status-bar-right">
          <span className="status-hide-md">
            UPTIME <span className="tabular-nums">{uptime}</span>
          </span>
          <span className="status-sep status-hide-md" aria-hidden>·</span>
          <span style={{ color: 'var(--arasaka-red)' }}>
            SYS_TIME <span className="tabular-nums">{time}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default StatusBar;
