FROM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace @food-scanner/mobile --workspace @food-scanner/contracts

COPY apps/mobile apps/mobile
COPY tsconfig.base.json ./
COPY packages/contracts/src packages/contracts/src
RUN CI=1 npm run build:web --workspace @food-scanner/mobile

FROM node:22-bookworm-slim
WORKDIR /app

# The root lockfile covers all workspaces. Install only the API and its shared contracts.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --omit=dev --workspace @food-scanner/api --workspace @food-scanner/contracts

COPY tsconfig.base.json ./
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/
COPY packages/contracts/src packages/contracts/src
COPY --from=web-build /app/apps/mobile/dist /app/web

ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 WEB_ROOT=/app/web
EXPOSE 10000
USER node
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
