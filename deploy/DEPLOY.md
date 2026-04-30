# Arasaka Nexus — Deploy em produção (`nexus.arasaka.fun`)

Padrão Arasaka — postgres global compartilhado, nginx servindo na porta única `8400`, Cloudflare Tunnel encaminhando o subdomínio.

---

## 🗺️ Arquitetura

```
                Cloudflare Tunnel (TLS termina aqui)
                       │
                       │  nexus.arasaka.fun  *  →  http://localhost:8400
                       ▼
       ┌───────────────────────────────────────┐
       │  nexus-nginx (porta 8400 → 80)        │
       │  /api/*    → nexus-backend:8000       │
       │  /admin/*  → nexus-backend:8000       │
       │  /static/* → volume static (admin)    │
       │  /media/*  → volume media             │
       │  /*        → nexus-frontend:3000      │
       └─────────────────┬─────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    nexus-frontend   nexus-backend     nexus-worker
    (Next.js stand)  (Django+Gunicorn) (Celery worker)
                         │              + nexus-beat
                         │
                         └──── DB: postgres-global (rede `pg`)
                         │
                         └──── Cache/Broker: nexus-redis
```

---

## 1. SSH no servidor

```bash
ssh arasaka
```

(Você já tem `~/.ssh/config` com Host `arasaka` apontando pro tunnel via cloudflared.)

---

## 2. Provisionar banco no postgres global

Seguindo o **Guia de Provisionamento** do servidor:

```bash
docker exec -it postgres-global psql -U admin_master
```

Dentro do `psql`:

```sql
CREATE DATABASE nexus;
CREATE USER nexus WITH PASSWORD 'TROQUE_POR_SENHA_FORTE';
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus;

\c nexus
GRANT ALL ON SCHEMA public TO nexus;
\q
```

> ⚠️ Anote a senha — ela vai pra `.env.prod` na próxima etapa.

---

## 3. Clonar o repo no servidor

```bash
mkdir -p ~/projetos && cd ~/projetos
git clone https://github.com/LuizPitohui/arasaka-nexus.git
cd arasaka-nexus
```

---

## 4. Descobrir a rede do postgres global

```bash
docker inspect postgres-global \
  -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Saída esperada: algo tipo `postgres-global_default` ou `postgres_default`. Anote o nome.

---

## 5. Preencher `.env.prod`

```bash
cp .env.prod.example .env.prod
nano .env.prod   # ou seu editor preferido
```

Itens **obrigatórios** pra revisar:

| Variável | Valor |
|---|---|
| `DJANGO_SECRET_KEY` | `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DB_PASSWORD` | mesma senha do passo 2 |
| `POSTGRES_NETWORK` | nome obtido no passo 4 |
| `MANGADEX_USER_AGENT` | inclui seu email/contato real |

---

## 6. Build + up

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Primeira build leva ~5min (multi-stage do Next.js + collectstatic do Django).

Verifica se subiu tudo:

```bash
docker compose -f docker-compose.prod.yml ps
```

Esperado: `nexus-redis`, `nexus-backend`, `nexus-worker`, `nexus-beat`, `nexus-frontend`, `nexus-nginx` todos `Up`.

Logs do backend pra confirmar que migrations aplicaram e gunicorn está escutando:

```bash
docker logs -f nexus-backend
```

---

## 7. Criar superuser admin/admin (descartável)

```bash
docker exec -i nexus-backend python manage.py shell -c "
from django.contrib.auth import get_user_model
U = get_user_model()
U.objects.filter(username='admin').delete()
U.objects.create_superuser(username='admin', email='admin@nexus.local', password='admin')
print('CRIADO')
"
```

> ⚠️ Senha `admin` só passa porque `create_superuser` pula validators. **Apague esse user** depois de criar o seu de verdade pelo `/api/auth/register/`.

---

## 8. Smoke test interno (no servidor)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8400/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8400/api/home-data/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8400/admin/login/
```

