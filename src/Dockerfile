# Build Docker image for Amd64
FROM node:21-bullseye-slim

# Add metadata about the image
LABEL maintainer="Göran Sander mountaindude@ptarmiganlabs.com"
LABEL description="Creates thumbnail images based on sheets in QLik Sense applications."

# Install Puppeteer dependencies
# First a workaround to deal with the fact that libappindicator3-1 is no longer available in bullseye
RUN apt-get update \
    && apt-get install -y wget \
    && wget http://ftp.us.debian.org/debian/pool/main/libi/libindicator/libindicator3-7_0.5.0-4_amd64.deb \
    && wget http://ftp.us.debian.org/debian/pool/main/liba/libappindicator/libappindicator3-1_0.4.92-7_amd64.deb \
    && apt install -y ./libindicator3-7_0.5.0-4_amd64.deb \
    && apt install -y ./libappindicator3-1_0.4.92-7_amd64.deb

RUN apt-get update && apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils \
    && apt-get remove -y wget \
    && rm -rf /var/lib/apt/lists/* \
    # && apt-get purge --auto-remove -y curl \
    && rm -rf /src/*.deb

# Create app dir inside container
WORKDIR /nodeapp

# Install app dependencies separately (creating a separate layer for node_modules, effectively caching them between image rebuilds)
COPY package.json .
RUN npm install

# Copy app's source files
COPY . .

# Create and use non-root user 
RUN groupadd -r nodejs \
   && useradd -m -r -g nodejs nodejs

RUN chown -R nodejs:nodejs /nodeapp
RUN chmod 755 /nodeapp

USER nodejs

# CMD ["node", "butler-sheet-icons.js"]
ENTRYPOINT ["node", "butler-sheet-icons.js"]

