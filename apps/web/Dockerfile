FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/jobs/package.json ./packages/jobs/
COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
# pnpm isolated linker puts each package's bins in its own node_modules/.bin/.
# Without these copies the prisma/tsx/etc. CLIs are not on PATH when package scripts run.
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /app/packages/jobs/node_modules ./packages/jobs/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @marine-guardian/db db:generate
RUN pnpm --filter @marine-guardian/web build
RUN pnpm --filter @marine-guardian/jobs build
# Ensure public/ exists so the runner stage COPY always has a source
RUN mkdir -p /app/apps/web/public
RUN mkdir -p /prisma-engines && \
    find /app -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" -exec cp {} /prisma-engines/ \;
# Dereference pnpm symlinks so COPY --from=builder works on the actual package files
# pnpm hoists @prisma/client under packages/db/node_modules (not root node_modules)
# because packages/db is the direct dependent. Resolve the real store path via readlink -f.
# .prisma/client (generated output) lives inside the pnpm store alongside @prisma/client.
RUN PRISMA_CLIENT_REAL=$(readlink -f /app/packages/db/node_modules/@prisma/client) && \
    PRISMA_GENERATED_REAL=$(find /app -maxdepth 8 -type d -path "*/.prisma/client" 2>/dev/null | head -1) && \
    mkdir -p /prisma-deps/@prisma/client /prisma-deps/.prisma/client && \
    cp -r "${PRISMA_CLIENT_REAL}/." /prisma-deps/@prisma/client/ && \
    cp -r "${PRISMA_GENERATED_REAL}/." /prisma-deps/.prisma/client/

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Patch OS-level CVEs in the shipping image (e.g. libcrypto3 HIGH 3.5.6-r0 -> 3.5.7-r0).
# Runs in the final runtime stage so the running image carries patched apk libs.
RUN apk upgrade --no-cache
# tzdata so the TZ env var (compose sets TZ=Asia/Manila) actually resolves —
# without it Alpine has no zoneinfo and `date`/logs stay UTC. Benefits app +
# worker (shared image) across dev/stage/prod on next build. Zone is not
# hardcoded here; it comes from the TZ env set per-environment in compose.
RUN apk add --no-cache tzdata
# Strip the global npm CLI from the runtime image. The standalone Next.js server runs
# `node apps/web/server.js` and never invokes npm/pnpm, but node's bundled npm vendors
# its own picomatch (HIGH ReDoS CVE-2026-33671) that no pnpm override can reach. Removing
# npm clears the CVE at the source and shrinks the runtime attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /prisma-engines/ ./node_modules/.prisma/client/
COPY --from=builder /prisma-engines/ ./apps/web/.next/server/
# Ship @prisma/client + generated client for worker's external requires
COPY --from=builder /prisma-deps/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /prisma-deps/.prisma/client ./node_modules/.prisma/client
COPY --from=builder /app/packages/jobs/dist/start-workers.mjs ./worker/start-workers.mjs
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
