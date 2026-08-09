# Build Docker image (multi-arch capable)
# Stage 1: Install dependencies
FROM node:24-alpine AS deps

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    # Remove documentation and unnecessary files from node_modules.
    #
    # Licence files are deliberately NOT removed. The MIT and BSD licences that cover most of the
    # dependency tree require their notice to travel with the code, so stripping them to save a few
    # hundred KB in a 1.3 GB image traded a compliance obligation for nothing. The two exclusions
    # matter for different reasons: the -iname guards keep LICENSE.md and similar from being caught
    # by the '*.md' pattern, and 'LICENSE*' is no longer in the delete list at all.
    #
    # See src/licenses/NOTICE.md for what the image redistributes.
    find /build/node_modules -type f \
        \( -name '*.md' -o -name 'CHANGELOG*' -o -name '*.ts' -o -name '*.map' \) \
        ! -iname 'licen[cs]e*' ! -iname 'copying*' ! -iname 'notice*' \
        -delete && \
    # Remove test directories
    find /build/node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name '.github' \) -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Production image
FROM node:24-alpine

# Add metadata about the image
LABEL maintainer="Göran Sander mountaindude@ptarmiganlabs.com"
LABEL description="Creates thumbnail images based on sheets in QLik Sense applications."

# Install Puppeteer dependencies for Alpine Linux.
#
# su-exec is not a Puppeteer dependency: docker-entrypoint.sh uses it to drop privileges to the
# owner of the mounted image directory. See that file for why (issue #915).
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    font-dejavu \
    tini \
    su-exec

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

# Attribution for the third-party software this image redistributes - most importantly Chromium,
# which is ~263 MB of BSD-3-Clause and assorted other licences. The Alpine package ships no licence
# text of its own, so without this the image carried a browser with no notice attached to it.
COPY --chown=nodejs:nodejs LICENSE ./licenses/butler-sheet-icons-LICENSE
COPY --chown=nodejs:nodejs src/licenses/ ./licenses/

# Default mount point for --imagedir, created here so it has known ownership when nothing is
# mounted over it.
RUN mkdir -p /nodeapp/img && chown nodejs:nodejs /nodeapp/img

COPY src/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# There is deliberately no `USER nodejs` here, and putting one back would reintroduce issue #915.
#
# The entrypoint has to start as root so it can drop privileges to whoever owns the bind-mounted
# image directory - that is the whole fix, and it cannot be done from an unprivileged process. The
# application itself still never runs as root: every path through docker-entrypoint.sh execs node
# via su-exec as an unprivileged user, and a root-owned mount is refused rather than adopted.
#
# Scanners that judge an image by its final USER will flag this. If that matters in your
# environment, run with `--user "$(id -u):$(id -g)"`; the entrypoint detects it is not root and
# hands straight over.

# Use tini as init to properly handle signals (allows Ctrl-C to work)
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

