# Multi-stage build: install ZK toolchain + build Next.js standalone app
# nargo 1.0.0-beta.19 + bb 1.2.0 (must match local versions)
#
# Build context = repository root (required).
#   docker build -f Dockerfile .
# Railway: Root Directory blank; dockerfilePath = Dockerfile.
# Do NOT set Root Directory to "web" — COPY web/ and COPY zk/circuits/ need the monorepo root.

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

# Pre-compile circuits to cache git dependencies.
# main.nr = withdraw → with_foundry.json; deposit.nr → deposit_circuit.json (required by depositProver).
WORKDIR /app
COPY zk/circuits/ ./zk/circuits/
RUN cd zk/circuits && \
  nargo compile && test -f target/with_foundry.json || (echo "Missing target/with_foundry.json; ensure main.nr is the withdraw circuit" && exit 1) && \
  cp src/main.nr src/main.nr.bak && \
  cp src/deposit.nr src/main.nr && \
  cp Nargo.toml Nargo.toml.bak && \
  sed -i 's/name="with_foundry"/name="deposit_circuit"/' Nargo.toml && \
  nargo compile && \
  mv src/main.nr.bak src/main.nr && \
  mv Nargo.toml.bak Nargo.toml && \
  test -f target/deposit_circuit.json || (echo "Missing target/deposit_circuit.json after deposit compile" && exit 1)

# Build Next.js
# Railway passes env vars as build args automatically when declared with ARG
ARG NEXT_PUBLIC_PARA_API_KEY
ENV NEXT_PUBLIC_PARA_API_KEY=${NEXT_PUBLIC_PARA_API_KEY}

ARG NEXT_PUBLIC_BLIZ_ENV
ENV NEXT_PUBLIC_BLIZ_ENV=${NEXT_PUBLIC_BLIZ_ENV}

ARG NEXT_PUBLIC_DEFAULT_CHAIN
ENV NEXT_PUBLIC_DEFAULT_CHAIN=${NEXT_PUBLIC_DEFAULT_CHAIN}

ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}

# Alchemy AA / Gas Manager — must be ARG+ENV here or Next.js inlines empty strings
# into the client bundle (Railway only injects service vars as Docker build-args when
# declared as ARG). Without these, claim always falls back to EOA and needs native gas.
ARG NEXT_PUBLIC_ALCHEMY_API_KEY
ENV NEXT_PUBLIC_ALCHEMY_API_KEY=${NEXT_PUBLIC_ALCHEMY_API_KEY}

ARG NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID
ENV NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=${NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID}

# Protocol fee UI quotes (bps). Must match on-chain PoolRouter.feeBps.
# Prefer NEXT_PUBLIC_PROTOCOL_FEE_BPS; if unset, mirror Foundry FEE_BPS so Railway
# operators who only set the deploy var still get the correct % in the client bundle.
ARG FEE_BPS=
ARG NEXT_PUBLIC_FEE_BPS=
ARG NEXT_PUBLIC_PROTOCOL_FEE_BPS=
ENV FEE_BPS=${FEE_BPS}
ENV NEXT_PUBLIC_FEE_BPS=${NEXT_PUBLIC_FEE_BPS}
ENV NEXT_PUBLIC_PROTOCOL_FEE_BPS=${NEXT_PUBLIC_PROTOCOL_FEE_BPS}

# PoolRouter addresses — without these, the UI treats fee as 0% (direct pool deposits).
ARG NEXT_PUBLIC_CELO_ROUTER_ADDRESS=
ENV NEXT_PUBLIC_CELO_ROUTER_ADDRESS=${NEXT_PUBLIC_CELO_ROUTER_ADDRESS}
ARG NEXT_PUBLIC_MONAD_ROUTER_ADDRESS=
ENV NEXT_PUBLIC_MONAD_ROUTER_ADDRESS=${NEXT_PUBLIC_MONAD_ROUTER_ADDRESS}
ARG NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS=
ENV NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS=${NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS}

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Resolve fee for Next inlining: PROTOCOL > NEXT_PUBLIC_FEE_BPS > FEE_BPS (deploy).
RUN PROTOCOL_FEE="${NEXT_PUBLIC_PROTOCOL_FEE_BPS:-${NEXT_PUBLIC_FEE_BPS:-${FEE_BPS}}}" && \
  if [ -n "$PROTOCOL_FEE" ]; then export NEXT_PUBLIC_PROTOCOL_FEE_BPS="$PROTOCOL_FEE"; fi && \
  npm run build

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

# Circuits first, then standalone — Docker COPY merges and must not wipe zk/
WORKDIR /app
COPY --from=builder /app/zk/circuits/ ./zk/circuits/
# Belt-and-suspenders: also expose at /app/circuits for older docs/configs
COPY --from=builder /app/zk/circuits/ ./circuits/

RUN mkdir -p ./zk/circuits/proofs ./circuits/proofs

# Copy Next.js standalone output (server.js lives at /app)
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static
COPY --from=builder /app/web/public ./public
# Honk worker (child process). Not always inside standalone file tracing.
COPY --from=builder /app/web/scripts/prove-worker.mjs ./scripts/prove-worker.mjs

# Fail the image build if circuits vanished (e.g. bad COPY order / empty standalone zk/)
RUN test -f /app/zk/circuits/Nargo.toml && \
  test -f /app/zk/circuits/target/deposit_circuit.json && \
  test -f /app/zk/circuits/target/with_foundry.json && \
  test -f /app/scripts/prove-worker.mjs

WORKDIR /app
ENV CIRCUITS_DIR=/app/zk/circuits
ENV PROVE_WORKER_IDLE_MS=45000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
