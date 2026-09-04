# Multi-stage Dockerfile for SuperAgent HomeLab / Server deployment on port 1469

# Stage 1: Build Rust Core Daemon
FROM rust:1.80-alpine AS rust-builder
WORKDIR /app
RUN apk add --no-cache musl-dev gcc make pkgconfig openssl-dev
COPY Cargo.toml Cargo.lock ./
COPY packages/core_v2 ./packages/core_v2
# Create dummy package manifests for remaining workspace members
RUN mkdir -p packages/desktop/src-tauri packages/cli packages/circle-search-native packages/dictation-native && \
    echo '[package]' > packages/desktop/src-tauri/Cargo.toml && echo 'name = "superagent-desktop"' >> packages/desktop/src-tauri/Cargo.toml && echo 'version = "0.44.0"' >> packages/desktop/src-tauri/Cargo.toml && echo 'edition = "2021"' >> packages/desktop/src-tauri/Cargo.toml && \
    echo '[package]' > packages/cli/Cargo.toml && echo 'name = "superagent-cli"' >> packages/cli/Cargo.toml && echo 'version = "0.44.0"' >> packages/cli/Cargo.toml && echo 'edition = "2021"' >> packages/cli/Cargo.toml && \
    echo '[package]' > packages/circle-search-native/Cargo.toml && echo 'name = "superagent-circle-native"' >> packages/circle-search-native/Cargo.toml && echo 'version = "0.44.0"' >> packages/circle-search-native/Cargo.toml && echo 'edition = "2021"' >> packages/circle-search-native/Cargo.toml && \
    echo '[package]' > packages/dictation-native/Cargo.toml && echo 'name = "superagent-dictation-native"' >> packages/dictation-native/Cargo.toml && echo 'version = "0.44.0"' >> packages/dictation-native/Cargo.toml && echo 'edition = "2021"' >> packages/dictation-native/Cargo.toml
RUN cargo build --release --bin superagent-core-daemon

# Stage 2: Build Shared UI
FROM node:20-alpine AS node-builder
WORKDIR /app
COPY package*.json ./
COPY packages/ui ./packages/ui
RUN npm ci
RUN npm run build --workspace=@superagent/ui

# Stage 3: Production Runtime Container
FROM alpine:3.20 AS runner
WORKDIR /app
RUN apk add --no-cache ca-certificates libgcc tzdata && \
    addgroup -g 1000 superagent && \
    adduser -u 1000 -G superagent -s /bin/sh -D superagent

ENV PORT=1469
ENV HOST=0.0.0.0
ENV HOME=/home/superagent

COPY --from=rust-builder /app/target/release/superagent-core-daemon /usr/local/bin/superagent-core-daemon
RUN ln -sf /usr/local/bin/superagent-core-daemon /usr/local/bin/superagent && \
    chmod +x /usr/local/bin/superagent-core-daemon

COPY --from=node-builder /app/packages/ui/dist /app/ui-dist

RUN chown -R superagent:superagent /app /home/superagent

USER superagent:superagent

EXPOSE 1469

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:1469/api/health || exit 1

CMD ["superagent-core-daemon", "--server", "--port", "1469", "--host", "0.0.0.0", "--ui-dir", "/app/ui-dist"]
