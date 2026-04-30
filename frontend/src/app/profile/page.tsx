'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';

type Profile = {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string;
  preferred_language: string;
  reader_mode: 'vertical' | 'paged' | 'webtoon' | 'double';
  created_at: string;
  updated_at: string;
};

const READER_MODES: { value: Profile['reader_mode']; label: string; hint: string }[] = [
  { value: 'vertical', label: 'Vertical contínuo', hint: 'Padrão — rola tudo de uma vez' },
  { value: 'paged', label: 'Paginado', hint: 'Uma página por vez (← →)' },
  { value: 'webtoon', label: 'Webtoon', hint: 'Otimizado para tiras verticais' },
  { value: 'double', label: 'Página dupla', hint: 'Duas páginas lado a lado' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      router.replace('/login?next=/profile');
      return;
    }
    api
      .get<Profile>('/accounts/profile/')
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login?next=/profile');
        } else {
          toast.error('Falha ao carregar perfil.');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.patch<Profile>('/accounts/profile/', {
        bio: profile.bio,
        preferred_language: profile.preferred_language,
        reader_mode: profile.reader_mode,
      });
      setProfile(updated);
      toast.success('Perfil atualizado.');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-red-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <header className="mb-8 border-b border-zinc-900 pb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Agent Profile</p>
          <h1 className="text-3xl font-black tracking-tighter mt-2">
            {profile.username}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{profile.email}</p>
        </header>

        <form onSubmit={handleSave} className="space-y-8">
          <Section title="Bio">
            <textarea
              value={profile.bio}
              onChange={(e) => update('bio', e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-sm focus:outline-none focus:border-red-600 resize-none"
              placeholder="Descreva seu Agente em poucas palavras..."
            />
            <p className="text-[11px] text-zinc-600 mt-1">{profile.bio.length} / 500</p>
          </Section>

          <Section title="Idioma preferido">
            <div className="flex gap-2">
              {[
                { value: 'pt-br', label: 'Português' },
                { value: 'en', label: 'English' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('preferred_language', opt.value)}
                  className={`px-4 py-2 text-xs uppercase tracking-widest border transition-all ${
                    profile.preferred_language === opt.value
                      ? 'border-red-600 bg-red-950/30 text-red-500'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Modo de leitura padrão">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {READER_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => update('reader_mode', mode.value)}
                  className={`text-left p-4 border transition-all ${
                    profile.reader_mode === mode.value
                      ? 'border-red-600 bg-red-950/20'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-bold text-white mb-1">{mode.label}</div>
                  <div className="text-[11px] text-zinc-500">{mode.hint}</div>
                </button>
              ))}
            </div>
          </Section>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
