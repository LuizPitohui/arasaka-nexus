# ⛩️ Arasaka Nexus

**Arasaka Nexus** é uma plataforma de leitura e catalogação de mangás de alta performance. Projetada com uma arquitetura orientada a serviços, a plataforma espelha e consome dados da API da MangaDex através de processos de Extração, Transformação e Carga (ETL) executados em background, garantindo que a navegação do usuário final seja fluida e sem interrupções.

---

## 🏗️ Arquitetura e Stack Tecnológico

O sistema foi desenhado para escalabilidade, separando a interface de usuário do processamento pesado de dados.

* **Frontend (A Vitrine):** Next.js 16+ (React, Node.js 20+).
* **Backend (O Cérebro):** Django 6.0 + Django REST Framework (Python 3.12+).
* **Database (O Armazém):** PostgreSQL 15.
* **Message Broker (O Mensageiro):** Redis 7.
* **Worker (O Operário):** Celery 5.6 (Processamento assíncrono).
* **Gerenciador de Pacotes:** Poetry (configurado para atuar globalmente dentro dos containers).
* **Infraestrutura:** Docker & Docker Compose.

---

## ⚙️ Pré-requisitos

Para rodar este projeto, você precisará apenas do **Docker** e do **Docker Compose** instalados na sua máquina. Não é necessário instalar Python ou Node localmente, toda a infraestrutura está conteinerizada.

---

## 🚀 Como Iniciar o Projeto (Setup Inicial)

Siga os passos abaixo para erguer a infraestrutura completa em ambiente de desenvolvimento.

### 1. Configuração de Variáveis de Ambiente
Na raiz do projeto, crie um arquivo chamado `.env` e configure as credenciais do banco de dados e dos serviços:

```env
# Configurações do Banco de Dados
DB_NAME=arasaka_nexus
DB_USER=arasaka
DB_PASSWORD=sua_senha_segura
DB_HOST=db
DB_PORT=5432

# Configurações do Celery/Redis
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
2. Construção das Imagens Docker
No terminal, na pasta raiz do projeto, execute o comando para construir e baixar todas as dependências (Front e Back):

Bash
docker-compose up -d --build
3. Execução das Migrações
Com os containers rodando, crie as tabelas no PostgreSQL:

Bash
docker-compose exec backend python manage.py migrate
4. Criação do Superusuário (Opcional, para acesso ao Painel Admin)
Bash
docker-compose exec backend python manage.py createsuperuser
5. Acesso aos Serviços
Frontend (Interface do Usuário): http://localhost:3000

Backend (API & Painel Admin): http://localhost:8000

🛠️ Comandos de Operação e Manutenção
A principal engrenagem do Arasaka Nexus é o seu motor de importação assíncrona. Abaixo estão os comandos essenciais para operar o sistema.

Monitorando os Trabalhadores (Celery)
Para ver os logs de processamento em tempo real (downloads de capítulos e sincronização de metadados):

Bash
docker-compose logs -f celery
O Protocolo Semeador (População do Banco de Dados)
O sistema possui um comando customizado para buscar os mangás mais populares em Português na MangaDex e popular o banco de dados local automaticamente, utilizando paginação inteligente (Smart Batching).

Para injetar dados na plataforma, execute:

Bash
docker-compose exec backend python manage.py seed_library --limit 100
--limit: Define a quantidade máxima de obras a serem buscadas (o comando dividirá a carga em lotes de 100 para respeitar os limites da API externa).

--offset (opcional): Define a partir de qual posição começar a busca.

⚠️ Atenção (Rate Limiting): A API da MangaDex possui limites rígidos. O docker-compose.yml está configurado com --concurrency=2 no serviço do Celery para evitar bloqueios de IP (IP Ban). Não aumente demasiadamente a concorrência se for executar importações massivas (Full Dump).

📂 Estrutura de Diretórios Principal
Plaintext
arasaka-nexus/
│
├── backend/                  # API Django e processamento assíncrono
│   ├── config/               # Configurações principais (settings.py, celery.py)
│   ├── employees/            # Core App: Modelos, Views e Regras de Negócio
│   │   ├── management/       # Comandos de terminal customizados (seed_library.py)
│   │   ├── services.py       # Lógica de integração com a API da MangaDex
│   │   └── tasks.py          # Tarefas assíncronas do Celery (Auto-Retry, etc)
│   ├── pyproject.toml        # Lista de dependências (Poetry)
│   └── Dockerfile            # Construção do container Python
│
├── frontend/                 # Aplicação Next.js
│   ├── src/                  # Componentes e Páginas
│   ├── package.json          # Dependências Node
│   └── Dockerfile            # Construção do container Node
│
├── .env                      # Variáveis de ambiente secretas
└── docker-compose.yml        # Orquestração dos 4 serviços (Front, Back, DB, Redis, Worker)

---

Dessa forma, qualquer desenvolvedor que entrar na equipe vai entender exatamente a magnitude do projeto, como a arquitetura se divide, como os problemas de limite de API foram resolvidos e como operar a máquina. 

Quer que eu faça alguma modificação específica ou adicione alguma nota sobre regras d