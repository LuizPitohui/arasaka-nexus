# Usa a versão robusta do Python
FROM python:3.12

# Configurações de ambiente
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Instala o Poetry
RUN pip install --upgrade pip
RUN pip install poetry

# Copia APENAS os arquivos de configuração primeiro
COPY pyproject.toml poetry.lock* /app/

# CORREÇÃO DEFINITIVA:
# Adicionamos '--no-root'.
# Isso diz: "Instale as libs, mas ignore o README e o projeto por enquanto."
RUN poetry config virtualenvs.create false \
    && poetry lock \
    && poetry install --no-interaction --no-ansi --no-root

# Copia o restante do código (agora sim o README vem junto, mas não precisamos mais dele pra instalar)
COPY . /app/

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]