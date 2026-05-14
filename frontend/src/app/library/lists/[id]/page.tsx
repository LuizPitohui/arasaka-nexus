'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit3,
  Filter,
  Globe,
  Layers,
  Lock,
  LogOut,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { ApiError, api, tokenStore } from '@/lib/api';
import Loader from '@/components/Loader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MangaSummary = {
  id: number;
  title: string;
  cover: string;
  status?: string;
  categories?: string[];
  work_id?: number | null;
  work_sources_count?: number;
};

type ReadingListItem = {
  id: number;
  manga: MangaSummary;
  position: number;
  added_at: string;
};

type UserBrief = { id: number; username: string; avatar: string | null };

type ReadingList = {
  id: number;
  name: string;
  description: string;
  is_public: boolean;
  item_count: number;
  items: ReadingListItem[];
  created_at: string;
  updated_at: string;
  owner: UserBrief;
  collaborators: UserBrief[];
  my_role: 'owner' | 'collaborator' | 'viewer';
};

type Sort = 'added_desc' | 'added_asc' | 'alpha' | 'alpha_desc';

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'added_desc', label: 'Recentes' },
  { value: 'added_asc', label: 'Antigos' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'alpha_desc', label: 'Z → A' },
];

const SORT_STORAGE_KEY = 'nexus_vault_list_sort';

const fmt = (n: number) => n.toLocaleString('pt-BR');

