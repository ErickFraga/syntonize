# Imagem do Syntonize para qualquer host com container (Cloud Run, VM, etc.).
# O deploy oficial continua no Render (render.yaml); isto é uma alternativa.
#
#   docker build -t syntonize .
#   docker run -p 3000:3000 -e REDIS_URL=redis://host:6379 syntonize

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV PORT=3000
# O servidor roda via tsx (devDependency), então as dependências ficam inteiras.
COPY --from=build /app ./
USER node
EXPOSE 3000
# Instância única: as salas vivem na memória do processo (ou no Redis).
CMD ["npm", "start"]
