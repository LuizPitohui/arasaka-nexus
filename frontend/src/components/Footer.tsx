'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

type Contact = {
  contact_email: string;
  dmca_email: string;
  lgpd_email: string;
  support_email: string;
};

const FALLBACK: Contact = {
  contact_email: 'contato@nexus.arasaka.fun',
  dmca_email: 'copyright@nexus.arasaka.fun',
  lgpd_email: 'dpo@nexus.arasaka.fun',
  support_email: 'suporte@nexus.arasaka.fun',
};

export function Footer() {
  const [contact, setContact] = useState<Contact>(FALLBACK);

  useEffect(() => {
    api
      .get<Contact>('/site/contact/', { auth: false })
      .then(setContact)
      .catch(() => {
        // keep fallback silently
      });
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer
      className="relative mt-16 pt-10 pb-6 px-6"
      style={{
        background: 'var(--bg-terminal)',
        borderTop: '1px solid var(--border-faint)',
        color: 'var(--fg-secondary)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, var(--arasaka-red) 30%, var(--arasaka-red) 70%, transparent 100%)',
          opacity: 0.5,
        }}
      />

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <p
            className="mono text-[10px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--arasaka-red)' }}
          >
            // ARASAKA_NEXUS
          </p>
          <p
            className="mt-2 text-sm max-w-md"
            style={{ color: 'var(--fg-secondary)' }}
          >
            Biblioteca digital de mangás com leitor integrado. Conteúdo
            indexado a partir do MangaDex; nenhum arquivo é hospedado neste
            servidor.
          </p>
          <p
            className="mt-3 mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}
          >
            // FAN_PROJECT · NÃO_OFICIAL · USO_NÃO_COMERCIAL
          </p>
        </div>

        <FooterColumn title="// LEGAL">
          <FooterLink href="/termos">Termos de Uso</FooterLink>
          <FooterLink href="/privacidade">Política de Privacidade</FooterLink>
          <FooterLink href="/aviso-legal">Aviso Legal &amp; DMCA</FooterLink>
        </FooterColumn>

        <FooterColumn title="// CONTATO">
          <FooterMail label="Geral" email={contact.contact_email} />
          <FooterMail label="DMCA" email={contact.dmca_email} />
          <FooterMail label="LGPD" email={contact.lgpd_email} />
          <FooterMail label="Suporte" email={contact.support_email} />
        </FooterColumn>
      </div>

      <div
        className="max-w-6xl mx-auto mt-10 pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
        style={{ borderTop: '1px solid var(--border-faint)' }}
      >
        <p
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          © {year} Arasaka Nexus · Todos os direitos das obras pertencem aos
          autores e editoras originais.
        </p>
        <p
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          v1.0 · BUILT_WITH_NEON
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="mono text-[10px] uppercase tracking-[0.3em] mb-3"
        style={{ color: 'var(--arasaka-red)' }}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="mono text-[11px] uppercase tracking-widest transition-colors hover:text-white"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {children}
      </Link>
    </li>
  );
}

function FooterMail({ label, email }: { label: string; email: string }) {
  return (
    <li className="flex flex-col">
      <span
        className="mono text-[9px] uppercase tracking-[0.3em]"
        style={{ color: 'var(--fg-muted)' }}
      >
        {label}
      </span>
      <a
        href={`mailto:${email}`}
        className="mono text-[11px] transition-colors hover:text-white break-all"
        style={{ color: 'var(--fg-secondary)' }}
      >
        {email}
      </a>
    </li>
  );
}
