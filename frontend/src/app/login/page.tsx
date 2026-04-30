'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { auth, ApiError } from '@/lib/api';
import { ChevronMark } from '@/components/Brand';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const loadId = toast.loading('Verifying credentials...');

    try {
      await auth.login(username, password);
      toast.dismiss(loadId);
      toast.success('Access Granted. Welcome, Agent.', {
        style: { borderColor: '#16a34a', color: '#fff' },
      });
      router.push('/');
    } catch (err) {
      toast.dismiss(loadId);
      if (err instanceof ApiError && err.status === 401) {
        setError('ACCESS DENIED: Invalid Credentials');
      } else if (err instanceof ApiError) {
        setError(`SYSTEM ERROR (${err.status})`);
      } else {
        setError('SYSTEM ERROR: Connection Failed');
      }
      toast.error('Authentication Failed.', {
        style: { borderColor: '#ef4444', color: '#fff' },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md border border-gray-800 bg-gray-900/50 p-8 shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>

        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <ChevronMark size={56} />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tighter">
            ARASAKA <span className="text-red-600">NEXUS</span>
          </h1>
          <p className="text-gray-500 text-xs uppercase tracking-[0.3em] mt-2">
            Secure Access Terminal
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Agent ID
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white p-3 focus:border-red-600 outline-none transition-colors"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Passcode
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white p-3 focus:border-red-600 outline-none transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-900 p-3 text-red-500 text-xs font-mono text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 uppercase tracking-widest transition-all"
          >
            {submitting ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Sem credenciais?{' '}
          <Link href="/register" className="text-red-500 hover:text-red-400 underline">
            Solicitar acesso
          </Link>
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-[10px] uppercase">
            Unauthorized access is a felony punishable by data erasure.
          </p>
        </div>
      </div>
    </main>
  );
}
