# frontend/Dockerfile

# Usa imagem leve do Node
FROM node:20-alpine

# Define diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência primeiro (para aproveitar cache do Docker)
COPY package.json package-lock.json* ./

# Instala as dependências
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta 3000
EXPOSE 3000

# Comando para rodar em modo de desenvolvimento
CMD ["npm", "run", "dev"]