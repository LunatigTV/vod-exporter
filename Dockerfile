# --- Stage 1: Build TypeScript & Dependencies ---
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# Strip devDependencies and purge npm cache
RUN npm prune --omit=dev && npm cache clean --force

# --- Stage 2: Minimal Runtime ---
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1. Copy built artifacts and trimmed dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 2. Install Playwright browser + OS deps, then aggressively clean up
RUN apt-get update \
    && ./node_modules/.bin/playwright install --with-deps chromium \
    && apt-get purge -y --auto-remove \
    && apt-get clean \
    && rm -rf \
        /var/lib/apt/lists/* \
        /var/cache/apt/* \
        /root/.cache \
        /root/.npm \
        /tmp/*

# Run node directly rather than through npm
CMD ["node", "dist/index.js"]