# Dockerfile for elevenlabs-agent Node.js application
FROM node:18-slim

# Install system dependencies
RUN apt-get update -qq && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including dev dependencies for TypeScript build)
# Use npm ci if package-lock.json exists, otherwise fall back to npm install
RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy application code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev

# Expose port
EXPOSE 3004

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3004/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server (using compiled JavaScript from dist/)
CMD ["node", "dist/index.js"]

