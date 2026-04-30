'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';

type Line = { delay: number; text: string; tone: 'red' | 'green' | 'muted' };

const LINES: Line[] = [
  { delay: 0,    text: '> rolling dice...',                tone: 'muted' },
  { delay: 220,  text: '> engaging neurolink...',          tone: 'muted' },
  { delay: 440,  text: '> querying void...',               tone: 'muted' },
  { delay: 660,  text: '> shard 0xb33f acquired',          tone: 'green' },
  { delay: 900,  text: '> redirecting to /manga/...',      tone: 'red' },
];

export default function RandomPage() {
  const router = useRouter();
  const [shown, setShown] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setShown(i + 1), line.delay));
    });

    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(100, ((t - start) / 1100) * 100);
      setProgress(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    api
      .get<{ id: number }>('/mangas/random/', { auth: false })
      .then((manga) => {
        // ensure the user sees the boot sequence
        setTimeout(() => router.replace(`/manga/${manga.id}`), 1100);
      })
      .catch(() => {
        setTimeout(() => router.replace('/'), 1100);
      });

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, [router]);

  const colorFor = (tone: Line['tone']) =>
    tone === 'red'
      ? 'var(--arasaka-red)'
      : tone === 'green'
        ? 'var(--neon-green)'
        : 'var(--fg-secondary)';

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8 relative scanlines"
      style={{ background: 'var(--bg-void)', color: 'var(--fg-primary)' }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(220,38,38,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-xl flex flex-col items-center gap-10">
        <h1
          className="text-6xl md:text-7xl font-black leading-none tracking-tight glitch"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.04em',
          }}
        >
          ROLLING <span style={{ color: 'var(--arasaka-red)' }}>DICE</span>
        </h1>

        <div
          className="w-full mono text-xs leading-loose"
          style={{ fontFamily: 'var(--font-mono)' }}
          aria-live="polite"
        >
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

        <div
          className="w-full h-[3px] relative overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
          aria-hidden
        >
          <div
            className="absolute top-0 left-0 h-full"
            style={{
              width: `${progress}%`,
              background: 'var(--arasaka-red)',
              boxShadow: 'var(--glow-red)',
              transition: 'width 100ms linear',
            }}
          />
        </div>
      </div>
    </main>
  );
}
