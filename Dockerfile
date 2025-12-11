FROM node:20-slim AS builder
WORKDIR /app


# Install build deps for native modules (Debian)
RUN apt-get update && apt-get install -y --no-install-recommends \
		python3 \
		build-essential \
		python3-dev \
		libsqlite3-dev \
		pkg-config \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy sources and build
COPY . ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./package.json

VOLUME ["/data"]
ENV DB_PATH=/data/bot.db

CMD ["node", "dist/index.js"]
