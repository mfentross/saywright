# One image for sw-api, sw-worker, apps-runtime and apps-cron (entrypoint chosen at deploy).
# Build from the repo root: docker build -f apps/server/Dockerfile .
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/blueprint packages/blueprint
COPY packages/ai packages/ai
COPY apps/server apps/server
RUN pnpm install --frozen-lockfile --filter @saywright/server...
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@saywright/server", "start"]
