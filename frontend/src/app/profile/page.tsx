'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calendar, Lock, Save, Shield, ShieldAlert } from 'lucide-react';

import Loader from '@/components/Loader';
import { PushOptIn } from '@/components/PushOptIn';

import { ApiError, api, tokenStore } from '@/lib/api';

type Profile = {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string;
  preferred_language: string;
  reader_mode: 'vertical' | 'paged' | 'webtoon' | 'double';
  birthdate: string | null;
  birthdate_locked: boolean;
  age: number | null;
  is_adult: boolean;
  show_adult: boolean;
  digest_mode: 'immediate' | 'daily';
  digest_hour: number;
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
      const payload: Record<string, unknown> = {
        bio: profile.bio,
        preferred_language: profile.preferred_language,
        reader_mode: profile.reader_mode,
        show_adult: profile.show_adult,
        digest_mode: profile.digest_mode,
        digest_hour: profile.digest_hour,
      };
      // Only send birthdate if not yet locked (set-once); otherwise the backend
      // would 400. Empty string means user didn't fill it.
      if (!profile.birthdate_locked && profile.birthdate) {
        payload.birthdate = profile.birthdate;
      }
      const updated = await api.patch<Profile>('/accounts/profile/', payload);
      setProfile(updated);
      toast.success('Perfil atualizado.');
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, string[] | string>;
        const first = Object.values(data)[0];
        const msg = Array.isArray(first) ? first.join(' ') : String(first);
        toast.error(msg || 'Falha ao salvar.');
      } else {
        toast.error('Falha ao salvar.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="AUTHENTICATING" caption="// VERIFYING_CREDENTIALS" />
      </div>
    );
  }

  if (!profile) return null;

  const memberSince = new Date(profile.created_at).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'short',
  });
  const agentId = String(profile.id).padStart(6, '0');

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}>
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        {/* Kicker */}
        <p
          className="mono text-[11px] uppercase tracking-[0.3em] mb-3"
          style={{ color: 'var(--fg-muted)' }}
        >
          // AGENT_DOSSIER
        </p>

        {/* Identity card */}
        <header
          className="corners-sm mb-10 p-6 md:p-8 relative overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
        >
          {/* red rail */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background:
                'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 30%, transparent 100%)',
            }}
          />
          <div className="flex items-start gap-5">
            <div
              className="corners-sm flex items-center justify-center shrink-0"
              style={{
                width: 72,
                height: 72,
                background: 'var(--bg-base)',
                border: '1px solid var(--border-mid)',
              }}
            >
              <Shield className="w-7 h-7" style={{ color: 'var(--arasaka-red)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="mono text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--arasaka-red)' }}
              >
                ID_{agentId}
              </p>
              <h1
                className="glitch-2 text-3xl md:text-4xl font-black tracking-tight mt-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {profile.username}
              </h1>
              <p
                className="mono text-[11px] mt-2 uppercase tracking-widest"
                style={{ color: 'var(--fg-secondary)' }}
              >
                {profile.email}
              </p>
              <p
                className="mono text-[10px] mt-1 uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                ENROLLED · {memberSince}
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSave} className="space-y-10">
          <Section label="01" title="Bio">
            <textarea
              value={profile.bio}
              onChange={(e) => update('bio', e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full p-3 text-sm focus:outline-none resize-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--fg-primary)',
                fontFamily: 'var(--font-body)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--arasaka-red)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
              placeholder="Descreva seu Agente em poucas palavras..."
            />
            <p
              className="mono text-[10px] mt-1 uppercase tracking-widest text-right"
              style={{ color: 'var(--fg-muted)' }}
            >
              {profile.bio.length} / 500
            </p>
          </Section>

          <Section label="02" title="Idioma preferido">
            <div className="flex gap-2">
              {[
                { value: 'pt-br', label: 'Português' },
                { value: 'en', label: 'English' },
              ].map((opt) => {
                const active = profile.preferred_language === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('preferred_language', opt.value)}
                    className="mono text-[11px] uppercase tracking-widest px-4 py-2 transition-colors"
                    style={{
                      border: '1px solid',
                      borderColor: active ? 'var(--arasaka-red)' : 'var(--border-mid)',
                      background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
                      color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="03" title="Modo de leitura padrão">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {READER_MODES.map((mode) => {
                const active = profile.reader_mode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => update('reader_mode', mode.value)}
                    className="text-left p-4 transition-colors corners-sm"
                    style={{
                      border: '1px solid',
                      borderColor: active ? 'var(--arasaka-red)' : 'var(--border-mid)',
                      background: active ? 'rgba(220,38,38,0.06)' : 'var(--bg-elevated)',
                    }}
                  >
                    <div
                      className="text-sm font-bold mb-1"
                      style={{
                        color: active ? 'var(--arasaka-red)' : 'var(--fg-primary)',
                      }}
                    >
                      {mode.label}
                    </div>
                    <div
                      className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      {mode.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="04" title="Idade & Conteúdo Adulto">
            <div className="space-y-4">
              <div>
                <label
                  className="mono text-[10px] uppercase tracking-widest block mb-2"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  // DATA_NASCIMENTO
                </label>
                <div className="flex items-center gap-2">
                  <Calendar
                    className="w-4 h-4"
                    style={{ color: 'var(--fg-muted)' }}
                  />
                  <input
                    type="date"
                    value={profile.birthdate ?? ''}
                    disabled={profile.birthdate_locked}
                    onChange={(e) => update('birthdate', e.target.value)}
                    className="p-2 mono text-sm focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-mid)',
                      color: 'var(--fg-primary)',
                      colorScheme: 'dark',
                    }}
                  />
                  {profile.birthdate_locked && (
                    <span
                      className="mono text-[10px] uppercase tracking-widest flex items-center gap-1"
                      style={{ color: 'var(--arasaka-red)' }}
                    >
                      <Lock className="w-3 h-3" /> TRAVADO
                    </span>
                  )}
                  {profile.age !== null && (
                    <span
                      className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      · {profile.age} anos
                    </span>
                  )}
                </div>
                <p
                  className="mt-2 mono text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {profile.birthdate_locked
                    ? '// Já registrada. Para correção, contate o administrador.'
                    : '// Atenção: definida uma única vez e não poderá ser alterada.'}
                </p>
              </div>

              <div
                className="p-4 corners-sm"
                style={{
                  background: profile.show_adult
                    ? 'rgba(220,38,38,0.06)'
                    : 'var(--bg-elevated)',
                  border: '1px solid',
                  borderColor: profile.show_adult
                    ? 'var(--arasaka-red)'
                    : 'var(--border-mid)',
                }}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.show_adult}
                    disabled={!profile.is_adult}
                    onChange={(e) => update('show_adult', e.target.checked)}
                    className="mt-1 accent-[var(--arasaka-red)] disabled:opacity-50"
                  />
                  <span className="flex-1">
                    <span
                      className="mono text-[11px] uppercase tracking-widest font-bold flex items-center gap-2"
                      style={{
                        color: profile.is_adult
                          ? 'var(--arasaka-red)'
                          : 'var(--fg-muted)',
                      }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Exibir conteúdo adulto (18+)
                    </span>
                    <span
                      className="block mono text-[10px] uppercase tracking-widest mt-1"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      {profile.is_adult
                        ? 'Inclui títulos com classificação erótica/pornográfica nas listagens.'
                        : 'Disponível somente para contas com idade verificada (18+).'}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </Section>

          <Section label="05" title="Frequência de notificações">
            <p
              className="mono text-[11px] mb-4"
              style={{ color: 'var(--fg-muted)' }}
            >
              Como você prefere receber push de capítulos novos dos seus
              favoritos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(
                [
                  {
                    value: 'immediate',
                    label: 'Imediata',
                    hint: '1 push por capítulo, na hora que chega.',
                  },
                  {
                    value: 'daily',
                    label: 'Resumo diário',
                    hint: '1 push por dia agrupando tudo.',
                  },
                ] as const
              ).map((opt) => {
                const active = profile.digest_mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('digest_mode', opt.value)}
                    className="text-left p-4 transition-colors corners-sm"
                    style={{
                      border: '1px solid',
                      borderColor: active
                        ? 'var(--arasaka-red)'
                        : 'var(--border-mid)',
                      background: active
                        ? 'rgba(220,38,38,0.06)'
                        : 'var(--bg-elevated)',
                    }}
                  >
                    <div
                      className="text-sm font-bold mb-1"
                      style={{
                        color: active ? 'var(--arasaka-red)' : 'var(--fg-primary)',
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: 'var(--fg-muted)' }}
                    >
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>

            {profile.digest_mode === 'daily' && (
              <div className="mt-5">
                <label
                  htmlFor="digest_hour"
                  className="mono text-[10px] uppercase tracking-widest block mb-2"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  // HORARIO_DO_RESUMO (hora local)
                </label>
                <select
                  id="digest_hour"
                  value={profile.digest_hour}
                  onChange={(e) =>
                    update('digest_hour', Number(e.target.value))
                  }
                  className="p-2 mono text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-mid)',
                    color: 'var(--fg-primary)',
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <p
                  className="mono text-[10px] mt-2"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  Sem capítulos novos = nenhum push (não enviamos resumo
                  vazio).
                </p>
              </div>
            )}
          </Section>

          <button
            type="submit"
            disabled={saving}
            className="mono flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = 'var(--arasaka-red-bright)';
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--arasaka-red)')}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>

        <PushOptIn />
      </div>
    </main>
  );
}

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span
          className="mono text-[10px] uppercase tracking-widest px-1.5 py-0.5"
          style={{
            color: 'var(--arasaka-red)',
            border: '1px solid var(--arasaka-red)',
          }}
        >
          {label}
        </span>
        <h2
          className="text-[11px] uppercase tracking-[0.25em] font-bold mono"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {title}
        </h2>
        <div
          className="flex-1 h-px"
          style={{ background: 'var(--border-faint)' }}
        />
      </div>
      {children}
    </section>
  );
}
