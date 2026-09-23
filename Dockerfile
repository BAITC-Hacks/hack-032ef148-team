FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=4180 HOST=0.0.0.0
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY samples ./samples
USER node
EXPOSE 4180
HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:4180/api/health || exit 1
CMD ["node", "src/server.mjs"]
