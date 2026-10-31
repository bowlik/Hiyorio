FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=7000 \
    DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
EXPOSE 7000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/server.js"]
