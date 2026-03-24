FROM node:20-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy packages
COPY packages/ ./packages/

# Copy API
COPY apps/api/ ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages first
RUN pnpm --filter @kassomat/types build 2>/dev/null || true
RUN pnpm --filter @kassomat/print build 2>/dev/null || true

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build API
RUN pnpm --filter api build

EXPOSE 3000

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/server.js"]
