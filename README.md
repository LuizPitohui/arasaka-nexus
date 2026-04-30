# 📖 Arasaka Nexus - Manga Library & Reader

> "Knowledge Vault // Direct Stream from the Grid"

![Home Preview](screenshots/dashboard.png)

## 📋 Sobre o Projeto

O **Arasaka Nexus** é uma biblioteca digital de mangás com leitor integrado e estética Cyberpunk. O sistema se conecta à API pública do **MangaDex** para buscar, importar e ler mangás diretamente na aplicação — combinando um catálogo local persistente com streaming sob demanda das páginas hospedadas no MangaDex.

A arquitetura mistura um **frontend reativo** em Next.js, um **backend assíncrono** em Django + Celery, e um **broker Redis** para enfileirar importações pesadas em background — tudo orquestrado via Docker Compose.

## 🚀 Tecnologias Utilizadas

### Frontend (Client-side)
- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Runtime:** React 19.2
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS 4 (Cyberpunk Aesthetic)
- **Ícones:** Lucide React
- **Gráficos:** Recharts
- **Feedback Visual:** Sonner (Toasts)

### Backend (Server-side)
- **Framework:** Django 6 + Django REST Framework
- **Autenticação:** SimpleJWT (Access + Refresh Tokens)
- **Database:** PostgreSQL 15
- **Mídia:** Pillow
- **Gerenciador de Pacotes:** Poetry

### Sistema Assíncrono
- **Task Queue:** Celery 5
- **Broker / Result Backend:** Redis 7
- **Persistência de Resultados:** django-celery-results

### Integração Externa
- **API MangaDex:** busca de mangás, sincronização de capítulos e streaming de páginas

### Infraestrutura & DevOps
- **Containerização:** Docker & Docker Compose (5 serviços: `frontend`, `backend`, `celery`, `db`, `redis`)
- **Volumes:** persistência de Postgres e mídias (capas e páginas baixadas)

---

## ✨ Funcionalidades

- 🌐 **Busca Híbrida (Omni-Search):** consulta simultânea no catálogo local e na API do MangaDex, deduplicando resultados.
- ⚡ **Importação Assíncrona:** ao importar um mangá, o backend responde em milissegundos (HTTP 202) e o Celery worker processa metadados e capítulos em background com **retry automático** em caso de falha de rede.
- 📚 **Catálogo Local:** mangás, categorias e capítulos persistidos no Postgres com vínculo ao `mangadex_id` para sincronização incremental.
- 📖 **Leitor Híbrido:** páginas servidas localmente quando já baixadas, ou em **streaming direto do MangaDex** (via endpoint `at-home/server`) quando ainda não cacheadas.
- ⏪ **Navegação Prev/Next:** o leitor calcula automaticamente o capítulo anterior e o próximo dentro do mesmo mangá.
- 🏠 **Home Inteligente (Protocolo Genesis):** se o banco tiver menos de 5 mangás, a Home dispara uma população automática com os títulos populares do MangaDex.
- 🔐 **Autenticação JWT:** endpoints `token/` e `token/refresh/` para login e renovação de sessão.
- 🕰️ **Varredura Temporal:** comando de management `seed_library` que percorre o MangaDex em ordem cronológica de criação, importando lotes de 100 mangás por vez.
- 🛡️ **Filtragem de Conteúdo:** suporte a filtros de `contentRating` e idiomas disponíveis (pt-br, en).

---

## 🏗️ Arquitetura

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Next.js   │◄───────►│   Django    │◄───────►│  PostgreSQL │
│  (Frontend) │  REST   │  (Backend)  │   ORM   │             │
└─────────────┘         └──────┬──────┘         └─────────────┘
                               │
                               │ .delay()
                               ▼
                        ┌─────────────┐         ┌─────────────┐
                        │    Redis    │◄───────►│   Celery    │
                        │  (Broker)   │  tasks  │   Worker    │
                        └─────────────┘         └──────┬──────┘
                                                       │
                                                       ▼
                                                ┌─────────────┐
                                                │  MangaDex   │
                                                │     API     │
                                                └─────────────┘
