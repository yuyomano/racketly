# ─── Racketly — Dockerfile para apps/web (Next.js, build standalone) ────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/utils/ ./packages/utils/
COPY apps/web/ ./apps/web/

RUN npm install --workspaces --include-workspace-root

# NEXT_PUBLIC_* se hornean en el bundle en build time — hay que pasarlas como
# build args (docker-compose.prod.yml las inyecta desde apps/web/.env.production.local).
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG API_GATEWAY_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV API_GATEWAY_URL=${API_GATEWAY_URL}
ENV NODE_ENV=production

RUN cd apps/web && npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
