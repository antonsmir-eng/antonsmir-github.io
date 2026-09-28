FROM node:24-alpine
WORKDIR /app
COPY package.json build.mjs site.config.json ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN node build.mjs && mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/service.sqlite
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
