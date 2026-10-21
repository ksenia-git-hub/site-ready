# Site Ready in one container: the API, the built interface and Chromium.
# Works the same on Render, on a Russian cloud server or anywhere Docker runs.
FROM node:24-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

# Dependencies first: when only the code changes, these layers come from the cache.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# Chromium and the system libraries it needs (needs root, done before switching user).
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

# Production settings. APP_PASSWORD (and optionally SESSION_SECRET) are set on the hosting, never here.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BLOCK_PRIVATE_TARGETS=true \
    TRUST_PROXY=true

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/src/index.ts"]
