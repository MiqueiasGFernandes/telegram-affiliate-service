FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY .husky/install.mjs .husky/install.mjs
RUN CI=true npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app
ENV NODE_ENV=production CI=true
COPY package.json package-lock.json ./
COPY .husky/install.mjs .husky/install.mjs
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    AFFILIATE_EVIDENCE_FILE=/etc/secrets/affiliate-evidence.json

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json

RUN usermod -a -G 1000 node
USER node
CMD ["node", "dist/main.js"]
