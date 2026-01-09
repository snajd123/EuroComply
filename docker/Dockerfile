# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY turbo.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/identity/package*.json ./packages/identity/

RUN npm ci

# Copy source files
COPY . .

# Generate Prisma client
RUN npm run db:generate

# Build only API and its dependencies (not Shopify app)
RUN npx turbo run build --filter=@eurocomply/api...

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install OpenSSL 3 for Prisma (libssl3 is default in Alpine 3.17+)
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 eurocomply

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package*.json ./packages/database/
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/identity/dist ./packages/identity/dist
COPY --from=builder /app/packages/identity/package*.json ./packages/identity/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Set ownership
RUN chown -R eurocomply:nodejs /app

USER eurocomply

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "apps/api/dist/index.js"]