```

---

## 🔧 Como Rodar o Projeto

### Pré-requisitos
- Docker & Docker Compose instalados
- Git instalado

### 1. Clonar o repositório
```bash
git clone https://github.com/SEU-USUARIO/arasaka-nexus.git
cd arasaka-nexus
```

### 2. Configurar variáveis de ambiente
Copie o `.env.example` da raiz e do frontend, depois ajuste valores:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

Gere uma `DJANGO_SECRET_KEY` própria:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

E coloque-a no `.env` antes de subir os containers — o backend recusa iniciar sem ela.
Ajuste também `MANGADEX_USER_AGENT` para incluir um contato real (a MangaDex bloqueia clientes sem identificação).

### 3. Subir os containers
```bash
docker-compose up --build
```

Isso inicializa **5 serviços**: `frontend`, `backend`, `celery` worker, `db` (Postgres) e `redis`.
O backend roda `migrate --noinput` automaticamente no boot.

### 4. (Opcional) Criar superusuário
```bash
docker-compose run --rm backend python manage.py createsuperuser
```

### 5. (Opcional) Popular o catálogo
A Home dispara população automática quando o banco está vazio (Protocolo Genesis), mas você também pode rodar manualmente:

```bash
# Importação completa cronológica a partir de uma data
docker-compose run --rm backend python manage.py seed_library --start-date 2020-01-01T00:00:00

