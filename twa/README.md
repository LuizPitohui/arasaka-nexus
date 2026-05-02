# Arasaka Nexus — Android (TWA)

Wrapper Android sobre a PWA (`https://nexus.arasaka.fun`). Distribuição
direta via APK no nosso site, **sem Play Store**.

A "casca" Android é uma TWA (Trusted Web Activity) gerada pelo
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). O conteúdo
do app é o site rodando dentro de uma instância do Chrome em modo
fullscreen — sem URL bar, sem barra de aba. Atualizar o site = atualizar
o app, exceto quando muda o ícone, tema, package id ou permissões (aí
precisa de novo APK).

## Pré-requisitos no host de build

| Ferramenta | Versão |
|---|---|
| Node.js | 20+ (já temos no projeto) |
| Java JDK | 17 (`temurin-17` recomendado) |
| Android SDK | API 34+ (Bubblewrap baixa sozinho na primeira vez) |
| Bubblewrap CLI | `npm i -g @bubblewrap/cli` |

```bash
# Instala Bubblewrap (uma vez)
npm i -g @bubblewrap/cli

# Verifica
bubblewrap --version
```

Bubblewrap pede pra baixar JDK + Android SDK no primeiro `init`. Aceita.
~1.5GB de download.

## Build inicial (primeira vez)

```bash
cd twa/
bubblewrap init --manifest=https://nexus.arasaka.fun/manifest.webmanifest
```

Quando perguntar:
- **Package id:** `fun.arasaka.nexus` (já no `twa-manifest.json`)
- **Display mode:** `standalone`
- **Signing key:** **CRIAR NOVA** — gera um keystore. **NUNCA PERCA ESSE
  ARQUIVO**. Sem ele, não dá pra publicar updates (Android exige mesma
  assinatura). Backup em local seguro (1Password, cofre, USB criptografado).
- **Key alias / passwords:** anota numa senha-cofre.

Depois do init:

```bash
bubblewrap build
```

Saída:
- `app-release-signed.apk` ← este é o que vai pro site
- `app-release-bundle.aab` ← formato Play Store, **descartar** (não usamos)

## Atualizar `assetlinks.json`

Bubblewrap imprime no final do build o **SHA-256 fingerprint** da
chave de assinatura, algo tipo:

```
SHA-256 fingerprint: AB:CD:EF:01:23:45:...:FF
```

Cola esse valor em:

```
frontend/public/.well-known/assetlinks.json
```

Substituindo o placeholder `PREENCHA_APOS_BUBBLEWRAP_BUILD`. Commit e
deploy do site **antes** de distribuir o APK — Chrome valida online no
primeiro launch.

Verificar que está OK:

```bash
curl -s https://nexus.arasaka.fun/.well-known/assetlinks.json | jq
```

Deve devolver o JSON com o fingerprint preenchido. Se voltar 404 ou
HTML, o nginx ou o Next.js não está roteando direito.

Validador oficial:
https://developers.google.com/digital-asset-links/tools/generator
(Cola domain + package id + sha256, ele baixa e valida.)

## Distribuir o APK

1. **Tag a release no git:** `git tag v1.0.0 && git push --tags`
2. **Cria release no GitHub:**
   ```
   gh release create v1.0.0 path/to/app-release-signed.apk \
     --title "Nexus v1.0.0 (Android)" \
     --notes "Primeira release do app Android."
   ```
3. **Anota o SHA-256 do APK** (não confundir com o SHA da chave):
   ```
   sha256sum app-release-signed.apk
   ```
   Adiciona no corpo da release pra usuário verificar integridade.
4. **Atualiza `APK_URL` em `frontend/src/app/app/page.tsx`** se mudou
   (geralmente não muda — `releases/latest/download/nexus.apk` aponta
   sempre pro mais recente).

## Atualizar versão

Quando subir uma versão nova **da casca Android** (icon novo, tema
mudou, novas permissões):

```bash
cd twa/
# Edita twa-manifest.json: appVersionName + appVersion (incrementa)
bubblewrap update   # sincroniza com manifest.webmanifest do site
bubblewrap build
```

`appVersion` (versionCode) **DEVE incrementar** a cada APK — é o
contador interno do Android. `appVersionName` (1.0.0, 1.1.0, etc) é o
que aparece pro usuário.

Se for só conteúdo do site (CSS, novos endpoints, fix de bug): NÃO
precisa novo APK. O site dentro do app atualiza sozinho no próximo
launch.

## Quando exigir APK novo

| Mudou | Precisa APK novo? |
|---|---|
| Bug no frontend, fix no Next.js | Não — deploy do site basta |
| Novo mangá / fonte / endpoint | Não |
| Ícone do app | **Sim** |
| Splash screen / theme color | **Sim** |
| Permissões (notificações, câmera, etc) | **Sim** |
| Package id | **Sim** (= app diferente, todo mundo precisa reinstalar) |
| Chave de assinatura | **NUNCA mudar** sem perder usuários |

## Troubleshooting

### "App mostra URL bar do Chrome dentro do app"
TWA não validou. Causas comuns:
1. `assetlinks.json` retorna 404 ou Content-Type HTML
2. SHA-256 no JSON não bate com o da chave que assinou o APK
3. Cache de DNS / Cloudflare servindo versão antiga
4. Service Worker servindo cache stale (não devia, já filtramos
   `/.well-known/`)

Forçar re-validação no device:
```
adb shell pm clear com.android.chrome
```
(Limpa cache do Chrome todo. Drástico mas funciona.)

### "App não atualiza conteúdo"
Service worker pode estar segurando. No app:
- Configurações → Apps → Nexus → Armazenamento → Limpar cache

### "Esqueci a senha do keystore"
Você não atualiza mais o app. Tem que publicar como package novo
(`fun.arasaka.nexus2`) e pedir pra todo mundo reinstalar. **Por isso o
backup do keystore é crítico.**

## Estrutura

```
twa/
├── README.md              ← este arquivo
├── twa-manifest.json      ← config Bubblewrap (package id, cores, etc)
└── (após primeiro build)
    ├── app/               ← projeto Android Studio gerado
    ├── android.keystore   ← chave de assinatura (NÃO COMMITAR)
    ├── app-release-signed.apk
    └── ...
```

`.gitignore` na raiz do projeto deve excluir:
```
twa/app/
twa/android.keystore
twa/*.apk
twa/*.aab
twa/*.keystore
```

## Por que TWA e não app nativo / Capacitor / WebView puro

| Solução | APK | Performance | Esforço | Manutenção |
|---|---|---|---|---|
| **TWA** | ~2MB | Chrome real | Quase zero (1 build) | Zero — site é a fonte |
| Capacitor (WebView) | ~10MB | System WebView (mais lento) | Médio | Plugin updates |
| Cordova | ~15MB | Mesmo problema | Alto | Stack legado |
| Kotlin nativo | ~10MB | Nativo | **Meses** | 2ª codebase |

TWA é literalmente Chrome rodando em fullscreen. Mesmo motor, mesmo
JS engine, mesmo cache. Para um leitor de mangá não-nativo, é a melhor
escolha técnica.
