'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { auth, ApiError } from '@/lib/api';
import { ChevronMark } from '@/components/Brand';

const BOOT_LINES = [
  '> initiating handshake...',
  '> kiroshi optics: ONLINE',
  '> neural link: STABLE',
  '> nexus shard 0x7a4f: ACQUIRED',
  '> awaiting credentials_',
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bootShown, setBootShown] = useState(0);
  const [stage, setStage] = useState<'boot' | 'form'>('boot');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setBootShown(i + 1), 220 + i * 240));
    });
    timers.push(setTimeout(() => setStage('form'), 1700));
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const loadId = toast.loading('// VERIFYING CREDENTIALS...');

    try {
      await auth.login(username, password);
      toast.dismiss(loadId);
      toast.success('// ACCESS GRANTED — WELCOME, AGENT.', {
        style: { borderColor: 'var(--neon-green)', color: '#fff' },
      });
      router.push('/');
    } catch (err) {
      toast.dismiss(loadId);
      if (err instanceof ApiError && err.status === 401) {
        setError('ACCESS DENIED — INVALID CREDENTIALS');
      } else if (err instanceof ApiError) {
        setError(`SYSTEM ERROR — CODE ${err.status}`);
      } else {
        setError('SYSTEM ERROR — CONNECTION FAILED');
      }
      toast.error('// AUTHENTICATION FAILED.', {
        style: { borderColor: 'var(--arasaka-red)', color: '#fff' },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 scanlines"
      style={{ background: 'var(--bg-void)' }}
    >
      {/* hex grid wash */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 25%, var(--arasaka-red) 1px, transparent 1px), radial-gradient(circle at 75% 75%, var(--neon-cyan) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div
        className="w-full max-w-md p-10 relative bracket"
        style={{
          background: 'var(--bg-terminal)',
          border: '1px solid var(--border-faint)',
          boxShadow: '0 0 80px rgba(220,38,38,0.08)',
        }}
      >
        {/* status header bar */}
        <div
          className="absolute top-0 left-0 right-0 px-3 py-2 flex items-center justify-between mono text-[9px] uppercase tracking-widest"
          style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--arasaka-red)',
            color: 'var(--fg-muted)',
          }}
        >
          <span>// SECURE_TERMINAL</span>
          <span style={{ color: 'var(--arasaka-red)' }}>
            ● <span className="blink">CONN</span>
          </span>
        </div>

        <div className="text-center mb-10 mt-6">
          <div className="flex justify-center mb-6">
            <ChevronMark size={64} />
          </div>
          <h1
            className="display text-[2.5rem]"
            style={{ color: 'var(--fg-primary)' }}
          >
            ARASAKA <span style={{ color: 'var(--arasaka-red)' }}>NEXUS</span>
          </h1>
          <p className="kicker mt-3" style={{ color: 'var(--fg-muted)' }}>
            // SECURE_ACCESS_TERMINAL
          </p>
        </div>

        {stage === 'boot' && (
          <pre
            className="mono leading-loose"
            style={{
              fontSize: 11,
              color: 'var(--neon-green)',
              minHeight: 220,
              margin: 0,
            }}
            aria-live="polite"
          >
            {BOOT_LINES.slice(0, bootShown).map((line, i) => (
              <div
                key={i}
                className="boot-line"
                style={{
                  color: i === BOOT_LINES.length - 1 ? 'var(--neon-green)' : 'var(--neon-green)',
                  opacity: i < bootShown - 1 ? 0.7 : 1,
                }}
              >
                {line}
              </div>
            ))}
            {bootShown < BOOT_LINES.length && (
              <span className="blink" style={{ color: 'var(--neon-green)' }}>█</span>
            )}
          </pre>
        )}

        {stage === 'form' && (
        <form onSubmit={handleLogin} className="space-y-6 boot-line">
          <Field
            label="// AGENT_ID"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="enter your username"
            required
          />
          <Field
            label="// PASSCODE"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && (
            <div
              className="p-3 mono text-[11px] text-center uppercase tracking-widest"
              style={{
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--arasaka-red)',
              }}
            >
              [!!] {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 mono text-xs uppercase tracking-[0.3em] transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              fontWeight: 700,
              boxShadow: submitting ? 'none' : 'var(--glow-red)',
            }}
            onMouseEnter={(e) => {
              if (!submitting)
                e.currentTarget.style.background = 'var(--arasaka-red-hover)';
            }}
            onMouseLeave={(e) => {
              if (!submitting)
                e.currentTarget.style.background = 'var(--arasaka-red)';
            }}
          >
            {submitting ? '// AUTHENTICATING...' : '▸ AUTHENTICATE'}
          </button>
        </form>
        )}

        <div
          className="mt-6 text-center mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          NO CREDENTIALS?{' '}
          <Link
            href="/register"
            style={{ color: 'var(--arasaka-red)' }}
            className="hover:underline"
          >
            REQUEST ACCESS
          </Link>
        </div>

        <div
          className="mt-6 pt-4 text-center mono text-[9px] uppercase tracking-widest"
          style={{
            color: 'var(--fg-faint)',
            borderTop: '1px solid var(--border-faint)',
          }}
        >
          // UNAUTHORIZED ACCESS IS A FELONY PUNISHABLE BY DATA ERASURE //
        </div>
      </div>
    </main>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

function Field({ label, ...inputProps }: FieldProps) {
  return (
    <div>
      <label
        className="block kicker mb-2"
        style={{ color: 'var(--fg-muted)' }}
      >
        {label}
      </label>
      <input
        {...inputProps}
        className="w-full p-3 mono text-sm outline-none transition-colors"
        style={{
          background: 'var(--bg-void)',
          border: '1px solid var(--border-mid)',
          color: 'var(--fg-primary)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.boxShadow = '0 0 0 1px var(--arasaka-red), var(--glow-red)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-mid)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
