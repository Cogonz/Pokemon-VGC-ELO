FROM node:22-alpine AS deps
WORKDIR /app
# prisma/ + prisma.config.ts must be present because `postinstall` runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL isn't needed at build time (the stats page is force-dynamic),
# but Prisma's generator still needs a schema/env to resolve without erroring.
RUN echo "DATABASE_URL=postgresql://placeholder:5432/placeholder" > .env
RUN npx prisma generate
RUN npm run build

# Ingestion image: `docker build --target ingest .` -- runs `npm run ingest` (tsx + generated
# Prisma client, full node_modules). Used by the scheduled ECS task (infra/lib/ingest-schedule-stack.ts).
FROM node:22-alpine AS ingest
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY lib ./lib
COPY ingestion.ts db.ts schemas.ts pokedex.ts ./
RUN npx prisma generate
USER node
CMD ["npm", "run", "ingest"]

# Web app image (default target: last stage).
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
