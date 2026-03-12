# Multi-stage build: install ZK toolchain + build Next.js standalone app
# nargo 1.0.0-beta.19 + bb 1.2.0 (must match local versions)

# ── Stage 1: Builder ─────────────────────────────────────
# Use Ubuntu 24.04 so glibc is new enough for bb
FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Base tools, git and build deps
RUN apt-get update && apt-get install -y \
  curl \
  ca-certificates \
  git \
  build-essential \
  pkg-config \
  libssl-dev \
  gnupg && \
  rm -rf /var/lib/apt/lists/*

# Install Node.js 22 from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get update && apt-get install -y nodejs && \
  rm -rf /var/lib/apt/lists/*

# Install nargo (Noir compiler/executor)
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:${PATH}"
RUN noirup -v 1.0.0-beta.19

# Install bb (Barretenberg prover)
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
ENV PATH="/root/.bb:${PATH}"
RUN bbup -v 1.2.0

# Pre-compile circuit to cache git dependencies (main.nr must be the withdraw circuit)
WORKDIR /app
COPY zk/circuits/ ./zk/circuits/
RUN cd zk/circuits && nargo compile && test -f target/with_foundry.json || (echo "Missing target/with_foundry.json; ensure main.nr is the withdraw circuit" && exit 1)

# Build Next.js
# Railway passes env vars as build args automatically when declared with ARG
ARG NEXT_PUBLIC_PARA_API_KEY
ENV NEXT_PUBLIC_PARA_API_KEY=${NEXT_PUBLIC_PARA_API_KEY}

ARG NEXT_PUBLIC_BLIZ_ENV
ENV NEXT_PUBLIC_BLIZ_ENV=${NEXT_PUBLIC_BLIZ_ENV}

ARG NEXT_PUBLIC_DEFAULT_CHAIN
ENV NEXT_PUBLIC_DEFAULT_CHAIN=${NEXT_PUBLIC_DEFAULT_CHAIN}

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────
FROM ubuntu:24.04 AS runner

ENV DEBIAN_FRONTEND=noninteractive

# Node 22 (to run server.js) + git (for potential scripts) + bb deps (libc++, jq)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  git \
  libc++1 \
  jq && \
  rm -rf /var/lib/apt/lists/* && \
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get update && apt-get install -y --no-install-recommends nodejs && \
  rm -rf /var/lib/apt/lists/*

# Copy circuit files to same path as builder so the backend can load with_foundry.json
WORKDIR /app
COPY --from=builder /app/zk/circuits/ ./zk/circuits/

# Create writable dirs for proof generation temp files
RUN mkdir -p ./zk/circuits/proofs

# Copy Next.js standalone output
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static
COPY --from=builder /app/web/public ./public

ENV CIRCUITS_DIR=/app/zk/circuits
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