Esperado: `200, 200, 200`.

---

## 9. Configurar Cloudflare Tunnel

Adicione no painel do Cloudflare Tunnel (mesma forma que `terminal.arasaka.fun`, `gacconnect`, etc):

| # | Subdomain | Path | Service |
|---|---|---|---|
| ✚ | `nexus.arasaka.fun` | `*` | `http://localhost:8400` |

Salve. Em até 30 segundos `https://nexus.arasaka.fun` resolve.

---

## 10. Smoke test público

```
https://nexus.arasaka.fun/                     → home com hero, status 200
https://nexus.arasaka.fun/api/home-data/       → JSON
https://nexus.arasaka.fun/admin/login/         → Django admin
https://nexus.arasaka.fun/login                → tela de boot do agent terminal
```

Login com `admin` / `admin`. Apaga esse user assim que criar o seu real.

---

## 🛠️ Operação

### Logs
```bash
docker compose -f docker-compose.prod.yml logs -f --tail 100 backend
docker compose -f docker-compose.prod.yml logs -f --tail 100 worker
docker compose -f docker-compose.prod.yml logs -f --tail 100 beat
docker compose -f docker-compose.prod.yml logs -f --tail 100 nginx
```

### Atualizar pra última versão
```bash
cd ~/projetos/arasaka-nexus
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Rodar migrations manualmente (caso necessário)
```bash
docker exec -i nexus-backend python manage.py migrate
```

### Popular catálogo (varredura temporal)
```bash
docker exec -d nexus-backend python manage.py seed_library --start-date 2020-01-01T00:00:00
```

### Parar tudo (preserva dados, postgres não é nosso)
```bash
docker compose -f docker-compose.prod.yml stop
```

### Apagar containers (preserva volumes media/static)
```bash
docker compose -f docker-compose.prod.yml down
```

### Limpar volumes (apaga capas + páginas mirroradas — destructive)
```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## 🔒 Segurança em produção — o que `.env.prod` ativa

Quando `DJANGO_DEBUG=0`, o Django liga automaticamente:
- HSTS 1 ano (`SECURE_HSTS_SECONDS=31536000`)
- `SECURE_CONTENT_TYPE_NOSNIFF`
- `X_FRAME_OPTIONS=DENY`
- `SESSION_COOKIE_SECURE` + `CSRF_COOKIE_SECURE`
- `SECURE_PROXY_SSL_HEADER=X-Forwarded-Proto` (Cloudflare termina TLS, nginx propaga o header)
- `SECURE_SSL_REDIRECT=1` por padrão (deixei `0` no env porque o tunnel já é HTTPS)

DRF mantém:
- `IsAuthenticatedOrReadOnly` global
- `IsAdminOrReadOnly` em ViewSets de catálogo
- Throttling: `1200/min` user, `200/min` anon, `30/min` search, `10/min` import
- JWT com rotação + blacklist após rotação

---

## 🧯 Troubleshooting rápido

**`nexus-backend` reinicia em loop:**
```bash
docker logs nexus-backend | tail -30
```
Causa comum: `DJANGO_SECRET_KEY` vazio, ou `DB_HOST=postgres-global` mas a rede `pg` não está conectando. Confirme `POSTGRES_NETWORK` no `.env.prod`.

**`nexus-frontend` 502 no `/`:**
O build falhou ou o `NEXT_PUBLIC_API_URL` não foi passado no build. Rebuild com:
```bash
docker compose -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.prod.yml up -d
```

**Cover não aparece:**
Beat só executa o job `mirror-covers` a cada 30min. Para forçar:
```bash
docker exec nexus-backend python manage.py shell -c "
from employees.tasks import task_mirror_covers
task_mirror_covers.delay()
"
```

**Cloudflare 521:**
Significa que o tunnel não consegue alcançar `localhost:8400`. Verifique:
```bash
ss -tlnp | grep 8400   # nexus-nginx deve estar escutando
docker ps | grep nexus-nginx
```
