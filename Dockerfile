# Stage 1 — build
FROM node:22.14.0-bullseye-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY . .
# Baked into the JS bundle at build time — Vite only exposes VITE_-prefixed
# vars via import.meta.env, and only as of whatever they're set to right
# now, not read at container runtime. Override via docker-compose's build
# args (see docker-compose.yml) when the API isn't on the same host as this
# frontend; the default matches the single-host docker-compose setup this
# always ran on, so omitting it changes nothing.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2 — serve
FROM nginx:1.27.4 AS server
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
