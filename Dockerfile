FROM node:22-slim AS ts-builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS py-base

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS runtime

WORKDIR /app

# Node runtime for TypeScript layer
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=ts-builder /app/dist ./dist
COPY --from=ts-builder /app/node_modules ./node_modules
COPY --from=ts-builder /app/package.json ./

# Python environment
COPY --from=py-base /app/.venv ./.venv
COPY brain/ ./brain/
COPY sim/ ./sim/

# Data directory for vault
RUN mkdir -p /data/vault

ENV MIDCLAW_VAULT_PATH=/data/vault
ENV BRAIN_HOST=0.0.0.0
ENV BRAIN_PORT=7432

EXPOSE 7432

# Default: start brain bridge
CMD [".venv/bin/python", "brain/bridge.py"]
