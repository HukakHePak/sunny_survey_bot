FROM node:20-slim AS builder
WORKDIR /app


# Install build deps for native modules (Debian)
RUN set -eux; \
		export DEBIAN_FRONTEND=noninteractive; \
		# Retry apt operations to mitigate transient network issues
		for i in 1 2 3; do \
			apt-get update -o Acquire::Retries=3 && \
			apt-get install -y --no-install-recommends \
				python3 \
				build-essential \
				python3-dev \
				libsqlite3-dev \
				pkg-config && break || sleep 5; \
		done; \
		rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy sources and build
COPY . ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# DB_PATH should be provided at runtime (via .env / docker-compose env_file)
# Do not hardcode DB_PATH here so the image is portable.
# Copy only what we need
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./package.json

VOLUME ["/data"]
CMD ["node", "dist/index.js"]
