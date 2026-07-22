# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runtime
RUN apk add --no-cache curl \
  && addgroup -S mcpshield && adduser -S mcpshield -G mcpshield
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY --from=build /app /app
RUN chown -R mcpshield:mcpshield /app
USER mcpshield
ENV NODE_ENV=production
EXPOSE 7802
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://127.0.0.1:7802/health || exit 1
CMD ["pnpm", "--filter", "@mcpshield/api", "start"]
