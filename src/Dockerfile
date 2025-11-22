# Build Docker image (multi-arch capable)
# Stage 1: Install dependencies
FROM node:24-alpine AS deps

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    # Remove documentation and unnecessary files from node_modules
    find /build/node_modules -type f \( -name '*.md' -o -name 'LICENSE*' -o -name 'CHANGELOG*' -o -name '*.ts' -o -name '*.map' \) -delete && \
    # Remove test directories
    find /build/node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name '.github' \) -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Production image
FROM node:24-alpine

# Add metadata about the image
LABEL maintainer="Göran Sander mountaindude@ptarmiganlabs.com"
LABEL description="Creates thumbnail images based on sheets in QLik Sense applications."

# Install Puppeteer dependencies for Alpine Linux
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    font-dejavu \
    tini

# Create and use non-root user (Alpine syntax) BEFORE copying files
RUN addgroup -S nodejs && adduser -S -G nodejs nodejs

# Create app dir inside container
WORKDIR /nodeapp

# Tell Puppeteer to skip installing Chrome, we'll use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Copy node_modules from deps stage
COPY --from=deps --chown=nodejs:nodejs /build/node_modules ./node_modules

# Copy only necessary application files
COPY --chown=nodejs:nodejs src/butler-sheet-icons.js ./src/
COPY --chown=nodejs:nodejs src/globals.js ./src/
COPY --chown=nodejs:nodejs src/lib/ ./src/lib/
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

# Use tini as init to properly handle signals (allows Ctrl-C to work)
ENTRYPOINT ["/sbin/tini", "--", "node", "src/butler-sheet-icons.js"]

