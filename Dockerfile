FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json docker-entrypoint.sh ./
COPY server ./server
RUN chmod +x docker-entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/healthz || exit 1
# The entrypoint starts as root only to prepare the data disk, then runs the app as the "node" user.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
