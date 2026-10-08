# RIFTBALL online game server (matchmaking + authoritative matches + IAP/rewards API + web/iPhone version)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html .env.production ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run server:build && npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 QUEUE_WAIT_MS=8000 DATA_DIR=/data
COPY --from=build /app/server/dist/riftball-game.mjs ./riftball-game.mjs
# web build: the game is playable / installable on iPhone from this server's URL
COPY --from=build /app/dist ./web
RUN mkdir -p /data
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://localhost:8787/v1/health || exit 1
CMD ["node", "riftball-game.mjs"]
