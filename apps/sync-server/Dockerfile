# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# Build the TypeScript source into plain JS that Node can run without tsx.
FROM node:22-alpine AS builder

# Install pnpm globally.
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests first so Docker layer caching works: if only source
# files change (not deps), the expensive pnpm install layer is reused.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json         ./packages/db/
COPY packages/shared/package.json     ./packages/shared/
COPY apps/sync-server/package.json    ./apps/sync-server/

# Install all workspace dependencies (production + dev — we need tsc).
RUN pnpm install --frozen-lockfile

# Copy source.
COPY packages/db/       ./packages/db/
COPY packages/shared/  ./packages/shared/
COPY apps/sync-server/ ./apps/sync-server/

# Generate Prisma client.
RUN pnpm --filter @syncpad/db run generate

# Build shared package first (sync-server depends on it).
RUN pnpm --filter @syncpad/shared run build

# Build db package.
RUN pnpm --filter @syncpad/db run build

# Build sync-server.
RUN pnpm --filter @syncpad/sync-server run build

# ─── Stage 2: Production runner ───────────────────────────────────────────────
# Lean image — only production deps + compiled output.
FROM node:22-alpine AS runner

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests for production-only install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json         ./packages/db/
COPY packages/shared/package.json     ./packages/shared/
COPY apps/sync-server/package.json    ./apps/sync-server/

# Production-only install (no dev deps = smaller image).
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder.
COPY --from=builder /app/packages/db/dist         ./packages/db/dist
COPY --from=builder /app/packages/shared/dist     ./packages/shared/dist
COPY --from=builder /app/apps/sync-server/dist    ./apps/sync-server/dist

# Copy the Prisma generated client from builder (it's in node_modules, not dist).
COPY --from=builder /app/node_modules/.pnpm       ./node_modules/.pnpm
COPY --from=builder /app/node_modules/@prisma     ./node_modules/@prisma
COPY --from=builder /app/node_modules/.modules.yaml ./node_modules/.modules.yaml

# The sync-server listens on this port.
EXPOSE 1234

# Environment variables that MUST be supplied at runtime (via Railway/Fly
# secrets or Docker --env-file):
#   DATABASE_URL, DIRECT_URL, SYNC_SERVER_INTERNAL_SECRET,
#   PORT (optional, defaults to 1234), NODE_ENV, MAX_DOCUMENT_SIZE_BYTES,
#   MAX_WS_MESSAGE_BYTES.

ENV NODE_ENV=production

# Run the compiled entry point.
CMD ["node", "apps/sync-server/dist/index.js"]
