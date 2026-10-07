# RIFTBALL online game server (matchmaking + authoritative matches + IAP/rewards API)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
RUN npm run server:build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 QUEUE_WAIT_MS=8000 DATA_DIR=/data
COPY --from=build /app/server/dist/riftball-game.mjs ./riftball-game.mjs
RUN mkdir -p /data
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://localhost:8787/v1/health || exit 1
CMD ["node", "riftball-game.mjs"]
