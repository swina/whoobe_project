# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ─── Build stage ────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
ARG VITE_ASSET_PROCESSOR_URL
ARG VITE_CORE_API_URL
ARG VITE_FONT_FAMILIES
ENV VITE_ASSET_PROCESSOR_URL=$VITE_ASSET_PROCESSOR_URL
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_FONT_FAMILIES=$VITE_FONT_FAMILIES

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @whoobe-cms/core build
RUN pnpm build

# ─── Core API ───────────────────────────────────────────────────────────────
FROM base AS core-api
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "apps/core-api/dist/server.js"]

# ─── Asset Processor ────────────────────────────────────────────────────────
FROM base AS asset-processor
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "apps/asset-processor/dist/server.js"]

# ─── Admin Dashboard ────────────────────────────────────────────────────────
FROM nginx:alpine AS admin-dashboard
COPY --from=build /app/apps/admin-dashboard/dist /usr/share/nginx/html
COPY nginx/spa-fallback.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ─── Whoobe One Spike ──────────────────────────────────────────────────────
FROM nginx:alpine AS whoobe-one-spike
COPY --from=build /app/apps/whoobe-one-spike/dist /usr/share/nginx/html
COPY nginx/spa-fallback.conf /etc/nginx/conf.d/default.conf
EXPOSE 80