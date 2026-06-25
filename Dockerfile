# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

# libc6-compat needed for some Alpine edge cases with Node
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies first (leverages Docker layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN NITRO_PRESET=node-server npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

# Non-root user for security
RUN addgroup --system --gid 1001 nuxt && \
    adduser --system --uid 1001 nuxt

# Create persistent data directories
RUN mkdir -p .data/blob .data/kv .data/cache && \
    chown -R nuxt:nuxt .data

# Copy only the built output from the builder stage
COPY --from=builder --chown=nuxt:nuxt /app/.output ./.output

USER nuxt

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
