FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    ALT_QR_DATA_DIR=/app/.alt-qr-data \
    ALT_QR_MAX_STORED_BYTES=350000000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
RUN npx playwright install --with-deps chromium
RUN apt-get update \
    && apt-get install -y --no-install-recommends passwd tini util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && groupadd --system altqr \
    && useradd --system --gid altqr --create-home --home-dir /home/altqr altqr \
    && chmod 0755 /app/scripts/docker-entrypoint.sh \
    && chown -R altqr:altqr /app

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
