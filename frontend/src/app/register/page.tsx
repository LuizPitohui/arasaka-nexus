'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { ApiError, auth } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const localErrors: Record<string, string> = {};
    if (form.username.trim().length < 3)
      localErrors.username = 'Mínimo de 3 caracteres.';
    if (!form.email.includes('@')) localErrors.email = 'Email inválido.';
    if (form.password.length < 8) localErrors.password = 'Mínimo de 8 caracteres.';
    if (form.password !== form.confirm) localErrors.confirm = 'As senhas não coincidem.';
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    const loadId = toast.loading('Provisioning credentials...');
    try {
      await auth.register({
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      toast.dismiss(loadId);
      toast.success('Bem-vindo, Agente. Acesso concedido.');
      router.push('/');
    } catch (err) {
      toast.dismiss(loadId);
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, string[] | string>;
        const mapped: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setErrors(mapped);
        toast.error('Falha no cadastro. Verifique os campos.');
      } else {
        toast.error('Falha no cadastro. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md border border-gray-800 bg-gray-900/50 p-8 shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />

        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white tracking-tighter">
            ARASAKA <span className="text-red-600">NEXUS</span>
          </h1>
          <p className="text-gray-500 text-xs uppercase tracking-[0.3em] mt-2">
            New Agent Registration
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field
            label="Agent ID"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={update('username')}
            error={errors.username}
            placeholder="seu-username"
            required
          />
          <Field
            label="Comm Channel"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
            placeholder="agente@nexus.io"
            required
          />
          <Field
            label="Passcode"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            placeholder="•••••••• (mín. 8)"
            required
          />
          <Field
            label="Confirm Passcode"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={update('confirm')}
            error={errors.confirm}
            placeholder="••••••••"
            required
          />

          {errors.detail && (
            <div className="bg-red-900/20 border border-red-900 p-3 text-red-500 text-xs font-mono text-center">
              ⚠️ {errors.detail}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 uppercase tracking-widest transition-all"
          >
            {submitting ? 'Provisioning...' : 'Request Access'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Já é um Agente?{' '}
          <Link href="/login" className="text-red-500 hover:text-red-400 underline">
            Entrar
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
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
        {label}
      </label>
      <input
        {...inputProps}
        className="w-full bg-black border border-gray-700 text-white p-3 focus:border-red-600 outline-none transition-colors"
      />
      {error && <p className="mt-1 text-[11px] text-red-500 font-mono">⚠ {error}</p>}
    </div>
  );
}
