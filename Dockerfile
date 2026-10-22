# syntax=docker/dockerfile:1
# Base images are pinned by digest (reproducible builds, no silent upstream change); Dependabot proposes updates.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ─── Build stage ────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
ARG VITE_ASSET_PROCESSOR_URL
ARG VITE_CORE_API_URL
ARG VITE_GATEWAY_URL
ARG VITE_FONT_FAMILIES
ARG VITE_PLACEHOLDER_IMAGES
ARG VITE_BASE_URL
ARG VITE_WHOOBE_ONE_URL
ENV VITE_ASSET_PROCESSOR_URL=$VITE_ASSET_PROCESSOR_URL
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
ENV VITE_FONT_FAMILIES=$VITE_FONT_FAMILIES
ENV VITE_PLACEHOLDER_IMAGES=$VITE_PLACEHOLDER_IMAGES
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_WHOOBE_ONE_URL=$VITE_WHOOBE_ONE_URL

# hadolint ignore=DL3059  (separate layers on purpose: dependency install is cached independently)
RUN pnpm install --frozen-lockfile
# hadolint ignore=DL3059
RUN pnpm --filter '@whoobe-cms/core...' build
# hadolint ignore=DL3059
RUN pnpm build

# ─── Runtime base ───────────────────────────────────────────────────────────
# No pnpm/corepack and no npm in what runs in production: they are only needed to build, and their
# bundled dependencies (tar, minimatch, brace-expansion, pnpm itself) are most of the image CVEs.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runtime
# hadolint ignore=DL3059
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.cache
# the pinned bookworm digest lags behind Debian's security updates: libpcre2 10.42-1+deb12u1 (CVE-2026-103111, fixed in
# deb12u2) and perl-base 5.36.0-7+deb12u3 (3 CRITICAL + 4 HIGH, fixed in deb12u4; perl-base is an essential package).
# Upgrade just those; drop each once the pinned digest (Dependabot) catches up.
# hadolint ignore=DL3059,DL3008
RUN apt-get update && apt-get install -y --no-install-recommends --only-upgrade libpcre2-8-0 perl-base \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── Runtime dependencies only ──────────────────────────────────────────────
# Service images used to ship the whole workspace including devDependencies (vitest, tar, esbuild...), which
# is most of what `trivy image` reports. Prune after the build; the dist/ output is kept.
FROM build AS prod
# hadolint ignore=DL3059
RUN CI=true pnpm prune --prod \
    # the esbuild binaries come with the admin-dashboard's build-time dep; nothing here runs them
    && find /app/node_modules/.pnpm -maxdepth 1 \( -name '@esbuild+*' -o -name 'esbuild@*' \) -exec rm -rf {} +

# ─── Core API ───────────────────────────────────────────────────────────────
FROM runtime AS core-api
COPY --from=prod --chown=node:node /app /app
# /app itself stays root-owned (WORKDIR); the logger writes to ./logs, which used to arrive via the
# build context (host logs!) and must now be created for the unprivileged user.
# hadolint ignore=DL3059
RUN mkdir -p /app/logs && chown node:node /app/logs
ENV NODE_ENV=production
USER 1000:1000
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3003/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/core-api/dist/server.js"]

# ─── Asset Processor ────────────────────────────────────────────────────────
FROM runtime AS asset-processor
COPY --from=prod --chown=node:node /app /app
# /app itself stays root-owned (WORKDIR); the logger writes to ./logs, which used to arrive via the
# build context (host logs!) and must now be created for the unprivileged user.
# hadolint ignore=DL3059
RUN mkdir -p /app/logs && chown node:node /app/logs
ENV NODE_ENV=production
USER 1000:1000
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/asset-processor/dist/server.js"]

# ─── Admin Dashboard ────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:alpine@sha256:26b0bf6fbf07297983cb341998d79c831508787de26627dd2a112321b9c3a4af AS admin-dashboard
# the pinned alpine ships pcre2 10.48 (CVE-2026-103111), tiff 4.7.1 (CVE-2026-4775), libexpat 2.8.5 (CVE-2026-77214, fixed in 2.9.0-r0) and libx11 1.8.13 (CVE-2026-88806, fixed in 1.8.14-r0); drop once the upstream tag catches up
USER 0
RUN apk upgrade --no-cache pcre2 tiff libexpat libx11
USER 101
COPY --from=build /app/apps/admin-dashboard/dist /usr/share/nginx/html
COPY nginx/admin-spa.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 nginx/render-runtime-config.sh /docker-entrypoint.d/40-whoobe-config.sh
EXPOSE 8080

# ─── Whoobe One Spike ──────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:alpine@sha256:26b0bf6fbf07297983cb341998d79c831508787de26627dd2a112321b9c3a4af AS whoobe-one-spike
# same as the dashboard's image above
USER 0
RUN apk upgrade --no-cache pcre2 tiff libexpat libx11
USER 101
COPY --from=build /app/apps/whoobe-one-spike/dist /usr/share/nginx/html
# rendered at start (envsubst): who may embed the editor in a frame - see nginx/editor-spa.conf.template
ENV EDITOR_FRAME_ANCESTORS="'self' http://localhost:* http://127.0.0.1:*"
COPY nginx/editor-spa.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 nginx/render-runtime-config.sh /docker-entrypoint.d/40-whoobe-config.sh
EXPOSE 8080

# ─── API Gateway ────────────────────────────────────────────────────────────
FROM runtime AS gateway
COPY --from=prod --chown=node:node /app /app
# /app itself stays root-owned (WORKDIR); the logger writes to ./logs, which used to arrive via the
# build context (host logs!) and must now be created for the unprivileged user.
# hadolint ignore=DL3059
RUN mkdir -p /app/logs && chown node:node /app/logs
ENV NODE_ENV=production
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/gateway/dist/server.js"]

# A site generated by `whoobe-publish` (packages/publish) ships its own
# standalone Dockerfile in its own output directory - see
# packages/publish/src/cli.ts's scaffoldDockerfile(). It doesn't need a
# stage here: its dependencies are vendored *.tgz tarballs (packSdkDependencies),
# not workspace:* references into this repo, so it builds and deploys on any
# host with Docker alone - see CHANGES.md.

# ─── Publisher (runs the site generator for the dashboard's Publish tab) ────
# Unlike the services above it needs pnpm and the whole workspace: the generator packs the SDK packages (`pnpm pack`) into the
# site. It holds no database or object-store credentials: it talks to core-api over HTTP with PUBLISH_RUNNER_TOKEN.
# Not part of the public sandbox profile (docs/plans/website/publish-from-dashboard.md).
FROM base AS publisher
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /publish && chown node:node /publish
ENV NODE_ENV=production PUBLISH_ROOT=/publish
USER 1000:1000
CMD ["node", "apps/publisher/dist/server.js"]
