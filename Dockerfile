# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    LOG_FORMAT=json \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json stockwatch.example.yaml ./
COPY assets ./assets
# Chromium + system deps for the `playwright` checker. Drop this layer if you only use selector/json/shopify.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
VOLUME ["/app/data"]
ENTRYPOINT ["node", "dist/index.js", "-c", "/app/stockwatch.yaml"]
CMD ["run"]
