import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Shield, Smartphone, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'App Android',
  description:
    'Instale o Arasaka Nexus como aplicativo Android. Distribuição direta — sem Play Store.',
};

/**
 * Página de download do APK Android (TWA wrapper da PWA).
 *
 * O APK em si NAO mora no repo (binario grande, alterado a cada release).
 * Subir cada build em GitHub Releases e atualizar APK_URL abaixo.
 *
 * Estrategia de distribuicao:
 *   1. Build local com Bubblewrap (ver twa/README.md)
 *   2. Upload do APK assinado em github.com/.../releases
 *   3. Trocar APK_URL aqui pra apontar pra release mais recente
 *   4. (Opcional) automatizar: workflow que faz release a cada tag.
 */

// APK servido direto do nosso nginx (volume bind ./downloads/).
// Pra subir versao nova: scp twa/app-release-signed.apk arasaka:~/arasaka-nexus/downloads/nexus.apk
// Cache nginx 5min — usuarios pegam atualizacao quase imediato.
const APK_URL = 'https://nexus.arasaka.fun/downloads/nexus.apk';
const APK_VERSION = '1.0.0';
const APK_SIZE = '~1.2 MB';
const MIN_ANDROID = '6.0 (API 23)';

export default function AppDownloadPage() {
  return (
    <main
      className="min-h-screen px-4 py-12 scanlines"
      style={{ background: 'var(--bg-void)' }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <p
            className="kicker mb-3"
            style={{ color: 'var(--arasaka-red)' }}
          >
            // ANDROID_BUILD
          </p>
          <h1
            className="display text-4xl mb-4"
            style={{ color: 'var(--fg-primary)' }}
          >
            NEXUS <span style={{ color: 'var(--arasaka-red)' }}>// APP</span>
          </h1>
          <p
            className="mono text-sm max-w-xl mx-auto"
            style={{ color: 'var(--fg-muted)' }}
          >
            Distribuição direta. Sem Play Store. Sem coleta extra. O app é o
            mesmo site rodando em modo standalone — instalação manual via APK.
          </p>
        </div>

        {/* Download principal */}
        <div
          className="p-8 mb-8"
          style={{
            background: 'var(--bg-terminal)',
            border: '1px solid var(--arasaka-red)',
            boxShadow: '0 0 40px rgba(220,38,38,0.12)',
          }}
        >
          <div className="grid sm:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p
                className="kicker mb-2"
                style={{ color: 'var(--neon-cyan)' }}
              >
                LATEST_BUILD
              </p>
              <p
                className="mono text-2xl mb-1"
                style={{ color: 'var(--fg-primary)' }}
              >
                v{APK_VERSION}
              </p>
              <p
                className="mono text-xs uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                {APK_SIZE} · Android {MIN_ANDROID}+ · arm64 / arm / x86
              </p>
            </div>
            <a
              href={APK_URL}
              download="nexus.apk"
              className="inline-flex items-center gap-3 py-4 px-6 mono text-sm uppercase tracking-[0.3em] transition-all"
              style={{
                background: 'var(--arasaka-red)',
                color: '#fff',
                fontWeight: 700,
                boxShadow: 'var(--glow-red)',
              }}
            >
              <Download size={18} />
              BAIXAR APK
            </a>
          </div>
        </div>

        {/* Aviso sideload */}
        <div
          className="p-5 mb-8 flex gap-4 items-start"
          style={{
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid var(--border-faint)',
          }}
        >
          <AlertTriangle
            size={20}
            style={{ color: 'var(--arasaka-red)', flexShrink: 0, marginTop: 2 }}
          />
          <div>
            <p
              className="kicker mb-2"
              style={{ color: 'var(--arasaka-red)' }}
            >
              SIDELOAD_WARNING
            </p>
            <p
              className="mono text-xs leading-relaxed"
              style={{ color: 'var(--fg-secondary)' }}
            >
              Android vai pedir permissão pra instalar de "fonte desconhecida".
              É normal — o app não passa pela Play Store por escolha nossa, não
              por estar quebrado. Se quiser garantir que o APK é o oficial,
              compare o SHA-256 publicado na página da release com o que você
              baixou (instruções abaixo).
            </p>
          </div>
        </div>

        {/* Passo a passo de instalacao */}
        <div
          className="p-8 mb-8"
          style={{
            background: 'var(--bg-terminal)',
            border: '1px solid var(--border-faint)',
          }}
        >
          <p
            className="kicker mb-5"
            style={{ color: 'var(--neon-cyan)' }}
          >
            // INSTALL_PROCEDURE
          </p>
          <ol className="space-y-5">
            <Step
              n={1}
              icon={<Download size={18} />}
              title="Baixar o APK"
              body="Clique em BAIXAR APK acima. O Chrome vai avisar 'arquivo pode ser perigoso' — aceita (é arquivo de instalador)."
            />
            <Step
              n={2}
              icon={<Smartphone size={18} />}
              title="Permitir instalação fora da loja"
              body={
                <>
                  Abra <code className="mono">Configurações</code> →{' '}
                  <code className="mono">Apps</code> →{' '}
                  <code className="mono">Acesso especial</code> →{' '}
                  <code className="mono">Instalar apps desconhecidos</code> →
                  marque o navegador que você usou pra baixar (Chrome / Firefox
                  / Brave). Em Android 13+ o sistema pede direto na hora.
                </>
              }
            />
            <Step
              n={3}
              icon={<Shield size={18} />}
              title="Abrir o APK"
              body="Toca no nexus.apk em Downloads. Aceita os prompts. Em ~5s o app aparece na home."
            />
            <Step
              n={4}
              icon={<Smartphone size={18} />}
              title="Pronto"
              body="Login, leitor, biblioteca — tudo igual ao site, sem barra de URL. Atualizações automáticas (refresh do conteúdo) chegam sempre que abrir conectado."
            />
          </ol>
        </div>

        {/* Atualizacoes futuras */}
        <div
          className="p-6 mb-8"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-faint)',
          }}
        >
          <p
            className="kicker mb-3"
            style={{ color: 'var(--fg-muted)' }}
          >
            // FUTURE_UPDATES
          </p>
          <p
            className="mono text-xs leading-relaxed"
            style={{ color: 'var(--fg-secondary)' }}
          >
            O conteúdo do app (layout, novos mangás, fixes) atualiza sozinho —
            o app é uma janela pro site. Só a "casca" Android (este APK
            específico) precisa ser baixada de novo quando subirmos uma versão
            com mudança de permissões / icon / estrutura. Vamos avisar dentro
            do próprio app quando isso acontecer.
          </p>
        </div>

        {/* Alternativa PWA */}
        <div className="text-center">
          <p
            className="kicker mb-3"
            style={{ color: 'var(--fg-muted)' }}
          >
            // ALTERNATIVA
          </p>
          <p
            className="mono text-xs mb-4"
            style={{ color: 'var(--fg-secondary)' }}
          >
            Não quer sideload? Instala como PWA: abre o site, menu do Chrome →
            "Adicionar à tela inicial". Mesmo app, sem APK.
          </p>
          <Link
            href="/"
            className="inline-block py-3 px-6 mono text-xs uppercase tracking-[0.3em]"
            style={{
              background: 'transparent',
              color: 'var(--fg-primary)',
              border: '1px solid var(--border-mid)',
            }}
          >
            ▸ VOLTAR AO SITE
          </Link>
        </div>
      </div>
    </main>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center mono text-xs"
        style={{
          background: 'var(--bg-void)',
          border: '1px solid var(--arasaka-red)',
          color: 'var(--arasaka-red)',
        }}
      >
        0{n}
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color: 'var(--neon-cyan)' }}>{icon}</span>
          <p
            className="mono text-sm uppercase tracking-widest"
            style={{ color: 'var(--fg-primary)' }}
          >
            {title}
          </p>
        </div>
        <p
          className="mono text-xs leading-relaxed"
          style={{ color: 'var(--fg-muted)' }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}
