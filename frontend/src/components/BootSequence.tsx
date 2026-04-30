'use client';

// First-load terminal boot. Mounts once per session (sessionStorage flag).
// Renders nothing on subsequent navigations — Next route changes don't retrigger it.

import { useEffect, useState } from 'react';

type Line = { delay: number; text: string; tone: 'red' | 'green' | 'muted' | 'fg' };

const LINES: Line[] = [
  { delay: 0,    text: '> ARASAKA NEXUS v2.4.1 // KIROSHI_OS',     tone: 'red' },
  { delay: 90,   text: '> COPYRIGHT (C) 2099 ARASAKA CORP.',        tone: 'muted' },
  { delay: 180,  text: '> INITIALIZING SUBNET BRIDGE 17.A ........', tone: 'muted' },
  { delay: 290,  text: '> AUTH_HANDSHAKE ............... [OK]',      tone: 'green' },
  { delay: 380,  text: '> CACHE_DECRYPT ................ [OK]',      tone: 'green' },
  { delay: 470,  text: '> MOUNTING /vault ............... [OK]',     tone: 'green' },
  { delay: 560,  text: '> RENDERING_GRID ................',           tone: 'muted' },
  { delay: 720,  text: '> READY.',                                    tone: 'red' },
];

const DISMISS_AT = 1100;
const SESSION_KEY = 'arasaka-nexus-booted';

export function BootSequence() {
  const [shown, setShown] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) {
      setDone(true);
      return;
    }
    setDone(false);

    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setShown(i + 1), line.delay));
    });
    timers.push(setTimeout(() => setExiting(true), DISMISS_AT));
    timers.push(
      setTimeout(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch {}
        setDone(true);
      }, DISMISS_AT + 320)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  if (done !== false) return null;

  const colorFor = (tone: Line['tone']) =>
    tone === 'red'
      ? 'var(--arasaka-red)'
      : tone === 'green'
        ? 'var(--neon-green)'
        : tone === 'fg'
          ? 'var(--fg-primary)'
          : 'var(--fg-secondary)';

  return (
    <div
      className="boot-overlay scanlines"
      style={{ opacity: exiting ? 0 : 1 }}
      aria-hidden
    >
      {/* Subtle hex backdrop */}
      <div className="boot-grid" aria-hidden />

      <div className="boot-terminal mono">
        {/* CRT bracket frame */}
        <div className="boot-bracket boot-bracket-tl" />
        <div className="boot-bracket boot-bracket-tr" />
        <div className="boot-bracket boot-bracket-bl" />
        <div className="boot-bracket boot-bracket-br" />

        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: 'var(--arasaka-red)',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>// SYSTEM_BOOT</span>
          <span style={{ color: 'var(--fg-muted)' }}>NODE 17.A</span>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          {LINES.slice(0, shown).map((line, i) => (
            <div
              key={i}
              className="boot-line"
              style={{ color: colorFor(line.tone) }}
            >
              {line.text}
            </div>
          ))}
          {shown < LINES.length && (
            <span className="blink" style={{ color: 'var(--arasaka-red)' }}>▌</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default BootSequence;
