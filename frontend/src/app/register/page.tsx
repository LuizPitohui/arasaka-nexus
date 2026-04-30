'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { ApiError, auth } from '@/lib/api';
import { ChevronMark } from '@/components/Brand';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const update =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const localErrors: Record<string, string> = {};
    if (form.username.trim().length < 3)
      localErrors.username = 'MIN 3 CHARS';
    if (!form.email.includes('@')) localErrors.email = 'INVALID FORMAT';
    if (form.password.length < 8) localErrors.password = 'MIN 8 CHARS';
    if (form.password !== form.confirm)
      localErrors.confirm = 'PASSCODE MISMATCH';
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    const loadId = toast.loading('// PROVISIONING CREDENTIALS...');
    try {
      await auth.register({
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      toast.dismiss(loadId);
      toast.success('// WELCOME, AGENT — ACCESS GRANTED');
      router.push('/');
    } catch (err) {
      toast.dismiss(loadId);
      if (
        err instanceof ApiError &&
        err.data &&
        typeof err.data === 'object'
      ) {
        const data = err.data as Record<string, string[] | string>;
        const mapped: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value)
            ? value.join(' ')
            : String(value);
        }
        setErrors(mapped);
        toast.error('// REGISTRATION FAILED — CHECK FIELDS');
      } else {
        toast.error('// REGISTRATION FAILED — RETRY');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 scanlines"
      style={{ background: 'var(--bg-void)' }}
    >
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
        <div
          className="absolute top-0 left-0 right-0 px-3 py-2 flex items-center justify-between mono text-[9px] uppercase tracking-widest"
          style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--arasaka-red)',
            color: 'var(--fg-muted)',
          }}
        >
          <span>// AGENT_PROVISIONING</span>
          <span style={{ color: 'var(--neon-cyan)' }}>
            ● <span className="blink">REQ</span>
          </span>
        </div>

        <div className="text-center mb-10 mt-6">
          <div className="flex justify-center mb-6">
            <ChevronMark size={56} />
          </div>
          <h1
            className="display text-[2rem]"
            style={{ color: 'var(--fg-primary)' }}
          >
            NEW <span style={{ color: 'var(--arasaka-red)' }}>AGENT</span>
          </h1>
          <p className="kicker mt-3" style={{ color: 'var(--fg-muted)' }}>
            // CLEARANCE_REQUEST_FORM
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field
            label="// AGENT_ID"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={update('username')}
            error={errors.username}
            placeholder="your-username"
            required
          />
          <Field
            label="// COMM_CHANNEL"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
            placeholder="agent@nexus.io"
            required
          />
          <Field
            label="// PASSCODE"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            placeholder="•••••••• (min. 8)"
            required
          />
          <Field
            label="// CONFIRM_PASSCODE"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={update('confirm')}
            error={errors.confirm}
            placeholder="••••••••"
            required
          />

          {errors.detail && (
            <div
              className="p-3 mono text-[11px] text-center uppercase tracking-widest"
              style={{
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--arasaka-red)',
              }}
            >
              ⚠ {errors.detail}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 mono text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              fontWeight: 700,
              boxShadow: submitting ? 'none' : 'var(--glow-red)',
            }}
          >
            {submitting ? '// PROVISIONING...' : '>> REQUEST_ACCESS'}
          </button>
        </form>

        <div
          className="mt-6 text-center mono text-[11px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          ALREADY AN AGENT?{' '}
          <Link
            href="/login"
            style={{ color: 'var(--arasaka-red)' }}
            className="hover:underline"
          >
            SIGN IN
          </Link>
        </div>
      </div>
    </main>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

function Field({ label, error, ...inputProps }: FieldProps) {
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
          border: error
            ? '1px solid var(--arasaka-red)'
            : '1px solid var(--border-mid)',
          color: 'var(--fg-primary)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.boxShadow = '0 0 0 1px var(--arasaka-red)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error
            ? 'var(--arasaka-red)'
            : 'var(--border-mid)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {error && (
        <p
          className="mt-1.5 mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--arasaka-red)' }}
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
