FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
ENV DATABASE_URL=postgresql://stock:stock@localhost:5432/stock?schema=public
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build /app/dist ./dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/src/server.js"]