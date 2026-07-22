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
RUN addgroup -S mcpshield && adduser -S mcpshield -G mcpshield
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY --from=build /app /app
RUN chown -R mcpshield:mcpshield /app
USER mcpshield
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@mcpshield/agent", "start"]
