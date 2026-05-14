'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bookmark,
  Layers,
  UserMinus,
  UserPlus,
} from 'lucide-react';

import Loader from '@/components/Loader';
import { ApiError, tokenStore } from '@/lib/api';
import {
  fetchPublicUser,
  fetchPublicUserLists,
  followUser,
  unfollowUser,
  type PublicList,
  type PublicUser,
} from '@/lib/social';
import { useGoBack } from '@/hooks/useGoBack';

const fmt = (n: number) => n.toLocaleString('pt-BR');

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams<{ username: string }>();
  const username = params?.username || '';
  const goBack = useGoBack();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [lists, setLists] = useState<PublicList[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!username) return;
    Promise.all([fetchPublicUser(username), fetchPublicUserLists(username)])
      .then(([u, ls]) => {
        setUser(u);
        setLists(ls);
        setFollowing(u.is_following);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('User não encontrado.');
        } else {
          setError('Falha ao carregar perfil.');
        }
      })
      .finally(() => setLoading(false));
  }, [username]);

  const handleFollow = async () => {
    if (!user) return;
    if (!tokenStore.getAccess()) {
      router.push(`/login?next=/u/${user.username}`);
      return;
    }
    setFollowBusy(true);
    try {
      const res = following
        ? await unfollowUser(user.username)
        : await followUser(user.username);
      setFollowing(res.is_following);
      setUser({ ...user, followers_count: res.followers_count });
      toast.success(res.is_following ? 'Seguindo.' : 'Deixou de seguir.');
    } catch {
      toast.error('Falha ao atualizar follow.');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="QUERYING_AGENT" caption="// FETCHING_PROFILE" />
      </div>
    );
  }
  if (error || !user) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
      >
        <div className="text-center">
          <p
            className="mono text-[12px] uppercase tracking-widest mb-4"
            style={{ color: 'var(--fg-muted)' }}
          >
            // {error || 'NO_DATA'}
          </p>
          <button
            onClick={goBack}
            className="mono text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5"
            style={{ color: 'var(--arasaka-red)' }}
          >
            <ArrowLeft className="w-3 h-3" /> VOLTAR
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      <div className="absolute inset-0 rank-grid-bg opacity-30 pointer-events-none" />
      <div className="relative max-w-5xl mx-auto p-6 md:p-10">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest mb-6 transition-colors"
          style={{ color: 'var(--fg-muted)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--arasaka-red)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--fg-muted)')
          }
        >
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>

        {/* Identity card */}
        <header
          className="corners-sm relative overflow-hidden p-6 md:p-8 mb-10 rank-row-in"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
        >
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
          <div className="rank-scan-overlay" />
          <div className="relative flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar + rank emblem stack */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <div
                className="corners-sm overflow-hidden"
                style={{
                  width: 110,
                  height: 110,
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-mid)',
                }}
              >
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center h-full mono text-3xl font-black"
                    style={{
                      color: 'var(--arasaka-red)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Rank emblem mini */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.rank.emblem}
                alt={user.rank.name}
                title={user.rank.name}
                style={{ width: 56, height: 56, objectFit: 'contain' }}
                className="rank-emblem-pulse"
              />
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="mono text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--arasaka-red)' }}
              >
                // AGENT_DOSSIER
              </p>
              <h1
                className="text-3xl md:text-4xl font-black tracking-tight mt-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {user.username}
              </h1>
              <p
                className="mono text-[10px] mt-2 uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                {user.rank.name.toUpperCase()} · {fmt(user.score)} PTS
              </p>
              {user.bio && (
                <p
                  className="text-sm mt-4 max-w-2xl"
                  style={{ color: 'var(--fg-secondary)' }}
                >
                  {user.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mt-5 mono text-[11px] uppercase tracking-widest">
                <div>
                  <span style={{ color: 'var(--fg-primary)', fontSize: 18, fontWeight: 700 }}>
                    {fmt(user.followers_count)}
                  </span>
                  <span className="ml-1.5" style={{ color: 'var(--fg-muted)' }}>
                    seguidores
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--fg-primary)', fontSize: 18, fontWeight: 700 }}>
                    {fmt(user.following_count)}
                  </span>
                  <span className="ml-1.5" style={{ color: 'var(--fg-muted)' }}>
                    seguindo
                  </span>
                </div>
              </div>
            </div>

            {/* Action: follow / self badge */}
            <div className="shrink-0">
              {user.is_self ? (
                <span
                  className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5"
                  style={{
                    border: '1px solid var(--border-mid)',
                    color: 'var(--fg-muted)',
                  }}
                >
                  // VOCE
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleFollow}
                  disabled={followBusy}
                  className="mono text-[11px] uppercase tracking-widest px-4 py-2.5 inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                  style={{
                    background: following
                      ? 'transparent'
                      : 'var(--arasaka-red)',
                    color: following ? 'var(--fg-secondary)' : '#fff',
                    border: `1px solid ${following ? 'var(--border-mid)' : 'var(--arasaka-red)'}`,
                    fontWeight: 700,
                  }}
                  onMouseEnter={(e) => {
                    if (following) {
                      e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                      e.currentTarget.style.color = 'var(--arasaka-red)';
                    } else {
                      e.currentTarget.style.background =
                        'var(--arasaka-red-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (following) {
                      e.currentTarget.style.borderColor = 'var(--border-mid)';
                      e.currentTarget.style.color = 'var(--fg-secondary)';
                    } else {
                      e.currentTarget.style.background = 'var(--arasaka-red)';
                    }
                  }}
                >
                  {following ? (
                    <>
                      <UserMinus className="w-4 h-4" /> SEGUINDO
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> SEGUIR
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Listas publicas */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span
              className="mono text-[10px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                color: 'var(--arasaka-red)',
                border: '1px solid var(--arasaka-red)',
              }}
            >
              01
            </span>
            <h2
              className="text-[11px] uppercase tracking-[0.25em] font-bold mono flex items-center gap-2"
              style={{ color: 'var(--fg-secondary)' }}
            >
              <Bookmark className="w-3.5 h-3.5" /> LISTAS PUBLICAS
              <span style={{ color: 'var(--fg-muted)' }}>
                [{(lists ?? []).length}]
              </span>
            </h2>
            <div className="flex-1 h-px" style={{ background: 'var(--border-faint)' }} />
          </div>

          {!lists || lists.length === 0 ? (
            <div
              className="corners-sm py-12 text-center"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-faint)',
              }}
            >
              <Layers
                className="w-8 h-8 mx-auto mb-3"
                style={{ color: 'var(--fg-muted)' }}
              />
              <p
                className="mono text-[11px] uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                // SEM_LISTAS_PUBLICAS
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lists.map((list, i) => (
                <PublicListCard key={list.id} list={list} index={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PublicListCard({ list, index }: { list: PublicList; index: number }) {
  // Listas publicas são visualizaveis mas nao editaveis pelo viewer.
  // Click leva ao mesmo /library/lists/<id> — backend ja retorna lista
  // se for publica OU se for do user logado.
  const recent = list.items.slice(0, 5);
  return (
    <Link
      href={`/library/lists/${list.id}`}
      className="group corners-sm p-5 relative overflow-hidden block transition-all rank-row-in"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-faint)',
        animationDelay: `${Math.min(index * 40, 360)}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--arasaka-red)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-faint)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            'linear-gradient(90deg, var(--neon-cyan) 0%, transparent 40%)',
          opacity: 0.6,
        }}
      />
      <header className="mb-3">
        <h3
          className="text-lg font-bold truncate group-hover:text-[var(--arasaka-red)] transition-colors"
          style={{ color: 'var(--fg-primary)' }}
        >
          {list.name}
        </h3>
        <p
          className="mono text-[10px] uppercase tracking-widest mt-0.5 flex items-center gap-1.5"
          style={{ color: 'var(--fg-muted)' }}
        >
          <Layers className="w-3 h-3" />
          {String(list.item_count).padStart(2, '0')} ENTRADAS
        </p>
      </header>
      {list.description && (
        <p
          className="text-xs mb-3 line-clamp-2"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {list.description}
        </p>
      )}
      {recent.length > 0 ? (
        <div className="flex items-start" style={{ height: 100 }}>
          {recent.map((item, i) => (
            <div
              key={item.id}
              className="corners-sm overflow-hidden shrink-0"
              style={{
                width: 66,
                height: 100,
                marginLeft: i === 0 ? 0 : -44,
                background: 'var(--bg-base)',
                border: '1px solid var(--border-mid)',
                zIndex: 10 + i,
                boxShadow: i > 0 ? '-6px 0 12px rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.manga.cover || '/placeholder.jpg'}
                alt={item.manga.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      ) : (
        <p
          className="mono text-[10px] uppercase tracking-widest italic"
          style={{ color: 'var(--fg-muted)' }}
        >
          // EMPTY
        </p>
      )}
    </Link>
  );
}

