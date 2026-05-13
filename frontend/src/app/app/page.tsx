import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Github, Shield, Smartphone, AlertTriangle, ExternalLink } from 'lucide-react';

import { APP_VERSION, GITHUB_LATEST_RELEASE_URL, GITHUB_RELEASES_URL } from '@/lib/version';

export const metadata: Metadata = {
  title: 'App Android',
  description:
    'Instale o Arasaka Nexus como aplicativo Android. Distribuição direta — sem Play Store.',
};

/**
 * Página de download do APK Android (TWA wrapper da PWA).
 *
 * Antes: APK servido direto do nosso nginx (volume bind ./downloads/) —
 *   problema: APK ficava obsoleto rapido conforme o projeto evoluia, e
 *   o operador tinha que lembrar de copiar build novo no servidor a cada
 *   release. Resultado: usuarios baixando version antiga sem perceber.
 *
 * Agora: pagina linka pro GitHub Releases /releases/latest. GitHub
 * automatico redireciona pra tag mais recente — quem baixa pega sempre
 * o APK mais novo, sem cache local stale.
 *
 * Pipeline de release (manual ou via GitHub Actions):
 *   1. Build local Bubblewrap: cd twa && ./gradlew assembleRelease
 *   2. Signar: jarsigner -keystore ... app-release.apk
 *   3. Tag + push: git tag vX.Y && git push origin vX.Y
 *   4. Criar release no GitHub: gh release create vX.Y twa/app-release-signed.apk
 *   5. Upar mesma versao em package.json (footer + esta pagina viram pra X.Y
 *      automatico ao redeploy)
 */

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
            Distribuição direta via GitHub Releases. Sempre a versão mais
            recente. Sem Play Store, sem coleta extra. O app é o mesmo site
            rodando em modo standalone — instalação manual via APK.
          </p>
        </div>

        {/* Download principal — aponta pra GitHub Releases */}
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
                LATEST_RELEASE
              </p>
              <p
                className="mono text-2xl mb-1"
                style={{ color: 'var(--fg-primary)' }}
              >
                <a
                  href={GITHUB_LATEST_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--arasaka-red)] transition-colors"
                  style={{ color: 'var(--fg-primary)' }}
                >
                  v{APP_VERSION}
                </a>
              </p>
              <p
                className="mono text-xs uppercase tracking-widest"
                style={{ color: 'var(--fg-muted)' }}
              >
                Android {MIN_ANDROID}+ · arm64 / arm / x86 · servido por GitHub
              </p>
            </div>
            <a
              href={GITHUB_LATEST_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 py-4 px-6 mono text-sm uppercase tracking-[0.3em] transition-all"
              style={{
                background: 'var(--arasaka-red)',
                color: '#fff',
                fontWeight: 700,
                boxShadow: 'var(--glow-red)',
              }}
            >
              <Github size={18} />
              ABRIR RELEASES
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* Aviso sobre versionamento */}
        <div
          className="p-5 mb-8 flex gap-4 items-start"
          style={{
            background: 'rgba(34,211,238,0.06)',
            border: '1px solid var(--border-faint)',
          }}
        >
          <Smartphone
            size={20}
            style={{ color: 'var(--neon-cyan)', flexShrink: 0, marginTop: 2 }}
          />
          <div>
            <p
              className="kicker mb-2"
              style={{ color: 'var(--neon-cyan)' }}
            >
              SEMPRE_ATUALIZADO
            </p>
            <p
              className="mono text-xs leading-relaxed"
              style={{ color: 'var(--fg-secondary)' }}
            >
              O link <code className="mono">/releases/latest</code> do GitHub
              redireciona automaticamente pra tag mais recente publicada. Nenhum
              cache local pra ficar obsoleto. A versão atual ({' '}
              <span style={{ color: 'var(--fg-primary)' }}>v{APP_VERSION}</span>{' '}
              ) corresponde ao código em produção agora.
            </p>
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
              por estar quebrado. O SHA-256 do APK fica publicado na página da
              release pra você conferir integridade.
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
              icon={<Github size={18} />}
              title="Abrir a release no GitHub"
              body="Clique em ABRIR RELEASES acima. Na página da release mais recente, baixa o asset terminado em .apk."
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
              body="Toca no arquivo baixado em Downloads. Aceita os prompts. Em ~5s o app aparece na home."
            />
            <Step
              n={4}
              icon={<Download size={18} />}
              title="Atualizações futuras"
              body="O conteúdo (mangas, layouts, fixes) atualiza sozinho — o app é uma janela pro site. Só re-baixe quando subirmos uma versão com mudança de permissão / icon / estrutura (raro)."
            />
          </ol>
        </div>

        {/* Link pra historico de releases */}
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
            // CHANGELOG
          </p>
          <p
            className="mono text-xs leading-relaxed mb-3"
            style={{ color: 'var(--fg-secondary)' }}
          >
            Curioso sobre o que mudou? Cada release no GitHub vem com notas do
            que entrou (bugfixes, novas fontes, melhorias de UI).
          </p>
          <a
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-2 px-4 mono text-xs uppercase tracking-[0.3em] transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--fg-primary)',
              border: '1px solid var(--border-mid)',
            }}
          >
            <Github size={14} />
            VER HISTORICO
            <ExternalLink size={12} />
          </a>
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
