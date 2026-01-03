# 🏢 Arasaka Nexus - Employee Management System

> "Secure Database // Authorized Personnel Only"

![Dashboard Preview](screenshots/dashboard.png)

## 📋 Sobre o Projeto

O **Arasaka Nexus** é um sistema Full Stack de gerenciamento de funcionários com temática Cyberpunk/Corporativa. O projeto foi desenvolvido para demonstrar a integração segura entre um Frontend moderno e reativo com um Backend robusto em containers.

O sistema permite autenticação segura via JWT, operações de CRUD completas, upload de arquivos (fotos de perfil) e visualização de dados em tempo real, tudo orquestrado via Docker.

## 🚀 Tecnologias Utilizadas

### Frontend (Client-side)
- **Framework:** [Next.js 16](https://nextjs.org/) (App Router & Server Components)
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS (Cyberpunk Aesthetic)
- **Feedback Visual:** Sonner (Toasts Notifications)
- **HTTP Client:** Fetch API (Native)

### Backend (Server-side)
- **Framework:** Django 5 & Django REST Framework (DRF)
- **Segurança:** SimpleJWT (Authentication & Token Refresh)
- **Gerenciamento de Pacotes:** Poetry
- **Database:** PostgreSQL
- **Mídia:** Pillow (Image Processing)

### Infraestrutura & DevOps
- **Containerização:** Docker & Docker Compose
- **Volumes:** Persistência de dados (Postgres) e Mídia (Uploads)

---

## ✨ Funcionalidades

- 🔐 **Autenticação JWT:** Login seguro com Access e Refresh Tokens.
- 👥 **Gestão de Pessoal:** Cadastro, Edição (PATCH), e Exclusão (Soft Delete simulado) de funcionários.
- 📸 **Upload de Imagens:** Armazenamento e recuperação de fotos de perfil via Docker Volumes.
- 📊 **Dashboard Interativo:** Estatísticas e Logs de atividade simulados.
- 🔍 **Busca em Tempo Real:** Filtragem instantânea de funcionários (Debounce search).
- 🛡️ **Proteção de Rotas:** Middleware no Frontend para proteger páginas privadas.
- 📱 **Responsivo:** Layout adaptado para Desktop e Mobile.

---

## 📸 Screenshots

| Login Screen | Employee Card |
|:---:|:---:|
| ![Login](screenshots/login.png) | ![Card](screenshots/card_with_photo.png) |

---

## 🔧 Como Rodar o Projeto

### Pré-requisitos
- Docker & Docker Compose instalados.
- Git instalado.

### 1. Clonar o repositório
```bash
git clone [https://github.com/SEU-USUARIO/arasaka-nexus.git](https://github.com/SEU-USUARIO/arasaka-nexus.git)
cd arasaka-nexus
2. Configurar o Ambiente
O projeto utiliza Docker, então não é necessário instalar Python ou Node.js localmente. Basta rodar o comando de orquestração:

Bash

docker-compose up --build
Aguarde alguns minutos enquanto o Docker baixa as imagens e instala as dependências.

3. Migrar o Banco de Dados
Com os containers rodando, abra um novo terminal e execute as migrações do Django:

Bash

docker-compose run --rm backend python manage.py migrate
4. Acessar
Frontend: http://localhost:3000

Backend API: http://localhost:8000/api/

📂 Estrutura do Projeto
arasaka-nexus/
├── frontend/          # Next.js Application
│   ├── src/app/       # Pages & Layouts
│   ├── src/components/# Reusable UI Components
│   └── Dockerfile
├── backend/           # Django API
│   ├── config/        # Settings & URLs
│   ├── employees/     # App Logic
│   └── pyproject.toml # Poetry Dependencies
├── docker-compose.yml # Orchestration
└── README.md          # Documentation
👨‍💻 Autor
Luiz Fernando

Frontend Developer & Computer Engineering Student

LinkedIn

GitHub