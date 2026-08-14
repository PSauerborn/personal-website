# Web container of the web component.
#
# The image serves the Next.js application from its `output: 'standalone'`
# bundle (web/next.config.ts) on port 9000. Port 9000 is not Next's default: it
# is the origin the API's CORS allowlist pins (api/router.go), so that browser
# code can call the API directly (REQ-1.7).
#
# Two environment contracts meet in this file and must not be confused:
#
#   API_BASE_URL             read at RUN time by Server Components and route
#                            handlers; supply it with `-e` / compose.
#   NEXT_PUBLIC_API_BASE_URL INLINED at BUILD time by `next build` into the
#                            client bundle. It is declared as a build argument
#                            below and promoted to an ENV in the builder stage
#                            so `next build` observes it. Setting it on an
#                            already-built container has no effect whatsoever.
#
# Build (mandated flags):
#   docker build --platform linux/amd64 --provenance=false \
#       --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 -t web ./web
#
# Both stages share one immutably pinned base image, given as `<tag>@sha256:...`
# so that two builds of the same commit always resolve to the same base (this is
# the gap flagged as OUTSTANDING in api/Dockerfile, deliberately not repeated
# here). Sharing the base between stages also keeps the builder and the runtime
# on the same libc, so any native module resolved into the standalone bundle
# stays loadable.
#
# The suite is not run as a build stage ([DOCKER-005]) because this component's
# tests are a jsdom/vitest suite executed by `make -C web test` in CI and the
# pre-commit hooks; the task specification for this file mandates exactly two
# stages ([JS-DOCKER-001]).

# Builder stage: install the locked dependency graph and produce the standalone
# server bundle.
FROM node:22.23.2-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS builder

WORKDIR /build

# Copied before the sources so the install layer is reused whenever only
# application files change. `npm ci` installs strictly from the lockfile and
# fails if the two files disagree.
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# RISK-001: declared here, immediately before the build, because `next build`
# substitutes the literal value into the client bundle. A default is
# deliberately not provided - an unset value produces a bundle whose browser
# requests go nowhere, which is easier to spot than a wrong-but-plausible one.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `public/` is optional in this component and absent today; the mkdir keeps the
# runtime stage's COPY of it valid whether or not the directory is added later.
RUN npm run build && mkdir -p /build/public

# Runtime stage: the standalone server, its static assets and nothing else - no
# npm install, no source tree, no dev dependencies.
FROM node:22.23.2-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# server.js reads both. PORT matches the CORS allowlist origin; HOSTNAME must be
# 0.0.0.0 rather than localhost or the published port reaches nothing.
ENV PORT=9000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# RISK-010: the standalone output carries the server and its traced
# node_modules only. Without the two copies that follow, the container starts
# and serves an unstyled, scriptless page.
COPY --from=builder /build/.next/standalone ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public

# The application tree stays root-owned and read-only to the runtime user; only
# the cache directory the server writes to is handed over. `node` (uid 1000) is
# the unprivileged user the official image already provides.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next/cache

USER node

# Documentation only - it publishes nothing on its own, and PORT can still move
# the server at run time.
EXPOSE 9000

CMD ["node", "server.js"]
