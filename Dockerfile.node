FROM node:20-slim

WORKDIR /app

# Install build dependencies required for native C++ modules (DuckDB)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source and static assets
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Set environment defaults
ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:10000/api/health || exit 1

CMD ["npm", "start"]
