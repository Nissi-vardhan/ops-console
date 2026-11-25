# syntax=docker/dockerfile:1
# SC-675: replaces the Nixpacks build. Nixpacks ran `apt-get update` on every cold build (the
# server wipes its build cache nightly), which took 22 min on 19 Nov when Ubuntu's mirror was slow.
# This image downloads nothing from Ubuntu; same layout as Shortcastle CRM and the tracker (SC-397).
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# --- deps ---
FROM base AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder ---
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# --- runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SC-744: keep idle connections open longer than the proxy does (Traefik default 90 s). Node's 5 s default
# closes a connection just as the proxy reuses it, so an occasional POST got a 502.
ENV KEEP_ALIVE_TIMEOUT=120000
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
