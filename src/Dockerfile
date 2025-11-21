# Build Docker image (multi-arch capable)
FROM node:22-alpine

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
    ttf-freefont \
    font-noto-emoji \
    tini

# Create and use non-root user (Alpine syntax) BEFORE copying files
RUN addgroup -S nodejs && adduser -S -G nodejs nodejs

# Create app dir inside container
WORKDIR /nodeapp

# Tell Puppeteer to skip installing Chrome, we'll use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install app dependencies separately (creating a separate layer for node_modules, effectively caching them between image rebuilds)
COPY --chown=nodejs:nodejs package.json .
RUN npm install

# Copy app's source files
COPY --chown=nodejs:nodejs . .

# Set proper permissions
RUN chmod 755 /nodeapp

USER nodejs

# Use tini as init to properly handle signals (allows Ctrl-C to work)
ENTRYPOINT ["/sbin/tini", "--", "node", "src/butler-sheet-icons.js"]

