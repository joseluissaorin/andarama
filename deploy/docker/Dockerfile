# Imagen unica de Andarama self-host (§5.7): Node.js + SQLite + FS.
# Un proceso, un volumen (/data), un puerto (8788).

# ---------- build ----------
FROM node:26-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY tooling ./tooling
COPY packages ./packages
COPY apps ./apps
COPY deploy ./deploy
RUN pnpm install --frozen-lockfile=false
RUN pnpm build:packages
RUN pnpm --filter @andarama/studio build
RUN pnpm --filter @andarama/api build:node

# ---------- runtime deps (solo modulos nativos/externos) ----------
FROM node:26-bookworm-slim AS deps
WORKDIR /deps
RUN npm install --omit=dev better-sqlite3@13 sharp@0.33 ws@8 nodemailer@6

# ---------- runtime ----------
FROM node:26-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8788 \
    ASSETS_DIR=/app/assets
WORKDIR /app
COPY --from=build /app/apps/api/dist-node/node.js ./server.js
COPY --from=build /app/apps/studio/dist-root ./assets
COPY --from=build /app/packages/db/migrations ./migrations
COPY --from=deps /deps/node_modules ./node_modules
VOLUME /data
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8788/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