function timeAgoShort(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}sem`;
  const months = Math.floor(days / 30);
  return `${months}mes`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ListDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
          <Loader fullscreen label="OPENING_INDEX" caption="// FETCHING_LIST" />
        </div>
      }
    >
      <ListDetailContent />
    </Suspense>
  );
}

function isListSort(v: string | null): v is Sort {
  return SORT_OPTIONS.some((o) => o.value === v);
}

function ListDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const listId = params?.id;

  // URL state pra sort + filtro (back/forward restaura; link compartilhavel)
  const urlSort = searchParams.get('sort');
  const urlFilter = searchParams.get('q') ?? '';

  const updateUrl = (mutator: (p: URLSearchParams) => void) => {
    const params2 = new URLSearchParams(searchParams.toString());
    mutator(params2);
    const qs = params2.toString();
    router.replace(
      qs ? `/library/lists/${listId}?${qs}` : `/library/lists/${listId}`,
      { scroll: false },
    );
  };

  const [list, setList] = useState<ReadingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(() => {
    if (urlSort && isListSort(urlSort)) return urlSort;
    return 'added_desc';
  });
  const [filter, setFilter] = useState(urlFilter);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);

  useEffect(() => {
    if (!tokenStore.getAccess()) {
      router.replace(`/login?next=/library/lists/${listId}`);
      return;
    }
    // Sort fallback ao localStorage so quando URL nao tem
    if (urlSort) return;
    try {
      const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (stored && SORT_OPTIONS.some((o) => o.value === stored)) {
        setSort(stored as Sort);
      }
    } catch {
      /* no-op */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, listId]);

  // Sync filter -> URL com debounce
  useEffect(() => {
    const t = setTimeout(() => {
      updateUrl((p) => {
        if (filter.trim()) p.set('q', filter.trim());
        else p.delete('q');
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const load = async () => {
    if (!listId) return;
    try {
      const fresh = await api.get<ReadingList>(`/accounts/lists/${listId}/`);
      setList(fresh);
      if (!editing) {
        setEditName(fresh.name);
        setEditDesc(fresh.description);
        setEditPublic(fresh.is_public);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Lista nao encontrada');
      } else if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=/library/lists/${listId}`);
      } else {
        setError('Falha ao carregar lista');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const onSortChange = (next: Sort) => {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    updateUrl((p) => {
      if (next === 'added_desc') p.delete('sort');
      else p.set('sort', next);
    });
  };

  const handleRemove = async (mangaId: number, title: string) => {
    if (!confirm(`Remover "${title}" desta lista?`)) return;
    try {
      await api.delete(`/accounts/lists/${listId}/items/${mangaId}/`);
      toast.success('Removido da lista.');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao remover.');
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast.error('Nome obrigatorio.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/accounts/lists/${listId}/`, {
        name: editName.trim(),
        description: editDesc.trim(),
        is_public: editPublic,
      });
      toast.success('Lista atualizada.');
      setEditing(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveList = async () => {
    if (!list) return;
    // Pega o username do user logado via /auth/me/ — alternativa
    // simples: enviar 'me' como atalho (precisa endpoint backend) OU
    // confiar que /accounts/me/ devolve. Aqui usamos o api.get profile.
    try {
      const me = await api.get<{ username: string }>('/accounts/profile/');
      if (
        !confirm(
          `Sair da lista "${list.name}"? Voce perde acesso de edicao mas pode ser readicionado pelo owner.`,
        )
      )
        return;
      await api.delete(
        `/accounts/lists/${listId}/collaborators/${encodeURIComponent(me.username)}/`,
      );
      toast.success('Voce saiu da lista.');
      router.push('/library');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao sair da lista.');
    }
  };

  const handleDeleteList = async () => {
    if (
      !confirm(
        'Excluir esta lista? Os mangás dentro NAO serao apagados, so a lista em si.',
      )
    )
      return;
    try {
      await api.delete(`/accounts/lists/${listId}/`);
      toast.success('Lista excluida.');
      router.push('/library');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao excluir.');
    }
  };

  const sortedFiltered = useMemo(() => {
    if (!list) return [];
    let arr = list.items.slice();
    const q = filter.trim().toLowerCase();
    if (q) {
      arr = arr.filter((it) => it.manga.title.toLowerCase().includes(q));
    }
    arr.sort((a, b) => {
      switch (sort) {
        case 'added_desc':
          return (b.added_at || '').localeCompare(a.added_at || '');
        case 'added_asc':
          return (a.added_at || '').localeCompare(b.added_at || '');
        case 'alpha':
          return a.manga.title.localeCompare(b.manga.title, 'pt-BR');
        case 'alpha_desc':
          return b.manga.title.localeCompare(a.manga.title, 'pt-BR');
      }
    });
    return arr;
  }, [list, filter, sort]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="OPENING_INDEX" caption="// FETCHING_LIST" />
      </div>
    );
  }
  if (error || !list) {
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
          <Link
            href="/library"
            className="mono text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5"
            style={{ color: 'var(--arasaka-red)' }}
          >
            <ArrowLeft className="w-3 h-3" /> VOLTAR AO VAULT
          </Link>
        </div>
      </main>
    );
  }

  const createdAt = new Date(list.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <main
      className="min-h-screen relative"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      <div className="absolute inset-0 rank-grid-bg opacity-30 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto p-6 md:p-10">
        {/* Back link */}
        <Link
          href="/library"
          className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest mb-6 transition-colors"
          style={{ color: 'var(--fg-muted)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--arasaka-red)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--fg-muted)')
          }
        >
          <ArrowLeft className="w-3 h-3" /> VAULT
        </Link>

        {/* Header */}
        <header
          className="corners-sm mb-8 p-6 md:p-8 relative overflow-hidden rank-row-in"
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
          {!editing ? (
            <div className="relative flex flex-col md:flex-row md:items-start gap-4">
              <div className="min-w-0 flex-1">
                <p
                  className="mono text-[11px] uppercase tracking-[0.3em] mb-2"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  // INDEX_DETAIL
                </p>
                <h1
                  className="glitch-2 text-3xl md:text-4xl font-black tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {list.name.toUpperCase()}
                </h1>
                <div
                  className="mono text-[10px] uppercase tracking-widest mt-3 flex items-center gap-3 flex-wrap"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {fmt(list.item_count)} ENTRADAS
                  </span>
                  <span>· criada em {createdAt}</span>
                  {list.is_public ? (
                    <span
                      className="flex items-center gap-1 px-1.5 py-0.5"
                      style={{
                        background: 'var(--neon-cyan)',
                        color: 'var(--bg-base)',
                        letterSpacing: '0.1em',
                        fontSize: 9,
                      }}
                    >
                      <Globe className="w-3 h-3" /> PUBLICA
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 px-1.5 py-0.5"
                      style={{
                        border: '1px solid var(--border-mid)',
                        color: 'var(--fg-secondary)',
                        letterSpacing: '0.1em',
                        fontSize: 9,
                      }}
                    >
                      <Lock className="w-3 h-3" /> PRIVADA
                    </span>
                  )}
                </div>
                {list.description && (
                  <p
                    className="text-sm mt-4 max-w-2xl"
                    style={{ color: 'var(--fg-secondary)' }}
                  >
                    {list.description}
                  </p>
                )}
                {/* Owner + colaboradores */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/u/${encodeURIComponent(list.owner.username)}`}
                    className="mono text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5 px-2 py-1 transition-colors"
                    style={{
                      border: '1px solid var(--border-mid)',
                      background: 'var(--bg-base)',
                      color: 'var(--fg-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                      e.currentTarget.style.color = 'var(--arasaka-red)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-mid)';
                      e.currentTarget.style.color = 'var(--fg-secondary)';
                    }}
                    title="Owner"
                  >
                    {list.owner.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={list.owner.avatar}
                        alt=""
                        style={{
                          width: 16,
                          height: 16,
                          objectFit: 'cover',
                          border: '1px solid var(--border-mid)',
                        }}
                      />
                    ) : (
                      <span style={{ color: 'var(--arasaka-red)' }}>◆</span>
                    )}
                    {list.owner.username}
                    <span style={{ color: 'var(--fg-muted)' }}>· OWNER</span>
                  </Link>
                  {list.collaborators.map((c) => (
                    <Link
                      key={c.id}
                      href={`/u/${encodeURIComponent(c.username)}`}
                      className="mono text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5 px-2 py-1 transition-colors"
                      style={{
                        border: '1px solid var(--border-faint)',
                        background: 'var(--bg-base)',
                        color: 'var(--fg-muted)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--neon-cyan)';
                        e.currentTarget.style.color = 'var(--neon-cyan)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor =
                          'var(--border-faint)';
                        e.currentTarget.style.color = 'var(--fg-muted)';
                      }}
                      title={`Colaborador: ${c.username}`}
                    >
                      {c.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.avatar}
                          alt=""
                          style={{
                            width: 16,
                            height: 16,
                            objectFit: 'cover',
                            border: '1px solid var(--border-mid)',
                          }}
                        />
                      ) : (
                        <Users className="w-3 h-3" />
                      )}
                      {c.username}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {list.my_role === 'owner' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCollabModal(true)}
                      className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                      style={{
                        border: '1px solid var(--arasaka-red)',
                        background: 'rgba(220,38,38,0.08)',
                        color: 'var(--arasaka-red)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          'rgba(220,38,38,0.15)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          'rgba(220,38,38,0.08)')
                      }
                    >
                      <Users className="w-3 h-3" /> COMPARTILHAR
                      {list.collaborators.length > 0 && (
                        <span style={{ color: 'var(--fg-muted)' }}>
                          [{list.collaborators.length}]
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                      style={{
                        border: '1px solid var(--border-mid)',
                        background: 'var(--bg-base)',
                        color: 'var(--fg-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          'var(--arasaka-red)';
                        e.currentTarget.style.color = 'var(--arasaka-red)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-mid)';
                        e.currentTarget.style.color = 'var(--fg-secondary)';
                      }}
                    >
                      <Edit3 className="w-3 h-3" /> EDITAR
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteList}
                      className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                      style={{
                        border: '1px solid var(--border-mid)',
                        background: 'var(--bg-base)',
                        color: 'var(--fg-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          'var(--arasaka-red)';
                        e.currentTarget.style.color = 'var(--arasaka-red)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-mid)';
                        e.currentTarget.style.color = 'var(--fg-secondary)';
                      }}
                    >
                      <Trash2 className="w-3 h-3" /> EXCLUIR
                    </button>
                  </>
                )}
                {list.my_role === 'collaborator' && (
                  <button
                    type="button"
                    onClick={handleLeaveList}
                    className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      border: '1px solid var(--border-mid)',
                      background: 'var(--bg-base)',
                      color: 'var(--fg-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                      e.currentTarget.style.color = 'var(--arasaka-red)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-mid)';
                      e.currentTarget.style.color = 'var(--fg-secondary)';
                    }}
                  >
                    <LogOut className="w-3 h-3" /> SAIR DA LISTA
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveMeta} className="relative space-y-3">
              <p
                className="mono text-[11px] uppercase tracking-[0.3em] mb-2"
                style={{ color: 'var(--arasaka-red)' }}
              >
                // EDIT_INDEX_META
              </p>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome"
                className="w-full px-3 py-2 text-sm focus:outline-none"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-primary)',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--arasaka-red)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-mid)')
                }
                maxLength={80}
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Descricao (opcional)"
                rows={3}
                className="w-full px-3 py-2 text-sm focus:outline-none resize-none"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--fg-primary)',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--arasaka-red)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border-mid)')
                }
                maxLength={400}
              />
              <label
                className="flex items-center gap-2 mono text-[11px] uppercase tracking-widest cursor-pointer"
                style={{ color: 'var(--fg-secondary)' }}
              >
                <input
                  type="checkbox"
                  checked={editPublic}
                  onChange={(e) => setEditPublic(e.target.checked)}
                  className="accent-[var(--arasaka-red)]"
                />
                Lista publica (compartilhavel)
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="mono flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
                  style={{
                    background: 'var(--arasaka-red)',
                    color: '#fff',
                    border: '1px solid var(--arasaka-red)',
                  }}
                >
                  <Save className="w-3 h-3" /> {saving ? 'SALVANDO...' : 'SALVAR'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditName(list.name);
                    setEditDesc(list.description);
                    setEditPublic(list.is_public);
                  }}
                  className="mono px-3 py-2 text-[11px] uppercase tracking-widest"
                  style={{
                    border: '1px solid var(--border-mid)',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  CANCELAR
                </button>
              </div>
            </form>
          )}
        </header>

        {/* Toolbar: search + sort */}
        {list.item_count > 0 && (
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
            <div
              className="flex items-center gap-2 px-3 py-2 flex-1 max-w-md"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
              }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--fg-muted)' }} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por título..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--fg-primary)' }}
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="p-0.5"
                  style={{ color: 'var(--fg-muted)' }}
                  aria-label="Limpar filtro"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="mono text-[10px] uppercase tracking-[0.3em] mr-1 flex items-center gap-1"
                style={{ color: 'var(--fg-muted)' }}
              >
                <Filter className="w-3 h-3" /> ORDER
              </span>
              {SORT_OPTIONS.map((opt) => {
                const active = sort === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSortChange(opt.value)}
                    className="mono text-[10px] uppercase tracking-widest px-2.5 py-1 transition-colors"
                    style={{
                      border: '1px solid',
                      borderColor: active
                        ? 'var(--arasaka-red)'
                        : 'var(--border-mid)',
                      background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
                      color: active ? 'var(--arasaka-red)' : 'var(--fg-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        {list.item_count === 0 ? (
          <div
            className="relative corners-sm py-16 px-6 text-center overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-faint)',
            }}
          >
            <div className="absolute inset-0 rank-grid-bg opacity-40 pointer-events-none" />
            <div className="rank-scan-overlay" />
            <div className="relative">
              <div
                className="inline-flex items-center justify-center mb-4 p-4 corners-sm"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--arasaka-red)',
                }}
              >
                <Layers className="w-12 h-12" />
              </div>
              <h3
                className="mono text-sm uppercase tracking-[0.25em] font-bold"
                style={{ color: 'var(--fg-primary)' }}
              >
                // EMPTY_INDEX
              </h3>
              <p
                className="mt-3 text-sm max-w-md mx-auto"
                style={{ color: 'var(--fg-secondary)' }}
              >
                Vazia. Abre uma obra no catalogo e adiciona nessa lista pelo menu.
              </p>
              <Link
                href="/popular"
                className="mono inline-flex items-center gap-2 mt-6 px-4 py-2 text-[11px] font-bold uppercase tracking-widest"
                style={{
                  background: 'var(--arasaka-red)',
                  color: '#fff',
                }}
              >
                EXPLORAR
              </Link>
            </div>
          </div>
        ) : sortedFiltered.length === 0 ? (
          <p
            className="mono text-[11px] uppercase tracking-widest py-12 text-center corners-sm"
            style={{
              color: 'var(--fg-muted)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-faint)',
            }}
          >
            // NO_MATCH — nenhuma obra com "{filter}" nesta lista
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
            {sortedFiltered.map((item, i) => (
              <ItemCard
                key={item.id}
                item={item}
                onRemove={
                  list.my_role === 'owner' || list.my_role === 'collaborator'
                    ? handleRemove
                    : undefined
                }
                index={i}
              />
            ))}
          </div>
        )}

        {filter && sortedFiltered.length > 0 && (
          <p
            className="mono text-[10px] uppercase tracking-widest mt-6"
            style={{ color: 'var(--fg-muted)' }}
          >
            // {fmt(sortedFiltered.length)} de {fmt(list.item_count)} mostrados
          </p>
        )}
      </div>

      {showCollabModal && list.my_role === 'owner' && (
        <CollaboratorsModal
          list={list}
          listId={String(listId)}
          onClose={() => setShowCollabModal(false)}
          onUpdated={(updated) => setList(updated)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Modal: gerenciar colaboradores (apenas owner)
// ---------------------------------------------------------------------------
function CollaboratorsModal({
  list,
  listId,
  onClose,
  onUpdated,
}: {
  list: ReadingList;
  listId: string;
  onClose: () => void;
  onUpdated: (next: ReadingList) => void;
}) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) {
      toast.error('Digite o username.');
      return;
    }
    setBusy(true);
    try {
      const next = await api.post<ReadingList>(
        `/accounts/lists/${listId}/collaborators/`,
        { username: u },
      );
      onUpdated(next);
      setUsername('');
      toast.success(`${u} adicionado.`);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.data && typeof err.data === 'object'
          ? String((err.data as { detail?: string }).detail || 'Falha.')
          : 'Falha ao adicionar.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (col: UserBrief) => {
    if (!confirm(`Remover ${col.username} da lista?`)) return;
    try {
      await api.delete(
        `/accounts/lists/${listId}/collaborators/${encodeURIComponent(col.username)}/`,
      );
      onUpdated({
        ...list,
        collaborators: list.collaborators.filter((c) => c.id !== col.id),
      });
      toast.success(`${col.username} removido.`);
    } catch {
      toast.error('Falha ao remover.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className="corners-sm relative w-full max-w-md p-6"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--arasaka-red)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 40%, transparent 100%)',
          }}
        />
        <div className="flex items-start justify-between mb-4">
          <div>
            <p
              className="mono text-[10px] uppercase tracking-[0.3em]"
              style={{ color: 'var(--arasaka-red)' }}
            >
              // SHARE_INDEX
            </p>
            <h2
              className="text-xl font-bold mt-1"
              style={{ color: 'var(--fg-primary)' }}
            >
              Compartilhar lista
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 transition-colors"
            style={{ color: 'var(--fg-muted)' }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p
          className="mono text-[10px] uppercase tracking-widest mb-4"
          style={{ color: 'var(--fg-muted)' }}
        >
          // adicione um agent pelo username — ele vai poder adicionar/remover obras
        </p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-primary)',
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = 'var(--arasaka-red)')
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = 'var(--border-mid)')
            }
            maxLength={150}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy}
            className="mono px-3 py-2 text-[11px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
            }}
          >
            <UserPlus className="w-3.5 h-3.5" />
            {busy ? '...' : 'ADD'}
          </button>
        </form>

        <p
          className="mono text-[10px] uppercase tracking-[0.25em] mb-3"
          style={{ color: 'var(--fg-secondary)' }}
        >
          COLABORADORES [{list.collaborators.length}]
        </p>
        {list.collaborators.length === 0 ? (
          <p
            className="mono text-[10px] uppercase tracking-widest italic py-3 text-center"
            style={{ color: 'var(--fg-muted)' }}
          >
            // SEM_COLABORADORES — esta lista e so sua
          </p>
        ) : (
          <div className="space-y-2">
            {list.collaborators.map((c) => (
              <div
                key={c.id}
                className="corners-sm flex items-center gap-3 p-2"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-faint)',
                }}
              >
                {c.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar}
                    alt=""
                    style={{
                      width: 28,
                      height: 28,
                      objectFit: 'cover',
                      border: '1px solid var(--border-mid)',
                    }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 28,
                      height: 28,
                      border: '1px solid var(--border-mid)',
                      color: 'var(--arasaka-red)',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {c.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span
                  className="flex-1 text-sm font-bold truncate"
                  style={{ color: 'var(--fg-primary)' }}
                >
                  {c.username}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(c)}
                  className="p-1.5 transition-colors"
                  style={{
                    color: 'var(--fg-muted)',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--arasaka-red)';
                    e.currentTarget.style.borderColor = 'var(--arasaka-red)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--fg-muted)';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                  title="Remover"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onRemove,
  index,
}: {
  item: ReadingListItem;
  /** Quando undefined (viewer), botao remover nao renderiza. */
  onRemove?: (mangaId: number, title: string) => void;
  index: number;
}) {
  const manga = item.manga;
  return (
    <div
      className="group relative rank-row-in"
      style={
        {
          animationDelay: `${Math.min(index * 25, 360)}ms`,
        } as React.CSSProperties
      }
    >
      <Link href={`/manga/${manga.id}`} className="block corners-sm">
        <div
          className="aspect-[2/3] overflow-hidden relative transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--arasaka-red)';
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-faint)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <img
            src={manga.cover || '/placeholder.jpg'}
            alt={manga.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {/* added_at chip */}
          <span
            className="absolute top-2 left-2 mono text-[9px] uppercase tracking-widest px-1.5 py-0.5"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-secondary)',
            }}
            title={`Adicionada em ${new Date(item.added_at).toLocaleString('pt-BR')}`}
          >
            + {timeAgoShort(item.added_at)}
          </span>
          {(manga.work_sources_count ?? 1) > 1 && (
            <span
              className="absolute top-2 right-2 mono text-[9px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                background: 'rgba(220,38,38,0.18)',
                border: '1px solid var(--arasaka-red)',
                color: 'var(--arasaka-red)',
                backdropFilter: 'blur(2px)',
              }}
              title={`${manga.work_sources_count} fontes`}
            >
              ▸ {manga.work_sources_count}
            </span>
          )}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              background:
                'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ zIndex: 2 }}
          >
            <p
              className="mono text-[9px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              ▸ ABRIR
            </p>
          </div>
        </div>
        <h3
          className="mt-3 text-[13px] font-semibold line-clamp-2"
          style={{ color: 'var(--fg-secondary)' }}
        >
          {manga.title}
        </h3>
      </Link>

      {onRemove && (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(manga.id, manga.title);
        }}
        className="absolute right-2 p-1.5 transition opacity-0 group-hover:opacity-100"
        style={{
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid var(--border-mid)',
          color: 'var(--fg-secondary)',
          top: (manga.work_sources_count ?? 1) > 1 ? '32px' : '8px',
          zIndex: 3,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--arasaka-red)';
          e.currentTarget.style.color = 'var(--arasaka-red)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-mid)';
          e.currentTarget.style.color = 'var(--fg-secondary)';
        }}
        title="Remover da lista"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      )}
    </div>
  );
}
