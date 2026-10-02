FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY package.json ./package.json
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
CMD ["node","server/index.mjs"]
