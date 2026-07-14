# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:18-bookworm-slim AS build
WORKDIR /app

# Install workspace dependencies first (better layer caching).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/desktop/package.json packages/desktop/
COPY packages/web/package.json packages/web/
RUN npm ci

# Copy sources, then build every workspace (core -> cli -> desktop -> web).
COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:18-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# The full workspace (incl. node_modules) is carried over; the web server needs
# @superagent/core and its native deps (sharp/playwright) at runtime.
COPY --from=build /app /app

EXPOSE 3000

# SuperAgent web server (Electron-compatible shared renderer).
# Update in place:  docker pull <image>:latest && docker restart <container>
# Or run with watchtower (https://github.com/containrrr/watchtower) for auto-pull.
CMD ["node", "packages/web/dist/server.js"]
