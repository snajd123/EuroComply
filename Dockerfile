# EuroComply API Dockerfile
# Multi-stage build for optimal image size

# =============================================================================
# Stage 1: Base - Install pnpm
# =============================================================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies - Install all dependencies for build
# =============================================================================
FROM base AS deps

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Builder - Build the application
# =============================================================================
FROM deps AS builder

# Copy TypeScript configs
COPY tsconfig.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/db/tsconfig.json ./packages/db/
COPY apps/api/tsconfig.json ./apps/api/

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY packages/db/src ./packages/db/src
COPY packages/db/prisma ./packages/db/prisma
COPY apps/api/src ./apps/api/src

# Generate Prisma client
RUN pnpm db:generate

# Build all packages
RUN pnpm build

# =============================================================================
# Stage 4: Runner - Final production image
# =============================================================================
FROM node:20-alpine AS runner

# Install openssl for Prisma (Alpine needs it explicitly)
RUN apk add --no-cache openssl

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 eurocomply

WORKDIR /app

# Copy package files (needed for module resolution)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/package.json ./packages/db/

# Copy node_modules (full, including all dependencies)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist

# Copy Prisma schema and generated client
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# Set ownership
RUN chown -R eurocomply:nodejs /app

# Switch to non-root user
USER eurocomply

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "apps/api/dist/index.js"]