# Sincronização de mangá específico ou capítulos
docker-compose run --rm backend python manage.py sync_manga
docker-compose run --rm backend python manage.py sync_chapters
```

### 6. Acessar
- **Frontend:** http://localhost:3000
- **API:** http://localhost:8000/api/
- **Admin Django:** http://localhost:8000/admin/

---

## 🛣️ Endpoints Principais

| Método | Rota                              | Descrição                                          |
|--------|-----------------------------------|----------------------------------------------------|
| GET    | `/api/home-data/`                 | Vitrine da Home (destaques + recentes)             |
| GET    | `/api/search/?q=<termo>`          | Busca híbrida (local + MangaDex)                   |
| POST   | `/api/import/`                    | Dispara importação assíncrona (retorna `task_id`)  |
| GET    | `/api/mangas/`                    | CRUD de mangás                                     |
| GET    | `/api/categories/`                | CRUD de categorias                                 |
| GET    | `/api/chapters/?manga=<id>`       | Lista capítulos de um mangá                        |
| GET    | `/api/read/<chapter_id>/`         | Páginas + navegação prev/next do capítulo          |
| POST   | `/api/token/`                     | Login (obtém access + refresh)                     |
| POST   | `/api/token/refresh/`             | Renova o access token                              |
| POST   | `/api/auth/register/`             | Cadastro de novo usuário                           |
| POST   | `/api/auth/logout/`               | Logout server-side (blacklist do refresh token)    |
| GET    | `/api/auth/me/`                   | Dados do usuário autenticado                       |

---

## 📂 Estrutura do Projeto

```
arasaka-nexus/
├── frontend/                     # Next.js 16
│   ├── src/app/
│   │   ├── page.tsx              # Home (vitrine + busca)
│   │   ├── login/                # Tela de autenticação
│   │   ├── manga/[id]/           # Detalhes do mangá
│   │   └── read/[chapterId]/     # Leitor de páginas
│   ├── src/components/           # MangaCard, SearchBar, etc.
│   └── Dockerfile
├── backend/                      # Django 6 + DRF
│   ├── config/
│   │   ├── settings.py
│   │   ├── celery.py             # App Celery
│   │   └── urls.py
│   ├── employees/                # App principal (legado de nome — contém Manga/Chapter)
│   │   ├── models.py             # Manga, Category, Chapter, ChapterImage
│   │   ├── services.py           # MangaDexScanner, get_mangadex_pages
│   │   ├── tasks.py              # Celery tasks com retry
│   │   ├── views.py              # ViewSets + endpoints customizados
│   │   └── management/commands/  # seed_library, sync_manga, sync_chapters
│   └── pyproject.toml
├── docker-compose.yml            # 5 serviços orquestrados
└── README.md
```

> ℹ️ **Nota:** o app Django ainda se chama `employees` por motivos históricos — o projeto começou como um sistema de gestão de pessoal e foi pivotado para biblioteca de mangás. Os modelos atuais (`Manga`, `Chapter`, `ChapterImage`, `Category`) refletem o escopo real.

---

## 🔬 Detalhes Técnicos

### Cliente MangaDex centralizado
Toda comunicação com a API externa passa por [`backend/employees/mangadex_client.py`](backend/employees/mangadex_client.py).
O cliente:
- Aplica um **rate limiter token-bucket no Redis** (Lua atômico) compartilhado entre todos os workers Celery e o servidor web.
- Respeita o **limite global (~5 req/s, configurado para 4 com folga)** e o **limite específico do endpoint `/at-home/server` (40/min, configurado para 35)**.
- Envia **User-Agent customizado** (obrigatório pela MangaDex).
- Retry com backoff exponencial em erros 5xx/conexão e respeita o header **`Retry-After`** em 429.
- **Cacheia o `/at-home/server`** em Redis por 10 min — esse é o endpoint mais sensível porque é hit a cada virada de capítulo no leitor.

### Segurança
- `DJANGO_SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` lidos do `.env` (o backend recusa iniciar sem `SECRET_KEY`).
- DRF com `IsAuthenticatedOrReadOnly` global; `MangaViewSet`/`CategoryViewSet`/`ChapterViewSet` exigem `is_staff` para escrita.
- Throttling DRF em escopos específicos: `search` (30/min), `import` (10/min) + globais `anon` (60/min) e `user` (240/min).
- JWT com `ROTATE_REFRESH_TOKENS=True` e `BLACKLIST_AFTER_ROTATION=True` — logout faz blacklist server-side.
- Hardening em produção (`DEBUG=0`): HSTS, SSL redirect, `SECURE_PROXY_SSL_HEADER`, cookies seguros.

### Importação Assíncrona com Retry
A task `task_import_manga_chapters` ([employees/tasks.py](backend/employees/tasks.py)) trata especificamente:
- `RateLimitExceeded` do cliente → retry em 30s
- `HTTPError 429` → retry em 60s (após o cliente já ter respeitado `Retry-After`)
- `HTTPError 5xx` → retry em 30s
- Erro de rede → retry em 60s
- Erro fatal não-recuperável → loga e desiste

### Genesis Protocol assíncrono
Quando a Home detecta menos de 5 mangás, em vez de bloquear o request HTTP, dispara `task_seed_initial_library` — protegido por **lock Redis** para evitar duplicação se múltiplos clientes baterem na home ao mesmo tempo.

### Leitor Híbrido
Em [employees/views.py](backend/employees/views.py), o endpoint `get_chapter_pages`:
1. Procura imagens locais em `ChapterImage` (`source = "LOCAL"`).
2. Se não houver, faz fetch da API MangaDex `at-home/server` via cliente centralizado (com cache Redis e rate limit) (`source = "MANGADEX_STREAM"`).

---

## 🧪 Testes

A suíte de testes do backend é integrada ao Django (`django.test` + `rest_framework.test`), sem dependências extras. O cache é forçado para `LocMemCache` durante os testes e todas as chamadas à MangaDex são mockadas — nenhum teste toca a rede real.

```bash
# Rodar todos os testes (dentro do container)
docker-compose run --rm backend python manage.py test

# Por app específico
docker-compose run --rm backend python manage.py test employees
docker-compose run --rm backend python manage.py test accounts

# Verbose com tempo
docker-compose run --rm backend python manage.py test -v 2
```

**Cobertura atual:**
- [employees/tests.py](backend/employees/tests.py): autenticação (register, login, logout/blacklist, me), `MangaViewSet` (filtros, permissões, popular/random), categorias com contagem, busca híbrida, `import_manga` (auth + dispatch Celery), `home_content` (Genesis async), reader (LOCAL vs MANGADEX_STREAM), scanner com cliente mockado.
- [accounts/tests.py](backend/accounts/tests.py): Profile (signal de criação, GET/PATCH, validação), Favorites (CRUD, isolamento por usuário), ReadingList (criação, add/remove manga, isolamento), ReadingProgress (upsert, continue endpoint), library overview.

---

## 👨‍💻 Autor

**Luiz Fernando**

Frontend Developer & Computer Engineering Student

[LinkedIn](#) · [GitHub](#)
