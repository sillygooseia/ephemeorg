FROM node:22-alpine AS deps

ARG NPM_TOKEN

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

FROM node:22-alpine

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack \
           /usr/local/include/node

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 8791

CMD ["node", "index.js"]
