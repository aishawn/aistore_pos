# SRC https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

# IMPORTANT: Node.js Version Maintenance
# This Dockerfile defaults to Node.js 24.14.1-slim to match the repo's Node 24 baseline.
# To ensure security and compatibility, update the NODE_VERSION ARG when the project's Node baseline changes.
ARG NODE_VERSION=24.14.1-slim

FROM node:${NODE_VERSION} AS dependencies

# Set working directory
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Install project dependencies with frozen lockfile for reproducible builds
RUN --mount=type=cache,target=/root/.npm \
  --mount=type=cache,target=/usr/local/share/.cache/yarn \
  --mount=type=cache,target=/root/.local/share/pnpm/store \
  if [ -f package-lock.json ]; then \
  npm ci --no-audit --no-fund; \
  elif [ -f yarn.lock ]; then \
  corepack enable yarn && yarn install --frozen-lockfile --production=false; \
  elif [ -f pnpm-lock.yaml ]; then \
  corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
  echo "No lockfile found." && exit 1; \
  fi

# ============================================
# Stage 2: Build Next.js application in standalone mode
# ============================================

FROM node:${NODE_VERSION} AS builder

# Set working directory
WORKDIR /app

# Copy project dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY . .
RUN --mount=type=bind,from=git_metadata,target=/source-git,ro \
  --mount=type=bind,from=build_metadata,target=/build-metadata,ro \
  SOURCE_COMMIT="$(sh /build-metadata/read-source-commit.sh /source-git)" && \
  SOURCE_COMMIT="$SOURCE_COMMIT" node -e 'require("fs").writeFileSync("src/lib/build-identity.json", JSON.stringify({service:"orithos-frontend",commit:/^[a-f0-9]{40}$/.test(process.env.SOURCE_COMMIT||"")?process.env.SOURCE_COMMIT:null,builtAt:new Date().toISOString()}))'

# Backend API — read from docker-compose build args / .env
# NEXT_PUBLIC_API_BASE_URL: leave empty for Docker (browser → same-origin /api).
# BACKEND_URL: Next.js proxy target (Docker service name "backend").
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_TENANT_BASE_DOMAIN=orithos.com.au
ARG NEXT_PUBLIC_TENANT_SCHEME=https
ARG BACKEND_URL=http://backend:8080
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_TENANT_BASE_DOMAIN=${NEXT_PUBLIC_TENANT_BASE_DOMAIN}
ENV NEXT_PUBLIC_TENANT_SCHEME=${NEXT_PUBLIC_TENANT_SCHEME}
ENV BACKEND_URL=${BACKEND_URL}

ENV NODE_ENV=production

# Optional: bake Hardware Connect installer into the image for /downloads/orithos-hardware-connect-latest
ARG ORITHOS_HC_BUNDLE_URL=
RUN if [ -n "$ORITHOS_HC_BUNDLE_URL" ]; then \
  apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && mkdir -p public/downloads \
  && curl -fsSL "$ORITHOS_HC_BUNDLE_URL" -o public/downloads/orithos-hardware-connect-latest.zip \
  && test -s public/downloads/orithos-hardware-connect-latest.zip \
  && if [ ! -f public/downloads/orithos-hardware-connect.version.json ]; then \
    printf '%s\n' "{\"product\":\"Orithos Hardware Connect\",\"version\":\"unknown\",\"downloadPath\":\"/downloads/orithos-hardware-connect-latest.zip\",\"stagedAt\":\"$(date -Iseconds)\"}" > public/downloads/orithos-hardware-connect.version.json; \
  fi \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*; \
  fi

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
# If you want to speed up Docker rebuilds, you can cache the build artifacts
# by adding: --mount=type=cache,target=/app/.next/cache
# This caches the .next/cache directory across builds, but it also prevents
# .next/cache/fetch-cache from being included in the final image, meaning
# cached fetch responses from the build won't be available at runtime.
RUN if [ -f package-lock.json ]; then \
  npm run build; \
  elif [ -f yarn.lock ]; then \
  corepack enable yarn && yarn build; \
  elif [ -f pnpm-lock.yaml ]; then \
  corepack enable pnpm && pnpm build; \
  else \
  echo "No lockfile found." && exit 1; \
  fi

# ============================================
# Stage 3: Run Next.js application
# ============================================

FROM node:${NODE_VERSION} AS runner

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=${BACKEND_URL}

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the run time.
# ENV NEXT_TELEMETRY_DISABLED=1

# Copy production assets
COPY --from=builder --chown=node:node /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown node:node .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# If you want to persist the fetch cache generated during the build so that
# cached responses are available immediately on startup, uncomment this line:
# COPY --from=builder --chown=node:node /app/.next/cache ./.next/cache

# Switch to non-root user for security best practices
RUN mkdir -p /var/lib/orithos/rfq /app/.local \
  && chown node:node /var/lib/orithos/rfq /app/.local \
  && chmod 700 /app/.local
USER node

# Expose port 3000 to allow HTTP traffic
EXPOSE 3000

# Start Next.js standalone server
CMD ["node", "server.js"]
