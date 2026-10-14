FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY frontend ./frontend
COPY public ./public
COPY server ./server
COPY tests ./tests
COPY index.html tsconfig.json vite.config.mjs ./
RUN npx tsc --noEmit && npm test && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY dist ./dist
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY package.json ./package.json
RUN mkdir -p /data && chown -R node:node /data /app && chmod 755 /app/scripts/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node","server/index.mjs"]
