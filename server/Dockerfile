# Stage 1 — install production dependencies only
FROM node:22.14.0-bullseye-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --frozen-lockfile

# Stage 2 — runtime
FROM node:22.14.0-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server ./server

RUN useradd --uid 1001 --create-home leo \
    && mkdir -p /app/server/data \
    && chown -R leo:leo /app

USER leo
EXPOSE 3001
CMD ["node", "server/index.js"]
