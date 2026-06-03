# CopaBolão — Production image for Fly.io / Railway / any Node host
# Multi-stage to keep the final image small (~200 MB instead of ~1 GB).

# ─── Stage 1: build ───────────────────────────────────────────────────────────
# Node 22+ required: Supabase Realtime client uses native WebSocket which only
# exists in Node 22+. Node 20 crashes on createClient() with "Node.js 20 detected
# without native WebSocket support".
FROM node:22-alpine AS builder

WORKDIR /app

# ARGs for Vite build-time variables. Vite reads import.meta.env.VITE_* at build
# time and embeds them in the bundle JS that ships to the browser. They MUST be
# declared here for the build stage to see them. Pass them in via:
#   docker build --build-arg VITE_SUPABASE_URL=... ...
# On Fly.io, configure them as build secrets in fly.toml (see [build.args]).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Install deps first so docker layer cache survives source-only changes.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build.
COPY . .
RUN npm run build

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

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
