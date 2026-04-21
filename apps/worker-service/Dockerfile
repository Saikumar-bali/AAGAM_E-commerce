FROM node:20-alpine AS base

WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --workspace=@aagam/worker-service

FROM base AS builder
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@aagam/worker-service

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY --from=builder /app/dist/apps/worker-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker-service/package.json ./package.json

USER worker

CMD ["node", "dist/index.js"]