# marine-guardian-pdf-renderer
# Headless Chromium + Puppeteer HTTP service.
# Consumed by the @marine-guardian/jobs pdf-render BullMQ worker (5.3b).

FROM node:22-slim AS runtime

# Chromium + the minimal font/lib set required for headless PDF rendering.
# Using debian chromium package (not Puppeteer's bundled binary) keeps the
# image smaller and lets apt handle security patches.
RUN apt-get update \
    && apt-get -y upgrade \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-noto-cjk \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=4000

# Non-root runtime user — matches node:22-slim's pre-existing node user (uid 1000)
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && chown -R node:node /app

COPY --chown=node:node src ./src

USER node
EXPOSE 4000

# dumb-init reaps zombie chromium processes that puppeteer leaves on error
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
