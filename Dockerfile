# ============================================
# LuxDrive Frontend - Dockerfile for Cloud Run
# ============================================
# Multi-stage build:
#   Stage 1 (deps)    : install workspace dependencies
#   Stage 2 (builder) : build Next.js standalone output
#   Stage 3 (runner)  : minimal runtime image (~150 MB)
#
# Build context: monorepo ROOT (D:\Shaikh-Tech\LuxDrive\), not apps/web.
# This is required because yarn workspaces need the root package.json
# and yarn.lock to resolve dependencies correctly.
#
# Build args:
#   NEXT_PUBLIC_API_URL   - backend URL embedded at build time
#                          (Next.js inlines NEXT_PUBLIC_* into the JS bundle)
# ============================================

# ---------- Stage 1: Dependencies ----------
FROM node:22-alpine AS deps

# Alpine needs this for some native deps (sharp, libc compat, etc.)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Enable yarn 1 globally
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy monorepo manifests for workspace resolution.
# We skip apps/server/package.json — yarn workspaces handle missing
# workspace members gracefully, and the server isn't needed to build
# the frontend.
COPY package.json yarn.lock ./
COPY apps/web/package.json ./apps/web/

# Install with frozen lockfile - reproducible builds.
RUN yarn install --frozen-lockfile --network-timeout 600000


# ---------- Stage 2: Builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy monorepo source
COPY package.json yarn.lock ./
COPY apps/web ./apps/web

# Pass build-time env var (baked into JS bundle by Next.js)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Build the web app
RUN cd apps/web && yarn build


# ---------- Stage 3: Runner (final image) ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy ONLY what's needed to run.
# Standalone output already contains a minimal node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

# Cloud Run injects PORT (defaults to 8080). Listen on it.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

# Standalone build emits apps/web/server.js as the entrypoint
CMD ["node", "apps/web/server.js"]