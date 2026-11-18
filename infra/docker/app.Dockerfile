# syntax=docker/dockerfile:1.7
#
# One file, two targets. Build from the repository root:
#
#   docker build -f infra/docker/app.Dockerfile --target backend  -t retromobi-backend .
#   docker build -f infra/docker/app.Dockerfile --target frontend -t retromobi-frontend .
#
# Bun runs the TypeScript directly (no bundle step). The frontend bundles its
# HTML at startup, so BUN_PUBLIC_* values come from the runtime env, not a build arg.

# Same bun version as devEngines in package.json (bump both together).
FROM oven/bun:1.3.9 AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/Backend/package.json apps/Backend/
COPY apps/Frontend/package.json apps/Frontend/
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM deps AS backend
COPY apps/Backend apps/Backend
WORKDIR /repo/apps/Backend
ENV NODE_ENV=production PORT=3201
USER bun
EXPOSE 3201
CMD ["bun", "index.ts"]

FROM deps AS frontend
COPY apps/Frontend apps/Frontend
WORKDIR /repo/apps/Frontend
ENV NODE_ENV=production PORT=5180
USER bun
EXPOSE 5180
CMD ["bun", "src/index.ts"]
