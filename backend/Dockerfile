# backend/Dockerfile

# Usa uma imagem oficial leve do Python
FROM python:3.12-slim

# Define variáveis de ambiente para evitar arquivos .pyc e logs presos no buffer
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instala dependências do sistema necessárias para compilar pacotes Python
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Instala o Poetry
RUN pip install poetry

# Copia os arquivos de dependência
COPY pyproject.toml poetry.lock ./

# Configura o Poetry para não criar virtualenv (o container JÁ É o ambiente isolado)
RUN poetry config virtualenvs.create false \
    && poetry install --no-root --no-interaction --no-ansi

# Copia o restante do código do projeto
COPY . .

# Comando padrão para rodar o servidor (exposto para todas as interfaces)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]