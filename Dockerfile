# CopaBolão — Production image for Railway / any Node host
# Multi-stage to keep the final image small (~200 MB instead of ~1 GB).

# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first so docker layer cache survives source-only changes.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build.
# The Vite build embeds VITE_* env vars at this stage — they must be set as
# Railway "Build" variables, not just runtime.
COPY . .
RUN npm run build

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only the production deps + the build output are needed.
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

# `npm start` runs node dist/server.cjs (see package.json scripts).
CMD ["npm", "start"]
