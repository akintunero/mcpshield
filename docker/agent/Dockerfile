FROM node:26-alpine
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
CMD ["pnpm", "--filter", "@mcpshield/agent", "start"]
