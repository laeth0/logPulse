# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM node:24-alpine AS production

ENV NODE_ENV=production \
  PORT=8080

WORKDIR /app

# Installed directly from the lockfile rather than via `npm prune --omit=dev`
# on the build stage's full install: pruning has to walk and tear down an
# already-installed dev+prod tree (500+ packages here), which is slow and
# risked timing out the load generator's "Build containers" step. A fresh
# production-only install from a pinned lockfile is faster and reproducible.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
