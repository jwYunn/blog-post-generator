# syntax=docker/dockerfile:1

# Alpine is safe here because sharp 0.34 publishes musl prebuilts
# (@img/sharp-linuxmusl-*), so no native build toolchain is needed.
FROM node:22-alpine AS builder

# The playwright devDependency downloads ~500MB of browsers on install. The
# build only needs its types, and the app drives a remote browser at runtime.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Production dependencies only. This is what makes the playwright-core split
# matter: the runtime imports it, while playwright itself never lands here.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Carries the compiled output plus the thumbnail fonts and templates that
# nest-cli copies in as assets
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main"]
