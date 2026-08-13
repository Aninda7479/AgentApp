# Multi-stage Dockerfile for SuperAgent HomeLab / Server deployment on port 1469

# Stage 1: Build Rust Core Daemon
FROM rust:1.80-alpine AS rust-builder
WORKDIR /app
RUN apk add --no-co-cache musl-dev gcc
COPY packages/core_v2 ./packages/core_v2
WORKDIR /app/packages/core_v2
RUN cargo build --release --bin superagent-core-daemon

# Stage 2: Build Web Server & Shared UI
FROM node:20-alpine AS node-builder
WORKDIR /app
COPY package*.json ./
COPY packages/ui ./packages/ui
COPY packages/core ./packages/core
COPY packages/web ./packages/web
RUN npm ci
RUN npm run build --workspace=@superagent/ui
RUN npm run build --workspace=@superagent/web

# Stage 3: Production Runtime Container
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=1469
ENV HOST=0.0.0.0

COPY --from=rust-builder /app/packages/core_v2/target/release/superagent-core-daemon /usr/local/bin/superagent-core-daemon
COPY --from=node-builder /app/package*.json ./
COPY --from=node-builder /app/packages/web/dist ./packages/web/dist
COPY --from=node-builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=node-builder /app/node_modules ./node_modules

EXPOSE 1469

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:1469/api/health || exit 1

CMD ["node", "packages/web/dist/server.js"]
