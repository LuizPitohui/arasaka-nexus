'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner'; // <--- O IMPORT QUE FALTAVA

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Inicia a notificação de carregamento
    const loadId = toast.loading('Verifying credentials...');

    try {
      const response = await fetch('http://localhost:8000/api/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      // Remove a notificação de carregamento
      toast.dismiss(loadId);

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        
        toast.success('Access Granted. Welcome, Agent.', {
          style: { borderColor: '#16a34a', color: '#fff' }
        });
        
        router.push('/');
      } else {
        setError('ACCESS DENIED: Invalid Credentials');
        toast.error('Authentication Failed.', {
            style: { borderColor: '#ef4444', color: '#fff' }
        });
      }
    } catch (err) {
      toast.dismiss(loadId);
      console.error(err); // Log do erro real para debug
      setError('SYSTEM ERROR: Connection Failed');
      toast.error('Server Unreachable', {
        style: { borderColor: '#ef4444', color: '#fff' }
      });
    }
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md border border-gray-800 bg-gray-900/50 p-8 shadow-2xl relative">
        {/* Detalhe de Design: Borda Vermelha no Topo */}
        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>

        <div className="text-center mb-10">
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white p-3 focus:border-red-600 outline-none transition-colors"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Passcode
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white p-3 focus:border-red-600 outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-900 p-3 text-red-500 text-xs font-mono text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 uppercase tracking-widest transition-all"
          >
            Authenticate
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-600 text-[10px] uppercase">
            Unauthorized access is a felony punishable by data erasure.
          </p>
        </div>
      </div>
    </main>
  );
}