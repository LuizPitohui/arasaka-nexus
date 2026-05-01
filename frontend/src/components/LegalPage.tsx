'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';

import Loader from '@/components/Loader';
import { ApiError, api } from '@/lib/api';

type Doc = {
  slug: string;
  title: string;
  body_markdown: string;
  version: string;
  effective_date: string;
  updated_at: string;
};

const FALLBACK_TITLES: Record<string, string> = {
  termos: 'Termos de Uso',
  privacidade: 'Política de Privacidade',
  'aviso-legal': 'Aviso Legal & DMCA',
};

/**
 * Lightweight Markdown → HTML.
 *
 * We intentionally do NOT pull a full library; the corpus is short, controlled
 * by an admin, and rendered in trusted contexts. We escape HTML first then
 * apply a tiny subset (headings, paragraphs, lists, bold, links).
 */
function escape(s: string): string {
  // Escapa todos os 5 caracteres relevantes pro contexto HTML.
  // Especialmente importante " porque a saida e usada DENTRO de href="..."
  // — sem isso, um attacker que comprometesse uma conta admin poderia
  // injetar atributo (onmouseover=...) e rodar XSS persistente em
  // /termos, /privacidade, /aviso-legal.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inPara: string[] = [];

  const flushPara = () => {
    if (inPara.length) {
      const text = inline(inPara.join(' '));
      out.push(`<p>${text}</p>`);
      inPara = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  const inline = (text: string): string => {
    let t = escape(text);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // links: [label](url) — only allow http/https/mailto
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const safe = /^(https?:|mailto:)/i.test(url) ? url : '#';
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return t;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (inList !== 'ul') {
        closeList();
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushPara();
      if (inList !== 'ol') {
        closeList();
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    closeList();
    inPara.push(line);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

export function LegalPage({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Doc>(`/site/legal/${slug}/`, { auth: false })
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setMissing(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <Loader fullscreen label="LOADING_DOCUMENT" caption="// FETCHING_LEGAL" />
      </div>
    );
  }

  const fallbackTitle = FALLBACK_TITLES[slug] ?? 'Documento';

  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--bg-base)', color: 'var(--fg-primary)' }}
    >
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest mb-8 transition-colors hover:text-white"
          style={{ color: 'var(--fg-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" /> // RETURN_HOME
        </Link>

        <p
          className="mono text-[11px] uppercase tracking-[0.3em] mb-3"
          style={{ color: 'var(--arasaka-red)' }}
        >
          // LEGAL_RECORD
        </p>

        <header
          className="flex items-start gap-4 pb-6 mb-8"
          style={{ borderBottom: '1px solid var(--border-faint)' }}
        >
          <div
            className="corners-sm flex items-center justify-center shrink-0"
            style={{
              width: 56,
              height: 56,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-mid)',
            }}
          >
            <FileText className="w-6 h-6" style={{ color: 'var(--arasaka-red)' }} />
          </div>
          <div className="min-w-0">
            <h1
              className="display text-3xl md:text-4xl"
              style={{ color: 'var(--fg-primary)' }}
            >
              {doc?.title ?? fallbackTitle}
            </h1>
            {doc && (
              <p
                className="mono text-[11px] uppercase tracking-widest mt-2"
                style={{ color: 'var(--fg-muted)' }}
              >
                v{doc.version} · vigência {formatDate(doc.effective_date)} ·
                atualizado {formatDate(doc.updated_at)}
              </p>
            )}
          </div>
        </header>

        {missing && (
          <div
            className="p-4 mono text-[11px] uppercase tracking-widest"
            style={{
              background: 'var(--bg-terminal)',
              border: '1px solid var(--border-faint)',
              color: 'var(--fg-muted)',
            }}
          >
            // DOCUMENTO_NÃO_DISPONÍVEL — entre em contato pelo rodapé.
          </div>
        )}

        {doc && (
          <article
            className="legal-prose"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.body_markdown) }}
          />
        )}

        <style jsx>{`
          .legal-prose {
            color: var(--fg-secondary);
            font-size: 14px;
            line-height: 1.75;
          }
          .legal-prose :global(h1),
          .legal-prose :global(h2),
          .legal-prose :global(h3),
          .legal-prose :global(h4) {
            color: var(--fg-primary);
            font-family: var(--font-display);
            margin-top: 2rem;
            margin-bottom: 0.75rem;
            letter-spacing: -0.01em;
          }
          .legal-prose :global(h1) {
            font-size: 1.6rem;
          }
          .legal-prose :global(h2) {
            font-size: 1.25rem;
            border-left: 2px solid var(--arasaka-red);
            padding-left: 0.75rem;
          }
          .legal-prose :global(h3) {
            font-size: 1.05rem;
            color: var(--arasaka-red);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .legal-prose :global(p) {
            margin: 0.85rem 0;
          }
          .legal-prose :global(ul),
          .legal-prose :global(ol) {
            padding-left: 1.5rem;
            margin: 0.85rem 0;
          }
          .legal-prose :global(li) {
            margin: 0.35rem 0;
          }
          .legal-prose :global(strong) {
            color: var(--fg-primary);
          }
          .legal-prose :global(a) {
            color: var(--arasaka-red);
            text-decoration: underline;
          }
          .legal-prose :global(a:hover) {
            color: var(--arasaka-red-bright, #ff4444);
          }
        `}</style>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
