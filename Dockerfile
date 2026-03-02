# Multi-stage build: install ZK toolchain + build Next.js standalone app
# nargo 1.0.0-beta.18 + bb 0.63.1 (must match local versions)

# ── Stage 1: Builder ─────────────────────────────────────
FROM node:20-bookworm AS builder

# Install nargo (Noir compiler/executor)
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:${PATH}"
RUN noirup -v 1.0.0-beta.18

# Install bb (Barretenberg prover)
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
ENV PATH="/root/.bb:${PATH}"
RUN bbup -v 0.63.1

# Pre-compile circuit to cache git dependencies
WORKDIR /app
COPY zk/circuits/ ./zk/circuits/
RUN cd zk/circuits && nargo compile

# Build Next.js
# Railway passes env vars as build args automatically when declared with ARG
ARG NEXT_PUBLIC_PARA_API_KEY
ENV NEXT_PUBLIC_PARA_API_KEY=${NEXT_PUBLIC_PARA_API_KEY}

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────
FROM node:20-bookworm AS runner

# bb requires libc++ (LLVM C++ runtime)
RUN apt-get update && apt-get install -y --no-install-recommends libc++1 && rm -rf /var/lib/apt/lists/*

# Copy nargo + bb with their full home dirs (includes dependency cache)
COPY --from=builder /root/.nargo /root/.nargo
COPY --from=builder /root/.bb /root/.bb
ENV PATH="/root/.nargo/bin:/root/.bb:${PATH}"

# Copy circuit files (source + compiled artifact + cached deps)
WORKDIR /app
COPY --from=builder /app/zk/circuits/ ./circuits/

# Create writable dirs for proof generation temp files
RUN mkdir -p ./circuits/proofs

# Copy Next.js standalone output
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static
COPY --from=builder /app/web/public ./public

ENV CIRCUITS_DIR=/app/circuits
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
